/**
 * Email-based cost approval requests — KV persistence + owner notifications.
 */
import {
  COST_CATEGORIES,
  isSpendApproved,
} from "./cost-policy.mjs";

export const KV_COST_REQUESTS = "ops-cost-requests.json";
export const KV_COST_EMAIL_APPROVALS = "ops-cost-email-approvals.json";
export const DEFAULT_OWNER_EMAIL = "steven.comeau@lightningcomms.net";
export const REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const NOTIFY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function ownerEmail(env = process.env) {
  return (env.OPS_OWNER_EMAIL ?? DEFAULT_OWNER_EMAIL).trim().toLowerCase();
}

export function inferCostCategory(summary) {
  const s = summary.toLowerCase();
  if (/discovery|router crawl|weekly discovery/.test(s)) return "indexer-discovery";
  if (/win.?rate|hunt/.test(s)) return "indexer-hunt";
  if (/bsc.*live|binance.*copy/.test(s)) return "bsc-live";
  if (/alchemy.*network|enable.*network/.test(s)) return "alchemy-networks";
  if (/mainnet|gas|keeper fund|router deploy/.test(s)) return "mainnet-execution";
  if (/paid.*rpc/.test(s)) return "paid-rpc";
  if (/cloudflare.*paid|workers paid/.test(s)) return "paid-cloudflare";
  if (/full indexer|discovery \+ score/.test(s)) return "indexer-full";
  return "indexer-scale";
}

export function envWithKvApprovals(env, kvCategories = []) {
  const merged = [
    ...new Set([
      ...(env.OPS_SPEND_APPROVED_KV?.split(",").map((s) => s.trim()).filter(Boolean) ?? []),
      ...kvCategories,
    ]),
  ];
  return { ...env, OPS_SPEND_APPROVED_KV: merged.join(",") };
}

export async function getKvApprovedCategories(kv) {
  const row = await kv.get(KV_COST_EMAIL_APPROVALS, "json");
  return row?.categories ?? [];
}

export async function approveCategory(kv, category, meta = {}) {
  if (!COST_CATEGORIES[category]) {
    throw new Error(`Unknown cost category: ${category}`);
  }
  const row = (await kv.get(KV_COST_EMAIL_APPROVALS, "json")) ?? {
    categories: [],
    log: [],
  };
  if (!row.categories.includes(category)) {
    row.categories.push(category);
  }
  row.log = [
    {
      category,
      at: new Date().toISOString(),
      ...meta,
    },
    ...(row.log ?? []).slice(0, 99),
  ];
  await kv.put(KV_COST_EMAIL_APPROVALS, JSON.stringify(row));
  return row.categories;
}

export async function denyCategory(kv, category, meta = {}) {
  const requests = await loadRequests(kv);
  const now = new Date().toISOString();
  for (const req of requests) {
    if (req.category === category && req.status === "pending") {
      req.status = "denied";
      req.resolvedAt = now;
      req.resolvedBy = meta.via ?? "email";
    }
  }
  await saveRequests(kv, requests);
}

async function loadRequests(kv) {
  return (await kv.get(KV_COST_REQUESTS, "json")) ?? [];
}

async function saveRequests(kv, requests) {
  await kv.put(KV_COST_REQUESTS, JSON.stringify(requests.slice(0, 200)));
}

function newToken() {
  return crypto.randomUUID().replace(/-/g, "");
}

/**
 * Queue a cost barrier for owner notification (deduped per category+source per 24h).
 */
export async function reportCostBarrier(kv, { category, summary, source }) {
  if (!COST_CATEGORIES[category]) {
    throw new Error(`Unknown cost category: ${category}`);
  }

  const requests = await loadRequests(kv);
  const now = Date.now();
  const recent = requests.find(
    (r) =>
      r.category === category &&
      r.source === source &&
      r.status === "pending" &&
      now - Date.parse(r.createdAt) < NOTIFY_COOLDOWN_MS,
  );
  if (recent) return recent;

  const kvApproved = await getKvApprovedCategories(kv);
  const env = envWithKvApprovals({}, kvApproved);
  if (isSpendApproved(category, env)) return null;

  const request = {
    id: `cost-${now.toString(36)}`,
    token: newToken(),
    category,
    summary: String(summary).slice(0, 500),
    source: String(source).slice(0, 80),
    status: "pending",
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + REQUEST_TTL_MS).toISOString(),
  };
  requests.unshift(request);
  await saveRequests(kv, requests);
  return request;
}

export async function findRequestByToken(kv, token) {
  const requests = await loadRequests(kv);
  return requests.find((r) => r.token === token) ?? null;
}

export async function resolveRequest(kv, token, status, meta = {}) {
  const requests = await loadRequests(kv);
  const req = requests.find((r) => r.token === token);
  if (!req) return { ok: false, error: "not_found" };
  if (req.status !== "pending") {
    return { ok: false, error: "already_resolved", request: req };
  }
  if (Date.now() > Date.parse(req.expiresAt)) {
    req.status = "expired";
    await saveRequests(kv, requests);
    return { ok: false, error: "expired", request: req };
  }

  req.status = status;
  req.resolvedAt = new Date().toISOString();
  req.resolvedBy = meta.via ?? "link";
  await saveRequests(kv, requests);

  if (status === "approved") {
    await approveCategory(kv, req.category, { via: meta.via ?? "link", requestId: req.id });
  }
  return { ok: true, request: req };
}

export function parseEmailApprovalCommand(text) {
  const body = text.replace(/\r/g, "");
  const approve = body.match(/\bAPPROVE\s+([a-z0-9-]+)/i);
  if (approve) return { action: "approve", category: approve[1].toLowerCase() };
  const deny = body.match(/\bDENY\s+([a-z0-9-]+)/i);
  if (deny) return { action: "deny", category: deny[1].toLowerCase() };
  return null;
}

