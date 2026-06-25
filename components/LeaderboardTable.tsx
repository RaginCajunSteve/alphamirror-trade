import Link from "next/link";
import type { EnrichedWallet } from "@/lib/indexer/leaderboard";
import type { EliteWallet, Window } from "@/lib/types";
import { formatAddress, formatPct } from "@/lib/scoring";
import { chainLabels } from "@/lib/seed-data";

type RowWallet = EliteWallet | EnrichedWallet;

function isEnriched(w: RowWallet): w is EnrichedWallet {
  return "enrichment" in w;
}

export function LeaderboardTable({
  wallets,
  window,
}: {
  wallets: RowWallet[];
  window: Window;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[800px] text-left text-sm">
        <thead className="border-b border-border bg-surface-2 text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">#</th>
            <th className="px-4 py-3 font-medium">Wallet</th>
            <th className="px-4 py-3 font-medium">Strategy</th>
            <th className="px-4 py-3 font-medium">ROI</th>
            <th className="px-4 py-3 font-medium">Win rate</th>
            <th className="px-4 py-3 font-medium">DEX / moves</th>
            <th className="px-4 py-3 font-medium">Chains</th>
            <th className="px-4 py-3 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {wallets.map((wallet, i) => {
            const score = wallet.scores[window];
            const txLabel = isEnriched(wallet)
              ? wallet.enrichment.dexSwapCount > 0
                ? `${wallet.enrichment.dexSwapCount} swaps`
                : wallet.enrichment.recentTransferCount > 0
                  ? `${wallet.enrichment.recentTransferCount} moves`
                  : wallet.enrichment.swapErrors.length > 0
                    ? "RPC limited"
                    : wallet.enrichment.live
                      ? wallet.enrichment.totalTxCount > 0
                        ? `${wallet.enrichment.totalTxCount.toLocaleString()} txs`
                        : "0 activity"
                      : "—"
              : "—";
            return (
              <tr
                key={wallet.address}
                className="border-b border-border/50 hover:bg-surface-2/50 transition-colors"
              >
                <td className="px-4 py-3 text-muted">{i + 1}</td>
                <td className="px-4 py-3 font-mono">
                  <Link
                    href={`/wallet/${wallet.address}`}
                    className="text-accent hover:underline"
                  >
                    {formatAddress(wallet.address)}
                  </Link>
                </td>
                <td className="px-4 py-3">{wallet.strategy.archetype}</td>
                <td className="px-4 py-3 font-medium text-accent">
                  {score.roi.toFixed(2)}x
                </td>
                <td className="px-4 py-3">{formatPct(score.winRate)}</td>
                <td className="px-4 py-3 text-muted">{txLabel}</td>
                <td className="px-4 py-3 text-muted">
                  {wallet.chainsActive.map((c) => chainLabels[c]).join(", ")}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/copy/${wallet.address}`}
                    className="rounded-lg border border-accent/40 px-3 py-1 text-xs text-accent hover:bg-accent/10"
                  >
                    Copy
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}