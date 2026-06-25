/**
 * Live execution chains — keeper worker mirror of lib/execution-config.ts
 */
import { arbitrum, base, optimism } from "viem/chains";

export const LIVE_EXECUTION_CHAIN_KEYS = ["base", "arbitrum", "optimism"];

const CHAIN_META = {
  base: {
    viemChain: base,
    routerVar: "NEXT_PUBLIC_MIRROR_ROUTER_ADDRESS",
    rpcVar: "RPC_URL_EXECUTION",
    defaultRpc: "https://mainnet.base.org",
  },
  arbitrum: {
    viemChain: arbitrum,
    routerVar: "NEXT_PUBLIC_MIRROR_ROUTER_ARBITRUM",
    rpcVar: "RPC_URL_ARBITRUM_EXECUTION",
    defaultRpc: "https://arb1.arbitrum.io/rpc",
  },
  optimism: {
    viemChain: optimism,
    routerVar: "NEXT_PUBLIC_MIRROR_ROUTER_OPTIMISM",
    rpcVar: "RPC_URL_OPTIMISM_EXECUTION",
    defaultRpc: "https://mainnet.optimism.io",
  },
};

export function executionRouterAddress(chainKey, env) {
  const meta = CHAIN_META[chainKey];
  if (!meta) return undefined;
  const addr = env[meta.routerVar]?.trim();
  if (!addr || addr === "0x0000000000000000000000000000000000000000") {
    return undefined;
  }
  return addr;
}

export function executionRpcUrlsFor(chainKey, env) {
  const meta = CHAIN_META[chainKey];
  if (!meta) return [];
  const url = env[meta.rpcVar] ?? env[`RPC_URL_${chainKey.toUpperCase()}`] ?? meta.defaultRpc;
  return [url];
}

export function executionViemChainFor(chainKey) {
  return CHAIN_META[chainKey]?.viemChain;
}

export function canExecuteLiveOnChain(entryChain, mirrorMode, env) {
  if (mirrorMode !== "live") return false;
  if (!LIVE_EXECUTION_CHAIN_KEYS.includes(entryChain)) return false;
  return Boolean(executionRouterAddress(entryChain, env));
}