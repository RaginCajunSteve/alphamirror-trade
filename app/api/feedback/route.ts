import { NextRequest, NextResponse } from "next/server";
import { addFeedback, listFeedback } from "@/lib/storage";
import type { FeedbackEntry } from "@/lib/types";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { enqueueSupportCaseFromApp } from "@/lib/support-case-queue";

export async function GET(request: NextRequest) {
  const since = request.nextUrl.searchParams.get("since");
  let items = await listFeedback();
  if (since) {
    const cutoff = new Date(since).getTime();
    items = items.filter((f) => new Date(f.timestamp).getTime() >= cutoff);
  }
  return NextResponse.json({ feedback: items });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { page, category, message, userAddress, turnstileToken } = body;

  if (!page || !category || !message?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const turnstile = await verifyTurnstileToken(
    turnstileToken,
    process.env.TURNSTILE_SECRET_KEY,
    request.headers.get("cf-connecting-ip") ?? undefined,
  );
  if (!turnstile.ok) {
    return NextResponse.json({ error: turnstile.error ?? "Verification failed" }, { status: 403 });
  }

  const entry: FeedbackEntry = {
    id: `fb-${Date.now().toString(36)}`,
    page,
    category,
    message: message.trim(),
    userAddress,
    timestamp: new Date().toISOString(),
  };

  await addFeedback(entry);
  await enqueueSupportCaseFromApp({
    source: "feedback",
    channel: `feedback:${entry.category}`,
    summary: entry.message,
    userAddress: userAddress,
  });
  return NextResponse.json({ id: entry.id, ok: true });
}