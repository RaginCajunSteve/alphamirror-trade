import type { Chain } from "@/lib/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RpcClient = any;

/** Chain-specific eth_getLogs chunk sizes (public RPC limits). */
export const LOG_CHUNK_SIZE: Record<Chain, bigint> = {
  ethereum: BigInt(2_000),
  base: BigInt(45),
  arbitrum: BigInt(1_500),
  polygon: BigInt(3_000),
  unichain: BigInt(2_000),
  linea: BigInt(2_000),
  blast: BigInt(2_000),
  optimism: BigInt(2_000),
  bsc: BigInt(3_000),
  avalanche: BigInt(2_000),
  scroll: BigInt(2_000),
};

type LogFilter = Parameters<RpcClient["getLogs"]>[0];

export async function fetchLogsChunked(
  client: RpcClient,
  filter: Omit<LogFilter, "fromBlock" | "toBlock">,
  fromBlock: bigint,
  toBlock: bigint,
  chainKey: Chain,
  { maxChunks }: { maxChunks?: number } = {},
): Promise<Awaited<ReturnType<RpcClient["getLogs"]>>> {
  const chunk = LOG_CHUNK_SIZE[chainKey] ?? BigInt(1_000);
  const logs: Awaited<ReturnType<RpcClient["getLogs"]>> = [];
  let chunkEnd = toBlock;
  let chunks = 0;
  let failStreak = 0;

  while (chunkEnd >= fromBlock) {
    if (maxChunks != null && chunks >= maxChunks) break;
    if (failStreak >= 6) break;

    const chunkStart = chunkEnd > chunk ? chunkEnd - chunk : fromBlock;
    try {
      const batch = await client.getLogs({
        ...filter,
        fromBlock: chunkStart,
        toBlock: chunkEnd,
      });
      logs.push(...batch);
      failStreak = 0;
    } catch {
      failStreak++;
    }

    if (chunkStart === fromBlock) break;
    chunkEnd = chunkStart - BigInt(1);
    chunks++;
    await new Promise((r) => setTimeout(r, chainKey === "base" ? 60 : 30));
  }

  return logs;
}