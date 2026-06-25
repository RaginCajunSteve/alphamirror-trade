import { BILLING_EMAIL } from "@/lib/billing";
import { formatMaintenanceRange } from "./maintenance";
import type { MaintenanceWindow } from "./types";

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

const FROM = { email: "noreply@alphamirror.trade", name: "Alpha Mirror" };

export async function sendMaintenanceNotice(
  to: string,
  window: MaintenanceWindow,
): Promise<{ ok: boolean; error?: string }> {
  const email = await getEmailBinding();
  if (!email) return { ok: false, error: "EMAIL binding unavailable" };

  const range = formatMaintenanceRange(window);
  const subject = `Scheduled maintenance — ${window.title}`;
  const text = [
    "Alpha Mirror scheduled maintenance:",
    "",
    window.title,
    range,
    `Expected back online: ${new Date(window.expectedEndAt).toUTCString()}`,
    "",
    "Status: https://alphamirror.trade/status",
    "",
    `Questions: ${BILLING_EMAIL}`,
  ].join("\n");

  const html = [
    `<p><strong>Scheduled maintenance</strong></p>`,
    `<p>${window.title}</p>`,
    `<p>${range}</p>`,
    `<p>Expected back online: <strong>${new Date(window.expectedEndAt).toUTCString()}</strong></p>`,
    `<p><a href="https://alphamirror.trade/status">Status page</a></p>`,
    `<p style="color:#666;font-size:12px">Questions: ${BILLING_EMAIL}</p>`,
  ].join("");

  try {
    await email.send({ to, from: FROM, replyTo: BILLING_EMAIL, subject, html, text });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}

export async function sendMaintenanceUpdate(
  to: string,
  window: MaintenanceWindow,
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  const email = await getEmailBinding();
  if (!email) return { ok: false, error: "EMAIL binding unavailable" };

  const back = window.expectedEndAt
    ? new Date(window.expectedEndAt).toUTCString()
    : "TBD";
  const subject = `Maintenance update — ${window.title}`;
  const text = [message, "", `Expected back online: ${back}`, "", "https://alphamirror.trade/status"].join(
    "\n",
  );
  const html = [
    `<p>${message}</p>`,
    `<p>Expected back online: <strong>${back}</strong></p>`,
    `<p><a href="https://alphamirror.trade/status">Status page</a></p>`,
  ].join("");

  try {
    await email.send({ to, from: FROM, replyTo: BILLING_EMAIL, subject, html, text });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}

export async function sendMaintenanceRestored(
  to: string,
  window: MaintenanceWindow,
): Promise<{ ok: boolean; error?: string }> {
  const email = await getEmailBinding();
  if (!email) return { ok: false, error: "EMAIL binding unavailable" };

  const subject = `Back online — ${window.title}`;
  const text = [
    "Alpha Mirror is back online.",
    "",
    "https://alphamirror.trade",
  ].join("\n");
  const html = `<p><strong>Alpha Mirror is back online.</strong></p><p><a href="https://alphamirror.trade">alphamirror.trade</a></p>`;

  try {
    await email.send({ to, from: FROM, replyTo: BILLING_EMAIL, subject, html, text });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}