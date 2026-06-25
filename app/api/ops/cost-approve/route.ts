import { NextRequest, NextResponse } from "next/server";
import {
  findRequestByToken,
  getKvApprovedCategories,
  resolveRequest,
} from "@/lib/ops/cost-approvals";
import {
  sendCostApprovalConfirmation,
} from "@/lib/ops/cost-emails";
import { COST_CATEGORIES } from "@/lib/ops/cost-policy";

function approvalHtml(params: {
  title: string;
  body: string;
  ok: boolean;
  categories?: string[];
}) {
  const cats =
    params.categories?.length ?
      `<p style="color:#666;font-size:13px">Approved categories: ${params.categories.join(", ")}</p>`
    : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${params.title}</title></head><body style="font-family:system-ui,sans-serif;max-width:520px;margin:40px auto;padding:0 16px"><h1 style="font-size:1.25rem">${params.title}</h1><p>${params.body}</p>${cats}<p><a href="https://alphamirror.trade/status">Status page</a></p></body></html>`;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim();
  const action = request.nextUrl.searchParams.get("action")?.trim()?.toLowerCase();

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const req = await findRequestByToken(token);
  if (!req) {
    return new NextResponse(
      approvalHtml({
        title: "Request not found",
        body: "This approval link is invalid or has already been cleared.",
        ok: false,
      }),
      { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  if (!action) {
    const label = COST_CATEGORIES[req.category as keyof typeof COST_CATEGORIES] ?? req.category;
    return new NextResponse(
      approvalHtml({
        title: "Cost approval",
        body: `${req.summary}<br><br><strong>Category:</strong> ${req.category} (${label})<br><strong>Status:</strong> ${req.status}`,
        ok: req.status === "approved",
        categories: req.status === "approved" ? await getKvApprovedCategories() : undefined,
      }),
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  const status = action === "deny" ? "denied" : "approved";
  const result = await resolveRequest(token, status, { via: "email-link" });

  if (!result.ok) {
    const msg =
      result.error === "expired"
        ? "This approval link has expired. A new email will be sent if the barrier is still active."
        : result.error === "already_resolved"
          ? `This request was already ${result.request?.status}.`
          : "Unable to process this approval link.";
    return new NextResponse(
      approvalHtml({ title: "Unable to process", body: msg, ok: false }),
      { status: 400, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  await sendCostApprovalConfirmation(result.request.category, status);

  const categories = status === "approved" ? await getKvApprovedCategories() : undefined;
  const label = COST_CATEGORIES[result.request.category as keyof typeof COST_CATEGORIES];
  return new NextResponse(
    approvalHtml({
      title: status === "approved" ? "Approved" : "Denied",
      body:
        status === "approved"
          ? `You approved <strong>${result.request.category}</strong> (${label}). Seamless operations using this category may now proceed.`
          : `You denied <strong>${result.request.category}</strong>. The spend guardrail stays in place.`,
      ok: status === "approved",
      categories,
    }),
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}