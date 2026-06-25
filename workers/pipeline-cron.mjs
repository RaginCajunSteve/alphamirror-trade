/**
 * Cloudflare Cron Worker — watcher tick + keeper execution.
 * Deploy: npx wrangler deploy -c wrangler.keeper.jsonc
 */

import {
  createPublicClient,
  createWalletClient,
  fallback,
  getAddress,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  WATCH_CHAIN_KEYS,
  WATCH_VIEM_CHAINS,
  canExecuteLiveOnChain,
  executionRouterAddress,
  executionRpcUrlsFor,
  executionViemChainFor,
  watchRpcUrls,
} from "./chain-config.mjs";
import {
  etherscanApiKey,
  etherscanAvailable,
  etherscanGetOutgoingTxs,
  etherscanGetTransactionCount,
  resolveAlphaTxHash,
} from "./etherscan-client.mjs";

const PLATFORM_FEE_BPS = 50;
const RPC_TIMEOUT_MS = 8_000;

const mirrorRouterAbi = [
  {
    type: "function",
    name: "executeMirror",
    stateMutability: "nonpayable",
    inputs: [
      { name: "user", type: "address" },
      { name: "alphaWallet", type: "address" },
      { name: "alphaTxHash", type: "bytes32" },
    ],
    outputs: [],
  },
];

const watchClientCache = new Map();
const executionClientCache = new Map();

function getExecutionClients(chainKey, env, pk) {
  if (!pk) return null;
  const router = executionRouterAddress(chainKey, env);
  const viemChain = executionViemChainFor(chainKey);
  if (!router || !viemChain) return null;

  const cacheKey = `${chainKey}:${router}:${executionRpcUrlsFor(chainKey, env).join(",")}`;
  if (executionClientCache.has(cacheKey)) {
    return executionClientCache.get(cacheKey);
  }

  const account = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);
  const transport = fallback(
    executionRpcUrlsFor(chainKey, env).map((url) =>
      http(url, { timeout: RPC_TIMEOUT_MS, retryCount: 0 }),
    ),
  );
  const clients = {
    router,
    walletClient: createWalletClient({ account, chain: viemChain, transport }),
    publicClient: createPublicClient({ chain: viemChain, transport }),
  };
  executionClientCache.set(cacheKey, clients);
  return clients;
}

function getWatchClient(chainKey, env) {
  const cacheKey = `${chainKey}:${watchRpcUrls(chainKey, env).join(",")}`;
  if (watchClientCache.has(cacheKey)) return watchClientCache.get(cacheKey);
  const viemChain = WATCH_VIEM_CHAINS[chainKey];
  if (!viemChain) return null;
  const client = createPublicClient({
    chain: viemChain,
    transport: fallback(
      watchRpcUrls(chainKey, env).map((url) =>
        http(url, { timeout: RPC_TIMEOUT_MS, retryCount: 0 }),
      ),
    ),
  });
  watchClientCache.set(cacheKey, client);
  return client;
}

async function kvGet(kv, key, fallbackValue) {
  const row = await kv.get(key, "json");
  return row ?? fallbackValue;
}

async function kvPut(kv, key, data) {
  await kv.put(key, JSON.stringify(data));
}

async function getWalletTxCount(chain, wallet, env) {
  if (etherscanAvailable(env, chain)) {
    try {
      const count = await etherscanGetTransactionCount(env, chain, wallet);
      if (count != null) return { count, source: "etherscan" };
    } catch (err) {
      console.warn(`etherscan txCount ${chain}:${wallet.slice(0, 10)}…: ${err.message}`);
    }
  }

  const client = getWatchClient(chain, env);
  if (!client) return null;
  try {
    const count = Number(await client.getTransactionCount({ address: wallet }));
    return { count, source: "rpc" };
  } catch {
    return null;
  }
}

async function watcherTick(kv, env) {
  const mirrors = (await kvGet(kv, "mirrors.json", [])).filter((m) => m.status === "active");
  const state = await kvGet(kv, "watcher-state.json", {});
  const queue = await kvGet(kv, "mirror-queue.json", []);
  let queued = 0;

  const pairs = new Map();
  for (const m of mirrors) {
    try {
      const wallet = getAddress(m.alphaWallet.toLowerCase());
      for (const chain of m.allowedChains ?? ["base"]) {
        if (!WATCH_CHAIN_KEYS.includes(chain)) continue;
        pairs.set(`${chain}:${wallet}`, { wallet, chain });
      }
    } catch {
      /* skip invalid */
    }
  }

  for (const { wallet, chain } of pairs.values()) {
    const result = await getWalletTxCount(chain, wallet, env);
    if (!result) continue;

    const { count: txCount, source } = result;
    const key = `${chain}:${wallet}`;
    const prev = state[key];
    state[key] = txCount;

    if (prev !== undefined && txCount > prev) {
      const delta = txCount - prev;
      const entry = {
        id: `mq-${Date.now().toString(36)}`,
        alphaWallet: wallet,
        chain,
        newTransfers: delta,
        timestamp: new Date().toISOString(),
        status: "queued",
        watchSource: source,
      };

      if (etherscanAvailable(env, chain)) {
        try {
          const txs = await etherscanGetOutgoingTxs(env, chain, wallet, delta);
          if (txs.length > 0) {
            entry.txHashes = txs.map((tx) => tx.hash);
            entry.alphaTxHash = txs[0].hash;
          }
        } catch (err) {
          console.warn(`etherscan txlist ${chain}:${wallet.slice(0, 10)}…: ${err.message}`);
        }
      }

      queue.push(entry);
      queued++;
    }
  }

  await kvPut(kv, "watcher-state.json", state);
  await kvPut(kv, "mirror-queue.json", queue.slice(-100));
  return queued;
}

