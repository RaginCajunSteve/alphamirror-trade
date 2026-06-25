import { NextRequest, NextResponse } from "next/server";
import {
  sendMaintenanceNotice,
  sendMaintenanceRestored,
  sendMaintenanceUpdate,
} from "@/lib/ops/emails";
import {
  newMaintenanceId,
  validateScheduleStart,
} from "@/lib/ops/maintenance";
import {
  addOpsNotifyContact,
  getMaintenanceWindows,
  getOpsNotifyList,
  saveMaintenanceWindows,
} from "@/lib/ops/storage";
import type { MaintenanceWindow } from "@/lib/ops/types";

function authorized(request: NextRequest): boolean {
  const secret = process.env.OPS_ADMIN_SECRET;
  if (!secret) return false;
  return request.headers.get("x-ops-secret") === secret;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const windows = await getMaintenanceWindows();
  return NextResponse.json({ windows });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { title, startAt, expectedEndAt, notify = true } = body ?? {};

  if (!title || !startAt || !expectedEndAt) {
    return NextResponse.json(
      { error: "Missing title, startAt, or expectedEndAt" },
      { status: 400 },
    );
  }

  const err = validateScheduleStart(startAt);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  if (Date.parse(expectedEndAt) <= Date.parse(startAt)) {
    return NextResponse.json(
      { error: "expectedEndAt must be after startAt" },
      { status: 400 },
    );
  }

  const window: MaintenanceWindow = {
    id: newMaintenanceId(),
    title: String(title).slice(0, 120),
    startAt,
    expectedEndAt,
    status: "scheduled",
    createdAt: new Date().toISOString(),
    updates: [],
  };

  const windows = await getMaintenanceWindows();
  windows.push(window);
  await saveMaintenanceWindows(windows);

  if (notify) {
    const contacts = await getOpsNotifyList();
    for (const c of contacts) {
      await sendMaintenanceNotice(c.email, window);
    }
    window.noticeSentAt = new Date().toISOString();
    await saveMaintenanceWindows(
      windows.map((w) => (w.id === window.id ? window : w)),
    );
  }

  return NextResponse.json({ ok: true, window });
}

export async function PATCH(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, message, expectedEndAt, status, notify = true } = body ?? {};
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const windows = await getMaintenanceWindows();
  const idx = windows.findIndex((w) => w.id === id);
  if (idx < 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const w = { ...windows[idx] };
  if (message) {
    w.updates = [
      ...w.updates,
      {
        at: new Date().toISOString(),
        message: String(message).slice(0, 280),
        expectedBackAt: expectedEndAt ?? w.expectedEndAt,
      },
    ];
  }
  if (expectedEndAt) w.expectedEndAt = expectedEndAt;
  if (status) w.status = status;
  if (status === "completed") w.completedAt = new Date().toISOString();

  windows[idx] = w;
  await saveMaintenanceWindows(windows);

  if (notify && message) {
    const contacts = await getOpsNotifyList();
    for (const c of contacts) {
      if (status === "completed") {
        await sendMaintenanceRestored(c.email, w);
      } else {
        await sendMaintenanceUpdate(c.email, w, String(message));
      }
    }
  }

  return NextResponse.json({ ok: true, window: w });
}

/** Register an email for maintenance notifications (admin). */
export async function PUT(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  const { email, wallet } = body ?? {};
  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }
  await addOpsNotifyContact({ email, wallet, source: "manual" });
  return NextResponse.json({ ok: true });
}