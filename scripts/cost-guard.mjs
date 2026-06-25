/**
 * Exit 1 when a cost-increasing operation lacks explicit owner approval.
 *
 *   node scripts/cost-guard.mjs indexer-discovery
 *   node scripts/cost-guard.mjs indexer-full indexer-scale   # multiple categories
 */
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  checkSpendApproval,
  costPolicySnapshot,
  COST_CATEGORIES,
} from "../workers/ops/cost-policy.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const categories = process.argv.slice(2).filter((a) => !a.startsWith("-"));

function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...process.env, ...loadEnvLocal() };

async function loadRemoteApprovals(localEnv) {
  const secret = localEnv.OPS_ADMIN_SECRET?.trim();
  if (!secret) return [];
  const base = localEnv.NEXT_PUBLIC_APP_URL ?? "https://alphamirror.trade";
  try {
    const res = await fetch(`${base}/api/ops/cost-barrier`, {
      headers: { "x-ops-secret": secret },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.approvedCategories ?? [];
  } catch {
    return [];
  }
}

if (categories.length === 0) {
  const snap = costPolicySnapshot(env);
  console.log("Cost policy (out-of-pocket baseline ~$2–10/mo until you approve increases):");
  console.log(JSON.stringify(snap, null, 2));
  console.log("\nCategories:");
  for (const [key, label] of Object.entries(COST_CATEGORIES)) {
    const allowed = snap.approvedCategories.includes(key) || !snap.baselineLocked;
    console.log(`  ${allowed ? "✓" : "✗"} ${key} — ${label}`);
  }
  process.exit(0);
}

async function notifyProductionBarrier(category, message, localEnv) {
  const secret = localEnv.OPS_ADMIN_SECRET?.trim();
  if (!secret) return;
  const base = localEnv.NEXT_PUBLIC_APP_URL ?? "https://alphamirror.trade";
  try {
    const res = await fetch(`${base}/api/ops/cost-barrier`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ops-secret": secret,
      },
      body: JSON.stringify({
        category,
        summary: message,
        source: "local:cost-guard",
        notify: true,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.emailed) {
        console.error("[cost-guard] Approval email sent to ops owner.");
      } else if (data.queued) {
        console.error("[cost-guard] Approval request queued (email pending).");
      }
    }
  } catch {
    // non-fatal — local block still applies
  }
}

const remoteApproved = await loadRemoteApprovals(env);
if (remoteApproved.length) {
  env.OPS_SPEND_APPROVED_KV = remoteApproved.join(",");
}

for (const category of categories) {
  const result = checkSpendApproval(category, env);
  if (!result.ok) {
    console.error(`\n[cost-guard] ${result.message}\n`);
    await notifyProductionBarrier(category, result.message, env);
    process.exit(1);
  }
}

console.log(
  `[cost-guard] OK — ${categories.join(", ")} allowed (baseline locked=${env.OPS_COST_BASELINE_LOCKED !== "0"})`,
);