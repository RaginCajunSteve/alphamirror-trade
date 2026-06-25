/**
 * Continuous ops loop — health, security, ROI, improvements, maintenance comms.
 * Cron: hourly. Does not deploy or restart services (uptime-safe).
 */
import { kvGet, kvPut } from "./ops/kv.mjs";
import { runHealthChecks } from "./ops/health.mjs";
import { computeRoiSnapshot } from "./ops/roi.mjs";
import { runSecurityChecks } from "./ops/security.mjs";
import {
  advancePhase,
  autoApproveTop,
  deriveImprovements,
} from "./ops/improvements.mjs";
import {
  advanceMaintenanceState,
  notifyMaintenanceList,
} from "./ops/maintenance.mjs";
import { costPolicySnapshot } from "./ops/cost-policy.mjs";
import {
  envWithKvApprovals,
  getKvApprovedCategories,
  processPendingCostNotifications,
  queueImprovementCostBarriers,
} from "./ops/cost-approvals.mjs";

const KV_STATE = "ops-loop-state.json";
const KV_MAINTENANCE = "ops-maintenance.json";
const KV_IMPROVEMENTS = "ops-improvements.json";
const KV_NOTIFY = "ops-notify-list.json";
const KV_COST_POLICY = "ops-cost-policy.json";

const DEFAULT_STATE = {
  version: 1,
  cycle: 0,
  phase: "monitor",
  lastRunAt: null,
  health: null,
  roi: null,
  security: null,
  changelog: [],
};

export async function runOpsLoop(kv, env) {
  const baseUrl = env.NEXT_PUBLIC_APP_URL ?? "https://alphamirror.trade";
  const now = Date.now();

  const [state, windows, improvements, notifyList, feedback, kvApproved] =
    await Promise.all([
      kvGet(kv, KV_STATE, DEFAULT_STATE),
      kvGet(kv, KV_MAINTENANCE, []),
      kvGet(kv, KV_IMPROVEMENTS, []),
      kvGet(kv, KV_NOTIFY, []),
      kvGet(kv, "feedback.json", []),
      getKvApprovedCategories(kv),
    ]);

  const costEnv = envWithKvApprovals(env, kvApproved);

  const health = await runHealthChecks(baseUrl);
  const roi = await computeRoiSnapshot(kv, kvGet);
  const security = runSecurityChecks(env);

  const { windows: advancedWindows, events } = advanceMaintenanceState(windows, now);
  let maintenance = advancedWindows;

  for (const w of maintenance) {
    if (w.status === "scheduled" && !w.noticeSentAt && notifyList.length > 0) {
      const start = Date.parse(w.startAt);
      if (now >= start - 24 * 60 * 60 * 1000 && now < start) {
        await notifyMaintenanceList(env, notifyList, "notice", w);
        w.noticeSentAt = new Date(now).toISOString();
      }
    }
  }

  for (const event of events) {
    const w = maintenance.find((x) => x.id === event.id);
    if (!w || notifyList.length === 0) continue;
    if (event.type === "started") {
      await notifyMaintenanceList(
        env,
        notifyList,
        "update",
        w,
        "Maintenance in progress.",
      );
    } else if (event.type === "completed") {
      await notifyMaintenanceList(env, notifyList, "restored", w);
    }
  }

  const derived = deriveImprovements({ health, roi, security, feedback });
  const mergedImprovements = mergeImprovements(improvements, derived);
  const prioritized =
    state.phase === "prioritize"
      ? autoApproveTop(mergedImprovements, 3, env)
      : mergedImprovements;

  const costPolicy = costPolicySnapshot(costEnv);

  const spendBacklog = prioritized.filter(
    (i) => i.increasesSpend && i.status !== "done" && i.status !== "deferred",
  );
  await queueImprovementCostBarriers(kv, costEnv, spendBacklog);
  const costEmails = await processPendingCostNotifications(kv, env);

  let nextState = {
    ...state,
    lastRunAt: new Date(now).toISOString(),
    health,
    roi,
    security,
    changelog: [
      {
        at: new Date(now).toISOString(),
        note: `monitor: health=${health.overall} roi=${roi.roiScore} security=${security.score}`,
      },
      ...(state.changelog ?? []).slice(0, 49),
    ],
  };

  if (state.phase === "learn") {
    nextState = advancePhase(nextState);
  } else if (shouldAdvancePhase(state.phase, health)) {
    nextState = advancePhase(nextState);
  }

  await Promise.all([
    kvPut(kv, KV_STATE, nextState),
    kvPut(kv, KV_MAINTENANCE, maintenance),
    kvPut(kv, KV_IMPROVEMENTS, prioritized),
    kvPut(kv, KV_COST_POLICY, costPolicy),
  ]);

  return {
    ok: true,
    phase: nextState.phase,
    cycle: nextState.cycle,
    health: health.overall,
    roiScore: roi.roiScore,
    securityScore: security.score,
    improvements: prioritized.filter((i) => i.status !== "done").length,
    maintenanceEvents: events.length,
    costBaselineLocked: costPolicy.baselineLocked,
    costEmailsSent: costEmails.filter((r) => r.ok).length,
    kvApprovedCategories: kvApproved,
  };
}

function shouldAdvancePhase(phase, health) {
  if (phase === "monitor") return true;
  if (phase === "analyze" && health.overall !== "down") return true;
  if (phase === "prioritize") return true;
  return false;
}

function mergeImprovements(existing, derived) {
  const out = [...existing];
  for (const d of derived) {
    const idx = out.findIndex(
      (e) => e.summary === d.summary && e.status !== "done" && e.status !== "deferred",
    );
    if (idx >= 0) {
      out[idx] = { ...out[idx], ...d, id: out[idx].id, score: d.score };
    } else {
      out.push(d);
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 100);
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runOpsLoop(env.DATA_KV, env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/run") {
      const secret = request.headers.get("x-ops-secret");
      if (!env.OPS_ADMIN_SECRET || secret !== env.OPS_ADMIN_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }
      try {
        const result = await runOpsLoop(env.DATA_KV, env);
        return Response.json(result);
      } catch (err) {
        return Response.json(
          { ok: false, error: err instanceof Error ? err.message : "failed" },
          { status: 500 },
        );
      }
    }

    return new Response("alpha-wallet-ops-loop", { status: 200 });
  },
};