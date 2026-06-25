import {
  MAX_SUPPORT_CASES,
  SUPPORT_CASES_KV_KEY,
  newSupportCaseId,
  type SupportCase,
  type SupportCaseSource,
} from "../lib/support-cases";

type Kv = {
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string): Promise<void>;
};

export async function listSupportCases(kv: Kv): Promise<SupportCase[]> {
  const rows = await kv.get(SUPPORT_CASES_KV_KEY, "json");
  return Array.isArray(rows) ? (rows as SupportCase[]) : [];
}

async function saveSupportCases(kv: Kv, cases: SupportCase[]): Promise<void> {
  await kv.put(
    SUPPORT_CASES_KV_KEY,
    JSON.stringify(cases.slice(-MAX_SUPPORT_CASES)),
  );
}

export async function upsertSupportCase(kv: Kv, item: SupportCase): Promise<void> {
  const cases = await listSupportCases(kv);
  const idx = cases.findIndex((c) => c.id === item.id);
  const row = { ...item, updatedAt: new Date().toISOString() };
  if (idx >= 0) cases[idx] = row;
  else cases.push(row);
  await saveSupportCases(kv, cases);
}

export async function enqueueSupportCase(
  kv: Kv,
  input: {
    source: SupportCaseSource;
    channel: string;
    summary: string;
    subject?: string;
    customerEmail?: string;
    userAddress?: string;
    transcript?: string;
    dedupeKey?: string;
  },
): Promise<SupportCase> {
  const cases = await listSupportCases(kv);
  if (input.dedupeKey) {
    const existing = cases.find(
      (c) =>
        c.status === "open" &&
        c.channel === input.channel &&
        c.summary === input.summary,
    );
    if (existing) return existing;
  }

  const now = new Date().toISOString();
  const item: SupportCase = {
    id: newSupportCaseId(input.source),
    source: input.source,
    status: "open",
    createdAt: now,
    updatedAt: now,
    channel: input.channel,
    summary: input.summary.slice(0, 8000),
    subject: input.subject,
    customerEmail: input.customerEmail,
    userAddress: input.userAddress,
    transcript: input.transcript?.slice(0, 12000),
  };
  cases.push(item);
  await saveSupportCases(kv, cases);
  return item;
}