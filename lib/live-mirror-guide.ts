import {
  getMirrorRouterAddressForChain,
  liveExecutionChainsDeployed,
} from "./contracts/mirror-router";
import { keeperWatchChainsLabel, liveExecutionNetworksLabel } from "./network-config";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://alphamirror.trade";

export const LIVE_MIRROR_GUIDE_LINKS = {
  app: APP_URL,
  pricing: `${APP_URL}/pricing`,
  leaderboard: `${APP_URL}/leaderboard`,
  dashboard: `${APP_URL}/dashboard`,
  howItWorks: `${APP_URL}/how-it-works`,
  support: `${APP_URL}/support`,
  metamask: "https://metamask.io/download/",
  stripePortalHint: "Use the link in your Stripe receipt email",
  bridges: {
    base: "https://bridge.base.org",
    arbitrum: "https://bridge.arbitrum.io",
    optimism: "https://app.optimism.io/bridge",
  },
  explorers: {
    base: "https://basescan.org",
    arbitrum: "https://arbiscan.io",
    optimism: "https://optimistic.etherscan.io",
  },
} as const;

export interface LiveMirrorGuideStep {
  title: string;
  body: string;
}

/** Plain-text steps for FAQ / support AI (includes URLs). */
export function liveMirrorGuidePlainText(): string {
  const live = liveExecutionNetworksLabel();
  const watch = keeperWatchChainsLabel();
  const chains = liveExecutionChainsDeployed();

  const chainLines = chains
    .map((cfg) => {
      const router = getMirrorRouterAddressForChain(cfg.chainKey);
      return `  - ${cfg.label}: USDC ${cfg.usdcAddress}${router ? ` · MirrorRouter ${router}` : ""}`;
    })
    .join("\n");

  return [
    "How to enable live mirroring on Alpha Mirror:",
    "",
    "1. Subscribe to Pro ($29/mo)",
    `   ${LIVE_MIRROR_GUIDE_LINKS.pricing}`,
    "   Complete Stripe checkout while your wallet is connected.",
    "",
    "2. Install and connect MetaMask",
    `   ${LIVE_MIRROR_GUIDE_LINKS.metamask}`,
    `   Open ${LIVE_MIRROR_GUIDE_LINKS.app} and connect the wallet you will mirror from.`,
    "",
    "3. Pick an elite wallet to copy",
    `   Browse ${LIVE_MIRROR_GUIDE_LINKS.leaderboard} and open a wallet profile.`,
    '   Click "Copy strategy" (or go to /copy/<wallet-address>).',
    "",
    "4. Configure the mirror (live mode)",
    "   - Mode: Live (not Paper)",
    "   - Set per-trade cap, daily cap, and size %",
    `   - Allowed chains: select only networks you want live txs on (${live})`,
    "   - Click Enable live mirror",
    "",
    "5. Complete on-chain setup in MetaMask (once per execution network)",
    "   For each selected chain, MetaMask will prompt you to:",
    "   a) Switch to that network",
    "   b) Confirm setMirrorConfig on MirrorRouter (sets your caps on-chain)",
    "   c) Confirm USDC approve for MirrorRouter (allows the keeper to pull USDC within your caps)",
    "",
    "   Execution networks & contracts:",
    chainLines,
    "",
    "6. Fund your wallet",
    "   - Hold USDC on each chain where you enabled live mirroring",
    "   - Hold a small amount of native ETH on each chain for any direct wallet gas",
    `   - Bridges: Base ${LIVE_MIRROR_GUIDE_LINKS.bridges.base} · Arbitrum ${LIVE_MIRROR_GUIDE_LINKS.bridges.arbitrum} · Optimism ${LIVE_MIRROR_GUIDE_LINKS.bridges.optimism}`,
    "",
    "7. Monitor execution",
    `   ${LIVE_MIRROR_GUIDE_LINKS.dashboard} shows mirrors, watcher queue, and recent executions.`,
    `   The keeper polls alpha wallets on ${watch} every ~2 minutes.`,
    "   When the elite wallet trades on a chain you mirror, the keeper scales the trade to your caps and submits an on-chain tx (live) or simulates (paper).",
    "",
    "8. Pause or stop",
    `   Dashboard: Pause or Remove mirrors (${LIVE_MIRROR_GUIDE_LINKS.dashboard}).`,
    "   To stop live txs immediately: revoke USDC allowance for MirrorRouter in MetaMask (per chain).",
    "",
    "Billing help: billing@alphamirror.trade",
    `Support: ${LIVE_MIRROR_GUIDE_LINKS.support}`,
  ].join("\n");
}