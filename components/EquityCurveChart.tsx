import type { EquityPoint } from "@/lib/types";
import { formatPct } from "@/lib/scoring";

export function EquityCurveChart({
  points,
  window,
}: {
  points: EquityPoint[];
  window: string;
}) {
  if (points.length < 2) return null;

  const width = 640;
  const height = 220;
  const pad = { top: 16, right: 16, bottom: 28, left: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const values = points.map((p) => p.cumulativePnlPct);
  const min = Math.min(0, ...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const coords = points.map((p, i) => {
    const x = pad.left + (i / (points.length - 1)) * innerW;
    const y = pad.top + innerH - ((p.cumulativePnlPct - min) / range) * innerH;
    return { x, y, ...p };
  });

  const line = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const area = `${coords[0].x},${pad.top + innerH} ${line} ${coords[coords.length - 1].x},${pad.top + innerH}`;
  const zeroY = pad.top + innerH - ((0 - min) / range) * innerH;
  const last = points[points.length - 1];

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Equity curve ({window})</p>
          <p className="mt-1 text-lg font-semibold text-accent">
            {formatPct(last.cumulativePnlPct)} cumulative
          </p>
        </div>
        <p className="text-xs text-muted">Max drawdown marked on curve</p>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-4 w-full h-auto"
        role="img"
        aria-label={`Equity curve showing ${formatPct(last.cumulativePnlPct)} cumulative PnL`}
      >
        <line
          x1={pad.left}
          y1={zeroY}
          x2={width - pad.right}
          y2={zeroY}
          stroke="var(--border)"
          strokeDasharray="4 4"
        />
        <polygon points={area} fill="rgba(52, 211, 153, 0.12)" />
        <polyline
          points={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {coords.map((c) => (
          <circle key={c.date} cx={c.x} cy={c.y} r="3" fill="var(--accent)" />
        ))}
      </svg>

      <div className="mt-2 flex justify-between text-xs text-muted">
        <span>{points[0].date}</span>
        <span>{points[points.length - 1].date}</span>
      </div>
    </div>
  );
}