/**
 * One-shot Stripe setup for Alpha Wallet Mirror Pro ($29/mo).
 * Requires STRIPE_SECRET_KEY (sk_test_... or sk_live_...) in env or .env.local.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://alphamirror.trade";
const WEBHOOK_URL = `${APP_URL}/api/stripe/webhook`;
const PRODUCT_NAME = "Alpha Wallet Mirror Pro";
const PRICE_USD = 29;
const BILLING_EMAIL = "billing@alphamirror.trade";
const INVOICE_FOOTER = `Alpha Mirror — billing & invoice questions: ${BILLING_EMAIL}`;

function loadSecretKey() {
  if (process.env.STRIPE_SECRET_KEY) return process.env.STRIPE_SECRET_KEY.trim();
  const envPath = path.join(ROOT, ".env.local");
  if (!existsSync(envPath)) return null;
  const match = readFileSync(envPath, "utf-8").match(/^STRIPE_SECRET_KEY=(.+)$/m);
  return match?.[1]?.trim() ?? null;
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
    method === "GET" && body === null && Object.keys(params).length
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
  if (!res.ok) {
    throw new Error(json.error?.message ?? JSON.stringify(json));
  }
  return json;
}

function upsertEnvLocal(updates) {
  const envPath = path.join(ROOT, ".env.local");
  let text = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    text = re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
  }
  writeFileSync(envPath, text.endsWith("\n") ? text : `${text}\n`);
}

function upsertWranglerVars(updates) {
  const wranglerPath = path.join(ROOT, "wrangler.jsonc");
  let text = readFileSync(wranglerPath, "utf-8");
  for (const [key, value] of Object.entries(updates)) {
    const entry = `"${key}": "${value}"`;
    const re = new RegExp(`"${key}":\\s*"[^"]*"`);
    if (re.test(text)) {
      text = text.replace(re, entry);
    } else {
      text = text.replace(
        /"vars":\s*\{/,
        `"vars": {\n    ${entry},`,
      );
    }
  }
  writeFileSync(wranglerPath, text);
}

async function findOrCreateProduct(secretKey) {
  const list = await stripeRequest(secretKey, "GET", "/products", { limit: 100 });
  const existing = list.data?.find(
    (p) => p.name === PRODUCT_NAME || p.metadata?.app === "alpha-wallet-mirror",
  );
  if (existing) {
    console.log(`Product exists: ${existing.id}`);
    return existing.id;
  }
  const created = await stripeRequest(secretKey, "POST", "/products", {
    name: PRODUCT_NAME,
    description: `Live mirror execution + priority keeper queue. Billing: ${BILLING_EMAIL}`,
    "metadata[app]": "alpha-wallet-mirror",
  });
  console.log(`Created product: ${created.id}`);
  return created.id;
}

async function findOrCreatePrice(secretKey, productId) {
  const list = await stripeRequest(secretKey, "GET", "/prices", {
    product: productId,
    limit: 20,
  });
  const existing = list.data?.find(
    (p) =>
      p.active &&
      p.unit_amount === PRICE_USD * 100 &&
      p.recurring?.interval === "month",
  );
  if (existing) {
    console.log(`Price exists: ${existing.id}`);
    return existing.id;
  }
  const created = await stripeRequest(secretKey, "POST", "/prices", {
    product: productId,
    unit_amount: PRICE_USD * 100,
    currency: "usd",
    "recurring[interval]": "month",
    nickname: "Pro monthly",
  });
  console.log(`Created price: ${created.id} ($${PRICE_USD}/mo)`);
  return created.id;
}

async function findOrCreateWebhook(secretKey) {
  const list = await stripeRequest(secretKey, "GET", "/webhook_endpoints", { limit: 20 });
  const existing = list.data?.find((w) => w.url === WEBHOOK_URL);
  if (existing) {
    console.log(`Webhook exists: ${existing.id} (secret not re-shown — create new if needed)`);
    return { id: existing.id, secret: null };
  }
  const created = await stripeRequest(secretKey, "POST", "/webhook_endpoints", {
    url: WEBHOOK_URL,
    enabled_events: [
      "checkout.session.completed",
      "invoice.paid",
      "customer.subscription.deleted",
      "customer.subscription.updated",
    ],
  });
  console.log(`Created webhook: ${created.id}`);
  return { id: created.id, secret: created.secret };
}

async function fetchPublishableKey(secretKey) {
  try {
    const list = await stripeRequest(secretKey, "GET", "/api_keys", { limit: 20 });
    const pk = list.data?.find((k) => k.type === "publishable" && k.key?.startsWith("pk_"));
    if (pk?.key) return pk.key;
  } catch {
    /* older accounts may not expose via this route */
  }
  return null;
}

