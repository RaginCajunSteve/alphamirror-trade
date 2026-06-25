import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ZONE_ID = "46e9e6a3dcef7810c6900a7241df4a73";
const ACCOUNT_ID = "5d39e0d1c74578fc6762947412e84add";

for (const line of readFileSync(path.join(__dirname, "..", ".env.local"), "utf-8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

async function get(label, route) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${route}`, {
    headers: { Authorization: `Bearer ${process.env.CF_DNS_API_TOKEN}` },
  });
  const json = await res.json();
  console.log(`\n--- ${label} ---`);
  console.log(json.success ? JSON.stringify(json.result, null, 2) : JSON.stringify(json.errors, null, 2));
}

await get("MX records", `/zones/${ZONE_ID}/dns_records?type=MX`);
await get("Routing rules", `/zones/${ZONE_ID}/email/routing/rules`);
await get("Routing DNS", `/zones/${ZONE_ID}/email/routing/dns`);
await get("Sending domains", `/accounts/${ACCOUNT_ID}/email/sending/domains`);
await get("Sending subdomains", `/zones/${ZONE_ID}/email/sending/subdomains`);