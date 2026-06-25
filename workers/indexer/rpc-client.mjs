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
};

/** Public endpoints that rate-limit or reject eth_getLogs — use as last resort only. */
const DEPRIORITIZED_HOSTS = [
  "1rpc.io",
  "llamarpc.com",
  "publicnode.com",
  "blastapi.io",
  "meowrpc.com",
];

const DEFAULT_RPC = {
  ethereum: [
    "https://ethereum.publicnode.com",
    "https://rpc.ankr.com/eth",
  ],
  base: [
    "https://base-rpc.publicnode.com",
    "https://base.drpc.org",
    "https://mainnet.base.org",
  ],
  arbitrum: [
    "https://arbitrum.llamarpc.com",
    "https://arb1.arbitrum.io/rpc",
    "https://arbitrum.publicnode.com",
  ],
  polygon: [
    "https://polygon-rpc.com",
    "https://polygon.llamarpc.com",
    "https://polygon-bor-rpc.publicnode.com",
  ],
  unichain: [
    "https://mainnet.unichain.org",
    "https://unichain.drpc.org",
  ],
  linea: [
    "https://rpc.linea.build",
    "https://linea.drpc.org",
  ],
  blast: [
    "https://rpc.blast.io",
    "https://blast.drpc.org",
  ],
  optimism: [
    "https://mainnet.optimism.io",
    "https://optimism.llamarpc.com",
    "https://optimism-rpc.publicnode.com",
  ],
  bsc: [
    "https://bsc-dataseed.binance.org",
    "https://bsc-rpc.publicnode.com",
    "https://rpc.ankr.com/bsc",
  ],
  avalanche: [
    "https://api.avax.network/ext/bc/C/rpc",
    "https://avalanche-c-chain-rpc.publicnode.com",
  ],
  scroll: [
    "https://rpc.scroll.io",
    "https://scroll-rpc.publicnode.com",
  ],
};

const clientCache = new Map();

function isDeprioritized(url) {
  return DEPRIORITIZED_HOSTS.some((host) => url.includes(host));
}

export function rpcUrlsFor(chainKey, env = {}) {
  const envKey = `RPC_URL_${chainKey.toUpperCase()}`;
  const override = env[envKey] ?? (chainKey === "base" ? env.RPC_URL : null);
  const defaults = DEFAULT_RPC[chainKey] ?? [];
  if (!override) return defaults;
  if (isDeprioritized(override)) {
    return [...defaults.filter((u) => u !== override), override];
  }
  return [override, ...defaults.filter((u) => u !== override)];
}

export function getRpcClient(chainKey, env = {}, timeoutMs = 12_000) {
  const cacheKey = `${chainKey}:${rpcUrlsFor(chainKey, env).join(",")}`;
  if (clientCache.has(cacheKey)) return clientCache.get(cacheKey);

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

export function clearRpcClientCache() {
  clientCache.clear();
}