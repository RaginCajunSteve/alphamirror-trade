import { arbitrum, base, optimism } from "viem/chains";
import type { Chain as ViemChain } from "viem/chains";
import type { Chain } from "./types";

export const LIVE_EXECUTION_CHAINS: Chain[] = ["base", "arbitrum", "optimism"];

export interface ExecutionChainConfig {
  chainKey: Chain;
  viemChain: ViemChain;
  usdcAddress: `0x${string}`;
  /** Public env var holding the MirrorRouter address for this chain. */
  routerEnvKey: string;
  label: string;
}

const BASE_MAINNET: ExecutionChainConfig = {
  chainKey: "base",
  viemChain: base,
  usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  routerEnvKey: "NEXT_PUBLIC_MIRROR_ROUTER_ADDRESS",
  label: "Base mainnet",
};

const ARBITRUM_MAINNET: ExecutionChainConfig = {
  chainKey: "arbitrum",
  viemChain: arbitrum,
  usdcAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  routerEnvKey: "NEXT_PUBLIC_MIRROR_ROUTER_ARBITRUM",
  label: "Arbitrum One",
};

const OPTIMISM_MAINNET: ExecutionChainConfig = {
  chainKey: "optimism",
  viemChain: optimism,
  usdcAddress: "0x0b2C639c533813f4Aa9D7837CA06a1b2E4C8e7",
  routerEnvKey: "NEXT_PUBLIC_MIRROR_ROUTER_OPTIMISM",
  label: "Optimism",
};

/**
 * Static process.env reads — Next.js only inlines NEXT_PUBLIC_* when accessed
 * literally (not via process.env[dynamicKey]). Required for client components.
 */
const ROUTER_BY_ENV_KEY: Record<string, `0x${string}` | undefined> = {
  NEXT_PUBLIC_MIRROR_ROUTER_ADDRESS: process.env
    .NEXT_PUBLIC_MIRROR_ROUTER_ADDRESS as `0x${string}` | undefined,
  NEXT_PUBLIC_MIRROR_ROUTER_ARBITRUM: process.env
    .NEXT_PUBLIC_MIRROR_ROUTER_ARBITRUM as `0x${string}` | undefined,
  NEXT_PUBLIC_MIRROR_ROUTER_OPTIMISM: process.env
    .NEXT_PUBLIC_MIRROR_ROUTER_OPTIMISM as `0x${string}` | undefined,
};

export function getExecutionChainConfig(
  chainKey: Chain,
): ExecutionChainConfig | undefined {
  if (chainKey === "base") return BASE_MAINNET;
  if (chainKey === "arbitrum") return ARBITRUM_MAINNET;
  if (chainKey === "optimism") return OPTIMISM_MAINNET;
  return undefined;
}

export function getMirrorRouterAddressForChain(
  chainKey: Chain,
): `0x${string}` | undefined {
  const cfg = getExecutionChainConfig(chainKey);
  if (!cfg) return undefined;
  const addr = ROUTER_BY_ENV_KEY[cfg.routerEnvKey];
  if (!addr || addr === "0x0000000000000000000000000000000000000000") {
    return undefined;
  }
  return addr as `0x${string}`;
}

export function liveExecutionChainsWithRouter(
  allowedChains: Chain[],
): ExecutionChainConfig[] {
  return LIVE_EXECUTION_CHAINS.filter((c) => allowedChains.includes(c))
    .map((c) => getExecutionChainConfig(c)!)
    .filter((cfg) => Boolean(getMirrorRouterAddressForChain(cfg.chainKey)));
}

export function canExecuteLiveOnChain(
  entryChain: Chain,
  mirrorMode: string,
): boolean {
  return (
    mirrorMode === "live" &&
    LIVE_EXECUTION_CHAINS.includes(entryChain) &&
    Boolean(getMirrorRouterAddressForChain(entryChain))
  );
}

export function liveExecutionSummary(): string {
  const parts = LIVE_EXECUTION_CHAINS.map((c) => {
    const cfg = getExecutionChainConfig(c)!;
    return getMirrorRouterAddressForChain(c)
      ? cfg.label
      : `${cfg.label} (router pending)`;
  });
  return parts.join(" · ");
}

/** Execution chains with a deployed MirrorRouter (from public env vars). */
export function liveExecutionChainsDeployed(): ExecutionChainConfig[] {
  return LIVE_EXECUTION_CHAINS.map((key) => getExecutionChainConfig(key)!).filter(
    (cfg) => Boolean(getMirrorRouterAddressForChain(cfg.chainKey)),
  );
}

export function defaultLiveMirrorChainKeys(): Chain[] {
  return liveExecutionChainsDeployed().map((cfg) => cfg.chainKey);
}