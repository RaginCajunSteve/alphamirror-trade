import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const KEEPER_CONFIG = "wrangler.keeper.jsonc";

function readEnv(key) {
  const envPath = path.join(ROOT, ".env.local");
  if (!existsSync(envPath)) return null;
  const match = readFileSync(envPath, "utf-8").match(new RegExp(`^${key}=(.+)$`, "m"));
  return match?.[1]?.trim() ?? null;
}

function putSecret(name, value) {
  console.log(`Setting ${name} on alpha-wallet-keeper...`);
  const r = spawnSync(
    "npx",
    ["wrangler", "secret", "put", name, "-c", KEEPER_CONFIG],
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

const keeperKey = readEnv("MIRROR_KEEPER_PRIVATE_KEY");
if (!keeperKey) {
  console.error("MIRROR_KEEPER_PRIVATE_KEY missing from .env.local");
  process.exit(1);
}

putSecret("MIRROR_KEEPER_PRIVATE_KEY", keeperKey);

const etherscanKey = readEnv("ETHERSCAN_API_KEY");
if (etherscanKey) {
  putSecret("ETHERSCAN_API_KEY", etherscanKey);
} else {
  console.warn("ETHERSCAN_API_KEY missing from .env.local — keeper will use RPC-only watching.");
}

console.log("Keeper secrets uploaded.");