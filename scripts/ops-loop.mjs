/**
 * Run one ops-loop cycle locally (reads/writes production KV).
 *   npm run ops:run
 */
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runOpsLoop } from "../workers/ops-loop.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

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

const local = loadEnvLocal();
const env = {
  NEXT_PUBLIC_APP_URL: local.NEXT_PUBLIC_APP_URL ?? "https://alphamirror.trade",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: local.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  OPS_ADMIN_SECRET: local.OPS_ADMIN_SECRET,
};

const { spawnSync } = await import("child_process");

function remoteKvGet(key) {
  const tmp = path.join(ROOT, "data", `.ops-tmp-${key}`);
  const args = [
    "wrangler", "kv", "key", "get", key,
    "--namespace-id=d17fd1e288ee414c9a1b89db3996a7a6",
    "--remote",
    `--path=${tmp}`,
  ];
  const r = spawnSync("npx", args, { cwd: ROOT, shell: true, encoding: "utf-8" });
  if (r.status !== 0) {
    if (r.stdout?.includes("not found") || r.stderr?.includes("not found")) return null;
    return null;
  }
  if (!existsSync(tmp)) return null;
  return readFileSync(tmp, "utf-8");
}

function remoteKvPut(key, filePath) {
  const r = spawnSync(
    "npx",
    [
      "wrangler", "kv", "key", "put", key,
      "--namespace-id=d17fd1e288ee414c9a1b89db3996a7a6",
      "--remote",
      `--path=${filePath}`,
    ],
    { cwd: ROOT, shell: true, encoding: "utf-8" },
  );
  if (r.status !== 0) throw new Error(`KV put ${key} failed`);
}

const kv = {
  async get(key, type) {
    const raw = remoteKvGet(key);
    if (raw == null) return null;
    return type === "json" ? JSON.parse(raw) : raw;
  },
  async put(key, value) {
    const tmp = path.join(ROOT, "data", `.ops-tmp-${key}`);
    const { writeFileSync, mkdirSync } = await import("fs");
    mkdirSync(path.dirname(tmp), { recursive: true });
    writeFileSync(tmp, value);
    remoteKvPut(key, tmp);
  },
};

console.log("Running ops loop against production KV…");
const result = await runOpsLoop(kv, env);
console.log(JSON.stringify(result, null, 2));