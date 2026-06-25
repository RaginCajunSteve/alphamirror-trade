/**
 * Daily leaderboard indexer — discovers wallets, scores risk-adj ROI, stores elite rankings in KV.
 * Deploy: npm run deploy:indexer
 * Full local run (host): npm run indexer:run:remote
 */

import { etherscanApiKey } from "./etherscan-client.mjs";
import {
  candidatesFromMirrors,
  discoverFromRouters,
  expandViaCounterparties,
  mergeCandidates,
} from "./indexer/discover.mjs";
import {
  baseIndexingAvailable,
  getWalletTokenTransfers,
  indexerDataStack,
} from "./indexer/transfer-fetch.mjs";
import {
  alchemyChainReady,
  alchemyReadyChains,
  alchemyTransfersAvailable,
} from "./indexer/alchemy-tokentx.mjs";
import { ALCHEMY_PRIMARY_CHAINS, WATCH_CHAINS } from "./indexer/routers.mjs";
import {
  BASE_RANK_BOOST,
  EXECUTION_CHAIN,
  LEADERBOARD_CHAIN_QUOTAS,
  NON_EXECUTION_RANK_PENALTY,
  MIN_CLOSED_TRADES,
  MIN_VOLUME_USD,
  MIN_WIN_RATE,
  qualifiesBase,
  qualifiesLeaderboard,
  sampleDiverseCandidates,
  selectTopWithQuotas,
  TOP_LEADERBOARD_SIZE,
} from "./indexer/elite-criteria.mjs";
import { scoreWalletAllWindows } from "./indexer/score-wallet.mjs";
import { inferStrategy } from "./indexer/strategy.mjs";
import {
  assertSpendApproved,
  isCostBaselineLocked,
  isSpendApproved,
} from "./ops/cost-policy.mjs";
import {
  envWithKvApprovals,
  getKvApprovedCategories,
  reportCostBarrier,
} from "./ops/cost-approvals.mjs";

const DEFAULT_WATCH_CHAINS = WATCH_CHAINS;
/** Sunday 00:00 UTC (six-hourly cron) — refresh Base candidates via RPC router crawl. */
function isWeeklyDiscoverySlot() {
  const now = new Date();
  return now.getUTCDay() === 0 && now.getUTCHours() === 0;
}

function watchChains(env) {
  const raw = env.INDEXER_WATCH_CHAINS?.trim();
  let chains = raw
    ? raw.split(",").map((c) => c.trim()).filter(Boolean)
    : [...DEFAULT_WATCH_CHAINS];

  const scoreOnly =
    env.INDEXER_SCORE_ONLY === "1" || env.INDEXER_SCORE_ONLY === "true";
  for (const chain of ALCHEMY_PRIMARY_CHAINS) {
    const include =
      chain === "base"
        ? env.INDEXER_INCLUDE_BASE === "1" ||
          env.INDEXER_INCLUDE_BASE === "true" ||
          (!scoreOnly || baseIndexingAvailable(env))
        : alchemyTransfersAvailable(env, chain);
    if (include && !chains.includes(chain)) {
      chains = [...chains, chain];
    }
  }
  return chains;
}

const WINDOWS = ["30d", "90d", "180d"];

const KV_META = "leaderboard-meta.json";
const KV_ELITE = "leaderboard-elite.json";
const KV_CANDIDATES = "leaderboard-candidates.json";

function enforceCostPolicy(env, { discoverOnly = false, hunt = false, scoreOnly = false } = {}) {
  if (hunt && !isSpendApproved("indexer-hunt", env)) {
    assertSpendApproved("indexer-hunt", env);
  }
  if (discoverOnly && !isSpendApproved("indexer-discovery", env)) {
    assertSpendApproved("indexer-discovery", env);
  }
  if (!discoverOnly && !scoreOnly && !hunt && !isSpendApproved("indexer-full", env)) {
    assertSpendApproved("indexer-full", env);
  }
}

