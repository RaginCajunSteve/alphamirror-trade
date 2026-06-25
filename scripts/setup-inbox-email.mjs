/**
 * Route hello@ and support@ to the inbox email worker (auto-reply + forward).
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ZONE_ID = "46e9e6a3dcef7810c6900a7241df4a73";
const DOMAIN = "alphamirror.trade";
const WORKER = "alpha-wallet-inbox-email";

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

async function upsertRule(name, toAddress, priority) {
  const rules = await cf("GET", `/zones/${ZONE_ID}/email/routing/rules`);
  const existing = rules.find((r) => r.name === name);
  const body = {
    name,
    enabled: true,
    priority,
    matchers: [{ type: "literal", field: "to", value: toAddress }],
    actions: [{ type: "worker", value: [WORKER] }],
  };
  if (existing) {
    await cf("PUT", `/zones/${ZONE_ID}/email/routing/rules/${existing.id}`, body);
    console.log(`Updated: ${toAddress} -> ${WORKER}`);
  } else {
    await cf("POST", `/zones/${ZONE_ID}/email/routing/rules`, body);
    console.log(`Created: ${toAddress} -> ${WORKER}`);
  }
}

async function removeConflictingRules(toAddress) {
  const rules = await cf("GET", `/zones/${ZONE_ID}/email/routing/rules`);
  for (const rule of rules) {
    const matchesHello = rule.matchers?.some?.(
      (m) => m.field === "to" && m.value === toAddress,
    );
    if (!matchesHello) continue;
    if (rule.name === "hello-inbox" || rule.name === "support-inbox") continue;
    await cf("DELETE", `/zones/${ZONE_ID}/email/routing/rules/${rule.id}`);
    console.log(`Removed old rule "${rule.name}" for ${toAddress}`);
  }
}

async function main() {
  loadEnvLocal();
  if (!process.env.CF_DNS_API_TOKEN) {
    throw new Error("CF_DNS_API_TOKEN missing from .env.local");
  }

  await removeConflictingRules(`hello@${DOMAIN}`);
  await upsertRule("hello-inbox", `hello@${DOMAIN}`, 0);
  await upsertRule("support-inbox", `support@${DOMAIN}`, 1);
  console.log("\nInbox email routing configured.");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});