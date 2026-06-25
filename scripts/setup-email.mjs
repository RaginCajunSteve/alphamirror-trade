/**
 * Enable Email Sending + Routing for alphamirror.trade
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ACCOUNT_ID = "5d39e0d1c74578fc6762947412e84add";
const ZONE_ID = "46e9e6a3dcef7810c6900a7241df4a73";
const DOMAIN = "alphamirror.trade";
const FORWARD_TO = process.env.EMAIL_FORWARD_TO ?? "steven.comeau@lightningcomms.net";

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
    const msg = json.errors?.[0]?.message ?? JSON.stringify(json);
    if (msg.includes("already") || msg.includes("exists")) return { skipped: true, message: msg };
    throw new Error(`${method} ${route}: ${msg}`);
  }
  return json.result;
}

async function main() {
  loadEnvLocal();
  if (!process.env.CF_DNS_API_TOKEN) {
    throw new Error("CF_DNS_API_TOKEN missing from .env.local");
  }

  console.log(`Forwarding: hello@${DOMAIN} -> ${FORWARD_TO}\n`);

  // Enable email routing on zone
  try {
    await cf("POST", `/zones/${ZONE_ID}/email/routing/enable`);
    console.log("Email Routing enabled");
  } catch (e) {
    console.log("Email Routing:", e.message);
  }

  // Verify destination address (sends confirmation email)
  try {
    await cf("POST", `/accounts/${ACCOUNT_ID}/email/routing/addresses`, {
      email: FORWARD_TO,
    });
    console.log(`Destination address added: ${FORWARD_TO} (check inbox to verify)`);
  } catch (e) {
    console.log("Destination address:", e.message);
  }

  // Catch-all style: hello@ forwards to inbox
  const rules = await cf("GET", `/zones/${ZONE_ID}/email/routing/rules`);
  const existing = rules?.find?.((r) => r.name === "hello-forward");
  if (!existing) {
    await cf("POST", `/zones/${ZONE_ID}/email/routing/rules`, {
      name: "hello-forward",
      enabled: true,
      priority: 0,
      matchers: [{ type: "literal", field: "to", value: `hello@${DOMAIN}` }],
      actions: [{ type: "forward", value: [FORWARD_TO] }],
    });
    console.log(`Routing rule: hello@${DOMAIN} -> ${FORWARD_TO}`);
  } else {
    console.log("Routing rule hello-forward already exists");
  }

  // Enable email sending (onboards domain for outbound mail)
  try {
    await cf("POST", `/accounts/${ACCOUNT_ID}/email/sending/domains`, {
      name: DOMAIN,
    });
    console.log(`Email Sending enabled for ${DOMAIN}`);
  } catch (e) {
    console.log("Email Sending:", e.message);
  }

  const sendingDomains = await cf("GET", `/accounts/${ACCOUNT_ID}/email/sending/domains`);
  if (Array.isArray(sendingDomains)) {
    const hit = sendingDomains.find((d) => d.name === DOMAIN || d.domain === DOMAIN);
    if (hit) console.log(`Sending domain status: ${hit.status ?? hit.verification_status ?? "active"}`);
  }

  console.log("\nDone. Verify destination email, then test:");
  console.log(`  Send to: hello@${DOMAIN}`);
  console.log(`  Send from: noreply@${DOMAIN} (after sending domain is active)`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});