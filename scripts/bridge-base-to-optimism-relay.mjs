/**
 * Fast bridge ETH Base → Optimism via Relay API.
 * Usage: node scripts/bridge-base-to-optimism-relay.mjs [amount_eth]
 */

import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  http,
  parseEther,
} from "viem";
import { base, optimism } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE_CHAIN_ID = 8453;
const OPTIMISM_CHAIN_ID = 10;
const NATIVE = "0x0000000000000000000000000000000000000000";

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

const amountEth = process.argv[2] ?? "0.0015";
const amountWei = parseEther(amountEth).toString();
const account = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);

const baseClient = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org"),
});
const opClient = createPublicClient({
  chain: optimism,
  transport: http("https://mainnet.optimism.io"),
});
const baseWallet = createWalletClient({
  account,
  chain: base,
  transport: http("https://mainnet.base.org"),
});

const opBefore = await opClient.getBalance({ address: account.address });
console.log(`Account: ${account.address}`);
console.log(`Optimism before: ${formatEther(opBefore)} ETH`);
console.log(`Requesting Relay quote: ${amountEth} ETH Base → Optimism...`);

const quoteRes = await fetch("https://api.relay.link/quote/v2", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    user: account.address,
    originChainId: BASE_CHAIN_ID,
    destinationChainId: OPTIMISM_CHAIN_ID,
    originCurrency: NATIVE,
    destinationCurrency: NATIVE,
    amount: amountWei,
    tradeType: "EXACT_INPUT",
  }),
});

if (!quoteRes.ok) {
  console.error("Relay quote failed:", quoteRes.status, await quoteRes.text());
  process.exit(1);
}

const quote = await quoteRes.json();
const txStep = quote.steps?.find((s) => s.kind === "transaction");
const txItem = txStep?.items?.[0]?.data;
const requestId = txStep?.requestId;
if (!txItem?.to) {
  console.error("No executable tx in quote:", JSON.stringify(quote, null, 2));
  process.exit(1);
}

console.log("Relay requestId:", requestId);
const hash = await baseWallet.sendTransaction({
  to: txItem.to,
  data: txItem.data,
  value: BigInt(txItem.value ?? 0),
  maxFeePerGas: txItem.maxFeePerGas ? BigInt(txItem.maxFeePerGas) : undefined,
  maxPriorityFeePerGas: txItem.maxPriorityFeePerGas
    ? BigInt(txItem.maxPriorityFeePerGas)
    : undefined,
  chain: base,
});

console.log("Base tx:", hash);
await baseClient.waitForTransactionReceipt({ hash });
console.log("Base confirmed — polling Relay status (up to 5 min)...");

const started = Date.now();
const target = opBefore + parseEther(amountEth) - parseEther("0.0002");
while (Date.now() - started < 5 * 60_000) {
  if (requestId) {
    const statusRes = await fetch(
      `https://api.relay.link/intents/status?requestId=${requestId}`,
    );
    if (statusRes.ok) {
      const status = await statusRes.json();
      console.log("Relay status:", status.status ?? status);
      if (status.status === "success") break;
    }
  }
  const opNow = await opClient.getBalance({ address: account.address });
  console.log(`[Optimism] ${formatEther(opNow)} ETH`);
  if (opNow >= target) {
    console.log("Bridge complete.");
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 10_000));
}

const final = await opClient.getBalance({ address: account.address });
if (final >= target) {
  console.log("Bridge complete.");
  process.exit(0);
}

console.error("Relay bridge not complete yet — retry migrate:optimism when Optimism balance updates.");
process.exit(1);