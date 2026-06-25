import { faqPlainText, HELLO_EMAIL, SUPPORT_EMAIL } from "../lib/support-faq";
import { enqueueSupportCase } from "./support-case-store";

const FORWARD_TO = "steven.comeau@lightningcomms.net";
const FROM_HELLO = { email: HELLO_EMAIL, name: "Alpha Mirror" };
const FROM_SUPPORT = { email: SUPPORT_EMAIL, name: "Alpha Mirror Support" };

type Env = {
  AI: Ai;
  DATA_KV: KVNamespace;
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

function replySubject(original: string, fallback: string): string {
  const trimmed = original.trim();
  if (!trimmed) return fallback;
  return /^re:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}

function helloAutoReplyText(): string {
  return [
    "Thanks for reaching out to Alpha Mirror!",
    "",
    "We received your message and will respond within 1–2 business days.",
    "",
    "Quick answers:",
    "- Pro is $29/month + 0.5% per live mirrored trade",
    "- Paper mirroring is free (3 mirrors on Free plan)",
    "- Billing & invoices: billing@alphamirror.trade",
    "- Live help & FAQ: https://alphamirror.trade/support",
    "",
    "— Alpha Mirror",
    "https://alphamirror.trade",
  ].join("\n");
}

function helloAutoReplyHtml(): string {
  return [
    "<p>Thanks for reaching out to <strong>Alpha Mirror</strong>!</p>",
    "<p>We received your message and will respond within <strong>1–2 business days</strong>.</p>",
    "<ul>",
    "<li>Pro: $29/month + 0.5% per live mirrored trade</li>",
    "<li>Paper mirroring is free (3 mirrors on Free)</li>",
    "<li>Billing: <a href=\"mailto:billing@alphamirror.trade\">billing@alphamirror.trade</a></li>",
    "<li>FAQ & live chat: <a href=\"https://alphamirror.trade/support\">alphamirror.trade/support</a></li>",
    "</ul>",
    "<p>— Alpha Mirror<br><a href=\"https://alphamirror.trade\">alphamirror.trade</a></p>",
  ].join("");
}

async function aiSupportDraft(env: Env, userMessage: string): Promise<string> {
  const system = [
    "You are Alpha Mirror support. Write a helpful, concise email reply (plain text, under 200 words).",
    "Be warm and professional. If billing-specific, mention billing@alphamirror.trade.",
    "Not financial advice. Do not invent account details.",
    "",
    "FAQ reference:",
    faqPlainText(),
  ].join("\n");

  const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [
      { role: "system", content: system },
      { role: "user", content: userMessage.slice(0, 4000) },
    ],
  });

  if (typeof result === "object" && result !== null && "response" in result) {
    const text = (result as { response?: string }).response;
    if (text?.trim()) return text.trim();
  }
  if (result instanceof ReadableStream) {
    return (await new Response(result).text()).trim();
  }
  return [
    "Thank you for contacting Alpha Mirror support.",
    "",
    "We received your message and a team member will follow up within 1–2 business days.",
    "For billing: billing@alphamirror.trade",
    "FAQ: https://alphamirror.trade/support",
    "",
    "— Alpha Mirror Support",
  ].join("\n");
}

function recipientAddress(message: ForwardableEmailMessage): string {
  return message.to.toLowerCase();
}

function extractWallet(text: string): string | undefined {
  return text.match(/0x[a-fA-F0-9]{40}/)?.[0];
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const to = recipientAddress(message);
    const subject = message.headers.get("subject") ?? "";
    const raw = await new Response(message.raw).text();
    const userSnippet = raw.slice(0, 4000);
    const channel = to.includes("support@") ? SUPPORT_EMAIL : HELLO_EMAIL;

    await enqueueSupportCase(env.DATA_KV, {
      source: "email",
      channel,
      summary: userSnippet,
      subject,
      customerEmail: message.from,
      userAddress: extractWallet(userSnippet),
    });

    if (to.includes("support@")) {
      const body = await aiSupportDraft(env, userSnippet);
      const footer = [
        "",
        "---",
        "Need billing help? billing@alphamirror.trade",
        "FAQ & chat: https://alphamirror.trade/support",
      ].join("\n");

      await env.EMAIL.send({
        to: message.from,
        from: FROM_SUPPORT,
        subject: replySubject(subject, "Re: Your Alpha Mirror support request"),
        text: body + footer,
        html: `<p>${body.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p><hr><p>Billing: <a href="mailto:billing@alphamirror.trade">billing@alphamirror.trade</a> · <a href="https://alphamirror.trade/support">FAQ & chat</a></p>`,
      });
    } else {
      await env.EMAIL.send({
        to: message.from,
        from: FROM_HELLO,
        subject: replySubject(subject, "Thanks for contacting Alpha Mirror"),
        text: helloAutoReplyText(),
        html: helloAutoReplyHtml(),
      });
    }

    await message.forward(FORWARD_TO);
  },
} satisfies ExportedHandler<Env>;