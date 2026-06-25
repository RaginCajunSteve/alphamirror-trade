/**
 * Optimism mainnet — deploy MirrorRouter + sync wrangler + deploy workers.
 *
 *   npm run migrate:optimism
 *   npm run migrate:optimism -- --skip-deploy
 *   npm run migrate:optimism -- --config-only
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { createPublicClient, formatEther, http } from "viem";
import { optimism } from "viem/chains";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIN_DEPLOY_ETH = 0.00002;

const args = process.argv.slice(2);
const skipDeploy = args.includes("--skip-deploy");
const configOnly = args.includes("--config-only");

function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!existsSync(envPath)) throw new Error("Missing .env.local");
  const env = {};
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return { envPath, env };
}

function upsertEnvFile(envPath, updates) {
  let content = readFileSync(envPath, "utf-8");
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    content = re.test(content) ? content.replace(re, line) : `${content.trim()}\n${line}\n`;
  }
  writeFileSync(envPath, content.endsWith("\n") ? content : `${content}\n`);
}

function patchWrangler(pathname, routerAddress) {
  const filePath = path.join(ROOT, pathname);
  let content = readFileSync(filePath, "utf-8");
  const key = "NEXT_PUBLIC_MIRROR_ROUTER_OPTIMISM";
  if (content.includes(`"${key}"`)) {
    content = content.replace(
      new RegExp(`"${key}":\\s*"[^"]*"`),
      `"${key}": "${routerAddress}"`,
    );
  } else {
    content = content.replace(
      /"NEXT_PUBLIC_MIRROR_ROUTER_ARBITRUM":\s*"[^"]*"/,
      `"NEXT_PUBLIC_MIRROR_ROUTER_ARBITRUM": "${readArbRouter(content)}",\n    "${key}": "${routerAddress}"`,
    );
  }
  content = content.replace(
    /"RPC_URL_OPTIMISM_EXECUTION":\s*"[^"]*"/,
    '"RPC_URL_OPTIMISM_EXECUTION": "https://mainnet.optimism.io"',
  );
  if (!content.includes("RPC_URL_OPTIMISM_EXECUTION")) {
    if (content.includes('"RPC_URL_OPTIMISM"')) {
      content = content.replace(
        /"RPC_URL_OPTIMISM":\s*"[^"]*"/,
        `"RPC_URL_OPTIMISM": "https://mainnet.optimism.io",\n    "RPC_URL_OPTIMISM_EXECUTION": "https://mainnet.optimism.io"`,
      );
    } else {
      content = content.replace(
        /"RPC_URL_ARBITRUM_EXECUTION":\s*"[^"]*"/,
        `"RPC_URL_ARBITRUM_EXECUTION": "${readArbRpc(content)}",\n    "RPC_URL_OPTIMISM": "https://mainnet.optimism.io",\n    "RPC_URL_OPTIMISM_EXECUTION": "https://mainnet.optimism.io"`,
      );
    }
  }
  writeFileSync(filePath, content);
}

function readArbRouter(content) {
  const m = content.match(/"NEXT_PUBLIC_MIRROR_ROUTER_ARBITRUM":\s*"([^"]*)"/);
  return m?.[1] ?? "";
}

function readArbRpc(content) {
  const m = content.match(/"RPC_URL_ARBITRUM_EXECUTION":\s*"([^"]*)"/);
  return m?.[1] ?? "https://arb1.arbitrum.io/rpc";
}

function run(cmd, cmdArgs) {
  console.log(`\n> ${cmd} ${cmdArgs.join(" ")}`);
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const { envPath, env } = loadEnvLocal();
const keeperAddress = env.KEEPER_ADDRESS;
if (!keeperAddress) throw new Error("KEEPER_ADDRESS missing in .env.local");

console.log("=== Alpha Mirror — Optimism mainnet router ===\n");
console.log(`Keeper: ${keeperAddress}`);

const client = createPublicClient({
  chain: optimism,
  transport: http("https://mainnet.optimism.io"),
});
const balance = await client.getBalance({ address: keeperAddress });
console.log(`Optimism balance: ${formatEther(balance)} ETH`);

if (!configOnly && !skipDeploy) {
  if (Number(formatEther(balance)) < MIN_DEPLOY_ETH) {
    console.error(`
Cannot deploy MirrorRouter on Optimism — need ≥ ${MIN_DEPLOY_ETH} ETH on Optimism.

Send Optimism ETH to: ${keeperAddress}
  Bridge from Base: node scripts/bridge-base-to-optimism-relay.mjs 0.0015

Then re-run:  npm run migrate:optimism
Or after manual deploy:router:optimism →  npm run migrate:optimism -- --skip-deploy
`);
    process.exit(1);
  }
  run("node", ["scripts/deploy-router-optimism.mjs"]);
}

const { env: freshEnv } = loadEnvLocal();
const routerAddress = freshEnv.NEXT_PUBLIC_MIRROR_ROUTER_OPTIMISM;
if (!routerAddress) {
  console.error("No Optimism router in .env.local. Deploy first.");
  process.exit(1);
}

console.log(`\nOptimism router: ${routerAddress}`);

upsertEnvFile(envPath, {
  RPC_URL_OPTIMISM_EXECUTION: "https://mainnet.optimism.io",
  NEXT_PUBLIC_MIRROR_ROUTER_OPTIMISM: routerAddress,
});

patchWrangler("wrangler.jsonc", routerAddress);
patchWrangler("wrangler.keeper.jsonc", routerAddress);

console.log("Updated wrangler.jsonc + wrangler.keeper.jsonc → Optimism router");

if (configOnly) {
  console.log("\n--config-only: skipping worker deploys.");
  process.exit(0);
}

run("npm", ["run", "secrets:keeper"]);
run("npm", ["run", "deploy:keeper"]);
run("npm", ["run", "deploy:cf"]);

console.log(`
=== Optimism live execution enabled ===
Router: ${routerAddress} (Optimism mainnet)
Keeper: ${keeperAddress} — keep a small ETH float on Optimism for live mirror gas
`);