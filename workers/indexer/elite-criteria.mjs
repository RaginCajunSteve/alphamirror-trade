/** Elite wallet bar — product survival depends on provable high win rates. */
export const MIN_WIN_RATE = 0.75;
/** Relaxed from 10 / $1k — still requires ≥75% win rate for elite. */
export const MIN_CLOSED_TRADES = 5;
export const MIN_VOLUME_USD = 100;
export const ELITE_PERCENTILE = 0.005;
export const MAX_ELITE_PER_WINDOW = 100;
export const TOP_LEADERBOARD_SIZE = 20;

/** Live mirror execution chain — ranking favors wallets traders can copy on Base. */
export const EXECUTION_CHAIN = "base";
/** Multiplier applied to ROI/riskAdjRoi when wallet has Base activity. */
export const BASE_RANK_BOOST = 1.35;
/** Extra boost when Base dominates strategy chain weights (up to +25%). */
export const BASE_WEIGHT_BOOST_CAP = 0.25;
/** Penalty for chains with no live mirror execution (profit alignment). */
export const NON_EXECUTION_CHAINS = ["bsc"];
export const NON_EXECUTION_RANK_PENALTY = 0.72;

/**
 * Monetization-aligned leaderboard quotas (min floors + max caps per primary chain).
 * Tier A chains (polygon, avalanche, scroll) get room; BSC capped for profit alignment.
 */
export const LEADERBOARD_CHAIN_QUOTAS = {
  min: {
    base: 4,
    polygon: 2,
  },
  max: {
    base: 8,
    polygon: 4,
    bsc: 4,
    ethereum: 4,
    arbitrum: 4,
    optimism: 3,
    avalanche: 3,
    scroll: 3,
    unichain: 2,
    linea: 2,
    blast: 2,
  },
};

/** Stratified candidate sampling before scoring — avoids lastSeen-only BSC dominance. */
export const CANDIDATE_CHAIN_SHARES = {
  base: 0.22,
  polygon: 0.12,
  ethereum: 0.1,
  arbitrum: 0.1,
  optimism: 0.08,
  avalanche: 0.08,
  scroll: 0.08,
  bsc: 0.1,
  unichain: 0.04,
  linea: 0.04,
  blast: 0.04,
};

export function qualifiesBase(score) {
  if (!score) return false;
  return score.tradeCount >= MIN_CLOSED_TRADES && score.volumeUsd >= MIN_VOLUME_USD;
}

/** Must pass volume/trades AND ≥75% win rate on closed USD-denominated lots. */
export function qualifiesElite(score) {
  return qualifiesBase(score) && score.winRate >= MIN_WIN_RATE;
}

/** Rank: win rate first, then risk-adjusted ROI. */
export function compareEliteScores(a, b) {
  const wr = b.winRate - a.winRate;
  if (Math.abs(wr) > 0.001) return wr;
  return b.riskAdjRoi - a.riskAdjRoi;
}

/** Rank leaderboard by raw ROI, then risk-adjusted ROI as tiebreaker. */
export function compareRoiScores(a, b) {
  const roi = b.roi - a.roi;
  if (Math.abs(roi) > 0.0001) return roi;
  return b.riskAdjRoi - a.riskAdjRoi;
}

export function qualifiesLeaderboard(score) {
  return qualifiesBase(score) && score.roi > 0;
}

/** Dominant chain for quota counting — strategy weights, then chainsActive. */
export function walletPrimaryChain(wallet) {
  const weights = wallet.strategy?.chainWeights;
  if (weights) {
    const ranked = Object.entries(weights)
      .filter(([, w]) => w > 0)
      .sort((a, b) => b[1] - a[1]);
    if (ranked.length) return ranked[0][0];
  }
  const active = wallet.chainsActive ?? [];
  if (active.includes(EXECUTION_CHAIN)) return EXECUTION_CHAIN;
  return active[0] ?? EXECUTION_CHAIN;
}

/** Base-weighted ranking scores for monetization alignment (live mirrors on Base). */
export function leaderboardRankBoost(wallet) {
  const active = wallet.chainsActive ?? [];
  const baseWeight = wallet.strategy?.chainWeights?.[EXECUTION_CHAIN] ?? 0;
  const primary = walletPrimaryChain(wallet);
  let boost = 1;
  if (active.includes(EXECUTION_CHAIN)) boost *= BASE_RANK_BOOST;
  if (baseWeight > 0) {
    boost *= 1 + Math.min(baseWeight, 1) * BASE_WEIGHT_BOOST_CAP;
  }
  if (NON_EXECUTION_CHAINS.includes(primary)) boost *= NON_EXECUTION_RANK_PENALTY;
  return boost;
}

