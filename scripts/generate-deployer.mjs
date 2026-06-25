/**
 * Generate a fresh testnet deployer wallet and write .env.local
 * Run: node scripts/generate-deployer.mjs
 */

import { writeFile, readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);

let existing = "";
try {
  existing = await readFile(envPath, "utf-8");
} catch {
  /* new file */
}

const lines = existing.split("\n").filter((line) => {
  const key = line.split("=")[0]?.trim();
  return ![
    "DEPLOYER_PRIVATE_KEY",
    "MIRROR_KEEPER_PRIVATE_KEY",
    "KEEPER_ADDRESS",
    "RPC_URL",
  ].includes(key);
});

const block = [
  "# Testnet deployer — generated locally, never commit",
  `DEPLOYER_PRIVATE_KEY=${privateKey}`,
  `MIRROR_KEEPER_PRIVATE_KEY=${privateKey}`,
  `KEEPER_ADDRESS=${account.address}`,
  "RPC_URL=https://sepolia.base.org",
  "",
];

const content = [...lines.filter((l) => l.trim()), ...block].join("\n").trim() + "\n";
await writeFile(envPath, content, "utf-8");

console.log("Deployer wallet generated.");
console.log(`Address: ${account.address}`);
console.log(`Saved to: ${envPath}`);
console.log("");
console.log("Next: fund this address with Base Sepolia testnet ETH, then run:");
console.log("  npm run deploy:router");