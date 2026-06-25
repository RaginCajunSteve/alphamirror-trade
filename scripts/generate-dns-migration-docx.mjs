/**
 * Generate lightningcomms.net DNS migration checklist Word document.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  ShadingType,
} from "docx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(
  __dirname,
  "..",
  "docs",
  "lightningcomms-net-dns-migration-checklist.docx",
);

fs.mkdirSync(path.dirname(outPath), { recursive: true });

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
}
function h3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] });
}
function p(text, opts = {}) {
  return new Paragraph({ children: [new TextRun({ text, ...opts })] });
}
function bullet(ref, text) {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    children: [new TextRun(text)],
  });
}

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const headerFill = "D5E8F0";

function tableCell(text, width, header = false) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: header ? { fill: headerFill, type: ShadingType.CLEAR } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: header })] })],
  });
}

function twoColTable(rows) {
  const w1 = 2800;
  const w2 = 6560;
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [w1, w2],
    rows: [
      new TableRow({
        children: [tableCell(rows[0][0], w1, true), tableCell(rows[0][1], w2, true)],
      }),
      ...rows.slice(1).map(
        (row) =>
          new TableRow({
            children: [tableCell(row[0], w1), tableCell(row[1], w2)],
          }),
      ),
    ],
  });
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 32, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 240, after: 180 }, outlineLevel: 0 },
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 28, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 1 },
      },
      {
        id: "Heading3",
        name: "Heading 3",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 24, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 2 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "\u2022",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
      {
        reference: "numbers",
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: "%1.",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun("lightningcomms.net DNS Migration Checklist  |  Page "),
                new TextRun({ children: [PageNumber.CURRENT] }),
              ],
            }),
          ],
        }),
      },
      children: [
        h1("DNS Migration Checklist"),
        p("Domain: lightningcomms.net", { bold: true }),
        p("Prepared: June 23, 2026"),
        p(
          "Goal: Make Cloudflare authoritative DNS without breaking Microsoft 365 email, internal hostnames, or alphamirror.trade forwarding to steven.comeau@lightningcomms.net.",
        ),

        h2("Migration Strategy (Recommended)"),
        p("DNS-only migration — keep email on Microsoft 365.", { bold: true }),
        twoColTable([
          ["Approach", "Notes"],
          ["A — DNS on Cloudflare, email on M365 (recommended)", "Low risk; Free plan likely sufficient"],
          ["B — DNS + email on Cloudflare", "High risk; requires mailbox migration"],
        ]),

        h2("Phase 0 — Decisions (Before Touching DNS)"),
        bullet("bullets", "Confirm registrar where nameservers are changed"),
        bullet("bullets", "Plan tier: start on Free after migration; keep Pro only if WAF/image optimization needed"),
        bullet("bullets", "Private IP policy: remove unifi and winl17 from public DNS; use local/split-horizon DNS"),
        bullet("bullets", "Schedule 30–60 minute maintenance window; email is highest risk"),
        bullet("bullets", "Identify rollback owner with registrar login ready"),
        twoColTable([
          ["Hostname", "Recommendation"],
          ["unifi.lightningcomms.net (192.168.1.1)", "Remove from public DNS; use UniFi local DNS"],
          ["winl17.lightningcomms.net (192.168.1.87)", "Remove from public DNS; use AD/local DNS"],
          ["xrpl17.lightningcomms.net (98.183.227.178)", "Keep public A record; proxied OFF"],
          ["lightningcomms.net apex (98.183.227.178)", "Keep if services exist; proxied OFF unless using CDN"],
        ]),

        h2("Phase 1 — Inventory (Export Authoritative Records)"),
        h3("1a. Microsoft 365 / Entra Admin Center"),
        bullet("numbers", "Settings → Domains → lightningcomms.net → DNS records"),
        bullet("numbers", "Export or screenshot every record (A, AAAA, CNAME, MX, TXT, SRV, CAA)"),
        bullet("numbers", "Note records visible only in M365 admin"),
        h3("1b. Known Public Records (verify against M365 export)"),
        twoColTable([
          ["Type / Name", "Value"],
          ["MX @", "lightningcomms-net.mail.protection.outlook.com (prio 0)"],
          ["TXT @", "v=spf1 include:spf.protection.outlook.com -all"],
          ["CNAME autodiscover", "autodiscover.outlook.com"],
          ["CNAME selector1._domainkey", "selector1-lightningcomms-net._domainkey.lightningcommsnet.onmicrosoft.com"],
          ["CNAME selector2._domainkey", "selector2-lightningcomms-net._domainkey.lightningcommsnet.onmicrosoft.com"],
          ["A @", "98.183.227.178"],
          ["A xrpl17", "98.183.227.178"],
        ]),
        h3("1c. Also Check For"),
        bullet("bullets", "_dmarc TXT (add if M365 recommends)"),
        bullet("bullets", "sip, lyncdiscover, msoid, enterpriseenrollment (Teams/Intune)"),
        bullet("bullets", "CAA records and any SRV records"),
        h3("1d. Document Dependencies"),
        bullet("bullets", "steven.comeau@lightningcomms.net → M365 mailbox (alphamirror forwards here)"),
        bullet("bullets", "alphamirror.trade email is a separate zone — unchanged by this migration"),
        bullet("bullets", "UniFi, winl17, xrpl17 — confirm who resolves them after cutover"),

        h2("Phase 2 — Prepare Cloudflare Zone"),
        p("Zone ID: 26bd7f5f1c0ac1032c850c7eecfc8766 | Status: Pending"),
        bullet("numbers", "Consider downgrading Pro → Free during prep (save $25/mo)"),
        bullet("numbers", "Import DNS records from Phase 1 into Cloudflare"),
        bullet("numbers", "Do not import private LAN A records unless intentional"),
        bullet("numbers", "Set autodiscover and service A records to DNS only (grey cloud)"),
        bullet("numbers", "Do NOT enable Email Routing on lightningcomms.net"),
        bullet("numbers", "Confirm MX matches M365 exactly"),
        bullet("numbers", "Lower TTL to 300 seconds 24–48 hours before cutover"),

        h2("Phase 3 — Local / Split-Horizon DNS"),
        bullet("numbers", "UniFi local DNS: unifi → 192.168.1.1, winl17 → 192.168.1.87"),
        bullet("numbers", "Windows/AD: ensure winl17 resolves locally"),
        bullet("numbers", "Verify from LAN before cutover: Resolve-DnsName winl17.lightningcomms.net"),

        h2("Phase 4 — Pre-Cutover Verification"),
        bullet("numbers", "Diff Cloudflare records vs M365 export"),
        bullet("numbers", "Query CF nameservers: dig @keira.ns.cloudflare.com MX lightningcomms.net"),
        bullet("numbers", "Confirm MX, SPF, DKIM, autodiscover correct on CF before NS switch"),

        h2("Phase 5 — Cutover (Switch Nameservers)"),
        p("Save rollback nameservers:", { bold: true }),
        p("ns1.bdm.microsoftonline.com, ns2.bdm.microsoftonline.com, ns3.bdm.microsoftonline.com, ns4.bdm.microsoftonline.com"),
        p("Set at registrar:", { bold: true }),
        p("keira.ns.cloudflare.com, yoxall.ns.cloudflare.com"),
        bullet("numbers", "Final email/MX check in Cloudflare"),
        bullet("numbers", "Change nameservers at registrar; note timestamp"),
        bullet("numbers", "Wait for zone status Pending → Active in Cloudflare dashboard"),

        h2("Phase 6 — Post-Cutover Verification (Within 1 Hour)"),
        h3("DNS Propagation"),
        bullet("bullets", "NS returns Cloudflare nameservers globally"),
        bullet("bullets", "MX unchanged (M365)"),
        bullet("bullets", "SPF TXT and DKIM CNAMEs present"),
        bullet("bullets", "autodiscover resolves to Microsoft"),
        h3("Email Tests (Critical)"),
        bullet("bullets", "Gmail → steven.comeau@lightningcomms.net (inbound)"),
        bullet("bullets", "Reply from Outlook (outbound)"),
        bullet("bullets", "hello@alphamirror.trade → forward to steven.comeau@ still works"),
        h3("Service Tests"),
        bullet("bullets", "xrpl17.lightningcomms.net reachable at public IP"),
        bullet("bullets", "Internal names resolve via LAN DNS only"),

        h2("Phase 7 — Hardening (24–72 Hours After)"),
        bullet("numbers", "Raise TTLs back to 3600+"),
        bullet("numbers", "Add _dmarc TXT starting with p=none"),
        bullet("numbers", "Downgrade Pro → Free if unused (save $25/mo)"),
        bullet("numbers", "Update CF_DNS_API_TOKEN to include lightningcomms.net zone"),

        h2("Phase 8 — Rollback Plan"),
        p("If email fails within 2 hours: revert registrar NS to Microsoft nameservers, wait 15–30 minutes, re-test mail. alphamirror.trade is unaffected."),

        h2("Record Template for Cloudflare"),
        p("EMAIL — do not modify without M365 migration plan:"),
        p("MX    @    lightningcomms-net.mail.protection.outlook.com  0"),
        p("TXT   @    v=spf1 include:spf.protection.outlook.com -all"),
        p("CNAME autodiscover    autodiscover.outlook.com"),
        p("CNAME selector1._domainkey    (M365 DKIM target)"),
        p("CNAME selector2._domainkey    (M365 DKIM target)"),
        p("PUBLIC SERVICES (DNS only):"),
        p("A     @      98.183.227.178"),
        p("A     xrpl17 98.183.227.178"),
        p("INTERNAL ONLY — local DNS, not public Cloudflare:"),
        p("A     unifi  192.168.1.1"),
        p("A     winl17 192.168.1.87"),

        h2("Timeline Summary"),
        twoColTable([
          ["When", "Action"],
          ["T-48h", "Export M365 DNS; import into CF; lower TTLs"],
          ["T-24h", "Configure UniFi/local DNS for internal names"],
          ["T-1h", "Pre-flight dig tests against CF nameservers"],
          ["T-0", "Switch registrar NS to Cloudflare"],
          ["T+15min", "Verify MX and email send/receive"],
          ["T+24h", "Add DMARC, raise TTLs, downgrade Pro if unused"],
          ["T+72h", "Declare migration complete or rollback"],
        ]),

        h2("What Stays Unchanged"),
        twoColTable([
          ["Service", "Impact"],
          ["alphamirror.trade", "None — separate Cloudflare zone"],
          ["M365 mailboxes", "None — MX stays on Microsoft"],
          ["Stripe / Workers / KV", "None"],
          ["alphamirror → steven.comeau@ forwarding", "None if M365 mailbox works"],
        ]),
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outPath, buffer);
console.log(outPath);