"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { IndexerBadge } from "@/components/IndexerBadge";
import { MIN_VOLUME_USD } from "@/lib/indexer/constants";
import type { Window } from "@/lib/types";
import type { LeaderboardResponse } from "@/lib/indexer/leaderboard";

const windows: Window[] = ["30d", "90d", "180d"];
const API_BASE =
  (typeof window !== "undefined" &&
    ((window as unknown) as { __NEXT_DATA__?: { env?: { NEXT_PUBLIC_API_BASE?: string } } }).__NEXT_DATA__?.env?.NEXT_PUBLIC_API_BASE) ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "";

async function fetchLeaderboard(window: Window): Promise<LeaderboardResponse> {
  const url = API_BASE ? `${API_BASE.replace(/\/$/, "")}/api/leaderboard?window=${window}` : `/api/leaderboard?window=${window}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load leaderboard");
  return res.json();
}

export default function LeaderboardPage() {
  const [currentWindow, setCurrentWindow] = useState<Window>("90d");
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Read from URL on mount (supports direct links with ?window=)
    const params = new URLSearchParams(((globalThis as unknown) as { location?: { search?: string } }).location?.search || "");
    const raw = params.get("window") as Window | null;
    const initial = windows.includes(raw as Window) ? (raw as Window) : "90d";
    setCurrentWindow(initial);

    setLoading(true);
    fetchLeaderboard(initial)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const changeWindow = (w: Window) => {
    setCurrentWindow(w);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("window", w);
      window.history.replaceState({}, "", url.toString());
    }

    setLoading(true);
    fetchLeaderboard(w)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Top ROI leaderboard</h1>
        <p className="mt-2 text-muted">
          Top 20 live wallets by return on investment. Requires ≥5 closed USD-denominated
          trades, ≥${MIN_VOLUME_USD} volume, and positive ROI in the selected window.
        </p>
        <p className="mt-1 text-sm text-accent">
          Solana &amp; BSC elites can be mirrored instantly for free (client-side Jupiter / Pancake). 
          Connect wallet on the <Link href="/dashboard" className="underline">dashboard</Link> to see pending mirrors. 
          Use support chat to request more Solana wallets be tracked.
        </p>
      </div>

      {data && (
        <IndexerBadge
          source={data.source}
          live={data.wallets.some((w) => w.enrichment?.live)}
          enrichedAt={data.enrichedAt}
          scoredAt={data.scoredAt}
        />
      )}

      <div className="flex gap-2">
        {windows.map((w) => (
          <button
            key={w}
            onClick={() => changeWindow(w)}
            className={`rounded-lg border px-4 py-2 text-sm ${
              currentWindow === w
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {w}
          </button>
        ))}
      </div>

      {loading && <div className="p-8 text-center text-muted">Loading leaderboard…</div>}
      {error && <div className="p-4 text-red-600 border border-red-500/30 rounded">Error loading data: {error}. Is NEXT_PUBLIC_API_BASE set?</div>}

      {!loading && data && data.wallets.length === 0 && (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center">
          <p className="text-lg font-medium">No qualifying wallets yet</p>
          <p className="mt-2 text-sm text-muted">
            The indexer scans hundreds of live traders daily. Wallets need measurable
            stable/WETH/BTC round-trips with positive ROI — no seed data, no filler.
          </p>
          {data.scoredAt && (
            <p className="mt-4 text-xs text-muted">
              Last scan: {new Date(data.scoredAt).toUTCString()}
            </p>
          )}
        </div>
      )}

      {!loading && data && data.wallets.length > 0 && (
        <LeaderboardTable wallets={data.wallets} window={currentWindow} />
      )}
    </div>
  );
}