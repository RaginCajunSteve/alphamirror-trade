import { parseAbiItem, type Address } from "viem";
import type { Chain } from "@/lib/types";
import { fetchLogsChunked } from "./chunked-logs";
import { getRpcClient, type RpcEnv } from "./rpc-client";

const RPC_TIMEOUT_MS = 6_000;
const MAX_LOG_CHUNKS = 50;

/** Recent window sized for per-request enrichment (not full indexer scan). */
const LOOKBACK_BLOCKS: Record<Chain, bigint> = {
  ethereum: BigInt(2_000),
  base: BigInt(2_000),
  arbitrum: BigInt(5_000),
  polygon: BigInt(3_000),
  unichain: BigInt(2_000),
  linea: BigInt(2_000),
  blast: BigInt(2_000),
  optimism: BigInt(2_000),
  bsc: BigInt(3_000),
  avalanche: BigInt(2_000),
  scroll: BigInt(2_000),
};

const swapEvent = parseAbiItem(
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
);

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("rpc timeout")), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

function dedupeLogs(
  logs: Array<{ transactionHash: string | null; logIndex: number | null }>,
): typeof logs {
  const seen = new Set<string>();
  return logs.filter((log) => {
    if (!log.transactionHash) return false;
    const key = `${log.transactionHash}:${log.logIndex ?? 0}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface DexSwapActivity {
  chain: Chain;
  dexSwaps: number | null;
  blocksScanned: number;
  error?: string;
}

export async function detectUniswapV3Swaps(
  address: string,
  chains: Chain[],
  env: RpcEnv = {},
): Promise<DexSwapActivity[]> {
  return Promise.all(
    chains.map(async (chain): Promise<DexSwapActivity> => {
      const client = getRpcClient(chain, env, RPC_TIMEOUT_MS);
      if (!client) {
        return { chain, dexSwaps: null, blocksScanned: 0, error: "unsupported chain" };
      }

      try {
        const latest = (await withTimeout(
          client.getBlockNumber(),
          RPC_TIMEOUT_MS,
        )) as bigint;
        const lookback = LOOKBACK_BLOCKS[chain];
        const fromBlock = latest > lookback ? latest - lookback : BigInt(0);

        const [asSender, asRecipient] = await Promise.all([
          withTimeout(
            fetchLogsChunked(
              client,
              { event: swapEvent, args: { sender: address as Address } },
              fromBlock,
              latest,
              chain,
              { maxChunks: MAX_LOG_CHUNKS },
            ),
            RPC_TIMEOUT_MS,
          ),
          withTimeout(
            fetchLogsChunked(
              client,
              { event: swapEvent, args: { recipient: address as Address } },
              fromBlock,
              latest,
              chain,
              { maxChunks: MAX_LOG_CHUNKS },
            ),
            RPC_TIMEOUT_MS,
          ),
        ]);

        const logs = dedupeLogs([...asSender, ...asRecipient]);

        return {
          chain,
          dexSwaps: logs.length,
          blocksScanned: Number(latest - fromBlock),
        };
      } catch (err) {
        return {
          chain,
          dexSwaps: null,
          blocksScanned: 0,
          error: err instanceof Error ? err.message : "rpc error",
        };
      }
    }),
  );
}