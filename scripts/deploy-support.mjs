import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync, writeFileSync } from "fs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const deployLog = spawnSync("npx", ["wrangler", "deploy", "-c", "wrangler.support.jsonc"], {
  cwd: ROOT,
  encoding: "utf-8",
  shell: true,
});

process.stdout.write(deployLog.stdout ?? "");
process.stderr.write(deployLog.stderr ?? "");
if ((deployLog.status ?? 1) !== 0) process.exit(deployLog.status ?? 1);

const combined = `${deployLog.stdout ?? ""}${deployLog.stderr ?? ""}`;
const match = combined.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/i);
const workerUrl = match?.[0] ?? "https://alpha-wallet-support.alpha-wallet.workers.dev";

function upsertEnvLocal(key, value) {
  const envPath = path.join(ROOT, ".env.local");
  let content = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  const re = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${value}`;
  content = re.test(content) ? content.replace(re, line) : `${content.trimEnd()}\n${line}\n`;
  writeFileSync(envPath, content);
}

const wranglerPath = path.join(ROOT, "wrangler.jsonc");
let wrangler = readFileSync(wranglerPath, "utf-8");
const varLine = `"NEXT_PUBLIC_SUPPORT_AGENT_URL": "${workerUrl}"`;
if (wrangler.includes("NEXT_PUBLIC_SUPPORT_AGENT_URL")) {
  wrangler = wrangler.replace(/"NEXT_PUBLIC_SUPPORT_AGENT_URL":\s*"[^"]*"/, varLine);
} else {
  wrangler = wrangler.replace(/"vars":\s*\{/, `"vars": {\n    ${varLine},`);
}
writeFileSync(wranglerPath, wrangler);
upsertEnvLocal("NEXT_PUBLIC_SUPPORT_AGENT_URL", workerUrl);

console.log(`\nSupport agent URL: ${workerUrl}`);
console.log("Updated wrangler.jsonc + .env.local NEXT_PUBLIC_SUPPORT_AGENT_URL");