/**
 * Upload local data/*.json to Cloudflare KV (after wrangler kv namespace create).
 * Usage: npx wrangler kv bulk put --namespace-id=ID --remote scripts/kv-bulk.json
 * Or: node scripts/upload-kv.mjs (writes bulk file + prints command)
 */

import { readFile, readdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
const outFile = path.join(__dirname, "kv-bulk.json");

const files = (await readdir(dataDir)).filter((f) => f.endsWith(".json"));
const bulk = [];

for (const file of files) {
  const raw = await readFile(path.join(dataDir, file), "utf-8");
  bulk.push({ key: file, value: raw });
}

await writeFile(outFile, JSON.stringify(bulk), "utf-8");
console.log(`Wrote ${bulk.length} keys to ${outFile}`);
console.log("");
console.log("Upload with:");
console.log("  npx wrangler kv bulk put --namespace-id=YOUR_KV_ID --remote scripts/kv-bulk.json");