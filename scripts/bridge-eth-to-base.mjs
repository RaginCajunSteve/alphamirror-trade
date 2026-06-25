/**
 * Bridge native ETH from Ethereum L1 → Base L2 via official L1StandardBridge.
 * Usage: node scripts/bridge-eth-to-base.mjs [amount_eth]
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
import { base, mainnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const L1_STANDARD_BRIDGE = getAddress("0x3154Cf16ccdb4C6d922629664174b904d80F2C35");
const bridgeAbi = [
  {
    type: "function",
    name: "depositETH",
    stateMutability: "payable",
    inputs: [
      { name: "_minGasLimit", type: "uint32" },
      { name: "_extraData", type: "bytes" },
    ],
    outputs: [],
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

const amountEth = process.argv[2] ?? "0.005";
const amount = parseEther(amountEth);
const account = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);

const l1 = createPublicClient({
  chain: mainnet,
  transport: http("https://ethereum.publicnode.com"),
});
const l2 = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org"),
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
console.log(`Base ETH before: ${formatEther(l2Before)}`);
console.log(`Bridging ${amountEth} ETH → Base...`);

const hash = await wallet.writeContract({
  address: L1_STANDARD_BRIDGE,
  abi: bridgeAbi,
  functionName: "depositETH",
  args: [200_000, "0x"],
  value: amount,
});

console.log("L1 deposit tx:", hash);
await l1.waitForTransactionReceipt({ hash });
console.log("L1 confirmed — waiting for Base balance (up to 10 min)...");

const started = Date.now();
const target = l2Before + amount;
while (Date.now() - started < 10 * 60_000) {
  const l2Now = await l2.getBalance({ address: account.address });
  console.log(`[Base] ${formatEther(l2Now)} ETH`);
  if (l2Now >= target) {
    console.log("Bridge complete.");
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 15_000));
}

console.error("Bridge not reflected on Base yet — check https://bridge.base.org and retry migrate later.");
process.exit(1);