/**
 * Etherscan API v2 client for keeper watch-chain polling.
 * https://api.etherscan.io/v2/api?chainid=...&module=...&action=...&apikey=...
 */

const ETHERSCAN_V2_BASE = "https://api.etherscan.io/v2/api";
const REQUEST_TIMEOUT_MS = 10_000;

export const ETHERSCAN_CHAIN_IDS = {
  ethereum: 1,
  base: 8453,
  arbitrum: 42161,
  polygon: 137,
  unichain: 130,
  linea: 59144,
  blast: 81457,
  optimism: 10,
  bsc: 56,
  avalanche: 43_114,
  scroll: 534_352,
};

export function etherscanApiKey(env) {
  const key = env?.ETHERSCAN_API_KEY;
  return key && key.trim() ? key.trim() : null;
}

export function etherscanAvailable(env, chainKey) {
  return Boolean(etherscanApiKey(env) && ETHERSCAN_CHAIN_IDS[chainKey]);
}

async function etherscanRequest(env, chainKey, params, attempt = 0) {
  const apikey = etherscanApiKey(env);
  const chainid = ETHERSCAN_CHAIN_IDS[chainKey];
  if (!apikey || !chainid) return null;

  const url = new URL(ETHERSCAN_V2_BASE);
  url.searchParams.set("chainid", String(chainid));
  url.searchParams.set("apikey", apikey);
  for (const [key, value] of Object.entries(params)) {
    if (value != null) url.searchParams.set(key, String(value));
  }

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await res.json();

  if (body.status === "0" && body.message === "NOTOK") {
    const msg = typeof body.result === "string" ? body.result : body.message;
    if (attempt < 3 && /rate limit/i.test(msg ?? "")) {
      await new Promise((r) => setTimeout(r, 450 * (attempt + 1)));
      return etherscanRequest(env, chainKey, params, attempt + 1);
    }
    throw new Error(msg ?? "Etherscan request failed");
  }

  return body.result;
}

/** Outgoing tx count (nonce) via proxy eth_getTransactionCount. */
export async function etherscanGetTransactionCount(env, chainKey, address) {
  const result = await etherscanRequest(env, chainKey, {
    module: "proxy",
    action: "eth_getTransactionCount",
    address,
    tag: "latest",
  });
  if (typeof result === "string") return Number.parseInt(result, 16);
  return null;
}

/** Full tx object via proxy eth_getTransactionByHash. */
export async function etherscanGetTransactionByHash(env, chainKey, txhash) {
  return etherscanRequest(env, chainKey, {
    module: "proxy",
    action: "eth_getTransactionByHash",
    txhash,
  });
}

/** ERC-20 token transfers for an address (newest first). */
export async function etherscanGetTokenTxs(
  env,
  chainKey,
  address,
  { page = 1, offset = 100, startblock = 0, endblock = 99999999 } = {},
) {
  const result = await etherscanRequest(env, chainKey, {
    module: "account",
    action: "tokentx",
    address,
    startblock,
    endblock,
    page,
    offset: Math.min(Math.max(offset, 1), 100),
    sort: "desc",
  });
  if (!Array.isArray(result)) return [];
  return result.map((tx) => ({
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    value: tx.value,
    tokenSymbol: tx.tokenSymbol,
    tokenDecimal: tx.tokenDecimal,
    contractAddress: tx.contractAddress,
    timeStamp: Number(tx.timeStamp),
    blockNumber: Number(tx.blockNumber),
    chain: chainKey,
  }));
}

/** Recent account txs (newest first). */
export async function etherscanGetAccountTxs(env, chainKey, address, limit = 100) {
  const result = await etherscanRequest(env, chainKey, {
    module: "account",
    action: "txlist",
    address,
    startblock: 0,
    endblock: 99999999,
    page: 1,
    offset: Math.min(Math.max(limit, 1), 100),
    sort: "desc",
  });
  if (!Array.isArray(result)) return [];

  return result
    .filter((tx) => tx.isError === "0")
    .map((tx) => ({
      hash: tx.hash,
      from: tx.from,
      blockNumber: Number(tx.blockNumber),
      timeStamp: Number(tx.timeStamp),
      nonce: Number(tx.nonce),
      value: tx.value,
      to: tx.to,
    }));
}

/** Recent successful outgoing txs from address (newest first). */
export async function etherscanGetOutgoingTxs(env, chainKey, address, limit = 10) {
  const addr = address.toLowerCase();
  return (await etherscanGetAccountTxs(env, chainKey, address, limit * 3))
    .filter((tx) => tx.from?.toLowerCase() === addr)
    .slice(0, limit);
}

/** Prefer real alpha tx hash from watcher; fall back to deterministic placeholder. */
export function resolveAlphaTxHash(entry) {
  for (const candidate of [entry.txHashes?.[0], entry.alphaTxHash]) {
    if (typeof candidate === "string" && /^0x[0-9a-fA-F]{64}$/.test(candidate)) {
      return candidate;
    }
  }
  return `0x${entry.id.replace(/[^a-f0-9]/gi, "0").padEnd(64, "0").slice(0, 64)}`;
}