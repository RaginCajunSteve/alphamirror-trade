/**
 * Poll Base Sepolia balance, deploy MirrorRouter when funded.
 * Usage: node scripts/wait-and-deploy.mjs
 */

import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createPublicClient, formatEther, http } from "viem";
import { baseSepolia } from "viem/chains";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
const POLL_MS = 15_000;
const MAX_WAIT_MS = 10 * 60_000;

function loadEnv() {
  if (!existsSync(envPath)) throw new Error("Missing .env.local — run npm run generate:deployer");
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    process.env[trimmed.slice(0, eq).trim()] ??= trimmed.slice(eq + 1).trim();
  }
}

loadEnv();

const address = process.env.KEEPER_ADDRESS;
if (!address) throw new Error("KEEPER_ADDRESS missing in .env.local");

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.RPC_URL ?? "https://sepolia.base.org"),
});

console.log(`Waiting for Base Sepolia ETH on ${address}`);
console.log("Fund via: https://www.alchemy.com/faucets/base-sepolia");
console.log("       or: https://faucet.quicknode.com/base/sepolia");
console.log("");

const started = Date.now();
while (Date.now() - started < MAX_WAIT_MS) {
  const bal = await client.getBalance({ address });
  const eth = formatEther(bal);
  console.log(`[balance] ${eth} ETH`);
  if (bal > 0n) {
    console.log("Funded — deploying MirrorRouter...");
    await import("./deploy-mirror-router.mjs");
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, POLL_MS));
}

console.error("Timed out waiting for faucet funds. Fund the address and run: npm run deploy:router");
process.exit(1);