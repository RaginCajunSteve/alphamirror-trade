import { etherscanAvailable, etherscanGetTokenTxs } from "../etherscan-client.mjs";
import { alchemyGetTokenTransfers, alchemyTransfersAvailable } from "./alchemy-tokentx.mjs";
import { rpcGetTokenTransfers } from "./rpc-tokentx.mjs";
import {
  ALCHEMY_PRIMARY_CHAINS,
  CHAIN_EXPANSION_TIER,
  ETHERSCAN_CHAINS,
} from "./routers.mjs";

/** Tier A chains without Etherscan free tier — Alchemy-only (no RPC fallback). */
const ALCHEMY_ONLY_CHAINS = CHAIN_EXPANSION_TIER.tierA.filter(
  (c) => !ETHERSCAN_CHAINS.includes(c),
);

const TOKEN_TX_PAGE_SIZE = 100;

/**
 * $0 stack routing:
 *   Phase 1 (ETHERSCAN_CHAINS) → Etherscan tokentx
 *   Phase 2 (ALCHEMY_PRIMARY_CHAINS) → Alchemy getAssetTransfers
 *   Fallback → RPC eth_getLogs when allowed
 */
export async function getWalletTokenTransfers(env, chain, address, limits = {}) {
  if (ALCHEMY_PRIMARY_CHAINS.includes(chain) && alchemyTransfersAvailable(env, chain)) {
    try {
      const rows = await alchemyGetTokenTransfers(
        chain,
        address,
        limits.transferLimit ?? 200,
        env,
      );
      if (rows.length) return { rows, source: "alchemy" };
    } catch (err) {
      console.warn(`alchemy ${chain} ${address.slice(0, 10)}: ${err.message}`);
    }
  }

  if (ETHERSCAN_CHAINS.includes(chain) && etherscanAvailable(env, chain)) {
    const chainRows = [];
    const maxPages = limits.maxTokenTxPages ?? 4;
    for (let page = 1; page <= maxPages; page++) {
      try {
        const batch = await etherscanGetTokenTxs(env, chain, address, {
          page,
          offset: TOKEN_TX_PAGE_SIZE,
        });
        if (!batch.length) break;
        chainRows.push(...batch.map((t) => ({ ...t, chain })));
        if (batch.length < TOKEN_TX_PAGE_SIZE) break;
        if (limits.etherscanPageDelayMs > 0) {
          await new Promise((r) => setTimeout(r, limits.etherscanPageDelayMs));
        }
      } catch (err) {
        console.warn(`tokentx ${chain} ${address.slice(0, 10)} p${page}: ${err.message}`);
        break;
      }
    }
    if (chainRows.length) return { rows: chainRows, source: "etherscan" };
  }

  if (limits.skipRpcChains?.includes(chain) || ALCHEMY_ONLY_CHAINS.includes(chain)) {
    return { rows: [], source: "skipped-no-index" };
  }

  const rows = await rpcGetTokenTransfers(
    chain,
    address,
    limits.transferLimit ?? 200,
    env,
    limits,
  );
  return { rows, source: "rpc-logs" };
}

export function baseIndexingAvailable(env) {
  return (
    alchemyTransfersAvailable(env, "base") ||
    env.ETHERSCAN_BASE_ENABLED === "1" ||
    env.ETHERSCAN_BASE_ENABLED === "true"
  );
}

function stackLabel(env, chain) {
  if (ALCHEMY_PRIMARY_CHAINS.includes(chain) && alchemyTransfersAvailable(env, chain)) {
    return "alchemy";
  }
  if (ETHERSCAN_CHAINS.includes(chain) && etherscanAvailable(env, chain)) {
    return "etherscan";
  }
  if (chain === "base" && baseIndexingAvailable(env)) return "etherscan";
  return "rpc-fallback";
}

export function indexerDataStack(env) {
  const stack = {};
  for (const chain of [...ETHERSCAN_CHAINS, ...ALCHEMY_PRIMARY_CHAINS]) {
    stack[chain] = stackLabel(env, chain);
  }
  stack.baseDiscovery = alchemyTransfersAvailable(env, "base")
    ? "alchemy-router"
    : "rpc-router-crawl";
  stack.alchemyDiscovery = ALCHEMY_PRIMARY_CHAINS.filter((c) =>
    alchemyTransfersAvailable(env, c),
  ).map((c) => `${c}:alchemy-router`);
  return stack;
}