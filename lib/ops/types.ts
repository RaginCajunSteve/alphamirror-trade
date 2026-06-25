export type OpsPhase =
  | "monitor"
  | "analyze"
  | "prioritize"
  | "plan"
  | "implement"
  | "verify"
  | "learn";

export type MaintenanceStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface MaintenanceUpdate {
  at: string;
  message: string;
  expectedBackAt?: string;
}

export interface MaintenanceWindow {
  id: string;
  title: string;
  startAt: string;
  expectedEndAt: string;
  status: MaintenanceStatus;
  createdAt: string;
  noticeSentAt?: string;
  startedAt?: string;
  completedAt?: string;
  updates: MaintenanceUpdate[];
}

export interface OpsNotifyContact {
  email: string;
  wallet?: string;
  source: "stripe" | "manual";
  addedAt: string;
}

export type ImprovementCategory =
  | "uptime"
  | "security"
  | "roi"
  | "performance"
  | "ux"
  | "operations";

export type ImprovementStatus =
  | "new"
  | "approved"
  | "in_progress"
  | "done"
  | "deferred"
  | "failed";

export interface OpsImprovement {
  id: string;
  summary: string;
  category: ImprovementCategory;
  source: "health" | "security" | "roi" | "feedback" | "manual";
  impact: number;
  effort: number;
  reach: number;
  score: number;
  status: ImprovementStatus;
  createdAt: string;
  evidence?: string;
  /** Set when backlog item may raise out-of-pocket spend — never auto-approved while baseline locked */
  increasesSpend?: boolean;
}

export interface HealthCheckResult {
  name: string;
  ok: boolean;
  ms: number;
  detail?: string;
}

export interface OpsHealthSnapshot {
  at: string;
  overall: "healthy" | "degraded" | "down";
  checks: HealthCheckResult[];
}

export interface OpsRoiSnapshot {
  at: string;
  proSubscribers: number;
  activeMirrors: number;
  executionCount: number;
  totalFeesUsd: number;
  totalSubscriptionUsd: number;
  estimatedMrrUsd: number;
  executionSuccessRate: number;
  roiScore: number;
}

export interface OpsSecuritySnapshot {
  at: string;
  score: number;
  findings: { level: "info" | "warn" | "critical"; message: string }[];
}

export interface OpsLoopState {
  version: 1;
  cycle: number;
  phase: OpsPhase;
  lastRunAt: string | null;
  health: OpsHealthSnapshot | null;
  roi: OpsRoiSnapshot | null;
  security: OpsSecuritySnapshot | null;
  changelog: { at: string; note: string }[];
}

export interface PublicStatus {
  operational: boolean;
  headline: string;
  maintenance: MaintenanceWindow | null;
  lastCheckedAt: string | null;
  expectedBackAt: string | null;
}