function putWranglerSecret(name, value) {
  console.log(`Setting Cloudflare secret: ${name}`);
  const r = spawnSync(
    "npx",
    ["wrangler", "secret", "put", name],
    {
      cwd: ROOT,
      input: value,
      encoding: "utf-8",
      shell: true,
      stdio: ["pipe", "inherit", "inherit"],
    },
  );
  if (r.status !== 0) throw new Error(`wrangler secret put ${name} failed`);
}

async function main() {
  const secretKey = loadSecretKey();
  if (!secretKey?.startsWith("sk_")) {
    console.error(`
Missing STRIPE_SECRET_KEY.

1. Create / sign in: https://dashboard.stripe.com/register
2. Developers → API keys → copy Secret key (sk_test_...)
3. Add to .env.local:
   STRIPE_SECRET_KEY=sk_test_...
4. Re-run: npm run setup:stripe
`);
    process.exit(1);
  }

  const mode = secretKey.startsWith("sk_live_") ? "live" : "test";
  console.log(`Stripe setup (${mode} mode)`);
  console.log(`App URL: ${APP_URL}`);
  console.log(`Webhook: ${WEBHOOK_URL}\n`);

  console.log(
    `Set Stripe Dashboard → Settings → Billing → Invoice template footer to:\n  ${INVOICE_FOOTER}\n`,
  );

  const productId = await findOrCreateProduct(secretKey);
  const priceId = await findOrCreatePrice(secretKey, productId);
  const webhook = await findOrCreateWebhook(secretKey);
  const publishableKey = await fetchPublishableKey(secretKey);

  const envUpdates = {
    STRIPE_SECRET_KEY: secretKey,
    STRIPE_PRO_PRICE_ID: priceId,
    NEXT_PUBLIC_APP_URL: APP_URL,
  };
  if (webhook.secret) envUpdates.STRIPE_WEBHOOK_SECRET = webhook.secret;
  if (publishableKey) envUpdates.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = publishableKey;
  upsertEnvLocal(envUpdates);

  const wranglerVars = {
    NEXT_PUBLIC_APP_URL: APP_URL,
    STRIPE_PRO_PRICE_ID: priceId,
  };
  if (publishableKey) wranglerVars.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = publishableKey;
  upsertWranglerVars(wranglerVars);

  console.log("\nPushing secrets to Cloudflare...");
  putWranglerSecret("STRIPE_SECRET_KEY", secretKey);
  if (webhook.secret) {
    putWranglerSecret("STRIPE_WEBHOOK_SECRET", webhook.secret);
  } else {
    const existing = readFileSync(path.join(ROOT, ".env.local"), "utf-8").match(
      /^STRIPE_WEBHOOK_SECRET=(.+)$/m,
    );
    if (existing?.[1]) {
      putWranglerSecret("STRIPE_WEBHOOK_SECRET", existing[1].trim());
    } else {
      console.warn(
        "No new webhook secret — add STRIPE_WEBHOOK_SECRET to .env.local from Stripe Dashboard → Webhooks, then run: npm run secrets:stripe",
      );
    }
  }

  console.log(`
Done.

  Price ID:        ${priceId}
  Webhook ID:      ${webhook.id}
  Publishable key: ${publishableKey ?? "(copy pk_test_... from Stripe Dashboard → API keys)"}

Next: npm run deploy:cf

Test checkout: ${APP_URL}/pricing
Stripe test card: 4242 4242 4242 4242 · any future expiry · any CVC
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});