/**
 * Print funding instructions for deployer/keeper wallet.
 * Usage: node scripts/fund-deployer.mjs [--mainnet]
 */

import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
const mainnet = process.argv.includes("--mainnet");

if (!existsSync(envPath)) {
  console.error("Run npm run generate:deployer first");
  process.exit(1);
}

const env = readFileSync(envPath, "utf-8");
const address = env.match(/KEEPER_ADDRESS=(0x[a-fA-F0-9]+)/)?.[1];
if (!address) {
  console.error("KEEPER_ADDRESS missing in .env.local");
  process.exit(1);
}

if (mainnet) {
  console.log("Fund this keeper/deployer on Base MAINNET:");
  console.log(`  ${address}`);
  console.log("");
  console.log("Send ≥ 0.01 ETH on Base for router deploy + keeper gas.");
  console.log("  Bridge: https://bridge.base.org");
  console.log("  Buy on Coinbase/other exchange → withdraw to Base network");
  console.log("");
  console.log("After funding:");
  console.log("  npm run migrate:mainnet");
  console.log("  npm run wait:mainnet-fund   (polls until funded, then migrates)");
} else {
  console.log("Fund this deployer on Base Sepolia (testnet):");
  console.log(`  ${address}`);
  console.log("");
  console.log("Faucets:");
  console.log("  1. https://portal.cdp.coinbase.com/products/faucet");
  console.log("  2. https://www.alchemy.com/faucets/base-sepolia");
  console.log("");
  console.log("After funding: npm run deploy:router");
  const url = "https://portal.cdp.coinbase.com/products/faucet";
  const cmd =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, () => {});
}