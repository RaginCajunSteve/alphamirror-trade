/**
 * Base mainnet migration orchestrator.
 *
 *   npm run migrate:mainnet              # deploy router (if funded) + flip configs + deploy workers
 *   npm run migrate:mainnet -- --skip-deploy   # configs + deploy only (router already deployed)
 *   npm run migrate:mainnet -- --config-only   # update wrangler/.env only
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { createPublicClient, formatEther, http } from "viem";
import { base } from "viem/chains";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const SEPOLIA_ROUTER = "0xefe995d1f4ff06dc0cf08d1bcbdae74e5f99deb4";
const MIN_DEPLOY_ETH = 0.00005;

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
  content = content.replace(
    /"NEXT_PUBLIC_NETWORK_MODE":\s*"(testnet|mainnet)"/,
    '"NEXT_PUBLIC_NETWORK_MODE": "mainnet"',
  );
  content = content.replace(
    /"NETWORK_MODE":\s*"(testnet|mainnet)"/,
    '"NETWORK_MODE": "mainnet"',
  );
  content = content.replace(
    /"RPC_URL_EXECUTION":\s*"[^"]*"/,
    '"RPC_URL_EXECUTION": "https://mainnet.base.org"',
  );
  content = content.replace(
    /"NEXT_PUBLIC_MIRROR_ROUTER_ADDRESS":\s*"[^"]*"/,
    `"NEXT_PUBLIC_MIRROR_ROUTER_ADDRESS": "${routerAddress}"`,
  );
  writeFileSync(filePath, content);
}

function run(cmd, cmdArgs) {
  console.log(`\n> ${cmd} ${cmdArgs.join(" ")}`);
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const { envPath, env } = loadEnvLocal();
const keeperAddress = env.KEEPER_ADDRESS;
if (!keeperAddress) throw new Error("KEEPER_ADDRESS missing in .env.local");

console.log("=== Alpha Mirror — Base mainnet migration ===\n");
console.log(`Keeper: ${keeperAddress}`);

const client = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org"),
});
const balance = await client.getBalance({ address: keeperAddress });
const eth = Number(formatEther(balance));
console.log(`Base mainnet balance: ${formatEther(balance)} ETH`);

if (!configOnly && !skipDeploy) {
  if (eth < MIN_DEPLOY_ETH) {
    console.error(`
Cannot deploy MirrorRouter — need ≥ ${MIN_DEPLOY_ETH} ETH on Base mainnet.

Send Base ETH to: ${keeperAddress}
  Bridge: https://bridge.base.org
  Buy/withdraw to Base from an exchange

Then re-run:  npm run migrate:mainnet
Or after manual deploy:router:mainnet →  npm run migrate:mainnet -- --skip-deploy
`);
    process.exit(1);
  }
  process.env.NETWORK_MODE = "mainnet";
  process.env.DEPLOY_NETWORK = "mainnet";
  process.env.RPC_URL = "https://mainnet.base.org";
  run("node", ["scripts/deploy-mirror-router.mjs"]);
}

const { env: freshEnv } = loadEnvLocal();
const routerAddress = freshEnv.NEXT_PUBLIC_MIRROR_ROUTER_ADDRESS;
const onMainnet = freshEnv.NETWORK_MODE === "mainnet" || freshEnv.NEXT_PUBLIC_NETWORK_MODE === "mainnet";
if (!routerAddress || (!onMainnet && routerAddress === SEPOLIA_ROUTER)) {
  console.error(
    "No mainnet router address in .env.local. Deploy first or pass --skip-deploy after deploy:router:mainnet",
  );
  process.exit(1);
}

console.log(`\nRouter: ${routerAddress} (was Sepolia ${SEPOLIA_ROUTER})`);

upsertEnvFile(envPath, {
  NETWORK_MODE: "mainnet",
  NEXT_PUBLIC_NETWORK_MODE: "mainnet",
  RPC_URL: "https://mainnet.base.org",
  RPC_URL_EXECUTION: "https://mainnet.base.org",
  NEXT_PUBLIC_MIRROR_ROUTER_ADDRESS: routerAddress,
});

patchWrangler("wrangler.jsonc", routerAddress);
patchWrangler("wrangler.keeper.jsonc", routerAddress);

console.log("Updated wrangler.jsonc + wrangler.keeper.jsonc → mainnet");

if (configOnly) {
  console.log("\n--config-only: skipping worker deploys.");
  process.exit(0);
}

run("npm", ["run", "secrets:keeper"]);
run("npm", ["run", "deploy:keeper"]);
run("npm", ["run", "deploy:cf"]);

console.log(`
=== Migration complete ===
Site:     https://alphamirror.trade/dashboard
Router:   ${routerAddress} (Base mainnet)
Keeper:   ${keeperAddress} — keep ≥ 0.01 ETH on Base for live mirror gas

Smoke test: create a small live mirror on Base, watch dashboard for status "executed".
`);