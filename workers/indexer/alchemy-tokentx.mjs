import { rpcUrlsFor } from "./rpc-client.mjs";

const ALCHEMY_CHAIN_SLUG = {
  ethereum: "eth-mainnet",
  base: "base-mainnet",
  arbitrum: "arb-mainnet",
  optimism: "opt-mainnet",
  bsc: "bnb-mainnet",
  polygon: "polygon-mainnet",
  linea: "linea-mainnet",
  blast: "blast-mainnet",
  avalanche: "avax-mainnet",
  scroll: "scroll-mainnet",
};

export function alchemyBaseUrl(chainKey, env) {
  const apiKey = env.ALCHEMY_API_KEY?.trim();
  if (apiKey) {
    const slug = ALCHEMY_CHAIN_SLUG[chainKey];
    if (!slug) return null;
    return `https://${slug}.g.alchemy.com/v2/${apiKey}`;
  }

  for (const url of rpcUrlsFor(chainKey, env)) {
    const match = url.match(/https:\/\/([^.]+)\.g\.alchemy\.com\/v2\/([^/?]+)/);
    if (match) return url;
  }
  return null;
}

const readyCache = new Map();

export function alchemyTransfersAvailable(env, chainKey) {
  return Boolean(alchemyBaseUrl(chainKey, env));
}

/** True only when getAssetTransfers works (network enabled on the Alchemy app). */
export async function alchemyChainReady(env, chainKey) {
  const baseUrl = alchemyBaseUrl(chainKey, env);
  if (!baseUrl) return false;
  if (readyCache.has(chainKey)) return readyCache.get(chainKey);

  try {
    await alchemyAssetTransfers(baseUrl, {
      fromBlock: "0x0",
      toBlock: "latest",
      toAddress: "0x68B3465833fB72A70Ecdf485E0E4C7B259FF2A24",
      category: ["erc20"],
      maxCount: "0x1",
      order: "desc",
    });
    readyCache.set(chainKey, true);
    return true;
  } catch (err) {
    const disabled = /not enabled/i.test(err.message ?? "");
    readyCache.set(chainKey, !disabled);
    return !disabled;
  }
}

export async function alchemyReadyChains(env, chains) {
  const ready = [];
  for (const chain of chains) {
    if (await alchemyChainReady(env, chain)) ready.push(chain);
  }
  return ready;
}

export async function alchemyAssetTransfers(baseUrl, params) {
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "alchemy_getAssetTransfers",
      params: [params],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error.message ?? "alchemy_getAssetTransfers failed");
  return body.result?.transfers ?? [];
}

function mapTransfer(row, chainKey) {
  return {
    hash: row.hash,
    from: row.from,
    to: row.to,
    value: row.rawContract?.value ?? "0",
    tokenSymbol: row.asset ?? "ERC20",
    tokenDecimal: Number(row.rawContract?.decimal ?? 18),
    contractAddress: row.rawContract?.address ?? "",
    timeStamp: row.metadata?.blockTimestamp
      ? Math.floor(new Date(row.metadata.blockTimestamp).getTime() / 1000)
      : 0,
    blockNumber: Number.parseInt(row.blockNum ?? "0", 16) || 0,
    chain: chainKey,
  };
}

/** Indexed ERC-20 history — avoids eth_getLogs on Base (Alchemy Data API). */
export async function alchemyGetTokenTransfers(chainKey, address, limit = 200, env = {}) {
  const baseUrl = alchemyBaseUrl(chainKey, env);
  if (!baseUrl) return [];

  const maxCount = `0x${Math.min(Math.max(limit, 1), 1000).toString(16)}`;
  const [outbound, inbound] = await Promise.all([
    alchemyAssetTransfers(baseUrl, {
      fromBlock: "0x0",
      toBlock: "latest",
      fromAddress: address,
      category: ["erc20"],
      maxCount,
      order: "desc",
    }),
    alchemyAssetTransfers(baseUrl, {
      fromBlock: "0x0",
      toBlock: "latest",
      toAddress: address,
      category: ["erc20"],
      maxCount,
      order: "desc",
    }),
  ]);

  const seen = new Set();
  const rows = [];
  for (const row of [...outbound, ...inbound].sort((a, b) => {
    const ta = a.metadata?.blockTimestamp ? new Date(a.metadata.blockTimestamp).getTime() : 0;
    const tb = b.metadata?.blockTimestamp ? new Date(b.metadata.blockTimestamp).getTime() : 0;
    return tb - ta;
  })) {
    const key = `${row.hash}:${row.from}:${row.to}:${row.rawContract?.address ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(mapTransfer(row, chainKey));
    if (rows.length >= limit) break;
  }

  return rows;
}