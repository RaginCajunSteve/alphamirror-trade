import { NextResponse } from "next/server";
import { listQueue } from "@/lib/mirror-queue";

export async function GET() {
  const queue = await listQueue(25);
  return NextResponse.json({ queue });
}