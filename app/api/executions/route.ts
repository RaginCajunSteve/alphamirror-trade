import { NextRequest, NextResponse } from "next/server";
import { getRevenueStats, listExecutions } from "@/lib/storage";

export async function GET(request: NextRequest) {
  const user = request.nextUrl.searchParams.get("user") ?? undefined;
  const includeRevenue = request.nextUrl.searchParams.get("revenue") === "1";

  const executions = await listExecutions(user);
  const payload: Record<string, unknown> = {
    executions: executions.slice(-50).reverse(),
  };

  if (includeRevenue && !user) {
    payload.revenue = await getRevenueStats();
  }

  return NextResponse.json(payload);
}