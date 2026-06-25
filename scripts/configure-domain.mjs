/**
 * Configure alphamirror.trade on Cloudflare: DNS, HTTPS, worker domains.
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ZONE_ID = "46e9e6a3dcef7810c6900a7241df4a73";
const ACCOUNT_ID = "5d39e0d1c74578fc6762947412e84add";
const DOMAIN = "alphamirror.trade";
const WORKER = "alpha-wallet-mirror";

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

function getToken() {
  loadEnvLocal();
  if (process.env.CF_DNS_API_TOKEN) return process.env.CF_DNS_API_TOKEN;

  const candidates = [
    path.join(process.env.APPDATA ?? "", "xdg.config", ".wrangler", "config", "default.toml"),
    path.join(process.env.USERPROFILE ?? "", ".config", ".wrangler", "config", "default.toml"),
  ];
  for (const p of candidates) {
    try {
      const toml = readFileSync(p, "utf-8");
      const token = toml.match(/oauth_token\s*=\s*"([^"]+)"/)?.[1];
      if (token) return token;
    } catch {
      /* try next */
    }
  }
  throw new Error(
    "No Cloudflare credentials — set CF_DNS_API_TOKEN in .env.local (Zone DNS Edit) or run: npx wrangler login"
  );
}

async function cf(method, route, body) {
  const token = getToken();
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

async function ensureDns(type, name, content) {
  const records = await cf("GET", `/zones/${ZONE_ID}/dns_records?per_page=100`);
  const hit = records.find((r) => r.type === type && r.name === name);
  if (hit) {
    console.log(`DNS exists: ${type} ${name} -> ${hit.content}`);
    return hit.id;
  }
  const created = await cf("POST", `/zones/${ZONE_ID}/dns_records`, {
    type,
    name,
    content,
    proxied: true,
    ttl: 1,
    comment: `Worker route for ${WORKER}`,
  });
  console.log(`DNS created: ${type} ${name} -> ${content} (${created.id})`);
  return created.id;
}

async function patchSetting(id, value) {
  try {
    const r = await cf("PATCH", `/zones/${ZONE_ID}/settings/${id}`, { value });
    console.log(`Setting ${id} = ${r.value}`);
  } catch (e) {
    console.warn(`Setting ${id} skipped:`, e.message);
  }
}

async function ensureWorkerDomain(hostname) {
  const domains = await cf("GET", `/accounts/${ACCOUNT_ID}/workers/domains`);
  const hit = domains.find((d) => d.hostname === hostname && d.service === WORKER);
  if (hit) {
    console.log(`Worker domain attached: ${hostname} (cert ${hit.cert_id})`);
    return hit;
  }
  const created = await cf("POST", `/accounts/${ACCOUNT_ID}/workers/domains`, {
    hostname,
    service: WORKER,
    zone_id: ZONE_ID,
  });
  console.log(`Worker domain created: ${hostname}`);
  return created;
}

async function main() {
  const zone = await cf("GET", `/zones/${ZONE_ID}`);
  console.log(`Zone: ${zone.name} (${zone.status})`);
  console.log(`NS: ${zone.name_servers.join(", ")}\n`);

  await ensureDns("A", DOMAIN, "192.0.2.1");
  await ensureDns("AAAA", DOMAIN, "100::");
  await ensureDns("A", `www.${DOMAIN}`, "192.0.2.1");
  await ensureDns("AAAA", `www.${DOMAIN}`, "100::");

  await ensureWorkerDomain(DOMAIN);
  await ensureWorkerDomain(`www.${DOMAIN}`);

  await patchSetting("always_use_https", "on");
  await patchSetting("automatic_https_rewrites", "on");
  await patchSetting("min_tls_version", "1.2");

  const records = await cf("GET", `/zones/${ZONE_ID}/dns_records?per_page=100`);
  console.log("\nDNS records:");
  for (const r of records) {
    console.log(`  ${r.type.padEnd(5)} ${r.name} -> ${r.content} proxied=${r.proxied}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});