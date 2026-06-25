import type { Chain } from "./types";
import { chainLabels } from "./seed-data";
import {
  getExecutionChainConfig,
  liveExecutionChainsDeployed,
  liveExecutionSummary,
} from "./execution-config";

export type NetworkMode = "testnet" | "mainnet";

/** Site billing/support are production; on-chain execution follows this mode. */
export const NETWORK_MODE: NetworkMode =
  process.env.NEXT_PUBLIC_NETWORK_MODE === "mainnet" ? "mainnet" : "testnet";

/** Indexer / leaderboard watch universe. */
export const WATCH_CHAINS: Chain[] = [
  "ethereum",
  "base",
  "arbitrum",
  "polygon",
  "unichain",
  "linea",
  "blast",
  "optimism",
  "bsc",
  "avalanche",
  "scroll",
];

/** Keeper cron polls alpha-wallet activity on these chains (subset of WATCH_CHAINS). */
export const KEEPER_WATCH_CHAINS: Chain[] = [
  "ethereum",
  "base",
  "arbitrum",
  "optimism",
];

export const EXECUTION_CHAIN_KEY: Chain = "base";

export function leaderboardChainsLabel(): string {
  return WATCH_CHAINS.map((c) => chainLabels[c]).join(", ");
}

export function keeperWatchChainsLabel(): string {
  return KEEPER_WATCH_CHAINS.map((c) => chainLabels[c]).join(", ");
}

/** Human-readable list of networks where live MirrorRouter txs can execute today. */
export function liveExecutionNetworksLabel(mode: NetworkMode = NETWORK_MODE): string {
  if (mode === "testnet") return "Base Sepolia (testnet)";
  const deployed = liveExecutionChainsDeployed();
  if (deployed.length === 0) return "Base mainnet (router pending)";
  return deployed.map((c) => c.label).join(", ");
}

/** @deprecated Prefer liveExecutionNetworksLabel — kept for existing imports. */
export function executionNetworkLabel(mode: NetworkMode = NETWORK_MODE): string {
  return liveExecutionNetworksLabel(mode);
}

export function siteStatusSummary(mode: NetworkMode = NETWORK_MODE): string {
  if (mode === "testnet") {
    return "Production site · Testnet execution on Base Sepolia";
  }
  const live = liveExecutionNetworksLabel(mode);
  const pending = liveExecutionSummary();
  const hasPending = pending.includes("(router pending)");
  if (hasPending && liveExecutionChainsDeployed().length > 0) {
    return `Production site · Live execution on ${live} (${pending})`;
  }
  return `Production site · Live execution on ${live}`;
}

export function executionStatusHelp(status: string, chain?: Chain): string {
  switch (status) {
    case "simulated":
      return "Paper mode or demo — no on-chain tx";
    case "executed": {
      if (chain) {
        const cfg = getExecutionChainConfig(chain);
        return `On-chain tx submitted on ${cfg?.label ?? chainLabels[chain] ?? chain}`;
      }
      return `On-chain tx submitted on ${liveExecutionNetworksLabel()}`;
    }
    case "failed":
      return "Keeper attempted on-chain tx but it failed";
    case "pending_chain":
      return "Activity detected; live execution on this chain requires a deployed MirrorRouter";
    default:
      return status;
  }
}

export function liveMirrorChainsLabel(chains: Chain[]): string {
  const deployed = new Set(liveExecutionChainsDeployed().map((c) => c.chainKey));
  const live = chains.filter((c) => deployed.has(c));
  if (live.length === 0) return liveExecutionNetworksLabel();
  return live.map((c) => getExecutionChainConfig(c)?.label ?? chainLabels[c]).join(", ");
}

/** Run once: npm run migrate:mainnet (requires Base ETH on keeper wallet). */
export const BASE_MAINNET_MIGRATION_STEPS = [
  "Fund keeper wallet with ≥ 0.01 ETH on Base mainnet (npm run fund:mainnet for address)",
  "npm run migrate:mainnet — deploys router, flips configs, deploys keeper + site",
  "Smoke-test a small live mirror on Base; dashboard should show status executed",
  "npm run migrate:arbitrum — deploy Arbitrum router + enable chain #2 live execution",
  "npm run migrate:optimism — deploy Optimism router + enable chain #3 live execution",
] as const;