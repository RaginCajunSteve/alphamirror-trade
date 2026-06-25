/**
 * Infer retail-friendly strategy playbooks from on-chain transfer patterns.
 */

import { WATCH_CHAINS } from "./routers.mjs";

export function inferStrategy(address, chainsActive, transfers, closedTrades90d = []) {
  const active = chainsActive?.length ? chainsActive : WATCH_CHAINS;
  const chainCounts = Object.fromEntries(active.map((c) => [c, 0]));
  for (const t of transfers) {
    if (t.chain && chainCounts[t.chain] != null) chainCounts[t.chain]++;
  }
  const total = Object.values(chainCounts).reduce((s, n) => s + n, 0) || 1;
  const chainWeights = Object.fromEntries(
    WATCH_CHAINS.map((c) => [c, (chainCounts[c] ?? 0) / total]),
  );

  const holdAvgDays =
    closedTrades90d.length > 0
      ? closedTrades90d.reduce((s, t) => s + t.holdDays, 0) / closedTrades90d.length
      : 3;

  const tradesPerMonth =
    closedTrades90d.length > 0 ? (closedTrades90d.length / 90) * 30 : 0;

  const topChain = Object.entries(chainWeights).sort((a, b) => b[1] - a[1])[0]?.[0];

  let archetype = "Multi-chain momentum";
  if (holdAvgDays >= 7) archetype = "Swing accumulator";
  else if (holdAvgDays <= 2) archetype = "Short-term liquidity trader";
  else if (topChain === "base" && chainWeights.base >= 0.5) archetype = "Base ecosystem specialist";
  else if (topChain === "arbitrum" && chainWeights.arbitrum >= 0.45) archetype = "Arbitrum DeFi rotator";
  else if (topChain === "polygon" && chainWeights.polygon >= 0.45) archetype = "Polygon DEX rotator";
  else if (topChain === "bsc" && chainWeights.bsc >= 0.45) archetype = "BSC meme-flow trader";
  else if (topChain === "avalanche" && chainWeights.avalanche >= 0.45)
    archetype = "Avalanche DEX rotator";
  else if (topChain === "scroll" && chainWeights.scroll >= 0.45) archetype = "Scroll L2 specialist";
  else if (topChain === "ethereum" && chainWeights.ethereum >= 0.45) archetype = "Ethereum blue-chip rotator";

  let mcapPreference = "$10M–$80M trending tokens";
  if (holdAvgDays <= 2) mcapPreference = "$2M–$25M new pairs";
  else if (holdAvgDays >= 7) mcapPreference = "$50M+ established tokens";

  const entryPatterns = [];
  if (tradesPerMonth >= 20) entryPatterns.push("High-frequency entries on DEX liquidity");
  else if (tradesPerMonth >= 8) entryPatterns.push("Rotates on volume spikes across chains");
  else entryPatterns.push("Selective entries with longer holds");

  if (chainWeights.base >= 0.35) entryPatterns.push("Heavy Base-native token activity");
  if (chainWeights.polygon >= 0.35) entryPatterns.push("Active on Polygon DEX routers");
  if (chainWeights.avalanche >= 0.35) entryPatterns.push("Active on Avalanche DEX routers");
  if (chainWeights.scroll >= 0.35) entryPatterns.push("Active on Scroll DEX routers");
  if (holdAvgDays <= 3) entryPatterns.push("Tight exit window (24–72h typical)");

  const winRate =
    closedTrades90d.length > 0
      ? closedTrades90d.filter((t) => t.pnlUsd > 0).length / closedTrades90d.length
      : 0.5;

  return {
    wallet: address,
    archetype,
    holdAvgDays: Math.round(holdAvgDays * 10) / 10,
    mcapPreference,
    chainWeights,
    entryPatterns: entryPatterns.slice(0, 4),
    confidenceScore: Math.min(0.95, 0.55 + winRate * 0.35 + Math.min(tradesPerMonth / 40, 0.1)),
    riskScore: Math.min(9.5, 4 + (tradesPerMonth / 8) + (holdAvgDays < 2 ? 2 : 0)),
  };
}