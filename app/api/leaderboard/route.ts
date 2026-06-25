import { NextRequest, NextResponse } from "next/server";
import { getLeaderboardFromIndexer } from "@/lib/indexer/leaderboard";
import type { Window } from "@/lib/types";

const windows: Window[] = ["30d", "90d", "180d"];

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("window") ?? "90d";
  const window = (windows.includes(raw as Window) ? raw : "90d") as Window;
  const data = await getLeaderboardFromIndexer(window);
  return NextResponse.json(data);
}