/**
 * Chain + network config for the keeper pipeline worker.
 * Watch chains: Ethereum / Base / Arbitrum mainnet (alpha wallet activity).
 * Execution chain: Base Sepolia (testnet) or Base mainnet — where MirrorRouter lives.
 */

import { arbitrum, base, baseSepolia, mainnet, optimism } from "viem/chains";

export const WATCH_CHAIN_KEYS = ["ethereum", "base", "arbitrum", "optimism"];

export const WATCH_VIEM_CHAINS = {
  ethereum: mainnet,
  base: base,
  arbitrum: arbitrum,
  optimism: optimism,
};

const DEFAULT_WATCH_RPC = {
  ethereum: ["https://ethereum.publicnode.com", "https://rpc.ankr.com/eth"],
  base: ["https://mainnet.base.org", "https://base.llamarpc.com"],
  arbitrum: ["https://arb1.arbitrum.io/rpc", "https://arbitrum.llamarpc.com"],
  optimism: ["https://mainnet.optimism.io", "https://optimism-rpc.publicnode.com"],
};

export function getNetworkMode(env) {
  return env.NETWORK_MODE === "mainnet" ? "mainnet" : "testnet";
}

export function watchRpcUrls(chainKey, env) {
  const envKey = `RPC_URL_${chainKey.toUpperCase()}`;
  const override = env[envKey];
  if (override) return [override];
  return DEFAULT_WATCH_RPC[chainKey] ?? DEFAULT_WATCH_RPC.base;
}

export function executionViemChain(env) {
  return getNetworkMode(env) === "mainnet" ? base : baseSepolia;
}

export function executionRpcUrls(env) {
  const url =
    env.RPC_URL_EXECUTION ??
    (getNetworkMode(env) === "mainnet"
      ? "https://mainnet.base.org"
      : "https://sepolia.base.org");
  return [url];
}

export {
  canExecuteLiveOnChain,
  executionRouterAddress,
  executionRpcUrlsFor,
  executionViemChainFor,
  LIVE_EXECUTION_CHAIN_KEYS,
} from "./execution-config.mjs";