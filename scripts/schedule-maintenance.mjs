/**
 * Schedule maintenance (≥24h notice). Emails notify list via production API.
 *
 *   npm run ops:schedule-maintenance -- --title "DB upgrade" --start "2026-06-24T04:00:00Z" --end "2026-06-24T05:00:00Z"
 */
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const title = arg("title");
const startAt = arg("start");
const expectedEndAt = arg("end");
const secret = loadEnvLocal().OPS_ADMIN_SECRET;
const base = loadEnvLocal().NEXT_PUBLIC_APP_URL ?? "https://alphamirror.trade";

if (!title || !startAt || !expectedEndAt) {
  console.error("Usage: --title \"...\" --start ISO --end ISO");
  process.exit(1);
}
if (!secret) {
  console.error("OPS_ADMIN_SECRET missing in .env.local");
  process.exit(1);
}

const res = await fetch(`${base}/api/ops/maintenance`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-ops-secret": secret,
  },
  body: JSON.stringify({ title, startAt, expectedEndAt, notify: true }),
});

const json = await res.json();
if (!res.ok) {
  console.error(json.error ?? res.status);
  process.exit(1);
}

console.log("Scheduled:", json.window.id);
console.log("Status page will show banner 24h before start.");