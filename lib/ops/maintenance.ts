import type { MaintenanceWindow, MaintenanceStatus } from "./types";

export const MIN_NOTICE_MS = 24 * 60 * 60 * 1000;
export const NOTICE_LEAD_MS = MIN_NOTICE_MS;

export function newMaintenanceId(): string {
  return `mnt-${Date.now().toString(36)}`;
}

export function validateScheduleStart(startAt: string, now = Date.now()): string | null {
  const start = Date.parse(startAt);
  if (Number.isNaN(start)) return "Invalid start time";
  if (start < now + MIN_NOTICE_MS) {
    return "Maintenance must be scheduled at least 24 hours in advance";
  }
  return null;
}

export function activeMaintenance(
  windows: MaintenanceWindow[],
  now = Date.now(),
): MaintenanceWindow | null {
  const ts = now;
  const current = windows.find((w) => {
    if (w.status === "cancelled" || w.status === "completed") return false;
    if (w.status === "in_progress") return true;
    if (w.status === "scheduled") {
      const start = Date.parse(w.startAt);
      const end = Date.parse(w.expectedEndAt);
      return ts >= start - NOTICE_LEAD_MS && ts <= end + 60 * 60 * 1000;
    }
    return false;
  });
  return current ?? null;
}

export function shouldShowBanner(
  window: MaintenanceWindow | null,
  now = Date.now(),
): boolean {
  if (!window || window.status === "cancelled" || window.status === "completed") {
    return false;
  }
  if (window.status === "in_progress") return true;
  if (window.status === "scheduled") {
    return now >= Date.parse(window.startAt) - NOTICE_LEAD_MS;
  }
  return false;
}

export function advanceMaintenanceState(
  windows: MaintenanceWindow[],
  now = Date.now(),
): { windows: MaintenanceWindow[]; events: string[] } {
  const events: string[] = [];
  const next = windows.map((w) => {
    if (w.status === "cancelled" || w.status === "completed") return w;

    const start = Date.parse(w.startAt);
    const end = Date.parse(w.expectedEndAt);

    if (w.status === "scheduled" && now >= start && now < end) {
      events.push(`started:${w.id}`);
      return {
        ...w,
        status: "in_progress" as MaintenanceStatus,
        startedAt: new Date(now).toISOString(),
        updates: [
          ...w.updates,
          {
            at: new Date(now).toISOString(),
            message: "Maintenance in progress.",
            expectedBackAt: w.expectedEndAt,
          },
        ],
      };
    }

    if (
      (w.status === "in_progress" || w.status === "scheduled") &&
      now >= end
    ) {
      events.push(`completed:${w.id}`);
      return {
        ...w,
        status: "completed" as MaintenanceStatus,
        completedAt: new Date(now).toISOString(),
        updates: [
          ...w.updates,
          {
            at: new Date(now).toISOString(),
            message: "Maintenance complete. Service restored.",
          },
        ],
      };
    }

    return w;
  });

  return { windows: next, events };
}

export function formatMaintenanceRange(w: MaintenanceWindow): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  return `${fmt(w.startAt)} – ${fmt(w.expectedEndAt)}`;
}