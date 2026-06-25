import { BILLING_EMAIL } from "@/lib/billing";

const FROM_ADDRESS = "noreply@alphamirror.trade";
const FROM_NAME = "Alpha Mirror";

type EmailBinding = {
  send(message: {
    to: string | string[];
    from: string | { email: string; name?: string };
    subject: string;
    html?: string;
    text?: string;
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

export async function sendTransactionalEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}): Promise<{ ok: true; messageId?: string } | { ok: false; error: string }> {
  const email = await getEmailBinding();
  if (!email) {
    return { ok: false, error: "EMAIL binding unavailable" };
  }

  try {
    const result = await email.send({
      to: opts.to,
      from: { email: FROM_ADDRESS, name: FROM_NAME },
      replyTo: opts.replyTo ?? BILLING_EMAIL,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    return { ok: true, messageId: result.messageId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}