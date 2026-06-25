/**
 * Deploy MirrorRouter to Base or Arbitrum mainnet (or Base Sepolia testnet).
 *
 *   npm run deploy:router              # Base Sepolia (testnet default)
 *   npm run deploy:router:mainnet      # Base mainnet
 *   npm run deploy:router:arbitrum     # Arbitrum One mainnet
 *   npm run deploy:router:optimism     # Optimism mainnet
 */

import solc from "solc";
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createWalletClient, createPublicClient, http, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum, base, baseSepolia, optimism } from "viem/chains";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const TARGETS = {
  base: {
    chain: base,
    rpc: "https://mainnet.base.org",
    routerEnvKey: "NEXT_PUBLIC_MIRROR_ROUTER_ADDRESS",
    networkMode: "mainnet",
    executionRpcKey: "RPC_URL_EXECUTION",
    executionRpc: "https://mainnet.base.org",
  },
  arbitrum: {
    chain: arbitrum,
    rpc: "https://arb1.arbitrum.io/rpc",
    routerEnvKey: "NEXT_PUBLIC_MIRROR_ROUTER_ARBITRUM",
    networkMode: "mainnet",
    executionRpcKey: "RPC_URL_ARBITRUM_EXECUTION",
    executionRpc: "https://arb1.arbitrum.io/rpc",
  },
  optimism: {
    chain: optimism,
    rpc: "https://mainnet.optimism.io",
    routerEnvKey: "NEXT_PUBLIC_MIRROR_ROUTER_OPTIMISM",
    networkMode: "mainnet",
    executionRpcKey: "RPC_URL_OPTIMISM_EXECUTION",
    executionRpc: "https://mainnet.optimism.io",
  },
  "base-sepolia": {
    chain: baseSepolia,
    rpc: "https://sepolia.base.org",
    routerEnvKey: "NEXT_PUBLIC_MIRROR_ROUTER_ADDRESS",
    networkMode: "testnet",
    executionRpcKey: "RPC_URL_EXECUTION",
    executionRpc: "https://sepolia.base.org",
  },
};

function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function upsertEnvLine(content, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(content)) return content.replace(re, line);
  return `${content.trim()}\n${line}\n`;
}

function compile() {
  const source = readFileSync(path.join(ROOT, "contracts", "MirrorRouter.sol"), "utf-8");
  const input = {
    language: "Solidity",
    sources: { "MirrorRouter.sol": { content: source } },
    settings: {
      outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  if (output.errors?.some((e) => e.severity === "error")) {
    throw new Error(output.errors.map((e) => e.formattedMessage).join("\n"));
  }
  const contract = output.contracts["MirrorRouter.sol"].MirrorRouter;
  return { abi: contract.abi, bytecode: contract.evm.bytecode.object };
}

function resolveDeployTarget() {
  const argChain = process.argv.find((a) => a.startsWith("--chain="))?.split("=")[1];
  if (argChain && TARGETS[argChain]) {
    return { key: argChain, ...TARGETS[argChain] };
  }
  if (process.argv.includes("--arbitrum") || process.env.DEPLOY_CHAIN === "arbitrum") {
    return { key: "arbitrum", ...TARGETS.arbitrum };
  }
  if (process.argv.includes("--optimism") || process.env.DEPLOY_CHAIN === "optimism") {
    return { key: "optimism", ...TARGETS.optimism };
  }

  const rpc = process.env.RPC_URL ?? "https://sepolia.base.org";
  const mainnet =
    process.env.NETWORK_MODE === "mainnet" ||
    process.env.DEPLOY_NETWORK === "mainnet" ||
    rpc.includes("mainnet.base.org");

  if (mainnet) {
    return { key: "base", ...TARGETS.base, rpc: process.env.RPC_URL ?? TARGETS.base.rpc };
  }
  return { key: "base-sepolia", ...TARGETS["base-sepolia"], rpc };
}

loadEnvLocal();

const pk = process.env.DEPLOYER_PRIVATE_KEY;
if (!pk) {
  console.error("Set DEPLOYER_PRIVATE_KEY in .env.local");
  process.exit(1);
}

const target = resolveDeployTarget();
const account = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);
const keeper = process.env.KEEPER_ADDRESS ?? account.address;

const publicClient = createPublicClient({
  chain: target.chain,
  transport: http(target.rpc),
});
const walletClient = createWalletClient({
  account,
  chain: target.chain,
  transport: http(target.rpc),
});

const balance = await publicClient.getBalance({ address: account.address });
console.log(`Deployer ${account.address} on ${target.chain.name}: ${formatEther(balance)} ETH`);
if (balance === 0n) {
  console.error(`\nInsufficient ${target.chain.name} ETH. Fund ${account.address} then re-run.`);
  process.exit(1);
}

const { abi, bytecode } = compile();

const hash = await walletClient.deployContract({
  abi,
  bytecode: `0x${bytecode}`,
  args: [keeper],
});

console.log("Deploy tx:", hash);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
const address = receipt.contractAddress;

console.log("\nMirrorRouter deployed:");
console.log("  network:", target.chain.name);
console.log("  address:", address);
console.log("  keeper:", keeper);

const envPath = path.join(ROOT, ".env.local");
let envContent = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
envContent = upsertEnvLine(envContent, target.routerEnvKey, address);
if (target.key === "base" || target.key === "base-sepolia") {
  envContent = upsertEnvLine(envContent, "NETWORK_MODE", target.networkMode);
  envContent = upsertEnvLine(envContent, "NEXT_PUBLIC_NETWORK_MODE", target.networkMode);
  envContent = upsertEnvLine(envContent, "RPC_URL", target.executionRpc);
  envContent = upsertEnvLine(envContent, target.executionRpcKey, target.executionRpc);
} else {
  envContent = upsertEnvLine(envContent, target.executionRpcKey, target.executionRpc);
}
writeFileSync(envPath, envContent.endsWith("\n") ? envContent : `${envContent}\n`);

console.log(`\nUpdated .env.local (${target.routerEnvKey})`);
if (target.key === "base") {
  console.log("Next: npm run migrate:mainnet -- --skip-deploy");
} else if (target.key === "arbitrum") {
  console.log("Next: npm run migrate:arbitrum -- --skip-deploy");
} else if (target.key === "optimism") {
  console.log("Next: npm run migrate:optimism -- --skip-deploy");
}