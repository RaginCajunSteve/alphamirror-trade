/**
 * Email the DNS migration checklist Word doc to steven.comeau@lightningcomms.net
 */
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ACCOUNT_ID = "5d39e0d1c74578fc6762947412e84add";
const TO = "steven.comeau@lightningcomms.net";
const FROM = "noreply@alphamirror.trade";
const DOC_PATH = path.join(
  __dirname,
  "..",
  "docs",
  "lightningcomms-net-dns-migration-checklist.docx",
);

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

loadEnvLocal();

const token =
  process.env.CF_DNS_API_TOKEN?.trim() || process.env.CLOUDFLARE_API_TOKEN?.trim();
if (!token) throw new Error("CF_DNS_API_TOKEN or CLOUDFLARE_API_TOKEN required in .env.local");
if (!existsSync(DOC_PATH)) throw new Error(`Missing document: ${DOC_PATH}`);

const attachmentB64 = readFileSync(DOC_PATH).toString("base64");

const body = {
  to: TO,
  from: { address: FROM, name: "Alpha Mirror Ops" },
  reply_to: "billing@alphamirror.trade",
  subject: "lightningcomms.net DNS Migration Checklist (Word)",
  text:
    "Attached is the DNS migration checklist for moving lightningcomms.net onto Cloudflare while keeping Microsoft 365 email working.\n\n" +
    "Summary:\n" +
    "- Recommended approach: DNS on Cloudflare, email stays on M365\n" +
    "- Do not enable Cloudflare Email Routing on lightningcomms.net\n" +
    "- Remove private LAN records (unifi, winl17) from public DNS\n" +
    "- Consider downgrading Pro to Free after migration to save $25/mo\n\n" +
    "File: lightningcomms-net-dns-migration-checklist.docx",
  html:
    "<p>Attached is the <strong>DNS migration checklist</strong> for moving <code>lightningcomms.net</code> onto Cloudflare while keeping Microsoft 365 email working.</p>" +
    "<ul>" +
    "<li><strong>Recommended:</strong> DNS on Cloudflare, email stays on M365</li>" +
    "<li>Do <strong>not</strong> enable Cloudflare Email Routing on lightningcomms.net</li>" +
    "<li>Remove private LAN records (<code>unifi</code>, <code>winl17</code>) from public DNS</li>" +
    "<li>Consider downgrading Pro to Free after migration to save $25/mo</li>" +
    "</ul>" +
    "<p>File: <em>lightningcomms-net-dns-migration-checklist.docx</em></p>",
  attachments: [
    {
      content: attachmentB64,
      filename: "lightningcomms-net-dns-migration-checklist.docx",
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      disposition: "attachment",
    },
  ],
};

const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/email/sending/send`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  },
);

const json = await res.json();
if (!json.success) {
  console.error(JSON.stringify(json, null, 2));
  process.exit(1);
}

console.log(`Sent to ${TO}`);
console.log(JSON.stringify(json.result, null, 2));