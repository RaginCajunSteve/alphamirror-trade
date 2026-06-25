import { NextResponse } from "next/server";

export async function GET() {
  const agentUrl = process.env.NEXT_PUBLIC_SUPPORT_AGENT_URL ?? null;
  return NextResponse.json({ agentUrl });
}