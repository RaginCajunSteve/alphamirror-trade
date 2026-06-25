import { liveMirrorGuidePlainText } from "./live-mirror-guide";
import {
  NETWORK_MODE,
  leaderboardChainsLabel,
  liveExecutionNetworksLabel,
  siteStatusSummary,
} from "./network-config";

export const HELLO_EMAIL = "hello@alphamirror.trade";
export const SUPPORT_EMAIL = "support@alphamirror.trade";
export const BILLING_EMAIL = "billing@alphamirror.trade";

export interface FaqItem {
  question: string;
  answer: string;
}

const execNets = liveExecutionNetworksLabel();
const indexChains = leaderboardChainsLabel();
const isMainnet = NETWORK_MODE === "mainnet";

export const supportFaq: FaqItem[] = [
  {
    question: "What is Alpha Mirror?",
    answer:
      "Alpha Mirror identifies top on-chain traders by risk-adjusted ROI and lets you mirror their DEX swaps in paper or live mode. Your funds stay in your own wallet.",
  },
  {
    question: "What is the difference between paper and live mirroring?",
    answer: isMainnet
      ? `Paper mode simulates trades when we detect alpha-wallet activity — no funds move. Live mode (Pro) submits on-chain transactions via your approved USDC allowances on ${execNets}, scaled to your per-trade and daily caps.`
      : `Paper mode simulates trades when we detect alpha-wallet activity — no funds move. Live mode (Pro) submits on-chain transactions via your approved allowances on ${execNets}, scaled to your per-trade and daily caps. Stripe billing is production.`,
  },
  {
    question: "How do I enable live mirroring step by step?",
    answer: liveMirrorGuidePlainText(),
  },
  {
    question: "How much does Pro cost?",
    answer:
      "Pro is $29/month via Stripe, plus a 0.5% platform fee on each mirrored live trade. Paper mirroring is free (up to 3 mirrors on Free, more on Pro).",
  },
  {
    question: "How do I cancel Pro?",
    answer:
      "Manage your subscription in the Stripe customer portal (link in your receipt email) or email billing@alphamirror.trade with the email used at checkout.",
  },
  {
    question: "Where are my receipts and invoices?",
    answer:
      "Stripe emails receipts and monthly invoices automatically. For billing questions, contact billing@alphamirror.trade.",
  },
  {
    question: "Is this financial advice?",
    answer:
      "No. Alpha Mirror is a tooling platform. Past performance does not guarantee future results. Only mirror amounts you can afford to lose.",
  },
  {
    question: "How do I stop mirroring?",
    answer:
      "Pause mirrors in your dashboard, use Remove to delete a mirror permanently, or revoke token allowances in your wallet to stop live execution immediately.",
  },
  {
    question: "Which chains does mirroring use?",
    answer: isMainnet
      ? `The leaderboard indexes elite traders on ${indexChains}. Paper mirrors can simulate activity on any indexed chain. Live on-chain execution runs on ${execNets} via MirrorRouter on each network. Your dashboard shows per-chain execution status.`
      : `The leaderboard indexes traders across ${indexChains}. Paper mirrors simulate on those chains. Live on-chain execution currently runs on ${execNets}. Your dashboard shows per-chain execution status.`,
  },
  {
    question: "Is alphamirror.trade production or testnet?",
    answer: isMainnet
      ? `The website, support, and Stripe Pro billing ($29/mo) are production. Live on-chain mirroring uses real funds on ${execNets}. Paper mode is always simulated.`
      : `${siteStatusSummary()}. Paper mode is always simulated and costs nothing beyond your plan.`,
  },
];

export function faqPlainText(): string {
  return supportFaq.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n");
}

export function faqHtmlList(): string {
  return supportFaq
    .map((f) => `<dt><strong>${f.question}</strong></dt><dd>${f.answer}</dd>`)
    .join("");
}

export const SUPPORT_AGENT_SYSTEM_PROMPT = `You are Alpha Mirror's friendly support assistant on alphamirror.trade.

Help users with mirroring, pricing, billing, and how the product works. Be concise and accurate.

Key facts:
- ${siteStatusSummary()}.
- Leaderboard index chains: ${indexChains}. Live on-chain txs: ${execNets}.
- Free plan: up to 3 paper mirrors, no live execution.
- Pro plan: $29/month, live mirroring, 0.5% platform fee per mirrored trade, priority keeper queue.
- Billing & invoices: billing@alphamirror.trade
- General questions: hello@alphamirror.trade or support@alphamirror.trade
- Users keep custody; mirroring uses wallet allowances they approve per execution network.
- Not financial advice. Past performance ≠ future results.

If you cannot resolve billing disputes, refunds, or account-specific issues, direct the user to email billing@alphamirror.trade with their checkout email.

Never reveal API keys, secrets, or internal infrastructure details.

Live mirroring setup (share when users ask how to go live):
${liveMirrorGuidePlainText()}

FAQ:
${faqPlainText()}`;