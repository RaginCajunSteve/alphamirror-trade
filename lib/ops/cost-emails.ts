import { BILLING_EMAIL } from "@/lib/billing";
import { COST_CATEGORIES } from "./cost-policy";
import type { CostApprovalRequest } from "./cost-approvals";
import { DEFAULT_OWNER_EMAIL, ownerEmail } from "./cost-approvals";

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

const FROM = { email: "noreply@alphamirror.trade", name: "Alpha Mirror Ops" };
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://alphamirror.trade";

export async function sendCostApprovalRequest(
  request: CostApprovalRequest,
  to: string = ownerEmail() || DEFAULT_OWNER_EMAIL,
): Promise<{ ok: boolean; error?: string }> {
  const email = await getEmailBinding();
  if (!email) return { ok: false, error: "EMAIL binding unavailable" };

  const label = COST_CATEGORIES[request.category as keyof typeof COST_CATEGORIES] ?? request.category;
  const approveUrl = `${BASE_URL}/api/ops/cost-approve?token=${request.token}`;
  const denyUrl = `${BASE_URL}/api/ops/cost-approve?token=${request.token}&action=deny`;

  const subject = `Action needed — cost approval: ${request.category}`;
  const text = [
    "Alpha Mirror hit a spend guardrail that blocks seamless operations.",
    "",
    `Recommendation: ${request.summary}`,
    `Category: ${request.category} (${label})`,
    "Current baseline: ~$2–10/mo out-of-pocket (locked until you approve).",
    "",
    "Approve (one click):",
    approveUrl,
    "",
    "Or reply to this email with:",
    `  APPROVE ${request.category}`,
    `  DENY ${request.category}`,
    "",
    `Expires: ${new Date(request.expiresAt).toUTCString()}`,
  ].join("\n");

  const html = [
    "<p><strong>Spend guardrail — your approval is needed</strong></p>",
    `<p>${request.summary}</p>`,
    `<p><strong>Category:</strong> ${request.category}<br>`,
    `<strong>Enables:</strong> ${label}</p>`,
    `<p><a href="${approveUrl}" style="display:inline-block;padding:10px 18px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Approve</a>`,
    `&nbsp;<a href="${denyUrl}" style="display:inline-block;padding:10px 18px;background:#64748b;color:#fff;text-decoration:none;border-radius:6px">Deny</a></p>`,
    `<p style="color:#666;font-size:13px">Or reply with <code>APPROVE ${request.category}</code> or <code>DENY ${request.category}</code></p>`,
  ].join("");

  try {
    await email.send({
      to,
      from: FROM,
      replyTo: BILLING_EMAIL,
      subject,
      html,
      text,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}

export async function sendCostApprovalConfirmation(
  category: string,
  action: "approved" | "denied",
  to: string = ownerEmail() || DEFAULT_OWNER_EMAIL,
): Promise<{ ok: boolean; error?: string }> {
  const email = await getEmailBinding();
  if (!email) return { ok: false, error: "EMAIL binding unavailable" };

  const label = COST_CATEGORIES[category as keyof typeof COST_CATEGORIES] ?? category;
  const subject =
    action === "approved"
      ? `Approved — ${category} spend unlocked`
      : `Denied — ${category} spend request`;
  const text =
    action === "approved"
      ? `You approved "${category}" (${label}). Operations using this category may proceed.\n\n${BASE_URL}`
      : `You denied "${category}". The spend guardrail remains in place.\n\n${BASE_URL}`;

  try {
    await email.send({ to, from: FROM, subject, text, html: `<p>${text.replace(/\n/g, "<br>")}</p>` });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}