async function indexerLimits(env) {
  const local = env.INDEXER_LOCAL === "1" || env.INDEXER_LOCAL === "true";
  let hunt =
    env.INDEXER_WINRATE_HUNT === "1" || env.INDEXER_WINRATE_HUNT === "true";
  let scoreOnly =
    env.INDEXER_SCORE_ONLY === "1" || env.INDEXER_SCORE_ONLY === "true";

  if (isCostBaselineLocked(env)) {
    if (hunt && !isSpendApproved("indexer-hunt", env)) hunt = false;
    if (!scoreOnly && !isSpendApproved("indexer-full", env)) scoreOnly = true;
  }

  const skipRpcChains = await alchemyReadyChains(env, ALCHEMY_PRIMARY_CHAINS);
  const hasAlchemy = skipRpcChains.length > 0;

  if (scoreOnly && !hunt) {
    return {
      local,
      hunt: false,
      scoreOnly: true,
      maxCandidates: local ? 220 : 120,
      maxTokenTxPages: local ? 4 : 4,
      scoreDelayMs: hasAlchemy ? 300 : 450,
      concurrency: 1,
      transferLimit: local ? 200 : 180,
      etherscanPageDelayMs: 400,
      skipRpcChains,
      rpcMaxChunks: { base: 24 },
    };
  }

  return {
    local,
    hunt,
    scoreOnly: false,
    maxCandidates: hunt ? 400 : local ? 220 : 100,
    maxTokenTxPages: hunt ? 6 : local ? 4 : 2,
    scoreDelayMs: hunt ? 350 : local ? 450 : 500,
    concurrency: hunt ? 2 : local ? 2 : 1,
    transferLimit: hunt ? 280 : local ? 200 : 140,
    etherscanPageDelayMs: 0,
    skipRpcChains,
    rpcMaxChunks: {
      base: (await alchemyChainReady(env, "base")) ? 0 : hunt ? 1000 : local ? 1000 : 450,
      ethereum: hunt ? 30 : 30,
      arbitrum: hunt ? 50 : 50,
    },
  };
}

async function kvGet(kv, key, fallback) {
  const row = await kv.get(key, "json");
  return row ?? fallback;
}

async function kvPut(kv, key, data) {
  await kv.put(key, JSON.stringify(data));
}

async function fetchWalletTransfers(env, address, chains, limits) {
  const transfers = [];
  for (const chain of chains) {
    const { rows, source } = await getWalletTokenTransfers(env, chain, address, limits);
    if (rows.length) {
      console.log(`transfers ${chain} ${address.slice(0, 10)}: ${rows.length} via ${source}`);
    }
    transfers.push(...rows);
  }
  return transfers;
}

function selectTopByRoi(scoredWallets, window) {
  return selectTopWithQuotas(scoredWallets, window, TOP_LEADERBOARD_SIZE);
}

function buildEliteByWindow(scoredWallets) {
  const byWindow = { "30d": [], "90d": [], "180d": [] };
  const addressSets = { "30d": new Set(), "90d": new Set(), "180d": new Set() };

  for (const window of WINDOWS) {
    const elite = selectTopByRoi(scoredWallets, window);
    byWindow[window] = elite;
    for (const w of elite) addressSets[window].add(w.address.toLowerCase());
  }

  const unionAddresses = new Set([
    ...addressSets["30d"],
    ...addressSets["90d"],
    ...addressSets["180d"],
  ]);

  const walletMap = new Map(scoredWallets.map((w) => [w.address.toLowerCase(), w]));

  return {
    byWindow,
    union: [...unionAddresses].map((addr) => walletMap.get(addr)).filter(Boolean),
  };
}

