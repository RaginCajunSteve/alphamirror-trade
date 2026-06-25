import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function readEnv(key) {
  const envPath = path.join(ROOT, ".env.local");
  if (!existsSync(envPath)) return null;
  const match = readFileSync(envPath, "utf-8").match(new RegExp(`^${key}=(.+)$`, "m"));
  return match?.[1]?.trim() ?? null;
}

function putSecret(name, value) {
  console.log(`Setting ${name}...`);
  const r = spawnSync("npx", ["wrangler", "secret", "put", name], {
    cwd: ROOT,
    input: value,
    encoding: "utf-8",
    shell: true,
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (r.status !== 0) process.exit(1);
}

const secretKey = readEnv("STRIPE_SECRET_KEY");
const webhookSecret = readEnv("STRIPE_WEBHOOK_SECRET");

if (!secretKey) {
  console.error("STRIPE_SECRET_KEY missing from .env.local");
  process.exit(1);
}
putSecret("STRIPE_SECRET_KEY", secretKey);
if (webhookSecret) putSecret("STRIPE_WEBHOOK_SECRET", webhookSecret);
else console.warn("STRIPE_WEBHOOK_SECRET not in .env.local — skip");

console.log("Stripe secrets uploaded.");