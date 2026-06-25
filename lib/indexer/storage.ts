import { readDataJson } from "@/lib/data-adapter";
import type { EliteWallet, Window } from "@/lib/types";
import { LEADERBOARD_KV_KEYS } from "./constants";

export interface LeaderboardMeta {
  scoredAt: string;
  startedAt?: string;
  walletsTracked: number;
  walletsScored?: number;
  walletsSkipped?: number;
  eliteCount: number;
  eliteByWindow?: Record<Window, number>;
  avgRiskAdjRoi: number;
  source: "indexer-live" | "indexer-stub";
  pipeline?: string[];
  minClosedTrades?: number;
  minVolumeUsd?: number;
}

export interface LeaderboardEliteStore {
  scoredAt: string;
  byWindow: Record<Window, EliteWallet[]>;
  wallets: EliteWallet[];
}

export async function getLeaderboardMeta(): Promise<LeaderboardMeta | null> {
  return readDataJson<LeaderboardMeta | null>(LEADERBOARD_KV_KEYS.meta, null);
}

export async function getLeaderboardEliteStore(): Promise<LeaderboardEliteStore | null> {
  return readDataJson<LeaderboardEliteStore | null>(LEADERBOARD_KV_KEYS.elite, null);
}

export async function getStoredEliteWallets(window: Window): Promise<EliteWallet[]> {
  const store = await getLeaderboardEliteStore();
  if (!store) return [];
  return store.byWindow[window] ?? [];
}

export async function getStoredEliteWallet(address: string): Promise<EliteWallet | null> {
  const store = await getLeaderboardEliteStore();
  if (!store) return null;
  const lower = address.toLowerCase();
  return store.wallets.find((w) => w.address.toLowerCase() === lower) ?? null;
}