/**
 * Apply billing@ footer to Stripe account + ensure invoice.paid webhook (existing endpoint).
 */
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const BILLING_EMAIL = "billing@alphamirror.trade";
const INVOICE_FOOTER = `Alpha Mirror — billing & invoice questions: ${BILLING_EMAIL}`;
const WEBHOOK_URL =
  (process.env.NEXT_PUBLIC_APP_URL ?? "https://alphamirror.trade") + "/api/stripe/webhook";

function loadSecretKey() {
  if (process.env.STRIPE_SECRET_KEY) return process.env.STRIPE_SECRET_KEY.trim();
  const envPath = path.join(ROOT, ".env.local");
  if (!existsSync(envPath)) return null;
  return readFileSync(envPath, "utf-8").match(/^STRIPE_SECRET_KEY=(.+)$/m)?.[1]?.trim() ?? null;
}

async function stripeRequest(secretKey, method, route, params = {}) {
  const body =
    method === "GET"
      ? null
      : new URLSearchParams(
          Object.entries(params).flatMap(([k, v]) => {
            if (v === undefined || v === null) return [];
            if (Array.isArray(v)) return v.map((item) => [`${k}[]`, String(item)]);
            return [[k, String(v)]];
          }),
        );
  const url =
    method === "GET" && Object.keys(params).length
      ? `https://api.stripe.com/v1${route}?${new URLSearchParams(params)}`
      : `https://api.stripe.com/v1${route}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: body ?? undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? JSON.stringify(json));
  return json;
}

const secretKey = loadSecretKey();
if (!secretKey?.startsWith("sk_")) {
  console.error("Missing STRIPE_SECRET_KEY in .env.local");
  process.exit(1);
}

console.log(
  "Note: set default invoice footer in Stripe Dashboard → Settings → Billing → Invoice template:",
  INVOICE_FOOTER,
);

const hooks = await stripeRequest(secretKey, "GET", "/webhook_endpoints", { limit: 20 });
const hook = hooks.data?.find((w) => w.url === WEBHOOK_URL);
if (!hook) {
  console.warn(`Webhook not found at ${WEBHOOK_URL} — run npm run setup:stripe`);
  process.exit(0);
}

const events = new Set(hook.enabled_events ?? []);
const required = [
  "checkout.session.completed",
  "invoice.paid",
  "customer.subscription.updated",
  "customer.subscription.deleted",
];
const missing = required.filter((e) => !events.has(e));
if (missing.length) {
  await stripeRequest(secretKey, "POST", `/webhook_endpoints/${hook.id}`, {
    enabled_events: [...events, ...missing],
  });
  console.log("Webhook updated with events:", missing.join(", "));
} else {
  console.log("Webhook events already include invoice.paid");
}