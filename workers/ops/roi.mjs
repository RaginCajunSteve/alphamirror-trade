export async function computeRoiSnapshot(kv, kvGet) {
  const [subs, mirrors, executions, revenue] = await Promise.all([
    kvGet(kv, "subscriptions.json", []),
    kvGet(kv, "mirrors.json", []),
    kvGet(kv, "mirror-executions.json", []),
    kvGet(kv, "revenue.json", null),
  ]);

  const proSubscribers = subs.filter((s) => s.plan === "pro").length;
  const activeMirrors = mirrors.filter((m) => m.status === "active").length;
  const executionCount = executions.length;
  const success = executions.filter(
    (e) => e.status === "executed" || e.status === "simulated",
  ).length;
  const executionSuccessRate =
    executionCount > 0 ? success / executionCount : 1;

  const totalFeesUsd = revenue?.totalFeesUsd ?? 0;
  const totalSubscriptionUsd = revenue?.totalSubscriptionUsd ?? proSubscribers * 29;
  const estimatedMrrUsd = proSubscribers * 29;

  const roiScore = Math.round(
    estimatedMrrUsd * 2 +
      totalFeesUsd * 0.5 +
      activeMirrors * 5 +
      executionSuccessRate * 20,
  );

  return {
    at: new Date().toISOString(),
    proSubscribers,
    activeMirrors,
    executionCount,
    totalFeesUsd,
    totalSubscriptionUsd,
    estimatedMrrUsd,
    executionSuccessRate: Math.round(executionSuccessRate * 1000) / 1000,
    roiScore,
  };
}