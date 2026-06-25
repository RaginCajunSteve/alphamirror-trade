import Link from "next/link";
import { getPublicStatus } from "@/lib/ops/status";

export async function MaintenanceBanner() {
  const status = await getPublicStatus();
  if (!status.maintenance) return null;

  const m = status.maintenance;
  const inProgress = m.status === "in_progress";
  const back = status.expectedBackAt
    ? new Date(status.expectedBackAt).toLocaleString("en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : null;

  return (
    <div
      className={`border-b px-4 py-2 text-center text-sm ${
        inProgress
          ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
          : "border-blue-500/30 bg-blue-500/10 text-blue-100"
      }`}
      role="status"
    >
      <span className="font-medium">{status.headline}</span>
      {back && (
        <span className="text-muted">
          {" "}
          · Expected back: {back}
        </span>
      )}
      {" · "}
      <Link href="/status" className="underline hover:no-underline">
        Status
      </Link>
    </div>
  );
}