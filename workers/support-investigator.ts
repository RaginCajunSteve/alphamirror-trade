import { faqPlainText } from "../lib/support-faq";
import type { SupportCase, SupportInvestigation } from "../lib/support-cases";

type Kv = {
  get(key: string, type: "json"): Promise<unknown>;
};

type Subscription = {
  userAddress: string;
  plan: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
};

type MirrorConfig = {
  id: string;
  userAddress: string;
  alphaWallet: string;
  status: string;
  mode: string;
};

export type InvestigationOutcome = {
  investigation: SupportInvestigation;
  customerReply: string;
  shouldEscalate: boolean;
  escalateReason?: string;
};

async function readJson<T>(kv: Kv, key: string, fallback: T): Promise<T> {
  const row = await kv.get(key, "json");
  return (row as T) ?? fallback;
}

async function buildAccountContext(kv: Kv, supportCase: SupportCase): Promise<string> {
  const parts: string[] = [];
  const addr = supportCase.userAddress?.toLowerCase();
  if (!addr) return "No wallet address provided.";

  const subs = await readJson<Subscription[]>(kv, "subscriptions.json", []);
  const sub = subs.find((s) => s.userAddress.toLowerCase() === addr);
  if (sub) {
    parts.push(
      `Subscription: plan=${sub.plan}, stripeCustomerId=${sub.stripeCustomerId ?? "none"}`,
    );
  } else {
    parts.push("Subscription: none on file (defaults to free).");
  }

  const mirrors = await readJson<MirrorConfig[]>(kv, "mirrors.json", []);
  const userMirrors = mirrors.filter((m) => m.userAddress.toLowerCase() === addr);
  if (userMirrors.length === 0) {
    parts.push("Mirrors: none configured.");
  } else {
    parts.push(
      `Mirrors (${userMirrors.length}): ${userMirrors
        .slice(0, 5)
        .map((m) => `${m.id} ${m.status}/${m.mode} → ${m.alphaWallet.slice(0, 10)}…`)
        .join("; ")}`,
    );
  }

  return parts.join("\n");
}

function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const SENSITIVE_KEYWORDS =
  /refund|chargeback|dispute|fraud|hack|compromised|legal|lawyer|cancel.*subscription/i;

export async function investigateSupportCase(
  ai: Ai,
  kv: Kv,
  supportCase: SupportCase,
): Promise<InvestigationOutcome> {
  const accountContext = await buildAccountContext(kv, supportCase);
  const combinedText = [supportCase.summary, supportCase.transcript ?? ""].join("\n");
  const forceEscalate = SENSITIVE_KEYWORDS.test(combinedText);

  const system = [
    "You are Alpha Mirror's support operations AI.",
    "Investigate the customer issue and propose a resolution.",
    "Return ONLY valid JSON with keys:",
    "issueType (string), findings (string), recommendedAction (string),",
    "customerReply (string, ready to email — warm, under 180 words),",
    'confidence ("low"|"medium"|"high"), shouldEscalate (boolean), escalateReason (string|null).',
    "Escalate if: refunds, chargebacks, account security, legal threats, or missing data to answer.",
    "Never promise refunds or plan changes you cannot verify. Not financial advice.",
    "",
    "FAQ:",
    faqPlainText(),
  ].join("\n");

  const user = [
    `Source: ${supportCase.source}`,
    `Channel: ${supportCase.channel}`,
    `Customer email: ${supportCase.customerEmail ?? "unknown"}`,
    `Wallet: ${supportCase.userAddress ?? "unknown"}`,
    `Subject: ${supportCase.subject ?? "n/a"}`,
    "",
    "Customer message / transcript:",
    combinedText.slice(0, 6000),
    "",
    "Account context:",
    accountContext,
  ].join("\n");

  const result = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  let text = "";
  if (typeof result === "object" && result !== null && "response" in result) {
    text = String((result as { response?: string }).response ?? "");
  } else if (result instanceof ReadableStream) {
    text = await new Response(result).text();
  }

  const parsed = extractJson(text);
  const confidence =
    parsed?.confidence === "high" || parsed?.confidence === "medium" || parsed?.confidence === "low"
      ? parsed.confidence
      : "low";

  const shouldEscalate =
    forceEscalate ||
    parsed?.shouldEscalate === true ||
    confidence === "low";

  const investigation: SupportInvestigation = {
    issueType: String(parsed?.issueType ?? "general_inquiry"),
    findings: String(parsed?.findings ?? "Automated investigation could not parse structured findings."),
    recommendedAction: String(
      parsed?.recommendedAction ?? "Human review recommended.",
    ),
    confidence,
    investigatedAt: new Date().toISOString(),
  };

  const customerReply =
    String(parsed?.customerReply ?? "").trim() ||
    [
      "Thanks for contacting Alpha Mirror.",
      "",
      "We reviewed your message and are looking into it. A team member will follow up if needed.",
      "Billing: billing@alphamirror.trade · FAQ: https://alphamirror.trade/support",
      "",
      "— Alpha Mirror Support",
    ].join("\n");

  return {
    investigation,
    customerReply,
    shouldEscalate,
    escalateReason: forceEscalate
      ? "Sensitive topic detected (refund, security, or legal)."
      : parsed?.escalateReason
        ? String(parsed.escalateReason)
        : confidence === "low"
          ? "Low confidence automated resolution."
          : undefined,
  };
}