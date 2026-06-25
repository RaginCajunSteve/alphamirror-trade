export const BASELINE_MONTHLY_USD = { min: 2, max: 10 } as const;

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
} as const;

export type CostCategory = keyof typeof COST_CATEGORIES;

export interface CostPolicySnapshot {
  baselineLocked: boolean;
  baselineMonthlyUsd: typeof BASELINE_MONTHLY_USD;
  approvedCategories: string[];
  blockedCategories: string[];
  updatedAt: string;
}