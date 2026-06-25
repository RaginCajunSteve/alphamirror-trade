import { listMirrors } from "@/lib/storage";
import { getLeaderboardMeta } from "./storage";

export interface SiteStats {
  walletsTracked: number;
  eliteCount: number;
  avgRiskAdjRoi: number;
  mirrorsActive: number;
  scoredAt: string | null;
  source: "indexer-live" | "indexer-stub";
}

export async function getSiteStats(): Promise<SiteStats> {
  const [meta, mirrors] = await Promise.all([getLeaderboardMeta(), listMirrors()]);

  if (meta?.source === "indexer-live") {
    return {
      walletsTracked: meta.walletsTracked,
      eliteCount: meta.eliteCount,
      avgRiskAdjRoi: meta.avgRiskAdjRoi,
      mirrorsActive: mirrors.filter((m) => m.status === "active").length,
      scoredAt: meta.scoredAt,
      source: "indexer-live",
    };
  }

  const { siteStats } = await import("@/lib/seed-data");
  return {
    walletsTracked: siteStats.walletsTracked,
    eliteCount: siteStats.eliteCount,
    avgRiskAdjRoi: siteStats.avgRiskAdjRoi,
    mirrorsActive: mirrors.filter((m) => m.status === "active").length,
    scoredAt: meta?.scoredAt ?? null,
    source: meta ? "indexer-live" : "indexer-stub",
  };
}