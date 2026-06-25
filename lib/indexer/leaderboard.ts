import { getLeaderboard as getSeedLeaderboard, getWallet as getSeedWallet } from "@/lib/seed-data";
import type { EliteWallet, Window } from "@/lib/types";
import { enrichWallet, type WalletEnrichment } from "./enrich";
import {
  getLeaderboardMeta,
  getStoredEliteWallet,
  getStoredEliteWallets,
} from "./storage";

export interface EnrichedWallet extends EliteWallet {
  enrichment: WalletEnrichment;
}

export interface LeaderboardResponse {
  window: Window;
  source: "indexer-live" | "indexer-stub";
  pipeline: string[];
  enrichedAt: string;
  scoredAt: string | null;
  wallets: EnrichedWallet[];
}

async function resolveRankedWallets(window: Window): Promise<{
  wallets: EliteWallet[];
  source: "indexer-live" | "indexer-stub";
  pipeline: string[];
  scoredAt: string | null;
}> {
  const meta = await getLeaderboardMeta();
  const stored = await getStoredEliteWallets(window);

  if (meta?.source === "indexer-live") {
    return {
      wallets: stored,
      source: "indexer-live",
      pipeline: meta.pipeline ?? [
        "rpc-router-discovery",
        "etherscan-router-discovery",
        "tokentx-score",
        "roi-rank",
        "top-20-roi",
        "rpc-enrich",
      ],
      scoredAt: meta.scoredAt,
    };
  }

  if (stored.length > 0) {
    return {
      wallets: stored,
      source: "indexer-live",
      pipeline: ["kv-rank", "rpc-enrich"],
      scoredAt: meta?.scoredAt ?? null,
    };
  }

  return {
    wallets: getSeedLeaderboard(window),
    source: "indexer-stub",
    pipeline: ["seed-rank (dev-fallback)", "rpc-enrich"],
    scoredAt: null,
  };
}

export async function getLeaderboardFromIndexer(
  window: Window = "90d",
): Promise<LeaderboardResponse> {
  const { wallets, source, pipeline, scoredAt } = await resolveRankedWallets(window);

  const enriched = await Promise.all(
    wallets.map(async (wallet) => {
      const enrichment = await enrichWallet(wallet.address, wallet.chainsActive);
      return { ...wallet, enrichment };
    }),
  );

  return {
    window,
    source,
    pipeline: [...pipeline, "rpc-enrich (per-request)"],
    enrichedAt: new Date().toISOString(),
    scoredAt,
    wallets: enriched,
  };
}

export async function getWalletFromIndexer(
  address: string,
): Promise<EnrichedWallet | undefined> {
  const stored = await getStoredEliteWallet(address);
  const wallet = stored ?? getSeedWallet(address);
  if (!wallet) return undefined;

  const enrichment = await enrichWallet(wallet.address, wallet.chainsActive);
  return { ...wallet, enrichment };
}