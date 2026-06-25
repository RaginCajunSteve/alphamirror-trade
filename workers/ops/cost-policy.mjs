/**
 * Out-of-pocket spend guardrails — baseline ~$2–10/mo until owner explicitly approves.
 *
 * Default: OPS_COST_BASELINE_LOCKED=1 (or unset). Set OPS_SPEND_APPROVED to a
 * comma-separated list of categories to allow specific increases.
 * Set OPS_COST_BASELINE_LOCKED=0 to unlock all categories (not recommended).
 */

export const BASELINE_MONTHLY_USD = { min: 2, max: 10 };

/** @type {Record<string, string>} */
export const COST_CATEGORIES = {
  "indexer-full": "Full indexer (discovery + score)",
  "indexer-discovery": "Discovery-only indexer pass",
  "indexer-hunt": "Win-rate hunt (high API volume)",
  "indexer-scale": "Higher indexer limits or cron frequency",
  "alchemy-networks": "Enable additional Alchemy networks",
  "paid-rpc": "Paid RPC provider",
  "paid-alchemy": "Alchemy paid tier",
  "paid-cloudflare": "Cloudflare paid plan or paid bindings",
  "new-worker": "New Cloudflare Worker (beyond current fleet)",
  "mainnet-execution": "Mainnet keeper gas / live execution scale-up",
  "bsc-live": "BSC live copy infrastructure",
};

const ALL_CATEGORIES = Object.keys(COST_CATEGORIES);

export function isCostBaselineLocked(env = process.env) {
  const raw = env.OPS_COST_BASELINE_LOCKED;
  if (raw === "0" || raw === "false") return false;
  return true;
}

export function approvedSpendCategories(env = process.env) {
  const out = new Set();
  for (const key of ["OPS_SPEND_APPROVED", "OPS_SPEND_APPROVED_KV"]) {
    const raw = env[key]?.trim();
    if (!raw) continue;
    for (const part of raw.split(",")) {
      const c = part.trim();
      if (c) out.add(c);
    }
  }
  return out;
}

export function isSpendApproved(category, env = process.env) {
  if (!isCostBaselineLocked(env)) return true;
  return approvedSpendCategories(env).has(category);
}

/**
 * @param {string} category
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function checkSpendApproval(category, env = process.env) {
  if (!COST_CATEGORIES[category]) {
    return {
      ok: false,
      message: `Unknown cost category "${category}". Valid: ${ALL_CATEGORIES.join(", ")}`,
    };
  }
  if (isSpendApproved(category, env)) return { ok: true };
  const approved = [...approvedSpendCategories(env)];
  return {
    ok: false,
    message:
      `Blocked: "${category}" (${COST_CATEGORIES[category]}) may increase out-of-pocket spend ` +
      `above the ~$${BASELINE_MONTHLY_USD.min}–$${BASELINE_MONTHLY_USD.max}/mo baseline. ` +
      `Approve via the email link sent to your ops inbox, reply APPROVE ${category} to billing@alphamirror.trade, ` +
      `or add "${category}" to OPS_SPEND_APPROVED in .env.local. ` +
      (approved.length ? `Currently approved: ${approved.join(", ")}.` : "No categories approved yet."),
  };
}

/**
 * @param {string} category
 * @param {Record<string, string | undefined>} [env]
 */
export function assertSpendApproved(category, env = process.env) {
  const result = checkSpendApproval(category, env);
  if (!result.ok) {
    const err = new Error(result.message);
    err.code = "OPS_COST_BLOCKED";
    throw err;
  }
}

/** Improvement backlog items that imply recurring or infra spend. */
export function improvementIncreasesSpend(summary) {
  const s = summary.toLowerCase();
  return (
    /paid|upgrade|scale.?up|increase.*cron|new worker|alchemy.*tier|cloudflare.*paid|bsc.*live|mainnet.*gas|hired|audit|third.?party/i.test(
      s,
    ) || /discovery.*pass|full.*indexer|win.?rate hunt/i.test(s)
  );
}

export function costPolicySnapshot(env = process.env) {
  const locked = isCostBaselineLocked(env);
  const approved = [...approvedSpendCategories(env)];
  return {
    baselineLocked: locked,
    baselineMonthlyUsd: BASELINE_MONTHLY_USD,
    approvedCategories: approved,
    blockedCategories: locked
      ? ALL_CATEGORIES.filter((c) => !approved.includes(c))
      : [],
    updatedAt: new Date().toISOString(),
  };
}