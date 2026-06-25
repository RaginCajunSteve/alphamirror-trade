import { parseAbiItem } from "viem";
import { fetchLogsChunked, LOG_CHUNK_SIZE } from "./chunked-logs.mjs";
import { enrichTransfersWithMeta } from "./token-meta.mjs";
import { getRpcClient } from "./rpc-client.mjs";

const LOOKBACK_BLOCKS = {
  ethereum: 60_000n,
  base: 45_000n,
  arbitrum: 75_000n,
};

/** Default chunk caps — overridden by limits.rpcMaxChunks; derived from lookback when unset. */
const DEFAULT_MAX_CHUNKS = {
  ethereum: 30,
  base: 1000,
  arbitrum: 50,
};

function maxChunksFor(chainKey, lookback, limits = {}) {
  const override = limits.rpcMaxChunks?.[chainKey];
  if (override != null) return override;
  const preset = DEFAULT_MAX_CHUNKS[chainKey];
  if (preset != null) return preset;
  const chunk = LOG_CHUNK_SIZE[chainKey] ?? 1_000n;
  return Number((lookback / chunk) + 2n);
}

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

async function blockTimestamp(client, blockNumber, cache) {
  const k = blockNumber.toString();
  if (cache.has(k)) return cache.get(k);
  const block = await client.getBlock({ blockNumber });
  const ts = Number(block.timestamp);
  cache.set(k, ts);
  return ts;
}

async function fetchDirectionalLogs(
  client,
  address,
  fromBlock,
  toBlock,
  direction,
  chainKey,
  maxChunks,
) {
  const args = direction === "out" ? { from: address } : { to: address };
  return fetchLogsChunked(
    client,
    { event: transferEvent, args },
    fromBlock,
    toBlock,
    chainKey,
    { maxChunks },
  );
}

/** ERC-20 transfer history via chunked RPC logs + on-chain token metadata. */
export async function rpcGetTokenTransfers(chainKey, address, limit = 200, env = {}, limits = {}) {
  const client = getRpcClient(chainKey, env);
  if (!client) return [];

  let latest;
  try {
    latest = await client.getBlockNumber();
  } catch (err) {
    console.warn(`blockNumber ${chainKey}: ${err.message}`);
    return [];
  }
  const lookback = LOOKBACK_BLOCKS[chainKey] ?? 50_000n;
  const fromBlock = latest > lookback ? latest - lookback : 0n;
  const tsCache = new Map();
  const maxChunks = maxChunksFor(chainKey, lookback, limits);
  if (maxChunks <= 0) return [];

  const outbound = await fetchDirectionalLogs(
    client,
    address,
    fromBlock,
    latest,
    "out",
    chainKey,
    maxChunks,
  );
  const inbound = await fetchDirectionalLogs(
    client,
    address,
    fromBlock,
    latest,
    "in",
    chainKey,
    maxChunks,
  );

  const rows = [...outbound, ...inbound]
    .sort((a, b) => Number(b.blockNumber - a.blockNumber))
    .slice(0, limit);

  const transfers = [];
  for (const log of rows) {
    const ts = await blockTimestamp(client, log.blockNumber, tsCache);
    transfers.push({
      hash: log.transactionHash,
      from: log.args.from,
      to: log.args.to,
      value: (log.args.value ?? 0n).toString(),
      tokenSymbol: "ERC20",
      tokenDecimal: 18,
      contractAddress: log.address,
      timeStamp: ts,
      blockNumber: Number(log.blockNumber),
      chain: chainKey,
    });
  }

  return enrichTransfersWithMeta(chainKey, transfers, env);
}