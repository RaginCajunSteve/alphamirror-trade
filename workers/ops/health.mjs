const CHECKS = [
  { name: "homepage", path: "/" },
  { name: "leaderboard-api", path: "/api/leaderboard?window=90d" },
  { name: "status-api", path: "/api/status" },
  { name: "pricing", path: "/pricing" },
];

export async function runHealthChecks(baseUrl, timeoutMs = 8_000) {
  const checks = [];
  for (const check of CHECKS) {
    const started = Date.now();
    try {
      const res = await fetch(`${baseUrl}${check.path}`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      const ms = Date.now() - started;
      checks.push({
        name: check.name,
        ok: res.ok,
        ms,
        detail: res.ok ? undefined : `HTTP ${res.status}`,
      });
    } catch (err) {
      checks.push({
        name: check.name,
        ok: false,
        ms: Date.now() - started,
        detail: err instanceof Error ? err.message : "failed",
      });
    }
  }

  const failCount = checks.filter((c) => !c.ok).length;
  let overall = "healthy";
  if (failCount === checks.length) overall = "down";
  else if (failCount > 0) overall = "degraded";

  return { at: new Date().toISOString(), overall, checks };
}