import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEXER_CONFIG = "wrangler.indexer.jsonc";

function readEnv(key) {
  const envPath = path.join(ROOT, ".env.local");
  if (!existsSync(envPath)) return null;
  const match = readFileSync(envPath, "utf-8").match(new RegExp(`^${key}=(.+)$`, "m"));
  return match?.[1]?.trim() ?? null;
}

function putSecret(name, value) {
  console.log(`Setting ${name} on alpha-wallet-indexer...`);
  const r = spawnSync(
    "npx",
    ["wrangler", "secret", "put", name, "-c", INDEXER_CONFIG],
    {
      cwd: ROOT,
      input: value,
      encoding: "utf-8",
      shell: true,
      stdio: ["pipe", "inherit", "inherit"],
    },
  );
  if (r.status !== 0) process.exit(1);
}

const etherscanKey = readEnv("ETHERSCAN_API_KEY");
if (!etherscanKey) {
  console.error("ETHERSCAN_API_KEY missing from .env.local");
  process.exit(1);
}

putSecret("ETHERSCAN_API_KEY", etherscanKey);

const alchemyKey = readEnv("ALCHEMY_API_KEY");
if (alchemyKey) {
  putSecret("ALCHEMY_API_KEY", alchemyKey);
} else {
  console.warn(
    "ALCHEMY_API_KEY missing — add free key from https://dashboard.alchemy.com for Base indexing",
  );
}

const runToken = readEnv("INDEXER_RUN_TOKEN");
if (runToken) {
  putSecret("INDEXER_RUN_TOKEN", runToken);
}

console.log("Indexer secrets uploaded.");