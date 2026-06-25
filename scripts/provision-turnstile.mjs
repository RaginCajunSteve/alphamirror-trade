/**
 * Create or fetch production Turnstile widget using wrangler OAuth token.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ACCOUNT_ID = "5d39e0d1c74578fc6762947412e84add";
const DOMAIN = "alphamirror.trade";

function oauthToken() {
  const appData = process.env.APPDATA ?? path.join(process.env.USERPROFILE ?? "", "AppData", "Roaming");
  const tomlPath = path.join(appData, "xdg.config", ".wrangler", "config", "default.toml");
  if (!existsSync(tomlPath)) return null;
  const toml = readFileSync(tomlPath, "utf-8");
  return toml.match(/oauth_token = "([^"]+)"/)?.[1] ?? null;
}

function apiToken() {
  const envPath = path.join(ROOT, ".env.local");
  if (!existsSync(envPath)) return null;
  const text = readFileSync(envPath, "utf-8");
  for (const key of ["CF_TURNSTILE_API_TOKEN", "CLOUDFLARE_API_TOKEN", "CF_DNS_API_TOKEN"]) {
    const m = text.match(new RegExp(`^${key}=(.+)$`, "m"));
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return oauthToken();
}

async function cf(method, route, body, token) {
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

function upsertEnv(key, value) {
  const envPath = path.join(ROOT, ".env.local");
  let content = readFileSync(envPath, "utf-8");
  const re = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${value}`;
  content = re.test(content) ? content.replace(re, line) : `${content.trimEnd()}\n${line}\n`;
  writeFileSync(envPath, content);
}

function upsertWranglerVar(key, value) {
  const wranglerPath = path.join(ROOT, "wrangler.jsonc");
  let content = readFileSync(wranglerPath, "utf-8");
  content = content.replace(
    new RegExp(`"${key}":\\s*"[^"]*"`),
    `"${key}": "${value}"`,
  );
  writeFileSync(wranglerPath, content);
}

function putSecret(name, value) {
  const r = spawnSync("npx", ["wrangler", "secret", "put", name], {
    cwd: ROOT,
    input: value,
    encoding: "utf-8",
    shell: true,
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (r.status !== 0) process.exit(1);
}

function manualKeysFromEnv() {
  const envPath = path.join(ROOT, ".env.local");
  if (!existsSync(envPath)) return null;
  const text = readFileSync(envPath, "utf-8");
  const siteMatches = [...text.matchAll(/^NEXT_PUBLIC_TURNSTILE_SITE_KEY=(.+)$/gm)];
  const secretMatches = [...text.matchAll(/^TURNSTILE_SECRET_KEY=(.+)$/gm)];
  const site =
    siteMatches.at(-1)?.[1]?.trim() ??
    [...text.matchAll(/^TURNSTILE_SITE_KEY=(.+)$/gm)].at(-1)?.[1]?.trim();
  const secret = secretMatches.at(-1)?.[1]?.trim();
  if (!site || !secret || site.startsWith("1x000000")) return null;
  return { site, secret };
}

const envKeys = manualKeysFromEnv();
if (envKeys && !process.argv.includes("--force-api")) {
  upsertEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", envKeys.site);
  upsertEnv("TURNSTILE_SECRET_KEY", envKeys.secret);
  upsertWranglerVar("NEXT_PUBLIC_TURNSTILE_SITE_KEY", envKeys.site);
  putSecret("TURNSTILE_SECRET_KEY", envKeys.secret);
  console.log("Applied production Turnstile keys from .env.local");
  console.log(`  Site key: ${envKeys.site}`);
  process.exit(0);
}

const manualSitekey = process.argv.find((a) => a.startsWith("0x") && a.length > 20);
const manualSecret = process.argv.find((a, i, arr) => i > 0 && arr[i - 1] === manualSitekey);

if (manualSitekey && manualSecret) {
  upsertEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", manualSitekey);
  upsertEnv("TURNSTILE_SECRET_KEY", manualSecret);
  upsertWranglerVar("NEXT_PUBLIC_TURNSTILE_SITE_KEY", manualSitekey);
  putSecret("TURNSTILE_SECRET_KEY", manualSecret);
  console.log("Applied Turnstile keys from CLI.");
  console.log(`  Site key: ${manualSitekey}`);
  process.exit(0);
}

const token = apiToken();
if (!token) {
  console.error("No Cloudflare API token or wrangler OAuth session found.");
  process.exit(1);
}

let widgets;
try {
  widgets = await cf("GET", `/accounts/${ACCOUNT_ID}/challenges/widgets`, null, token);
} catch (err) {
  console.error(err.message);
  console.error("\nCreate a token at https://dash.cloudflare.com/profile/api-tokens");
  console.error("Permissions: Account → Turnstile → Edit");
  console.error("Save as CF_TURNSTILE_API_TOKEN in .env.local and re-run.");
  process.exit(1);
}

let widget = widgets?.find?.((w) => w.name === "alpha-mirror-site");
if (!widget) {
  widget = await cf(
    "POST",
    `/accounts/${ACCOUNT_ID}/challenges/widgets`,
    {
      name: "alpha-mirror-site",
      domains: [DOMAIN, `www.${DOMAIN}`, "localhost"],
      mode: "managed",
    },
    token,
  );
  console.log("Created widget:", widget.sitekey);
} else {
  console.log("Using existing widget:", widget.sitekey);
}

const details = await cf(
  "GET",
  `/accounts/${ACCOUNT_ID}/challenges/widgets/${widget.sitekey}`,
  null,
  token,
);

const sitekey = details.sitekey;
const secret = details.secret;
if (!sitekey || !secret) throw new Error("Widget missing sitekey/secret");

upsertEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", sitekey);
upsertEnv("TURNSTILE_SECRET_KEY", secret);
upsertWranglerVar("NEXT_PUBLIC_TURNSTILE_SITE_KEY", sitekey);
putSecret("TURNSTILE_SECRET_KEY", secret);

console.log("\nProduction Turnstile configured.");
console.log(`  Site key: ${sitekey}`);
console.log("  Secret: .env.local + Worker secret");