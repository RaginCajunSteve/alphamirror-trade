import { getAddress, parseAbiItem } from "viem";
import { fetchLogsChunked, LOG_CHUNK_SIZE } from "./chunked-logs.mjs";
import { DISCOVERY_ROUTERS, RPC_PRIMARY_CHAINS } from "./routers.mjs";
import { getRpcClient } from "./rpc-client.mjs";

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

const DISCOVERY_BLOCKS = {
  ethereum: 12_000n,
  base: 20_000n,
  arbitrum: 30_000n,
  optimism: 15_000n,
  bsc: 12_000n,
};

const WORKER_DISCOVERY_BLOCKS = {
  base: 8_000n,
  optimism: 6_000n,
  bsc: 6_000n,
};

function discoveryLookback(chain, env = {}) {
  const local = env.INDEXER_LOCAL === "1" || env.INDEXER_LOCAL === "true";
  if (local) return DISCOVERY_BLOCKS[chain] ?? 20_000n;
  return WORKER_DISCOVERY_BLOCKS[chain] ?? DISCOVERY_BLOCKS[chain] ?? 8_000n;
}

function discoveryMaxChunks(chain, env = {}) {
  const lookback = discoveryLookback(chain, env);
  const chunk = LOG_CHUNK_SIZE[chain] ?? 1_000n;
  return Number((lookback / chunk) + 2n);
}

function isValidWallet(addr) {
  return typeof addr === "string" && /^0x[0-9a-fA-F]{40}$/.test(addr);
}

async function blockTimestamp(client, blockNumber, cache) {
  const k = blockNumber.toString();
  if (cache.has(k)) return cache.get(k);
  const block = await client.getBlock({ blockNumber });
  const ts = Number(block.timestamp);
  cache.set(k, ts);
  return ts;
}

/** Discover traders via ERC-20 transfers into DEX routers (RPC fallback). */
export async function discoverFromRoutersRpc(env, perRouter = 60, chains = RPC_PRIMARY_CHAINS) {
  const found = new Map();

  for (const chain of chains) {
    const routers = DISCOVERY_ROUTERS[chain] ?? [];
    const client = getRpcClient(chain, env);
    if (!client) continue;

    let latest;
    try {
      latest = await client.getBlockNumber();
    } catch (err) {
      console.warn(`rpc-discover ${chain} blockNumber: ${err.message}`);
      continue;
    }
    const lookback = discoveryLookback(chain, env);
    const fromBlock = latest > lookback ? latest - lookback : 0n;
    const tsCache = new Map();

    const target = perRouter * routers.length * 3;
    console.log(
      `rpc-discover ${chain}: ${routers.length} routers, lookback=${lookback} blocks, target≤${target}`,
    );

    for (const router of routers) {
      const routerAddr = getAddress(router);
      if (found.size >= target) break;
      console.log(`rpc-discover ${chain} router ${routerAddr.slice(0, 10)}… (${found.size}/${target})`);

      await fetchLogsChunked(
        client,
        { event: transferEvent, args: { to: routerAddr } },
        fromBlock,
        latest,
        chain,
        {
          maxChunks: discoveryMaxChunks(chain, env),
          onChunk: async (logs) => {
            for (const log of logs) {
              const from = log.args.from?.toLowerCase();
              if (!isValidWallet(from)) continue;
              const ts = await blockTimestamp(client, log.blockNumber, tsCache);
              const row = found.get(from) ?? {
                address: from,
                chains: new Set(),
                lastSeen: 0,
              };
              row.chains.add(chain);
              row.lastSeen = Math.max(row.lastSeen, ts);
              found.set(from, row);
            }
            return found.size < target;
          },
        },
      );
    }
  }

  return [...found.values()]
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .slice(0, perRouter * 6)
    .map((r) => ({
      address: r.address,
      chains: [...r.chains],
      lastSeen: r.lastSeen,
      source: "rpc-router-discovery",
    }));
}