async function scoreCandidate(candidate, env, limits) {
  const allowed = watchChains(env);
  const chains = candidate.chains?.length
    ? candidate.chains.filter((c) => allowed.includes(c))
    : allowed;
  if (!chains.length) return { status: "skipped", reason: "no-chains" };
  let transfers;
  try {
    transfers = await fetchWalletTransfers(env, candidate.address, chains, limits);
  } catch (err) {
    console.warn(`score ${candidate.address.slice(0, 10)}: ${err.message}`);
    return { status: "skipped", reason: "fetch-error" };
  }
  if (limits.scoreDelayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, limits.scoreDelayMs));
  }
  if (!transfers.length) return { status: "skipped", reason: "no-transfers" };

  const { scores, equityCurve, chainsActive, closedTrades90d } = scoreWalletAllWindows(
    candidate.address,
    transfers,
  );

  const board90 = qualifiesLeaderboard(scores["90d"]);
  const board30 = qualifiesLeaderboard(scores["30d"]);
  const board180 = qualifiesLeaderboard(scores["180d"]);
  if (!board90 && !board30 && !board180) {
    const base90 = qualifiesBase(scores["90d"]);
    const base30 = qualifiesBase(scores["30d"]);
    const base180 = qualifiesBase(scores["180d"]);
    if (!base90 && !base30 && !base180) {
      return { status: "skipped", reason: "unqualified" };
    }
    return { status: "skipped", reason: "non-positive-roi" };
  }

  const strategy = inferStrategy(
    candidate.address,
    chainsActive.length ? chainsActive : chains,
    transfers,
    closedTrades90d,
  );

  return {
    status: "scored",
    wallet: {
      address: candidate.address,
      chainsActive: chainsActive.length ? chainsActive : chains,
      scores,
      strategy,
      equityCurve,
    },
  };
}

async function scoreCandidatesPool(candidates, env, limits) {
  const scoredWallets = [];
  let skipped = 0;
  let scored = 0;
  const queue = [...candidates];
  const workers = Array.from({ length: limits.concurrency }, async () => {
    while (queue.length) {
      const candidate = queue.shift();
      if (!candidate) break;
      const result = await scoreCandidate(candidate, env, limits);
      if (result.status === "scored") {
        scoredWallets.push(result.wallet);
        scored++;
      } else {
        skipped++;
      }
    }
  });
  await Promise.all(workers);
  return { scoredWallets, scored, skipped };
}

/** Weekly Base RPC router crawl — refreshes candidates without full hunt/score. */
export async function runDiscoveryOnly(kv, env) {
  enforceCostPolicy(env, { discoverOnly: true });
  if (!kv) throw new Error("DATA_KV binding required");

  const [mirrors, prevCandidates] = await Promise.all([
    kvGet(kv, "mirrors.json", []),
    kvGet(kv, KV_CANDIDATES, []),
  ]);

  const local = env.INDEXER_LOCAL === "1" || env.INDEXER_LOCAL === "true";
  const perRouter = local ? 80 : 60;
  const alchemyChains = await alchemyReadyChains(env, ALCHEMY_PRIMARY_CHAINS);
  const discoveryMode =
    alchemyChains.length > 0
      ? `etherscan+alchemy:${alchemyChains.join(",")}`
      : "etherscan+rpc-base-crawl";
  console.log(`discovery-only mode (${discoveryMode}, perRouter=${perRouter})`);

  const discovered = await discoverFromRouters(env, perRouter);
  const fromMirrors = candidatesFromMirrors(mirrors);
  const candidates = sampleDiverseCandidates(
    mergeCandidates(prevCandidates, fromMirrors, discovered),
    local ? 500 : 400,
  );

  const baseCount = candidates.filter((c) => c.chains?.includes("base")).length;
  await kvPut(kv, KV_CANDIDATES, candidates);
  console.log(
    `discovery-only complete: ${candidates.length} candidates (${baseCount} with base, ` +
      `discovered=${discovered.length})`,
  );

  return {
    mode: "discovery-only",
    candidates: candidates.length,
    baseCandidates: baseCount,
    discovered: discovered.length,
    at: new Date().toISOString(),
  };
}

