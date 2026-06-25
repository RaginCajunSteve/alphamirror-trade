import { SUPPORT_EMAIL } from "../lib/support-faq";
import type { SupportCase } from "../lib/support-cases";
import { listSupportCases, upsertSupportCase } from "./support-case-store";
import { investigateSupportCase } from "./support-investigator";

const OPS_INBOX = "steven.comeau@lightningcomms.net";
const FROM_SUPPORT = { email: SUPPORT_EMAIL, name: "Alpha Mirror Support" };
const MAX_PER_RUN = 8;

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

async function sendCustomerResolution(
  env: Env,
  supportCase: SupportCase,
  body: string,
): Promise<void> {
  if (!supportCase.customerEmail) return;
  const subject = supportCase.subject
    ? `Re: ${supportCase.subject.replace(/^re:\s*/i, "")}`
    : "Update on your Alpha Mirror support request";

  await env.EMAIL.send({
    to: supportCase.customerEmail,
    from: FROM_SUPPORT,
    subject,
    text: body,
    html: `<p>${body.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`,
  });
}

async function sendEscalation(env: Env, supportCase: SupportCase, reason: string): Promise<void> {
  const text = [
    `[Alpha Mirror Support Job] Escalation — case ${supportCase.id}`,
    "",
    `Source: ${supportCase.source} · Channel: ${supportCase.channel}`,
    `Customer: ${supportCase.customerEmail ?? "unknown"}`,
    `Wallet: ${supportCase.userAddress ?? "unknown"}`,
    `Reason: ${reason}`,
    "",
    "Investigation:",
    supportCase.investigation
      ? `- Issue: ${supportCase.investigation.issueType}\n- Findings: ${supportCase.investigation.findings}\n- Action: ${supportCase.investigation.recommendedAction}`
      : "(none)",
    "",
    "Original:",
    supportCase.summary.slice(0, 2000),
    supportCase.transcript ? `\nTranscript:\n${supportCase.transcript.slice(0, 2000)}` : "",
  ].join("\n");

  await env.EMAIL.send({
    to: OPS_INBOX,
    from: FROM_SUPPORT,
    subject: `[Escalation] ${supportCase.investigation?.issueType ?? "support"} — ${supportCase.id}`,
    text,
    html: `<pre style="font-family:monospace;white-space:pre-wrap">${text.replace(/</g, "&lt;")}</pre>`,
  });
}

async function processCase(env: Env, supportCase: SupportCase): Promise<void> {
  supportCase.status = "investigating";
  await upsertSupportCase(env.DATA_KV, supportCase);

  try {
    const outcome = await investigateSupportCase(env.AI, env.DATA_KV, supportCase);
    supportCase.investigation = outcome.investigation;

    if (outcome.shouldEscalate) {
      supportCase.status = "escalated";
      supportCase.resolution = {
        customerMessage: outcome.customerReply,
        escalatedTo: OPS_INBOX,
        escalatedAt: new Date().toISOString(),
      };
      await upsertSupportCase(env.DATA_KV, supportCase);
      await sendEscalation(env, supportCase, outcome.escalateReason ?? "Escalated by policy.");
      return;
    }

    supportCase.status = "auto_resolved";
    supportCase.resolution = {
      customerMessage: outcome.customerReply,
      emailedTo: supportCase.customerEmail,
      emailedAt: new Date().toISOString(),
    };
    await upsertSupportCase(env.DATA_KV, supportCase);

    if (supportCase.customerEmail) {
      await sendCustomerResolution(env, supportCase, outcome.customerReply);
    } else {
      await sendEscalation(
        env,
        supportCase,
        "Auto-resolved in system but no customer email — ops copy for awareness.",
      );
    }
  } catch (err) {
    supportCase.status = "failed";
    supportCase.investigation = {
      issueType: "job_error",
      findings: err instanceof Error ? err.message : String(err),
      recommendedAction: "Manual review",
      confidence: "low",
      investigatedAt: new Date().toISOString(),
    };
    await upsertSupportCase(env.DATA_KV, supportCase);
    await sendEscalation(env, supportCase, "Support job failed during investigation.");
  }
}

export async function runSupportInvestigationJob(env: Env): Promise<{
  processed: number;
  openRemaining: number;
}> {
  const cases = await listSupportCases(env.DATA_KV);
  const open = cases.filter((c) => c.status === "open").slice(0, MAX_PER_RUN);

  for (const item of open) {
    await processCase(env, item);
  }

  const remaining = (await listSupportCases(env.DATA_KV)).filter((c) => c.status === "open")
    .length;
  return { processed: open.length, openRemaining: remaining };
}

export default {
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(
      runSupportInvestigationJob(env).then((r) =>
        console.log(
          `support-jobs processed=${r.processed} openRemaining=${r.openRemaining}`,
        ),
      ),
    );
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/run" && request.method === "POST") {
      const result = await runSupportInvestigationJob(env);
      return Response.json({ ok: true, ...result });
    }
    if (url.pathname === "/cases" && request.method === "GET") {
      const cases = await listSupportCases(env.DATA_KV);
      return Response.json({ cases: cases.slice(-50) });
    }
    return new Response("alpha-wallet-support-jobs", { status: 200 });
  },
} satisfies ExportedHandler<Env>;