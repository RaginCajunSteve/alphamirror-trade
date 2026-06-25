export type Chain =
  | "ethereum"
  | "base"
  | "arbitrum"
  | "polygon"
  | "unichain"
  | "linea"
  | "blast"
  | "optimism"
  | "bsc"
  | "avalanche"
  | "scroll";
export type Window = "30d" | "90d" | "180d";
export type MirrorMode = "paper" | "live";
export type MirrorStatus = "active" | "paused";

export interface WalletScore {
  wallet: string;
  window: Window;
  roi: number;
  maxDrawdown: number;
  riskAdjRoi: number;
  winRate: number;
  avgWinnerGain: number;
  percentile: number;
  tradeCount: number;
  volumeUsd: number;
}

export interface Strategy {
  wallet: string;
  archetype: string;
  holdAvgDays: number;
  mcapPreference: string;
  chainWeights: Record<Chain, number>;
  entryPatterns: string[];
  confidenceScore: number;
  riskScore: number;
}

export interface EquityPoint {
  date: string;
  cumulativePnlPct: number;
}

export interface EliteWallet {
  address: string;
  chainsActive: Chain[];
  scores: Record<Window, WalletScore>;
  strategy: Strategy;
  equityCurve: Record<Window, EquityPoint[]>;
}

export interface MirrorConfig {
  id: string;
  userAddress: string;
  alphaWallet: string;
  status: MirrorStatus;
  mode: MirrorMode;
  perTradeCapUsd: number;
  dailyCapUsd: number;
  userRatioPct: number;
  allowedChains: Chain[];
  denylistTokens: string[];
  createdAt: string;
}

export interface FeedbackEntry {
  id: string;
  page: string;
  category: string;
  message: string;
  userAddress?: string;
  timestamp: string;
}

export type PlanId = "free" | "pro";

export interface Subscription {
  userAddress: string;
  plan: PlanId;
  startedAt: string;
  expiresAt?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

export interface MirrorExecution {
  id: string;
  mirrorId: string;
  userAddress: string;
  alphaWallet: string;
  chain: Chain;
  mode: MirrorMode;
  queueId: string;
  tradeUsd: number;
  pnlUsd: number;
  platformFeeUsd: number;
  timestamp: string;
  status: "simulated" | "executed" | "failed" | "pending_chain";
}

export interface RevenueStats {
  totalFeesUsd: number;
  totalSubscriptionUsd: number;
  executionCount: number;
  lastUpdated: string;
}