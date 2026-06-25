export type SupportCaseSource = "email" | "chat" | "feedback" | "billing_email";
export type SupportCaseStatus =
  | "open"
  | "investigating"
  | "auto_resolved"
  | "escalated"
  | "failed";

export interface SupportInvestigation {
  issueType: string;
  findings: string;
  recommendedAction: string;
  confidence: "low" | "medium" | "high";
  investigatedAt: string;
}

export interface SupportResolution {
  customerMessage: string;
  emailedTo?: string;
  emailedAt?: string;
  escalatedTo?: string;
  escalatedAt?: string;
}

export interface SupportCase {
  id: string;
  source: SupportCaseSource;
  status: SupportCaseStatus;
  createdAt: string;
  updatedAt: string;
  channel: string;
  summary: string;
  subject?: string;
  customerEmail?: string;
  userAddress?: string;
  transcript?: string;
  investigation?: SupportInvestigation;
  resolution?: SupportResolution;
}

export const SUPPORT_CASES_KV_KEY = "support-cases.json";
export const MAX_SUPPORT_CASES = 200;

export function newSupportCaseId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}