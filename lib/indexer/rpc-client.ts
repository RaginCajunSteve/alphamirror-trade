import { createPublicClient, fallback, http } from "viem";
import {
  arbitrum,
  avalanche,
  base,
  blast,
  bsc,
  linea,
  mainnet,
  optimism,
  polygon,
  scroll,
  unichain,
} from "viem/chains";
import type { Chain } from "@/lib/types";

const VIEM_CHAINS = {
  ethereum: mainnet,
  base,
  arbitrum,
  polygon,
  unichain,
  linea,
  blast,
  optimism,
  bsc,
  avalanche,
  scroll,
} as const;

const DEPRIORITIZED_HOSTS = [
  "1rpc.io",
  "llamarpc.com",
  "publicnode.com",
  "blastapi.io",
  "meowrpc.com",
  "rpc.ankr.com",
];

const DEFAULT_RPC: Record<Chain, string[]> = {
  ethereum: ["https://ethereum.publicnode.com"],
  base: ["https://base.drpc.org", "https://mainnet.base.org"],
  arbitrum: ["https://arb1.arbitrum.io/rpc", "https://arbitrum.llamarpc.com"],
  polygon: ["https://polygon-rpc.com", "https://polygon-bor-rpc.publicnode.com"],
  unichain: ["https://mainnet.unichain.org"],
  linea: ["https://rpc.linea.build"],
  blast: ["https://rpc.blast.io"],
  optimism: ["https://mainnet.optimism.io", "https://optimism-rpc.publicnode.com"],
  bsc: ["https://bsc-dataseed.binance.org", "https://bsc-rpc.publicnode.com"],
  avalanche: ["https://api.avax.network/ext/bc/C/rpc", "https://avalanche-c-chain-rpc.publicnode.com"],
  scroll: ["https://rpc.scroll.io", "https://scroll-rpc.publicnode.com"],
};

export type RpcEnv = Record<string, string | undefined>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RpcClient = any;

const clientCache = new Map<string, RpcClient>();

function isDeprioritized(url: string): boolean {
  return DEPRIORITIZED_HOSTS.some((host) => url.includes(host));
}

export function rpcUrlsFor(chainKey: Chain, env: RpcEnv = {}): string[] {
  const envKey = `RPC_URL_${chainKey.toUpperCase()}`;
  const override = env[envKey] ?? (chainKey === "base" ? env.RPC_URL : undefined);
  const defaults = DEFAULT_RPC[chainKey] ?? [];
  if (!override) return defaults;
  if (isDeprioritized(override)) {
    return [...defaults.filter((u) => u !== override), override];
  }
  return [override, ...defaults.filter((u) => u !== override)];
}

export function getRpcClient(
  chainKey: Chain,
  env: RpcEnv = {},
  timeoutMs = 8_000,
): RpcClient | null {
  const cacheKey = `${chainKey}:${rpcUrlsFor(chainKey, env).join(",")}:${timeoutMs}`;
  if (clientCache.has(cacheKey)) return clientCache.get(cacheKey)!;

  const chain = VIEM_CHAINS[chainKey];
  if (!chain) return null;

  const client = createPublicClient({
    chain,
    transport: fallback(
      rpcUrlsFor(chainKey, env).map((url) =>
        http(url, { timeout: timeoutMs, retryCount: 1 }),
      ),
    ),
  });
  clientCache.set(cacheKey, client);
  return client;
}

export async function getIndexerEnv(): Promise<RpcEnv> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    return env as RpcEnv;
  } catch {
    return {
      RPC_URL_ETHEREUM: process.env.RPC_URL_ETHEREUM,
      RPC_URL_BASE: process.env.RPC_URL_BASE ?? process.env.RPC_URL,
      RPC_URL_ARBITRUM: process.env.RPC_URL_ARBITRUM,
      RPC_URL_POLYGON: process.env.RPC_URL_POLYGON,
      RPC_URL_UNICHAIN: process.env.RPC_URL_UNICHAIN,
      RPC_URL_LINEA: process.env.RPC_URL_LINEA,
      RPC_URL_BLAST: process.env.RPC_URL_BLAST,
      RPC_URL_OPTIMISM: process.env.RPC_URL_OPTIMISM,
      RPC_URL_BSC: process.env.RPC_URL_BSC,
      RPC_URL_AVALANCHE: process.env.RPC_URL_AVALANCHE,
      RPC_URL_SCROLL: process.env.RPC_URL_SCROLL,
      RPC_URL: process.env.RPC_URL,
    };
  }
}

export function clearRpcClientCache(): void {
  clientCache.clear();
}