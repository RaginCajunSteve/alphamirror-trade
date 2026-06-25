import { parseAbi } from "viem";
import { getRpcClient } from "./rpc-client.mjs";

const erc20Abi = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

const metaCache = new Map();

/** Built-in stable/WETH contracts (lowercase address → { symbol, decimals }). */
export const KNOWN_TOKENS = {
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { symbol: "USDC", decimals: 6 },
  "0xdac17f958d2ee523a2206206994597c13d831ec7": { symbol: "USDT", decimals: 6 },
  "0x6b175474e89094c44da98b954eedeac495271d0f": { symbol: "DAI", decimals: 18 },
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": { symbol: "WETH", decimals: 18 },
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { symbol: "USDC", decimals: 6 },
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca": { symbol: "USDbC", decimals: 6 },
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": { symbol: "DAI", decimals: 18 },
  "0x4200000000000000000000000000000000000006": { symbol: "WETH", decimals: 18 },
  "0xaf88d065e77c8cc2239327c5edb3a432268e5831": { symbol: "USDC", decimals: 6 },
  "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8": { symbol: "USDC.e", decimals: 6 },
  "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": { symbol: "USDT", decimals: 6 },
  "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f": { symbol: "WBTC", decimals: 8 },
  "0x940181a94a35a4569e4529a3cdfb74e38fd98631": { symbol: "AERO", decimals: 18 },
  "0xcbbtc0000000000000000000000000000000006": { symbol: "cbBTC", decimals: 8 },
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": { symbol: "WBTC", decimals: 8 },
};

export async function resolveTokenMeta(chainKey, contractAddress, env = {}) {
  const key = `${chainKey}:${contractAddress?.toLowerCase()}`;
  if (metaCache.has(key)) return metaCache.get(key);

  const known = KNOWN_TOKENS[contractAddress?.toLowerCase()];
  if (known) {
    metaCache.set(key, known);
    return known;
  }

  const client = getRpcClient(chainKey, env);
  if (!client || !contractAddress) {
    const fallback = { symbol: "ERC20", decimals: 18 };
    metaCache.set(key, fallback);
    return fallback;
  }

  try {
    const [symbol, decimals] = await Promise.all([
      client.readContract({
        address: contractAddress,
        abi: erc20Abi,
        functionName: "symbol",
      }),
      client.readContract({
        address: contractAddress,
        abi: erc20Abi,
        functionName: "decimals",
      }),
    ]);
    const meta = { symbol: String(symbol), decimals: Number(decimals) };
    metaCache.set(key, meta);
    return meta;
  } catch {
    const fallback = { symbol: "ERC20", decimals: 18 };
    metaCache.set(key, fallback);
    return fallback;
  }
}

export async function enrichTransfersWithMeta(chainKey, transfers, env = {}) {
  const unique = [...new Set(transfers.map((t) => t.contractAddress?.toLowerCase()).filter(Boolean))];
  await Promise.all(unique.map((addr) => resolveTokenMeta(chainKey, addr, env)));

  return transfers.map((t) => {
    const meta = KNOWN_TOKENS[t.contractAddress?.toLowerCase()] ??
      metaCache.get(`${chainKey}:${t.contractAddress?.toLowerCase()}`) ?? {
        symbol: t.tokenSymbol ?? "ERC20",
        decimals: Number(t.tokenDecimal ?? 18),
      };
    return {
      ...t,
      tokenSymbol: meta.symbol,
      tokenDecimal: meta.decimals,
      chain: chainKey,
    };
  });
}