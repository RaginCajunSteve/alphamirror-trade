import { parseAbiItem, type Address } from "viem";
import type { Chain } from "@/lib/types";
import { fetchLogsChunked } from "./chunked-logs";
import { getRpcClient, type RpcEnv } from "./rpc-client";
import { detectUniswapV3Swaps } from "./uniswap-swaps";

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

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
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

export interface SwapActivity {
  chain: Chain;
  recentTransfers: number | null;
  dexSwaps: number | null;
  blocksScanned: number;
  error?: string;
}

export async function detectRecentSwapActivity(
  address: string,
  chains: Chain[],
  env: RpcEnv = {},
): Promise<SwapActivity[]> {
  const [transfers, dex] = await Promise.all([
    Promise.all(
      chains.map(async (chain): Promise<SwapActivity> => {
        const client = getRpcClient(chain, env, RPC_TIMEOUT_MS);
        if (!client) {
          return {
            chain,
            recentTransfers: null,
            dexSwaps: null,
            blocksScanned: 0,
            error: "unsupported chain",
          };
        }

        try {
          const latest = (await withTimeout(
            client.getBlockNumber(),
            RPC_TIMEOUT_MS,
          )) as bigint;
          const lookback = LOOKBACK_BLOCKS[chain];
          const fromBlock = latest > lookback ? latest - lookback : BigInt(0);

          const logs = await withTimeout(
            fetchLogsChunked(
              client,
              { event: transferEvent, args: { from: address as Address } },
              fromBlock,
              latest,
              chain,
              { maxChunks: MAX_LOG_CHUNKS },
            ),
            RPC_TIMEOUT_MS,
          );

          return {
            chain,
            recentTransfers: logs.length,
            dexSwaps: null,
            blocksScanned: Number(latest - fromBlock),
          };
        } catch (err) {
          return {
            chain,
            recentTransfers: null,
            dexSwaps: null,
            blocksScanned: 0,
            error: err instanceof Error ? err.message : "rpc error",
          };
        }
      }),
    ),
    detectUniswapV3Swaps(address, chains, env),
  ]);

  return transfers.map((t) => {
    const d = dex.find((x) => x.chain === t.chain);
    return {
      ...t,
      dexSwaps: d?.dexSwaps ?? null,
      blocksScanned: Math.max(t.blocksScanned, d?.blocksScanned ?? 0),
      error: t.error ?? d?.error,
    };
  });
}