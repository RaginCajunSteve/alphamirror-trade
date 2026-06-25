import { readDataJson, writeDataJson } from "./data-adapter";
import type {
  FeedbackEntry,
  MirrorConfig,
  MirrorExecution,
  MirrorStatus,
  PlanId,
  RevenueStats,
  Subscription,
} from "./types";
import { plans } from "./pricing";

export async function listFeedback(): Promise<FeedbackEntry[]> {
  return readDataJson<FeedbackEntry[]>("feedback.json", []);
}

export async function addFeedback(entry: FeedbackEntry): Promise<void> {
  const items = await listFeedback();
  items.push(entry);
  await writeDataJson("feedback.json", items);
}

export async function listMirrors(userAddress?: string): Promise<MirrorConfig[]> {
  const mirrors = await readDataJson<MirrorConfig[]>("mirrors.json", []);
  if (!userAddress) return mirrors;
  return mirrors.filter(
    (m) => m.userAddress.toLowerCase() === userAddress.toLowerCase(),
  );
}

export async function upsertMirror(mirror: MirrorConfig): Promise<MirrorConfig> {
  const mirrors = await readDataJson<MirrorConfig[]>("mirrors.json", []);
  const idx = mirrors.findIndex((m) => m.id === mirror.id);
  if (idx >= 0) mirrors[idx] = mirror;
  else mirrors.push(mirror);
  await writeDataJson("mirrors.json", mirrors);
  return mirror;
}

export async function deleteMirror(
  id: string,
  userAddress: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await deleteMirrors([id], userAddress);
  if (result.removed.includes(id)) return { ok: true };
  if (result.forbidden.includes(id)) return { ok: false, error: "forbidden" };
  return { ok: false, error: "not_found" };
}

export async function deleteMirrors(
  ids: string[],
  userAddress: string,
): Promise<{ removed: string[]; notFound: string[]; forbidden: string[] }> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const mirrors = await readDataJson<MirrorConfig[]>("mirrors.json", []);
  const user = userAddress.toLowerCase();
  const toRemove = new Set<string>();
  const notFound: string[] = [];
  const forbidden: string[] = [];

  for (const id of uniqueIds) {
    const existing = mirrors.find((m) => m.id === id);
    if (!existing) {
      notFound.push(id);
      continue;
    }
    if (existing.userAddress.toLowerCase() !== user) {
      forbidden.push(id);
      continue;
    }
    toRemove.add(id);
  }

  if (toRemove.size > 0) {
    await writeDataJson(
      "mirrors.json",
      mirrors.filter((m) => !toRemove.has(m.id)),
    );
  }

  return { removed: [...toRemove], notFound, forbidden };
}

export async function updateMirrorsStatus(
  ids: string[],
  userAddress: string,
  status: MirrorStatus,
): Promise<{
  updated: MirrorConfig[];
  notFound: string[];
  forbidden: string[];
}> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const mirrors = await readDataJson<MirrorConfig[]>("mirrors.json", []);
  const user = userAddress.toLowerCase();
  const updated: MirrorConfig[] = [];
  const notFound: string[] = [];
  const forbidden: string[] = [];

  for (const id of uniqueIds) {
    const idx = mirrors.findIndex((m) => m.id === id);
    if (idx < 0) {
      notFound.push(id);
      continue;
    }
    if (mirrors[idx].userAddress.toLowerCase() !== user) {
      forbidden.push(id);
      continue;
    }
    mirrors[idx] = { ...mirrors[idx], status };
    updated.push(mirrors[idx]);
  }

  if (updated.length > 0) {
    await writeDataJson("mirrors.json", mirrors);
  }

  return { updated, notFound, forbidden };
}

export async function getSubscription(userAddress: string): Promise<Subscription> {
  const subs = await readDataJson<Subscription[]>("subscriptions.json", []);
  const found = subs.find(
    (s) => s.userAddress.toLowerCase() === userAddress.toLowerCase(),
  );
  return (
    found ?? {
      userAddress,
      plan: "free",
      startedAt: new Date().toISOString(),
    }
  );
}

export async function setSubscription(
  userAddress: string,
  plan: PlanId,
  stripe?: { stripeCustomerId?: string; stripeSubscriptionId?: string },
): Promise<Subscription> {
  const subs = await readDataJson<Subscription[]>("subscriptions.json", []);
  const idx = subs.findIndex(
    (s) => s.userAddress.toLowerCase() === userAddress.toLowerCase(),
  );
  const row: Subscription = {
    userAddress,
    plan,
    startedAt: new Date().toISOString(),
    expiresAt:
      plan === "pro"
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : undefined,
    ...stripe,
  };
  if (idx >= 0) subs[idx] = { ...subs[idx], ...row };
  else subs.push(row);
  await writeDataJson("subscriptions.json", subs);
  return row;
}

export async function listExecutions(userAddress?: string): Promise<MirrorExecution[]> {
  const rows = await readDataJson<MirrorExecution[]>("mirror-executions.json", []);
  if (!userAddress) return rows;
  return rows.filter(
    (e) => e.userAddress.toLowerCase() === userAddress.toLowerCase(),
  );
}

export async function addExecution(row: MirrorExecution): Promise<MirrorExecution> {
  const rows = await readDataJson<MirrorExecution[]>("mirror-executions.json", []);
  rows.push(row);
  await writeDataJson("mirror-executions.json", rows.slice(-500));
  return row;
}

export async function getRevenueStats(): Promise<RevenueStats> {
  const stats = await readDataJson<RevenueStats | null>("revenue.json", null);
  if (stats) return stats;

  const executions = await listExecutions();
  const subs = await readDataJson<Subscription[]>("subscriptions.json", []);
  const proCount = subs.filter((s) => s.plan === "pro").length;

  return {
    totalFeesUsd: executions.reduce((s, e) => s + e.platformFeeUsd, 0),
    totalSubscriptionUsd: proCount * plans.pro.priceUsdMonthly,
    executionCount: executions.length,
    lastUpdated: new Date().toISOString(),
  };
}

export async function recordRevenueDelta(
  feeUsd: number,
  subscriptionUsd = 0,
): Promise<RevenueStats> {
  const stats = await getRevenueStats();
  const next: RevenueStats = {
    totalFeesUsd: stats.totalFeesUsd + feeUsd,
    totalSubscriptionUsd: stats.totalSubscriptionUsd + subscriptionUsd,
    executionCount: stats.executionCount + (feeUsd > 0 ? 1 : 0),
    lastUpdated: new Date().toISOString(),
  };
  await writeDataJson("revenue.json", next);
  return next;
}