import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { NetworkStatusBanner } from "@/components/NetworkStatusBanner";
import {
  keeperWatchChainsLabel,
  liveExecutionNetworksLabel,
} from "@/lib/network-config";

function buildSteps() {
  const watch = keeperWatchChainsLabel();
  const live = liveExecutionNetworksLabel();

  return [
    {
      title: "We index DEX swaps",
      body: `Across ${watch} we track Uniswap-style swaps and reconstruct closed positions.`,
    },
    {
      title: "We score risk-adjusted ROI",
      body: "ROI divided by max drawdown. Rolling 30d, 90d, and 180d windows. A daily indexer rescans DEX activity; top 0.5% make the leaderboard.",
    },
    {
      title: "We decode the playbook",
      body: "Hold time, chain preference, entry patterns — written for retail users, not quants.",
    },
    {
      title: "You mirror with caps",
      body: "Connect MetaMask, set per-trade and daily limits, choose paper or live mode. Funds stay in your wallet.",
    },
    {
      title: "Bot executes on alpha moves (Pro EVM)",
      body: `When the elite wallet moves on ${watch}, our Cloudflare keeper cron detects it, scales to your caps, and either simulates (paper) or submits on-chain txs (live on ${live}).`,
    },
    {
      title: "Free instant mirrors (Solana + BSC)",
      body: "Separate zero-cost path: tracked alphas trigger real-time pendings via Helius (Solana) or free RPCs (BSC). You sign the Jupiter or Pancake tx client-side directly from the dashboard. No server gas, no subscription required for this path.",
    },
    {
      title: "You stay in control",
      body: "Pause anytime. Revoke allowances to stop completely. Send feedback on any page to help us improve.",
    },
  ];
}

export default function HowItWorksPage() {
  const steps = buildSteps();

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <div>
        <h1 className="text-3xl font-bold">How it works</h1>
        <p className="mt-3 text-lg text-muted">
          Built for retail traders who want to follow proven on-chain performers without giving up
          custody. We support <strong>Pro mirrors</strong> on EVM chains + <strong>free instant client-side mirrors</strong> on Solana and BSC.
        </p>
      </div>

      <NetworkStatusBanner />

      <ol className="space-y-6">
        {steps.map((step, i) => (
          <li key={step.title} className="flex gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/20 text-sm font-semibold text-accent">
              {i + 1}
            </span>
            <div>
              <h3 className="font-semibold">{step.title}</h3>
              <p className="mt-1 text-sm text-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="rounded-lg border border-border bg-surface p-4 text-sm">
        <p className="font-medium">Bonus: Free instant mirrors (Solana + BSC)</p>
        <p className="mt-1 text-muted">
          In addition to configured Pro mirrors, we run a separate zero-cost tracker. When tracked Solana elites trade (Helius webhooks), or BSC elites trade on Pancake, pendings surface on your dashboard. You sign a direct Jupiter or Pancake swap in your wallet. No fees to us, no subscriptions required for this path. See the guide on the dashboard or live mirror setup for details.
        </p>
      </div>

      <DisclaimerBanner />
    </div>
  );
}