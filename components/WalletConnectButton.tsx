"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { formatAddress } from "@/lib/scoring";

const METAMASK_URL = "https://metamask.io/download/";

export function WalletConnectButton() {
  const [mounted, setMounted] = useState(false);
  const { address, isConnected } = useAccount();
  const { connectAsync, connectors, isPending, error, reset } = useConnect();
  const { disconnect } = useDisconnect();
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  async function handleConnect() {
    setLocalError(null);
    reset();

    const hasEthereum =
      typeof window !== "undefined" &&
      Boolean((window as Window & { ethereum?: unknown }).ethereum);

    const ordered = [
      connectors.find((c) => c.id === "metaMask"),
      connectors.find((c) => c.id === "injected"),
      ...connectors.filter((c) => c.id !== "metaMask" && c.id !== "injected"),
    ].filter((c): c is NonNullable<typeof c> => Boolean(c));

    if (ordered.length === 0) {
      setLocalError(
        hasEthereum
          ? "Wallet detected but not ready. Unlock MetaMask and try again."
          : "No wallet found. Install MetaMask to connect.",
      );
      return;
    }

    let lastErr: unknown;
    for (const connector of ordered) {
      try {
        await connectAsync({ connector });
        return;
      } catch (err) {
        lastErr = err;
        if (err instanceof Error && err.message.toLowerCase().includes("rejected")) {
          break;
        }
      }
    }

    const message =
      lastErr instanceof Error ? lastErr.message : "Connection failed. Try again.";
    if (message.toLowerCase().includes("rejected")) {
      setLocalError("Connection cancelled.");
    } else {
      setLocalError(message);
    }
  }

  if (!mounted) {
    return (
      <div className="h-9 w-28 animate-pulse rounded-lg bg-surface-2" aria-hidden />
    );
  }

  const displayError = localError ?? error?.message;

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          className="hidden rounded-full border border-border px-3 py-1.5 text-xs font-mono text-muted sm:inline"
        >
          {formatAddress(address)}
        </Link>
        <button
          type="button"
          onClick={() => disconnect()}
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:border-accent/50 transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleConnect}
        disabled={isPending}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90 transition-colors disabled:opacity-50"
      >
        {isPending ? "Connecting..." : "Connect wallet"}
      </button>
      {displayError && (
        <p className="max-w-[220px] text-right text-xs text-red-400">
          {displayError}
          {displayError.includes("Install") && (
            <>
              {" "}
              <a
                href={METAMASK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Get MetaMask
              </a>
            </>
          )}
        </p>
      )}
    </div>
  );
}