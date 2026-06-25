import Link from "next/link";
import {
  getMirrorRouterAddressForChain,
  liveExecutionChainsDeployed,
} from "@/lib/contracts/mirror-router";
import { BILLING_EMAIL } from "@/lib/billing";
import {
  LIVE_MIRROR_GUIDE_LINKS,
} from "@/lib/live-mirror-guide";
import { keeperWatchChainsLabel, liveExecutionNetworksLabel } from "@/lib/network-config";

const EXPLORER_BY_CHAIN: Record<string, string> = {
  base: LIVE_MIRROR_GUIDE_LINKS.explorers.base,
  arbitrum: LIVE_MIRROR_GUIDE_LINKS.explorers.arbitrum,
  optimism: LIVE_MIRROR_GUIDE_LINKS.explorers.optimism,
};

function ExtLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent hover:underline"
    >
      {children}
    </a>
  );
}

export function LiveMirrorGuide() {
  const liveNets = liveExecutionNetworksLabel();
  const watchChains = keeperWatchChainsLabel();
  const execChains = liveExecutionChainsDeployed();

  return (
    <section className="rounded-xl border border-border bg-surface p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold">How to enable live mirroring</h2>
        <p className="mt-2 text-sm text-muted">
          Two ways to mirror: <strong>Pro configured mirrors</strong> (paid, EVM chains with on-chain caps via MirrorRouter) or <strong>Free instant mirrors</strong> on Solana + BSC (client-side, zero ongoing cost).
        </p>
      </div>

      {/* New free instant path for Solana/BSC */}
      <div className="rounded-lg border border-accent/30 bg-surface-2 p-4">
        <p className="font-medium text-sm">Free instant mirrors (Solana + BSC) — no subscription needed</p>
        <ul className="mt-2 text-sm text-muted space-y-1 list-disc list-inside">
          <li>Connect <strong>Phantom</strong> (Solana) or <strong>MetaMask</strong> (BSC).</li>
          <li>Tracked elite wallets trigger real detections (Helius webhooks for Solana, free RPC polling for BSC Pancake trades).</li>
          <li>A pending appears on your <Link href="/dashboard" className="text-accent hover:underline">dashboard</Link> when they trade.</li>
          <li>Hit <strong>Mirror Now (Sign)</strong> — Jupiter or Pancake tx is prepared client-side; you approve &amp; sign. You pay only network fees.</li>
        </ul>
        <p className="mt-2 text-xs text-muted">Full custody. No pre-funding required beyond gas. Currently available for select tracked alphas — use support chat to request additional Solana/BSC wallets.</p>
      </div>

      <p className="text-sm font-medium pt-2">Pro configured live mirrors (EVM chains) — follow the steps below</p>
      <ol className="space-y-5 text-sm list-none">
        <li className="flex gap-4">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accent">
            1
          </span>
          <div>
            <p className="font-medium">Subscribe to Pro</p>
            <p className="mt-1 text-muted">
              Live mirroring requires Pro ($29/mo + 0.5% platform fee per live trade).{" "}
              <Link href="/pricing" className="text-accent hover:underline">
                View pricing &amp; checkout
              </Link>
              . Connect MetaMask before paying so your subscription links to your wallet.
            </p>
          </div>
        </li>

        <li className="flex gap-4">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accent">
            2
          </span>
          <div>
            <p className="font-medium">Connect MetaMask</p>
            <p className="mt-1 text-muted">
              Install{" "}
              <ExtLink href={LIVE_MIRROR_GUIDE_LINKS.metamask}>MetaMask</ExtLink> if needed,
              then connect on the{" "}
              <Link href="/" className="text-accent hover:underline">
                home page
              </Link>{" "}
              or{" "}
              <Link href="/dashboard" className="text-accent hover:underline">
                dashboard
              </Link>
              . This wallet holds your USDC and signs approvals.
            </p>
          </div>
        </li>

        <li className="flex gap-4">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accent">
            3
          </span>
          <div>
            <p className="font-medium">Choose an elite wallet</p>
            <p className="mt-1 text-muted">
              Open the{" "}
              <Link href="/leaderboard" className="text-accent hover:underline">
                leaderboard
              </Link>
              , pick a wallet, and click <strong className="text-foreground">Copy strategy</strong>{" "}
              on their profile. You can also open{" "}
              <Link href="/how-it-works" className="text-accent hover:underline">
                How it works
              </Link>{" "}
              for background on scoring and risk.
            </p>
          </div>
        </li>

        <li className="flex gap-4">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accent">
            4
          </span>
          <div>
            <p className="font-medium">Configure the mirror (live mode)</p>
            <ul className="mt-1 text-muted list-disc list-inside space-y-1">
              <li>
                Set mode to <strong className="text-foreground">Live</strong> (not Paper)
              </li>
              <li>Set per-trade cap, daily cap, and mirror size %</li>
              <li>
                Under allowed chains, select only networks you want live txs on:{" "}
                {liveNets}
              </li>
              <li>
                Click <strong className="text-foreground">Enable live mirror</strong>
              </li>
            </ul>
          </div>
        </li>

        <li className="flex gap-4">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accent">
            5
          </span>
          <div>
            <p className="font-medium">Sign on-chain setup in MetaMask (per network)</p>
            <p className="mt-1 text-muted">
              For each selected execution network, MetaMask will ask you to:
            </p>
            <ol className="mt-2 text-muted list-decimal list-inside space-y-1">
              <li>Switch to that network (Base, Arbitrum, or Optimism)</li>
              <li>
                Confirm <code className="text-xs text-accent">setMirrorConfig</code> on
                MirrorRouter (writes your caps on-chain)
              </li>
              <li>
                Confirm <code className="text-xs text-accent">USDC approve</code> for
                MirrorRouter (lets the keeper pull USDC within your caps only)
              </li>
            </ol>
            {execChains.length > 0 && (
              <ul className="mt-3 space-y-2 text-xs font-mono text-muted">
                {execChains.map((cfg) => {
                  const router = getMirrorRouterAddressForChain(cfg.chainKey);
                  const explorer = EXPLORER_BY_CHAIN[cfg.chainKey];
                  return (
                    <li
                      key={cfg.chainKey}
                      className="rounded-lg border border-border/60 bg-surface-2 px-3 py-2"
                    >
                      <p className="font-sans font-medium text-foreground text-sm">
                        {cfg.label}
                      </p>
                      <p className="mt-1 break-all">USDC: {cfg.usdcAddress}</p>
                      {router && (
                        <p className="break-all">
                          Router:{" "}
                          {explorer ? (
                            <ExtLink href={`${explorer}/address/${router}`}>
                              {router}
                            </ExtLink>
                          ) : (
                            router
                          )}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </li>

        <li className="flex gap-4">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accent">
            6
          </span>
          <div>
            <p className="font-medium">Fund your wallet on each live chain</p>
            <p className="mt-1 text-muted">
              Hold <strong className="text-foreground">USDC</strong> on every chain where you
              enabled live mirroring (at least enough to cover your per-trade cap). Bridges if
              you need to move assets:
            </p>
            <ul className="mt-2 text-muted list-disc list-inside space-y-1">
              <li>
                Base:{" "}
                <ExtLink href={LIVE_MIRROR_GUIDE_LINKS.bridges.base}>
                  bridge.base.org
                </ExtLink>
              </li>
              <li>
                Arbitrum:{" "}
                <ExtLink href={LIVE_MIRROR_GUIDE_LINKS.bridges.arbitrum}>
                  bridge.arbitrum.io
                </ExtLink>
              </li>
              <li>
                Optimism:{" "}
                <ExtLink href={LIVE_MIRROR_GUIDE_LINKS.bridges.optimism}>
                  app.optimism.io/bridge
                </ExtLink>
              </li>
            </ul>
          </div>
        </li>

        <li className="flex gap-4">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accent">
            7
          </span>
          <div>
            <p className="font-medium">Monitor on the dashboard</p>
            <p className="mt-1 text-muted">
              Open your{" "}
              <Link href="/dashboard" className="text-accent hover:underline">
                dashboard
              </Link>{" "}
              to see active mirrors, the watcher queue, and recent executions. The keeper
              checks alpha wallets on {watchChains} every ~2 minutes. When the elite wallet
              trades on a chain in your mirror, live mode submits a scaled on-chain copy;
              paper mode only simulates.
            </p>
          </div>
        </li>

        <li className="flex gap-4">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accent">
            8
          </span>
          <div>
            <p className="font-medium">Pause or stop</p>
            <p className="mt-1 text-muted">
              <Link href="/dashboard" className="text-accent hover:underline">
                Dashboard
              </Link>
              : use <strong className="text-foreground">Pause</strong> or{" "}
              <strong className="text-foreground">Remove</strong> on a mirror. To halt live txs
              immediately, revoke the USDC allowance for MirrorRouter in MetaMask (Settings →
              Security &amp; privacy → Token approvals) on each chain.
            </p>
          </div>
        </li>
      </ol>

      <p className="text-xs text-muted border-t border-border pt-4">
        Billing or Pro checkout issues? Email{" "}
        <a href={`mailto:${BILLING_EMAIL}`} className="text-accent hover:underline">
          {BILLING_EMAIL}
        </a>
        . Product questions? Use live chat below or email support@alphamirror.trade.
      </p>
    </section>
  );
}