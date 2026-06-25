import { etherscanAvailable, etherscanGetAccountTxs } from "../etherscan-client.mjs";
import { discoverFromRoutersAlchemy } from "./alchemy-discover.mjs";
import { alchemyChainReady, alchemyReadyChains } from "./alchemy-tokentx.mjs";
import { discoverFromRoutersRpc } from "./rpc-discover.mjs";
import { getWalletTokenTransfers } from "./transfer-fetch.mjs";
import {
  ALCHEMY_DISCOVERY_CHAINS,
  ALCHEMY_PRIMARY_CHAINS,
  DISCOVERY_ROUTERS,
  ETHERSCAN_CHAINS,
  ETHERSCAN_DISCOVERY_CHAINS,
  RPC_PRIMARY_CHAINS,
  WATCH_CHAINS,
} from "./routers.mjs";

export {
  ALCHEMY_DISCOVERY_CHAINS,
  DISCOVERY_ROUTERS,
  ETHERSCAN_CHAINS,
  ETHERSCAN_DISCOVERY_CHAINS,
  RPC_PRIMARY_CHAINS,
};

function isValidWallet(addr) {
  return typeof addr === "string" && /^0x[0-9a-fA-F]{40}$/.test(addr);
}

async function discoverFromRoutersEtherscan(env, perRouter = 40) {
  const found = new Map();

  for (const chain of ETHERSCAN_DISCOVERY_CHAINS) {
    if (!etherscanAvailable(env, chain)) continue;
    for (const router of DISCOVERY_ROUTERS[chain] ?? []) {
      try {
        const txs = await etherscanGetAccountTxs(env, chain, router, 100);
        const routerLower = router.toLowerCase();
        for (const tx of txs) {
          if (tx.to?.toLowerCase() !== routerLower) continue;
          const from = tx.from?.toLowerCase();
          if (!isValidWallet(from)) continue;
          const row = found.get(from) ?? { address: from, chains: new Set(), lastSeen: 0 };
          row.chains.add(chain);
          row.lastSeen = Math.max(row.lastSeen, tx.timeStamp ?? 0);
          found.set(from, row);
          if (found.size >= perRouter * 4) break;
        }
      } catch (err) {
        console.warn(`etherscan-discover ${chain} ${router.slice(0, 10)}: ${err.message}`);
      }
    }
  }

  return [...found.values()].map((r) => ({
    address: r.address,
    chains: [...r.chains],
    lastSeen: r.lastSeen,
    source: "etherscan-router",
  }));
}

/**
 * $0 discovery stack:
 *   Phase 1 chains → Etherscan txlist on routers
 *   Phase 2 chains → Alchemy inbound router transfers (Base falls back to RPC crawl)
 */
export async function discoverFromRouters(env, perRouter = 50) {
  const etherscan = await discoverFromRoutersEtherscan(env, perRouter);

  const alchemyLists = [];
  const rpcFallback = [];
  for (const chain of ALCHEMY_DISCOVERY_CHAINS) {
    if (await alchemyChainReady(env, chain)) {
      alchemyLists.push(await discoverFromRoutersAlchemy(env, chain, perRouter));
    } else if (RPC_PRIMARY_CHAINS.includes(chain)) {
      rpcFallback.push(chain);
    }
  }
  if (rpcFallback.length) {
    alchemyLists.push(await discoverFromRoutersRpc(env, perRouter, rpcFallback));
  }

  return mergeCandidates(etherscan, ...alchemyLists);
}

/** Expand via token transfer counterparties — chain-aware API selection. */
export async function expandViaCounterparties(env, seeds, limit = 120) {
  const found = new Map();
  const skipRpcChains = await alchemyReadyChains(env, ALCHEMY_PRIMARY_CHAINS);

  for (const seed of seeds.slice(0, 20)) {
    for (const chain of seed.chains ?? WATCH_CHAINS) {
      let txs = [];
      try {
        const result = await getWalletTokenTransfers(env, chain, seed.address, {
          maxTokenTxPages: 1,
          transferLimit: 80,
          etherscanPageDelayMs: 0,
          skipRpcChains,
          rpcMaxChunks: { base: 80, ethereum: 12, arbitrum: 12 },
        });
        txs = result.rows;

        for (const tx of txs) {
          for (const addr of [tx.from, tx.to]) {
            const lower = addr?.toLowerCase();
            if (!isValidWallet(lower) || lower === seed.address.toLowerCase()) continue;
            const row = found.get(lower) ?? {
              address: lower,
              chains: new Set(),
              lastSeen: 0,
            };
            row.chains.add(chain);
            row.lastSeen = Math.max(row.lastSeen, tx.timeStamp ?? 0);
            found.set(lower, row);
            if (found.size >= limit) break;
          }
          if (found.size >= limit) break;
        }
      } catch (err) {
        console.warn(`expand ${chain} ${seed.address.slice(0, 10)}: ${err.message}`);
      }
      if (found.size >= limit) break;
    }
    if (found.size >= limit) break;
  }

  return [...found.values()].map((r) => ({
    address: r.address,
    chains: [...r.chains],
    lastSeen: r.lastSeen,
    source: "counterparty",
  }));
}

export function mergeCandidates(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const row of list) {
      const key = row.address.toLowerCase();
      const prev = map.get(key);
      if (!prev) {
        map.set(key, {
          address: key,
          chains: [...new Set(row.chains ?? [])],
          lastSeen: row.lastSeen ?? 0,
          sources: new Set([row.source ?? "unknown"]),
        });
        continue;
      }
      prev.chains = [...new Set([...prev.chains, ...(row.chains ?? [])])];
      prev.lastSeen = Math.max(prev.lastSeen, row.lastSeen ?? 0);
      prev.sources.add(row.source ?? "unknown");
    }
  }
  return [...map.values()].map((r) => ({
    address: r.address,
    chains: r.chains.length ? r.chains : WATCH_CHAINS,
    lastSeen: r.lastSeen,
    sources: [...r.sources],
  }));
}

export function candidatesFromMirrors(mirrors = []) {
  const rows = [];
  for (const m of mirrors) {
    const addr = m.alphaWallet?.toLowerCase();
    if (!isValidWallet(addr)) continue;
    rows.push({
      address: addr,
      chains: m.allowedChains?.length ? m.allowedChains : WATCH_CHAINS,
      lastSeen: Math.floor(Date.now() / 1000),
      source: "mirror",
    });
  }
  return rows;
}