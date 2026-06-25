import { getAddress } from "viem";
import {
  alchemyAssetTransfers,
  alchemyBaseUrl,
  alchemyTransfersAvailable,
} from "./alchemy-tokentx.mjs";
import { DISCOVERY_ROUTERS } from "./routers.mjs";

function isValidWallet(addr) {
  return typeof addr === "string" && /^0x[0-9a-fA-F]{40}$/.test(addr);
}

/** Discover traders via indexed ERC-20 transfers into DEX routers (Alchemy path). */
export async function discoverFromRoutersAlchemy(env, chain, perRouter = 60) {
  if (!alchemyTransfersAvailable(env, chain)) return [];

  const baseUrl = alchemyBaseUrl(chain, env);
  if (!baseUrl) return [];

  const routers = DISCOVERY_ROUTERS[chain] ?? [];
  const found = new Map();
  const target = perRouter * routers.length * 3;
  const maxCount = `0x${Math.min(perRouter * 2, 1000).toString(16)}`;

  console.log(
    `alchemy-discover ${chain}: ${routers.length} routers, target≤${target}`,
  );

  for (const router of routers) {
    if (found.size >= target) break;
    const routerAddr = getAddress(router);
    try {
      const inbound = await alchemyAssetTransfers(baseUrl, {
        fromBlock: "0x0",
        toBlock: "latest",
        toAddress: routerAddr,
        category: ["erc20"],
        maxCount,
        order: "desc",
      });

      for (const row of inbound) {
        const from = row.from?.toLowerCase();
        if (!isValidWallet(from)) continue;
        const ts = row.metadata?.blockTimestamp
          ? Math.floor(new Date(row.metadata.blockTimestamp).getTime() / 1000)
          : 0;
        const prev = found.get(from) ?? {
          address: from,
          chains: new Set(),
          lastSeen: 0,
        };
        prev.chains.add(chain);
        prev.lastSeen = Math.max(prev.lastSeen, ts);
        found.set(from, prev);
        if (found.size >= target) break;
      }
    } catch (err) {
      console.warn(`alchemy-discover ${chain} ${routerAddr.slice(0, 10)}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 80));
  }

  return [...found.values()]
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .slice(0, perRouter * 6)
    .map((r) => ({
      address: r.address,
      chains: [...r.chains],
      lastSeen: r.lastSeen,
      source: "alchemy-router-discovery",
    }));
}