export async function handleEmailApprovalCommand(kv, command, meta = {}) {
  if (!COST_CATEGORIES[command.category]) {
    return { ok: false, error: `Unknown category: ${command.category}` };
  }
  if (command.action === "approve") {
    const categories = await approveCategory(kv, command.category, {
      via: meta.via ?? "email-reply",
      from: meta.from,
    });
    const requests = await loadRequests(kv);
    for (const req of requests) {
      if (req.category === command.category && req.status === "pending") {
        req.status = "approved";
        req.resolvedAt = new Date().toISOString();
        req.resolvedBy = "email-reply";
      }
    }
    await saveRequests(kv, requests);
    return { ok: true, action: "approved", categories };
  }
  await denyCategory(kv, command.category, { via: "email-reply", from: meta.from });
  return { ok: true, action: "denied" };
}

export async function sendCostApprovalEmail(env, request, baseUrl) {
  if (!env.EMAIL) return { ok: false, error: "no EMAIL binding" };
  const to = ownerEmail(env);
  const label = COST_CATEGORIES[request.category] ?? request.category;
  const approveUrl = `${baseUrl}/api/ops/cost-approve?token=${request.token}`;
  const denyUrl = `${baseUrl}/api/ops/cost-approve?token=${request.token}&action=deny`;

  const subject = `Action needed — cost approval: ${request.category}`;
  const text = [
    "Alpha Mirror hit a spend guardrail that blocks seamless operations.",
    "",
    `Recommendation: ${request.summary}`,
    `Category: ${request.category} (${label})`,
    "Current baseline: ~$2–10/mo out-of-pocket (locked until you approve).",
    "",
    "Approve (one click):",
    approveUrl,
    "",
    "Or reply to this email with one line:",
    `  APPROVE ${request.category}`,
    `  DENY ${request.category}`,
    "",
    `Expires: ${new Date(request.expiresAt).toUTCString()}`,
    "",
    "— Alpha Mirror Ops",
    baseUrl,
  ].join("\n");

  const html = [
    "<p><strong>Spend guardrail — your approval is needed</strong></p>",
    `<p>${request.summary}</p>`,
    `<p><strong>Category:</strong> ${request.category}<br>`,
    `<strong>What it enables:</strong> ${label}<br>`,
    `<strong>Baseline:</strong> ~$2–10/mo (locked)</p>`,
    `<p><a href="${approveUrl}" style="display:inline-block;padding:10px 18px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Approve</a>`,
    `&nbsp;<a href="${denyUrl}" style="display:inline-block;padding:10px 18px;background:#64748b;color:#fff;text-decoration:none;border-radius:6px">Deny</a></p>`,
    `<p style="color:#666;font-size:13px">Or reply with <code>APPROVE ${request.category}</code> or <code>DENY ${request.category}</code></p>`,
    `<p style="color:#999;font-size:12px">Expires ${new Date(request.expiresAt).toUTCString()}</p>`,
  ].join("");

  try {
    await env.EMAIL.send({
      to,
      from: { email: "noreply@alphamirror.trade", name: "Alpha Mirror Ops" },
      replyTo: "billing@alphamirror.trade",
      subject,
      html,
      text,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}

export async function sendApprovalConfirmationEmail(env, { category, action, baseUrl }) {
  if (!env.EMAIL) return { ok: false, error: "no EMAIL binding" };
  const to = ownerEmail(env);
  const label = COST_CATEGORIES[category] ?? category;
  const subject =
    action === "approved"
      ? `Approved — ${category} spend unlocked`
      : `Denied — ${category} spend request`;
  const text =
    action === "approved"
      ? `You approved "${category}" (${label}). Operations using this category may proceed.\n\n${baseUrl}`
      : `You denied "${category}". The spend guardrail remains in place.\n\n${baseUrl}`;

  try {
    await env.EMAIL.send({
      to,
      from: { email: "noreply@alphamirror.trade", name: "Alpha Mirror Ops" },
      subject,
      text,
      html: `<p>${text.replace(/\n/g, "<br>")}</p>`,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}

/** Send pending request emails (hourly from ops-loop). */
export async function processPendingCostNotifications(kv, env) {
  const baseUrl = env.NEXT_PUBLIC_APP_URL ?? "https://alphamirror.trade";
  const requests = await loadRequests(kv);
  const results = [];
  for (const req of requests) {
    if (req.status !== "pending" || req.notifiedAt) continue;
    const sent = await sendCostApprovalEmail(env, req, baseUrl);
    if (sent.ok) {
      req.notifiedAt = new Date().toISOString();
      results.push({ id: req.id, ok: true });
    } else {
      results.push({ id: req.id, ok: false, error: sent.error });
    }
  }
  await saveRequests(kv, requests);
  return results;
}

/** Scan improvements backlog for spend items needing approval. */
export async function queueImprovementCostBarriers(kv, env, improvements) {
  const kvApproved = await getKvApprovedCategories(kv);
  const mergedEnv = envWithKvApprovals(env, kvApproved);
  const queued = [];

  for (const item of improvements) {
    if (!item.increasesSpend && !item.summary) continue;
    const category = item.costCategory ?? inferCostCategory(item.summary);
    if (isSpendApproved(category, mergedEnv)) continue;
    const req = await reportCostBarrier(kv, {
      category,
      summary: item.summary,
      source: `ops-improvement:${item.id ?? item.source}`,
    });
    if (req) queued.push(req);
  }
  return queued;
}