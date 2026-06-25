import { NextRequest, NextResponse } from "next/server";
import {
  deleteMirrors,
  listMirrors,
  updateMirrorsStatus,
  upsertMirror,
} from "@/lib/storage";
import { defaultLiveMirrorChainKeys } from "@/lib/execution-config";
import type { Chain, MirrorConfig, MirrorStatus } from "@/lib/types";

export async function GET(request: NextRequest) {
  const user = request.nextUrl.searchParams.get("user") ?? undefined;
  const mirrors = await listMirrors(user);
  return NextResponse.json({ mirrors });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    userAddress,
    alphaWallet,
    mode = "paper",
    perTradeCapUsd = 500,
    dailyCapUsd = 2000,
    userRatioPct = 10,
    allowedChains = defaultLiveMirrorChainKeys(),
  } = body;

  if (!userAddress || !alphaWallet) {
    return NextResponse.json({ error: "Missing userAddress or alphaWallet" }, { status: 400 });
  }

  const mirror: MirrorConfig = {
    id: `mirror-${Date.now().toString(36)}`,
    userAddress,
    alphaWallet,
    status: "active",
    mode,
    perTradeCapUsd,
    dailyCapUsd,
    userRatioPct,
    allowedChains: allowedChains as Chain[],
    denylistTokens: [],
    createdAt: new Date().toISOString(),
  };

  const saved = await upsertMirror(mirror);
  return NextResponse.json({ mirror: saved });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();

  if (Array.isArray(body.ids) && body.userAddress && body.status) {
    const status = body.status as MirrorStatus;
    if (status !== "active" && status !== "paused") {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    const result = await updateMirrorsStatus(
      body.ids,
      String(body.userAddress),
      status,
    );
    if (result.updated.length === 0) {
      const httpStatus = result.forbidden.length > 0 ? 403 : 404;
      return NextResponse.json(
        { error: "No mirrors updated", ...result },
        { status: httpStatus },
      );
    }
    return NextResponse.json({ ok: true, ...result });
  }

  if (!body.id) {
    return NextResponse.json({ error: "Missing mirror id" }, { status: 400 });
  }

  const mirrors = await listMirrors();
  const existing = mirrors.find((m) => m.id === body.id);
  if (!existing) {
    return NextResponse.json({ error: "Mirror not found" }, { status: 404 });
  }

  if (
    body.userAddress &&
    existing.userAddress.toLowerCase() !== String(body.userAddress).toLowerCase()
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated: MirrorConfig = { ...existing, ...body };
  const saved = await upsertMirror(updated);
  return NextResponse.json({ mirror: saved });
}

export async function DELETE(request: NextRequest) {
  let userAddress = request.nextUrl.searchParams.get("user") ?? undefined;
  let ids: string[] = [];

  const idsParam = request.nextUrl.searchParams.get("ids");
  const idParam = request.nextUrl.searchParams.get("id");
  if (idsParam) {
    ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
  } else if (idParam) {
    ids = [idParam];
  } else {
    try {
      const body = await request.json();
      if (Array.isArray(body.ids)) ids = body.ids.filter(Boolean);
      userAddress = userAddress ?? body.userAddress;
    } catch {
      // no JSON body
    }
  }

  if (!ids.length || !userAddress) {
    return NextResponse.json(
      { error: "Missing ids (or id) and user" },
      { status: 400 },
    );
  }

  const result = await deleteMirrors(ids, userAddress);
  if (result.removed.length === 0) {
    const status = result.forbidden.length > 0 ? 403 : 404;
    return NextResponse.json({ error: "No mirrors removed", ...result }, { status });
  }

  return NextResponse.json({ ok: true, ...result });
}