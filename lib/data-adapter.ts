import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

export async function readDataJson<T>(filename: string, fallback: T): Promise<T> {
  const kv = await getKv();
  if (kv) {
    const row = await kv.get(filename, "json");
    return (row as T) ?? fallback;
  }

  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, filename), "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeDataJson<T>(filename: string, data: T): Promise<void> {
  const kv = await getKv();
  if (kv) {
    await kv.put(filename, JSON.stringify(data));
    return;
  }

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(
    path.join(DATA_DIR, filename),
    JSON.stringify(data, null, 2),
    "utf-8",
  );
}

type KvBinding = {
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string): Promise<void>;
};

async function getKv(): Promise<KvBinding | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    return (env as { DATA_KV?: KvBinding }).DATA_KV ?? null;
  } catch {
    return null;
  }
}