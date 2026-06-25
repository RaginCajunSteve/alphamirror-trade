import { NextResponse } from "next/server";
import { getMaintenanceWindows, getOpsState } from "@/lib/ops/storage";
import { getPublicStatus } from "@/lib/ops/status";

export const dynamic = "force-dynamic";

export async function GET() {
  const [status, windows, state] = await Promise.all([
    getPublicStatus(),
    getMaintenanceWindows(),
    getOpsState(),
  ]);

  return NextResponse.json({
    ...status,
    upcoming: windows.filter((w) => w.status === "scheduled").slice(0, 3),
    health: state.health?.overall ?? null,
    roiScore: state.roi?.roiScore ?? null,
    securityScore: state.security?.score ?? null,
    opsPhase: state.phase,
    opsCycle: state.cycle,
  });
}