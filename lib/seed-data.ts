import type { Chain, EliteWallet, EquityPoint, Window } from "./types";

const ZERO_CHAIN_WEIGHTS: Record<Chain, number> = {
  ethereum: 0,
  base: 0,
  arbitrum: 0,
  polygon: 0,
  unichain: 0,
  linea: 0,
  blast: 0,
  optimism: 0,
  bsc: 0,
  avalanche: 0,
  scroll: 0,
};

function chainWeights(partial: Partial<Record<Chain, number>>): Record<Chain, number> {
  return { ...ZERO_CHAIN_WEIGHTS, ...partial };
}

const WALLETS: Omit<EliteWallet, "scores" | "equityCurve">[] = [
  {
    address: "0x7A3f8C2e1b9d4a6f0e8c5B2D1A9f7e4C3b8A6D5e",
    chainsActive: ["base", "arbitrum"],
    strategy: {
      wallet: "0x7A3f8C2e1b9d4a6f0e8c5B2D1A9f7e4C3b8A6D5e",
      archetype: "Early mid-cap swing trader",
      holdAvgDays: 4.2,
      mcapPreference: "$5M–$50M at entry",
      chainWeights: chainWeights({ ethereum: 0.1, base: 0.65, arbitrum: 0.25 }),
      entryPatterns: [
        "Buys within 2h of DEX listing",
        "Sells on 30–80% gain",
        "Avoids sub-$1M liquidity pools",
      ],
      confidenceScore: 0.87,
      riskScore: 7.2,
    },
  },
  {
    address: "0x2b9e4F1A8c7D6e5F3a2b1C0D9E8F7A6B5C4d3e2F",
    chainsActive: ["ethereum", "base"],
    strategy: {
      wallet: "0x2b9e4F1A8c7D6e5F3a2b1C0D9E8F7A6B5C4d3e2F",
      archetype: "Blue-chip rotator",
      holdAvgDays: 11.5,
      mcapPreference: "$100M+ established tokens",
      chainWeights: chainWeights({ ethereum: 0.55, base: 0.35, arbitrum: 0.1 }),
      entryPatterns: [
        "Accumulates on 15–25% dips",
        "Rotates into strength after BTC rallies",
        "Rarely holds more than 3 positions",
      ],
      confidenceScore: 0.91,
      riskScore: 5.4,
    },
  },
  {
    address: "0x9C1d5e7f2A4b6c8D0e2f4A6b8C0d2e4f6A8b0C2D",
    chainsActive: ["arbitrum", "ethereum"],
    strategy: {
      wallet: "0x9C1d5e7f2A4b6c8D0e2f4A6b8C0d2e4f6A8b0C2D",
      archetype: "Liquidity sniper",
      holdAvgDays: 1.8,
      mcapPreference: "$2M–$20M new pairs",
      chainWeights: chainWeights({ ethereum: 0.2, base: 0.15, arbitrum: 0.65 }),
      entryPatterns: [
        "Enters within first 50 swaps on new pool",
        "Exits within 24–48h",
        "Uses tight stop-loss behavior",
      ],
      confidenceScore: 0.79,
      riskScore: 8.6,
    },
  },
  {
    address: "0x4E8A2C6F0B1d3E5a7c9B2d4F6a8C0E2B4d6F8A0C",
    chainsActive: ["base"],
    strategy: {
      wallet: "0x4E8A2C6F0B1d3E5a7c9B2d4F6a8C0E2B4d6F8A0C",
      archetype: "Base ecosystem specialist",
      holdAvgDays: 6.7,
      mcapPreference: "$10M–$80M Base-native tokens",
      chainWeights: chainWeights({ ethereum: 0.05, base: 0.9, arbitrum: 0.05 }),
      entryPatterns: [
        "Follows Aerodrome liquidity migrations",
        "Holds through first volatility spike",
        "Trims 50% at 2x, rides rest",
      ],
      confidenceScore: 0.84,
      riskScore: 6.1,
    },
  },
  {
    address: "0x1F3A5c7E9b2D4F6A8C0e2b4D6F8A0c2E4b6d8F0A",
    chainsActive: ["ethereum", "arbitrum", "base"],
    strategy: {
      wallet: "0x1F3A5c7E9b2D4F6A8C0e2b4D6F8A0c2E4b6d8F0A",
      archetype: "Multi-chain momentum",
      holdAvgDays: 3.4,
      mcapPreference: "$20M–$120M trending tokens",
      chainWeights: chainWeights({ ethereum: 0.33, base: 0.34, arbitrum: 0.33 }),
      entryPatterns: [
        "Enters when 7d volume up 3x+",
        "Cross-chain arb on same token narrative",
        "Exits when momentum stalls 2 days",
      ],
      confidenceScore: 0.82,
      riskScore: 7.8,
    },
  },
];

