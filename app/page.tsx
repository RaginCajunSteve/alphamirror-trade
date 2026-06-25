import Link from "next/link";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { getSiteStats } from "@/lib/indexer/meta";
import {
  leaderboardChainsLabel,
} from "@/lib/network-config";

export default async function HomePage() {
  const stats = await getSiteStats();
  const indexChains = leaderboardChainsLabel();

  return (
    <div className="space-y-16">
      <section className="py-8 text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-accent">
          Top 0.5% on-chain performers
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
          Copy elite wallets.
          <br />
          <span className="text-muted">Keep your keys.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">
          We surface wallets with strong on-chain results across {indexChains}. Mirror via Pro (EVM) or instantly for free on Solana &amp; BSC — you always sign the tx yourself.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link
            href="/leaderboard"
            className="rounded-xl bg-accent px-6 py-3 font-medium text-accent-foreground hover:bg-accent/90"
          >
            View leaderboard
          </Link>
          <Link
            href="/pricing"
            className="rounded-xl border border-accent/40 px-6 py-3 font-medium text-accent hover:bg-accent/10"
          >
            Pro from $29/mo
          </Link>
          <Link
            href="/how-it-works"
            className="rounded-xl border border-border px-6 py-3 font-medium hover:border-accent/50"
          >
            How it works
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Wallets tracked", value: stats.walletsTracked.toLocaleString() },
          { label: "Elite tier (0.5%)", value: stats.eliteCount.toLocaleString() },
          {
            label: "Avg risk-adj ROI",
            value: stats.avgRiskAdjRoi > 0 ? `${stats.avgRiskAdjRoi}x` : "—",
          },
          { label: "Active mirrors", value: stats.mirrorsActive.toLocaleString() },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-border bg-surface p-5 text-center"
          >
            <p className="text-2xl font-semibold text-accent">{stat.value}</p>
            <p className="mt-1 text-sm text-muted">{stat.label}</p>
          </div>
        ))}
      </section>

      {stats.scoredAt && (
        <p className="text-center text-xs text-muted">
          Leaderboard scores updated {new Date(stats.scoredAt).toLocaleString()}
          {stats.source === "indexer-live" ? " · live indexer" : ""}
        </p>
      )}

      <section className="grid gap-6 md:grid-cols-3">
        {[
          {
            title: "Rank",
            body: "Risk-adjusted ROI over 30d, 90d, and 180d windows. Drawdown matters — not just lucky 100x shots.",
          },
          {
            title: "Decode",
            body: "Plain-language strategy playbooks: hold time, chain preference, entry patterns retail users can understand.",
          },
          {
            title: "Mirror",
            body: `Pro: allowance-based bot on EVM. Free instant: client-side on Solana (Jupiter/Helius) + BSC (Pancake). You always sign and keep keys.`,
          },
        ].map((item) => (
          <div key={item.title} className="rounded-2xl border border-border bg-surface p-6">
            <h3 className="text-lg font-semibold">{item.title}</h3>
            <p className="mt-2 text-sm text-muted">{item.body}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-accent/40 bg-surface p-8">
        <h2 className="text-2xl font-semibold mb-4">Free instant mirroring on Solana &amp; BSC</h2>
        <div className="grid md:grid-cols-2 gap-6 text-sm">
          <div>
            <p className="font-medium mb-2">Solana (Helius + Jupiter)</p>
            <ol className="list-decimal list-inside space-y-1 text-muted">
              <li>Connect Phantom wallet.</li>
              <li>Go to your <Link href="/dashboard" className="text-accent underline">Dashboard</Link>.</li>
              <li>When a tracked elite Solana wallet swaps (detected instantly via Helius webhook), a pending appears.</li>
              <li>Click “Mirror Now (Sign)” — we build the Jupiter tx for you. You sign and pay gas.</li>
            </ol>
          </div>
          <div>
            <p className="font-medium mb-2">BSC / PancakeSwap</p>
            <ol className="list-decimal list-inside space-y-1 text-muted">
              <li>Connect MetaMask and switch to BSC.</li>
              <li>Tracked BSC alphas trading on Pancake create pendings.</li>
              <li>Sign the swap directly in your wallet (client-side via Pancake Router).</li>
            </ol>
            <p className="mt-3 text-xs text-muted">No subscription, no pre-approvals to us, full custody. Real-time low-cost path (separate D1 + worker).</p>
          </div>
        </div>
        <p className="mt-4 text-xs text-muted">See full details on <Link href="/how-it-works" className="underline">How it works</Link> or the dashboard after connecting a wallet. Request additional Solana alphas via support chat.</p>
      </section>

      <DisclaimerBanner />
    </div>
  );
}