export function boostedLeaderboardMetrics(score, wallet) {
  const boost = leaderboardRankBoost(wallet);
  return {
    roi: score.roi * boost,
    riskAdjRoi: score.riskAdjRoi * boost,
    boost,
  };
}

/** Compare wallets for leaderboard selection (base-weighted ROI). */
export function compareLeaderboardRank(aWallet, aScore, bWallet, bScore) {
  const a = boostedLeaderboardMetrics(aScore, aWallet);
  const b = boostedLeaderboardMetrics(bScore, bWallet);
  const roi = b.roi - a.roi;
  if (Math.abs(roi) > 0.0001) return roi;
  return b.riskAdjRoi - a.riskAdjRoi;
}

function walletHasChain(wallet, chain) {
  return (
    wallet.chainsActive?.includes(chain) ||
    (wallet.strategy?.chainWeights?.[chain] ?? 0) > 0.05
  );
}

/**
 * Select top wallets with per-chain quotas: satisfy mins → fill by rank with max caps → backfill.
 */
export function selectTopWithQuotas(
  scoredWallets,
  window,
  size = TOP_LEADERBOARD_SIZE,
  quotas = LEADERBOARD_CHAIN_QUOTAS,
) {
  const qualified = scoredWallets
    .filter((w) => qualifiesLeaderboard(w.scores[window]))
    .sort((a, b) => compareLeaderboardRank(a, a.scores[window], b, b.scores[window]));

  const selected = [];
  const chainCounts = {};
  const used = new Set();

  const maxFor = (chain) => quotas.max[chain] ?? 2;
  const canAdd = (chain) => (chainCounts[chain] ?? 0) < maxFor(chain);

  const add = (wallet) => {
    const chain = walletPrimaryChain(wallet);
    selected.push(wallet);
    used.add(wallet.address.toLowerCase());
    chainCounts[chain] = (chainCounts[chain] ?? 0) + 1;
  };

  for (const [chain, min] of Object.entries(quotas.min ?? {})) {
    let need = min;
    for (const wallet of qualified) {
      if (need <= 0) break;
      const key = wallet.address.toLowerCase();
      if (used.has(key)) continue;
      if (!walletHasChain(wallet, chain)) continue;
      const primary = walletPrimaryChain(wallet);
      if (!canAdd(primary)) continue;
      add(wallet);
      need--;
    }
  }

  for (const wallet of qualified) {
    if (selected.length >= size) break;
    const key = wallet.address.toLowerCase();
    if (used.has(key)) continue;
    const primary = walletPrimaryChain(wallet);
    if (!canAdd(primary)) continue;
    add(wallet);
  }

  return selected.map((wallet, index) => ({
    ...wallet,
    scores: {
      ...wallet.scores,
      [window]: {
        ...wallet.scores[window],
        percentile:
          qualified.length > 1
            ? Math.round(100 - (index / (qualified.length - 1)) * 100)
            : 100,
      },
    },
  }));
}

/**
 * Stratified candidate pool — proportional chain shares, then lastSeen backfill.
 */
export function sampleDiverseCandidates(
  candidates,
  maxCandidates,
  shares = CANDIDATE_CHAIN_SHARES,
) {
  if (!candidates.length || maxCandidates <= 0) return [];

  const seen = new Set();
  const picked = [];
  const byChain = {};

  for (const candidate of candidates) {
    const chains = candidate.chains?.length ? candidate.chains : [EXECUTION_CHAIN];
    for (const chain of chains) {
      if (!byChain[chain]) byChain[chain] = [];
      byChain[chain].push(candidate);
    }
  }

  for (const chain of Object.keys(byChain)) {
    byChain[chain].sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0));
  }

  const chainKeys = Object.keys(shares);
  const allocations = {};
  let allocated = 0;
  for (const chain of chainKeys) {
    const n = Math.max(1, Math.floor((shares[chain] ?? 0.02) * maxCandidates));
    allocations[chain] = n;
    allocated += n;
  }
  if (allocated > maxCandidates) {
    const scale = maxCandidates / allocated;
    for (const chain of chainKeys) {
      allocations[chain] = Math.max(1, Math.floor(allocations[chain] * scale));
    }
  }

  for (const chain of chainKeys) {
    const bucket = byChain[chain] ?? [];
    let count = 0;
    for (const candidate of bucket) {
      if (count >= allocations[chain]) break;
      const key = candidate.address.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push(candidate);
      count++;
    }
  }

  const remainder = [...candidates]
    .sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0))
    .filter((c) => !seen.has(c.address.toLowerCase()));

  for (const candidate of remainder) {
    if (picked.length >= maxCandidates) break;
    seen.add(candidate.address.toLowerCase());
    picked.push(candidate);
  }

  return picked.slice(0, maxCandidates);
}