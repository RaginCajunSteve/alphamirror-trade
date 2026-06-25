/**
 * Route billing@alphamirror.trade to the billing auto-reply worker.
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ZONE_ID = "46e9e6a3dcef7810c6900a7241df4a73";
const DOMAIN = "alphamirror.trade";
const WORKER = "alpha-wallet-billing-email";
const RULE_NAME = "billing-response";

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
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
  if (!process.env.CF_DNS_API_TOKEN) {
    throw new Error("CF_DNS_API_TOKEN missing from .env.local");
  }

  const rules = await cf("GET", `/zones/${ZONE_ID}/email/routing/rules`);
  const existing = rules.find((r) => r.name === RULE_NAME);

  const body = {
    name: RULE_NAME,
    enabled: true,
    priority: 0,
    matchers: [{ type: "literal", field: "to", value: `billing@${DOMAIN}` }],
    actions: [{ type: "worker", value: [WORKER] }],
  };

  if (existing) {
    await cf("PUT", `/zones/${ZONE_ID}/email/routing/rules/${existing.id}`, body);
    console.log(`Updated routing rule: billing@${DOMAIN} -> worker ${WORKER}`);
  } else {
    await cf("POST", `/zones/${ZONE_ID}/email/routing/rules`, body);
    console.log(`Created routing rule: billing@${DOMAIN} -> worker ${WORKER}`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});