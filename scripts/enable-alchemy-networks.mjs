/**
 * Enable Alchemy app networks (Optimism, BSC, Avalanche, Scroll).
 *
 *   npm run enable:alchemy-networks
 *
 * Auth (pick one):
 *   - ALCHEMY_ADMIN_ACCESS_KEY or ALCHEMY_AUTH_TOKEN in .env.local
 *     (Admin access key from dashboard.alchemy.com/settings/security
 *      with App Management → Read & Write)
 *   - Or one-time: alchemy auth login
 */

import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn, spawnSync } from "child_process";
import { checkSpendApproval } from "../workers/ops/cost-policy.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const APP_ID = "ry362bjpheobfqcw";
const ADMIN_BASE = "https://admin-api.alchemy.com/v1";
const ADD_NETWORKS = ["OPT_MAINNET", "BNB_MAINNET", "AVAX_MAINNET", "SCROLL_MAINNET"];

function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return out;
}

function runJson(args, childEnv = process.env) {
  const r = spawnSync("alchemy", ["--json", "--no-interactive", ...args], {
    encoding: "utf-8",
    shell: true,
    env: childEnv,
  });
  const raw = (r.stdout || r.stderr || "").trim();
  if (!raw) return { ok: false, error: "empty output" };
  try {
    return { ok: r.status === 0, data: JSON.parse(raw) };
  } catch {
    return { ok: false, error: raw };
  }
}

async function waitForAuth(maxMs = 180_000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const status = runJson(["auth", "status"]);
    if (status.ok && status.data?.authenticated) return true;
    await new Promise((r) => setTimeout(r, 4_000));
  }
  return false;
}

function networkIds(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((n) => (typeof n === "string" ? n : n.id ?? n.slug ?? n.network))
    .filter(Boolean);
}

async function adminFetch(pathname, { method = "GET", body, token }) {
  const res = await fetch(`${ADMIN_BASE}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

async function enableViaAdminApi(token) {
  const app = await adminFetch(`/apps/${APP_ID}`, { token });
  if (!app.ok) {
    const msg =
      app.data?.error?.message ??
      app.data?.message ??
      `HTTP ${app.status}`;
    console.error(`Admin API denied (${app.status}): ${msg}`);
    console.error(
      "Create an access key at https://dashboard.alchemy.com/settings/security\n" +
        "with App Management → Read & Write, then set in .env.local:\n" +
        "  ALCHEMY_ADMIN_ACCESS_KEY=your_key\n" +
        "(Do not use the app RPC API key — that cannot change networks.)",
    );
    process.exit(1);
  }

  const current = networkIds(
    app.data?.data?.chainNetworks ??
      app.data?.data?.networkAllowlist ??
      app.data?.chainNetworks ??
      [],
  );

  const merged = [...new Set([...current, ...ADD_NETWORKS])];
  console.log(`Updating app ${APP_ID} via Admin API: ${merged.join(", ")}`);

  const update = await adminFetch(`/apps/${APP_ID}/networks`, {
    method: "PUT",
    token,
    body: { networkAllowlist: merged },
  });

  if (!update.ok) {
    console.error(
      "Failed to update networks:",
      update.data?.error?.message ?? update.data?.message ?? update.data,
    );
    process.exit(1);
  }

  console.log("Network allowlist updated.");
}

async function enableViaCli(childEnv) {
  const configured = runJson(["app", "configured-networks", "--app-id", APP_ID], childEnv);
  let current = [];
  if (configured.ok) {
    current = networkIds(configured.data?.networks ?? configured.data?.data ?? configured.data);
  }

  if (!current.length) {
    const app = runJson(["app", "get", APP_ID], childEnv);
    current = networkIds(
      app.data?.chainNetworks ??
        app.data?.networkAllowlist ??
        app.data?.data?.chainNetworks ??
        [],
    );
  }

  if (!current.length) {
    current = ["BASE_MAINNET", "ETH_MAINNET", "ARB_MAINNET"];
  }

  const merged = [...new Set([...current, ...ADD_NETWORKS])];
  console.log(`Updating app ${APP_ID} via CLI: ${merged.join(", ")}`);

  const update = runJson(
    ["app", "networks", APP_ID, "--networks", merged.join(",")],
    childEnv,
  );

  if (!update.ok) {
    console.error("Failed to update networks:", update.error ?? update.data);
    process.exit(1);
  }
}

const localEnv = loadEnvLocal();

const costCheck = checkSpendApproval("alchemy-networks", { ...process.env, ...localEnv });
if (!costCheck.ok) {
  console.error(`\n[cost-guard] ${costCheck.message}\n`);
  process.exit(1);
}

const adminToken =
  localEnv.ALCHEMY_ADMIN_ACCESS_KEY?.trim() || localEnv.ALCHEMY_AUTH_TOKEN?.trim();

if (adminToken) {
  console.log("Using Admin API access key from .env.local…");
  await enableViaAdminApi(adminToken);
} else {
  const childEnv = { ...process.env };
  const authStatus = runJson(["auth", "status"], childEnv);
  if (!authStatus.ok || !authStatus.data?.authenticated) {
    console.log("Opening Alchemy login in your browser — complete sign-in there…");
    const login = spawn("alchemy", ["auth", "login", "-y"], {
      stdio: "inherit",
      shell: true,
      detached: true,
    });
    login.unref();

    const authed = await waitForAuth();
    if (!authed) {
      console.error(
        "Alchemy login timed out. Add ALCHEMY_ADMIN_ACCESS_KEY to .env.local\n" +
          "or run: alchemy auth login && npm run enable:alchemy-networks",
      );
      process.exit(1);
    }
    console.log("Authenticated.");
  }
  await enableViaCli(childEnv);
}

console.log("Verifying Alchemy RPC for networks…");

const key = localEnv.ALCHEMY_API_KEY;
for (const [name, slug] of [
  ["optimism", "opt-mainnet"],
  ["bsc", "bnb-mainnet"],
  ["avalanche", "avax-mainnet"],
  ["scroll", "scroll-mainnet"],
]) {
  const url = `https://${slug}.g.alchemy.com/v2/${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "alchemy_getAssetTransfers",
      params: [
        {
          fromBlock: "0x0",
          toBlock: "latest",
          toAddress: "0x68B3465833fB72A70Ecdf485E0E4C7B259FF2A24",
          category: ["erc20"],
          maxCount: "0x3",
          order: "desc",
        },
      ],
    }),
  });
  const body = await res.json();
  console.log(name, body.error ? `FAIL: ${body.error.message}` : "OK");
  if (body.error) process.exit(1);
}

console.log("Done — Optimism, BSC, Avalanche, and Scroll are active on your Alchemy app.");