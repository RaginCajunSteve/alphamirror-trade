/**
 * Add missing proxied A records for alphamirror.trade (IPv4 DNS fix).
 * Requires CF_DNS_API_TOKEN in .env.local with Zone.DNS Edit for this zone.
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ZONE_ID = "46e9e6a3dcef7810c6900a7241df4a73";
const DOMAIN = "alphamirror.trade";
const DASH_URL =
  "https://dash.cloudflare.com/5d39e0d1c74578fc6762947412e84add/alphamirror.trade/dns/records";

function loadEnvLocal() {
  try {
    const envPath = path.join(__dirname, "..", ".env.local");
    for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* optional */
  }
}

async function cf(token, method, route, body) {
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

async function ensureA(token, name) {
  const records = await cf(token, "GET", `/zones/${ZONE_ID}/dns_records?per_page=100`);
  const hit = records.find((r) => r.type === "A" && r.name === name);
  if (hit) {
    console.log(`OK  A ${name} -> ${hit.content}`);
    return;
  }
  try {
    await cf(token, "POST", `/zones/${ZONE_ID}/dns_records`, {
      type: "A",
      name,
      content: "192.0.2.1",
      proxied: true,
      ttl: 1,
      comment: "IPv4 placeholder for proxied Worker custom domain",
    });
    console.log(`ADD A ${name} -> 192.0.2.1 (proxied)`);
  } catch (e) {
    if (e.message.includes("managed by Workers")) {
      console.log(`OK  A ${name} (managed by Workers custom domain)`);
      return;
    }
    throw e;
  }
}

async function main() {
  loadEnvLocal();
  const token = process.env.CF_DNS_API_TOKEN;
  if (!token) {
    console.error("Missing CF_DNS_API_TOKEN in .env.local\n");
    console.error("Create one at: https://dash.cloudflare.com/profile/api-tokens");
    console.error("Template: Edit zone DNS — zone: alphamirror.trade\n");
    console.error("Or add records manually:");
    console.error(`  ${DASH_URL}`);
    console.error("  Type A | Name alphamirror.trade     | Content 192.0.2.1 | Proxied ON");
    console.error("  Type A | Name www.alphamirror.trade | Content 192.0.2.1 | Proxied ON");
    process.exit(1);
  }

  await ensureA(token, DOMAIN);
  await ensureA(token, `www.${DOMAIN}`);

  const records = await cf(token, "GET", `/zones/${ZONE_ID}/dns_records?per_page=100`);
  console.log("\nZone DNS:");
  for (const r of records.filter((x) => x.name.includes(DOMAIN))) {
    console.log(`  ${r.type.padEnd(5)} ${r.name} -> ${r.content} proxied=${r.proxied}`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});