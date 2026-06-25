import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
import { createWorkersAI } from "workers-ai-provider";
import { streamText, convertToModelMessages, tool, stepCountIs } from "ai";
import { z } from "zod";
import { SUPPORT_AGENT_SYSTEM_PROMPT, supportFaq, BILLING_EMAIL, HELLO_EMAIL, SUPPORT_EMAIL } from "../lib/support-faq";
import { enqueueSupportCase } from "./support-case-store";

export type SupportEnv = {
  AI: Ai;
  DATA_KV: KVNamespace;
  SupportAgent: DurableObjectNamespace<SupportAgent>;
};

function transcriptFromMessages(
  messages: Array<{ role: string; parts?: Array<{ type: string; text?: string }> }>,
): string {
  return messages
    .map((m) => {
      const text = m.parts
        ?.filter((p) => p.type === "text" && p.text)
        .map((p) => p.text)
        .join(" ");
      return text ? `${m.role}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function extractWallet(text: string): string | undefined {
  const match = text.match(/0x[a-fA-F0-9]{40}/);
  return match?.[0];
}

export class SupportAgent extends AIChatAgent<SupportEnv> {
  private queueChatCase(): void {
    const transcript = transcriptFromMessages(this.messages);
    const userText = this.messages
      .filter((m) => m.role === "user")
      .map((m) =>
        m.parts
          ?.filter((p) => p.type === "text")
          .map((p) => ("text" in p ? p.text : ""))
          .join(" "),
      )
      .join("\n");
    if (!userText.trim()) return;

    const summary = userText.trim().slice(0, 2000);
    const wallet = extractWallet(transcript);

    this.ctx.waitUntil(
      enqueueSupportCase(this.env.DATA_KV, {
        source: "chat",
        channel: `chat:${this.ctx.id.toString()}`,
        summary,
        transcript,
        userAddress: wallet,
      }).catch((err) => console.error("queueChatCase", err)),
    );
  }

  async onChatMessage() {
    const workersai = createWorkersAI({ binding: this.env.AI });

    const result = streamText({
      model: workersai("@cf/meta/llama-3.1-8b-instruct"),
      system: SUPPORT_AGENT_SYSTEM_PROMPT,
      messages: await convertToModelMessages(this.messages),
      tools: {
        getPricingInfo: tool({
          description: "Return Alpha Mirror Free vs Pro plan details and pricing.",
          inputSchema: z.object({}),
          execute: async () => ({
            free: {
              price: "$0",
              paperMirrors: 3,
              liveMirrors: false,
            },
            pro: {
              price: "$29/month",
              platformFee: "0.5% per mirrored live trade",
              liveMirrors: true,
              billingEmail: BILLING_EMAIL,
            },
          }),
        }),
        getSupportContacts: tool({
          description: "Return support email addresses for different inquiry types.",
          inputSchema: z.object({}),
          execute: async () => ({
            general: HELLO_EMAIL,
            productSupport: SUPPORT_EMAIL,
            billing: BILLING_EMAIL,
            website: "https://alphamirror.trade/support",
          }),
        }),
        searchFaq: tool({
          description: "Search the FAQ knowledge base by keyword.",
          inputSchema: z.object({ query: z.string() }),
          execute: async ({ query }) => {
            const q = query.toLowerCase();
            const hits = supportFaq.filter(
              (f) =>
                f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q),
            );
            return hits.length > 0 ? hits.slice(0, 4) : supportFaq.slice(0, 4);
          },
        }),
      },
      stopWhen: stepCountIs(5),
    });

    this.queueChatCase();
    return result.toUIMessageStreamResponse();
  }
}

const ALLOWED_ORIGINS = new Set([
  "https://alphamirror.trade",
  "https://www.alphamirror.trade",
  "https://alpha-wallet-mirror.alpha-wallet.workers.dev",
  "http://localhost:3000",
]);

function corsHeaders(origin: string | null): HeadersInit {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request: Request, env: SupportEnv): Promise<Response> {
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const response = await routeAgentRequest(request, env);
    if (!response) {
      return new Response("Not found", { status: 404, headers: corsHeaders(origin) });
    }

    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(corsHeaders(origin))) {
      headers.set(k, v);
    }
    return new Response(response.body, { status: response.status, headers });
  },
} satisfies ExportedHandler<SupportEnv>;