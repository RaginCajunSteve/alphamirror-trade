import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(ROOT, ".env.local");
if (!existsSync(envPath)) {
  console.error(".env.local not found");
  process.exit(1);
}

let secret;
for (const line of readFileSync(envPath, "utf-8").split("\n")) {
  const t = line.trim();
  if (t.startsWith("OPS_ADMIN_SECRET=")) {
    secret = t.slice("OPS_ADMIN_SECRET=".length).trim();
    break;
  }
}

if (!secret) {
  console.warn("OPS_ADMIN_SECRET missing — skip (add to .env.local, then npm run secrets:ops)");
  process.exit(0);
}

for (const cfg of ["wrangler.jsonc", "wrangler.ops-loop.jsonc"]) {
  const r = spawnSync(
    "npx",
    ["wrangler", "secret", "put", "OPS_ADMIN_SECRET", "-c", cfg],
    { cwd: ROOT, input: secret, encoding: "utf-8", shell: true, stdio: ["pipe", "inherit", "inherit"] },
  );
  if (r.status !== 0) process.exit(1);
  console.log(`OPS_ADMIN_SECRET → ${cfg}`);
}