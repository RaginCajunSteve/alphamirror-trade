export type PlanId = "free" | "pro";

export interface Plan {
  id: PlanId;
  name: string;
  priceUsdMonthly: number;
  mirrorFeeBps: number;
  liveMirrors: boolean;
  maxPaperMirrors: number;
  features: string[];
}

export const PLATFORM_FEE_BPS = 50; // 0.5% per mirrored trade (revenue)

export const plans: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceUsdMonthly: 0,
    mirrorFeeBps: 0,
    liveMirrors: false,
    maxPaperMirrors: 3,
    features: [
      "Up to 3 paper mirrors",
      "Full leaderboard + playbooks",
      "Watcher queue visibility",
      "Simulated PnL tracking",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceUsdMonthly: 29,
    mirrorFeeBps: PLATFORM_FEE_BPS,
    liveMirrors: true,
    maxPaperMirrors: 25,
    features: [
      "Unlimited paper mirrors",
      "Live mirror execution on all deployed networks",
      "0.5% platform fee per mirrored trade",
      "Priority keeper queue",
      "Billing support: billing@alphamirror.trade",
    ],
  },
};

export function calcPlatformFeeUsd(tradeUsd: number, plan: PlanId): number {
  if (plan !== "pro") return 0;
  return (tradeUsd * PLATFORM_FEE_BPS) / 10_000;
}