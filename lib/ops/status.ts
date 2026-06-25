import {
  activeMaintenance,
  shouldShowBanner,
} from "./maintenance";
import {
  getMaintenanceWindows,
  getOpsState,
} from "./storage";
import type { PublicStatus } from "./types";

export async function getPublicStatus(): Promise<PublicStatus> {
  const [windows, state] = await Promise.all([
    getMaintenanceWindows(),
    getOpsState(),
  ]);

  const maintenance = activeMaintenance(windows);
  const banner = shouldShowBanner(maintenance);
  const health = state.health?.overall ?? "healthy";
  const degraded = health === "degraded";
  const down = health === "down";

  let headline = "All systems operational";
  let operational = true;
  let expectedBackAt: string | null = null;

  if (maintenance && banner) {
    if (maintenance.status === "in_progress") {
      headline = maintenance.title;
      operational = false;
      expectedBackAt = maintenance.expectedEndAt;
    } else if (maintenance.status === "scheduled") {
      headline = `Scheduled maintenance: ${maintenance.title}`;
      operational = true;
      expectedBackAt = maintenance.expectedEndAt;
    }
  } else if (down) {
    headline = "Service disruption — investigating";
    operational = false;
  } else if (degraded) {
    headline = "Partial degradation — monitoring";
    operational = true;
  }

  return {
    operational,
    headline,
    maintenance: banner ? maintenance : null,
    lastCheckedAt: state.lastRunAt,
    expectedBackAt,
  };
}