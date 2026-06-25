import Link from "next/link";
import { getMaintenanceWindows, getOpsState } from "@/lib/ops/storage";
import { getPublicStatus } from "@/lib/ops/status";
import { formatMaintenanceRange } from "@/lib/ops/maintenance";

export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const [status, windows, state] = await Promise.all([
    getPublicStatus(),
    getMaintenanceWindows(),
    getOpsState(),
  ]);

  const upcoming = windows.filter((w) => w.status === "scheduled");
  const recent = windows
    .filter((w) => w.status === "completed")
    .slice(-3)
    .reverse();

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold">System status</h1>
        <p className="mt-2 text-muted">Short updates only. Details on request via support.</p>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-center gap-3">
          <span
            className={`h-3 w-3 rounded-full ${
              status.operational ? "bg-emerald-500" : "bg-amber-500"
            }`}
          />
          <p className="text-lg font-medium">{status.headline}</p>
        </div>
        {status.expectedBackAt && (
          <p className="mt-3 text-sm text-muted">
            Expected back online:{" "}
            <time dateTime={status.expectedBackAt}>
              {new Date(status.expectedBackAt).toUTCString()}
            </time>
          </p>
        )}
        {status.lastCheckedAt && (
          <p className="mt-2 text-xs text-muted">
            Last checked: {new Date(status.lastCheckedAt).toUTCString()}
          </p>
        )}
      </section>

      {status.maintenance?.updates?.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Updates</h2>
          <ul className="space-y-2 text-sm">
            {[...status.maintenance.updates].reverse().map((u, i) => (
              <li key={i} className="rounded-lg border border-border bg-surface/60 px-4 py-3">
                <time className="text-xs text-muted">{new Date(u.at).toUTCString()}</time>
                <p className="mt-1">{u.message}</p>
                {u.expectedBackAt && (
                  <p className="mt-1 text-xs text-muted">
                    ETA: {new Date(u.expectedBackAt).toUTCString()}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {upcoming.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Scheduled maintenance</h2>
          <ul className="space-y-2 text-sm">
            {upcoming.map((w) => (
              <li key={w.id} className="rounded-lg border border-border px-4 py-3">
                <p className="font-medium">{w.title}</p>
                <p className="text-muted">{formatMaintenanceRange(w)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recent.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Recently completed</h2>
          <ul className="space-y-2 text-sm text-muted">
            {recent.map((w) => (
              <li key={w.id}>
                {w.title} — {w.completedAt ? new Date(w.completedAt).toUTCString() : "done"}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-sm text-muted">
        Questions?{" "}
        <Link href="/support" className="text-accent hover:underline">
          Support
        </Link>{" "}
        or billing@alphamirror.trade
      </p>

      {state.health && (
        <p className="text-xs text-muted">
          Ops cycle {state.cycle} · phase {state.phase} · health {state.health.overall}
        </p>
      )}
    </div>
  );
}