"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  useSwitchChain,
  useWriteContract,
  usePublicClient,
} from "wagmi";
import { getAddress, parseUnits } from "viem";
import { plans } from "@/lib/pricing";
import type { Chain, MirrorMode, PlanId, Subscription } from "@/lib/types";
import { chainLabels } from "@/lib/seed-data";
import { WATCH_CHAINS } from "@/lib/network-config";
import {
  defaultLiveMirrorChainKeys,
  erc20ApproveAbi,
  getMirrorRouterAddressForChain,
  liveExecutionChainsWithRouter,
  liveExecutionSummary,
  mirrorRouterAbi,
} from "@/lib/contracts/mirror-router";
import { liveExecutionNetworksLabel } from "@/lib/network-config";
import type { ExecutionChainConfig } from "@/lib/execution-config";
import { DisclaimerBanner } from "./DisclaimerBanner";

const ALL_CHAINS: Chain[] = WATCH_CHAINS;

export function MirrorConfigForm({ alphaWallet }: { alphaWallet: string }) {
  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [mode, setMode] = useState<MirrorMode>("paper");
  const [perTradeCap, setPerTradeCap] = useState(500);
  const [dailyCap, setDailyCap] = useState(2000);
  const [userRatio, setUserRatio] = useState(10);
  const [chains, setChains] = useState<Chain[]>(defaultLiveMirrorChainKeys());
  const [status, setStatus] = useState<
    "idle" | "saving" | "onchain" | "saved" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [txStep, setTxStep] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanId>("free");
  const [mirrorCount, setMirrorCount] = useState(0);

  useEffect(() => {
    if (!address) return;
    Promise.all([
      fetch(`/api/subscriptions?user=${address}`).then((r) => r.json()),
      fetch(`/api/mirrors?user=${address}`).then((r) => r.json()),
    ]).then(([subData, mirrorData]) => {
      setPlan((subData.subscription as Subscription)?.plan ?? "free");
      setMirrorCount(mirrorData.mirrors?.length ?? 0);
    });
  }, [address]);

  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  function toggleChain(chain: Chain) {
    setChains((prev) =>
      prev.includes(chain) ? prev.filter((c) => c !== chain) : [...prev, chain],
    );
  }

  async function submitOnChainForChain(cfg: ExecutionChainConfig) {
    const routerAddress = getMirrorRouterAddressForChain(cfg.chainKey);
    if (!routerAddress) return;

    setTxStep(`Switch to ${cfg.label}...`);
    if (chainId !== cfg.viemChain.id) {
      await switchChainAsync({ chainId: cfg.viemChain.id });
    }

    setTxStep(`Confirm setMirrorConfig on ${cfg.label} (check your phone)...`);
    const configHash = await writeContractAsync({
      address: routerAddress,
      abi: mirrorRouterAbi,
      functionName: "setMirrorConfig",
      args: [
        getAddress(alphaWallet.toLowerCase() as `0x${string}`),
        BigInt(perTradeCap) * BigInt(1_000_000),
        BigInt(dailyCap) * BigInt(1_000_000),
        BigInt(userRatio * 100),
      ],
      chainId: cfg.viemChain.id,
    });
    if (publicClient) {
      await publicClient.waitForTransactionReceipt({ hash: configHash });
    }

    setTxStep(`Confirm USDC approve on ${cfg.label}...`);
    const allowance = parseUnits(String(perTradeCap * 4), 6);
    const approveHash = await writeContractAsync({
      address: cfg.usdcAddress,
      abi: erc20ApproveAbi,
      functionName: "approve",
      args: [routerAddress, allowance],
      chainId: cfg.viemChain.id,
    });
    if (publicClient) {
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
    }
  }

  async function submitOnChainConfig() {
    if (!address) return false;

    const execChains = liveExecutionChainsWithRouter(chains);
    if (execChains.length === 0) return false;

    for (const cfg of execChains) {
      await submitOnChainForChain(cfg);
    }

    setTxStep(null);
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address) return;
    setStatus("saving");
    setErrorMsg(null);

    if (mode === "live" && plan !== "pro") {
      setStatus("error");
      setErrorMsg("Live mirroring requires Pro. Upgrade at /pricing.");
      return;
    }

    const planLimits = plans[plan];
    if (mode === "paper" && mirrorCount >= planLimits.maxPaperMirrors) {
      setStatus("error");
      setErrorMsg(
        `Free plan allows ${planLimits.maxPaperMirrors} paper mirrors. Upgrade to Pro for more.`,
      );
      return;
    }

    try {
      const res = await fetch("/api/mirrors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: address,
          alphaWallet,
          mode,
          perTradeCapUsd: perTradeCap,
          dailyCapUsd: dailyCap,
          userRatioPct: userRatio,
          allowedChains: chains,
        }),
      });
      if (!res.ok) throw new Error("Failed to save mirror config");

      if (mode === "live") {
        const execChains = liveExecutionChainsWithRouter(chains);
        if (execChains.length === 0) {
          setStatus("saved");
          setErrorMsg(
            `Config saved. Deploy MirrorRouter on ${liveExecutionSummary()} to enable on-chain txs for those chains.`,
          );
          return;
        }
        setStatus("onchain");
        await submitOnChainConfig();
      }

      setStatus("saved");
    } catch (err) {
      setStatus("error");
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setErrorMsg(
        msg.includes("User rejected") || msg.includes("denied")
          ? "Transaction cancelled in MetaMask. Click Enable live mirror to try again."
          : msg.includes("chain") || msg.includes("Chain")
            ? `Switch MetaMask to the correct network (${liveExecutionNetworksLabel()}), then try again.`
            : msg,
      );
      setTxStep(null);
    }
  }

  if (!isConnected) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center">
        <p className="text-muted">Connect your wallet to configure mirroring.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <DisclaimerBanner />

      <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
        <div>
          <label className="text-sm font-medium">Mode</label>
          <div className="mt-2 flex gap-3">
            {(["paper", "live"] as MirrorMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-lg border px-4 py-2 text-sm capitalize ${
                  mode === m
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-muted"
                }`}
              >
                {m === "paper" ? "Paper (simulate)" : "Live"}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            Paper simulates when we detect activity on your allowed chains. Live submits on-chain
            txs on {liveExecutionSummary()} — MetaMask will prompt per network for config + USDC.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm">
            Max per trade (USD)
            <input
              type="number"
              value={perTradeCap}
              onChange={(e) => setPerTradeCap(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Max daily (USD)
            <input
              type="number"
              value={dailyCap}
              onChange={(e) => setDailyCap(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Size vs alpha (%)
            <input
              type="number"
              min={1}
              max={100}
              value={userRatio}
              onChange={(e) => setUserRatio(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
        </div>

        <div>
          <p className="text-sm font-medium">Allowed chains</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {ALL_CHAINS.map((chain) => (
              <button
                key={chain}
                type="button"
                onClick={() => toggleChain(chain)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  chains.includes(chain)
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-muted"
                }`}
              >
                {chainLabels[chain]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {mode === "live" && plan !== "pro" && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <p>
            Live mirroring requires{" "}
            <Link href="/pricing" className="text-accent underline">
              Pro ($29/mo)
            </Link>
            . 0.5% platform fee per mirrored trade.
          </p>
        </div>
      )}

      {mode === "live" && plan === "pro" && (
        <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-muted space-y-1">
          <p>
            <strong className="text-foreground">Live flow:</strong> saves config →{" "}
            {liveExecutionChainsWithRouter(chains).length > 0
              ? `prompts setMirrorConfig + USDC on ${liveExecutionChainsWithRouter(chains).map((c) => c.label).join(", ")}`
              : "on-chain txs pending MirrorRouter deployment for selected chains"}
          </p>
          <p>Platform fee: 0.5% per mirrored trade</p>
          {liveExecutionChainsWithRouter(chains).map((cfg) => (
            <p key={cfg.chainKey} className="font-mono text-xs">
              {cfg.label} router: {getMirrorRouterAddressForChain(cfg.chainKey)}
            </p>
          ))}
        </div>
      )}

      {txStep && (
        <p className="text-center text-sm text-accent animate-pulse">{txStep}</p>
      )}

      <button
        type="submit"
        disabled={status === "saving" || status === "onchain" || chains.length === 0}
        className="w-full rounded-xl bg-accent py-3 font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
      >
        {status === "saving"
          ? "Saving..."
          : status === "onchain"
            ? "Confirm in wallet..."
            : mode === "paper"
              ? "Start paper mirror"
              : "Enable live mirror"}
      </button>

      {status === "saved" && (
        <div className="rounded-xl border border-accent/40 bg-accent/15 px-5 py-4 text-center space-y-3">
          <p className="font-semibold text-accent">
            {mode === "live" ? "Live mirror enabled" : "Paper mirror started"}
          </p>
          <p className="text-sm text-muted">
            Config saved{mode === "live" ? " and on-chain txs confirmed" : ""}.
          </p>
          <Link
            href="/dashboard"
            className="inline-block rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground hover:bg-accent/90"
          >
            Open Dashboard →
          </Link>
          {errorMsg && <p className="text-sm text-muted">{errorMsg}</p>}
        </div>
      )}
      {status === "error" && (
        <p className="text-center text-sm text-red-400">
          {errorMsg ?? "Failed to save. Try again."}
        </p>
      )}
    </form>
  );
}