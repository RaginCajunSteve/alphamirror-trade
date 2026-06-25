import type { Window } from "@/lib/types";

export const WINDOW_DAYS: Record<Window, number> = {
  "30d": 30,
  "90d": 90,
  "180d": 180,
};

export const MIN_WIN_RATE = 0.75;
export const MIN_CLOSED_TRADES = 5;
export const MIN_VOLUME_USD = 100;
export const ELITE_PERCENTILE = 0.005;
export const MAX_ELITE_PER_WINDOW = 100;
export const TOP_LEADERBOARD_SIZE = 20;
export const MAX_CANDIDATES_PER_RUN = 400;
export const MAX_TOKEN_TX_PAGES = 3;
export const TOKEN_TX_PAGE_SIZE = 100;

export const LEADERBOARD_KV_KEYS = {
  meta: "leaderboard-meta.json",
  elite: "leaderboard-elite.json",
  candidates: "leaderboard-candidates.json",
} as const;