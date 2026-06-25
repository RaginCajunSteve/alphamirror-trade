import { readDataJson, writeDataJson } from "./data-adapter";
import {
  MAX_SUPPORT_CASES,
  SUPPORT_CASES_KV_KEY,
  newSupportCaseId,
  type SupportCase,
  type SupportCaseSource,
} from "./support-cases";

export async function enqueueSupportCaseFromApp(input: {
  source: SupportCaseSource;
  channel: string;
  summary: string;
  subject?: string;
  customerEmail?: string;
  userAddress?: string;
  transcript?: string;
}): Promise<SupportCase> {
  const cases = await readDataJson<SupportCase[]>(SUPPORT_CASES_KV_KEY, []);
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
  await writeDataJson(SUPPORT_CASES_KV_KEY, cases.slice(-MAX_SUPPORT_CASES));
  return item;
}