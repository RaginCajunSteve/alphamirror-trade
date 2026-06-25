/**
 * Create Turnstile widget for alphamirror.trade and save keys to .env.local + wrangler.jsonc
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ACCOUNT_ID = "5d39e0d1c74578fc6762947412e84add";
const DOMAIN = "alphamirror.trade";

function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function upsertEnv(key, value) {
  const envPath = path.join(ROOT, ".env.local");
  let content = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  const re = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${value}`;
  content = re.test(content) ? content.replace(re, line) : `${content.trimEnd()}\n${line}\n`;
  writeFileSync(envPath, content);
}

function upsertWranglerVar(key, value) {
  const wranglerPath = path.join(ROOT, "wrangler.jsonc");
  let content = readFileSync(wranglerPath, "utf-8");
  if (content.includes(`"${key}"`)) {
    content = content.replace(
      new RegExp(`"${key}":\\s*"[^"]*"`),
      `"${key}": "${value}"`,
    );
  } else {
    content = content.replace(
      /"vars":\s*\{/,
      `"vars": {\n    "${key}": "${value}",`,
    );
  }
  writeFileSync(wranglerPath, content);
}

function putSecret(name, value) {
  console.log(`Setting Worker secret ${name}...`);
  const r = spawnSync("npx", ["wrangler", "secret", "put", name], {
    cwd: ROOT,
    input: value,
    encoding: "utf-8",
    shell: true,
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (r.status !== 0) process.exit(1);
}

async function cf(method, route, body) {
  const token = process.env.CF_DNS_API_TOKEN;
  const res = await fetch(`https://api.cloudflare.com/client/v4${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.success) {
    throw new Error(`${method} ${route}: ${json.errors?.[0]?.message ?? JSON.stringify(json)}`);
  }
  return json.result;
}

async function main() {
  loadEnvLocal();

  let sitekey;
  let secret;

  try {
    if (!process.env.CF_DNS_API_TOKEN) {
      throw new Error("CF_DNS_API_TOKEN missing");
    }
    const widgets = await cf("GET", `/accounts/${ACCOUNT_ID}/challenges/widgets`);
    let widget = widgets?.find?.((w) => w.name === "alpha-mirror-site");

    if (!widget) {
      widget = await cf("POST", `/accounts/${ACCOUNT_ID}/challenges/widgets`, {
        name: "alpha-mirror-site",
        domains: [DOMAIN, `www.${DOMAIN}`, "localhost"],
        mode: "managed",
      });
      console.log("Created Turnstile widget:", widget.sitekey);
    } else {
      console.log("Using existing Turnstile widget:", widget.sitekey);
    }
    sitekey = widget.sitekey;
    secret = widget.secret;
  } catch (e) {
    console.warn(`Turnstile API unavailable (${e.message}). Using Cloudflare test keys.`);
    console.warn("Create a production widget in Dashboard → Turnstile and re-run setup:turnstile.");
    sitekey = "1x00000000000000000000AA";
    secret = "1x0000000000000000000000000000000AA";
  }

  upsertEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", sitekey);
  upsertEnv("TURNSTILE_SECRET_KEY", secret);
  upsertWranglerVar("NEXT_PUBLIC_TURNSTILE_SITE_KEY", sitekey);
  putSecret("TURNSTILE_SECRET_KEY", secret);

  console.log("\nTurnstile configured.");
  console.log(`  Site key: ${sitekey}`);
  console.log("  Secret: stored in .env.local + Worker secret");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});