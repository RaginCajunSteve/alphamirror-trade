/**
 * Verify MirrorRouter on BaseScan via Etherscan v2 API (chainid 8453).
 * Requires ETHERSCAN_API_KEY in .env.local.
 */

import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTER = "0xefe995d1f4ff06dc0cf08d1bcbdae74e5f99deb4";
const KEEPER = "0xa8312762ee1BAB6015560BE773b3FbB3Ed90a946";

function loadEnv() {
  const envPath = path.join(ROOT, ".env.local");
  const env = {};
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnv();
if (!env.ETHERSCAN_API_KEY) {
  console.error("ETHERSCAN_API_KEY required");
  process.exit(1);
}

spawnSync("npm", ["run", "compile:router"], { cwd: ROOT, stdio: "inherit", shell: true });

const artifact = JSON.parse(
  readFileSync(path.join(ROOT, "lib/contracts/mirror-router-artifact.json"), "utf-8"),
);
const source = readFileSync(path.join(ROOT, "contracts/MirrorRouter.sol"), "utf-8");

const params = new URLSearchParams({
  apikey: env.ETHERSCAN_API_KEY,
  chainid: "8453",
  module: "contract",
  action: "verifysourcecode",
  contractaddress: ROUTER,
  codeformat: "solidity-single-file",
  contractname: "MirrorRouter",
  compilerversion: "v0.8.20+commit.a1b79de6",
  optimizationUsed: "0",
  runs: "200",
  sourceCode: source,
  constructorArguements: KEEPER.slice(2).padStart(64, "0"),
});

console.log("Submitting BaseScan verification for", ROUTER);
const res = await fetch("https://api.etherscan.io/v2/api?" + params.toString(), {
  method: "POST",
});
const body = await res.json();
console.log(JSON.stringify(body, null, 2));

if (body.status === "1") {
  console.log("Verification submitted. GUID:", body.result);
  console.log(`https://basescan.org/address/${ROUTER}#code`);
} else {
  process.exit(1);
}