function scoreFor(
  wallet: string,
  window: Window,
  rank: number,
): EliteWallet["scores"][Window] {
  const baseRoi = { "30d": 0.42, "90d": 0.68, "180d": 0.91 }[window];
  const drawdown = 0.08 + rank * 0.015;
  const roi = baseRoi - rank * 0.04;
  const riskAdjRoi = roi / Math.max(drawdown, 0.01);

  return {
    wallet,
    window,
    roi,
    maxDrawdown: drawdown,
    riskAdjRoi,
    winRate: 0.72 - rank * 0.03,
    avgWinnerGain: 0.38 - rank * 0.04,
    percentile: 99.5 - rank * 0.1,
    tradeCount: { "30d": 14, "90d": 38, "180d": 71 }[window],
    volumeUsd: { "30d": 42000, "90d": 128000, "180d": 245000 }[window],
  };
}

function equityFor(window: Window, rank: number): EquityPoint[] {
  const points = window === "30d" ? 6 : window === "90d" ? 9 : 12;
  const target = { "30d": 0.28, "90d": 0.55, "180d": 0.82 }[window] - rank * 0.06;
  const dip = 0.04 + rank * 0.01;

  return Array.from({ length: points }, (_, i) => {
    const t = i / (points - 1);
    const wave = Math.sin(t * Math.PI * 1.5) * dip;
    const cumulativePnlPct = target * t + wave * (1 - t);
    const days = window === "30d" ? 30 : window === "90d" ? 90 : 180;
    const d = new Date();
    d.setDate(d.getDate() - days + Math.round(t * days));
    return {
      date: d.toISOString().slice(0, 10),
      cumulativePnlPct: Math.max(-0.05, cumulativePnlPct),
    };
  });
}

export const eliteWallets: EliteWallet[] = WALLETS.map((w, i) => ({
  ...w,
  strategy: { ...w.strategy, wallet: w.address },
  scores: {
    "30d": scoreFor(w.address, "30d", i),
    "90d": scoreFor(w.address, "90d", i),
    "180d": scoreFor(w.address, "180d", i),
  },
  equityCurve: {
    "30d": equityFor("30d", i),
    "90d": equityFor("90d", i),
    "180d": equityFor("180d", i),
  },
}));

export function getWallet(address: string): EliteWallet | undefined {
  return eliteWallets.find(
    (w) => w.address.toLowerCase() === address.toLowerCase(),
  );
}

export function getLeaderboard(window: Window = "90d"): EliteWallet[] {
  return [...eliteWallets].sort(
    (a, b) => b.scores[window].riskAdjRoi - a.scores[window].riskAdjRoi,
  );
}

export const chainLabels: Record<Chain, string> = {
  ethereum: "Ethereum",
  base: "Base",
  arbitrum: "Arbitrum",
  polygon: "Polygon",
  unichain: "Unichain",
  linea: "Linea",
  blast: "Blast",
  optimism: "Optimism",
  bsc: "BSC",
  avalanche: "Avalanche",
  scroll: "Scroll",
};

/** Fallback homepage stats when the daily indexer has not run yet. */
export const siteStats = {
  walletsTracked: 0,
  eliteCount: 0,
  avgRiskAdjRoi: 0,
  mirrorsActive: 0,
};