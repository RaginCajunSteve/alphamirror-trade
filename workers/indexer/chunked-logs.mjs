/** Chain-specific eth_getLogs chunk sizes (public RPC limits). */
export const LOG_CHUNK_SIZE = {
  ethereum: 2_000n,
  base: 45n,
  arbitrum: 1_500n,
  polygon: 3_000n,
  unichain: 2_000n,
  linea: 2_000n,
  blast: 2_000n,
  optimism: 2_000n,
  bsc: 3_000n,
  avalanche: 2_000n,
  scroll: 2_000n,
};

export async function fetchLogsChunked(
  client,
  filter,
  fromBlock,
  toBlock,
  chainKey,
  { maxChunks, onChunk } = {},
) {
  const chunk = LOG_CHUNK_SIZE[chainKey] ?? 1_000n;
  const logs = [];
  let chunkEnd = toBlock;
  let chunks = 0;
  let failStreak = 0;

  while (chunkEnd >= fromBlock) {
    if (maxChunks != null && chunks >= maxChunks) break;
    if (failStreak >= 6) break;

    const chunkStart = chunkEnd > chunk ? chunkEnd - chunk : fromBlock;
    let batch = [];
    try {
      batch = await client.getLogs({
        ...filter,
        fromBlock: chunkStart,
        toBlock: chunkEnd,
      });
      logs.push(...batch);
      failStreak = 0;
    } catch (err) {
      failStreak++;
      console.warn(`getLogs ${chainKey} ${chunkStart}-${chunkEnd}: ${err.message}`);
    }

    if (onChunk) {
      const cont = await onChunk(batch, { chunkStart, chunkEnd, chunks });
      if (cont === false) break;
    }

    if (chunkStart === fromBlock) break;
    chunkEnd = chunkStart - 1n;
    chunks++;
    await new Promise((r) => setTimeout(r, chainKey === "base" ? 150 : 60));
  }

  return logs;
}