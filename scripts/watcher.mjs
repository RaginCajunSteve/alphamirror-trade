/**
 * Keeper watcher v2 — polls alpha wallets, queues mirror on new activity.
 *
 * Env:
 *   ALPHA_WALLET=0x...   Watch only this wallet (ignores mirrors.json)
 *   CHAIN=base           Limit to one chain (recommended for demos)
 *   POLL_MS=15000
 *   RESET_STATE=1        Clear watcher-state.json on start
 *   RPC_URL_ETHEREUM / RPC_URL_BASE / RPC_URL_ARBITRUM — override public RPCs
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync } from "fs";
import { createPublicClient, fallback, getAddress, http } from "viem";
import { arbitrum, base, mainnet } from "viem/chains";
import {
  etherscanApiKey,
  etherscanAvailable,
  etherscanGetOutgoingTxs,
  etherscanGetTransactionCount,
} from "../workers/etherscan-client.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}

loadEnvLocal();

const watcherEnv = { ETHERSCAN_API_KEY: process.env.ETHERSCAN_API_KEY };
const POLL_MS = Number(process.env.POLL_MS ?? 15_000);
const RPC_TIMEOUT_MS = 6_000;

const chains = {
  base: { chain: base },
  arbitrum: { chain: arbitrum },
  ethereum: { chain: mainnet },
};

const defaultRpcUrls = {
  ethereum: [
    "https://ethereum.publicnode.com",
    "https://rpc.ankr.com/eth",
    "https://eth.llamarpc.com",
  ],
  base: [
    "https://mainnet.base.org",
    "https://base.llamarpc.com",
    "https://base.publicnode.com",
  ],
  arbitrum: [
    "https://arb1.arbitrum.io/rpc",
    "https://arbitrum.llamarpc.com",
    "https://arbitrum.publicnode.com",
  ],
};

const clientCache = new Map();

function rpcUrlsFor(chainKey) {
  const envKey = `RPC_URL_${chainKey.toUpperCase()}`;
  const override = process.env[envKey] ?? process.env.RPC_URL;
  if (override) return [override];
  return defaultRpcUrls[chainKey];
}

function getClient(chainKey) {
  if (clientCache.has(chainKey)) return clientCache.get(chainKey);
  const cfg = chains[chainKey];
  const client = createPublicClient({
    chain: cfg.chain,
    transport: fallback(
      rpcUrlsFor(chainKey).map((url) =>
        http(url, { timeout: RPC_TIMEOUT_MS, retryCount: 0 }),
      ),
    ),
  });
  clientCache.set(chainKey, client);
  return client;
}

async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(path.join(DATA_DIR, file), "utf-8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, data) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(path.join(DATA_DIR, file), JSON.stringify(data, null, 2), "utf-8");
}

const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E5345D4aA4D2aFff";

function addressHint(raw) {
  const lower = raw.trim().toLowerCase();
  if (lower === VITALIK.slice(0, -1).toLowerCase()) {
    return `Did you mean Vitalik's address? Use:\n  set ALPHA_WALLET=${VITALIK}`;
  }
  return null;
}

function normalizeAddress(raw) {
  const trimmed = raw.trim();
  const hexLen = trimmed.startsWith("0x") ? trimmed.length - 2 : trimmed.length;
  if (hexLen !== 40) {
    const hint = addressHint(trimmed);
    throw new Error(
      `invalid address: ${trimmed} (${hexLen} hex chars, expected 40 — check for typos)` +
        (hint ? `\n${hint}` : ""),
    );
  }
  try {
    return getAddress(trimmed, { strict: false });
  } catch {
    throw new Error(`invalid address: ${trimmed}`);
  }
}

let cachedPairs = null;

/** @returns {{ wallet: string, chain: string }[]} */
async function loadWatchPairs({ warn = false } = {}) {
  if (cachedPairs) return cachedPairs;

  const chainFilter = process.env.CHAIN ? [process.env.CHAIN] : null;

  if (process.env.ALPHA_WALLET) {
    const wallet = normalizeAddress(process.env.ALPHA_WALLET);
    const chainKeys = chainFilter ?? Object.keys(chains);
    cachedPairs = chainKeys.map((chain) => ({ wallet, chain }));
    return cachedPairs;
  }

  const mirrors = await readJson("mirrors.json", []);
  const active = mirrors.filter((m) => m.status === "active");
  const seen = new Set();
  const pairs = [];

  for (const mirror of active) {
    let wallet;
    try {
      wallet = normalizeAddress(mirror.alphaWallet);
    } catch (err) {
      if (warn) console.warn(`[skip] mirror ${mirror.id}: ${err.message}`);
      continue;
    }
    const mirrorChains = chainFilter ?? mirror.allowedChains ?? Object.keys(chains);
    for (const chain of mirrorChains) {
      if (!chains[chain]) continue;
      const key = `${chain}:${wallet}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ wallet, chain });
    }
  }

  cachedPairs = pairs;
  return cachedPairs;
}

async function getTxCount(chainKey, address) {
  if (etherscanAvailable(watcherEnv, chainKey)) {
    try {
      const count = await etherscanGetTransactionCount(watcherEnv, chainKey, address);
      if (count != null) return { count, source: "etherscan" };
    } catch (err) {
      console.warn(`[etherscan] ${chainKey} txCount: ${err.message}`);
    }
  }

  const client = getClient(chainKey);
  const count = Number(
    await withTimeout(
      client.getTransactionCount({ address }),
      RPC_TIMEOUT_MS,
      `txCount ${chainKey}`,
    ),
  );
  return { count, source: "rpc" };
}

async function poll(chainKey, address, state) {
  const { count: txCount, source } = await getTxCount(chainKey, address);

  const key = `${chainKey}:${address}`;
  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;

  if (state[key] === undefined) {
    state[key] = txCount;
    console.log(`[baseline] ${chainKey} ${short} txCount=${txCount} (${source})`);
    return 0;
  }

  const prev = state[key];
  const delta = txCount - prev;
  state[key] = txCount;

  if (delta > 0) {
    const entry = {
      id: `mq-${Date.now().toString(36)}`,
      alphaWallet: address,
      chain: chainKey,
      newTransfers: delta,
      timestamp: new Date().toISOString(),
      status: "queued",
      watchSource: source,
    };

    if (etherscanAvailable(watcherEnv, chainKey)) {
      try {
        const txs = await etherscanGetOutgoingTxs(watcherEnv, chainKey, address, delta);
        if (txs.length > 0) {
          entry.txHashes = txs.map((tx) => tx.hash);
          entry.alphaTxHash = txs[0].hash;
        }
      } catch (err) {
        console.warn(`[etherscan] ${chainKey} txlist: ${err.message}`);
      }
    }

    const queue = await readJson("mirror-queue.json", []);
    queue.push(entry);
    await writeJson("mirror-queue.json", queue);
    const hashNote = entry.alphaTxHash ? ` tx=${entry.alphaTxHash.slice(0, 10)}…` : "";
    console.log(`[QUEUE] ${chainKey} ${short} +${delta} txs (now ${txCount}, ${source})${hashNote}`);
    return delta;
  }

  console.log(`[scan] ${chainKey} ${short} txCount=${txCount} (${source}, no change)`);
  return 0;
}

async function tick() {
  const started = Date.now();
  const pairs = await loadWatchPairs({ warn: false });
  if (pairs.length === 0) {
    console.log("No wallets to watch. Set ALPHA_WALLET or create an active mirror.");
    return;
  }

  const wallets = [...new Set(pairs.map((p) => p.wallet))];
  const chainKeys = [...new Set(pairs.map((p) => p.chain))];
  console.log(`[tick] polling ${pairs.length} pair(s) · ${wallets.length} wallet(s) · chains=${chainKeys.join(",")}`);

  const state =
    process.env.RESET_STATE === "1"
      ? {}
      : await readJson("watcher-state.json", {});

  let queued = 0;
  let errors = 0;

  const results = await Promise.all(
    pairs.map(async ({ wallet, chain }) => {
      try {
        const delta = await poll(chain, wallet, state);
        return { delta, error: null };
      } catch (err) {
        return {
          delta: 0,
          error: `[error] ${chain} ${wallet.slice(0, 6)}...: ${err.message ?? err}`,
        };
      }
    }),
  );

  for (const { delta, error } of results) {
    if (error) {
      errors++;
      console.error(error);
    } else if (delta > 0) {
      queued++;
    }
  }

  await writeJson("watcher-state.json", state);
  console.log(
    `[tick] done ${Date.now() - started}ms · pairs=${pairs.length} · queued=${queued} · errors=${errors}`,
  );
}

if (process.env.RESET_STATE === "1") {
  await writeJson("watcher-state.json", {});
  console.log("Reset watcher-state.json");
}

try {
  const pairs = await loadWatchPairs({ warn: true });
  const chainKeys = [...new Set(pairs.map((p) => p.chain))];
  const scanMode = etherscanApiKey(watcherEnv) ? "etherscan+rpc" : "rpc";
  console.log(`Watcher v2 started · poll=${POLL_MS}ms · chains=${chainKeys.join(",") || "none"} · watch=${scanMode}`);
  if (pairs.length === 0) {
    console.log("No wallets to watch. Set ALPHA_WALLET or create an active mirror.");
  } else {
    const wallets = [...new Set(pairs.map((p) => p.wallet))];
    console.log(`Watching ${wallets.length} wallet(s) across ${pairs.length} chain pair(s):`);
    for (const w of wallets) console.log(`  · ${w}`);
  }
  if (process.env.ALPHA_WALLET) {
    console.log("(ALPHA_WALLET mode — mirrors.json ignored)");
  }
  if (!process.env.CHAIN && process.env.ALPHA_WALLET) {
    console.log("Tip: set CHAIN=base for faster demos (ethereum public RPC can be slow).");
  }

  await tick();
  setInterval(tick, POLL_MS);
} catch (err) {
  console.error(`Watcher failed to start: ${err.message ?? err}`);
  if (process.env.ALPHA_WALLET) {
    console.error("");
    console.error("ALPHA_WALLET is set in this terminal session. To fix:");
    console.error("  set ALPHA_WALLET=          (clear it — use mirrors.json instead)");
    console.error("  set ALPHA_WALLET=0xYour40CharAddress");
    console.error("  npm run watcher:demo       (Vitalik on Base, no env vars needed)");
  }
  process.exit(1);
}