/**
 * Poll Base mainnet balance, run full migration when funded.
 * Usage: npm run wait:mainnet-fund
 */

import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createPublicClient, formatEther, http } from "viem";
import { base } from "viem/chains";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const envPath = path.join(ROOT, ".env.local");
const POLL_MS = 20_000;
const MAX_WAIT_MS = 30 * 60_000;
const MIN_ETH = 0.00005;

function loadKeeperAddress() {
  if (!existsSync(envPath)) throw new Error("Missing .env.local");
  const match = readFileSync(envPath, "utf-8").match(/^KEEPER_ADDRESS=(0x[a-fA-F0-9]+)/m);
  if (!match) throw new Error("KEEPER_ADDRESS missing");
  return match[1];
}

const address = loadKeeperAddress();
const client = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org"),
});

console.log(`Waiting for Base mainnet ETH on ${address}`);
console.log("Bridge: https://bridge.base.org");
console.log("");

const started = Date.now();
while (Date.now() - started < MAX_WAIT_MS) {
  const bal = await client.getBalance({ address });
  const eth = Number(formatEther(bal));
  console.log(`[balance] ${formatEther(bal)} ETH`);
  if (eth >= MIN_ETH) {
    console.log("Funded — running migration...");
    const r = spawnSync("node", ["scripts/migrate-base-mainnet.mjs"], {
      cwd: ROOT,
      stdio: "inherit",
      shell: true,
    });
    process.exit(r.status ?? 0);
  }
  await new Promise((r) => setTimeout(r, POLL_MS));
}

console.error("Timed out. Fund the address and run: npm run migrate:mainnet");
process.exit(1);