export async function kvGet(kv, key, fallback) {
  const row = await kv.get(key, "json");
  return row ?? fallback;
}

export async function kvPut(kv, key, data) {
  await kv.put(key, JSON.stringify(data));
}