export async function runLeaderboardIndexer(kv, env) {
  const startedAt = new Date().toISOString();
  const limits = await indexerLimits(env);
  enforceCostPolicy(env, {
    hunt: limits.hunt,
    scoreOnly: limits.scoreOnly,
  });
  if (!kv) throw new Error("DATA_KV binding required");
  const dataStack = indexerDataStack(env);
  console.log(`indexer data-stack: ${JSON.stringify(dataStack)}`);

  if (!etherscanApiKey(env)) {
    console.warn("ETHERSCAN_API_KEY missing — Ethereum/Arbitrum discovery degraded");
  }
  if (!baseIndexingAvailable(env)) {
    console.warn(
      "Base indexing unavailable — add ALCHEMY_API_KEY (free tier) for Base scoring/discovery",
    );
  }

  const [mirrors, prevCandidates] = await Promise.all([
    kvGet(kv, "mirrors.json", []),
    kvGet(kv, KV_CANDIDATES, []),
  ]);

  const scoreOnly = limits.scoreOnly;
  const modeLabel = limits.hunt
    ? "winrate-hunt"
    : scoreOnly
      ? limits.local
        ? "local-score-only"
        : "worker-score-only"
      : limits.local
        ? "local-full"
        : "worker-daily";
  console.log(
    `indexer mode=${modeLabel} candidates≤${limits.maxCandidates} minWinRate=${MIN_WIN_RATE}`,
  );

  const SEED_PLACEHOLDER_ADDRESSES = new Set([
    "0x7a3f8c2e1b9d4a6f0e8c5b2d1a9f7e4c3b8a6d5e",
    "0x2b9e4f1a8c7d6e5f3a2b1c0d9e8f7a6b5c4d3e2f",
    "0x9c1d5e7f2a4b6c8d0e2f4a6b8c0d2e4f6a8b0c2d",
    "0x4e8a2c6f0b1d3e5a7c9b2d4f6a8c0e2b4d6f8a0c",
    "0x1f3a5c7e9b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a",
  ]);

  let candidates;
  if (scoreOnly) {
    const allowed = watchChains(env);
    const filtered = prevCandidates.filter((row) => {
      if (SEED_PLACEHOLDER_ADDRESSES.has(row.address.toLowerCase())) return false;
      return row.chains?.some((c) => allowed.includes(c));
    });
    console.log(
      `score-only mode — skipping discovery, ${filtered.length}/${prevCandidates.length} candidates ` +
        `(chains: ${allowed.join(",")}, baseIndexing=${baseIndexingAvailable(env)})`,
    );
    candidates = sampleDiverseCandidates(filtered, limits.maxCandidates);
  } else {
    const perRouter = limits.hunt ? 120 : limits.local ? 80 : 45;
    const discovered = await discoverFromRouters(env, perRouter);
    const fromMirrors = candidatesFromMirrors(mirrors);
    const merged = mergeCandidates(prevCandidates, fromMirrors, discovered);

    const seedCap = limits.hunt ? 100 : limits.local ? 60 : 35;
    const expandCap = limits.hunt ? 320 : limits.local ? 200 : 100;
    const topSeeds = [...merged]
      .sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0))
      .slice(0, seedCap);
    const expanded = await expandViaCounterparties(env, topSeeds, expandCap);
    candidates = sampleDiverseCandidates(
      mergeCandidates(merged, expanded),
      limits.maxCandidates,
    );
  }

  const { scoredWallets, scored, skipped } = await scoreCandidatesPool(candidates, env, limits);
  const { byWindow, union } = buildEliteByWindow(scoredWallets);

  const eliteCount = union.length;
  const avgRiskAdjRoi =
    byWindow["90d"].length > 0
      ? byWindow["90d"].reduce((s, w) => s + w.scores["90d"].riskAdjRoi, 0) /
        byWindow["90d"].length
      : 0;

  const meta = {
    scoredAt: new Date().toISOString(),
    startedAt,
    walletsTracked: candidates.length,
    walletsScored: scored,
    walletsSkipped: skipped,
    eliteCount,
    eliteByWindow: {
      "30d": byWindow["30d"].length,
      "90d": byWindow["90d"].length,
      "180d": byWindow["180d"].length,
    },
    avgRiskAdjRoi: Math.round(avgRiskAdjRoi * 100) / 100,
    source: "indexer-live",
    pipeline: [
      dataStack.baseDiscovery,
      "etherscan-router-discovery",
      "mirror-seeds",
      "candidate:stratified-chain-shares",
      "score:multi-chain",
      `rank:${EXECUTION_CHAIN}-weighted-roi×${BASE_RANK_BOOST}`,
      `rank:non-exec-penalty×${NON_EXECUTION_RANK_PENALTY}`,
      "rank:per-chain-quotas",
      `top-${TOP_LEADERBOARD_SIZE}-quota-balanced`,
      `min-trades≥${MIN_CLOSED_TRADES}`,
      `min-volume≥$${MIN_VOLUME_USD}`,
    ],
    executionChain: EXECUTION_CHAIN,
    baseRankBoost: BASE_RANK_BOOST,
    chainQuotas: LEADERBOARD_CHAIN_QUOTAS,
    dataStack,
    minClosedTrades: MIN_CLOSED_TRADES,
    minVolumeUsd: MIN_VOLUME_USD,
    minWinRate: MIN_WIN_RATE,
    indexerMode: modeLabel,
  };

  const elitePayload = {
    scoredAt: meta.scoredAt,
    byWindow,
    wallets: union,
  };

  await Promise.all([
    kvPut(kv, KV_META, meta),
    kvPut(kv, KV_ELITE, elitePayload),
    kvPut(kv, KV_CANDIDATES, candidates),
  ]);

  console.log(
    `leaderboard-indexer candidates=${candidates.length} scored=${scored} elite=${eliteCount} ` +
      `(30d=${byWindow["30d"].length} 90d=${byWindow["90d"].length} 180d=${byWindow["180d"].length})`,
  );
  if (eliteCount === 0) {
    console.warn(
      `No wallets met ROI leaderboard bar (≥${MIN_CLOSED_TRADES} trades, ≥$${MIN_VOLUME_USD} volume, roi>0)`,
    );
  }

  return meta;
}

