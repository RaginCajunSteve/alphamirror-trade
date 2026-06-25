import { NextRequest, NextResponse } from "next/server";
import { readDataJson, writeDataJson } from "@/lib/data-adapter";
import { reportCostBarrier, KV_COST_REQUESTS, type CostApprovalRequest } from "@/lib/ops/cost-approvals";
import { sendCostApprovalRequest } from "@/lib/ops/cost-emails";
import { COST_CATEGORIES } from "@/lib/ops/cost-policy";

function authorized(request: NextRequest): boolean {
  const secret = process.env.OPS_ADMIN_SECRET;
  if (!secret) return false;
  return request.headers.get("x-ops-secret") === secret;
}

/** Report a cost barrier — queues owner email (deduped 24h per category+source). */
export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { category, summary, source, notify = true } = body ?? {};

  if (!category || !summary || !source) {
    return NextResponse.json(
      { error: "Missing category, summary, or source" },
      { status: 400 },
    );
  }

  if (!(category in COST_CATEGORIES)) {
    return NextResponse.json(
      { error: `Unknown category. Valid: ${Object.keys(COST_CATEGORIES).join(", ")}` },
      { status: 400 },
    );
  }

  const req = await reportCostBarrier({
    category: String(category),
    summary: String(summary),
    source: String(source),
  });

  if (!req) {
    return NextResponse.json({
      ok: true,
      queued: false,
      reason: "already_approved_or_recent",
    });
  }

  let emailed = false;
  if (notify && !req.notifiedAt) {
    const sent = await sendCostApprovalRequest(req);
    if (sent.ok) {
      emailed = true;
      const requests = await readDataJson<CostApprovalRequest[]>(KV_COST_REQUESTS, []);
      const idx = requests.findIndex((r) => r.id === req.id);
      if (idx >= 0) {
        requests[idx] = { ...requests[idx], notifiedAt: new Date().toISOString() };
        await writeDataJson(KV_COST_REQUESTS, requests);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    queued: true,
    emailed,
    request: { id: req.id, category: req.category, token: req.token },
  });
}

/** List pending cost approval requests (admin). */
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requests = await readDataJson<CostApprovalRequest[]>(KV_COST_REQUESTS, []);
  const pending = requests.filter((r) => r.status === "pending");
  const approved = await import("@/lib/ops/cost-approvals").then((m) =>
    m.getKvApprovedCategories(),
  );

  return NextResponse.json({ pending, approvedCategories: approved });
}