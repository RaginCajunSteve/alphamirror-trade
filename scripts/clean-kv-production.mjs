/**
 * Remove smoke-test / demo clutter from production KV.
 * Keeps real user mirrors (0x1A3F...) and subscriptions; drops SmokeTest + demo queue.
 *
 *   node scripts/clean-kv-production.mjs --dry-run
 *   node scripts/clean-kv-production.mjs
 */

import { readFileSync, writeFileSync, unlinkSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const KV_ID = "d17fd1e288ee414c9a1b89db3996a7a6";
const DRY = process.argv.includes("--dry-run");

const SMOKE_USER = "0xsmoketest000000000000000000000000000001";
const DEMO_QUEUE_IDS = new Set(["mq-demo001"]);

function wranglerKvGet(key) {
  const r = spawnSync(
    "npx",
    ["wrangler", "kv", "key", "get", key, "--namespace-id", KV_ID, "--remote"],
    { cwd: ROOT, encoding: "utf-8", shell: true },
  );
  if (r.status !== 0 || r.stdout.includes("Value not found")) return null;
  return r.stdout.replace(/^\uFEFF/, "").trim();
}

function wranglerKvPut(key, value) {
  const tmp = path.join(__dirname, `_kv-clean-${key}`);
  writeFileSync(tmp, value, "utf-8");
  const r = spawnSync(
    "npx",
    ["wrangler", "kv", "key", "put", key, `--path=${tmp}`, "--namespace-id", KV_ID, "--remote"],
    { cwd: ROOT, encoding: "utf-8", shell: true, stdio: DRY ? "pipe" : "inherit" },
  );
  try {
    unlinkSync(tmp);
  } catch {
    /* ignore */
  }
  if (r.status !== 0) throw new Error(`KV put failed: ${key}`);
}

function isSmokeUser(addr) {
  return addr?.toLowerCase() === SMOKE_USER;
}

function cleanMirrors(raw) {
  const mirrors = JSON.parse(raw ?? "[]");
  const kept = mirrors.filter(
    (m) => !isSmokeUser(m.userAddress) && m.id !== "mirror-launch-smoke",
  );
  return { kept, removed: mirrors.length - kept.length };
}

function cleanQueue(raw) {
  const queue = JSON.parse(raw ?? "[]");
  const kept = queue.filter((q) => !DEMO_QUEUE_IDS.has(q.id) && !q.id?.startsWith("mq-smoke-"));
  return { kept, removed: queue.length - kept.length };
}

function cleanExecutions(raw) {
  const executions = JSON.parse(raw ?? "[]");
  const kept = executions.filter((e) => !isSmokeUser(e.userAddress) && !e.id?.startsWith("ex-smoke-"));
  return { kept, removed: executions.length - kept.length };
}

function cleanFeedback(raw) {
  const feedback = JSON.parse(raw ?? "[]");
  const kept = feedback.filter((f) => f.page !== "/ship-test");
  return { kept, removed: feedback.length - kept.length };
}

function cleanSubscriptions(raw) {
  const subs = JSON.parse(raw ?? "{}");
  if (typeof subs !== "object" || Array.isArray(subs)) return { kept: subs, removed: 0 };
  const kept = { ...subs };
  let removed = 0;
  for (const key of Object.keys(kept)) {
    if (isSmokeUser(key)) {
      delete kept[key];
      removed++;
    }
  }
  return { kept, removed };
}

const keys = [
  ["mirrors.json", cleanMirrors],
  ["mirror-queue.json", cleanQueue],
  ["mirror-executions.json", cleanExecutions],
  ["feedback.json", cleanFeedback],
  ["subscriptions.json", cleanSubscriptions],
];

for (const [key, cleaner] of keys) {
  const raw = wranglerKvGet(key);
  if (!raw) {
    console.log(`${key}: (empty)`);
    continue;
  }
  const { kept, removed } = cleaner(raw);
  console.log(`${key}: remove ${removed}, keep ${Array.isArray(kept) ? kept.length : Object.keys(kept).length}`);
  if (!DRY && removed > 0) {
    wranglerKvPut(key, JSON.stringify(kept));
  }
}

console.log(DRY ? "\nDry run — no changes written" : "\nProduction KV cleaned");