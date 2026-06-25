/**
 * Arbitrum One — deploy MirrorRouter + sync wrangler + deploy workers.
 *
 *   npm run migrate:arbitrum
 *   npm run migrate:arbitrum -- --skip-deploy
 *   npm run migrate:arbitrum -- --config-only
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { createPublicClient, formatEther, http } from "viem";
import { arbitrum } from "viem/chains";

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
  const key = "NEXT_PUBLIC_MIRROR_ROUTER_ARBITRUM";
  if (content.includes(`"${key}"`)) {
    content = content.replace(
      new RegExp(`"${key}":\\s*"[^"]*"`),
      `"${key}": "${routerAddress}"`,
    );
  } else {
    content = content.replace(
      /"NEXT_PUBLIC_MIRROR_ROUTER_ADDRESS":\s*"[^"]*"/,
      `"NEXT_PUBLIC_MIRROR_ROUTER_ADDRESS": "${readRouterFromWrangler(content)}",\n    "${key}": "${routerAddress}"`,
    );
  }
  content = content.replace(
    /"RPC_URL_ARBITRUM_EXECUTION":\s*"[^"]*"/,
    '"RPC_URL_ARBITRUM_EXECUTION": "https://arb1.arbitrum.io/rpc"',
  );
  if (!content.includes("RPC_URL_ARBITRUM_EXECUTION")) {
    content = content.replace(
      /"RPC_URL_ARBITRUM":\s*"[^"]*"/,
      `"RPC_URL_ARBITRUM": "https://arb1.arbitrum.io/rpc",\n    "RPC_URL_ARBITRUM_EXECUTION": "https://arb1.arbitrum.io/rpc"`,
    );
  }
  writeFileSync(filePath, content);
}

function readRouterFromWrangler(content) {
  const m = content.match(/"NEXT_PUBLIC_MIRROR_ROUTER_ADDRESS":\s*"([^"]*)"/);
  return m?.[1] ?? "";
}

function run(cmd, cmdArgs) {
  console.log(`\n> ${cmd} ${cmdArgs.join(" ")}`);
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const { envPath, env } = loadEnvLocal();
const keeperAddress = env.KEEPER_ADDRESS;
if (!keeperAddress) throw new Error("KEEPER_ADDRESS missing in .env.local");

console.log("=== Alpha Mirror — Arbitrum mainnet router ===\n");
console.log(`Keeper: ${keeperAddress}`);

const client = createPublicClient({
  chain: arbitrum,
  transport: http("https://arb1.arbitrum.io/rpc"),
});
const balance = await client.getBalance({ address: keeperAddress });
console.log(`Arbitrum balance: ${formatEther(balance)} ETH`);

if (!configOnly && !skipDeploy) {
  if (Number(formatEther(balance)) < MIN_DEPLOY_ETH) {
    console.error(`
Cannot deploy MirrorRouter on Arbitrum — need ≥ ${MIN_DEPLOY_ETH} ETH on Arbitrum One.

Send Arbitrum ETH to: ${keeperAddress}
  Withdraw from an exchange directly to Arbitrum One, or bridge from Base.

Then re-run:  npm run migrate:arbitrum
Or after manual deploy:router:arbitrum →  npm run migrate:arbitrum -- --skip-deploy
`);
    process.exit(1);
  }
  run("node", ["scripts/deploy-router-arbitrum.mjs"]);
}

const { env: freshEnv } = loadEnvLocal();
const routerAddress = freshEnv.NEXT_PUBLIC_MIRROR_ROUTER_ARBITRUM;
if (!routerAddress) {
  console.error("No Arbitrum router in .env.local. Deploy first.");
  process.exit(1);
}

console.log(`\nArbitrum router: ${routerAddress}`);

upsertEnvFile(envPath, {
  RPC_URL_ARBITRUM_EXECUTION: "https://arb1.arbitrum.io/rpc",
  NEXT_PUBLIC_MIRROR_ROUTER_ARBITRUM: routerAddress,
});

patchWrangler("wrangler.jsonc", routerAddress);
patchWrangler("wrangler.keeper.jsonc", routerAddress);

console.log("Updated wrangler.jsonc + wrangler.keeper.jsonc → Arbitrum router");

if (configOnly) {
  console.log("\n--config-only: skipping worker deploys.");
  process.exit(0);
}

run("npm", ["run", "secrets:keeper"]);
run("npm", ["run", "deploy:keeper"]);
run("npm", ["run", "deploy:cf"]);

console.log(`
=== Arbitrum live execution enabled ===
Router: ${routerAddress} (Arbitrum One)
Keeper: ${keeperAddress} — keep a small ETH float on Arbitrum for live mirror gas
`);