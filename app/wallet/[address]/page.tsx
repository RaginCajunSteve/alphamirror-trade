import Link from "next/link";
import { notFound } from "next/navigation";
import fs from "fs";
import path from "path";
import { EquityCurveChart } from "@/components/EquityCurveChart";
import { IndexerBadge } from "@/components/IndexerBadge";
import { StrategyPlaybook } from "@/components/StrategyPlaybook";
import { getLeaderboardFromIndexer, getWalletFromIndexer } from "@/lib/indexer/leaderboard";
import { formatAddress, formatPct } from "@/lib/scoring";
import type { Window } from "@/lib/types";

export async function generateStaticParams() {
  // Pre-render known elite + some candidate wallet pages for static export (GitHub Pages)
  // Falls back to empty (no pages) if data missing — pages will 404 at runtime if visited without params
  try {
    const dataDir = path.join(process.cwd(), "data");
    const eliteRaw = JSON.parse(fs.readFileSync(path.join(dataDir, "leaderboard-elite.json"), "utf8"));
    const candsRaw = JSON.parse(fs.readFileSync(path.join(dataDir, "leaderboard-candidates.json"), "utf8"));

    const eliteAddrs = (eliteRaw.wallets || eliteRaw || []).map((w: { address?: string }) => w.address).filter(Boolean) as string[];
    const candAddrs = (candsRaw.wallets || candsRaw || []).slice(0, 20).map((w: { address?: string }) => w.address).filter(Boolean) as string[];

    const all = Array.from(new Set([...eliteAddrs, ...candAddrs]));
    return all.map((address) => ({ address }));
  } catch {
    return [];
  }
}

export default async function WalletPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  const wallet = await getWalletFromIndexer(address);
  if (!wallet) notFound();

  const leaderboard = await getLeaderboardFromIndexer("90d");
  const score = wallet.scores["90d"];
  const windows: Window[] = ["30d", "90d", "180d"];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Elite wallet</p>
          <h1 className="mt-1 font-mono text-2xl font-bold">{formatAddress(wallet.address)}</h1>
          <p className="mt-2 text-muted">{wallet.strategy.archetype}</p>
        </div>
        <Link
          href={`/copy/${wallet.address}`}
          className="rounded-xl bg-accent px-5 py-2.5 font-medium text-accent-foreground hover:bg-accent/90"
        >
          Copy this strategy
        </Link>
      </div>

      <IndexerBadge
        source={leaderboard.source}
        live={wallet.enrichment.live}
        enrichedAt={leaderboard.enrichedAt}
        scoredAt={leaderboard.scoredAt}
      />

      <EquityCurveChart points={wallet.equityCurve["90d"]} window="90d" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {windows.map((w) => {
          const s = wallet.scores[w];
          return (
            <div key={w} className="rounded-xl border border-border bg-surface p-4">
              <p className="text-xs text-muted">{w} risk-adj ROI</p>
              <p className="mt-1 text-xl font-semibold text-accent">
                {s.riskAdjRoi.toFixed(2)}x
              </p>
              <p className="mt-1 text-xs text-muted">
                ROI {formatPct(s.roi)} · DD {formatPct(s.maxDrawdown)}
              </p>
            </div>
          );
        })}
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-muted">90d win rate</p>
          <p className="mt-1 text-xl font-semibold">{formatPct(score.winRate)}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-muted">Uniswap V3 swaps (RPC)</p>
          <p className="mt-1 text-xl font-semibold">
            {wallet.enrichment.live
              ? wallet.enrichment.dexSwapCount.toLocaleString()
              : "—"}
          </p>
        </div>
      </div>

      {wallet.enrichment.swapActivity.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm font-medium">Live indexer scan (ERC20 outbound)</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {wallet.enrichment.swapActivity.map((s) => (
              <span key={s.chain} className="rounded-lg border border-border px-3 py-1.5 text-xs">
                {s.chain}: {s.dexSwaps ?? 0} DEX swaps · {s.recentTransfers ?? 0} moves ·{" "}
                {s.blocksScanned.toLocaleString()} blocks
              </span>
            ))}
          </div>
        </div>
      )}

      <StrategyPlaybook strategy={wallet.strategy} />
    </div>
  );
}