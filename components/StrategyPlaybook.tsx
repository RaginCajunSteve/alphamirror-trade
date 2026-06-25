import type { Strategy } from "@/lib/types";
import { formatPct } from "@/lib/scoring";
import { chainLabels } from "@/lib/seed-data";
import type { Chain } from "@/lib/types";

export function StrategyPlaybook({ strategy }: { strategy: Strategy }) {
  const topChains = (Object.entries(strategy.chainWeights) as [Chain, number][])
    .sort((a, b) => b[1] - a[1])
    .filter(([, w]) => w > 0.05);

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Strategy playbook</p>
          <h3 className="mt-1 text-xl font-semibold">{strategy.archetype}</h3>
        </div>
        <div className="rounded-lg bg-surface-2 px-3 py-2 text-center">
          <p className="text-xs text-muted">Risk score</p>
          <p className="text-lg font-semibold">{strategy.riskScore}/10</p>
        </div>
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">Avg hold</dt>
          <dd className="mt-1 font-medium">{strategy.holdAvgDays} days</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Mcap preference</dt>
          <dd className="mt-1 font-medium">{strategy.mcapPreference}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Confidence</dt>
          <dd className="mt-1 font-medium">{formatPct(strategy.confidenceScore)}</dd>
        </div>
      </dl>

      <div className="mt-6">
        <p className="text-xs text-muted">Chain preference</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {topChains.map(([chain, weight]) => (
            <span
              key={chain}
              className="rounded-full border border-border px-3 py-1 text-xs"
            >
              {chainLabels[chain]} {formatPct(weight, 0)}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-xs text-muted">Patterns</p>
        <ul className="mt-2 space-y-2">
          {strategy.entryPatterns.map((pattern) => (
            <li key={pattern} className="flex gap-2 text-sm">
              <span className="text-accent">→</span>
              {pattern}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}