function simulatePnl(tradeUsd) {
  const win = Math.random() < 0.68;
  const move = win ? 0.04 + Math.random() * 0.12 : -(0.02 + Math.random() * 0.06);
  return tradeUsd * move;
}

function resolveExecutionStatus(mirror, execClients, entryChain, env) {
  if (mirror.mode !== "live") return "simulated";
  if (!canExecuteLiveOnChain(entryChain, mirror.mode, env)) return "pending_chain";
  if (!execClients) return "simulated";
  return "executed";
}

async function keeperTick(kv, env) {
  const pending = (await kvGet(kv, "mirror-queue.json", [])).filter((e) => e.status === "queued");
  if (pending.length === 0) return 0;

  const mirrors = await kvGet(kv, "mirrors.json", []);
  const executions = await kvGet(kv, "mirror-executions.json", []);
  const queue = await kvGet(kv, "mirror-queue.json", []);
  const pk = env.MIRROR_KEEPER_PRIVATE_KEY;

  let processed = 0;
  for (const entry of pending) {
    const alpha = entry.alphaWallet.toLowerCase();
    const matches = mirrors.filter(
      (m) =>
        m.status === "active" &&
        m.alphaWallet.toLowerCase() === alpha &&
        (m.allowedChains ?? []).includes(entry.chain),
    );
    if (matches.length === 0) continue;

    let entryProcessed = false;
    for (const mirror of matches) {
      const tradeUsd = Math.min(
        mirror.perTradeCapUsd,
        mirror.perTradeCapUsd * (mirror.userRatioPct / 100) * entry.newTransfers,
      );
      const exec = {
        id: `ex-${Date.now().toString(36)}`,
        mirrorId: mirror.id,
        userAddress: mirror.userAddress,
        alphaWallet: mirror.alphaWallet,
        chain: entry.chain,
        mode: mirror.mode,
        queueId: entry.id,
        tradeUsd: Math.round(tradeUsd * 100) / 100,
        pnlUsd: Math.round(simulatePnl(tradeUsd) * 100) / 100,
        platformFeeUsd:
          mirror.mode === "live" ? Math.round(((tradeUsd * PLATFORM_FEE_BPS) / 10_000) * 100) / 100 : 0,
        timestamp: new Date().toISOString(),
        status: resolveExecutionStatus(
          mirror,
          getExecutionClients(entry.chain, env, pk),
          entry.chain,
          env,
        ),
      };

      const execClients = getExecutionClients(entry.chain, env, pk);
      if (
        mirror.mode === "live" &&
        canExecuteLiveOnChain(entry.chain, mirror.mode, env) &&
        execClients
      ) {
        try {
          const alphaTxHash = resolveAlphaTxHash(entry);
          const hash = await execClients.walletClient.writeContract({
            address: execClients.router,
            abi: mirrorRouterAbi,
            functionName: "executeMirror",
            args: [
              getAddress(mirror.userAddress.toLowerCase()),
              getAddress(mirror.alphaWallet.toLowerCase()),
              alphaTxHash,
            ],
          });
          await execClients.publicClient.waitForTransactionReceipt({ hash });
          exec.status = "executed";
        } catch {
          exec.status = "failed";
        }
      }

      executions.push(exec);
      entryProcessed = true;
      processed++;
    }

    const qIdx = queue.findIndex((q) => q.id === entry.id);
    if (qIdx >= 0 && entryProcessed) {
      const hasLive = matches.some((m) => m.mode === "live");
      const hasOnChain = matches.some(
        (m) => m.mode === "live" && canExecuteLiveOnChain(entry.chain, m.mode, env),
      );
      queue[qIdx].status = hasLive ? (hasOnChain ? "executed" : "pending_chain") : "simulated";
    }
  }

  await kvPut(kv, "mirror-executions.json", executions.slice(-500));
  await kvPut(kv, "mirror-queue.json", queue);
  return processed;
}

export default {
  async scheduled(event, env, ctx) {
    const kv = env.DATA_KV;
    if (!kv) return;
    ctx.waitUntil(
      (async () => {
        const queued = await watcherTick(kv, env);
        const executed = await keeperTick(kv, env);
        const scan = etherscanApiKey(env) ? "etherscan+rpc" : "rpc";
        console.log(`pipeline queued=${queued} executed=${executed} watch=${scan}`);
      })(),
    );
  },
};