import { readDataJson, writeDataJson } from "./data-adapter";

export interface MirrorQueueEntry {
  id: string;
  alphaWallet: string;
  chain: string;
  newTransfers: number;
  timestamp: string;
  status: "queued" | "simulated" | "executed";
}

export async function listQueue(limit = 20): Promise<MirrorQueueEntry[]> {
  const items = await readDataJson<MirrorQueueEntry[]>("mirror-queue.json", []);
  return items.slice(-limit).reverse();
}

export async function enqueueMirror(
  entry: Omit<MirrorQueueEntry, "id">,
): Promise<MirrorQueueEntry> {
  const items = await readDataJson<MirrorQueueEntry[]>("mirror-queue.json", []);
  const row: MirrorQueueEntry = {
    id: `mq-${Date.now().toString(36)}`,
    ...entry,
  };
  items.push(row);
  await writeDataJson("mirror-queue.json", items.slice(-100));
  return row;
}

export async function listPendingQueue(): Promise<MirrorQueueEntry[]> {
  const items = await readDataJson<MirrorQueueEntry[]>("mirror-queue.json", []);
  return items.filter((e) => e.status === "queued");
}

export async function updateQueueStatus(
  id: string,
  status: MirrorQueueEntry["status"],
): Promise<void> {
  const items = await readDataJson<MirrorQueueEntry[]>("mirror-queue.json", []);
  const idx = items.findIndex((e) => e.id === id);
  if (idx < 0) return;
  items[idx] = { ...items[idx], status };
  await writeDataJson("mirror-queue.json", items);
}