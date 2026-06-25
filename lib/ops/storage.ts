import { readDataJson, writeDataJson } from "@/lib/data-adapter";
import type {
  MaintenanceWindow,
  OpsImprovement,
  OpsLoopState,
  OpsNotifyContact,
} from "./types";

const KV_STATE = "ops-loop-state.json";
const KV_MAINTENANCE = "ops-maintenance.json";
const KV_IMPROVEMENTS = "ops-improvements.json";
const KV_NOTIFY = "ops-notify-list.json";

const DEFAULT_STATE: OpsLoopState = {
  version: 1,
  cycle: 0,
  phase: "monitor",
  lastRunAt: null,
  health: null,
  roi: null,
  security: null,
  changelog: [],
};

export async function getOpsState(): Promise<OpsLoopState> {
  return readDataJson<OpsLoopState>(KV_STATE, DEFAULT_STATE);
}

export async function saveOpsState(state: OpsLoopState): Promise<void> {
  await writeDataJson(KV_STATE, state);
}

export async function getMaintenanceWindows(): Promise<MaintenanceWindow[]> {
  return readDataJson<MaintenanceWindow[]>(KV_MAINTENANCE, []);
}

export async function saveMaintenanceWindows(
  windows: MaintenanceWindow[],
): Promise<void> {
  await writeDataJson(KV_MAINTENANCE, windows);
}

export async function getOpsImprovements(): Promise<OpsImprovement[]> {
  return readDataJson<OpsImprovement[]>(KV_IMPROVEMENTS, []);
}

export async function saveOpsImprovements(
  items: OpsImprovement[],
): Promise<void> {
  await writeDataJson(KV_IMPROVEMENTS, items);
}

export async function getOpsNotifyList(): Promise<OpsNotifyContact[]> {
  return readDataJson<OpsNotifyContact[]>(KV_NOTIFY, []);
}

export async function addOpsNotifyContact(
  contact: Omit<OpsNotifyContact, "addedAt">,
): Promise<void> {
  const list = await getOpsNotifyList();
  const email = contact.email.toLowerCase().trim();
  if (!email || list.some((c) => c.email.toLowerCase() === email)) return;
  list.push({ ...contact, email, addedAt: new Date().toISOString() });
  await writeDataJson(KV_NOTIFY, list);
}