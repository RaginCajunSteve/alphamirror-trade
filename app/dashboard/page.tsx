"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import type { MirrorConfig, MirrorExecution, PlanId, Subscription } from "@/lib/types";
import { formatAddress } from "@/lib/scoring";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { UpgradeBanner } from "@/components/UpgradeBanner";
import { NetworkStatusBanner } from "@/components/NetworkStatusBanner";
import { UnifiedLiveMirrors } from "@/components/UnifiedLiveMirrors";
import {
  executionStatusHelp,
  keeperWatchChainsLabel,
  liveMirrorChainsLabel,
} from "@/lib/network-config";

interface QueueEntry {
  id: string;
  alphaWallet: string;
  chain: string;
  newTransfers: number;
  timestamp: string;
  status: string;
}

const KEEPER_POLL_MS = 120_000;

function executionsForMirrors(
  executions: MirrorExecution[],
  mirrors: MirrorConfig[],
): MirrorExecution[] {
  const alphaSet = new Set(mirrors.map((m) => m.alphaWallet.toLowerCase()));
  return executions.filter((e) => alphaSet.has(e.alphaWallet.toLowerCase()));
}

function dashboardStatusMessage(
  mirrors: MirrorConfig[],
  mirrorExecutions: MirrorExecution[],
  queue: QueueEntry[],
): string | null {
  if (mirrors.length === 0) return null;

  const activeLive = mirrors.filter((m) => m.status === "active" && m.mode === "live");
  const activePaper = mirrors.filter((m) => m.status === "active" && m.mode === "paper");
  const simulated = mirrorExecutions.filter((e) => e.status === "simulated").length;
  const onChain = mirrorExecutions.filter((e) => e.status === "executed").length;
  const failed = mirrorExecutions.filter((e) => e.status === "failed").length;
  const latestAt =
    mirrorExecutions.length > 0
      ? new Date(Math.max(...mirrorExecutions.map((e) => new Date(e.timestamp).getTime())))
      : null;

  const parts: string[] = [];

  if (activeLive.length > 0 && onChain === 0) {
    parts.push(
      `${activeLive.length} live mirror${activeLive.length === 1 ? "" : "s"} active — waiting for new alpha-wallet activity on ${keeperWatchChainsLabel()}. The keeper polls every 2 minutes; on-chain txs appear here once your mirrored wallets move.`,
    );
    if (queue.length > 0) {
      parts.push(
        `Watcher queue has ${queue.length} recent entr${queue.length === 1 ? "y" : "ies"} for your wallets.`,
      );
    }
    if (failed > 0) {
      parts.push(
        `${failed} recent live attempt${failed === 1 ? "" : "s"} failed on-chain — check USDC allowance and router approval.`,
      );
    }
  } else if (activePaper.length > 0 && simulated > 0) {
    parts.push(
      `You have ${simulated} simulated execution${simulated === 1 ? "" : "s"} — paper mode is working. Switch a mirror to live mode when you are ready for on-chain copies.`,
    );
  } else if (mirrorExecutions.length === 0 && queue.length === 0) {
    parts.push(
      `Mirrors are active but no executions yet. The watcher polls every 2 minutes on ${keeperWatchChainsLabel()} mainnet.`,
    );
  }

  if (latestAt) {
    parts.push(`Last execution for your current mirrors: ${latestAt.toLocaleString()}.`);
  }

  return parts.length > 0 ? parts.join(" ") : null;
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "executed":
      return "bg-accent/20 text-accent";
    case "failed":
      return "bg-red-500/20 text-red-400";
    case "pending_chain":
      return "bg-amber-500/20 text-amber-400";
    default:
      return "bg-surface-2 text-muted";
  }
}

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const [mirrors, setMirrors] = useState<MirrorConfig[]>([]);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [executions, setExecutions] = useState<MirrorExecution[]>([]);
  const [plan, setPlan] = useState<PlanId>("free");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [bulkBusy, setBulkBusy] = useState<"pause" | "remove" | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const refreshDashboard = useCallback(
    async (opts?: { initial?: boolean }) => {
      if (!address) return;
      if (opts?.initial) setLoading(true);
      else setRefreshing(true);
      try {
        const [mirrorData, queueData, execData, subData] = await Promise.all([
          fetch(`/api/mirrors?user=${address}`).then((r) => r.json()),
          fetch("/api/mirror-queue").then((r) => r.json()),
          fetch(`/api/executions?user=${address}`).then((r) => r.json()),
          fetch(`/api/subscriptions?user=${address}`).then((r) => r.json()),
        ]);
        if (opts?.initial) setSelectedIds(new Set());
        const nextMirrors: MirrorConfig[] = mirrorData.mirrors ?? [];
        const alphaSet = new Set(
          nextMirrors.map((m: MirrorConfig) => m.alphaWallet.toLowerCase()),
        );
        setMirrors(nextMirrors);
        setQueue(
          (queueData.queue ?? []).filter((q: QueueEntry) =>
            alphaSet.has(q.alphaWallet.toLowerCase()),
          ),
        );
        setExecutions(execData.executions ?? []);
        setPlan((subData.subscription as Subscription)?.plan ?? "free");
        setLastSyncedAt(new Date());
      } finally {
        if (opts?.initial) setLoading(false);
        else setRefreshing(false);
      }
    },
    [address],
  );

  useEffect(() => {
    if (!address) return;
    void refreshDashboard({ initial: true });
    const interval = window.setInterval(() => {
      void refreshDashboard();
    }, KEEPER_POLL_MS);
    return () => window.clearInterval(interval);
  }, [address, refreshDashboard]);

  async function updateStatus(id: string, status: "active" | "paused") {
    const mirror = mirrors.find((m) => m.id === id);
    if (!mirror || !address) return;
    const res = await fetch("/api/mirrors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...mirror, status, userAddress: address }),
    });
    if (res.ok) {
      const data = await res.json();
      setMirrors((prev) => prev.map((m) => (m.id === id ? data.mirror : m)));
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === mirrors.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(mirrors.map((m) => m.id)));
    }
  }

  function applyRemovedMirrors(removedIds: string[]) {
    const idSet = new Set(removedIds);
    const removedAlphas = new Set(
      mirrors
        .filter((m) => idSet.has(m.id))
        .map((m) => m.alphaWallet.toLowerCase()),
    );
    setMirrors((prev) => prev.filter((m) => !idSet.has(m.id)));
    setQueue((prev) =>
      prev.filter((q) => !removedAlphas.has(q.alphaWallet.toLowerCase())),
    );
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of removedIds) next.delete(id);
      return next;
    });
  }

  function liveRemoveNote(targets: MirrorConfig[]): string {
    const liveCount = targets.filter((m) => m.mode === "live").length;
    if (liveCount === 0) return "";
    return `\n\n${liveCount} live mirror${liveCount === 1 ? "" : "s"}: also revoke USDC allowance for the MirrorRouter in your wallet.`;
  }

  async function removeMirrorsById(ids: string[]) {
    if (!address || ids.length === 0) return;

    const targets = mirrors.filter((m) => ids.includes(m.id));
    const confirmed = window.confirm(
      `Remove ${targets.length} mirror${targets.length === 1 ? "" : "s"} permanently?\n\n` +
        "This deletes them from your dashboard and stops all future paper/live copies." +
        liveRemoveNote(targets),
    );
    if (!confirmed) return;

    setBulkBusy("remove");
    try {
      const res = await fetch("/api/mirrors", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAddress: address, ids }),
      });
      if (res.ok) {
        const data = await res.json();
        applyRemovedMirrors(data.removed ?? ids);
      }
    } finally {
      setBulkBusy(null);
    }
  }

  function applyStatusUpdates(updated: MirrorConfig[]) {
    const byId = new Map(updated.map((m) => [m.id, m]));
    setMirrors((prev) => prev.map((m) => byId.get(m.id) ?? m));
  }

  async function pauseMirrorsById(ids: string[]) {
    if (!address || ids.length === 0) return;

    setBulkBusy("pause");
    try {
      const res = await fetch("/api/mirrors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: address,
          ids,
          status: "paused",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        applyStatusUpdates(data.updated ?? []);
      }
    } finally {
      setBulkBusy(null);
    }
  }

  async function removeMirror(id: string) {
    await removeMirrorsById([id]);
  }

  async function removeSelected() {
    await removeMirrorsById([...selectedIds]);
  }

  async function pauseSelected() {
    const activeSelected = mirrors.filter(
      (m) => selectedIds.has(m.id) && m.status === "active",
    );
    if (activeSelected.length === 0) return;
    await pauseMirrorsById(activeSelected.map((m) => m.id));
  }

  const allSelected = mirrors.length > 0 && selectedIds.size === mirrors.length;
  const someSelected = selectedIds.size > 0;
  const selectedActiveCount = mirrors.filter(
    (m) => selectedIds.has(m.id) && m.status === "active",
  ).length;

  const mirrorExecutions = executionsForMirrors(executions, mirrors);
  const onChainCount = mirrorExecutions.filter((e) => e.status === "executed").length;
  const totalPnl = mirrorExecutions.reduce((s, e) => s + e.pnlUsd, 0);
  const totalFees = mirrorExecutions.reduce((s, e) => s + e.platformFeeUsd, 0);
  const activeMirrors = mirrors.filter((m) => m.status === "active").length;
  const statusMessage = dashboardStatusMessage(mirrors, mirrorExecutions, queue);

  if (!isConnected) {
    return (
      <div className="rounded-xl border border-border bg-surface p-8 text-center">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-4 text-muted">Connect your wallet to view active mirrors.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="mt-2 font-mono text-sm text-muted">{formatAddress(address!)}</p>
          {lastSyncedAt && (
            <p className="mt-1 text-xs text-muted">
              Synced {lastSyncedAt.toLocaleTimeString()} · auto-refresh every 2 min
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void refreshDashboard()}
          disabled={refreshing || loading}
          className="rounded-lg border border-border px-4 py-2 text-sm hover:border-accent/40 disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <NetworkStatusBanner showMigrationPlan />

      <UpgradeBanner plan={plan} />
      <DisclaimerBanner compact />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface p-4 text-center">
          <p className="text-2xl font-semibold">{activeMirrors}</p>
          <p className="mt-1 text-sm text-muted">Active mirrors</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 text-center">
          <p className={`text-2xl font-semibold ${totalPnl >= 0 ? "text-accent" : "text-red-400"}`}>
            {mirrorExecutions.length > 0 ? `${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}` : "—"}
          </p>
          <p className="mt-1 text-sm text-muted">Paper / simulated PnL</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 text-center">
          <p className="text-2xl font-semibold">{onChainCount}</p>
          <p className="mt-1 text-sm text-muted">On-chain executions</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 text-center">
          <p className="text-2xl font-semibold">${totalFees.toFixed(2)}</p>
          <p className="mt-1 text-sm text-muted">Platform fees (live)</p>
        </div>
      </div>

      {statusMessage && (
        <p className="text-sm text-muted rounded-lg border border-border/60 bg-surface px-4 py-3">
          {statusMessage}
        </p>
      )}

      {loading ? (
        <p className="text-muted">Loading mirrors...</p>
      ) : mirrors.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-muted">No mirrors yet.</p>
          <a href="/leaderboard" className="mt-4 inline-block text-accent hover:underline">
            Browse elite wallets →
          </a>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-border accent-accent"
              />
              {allSelected ? "Deselect all" : "Select all"}
              {someSelected && (
                <span className="text-foreground">({selectedIds.size} selected)</span>
              )}
            </label>
            {someSelected && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={pauseSelected}
                  disabled={bulkBusy !== null || selectedActiveCount === 0}
                  className="rounded-lg border border-border px-4 py-2 text-sm hover:border-amber-500/50 disabled:opacity-50"
                >
                  {bulkBusy === "pause"
                    ? "Pausing…"
                    : selectedActiveCount > 0
                      ? `Pause selected (${selectedActiveCount})`
                      : "Pause selected"}
                </button>
                <button
                  onClick={removeSelected}
                  disabled={bulkBusy !== null}
                  className="rounded-lg border border-red-500/40 px-4 py-2 text-sm text-red-400 hover:border-red-500/70 disabled:opacity-50"
                >
                  {bulkBusy === "remove"
                    ? "Removing…"
                    : `Remove selected (${selectedIds.size})`}
                </button>
              </div>
            )}
          </div>

          {mirrors.map((mirror) => (
            <div
              key={mirror.id}
              className={`rounded-xl border bg-surface p-5 ${
                selectedIds.has(mirror.id)
                  ? "border-accent/50 ring-1 ring-accent/20"
                  : "border-border"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(mirror.id)}
                    onChange={() => toggleSelected(mirror.id)}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-border accent-accent"
                    aria-label={`Select mirror ${formatAddress(mirror.alphaWallet)}`}
                  />
                <div>
                  <p className="text-sm text-muted">Mirroring</p>
                  <Link
                    href={`/wallet/${mirror.alphaWallet}`}
                    className="font-mono text-accent hover:underline"
                  >
                    {formatAddress(mirror.alphaWallet)}
                  </Link>
                  <p className="mt-2 text-sm text-muted">
                    {mirror.mode} · ${mirror.perTradeCapUsd}/trade · ${mirror.dailyCapUsd}/day ·{" "}
                    {mirror.userRatioPct}% size
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Watching: {mirror.allowedChains.join(", ")}
                    {mirror.mode === "live" &&
                      ` · live txs on ${liveMirrorChainsLabel(mirror.allowedChains)}`}
                  </p>
                </div>
                </label>
                <span
                  className={`rounded-full px-3 py-1 text-xs capitalize ${
                    mirror.status === "active"
                      ? "bg-accent/20 text-accent"
                      : "bg-surface-2 text-muted"
                  }`}
                >
                  {mirror.status}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/wallet/${mirror.alphaWallet}`}
                  className="rounded-lg border border-accent/40 px-4 py-2 text-sm text-accent hover:bg-accent/10"
                >
                  View wallet
                </Link>
                <Link
                  href={`/copy/${mirror.alphaWallet}`}
                  className="rounded-lg border border-border px-4 py-2 text-sm hover:border-accent/40"
                >
                  Edit settings
                </Link>
                {mirror.status === "active" ? (
                  <button
                    onClick={() => updateStatus(mirror.id, "paused")}
                    className="rounded-lg border border-border px-4 py-2 text-sm hover:border-amber-500/50"
                  >
                    Pause
                  </button>
                ) : (
                  <button
                    onClick={() => updateStatus(mirror.id, "active")}
                    className="rounded-lg border border-accent/40 px-4 py-2 text-sm text-accent"
                  >
                    Resume
                  </button>
                )}
                <button
                  onClick={() => removeMirror(mirror.id)}
                  disabled={bulkBusy !== null}
                  className="rounded-lg border border-red-500/40 px-4 py-2 text-sm text-red-400 hover:border-red-500/70 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Prominent section for the new free client-side Solana + BSC instant mirroring */}
      <div className="mt-8 border-t border-border pt-6">
        <h2 className="text-2xl font-semibold mb-1 flex items-center gap-2">
          🚀 Instant Solana &amp; BSC Mirrors
          <span className="text-xs font-normal px-2 py-0.5 rounded bg-accent/10 text-accent">Free • Client-side • No subscription</span>
        </h2>
        <p className="text-sm text-muted mb-4">Real-time pending signals from tracked alphas. <strong>You sign the Jupiter (Solana) or Pancake (BSC) tx yourself.</strong> Separate from Pro EVM mirrors.</p>
        <UnifiedLiveMirrors userId={address} />
      </div>

      {mirrorExecutions.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="font-semibold">Recent executions</h2>
          <p className="mt-1 text-sm text-muted">
            Processed by the Cloudflare keeper cron (every 2 minutes) when the watcher detects new
            alpha-wallet activity.
          </p>
          <ul className="mt-4 space-y-2">
            {mirrorExecutions.slice(0, 8).map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
              >
                <Link
                  href={`/wallet/${e.alphaWallet}`}
                  className="font-mono text-accent hover:underline"
                >
                  {formatAddress(e.alphaWallet)}
                </Link>
                <span className="text-muted">
                  {e.chain} · {e.mode} · ${e.tradeUsd} trade ·{" "}
                  <span className={e.pnlUsd >= 0 ? "text-accent" : "text-red-400"}>
                    {e.pnlUsd >= 0 ? "+" : ""}${e.pnlUsd} PnL
                  </span>
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs capitalize ${statusBadgeClass(e.status)}`}
                  title={executionStatusHelp(e.status, e.chain)}
                >
                  {e.status.replace("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {queue.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="font-semibold">Watcher queue (recent)</h2>
          <p className="mt-1 text-sm text-muted">
            Alpha activity detected on {keeperWatchChainsLabel()} mainnet — waiting for keeper
            processing.
          </p>
          <ul className="mt-4 space-y-2">
            {queue.slice(0, 8).map((q) => (
              <li
                key={q.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
              >
                <Link
                  href={`/wallet/${q.alphaWallet}`}
                  className="font-mono text-accent hover:underline"
                >
                  {formatAddress(q.alphaWallet)}
                </Link>
                <span className="text-muted">
                  {q.chain} · +{q.newTransfers} moves · {q.status}
                </span>
                <span className="text-xs text-muted">
                  {new Date(q.timestamp).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}


    </div>
  );
}