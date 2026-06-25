import { readDataJson, writeDataJson } from "@/lib/data-adapter";
import { COST_CATEGORIES, type CostCategory } from "./cost-policy";

export const KV_COST_REQUESTS = "ops-cost-requests.json";
export const KV_COST_EMAIL_APPROVALS = "ops-cost-email-approvals.json";
export const DEFAULT_OWNER_EMAIL = "steven.comeau@lightningcomms.net";
export const REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface CostApprovalRequest {
  id: string;
  token: string;
  category: CostCategory | string;
  summary: string;
  source: string;
  status: "pending" | "approved" | "denied" | "expired";
  createdAt: string;
  expiresAt: string;
  notifiedAt?: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

interface EmailApprovalsStore {
  categories: string[];
  log: { category: string; at: string; via?: string; from?: string; requestId?: string }[];
}

export function ownerEmail(): string {
  return (process.env.OPS_OWNER_EMAIL ?? DEFAULT_OWNER_EMAIL).trim().toLowerCase();
}

export async function getKvApprovedCategories(): Promise<string[]> {
  const row = await readDataJson<EmailApprovalsStore | null>(
    KV_COST_EMAIL_APPROVALS,
    null,
  );
  return row?.categories ?? [];
}

export async function getCostRequests(): Promise<CostApprovalRequest[]> {
  return readDataJson<CostApprovalRequest[]>(KV_COST_REQUESTS, []);
}

async function saveCostRequests(requests: CostApprovalRequest[]): Promise<void> {
  await writeDataJson(KV_COST_REQUESTS, requests.slice(0, 200));
}

export async function approveCategory(
  category: string,
  meta: { via?: string; from?: string; requestId?: string } = {},
): Promise<string[]> {
  if (!(category in COST_CATEGORIES)) {
    throw new Error(`Unknown cost category: ${category}`);
  }
  const row = await readDataJson<EmailApprovalsStore>(KV_COST_EMAIL_APPROVALS, {
    categories: [],
    log: [],
  });
  if (!row.categories.includes(category)) {
    row.categories.push(category);
  }
  row.log = [
    { category, at: new Date().toISOString(), ...meta },
    ...row.log.slice(0, 99),
  ];
  await writeDataJson(KV_COST_EMAIL_APPROVALS, row);
  return row.categories;
}

export async function findRequestByToken(
  token: string,
): Promise<CostApprovalRequest | null> {
  const requests = await getCostRequests();
  return requests.find((r) => r.token === token) ?? null;
}

export async function resolveRequest(
  token: string,
  status: "approved" | "denied",
  meta: { via?: string } = {},
): Promise<
  | { ok: true; request: CostApprovalRequest }
  | { ok: false; error: string; request?: CostApprovalRequest }
> {
  const requests = await getCostRequests();
  const req = requests.find((r) => r.token === token);
  if (!req) return { ok: false, error: "not_found" };
  if (req.status !== "pending") {
    return { ok: false, error: "already_resolved", request: req };
  }
  if (Date.now() > Date.parse(req.expiresAt)) {
    req.status = "expired";
    await saveCostRequests(requests);
    return { ok: false, error: "expired", request: req };
  }

  req.status = status;
  req.resolvedAt = new Date().toISOString();
  req.resolvedBy = meta.via ?? "link";
  await saveCostRequests(requests);

  if (status === "approved") {
    await approveCategory(req.category, {
      via: meta.via ?? "link",
      requestId: req.id,
    });
  }
  return { ok: true, request: req };
}

export async function reportCostBarrier(input: {
  category: string;
  summary: string;
  source: string;
}): Promise<CostApprovalRequest | null> {
  const { category, summary, source } = input;
  if (!(category in COST_CATEGORIES)) {
    throw new Error(`Unknown cost category: ${category}`);
  }

  const kvApproved = await getKvApprovedCategories();
  const envApproved = new Set([
    ...kvApproved,
    ...(process.env.OPS_SPEND_APPROVED?.split(",").map((s) => s.trim()) ?? []),
  ]);
  if (envApproved.has(category)) return null;

  const requests = await getCostRequests();
  const now = Date.now();
  const recent = requests.find(
    (r) =>
      r.category === category &&
      r.source === source &&
      r.status === "pending" &&
      now - Date.parse(r.createdAt) < 24 * 60 * 60 * 1000,
  );
  if (recent) return recent;

  const request: CostApprovalRequest = {
    id: `cost-${now.toString(36)}`,
    token: crypto.randomUUID().replace(/-/g, ""),
    category,
    summary: summary.slice(0, 500),
    source: source.slice(0, 80),
    status: "pending",
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + REQUEST_TTL_MS).toISOString(),
  };
  requests.unshift(request);
  await saveCostRequests(requests);
  return request;
}