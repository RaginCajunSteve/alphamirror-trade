/**
 * Bridge native ETH from Ethereum L1 → Arbitrum One via official Delayed Inbox.
 * Usage: node scripts/bridge-eth-to-arbitrum.mjs [amount_eth]
 */

import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  getAddress,
  http,
  parseEther,
} from "viem";
import { arbitrum, mainnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const ARBITRUM_INBOX = getAddress("0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3d");
const inboxAbi = [
  {
    type: "function",
    name: "depositEth",
    stateMutability: "payable",
    inputs: [{ name: "destAddr", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
];

function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!existsSync(envPath)) throw new Error("Missing .env.local");
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    process.env[trimmed.slice(0, eq).trim()] ??= trimmed.slice(eq + 1).trim();
  }
}

loadEnvLocal();

const pk = process.env.DEPLOYER_PRIVATE_KEY;
if (!pk) throw new Error("DEPLOYER_PRIVATE_KEY missing");

const amountEth = process.argv[2] ?? "0.002";
const amount = parseEther(amountEth);
const account = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);

const l1 = createPublicClient({
  chain: mainnet,
  transport: http("https://ethereum.publicnode.com"),
});
const l2 = createPublicClient({
  chain: arbitrum,
  transport: http("https://arb1.arbitrum.io/rpc"),
});
const wallet = createWalletClient({
  account,
  chain: mainnet,
  transport: http("https://ethereum.publicnode.com"),
});

const l1Before = await l1.getBalance({ address: account.address });
const l2Before = await l2.getBalance({ address: account.address });

console.log(`Account: ${account.address}`);
console.log(`L1 ETH before: ${formatEther(l1Before)}`);
console.log(`Arbitrum ETH before: ${formatEther(l2Before)}`);
console.log(`Bridging ${amountEth} ETH → Arbitrum One...`);

const hash = await wallet.writeContract({
  address: ARBITRUM_INBOX,
  abi: inboxAbi,
  functionName: "depositEth",
  args: [account.address],
  value: amount,
});

console.log("L1 deposit tx:", hash);
await l1.waitForTransactionReceipt({ hash });
console.log("L1 confirmed — waiting for Arbitrum balance (up to 20 min)...");

const started = Date.now();
const target = l2Before + amount - parseEther("0.0001");
while (Date.now() - started < 20 * 60_000) {
  const l2Now = await l2.getBalance({ address: account.address });
  console.log(`[Arbitrum] ${formatEther(l2Now)} ETH`);
  if (l2Now >= target) {
    console.log("Bridge complete.");
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 20_000));
}

console.error(
  "Bridge not reflected on Arbitrum yet — check https://bridge.arbitrum.io and retry migrate:arbitrum later.",
);
process.exit(1);