export default {
  async scheduled(event, env, ctx) {
    const kv = env.DATA_KV;
    if (!kv) return;
    const kvApproved = await getKvApprovedCategories(kv);
    const costEnv = envWithKvApprovals(env, kvApproved);
    const discoveryApproved = isSpendApproved("indexer-discovery", costEnv);
    const discoverOnly =
      (isWeeklyDiscoverySlot() && discoveryApproved) ||
      ((env.INDEXER_DISCOVER_ONLY === "1" || env.INDEXER_DISCOVER_ONLY === "true") &&
        discoveryApproved);
    if (isWeeklyDiscoverySlot() && !discoveryApproved) {
      console.log(
        "cost-policy: skipping weekly discovery — approval email sent to owner if not already queued",
      );
      await reportCostBarrier(kv, {
        category: "indexer-discovery",
        summary:
          "Weekly candidate discovery was skipped to stay within the ~$2–10/mo spend baseline. Approving unlocks router crawls that refresh the leaderboard candidate pool.",
        source: "indexer-cron:weekly-discovery",
      });
    }
    const job = discoverOnly
      ? runDiscoveryOnly(kv, costEnv)
      : runLeaderboardIndexer(kv, costEnv);
    ctx.waitUntil(
      job.catch((err) => {
        console.error(
          `${discoverOnly ? "discovery-only" : "leaderboard-indexer"} failed:`,
          err.message,
        );
      }),
    );
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/run" && request.method === "POST") {
      const token = request.headers.get("x-indexer-token");
      if (!env.INDEXER_RUN_TOKEN || token !== env.INDEXER_RUN_TOKEN) {
        return new Response("Unauthorized", { status: 401 });
      }
      try {
        const kvApproved = await getKvApprovedCategories(env.DATA_KV);
        const costEnv = envWithKvApprovals(env, kvApproved);
        const meta = await runLeaderboardIndexer(env.DATA_KV, costEnv);
        return Response.json({ ok: true, meta });
      } catch (err) {
        return Response.json({ ok: false, error: err.message }, { status: 500 });
      }
    }
    return new Response("alpha-wallet-indexer", { status: 200 });
  },
};