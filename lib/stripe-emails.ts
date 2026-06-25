import { BILLING_EMAIL, BILLING_INVOICE_FOOTER } from "@/lib/billing";
import { plans } from "@/lib/pricing";

type EmailBinding = {
  send(message: {
    to: string;
    from: string | { email: string; name?: string };
    subject: string;
    html: string;
    text: string;
    replyTo?: string;
  }): Promise<{ messageId?: string }>;
};

async function getEmailBinding(): Promise<EmailBinding | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    return (env as { EMAIL?: EmailBinding }).EMAIL ?? null;
  } catch {
    return null;
  }
}

async function sendFromBilling(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = await getEmailBinding();
  if (!email) return { ok: false, error: "EMAIL binding unavailable" };

  try {
    await email.send({
      to: opts.to,
      from: { email: BILLING_EMAIL, name: "Alpha Mirror Billing" },
      replyTo: BILLING_EMAIL,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}

export async function sendProWelcomeReceipt(opts: {
  to: string;
  walletAddress: string;
  amountUsd: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const amount = opts.amountUsd.toFixed(2);
  const subject = "Alpha Mirror Pro — subscription receipt";
  const text = [
    "Thank you for subscribing to Alpha Mirror Pro.",
    "",
    `Plan: Pro ($${amount}/month)`,
    `Wallet: ${opts.walletAddress}`,
    "",
    "Stripe will also email official receipts and invoices for each payment.",
    "",
    `Billing & invoice questions: ${BILLING_EMAIL}`,
    "",
    "— Alpha Mirror",
    "https://alphamirror.trade",
  ].join("\n");

  const html = [
    "<p>Thank you for subscribing to <strong>Alpha Mirror Pro</strong>.</p>",
    "<ul>",
    `<li><strong>Plan:</strong> Pro ($${amount}/month)</li>`,
    `<li><strong>Wallet:</strong> <code>${opts.walletAddress}</code></li>`,
    "</ul>",
    "<p>Stripe will also email official receipts and invoices for each payment.</p>",
    `<p><strong>Billing &amp; invoice questions:</strong> <a href="mailto:${BILLING_EMAIL}">${BILLING_EMAIL}</a></p>`,
    `<p style="color:#666;font-size:12px">${BILLING_INVOICE_FOOTER}</p>`,
    '<p>— Alpha Mirror<br><a href="https://alphamirror.trade">alphamirror.trade</a></p>',
  ].join("");

  return sendFromBilling({ to: opts.to, subject, html, text });
}

export async function sendInvoiceReceipt(opts: {
  to: string;
  amountUsd: number;
  invoiceNumber?: string | null;
  periodLabel?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const amount = opts.amountUsd.toFixed(2);
  const inv = opts.invoiceNumber ? `Invoice #${opts.invoiceNumber}` : "Invoice";
  const period = opts.periodLabel ? ` (${opts.periodLabel})` : "";
  const subject = `Alpha Mirror Pro — ${inv}${period}`;

  const text = [
    `Your Alpha Mirror Pro subscription payment of $${amount} was received.`,
    "",
    opts.invoiceNumber ? `Invoice: ${opts.invoiceNumber}` : "",
    "",
    `Billing & invoice questions: ${BILLING_EMAIL}`,
    "",
    "— Alpha Mirror Billing",
  ]
    .filter(Boolean)
    .join("\n");

  const html = [
    `<p>Your <strong>Alpha Mirror Pro</strong> subscription payment of <strong>$${amount}</strong> was received.</p>`,
    opts.invoiceNumber ? `<p>Invoice: <strong>${opts.invoiceNumber}</strong></p>` : "",
    `<p><strong>Billing &amp; invoice questions:</strong> <a href="mailto:${BILLING_EMAIL}">${BILLING_EMAIL}</a></p>`,
    `<p style="color:#666;font-size:12px">${BILLING_INVOICE_FOOTER}</p>`,
    "<p>— Alpha Mirror Billing</p>",
  ].join("");

  return sendFromBilling({ to: opts.to, subject, html, text });
}

export function proPlanAmountUsd(): number {
  return plans.pro.priceUsdMonthly;
}