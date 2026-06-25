import { enqueueSupportCase } from "./support-case-store";
import {
  DEFAULT_OWNER_EMAIL,
  handleEmailApprovalCommand,
  parseEmailApprovalCommand,
  sendApprovalConfirmationEmail,
} from "./ops/cost-approvals.mjs";

const FORWARD_TO = "steven.comeau@lightningcomms.net";
const BILLING_FROM = "billing@alphamirror.trade";
const BILLING_NAME = "Alpha Mirror Billing";

type Env = {
  DATA_KV: KVNamespace;
  OPS_OWNER_EMAIL?: string;
  NEXT_PUBLIC_APP_URL?: string;
  EMAIL: {
    send(message: {
      to: string;
      from: string | { email: string; name?: string };
      subject: string;
      html: string;
      text: string;
    }): Promise<unknown>;
  };
};

function replySubject(original: string): string {
  const trimmed = original.trim();
  if (!trimmed) return "We received your billing inquiry";
  return /^re:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}

function extractWallet(text: string): string | undefined {
  return text.match(/0x[a-fA-F0-9]{40}/)?.[0];
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const subject = message.headers.get("subject") ?? "";
    const replySubj = replySubject(subject);
    const raw = await new Response(message.raw).text();
    const from = message.from.toLowerCase().trim();
    const owner = (env.OPS_OWNER_EMAIL ?? DEFAULT_OWNER_EMAIL).toLowerCase();

    const costCommand = parseEmailApprovalCommand(raw);
    if (costCommand && from === owner) {
      const result = await handleEmailApprovalCommand(env.DATA_KV, costCommand, {
        via: "email-reply",
        from: message.from,
      });
      const baseUrl = env.NEXT_PUBLIC_APP_URL ?? "https://alphamirror.trade";
      const confirmText = result.ok
        ? result.action === "approved"
          ? `Approved "${costCommand.category}". Operations using this category may proceed.\n\n${baseUrl}`
          : `Denied "${costCommand.category}". Spend guardrail remains active.\n\n${baseUrl}`
        : `Could not process: ${result.error ?? "unknown error"}\n\n${baseUrl}`;

      await env.EMAIL.send({
        to: message.from,
        from: { email: BILLING_FROM, name: BILLING_NAME },
        subject: result.ok
          ? `Re: Cost approval — ${costCommand.category} ${result.action}`
          : "Re: Cost approval — could not process",
        text: confirmText,
        html: `<p>${confirmText.replace(/\n/g, "<br>")}</p>`,
      });

      if (result.ok) {
        await sendApprovalConfirmationEmail(env, {
          category: costCommand.category,
          action: result.action === "approved" ? "approved" : "denied",
          baseUrl,
        });
      }
      await message.forward(FORWARD_TO);
      return;
    }

    await enqueueSupportCase(env.DATA_KV, {
      source: "billing_email",
      channel: BILLING_FROM,
      summary: raw.slice(0, 4000),
      subject,
      customerEmail: message.from,
      userAddress: extractWallet(raw),
    });

    const text = [
      "Thank you for contacting Alpha Mirror billing.",
      "",
      "We received your message and will respond within 1–2 business days.",
      "",
      "Quick answers:",
      "- Pro: $29/month via Stripe + 0.5% platform fee per live mirrored trade",
      "- Cancel: use the link in your Stripe receipt or reply with your checkout email",
      "- Receipts & invoices: sent automatically by Stripe to your checkout email",
      "",
      "For faster help, include the email address used at checkout.",
      "FAQ & live chat: https://alphamirror.trade/support",
      "",
      "— Alpha Mirror Billing",
      "https://alphamirror.trade",
    ].join("\n");

    const html = [
      "<p>Thank you for contacting <strong>Alpha Mirror</strong> billing.</p>",
      "<p>We received your message and will respond within <strong>1–2 business days</strong>.</p>",
      "<ul>",
      "<li><strong>Pro:</strong> $29/month + 0.5% per live mirrored trade</li>",
      "<li><strong>Cancel:</strong> use the link in your Stripe receipt or reply with your checkout email</li>",
      "<li><strong>Receipts:</strong> emailed automatically by Stripe</li>",
      "</ul>",
      "<p>Include your checkout email for faster help.</p>",
      "<p><a href=\"https://alphamirror.trade/support\">FAQ & live chat</a></p>",
      "<p>— Alpha Mirror Billing<br><a href=\"https://alphamirror.trade\">alphamirror.trade</a></p>",
    ].join("");

    await env.EMAIL.send({
      to: message.from,
      from: { email: BILLING_FROM, name: BILLING_NAME },
      subject: replySubj,
      html,
      text,
    });

    await message.forward(FORWARD_TO);
  },
} satisfies ExportedHandler<Env>;