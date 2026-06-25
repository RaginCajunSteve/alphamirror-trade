/**
 * Keeper — processes watcher queue into paper/live mirror executions.
 *
 * Env:
 *   POLL_MS=5000
 *   MIRROR_KEEPER_PRIVATE_KEY=0x...  (live executeMirror on deployed router)
 *   RPC_URL_BASE=...
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  createPublicClient,
  createWalletClient,
  fallback,
  getAddress,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { resolveAlphaTxHash } from "../workers/etherscan-client.mjs";

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
const POLL_MS = Number(process.env.POLL_MS ?? 5_000);
const PLATFORM_FEE_BPS = 50;

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

function simulatePnl(tradeUsd, winRate = 0.68) {
  const win = Math.random() < winRate;
  const move = win ? 0.04 + Math.random() * 0.12 : -(0.02 + Math.random() * 0.06);
  return tradeUsd * move;
}

async function recordRevenue(feeUsd) {
  const stats = await readJson("revenue.json", {
    totalFeesUsd: 0,
    totalSubscriptionUsd: 0,
    executionCount: 0,
    lastUpdated: new Date().toISOString(),
  });
  stats.totalFeesUsd += feeUsd;
  stats.executionCount += 1;
  stats.lastUpdated = new Date().toISOString();
  await writeJson("revenue.json", stats);
}

async function processQueueItem(entry, mirrors, routerAddress, walletClient) {
  const alpha = entry.alphaWallet.toLowerCase();
  const matches = mirrors.filter(
    (m) =>
      m.status === "active" &&
      m.alphaWallet.toLowerCase() === alpha &&
      m.allowedChains.includes(entry.chain),
  );

  if (matches.length === 0) {
    console.log(`[skip] ${entry.id} — no active mirrors for ${alpha} on ${entry.chain}`);
    return 0;
  }

  let processed = 0;
  const executions = await readJson("mirror-executions.json", []);
  const queue = await readJson("mirror-queue.json", []);

  for (const mirror of matches) {
    const tradeUsd = Math.min(
      mirror.perTradeCapUsd,
      mirror.perTradeCapUsd * (mirror.userRatioPct / 100) * entry.newTransfers,
    );
    const pnlUsd = simulatePnl(tradeUsd);
    const platformFeeUsd =
      mirror.mode === "live" ? (tradeUsd * PLATFORM_FEE_BPS) / 10_000 : 0;

    const exec = {
      id: `ex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      mirrorId: mirror.id,
      userAddress: mirror.userAddress,
      alphaWallet: mirror.alphaWallet,
      chain: entry.chain,
      mode: mirror.mode,
      queueId: entry.id,
      tradeUsd: Math.round(tradeUsd * 100) / 100,
      pnlUsd: Math.round(pnlUsd * 100) / 100,
      platformFeeUsd: Math.round(platformFeeUsd * 100) / 100,
      timestamp: new Date().toISOString(),
      status: mirror.mode === "live" && routerAddress && walletClient ? "executed" : "simulated",
    };

    if (mirror.mode === "live" && routerAddress && walletClient && publicClient) {
      try {
        const alphaTxHash = resolveAlphaTxHash(entry);
        const hash = await walletClient.writeContract({
          address: routerAddress,
          abi: mirrorRouterAbi,
          functionName: "executeMirror",
          args: [
            getAddress(mirror.userAddress.toLowerCase()),
            getAddress(mirror.alphaWallet.toLowerCase()),
            alphaTxHash,
          ],
        });
        await publicClient.waitForTransactionReceipt({ hash });
        exec.status = "executed";
      } catch (err) {
        exec.status = "failed";
        console.error(`[error] live execute ${mirror.id}: ${err.message ?? err}`);
      }
    }

    executions.push(exec);
    if (platformFeeUsd > 0) await recordRevenue(platformFeeUsd);

    console.log(
      `[EXEC] ${exec.status} ${mirror.mode} ${entry.chain} user=${mirror.userAddress.slice(0, 8)}... trade=$${exec.tradeUsd} pnl=$${exec.pnlUsd} fee=$${exec.platformFeeUsd}`,
    );
    processed++;
  }

  const qIdx = queue.findIndex((q) => q.id === entry.id);
  if (qIdx >= 0) {
    const hasLive = matches.some((m) => m.mode === "live");
    queue[qIdx].status = processed > 0 ? (hasLive ? "executed" : "simulated") : queue[qIdx].status;
  }

  await writeJson("mirror-executions.json", executions.slice(-500));
  await writeJson("mirror-queue.json", queue);
  return processed;
}

async function tick() {
  const started = Date.now();
  const pending = (await readJson("mirror-queue.json", [])).filter(
    (e) => e.status === "queued",
  );
  if (pending.length === 0) {
    console.log(`[tick] ${Date.now() - started}ms · queue=0`);
    return;
  }

  const mirrors = await readJson("mirrors.json", []);
  const routerAddress = process.env.NEXT_PUBLIC_MIRROR_ROUTER_ADDRESS;
  let walletClient;
  let publicClient;

  const pk = process.env.MIRROR_KEEPER_PRIVATE_KEY;
  const mainnet = process.env.NETWORK_MODE === "mainnet";
  const rpc =
    process.env.RPC_URL_EXECUTION ??
    (mainnet ? "https://mainnet.base.org" : "https://sepolia.base.org");
  const execChain = mainnet ? base : baseSepolia;
  if (pk && routerAddress) {
    const account = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);
    const transport = fallback([http(rpc, { timeout: 8_000 })]);
    walletClient = createWalletClient({ account, chain: execChain, transport });
    publicClient = createPublicClient({ chain: execChain, transport });
  }

  let total = 0;
  for (const entry of pending) {
    total += await processQueueItem(entry, mirrors, routerAddress, walletClient);
  }

  console.log(`[tick] ${Date.now() - started}ms · queued=${pending.length} · executed=${total}`);
}

console.log(`Keeper started · poll=${POLL_MS}ms`);
const revenue = await readJson("revenue.json", null);
if (revenue) {
  console.log(
    `Revenue: fees=$${revenue.totalFeesUsd.toFixed(2)} subs=$${revenue.totalSubscriptionUsd.toFixed(2)}`,
  );
}

await tick();
setInterval(tick, POLL_MS);