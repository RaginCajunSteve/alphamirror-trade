/**
 * Run the leaderboard indexer on this host (full power) and optionally upload to production KV.
 *
 *   npm run indexer:run
 *   npm run indexer:run:remote
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { runDiscoveryOnly, runLeaderboardIndexer } from "../workers/leaderboard-indexer.mjs";
import { checkSpendApproval } from "../workers/ops/cost-policy.mjs";
import { alchemyTransfersAvailable } from "../workers/indexer/alchemy-tokentx.mjs";
import { indexerDataStack } from "../workers/indexer/transfer-fetch.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data");
const KV_NAMESPACE = "d17fd1e288ee414c9a1b89db3996a7a6";
const REMOTE = process.argv.includes("--remote");
const HUNT = process.argv.includes("--hunt");
const SCORE_ONLY = process.argv.includes("--score-only");
const DISCOVER_ONLY = process.argv.includes("--discover-only");

function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

function createLocalKv(dir) {
  return {
    async get(key, type) {
      const file = path.join(dir, key);
      if (!existsSync(file)) return null;
      const raw = readFileSync(file, "utf-8");
      return type === "json" ? JSON.parse(raw) : raw;
    },
    async put(key, value) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, key), value);
    },
  };
}

function uploadKvFile(key, filePath) {
  const r = spawnSync(
    "npx",
    [
      "wrangler",
      "kv",
      "key",
      "put",
      key,
      `--namespace-id=${KV_NAMESPACE}`,
      "--remote",
      `--path=${filePath}`,
    ],
    {
      cwd: ROOT,
      shell: true,
      stdio: "inherit",
      env: (() => {
        const uploadEnv = { ...process.env };
        delete uploadEnv.CLOUDFLARE_API_TOKEN;
        return uploadEnv;
      })(),
    },
  );
  if (r.status !== 0) process.exit(1);
}

const localEnv = loadEnvLocal();

function assertLocalCostPolicy() {
  const env = { ...process.env, ...localEnv };
  const category = DISCOVER_ONLY
    ? "indexer-discovery"
    : HUNT
      ? "indexer-hunt"
      : SCORE_ONLY
        ? null
        : "indexer-full";
  if (!category) return;
  const result = checkSpendApproval(category, env);
  if (!result.ok) {
    console.error(`\n[cost-guard] ${result.message}\n`);
    process.exit(1);
  }
}

assertLocalCostPolicy();

/** Indexer needs reliable eth_getLogs — avoid rate-limited public Base RPCs from .env.local. */
function indexerRpcUrl(chainKey, ...keys) {
  for (const key of keys) {
    const url = localEnv[key];
    if (!url) continue;
    if (/1rpc\.io|llamarpc\.com|mainnet\.base\.org/i.test(url)) continue;
    return url;
  }
  return undefined;
}

const scoreOnlyChains =
  process.env.INDEXER_WATCH_CHAINS ??
  "ethereum,arbitrum,polygon,unichain,linea,blast";

const env = {
  INDEXER_LOCAL: "1",
  INDEXER_WINRATE_HUNT: HUNT ? "1" : undefined,
  INDEXER_SCORE_ONLY: SCORE_ONLY ? "1" : undefined,
  INDEXER_DISCOVER_ONLY: DISCOVER_ONLY ? "1" : undefined,
  ETHERSCAN_API_KEY: localEnv.ETHERSCAN_API_KEY,
  ALCHEMY_API_KEY: localEnv.ALCHEMY_API_KEY,
  RPC_URL_ETHEREUM: indexerRpcUrl("ethereum", "RPC_URL_ETHEREUM"),
  RPC_URL_BASE:
    indexerRpcUrl("base", "RPC_URL_BASE", "RPC_URL") ?? "https://base-rpc.publicnode.com",
  INDEXER_WATCH_CHAINS: SCORE_ONLY ? scoreOnlyChains : process.env.INDEXER_WATCH_CHAINS,
  RPC_URL_ARBITRUM: indexerRpcUrl("arbitrum", "RPC_URL_ARBITRUM"),
};

if (!env.ETHERSCAN_API_KEY) {
  console.warn("ETHERSCAN_API_KEY missing — ETH/ARB etherscan paths disabled");
}
if (!env.ALCHEMY_API_KEY) {
  console.warn(
    "ALCHEMY_API_KEY missing — Base uses slow RPC crawl; add free key at https://dashboard.alchemy.com",
  );
} else {
  console.log(`Indexer $0 stack: ${JSON.stringify(indexerDataStack(env))}`);
}

const kv = createLocalKv(DATA_DIR);
const modeLabel = DISCOVER_ONLY
  ? "discover-only"
  : SCORE_ONLY
    ? "score-only"
    : HUNT
      ? "win-rate hunt"
      : "full";
console.log(
  `Running ${modeLabel} indexer → ${DATA_DIR}${REMOTE ? " (upload to production KV after)" : ""}`,
);

const meta = DISCOVER_ONLY
  ? await runDiscoveryOnly(kv, env)
  : await runLeaderboardIndexer(kv, env);
console.log("\nIndexer complete:");
console.log(JSON.stringify(meta, null, 2));

if (REMOTE) {
  for (const key of [
    "leaderboard-meta.json",
    "leaderboard-elite.json",
    "leaderboard-candidates.json",
  ]) {
    const filePath = path.join(DATA_DIR, key);
    if (!existsSync(filePath)) continue;
    console.log(`Uploading ${key}…`);
    uploadKvFile(key, filePath);
  }
  console.log("Production KV updated.");
}