import { improvementIncreasesSpend } from "./cost-policy.mjs";

const PHASES = [
  "monitor",
  "analyze",
  "prioritize",
  "plan",
  "implement",
  "verify",
  "learn",
];

function scoreItem(impact, effort, reach) {
  return Math.round(((impact * reach) / Math.max(effort, 1)) * 10) / 10;
}

function upsert(items, candidate) {
  const idx = items.findIndex(
    (i) => i.summary === candidate.summary && i.status !== "done",
  );
  if (idx >= 0) {
    items[idx] = { ...items[idx], ...candidate, id: items[idx].id };
    return items;
  }
  items.push({
    ...candidate,
    id: `ops-${Date.now().toString(36)}-${items.length}`,
    status: "new",
    createdAt: new Date().toISOString(),
  });
  return items;
}

export function deriveImprovements({ health, roi, security, feedback }) {
  let items = [];

  if (health?.overall === "down") {
    items = upsert(items, {
      summary: "Restore production availability — health checks failing",
      category: "uptime",
      source: "health",
      impact: 5,
      effort: 3,
      reach: 5,
      score: scoreItem(5, 3, 5),
      evidence: JSON.stringify(health.checks?.filter((c) => !c.ok)),
    });
  } else if (health?.overall === "degraded") {
    items = upsert(items, {
      summary: "Investigate degraded endpoints before scheduling deploys",
      category: "uptime",
      source: "health",
      impact: 4,
      effort: 2,
      reach: 5,
      score: scoreItem(4, 2, 5),
    });
  }

  for (const f of security?.findings ?? []) {
    if (f.level !== "critical" && f.level !== "warn") continue;
    items = upsert(items, {
      summary: `Security: ${f.message}`,
      category: "security",
      source: "security",
      impact: f.level === "critical" ? 5 : 3,
      effort: 2,
      reach: 5,
      score: scoreItem(f.level === "critical" ? 5 : 3, 2, 5),
    });
  }

  if (roi && roi.activeMirrors > 0 && roi.executionSuccessRate < 0.85) {
    items = upsert(items, {
      summary: "Improve mirror execution success rate for ROI",
      category: "roi",
      source: "roi",
      impact: 4,
      effort: 3,
      reach: 4,
      score: scoreItem(4, 3, 4),
      evidence: `successRate=${roi.executionSuccessRate}`,
    });
  }

  if (roi && roi.proSubscribers > 0 && roi.estimatedMrrUsd < roi.proSubscribers * 20) {
    items = upsert(items, {
      summary: "Review subscription revenue capture vs active Pro users",
      category: "roi",
      source: "roi",
      impact: 4,
      effort: 2,
      reach: 3,
      score: scoreItem(4, 2, 3),
    });
  }

  const perfFeedback = (feedback ?? []).filter(
    (f) => f.category === "performance" || f.message?.toLowerCase().includes("slow"),
  );
  if (perfFeedback.length >= 2) {
    items = upsert(items, {
      summary: "Address recurring performance feedback",
      category: "performance",
      source: "feedback",
      impact: 3,
      effort: 3,
      reach: 4,
      score: scoreItem(3, 3, 4),
      evidence: `${perfFeedback.length} reports`,
    });
  }

  return items
    .map((i) => ({
      ...i,
      score: i.score ?? scoreItem(i.impact, i.effort, i.reach),
      increasesSpend: i.increasesSpend ?? improvementIncreasesSpend(i.summary),
    }))
    .sort((a, b) => b.score - a.score);
}

export function advancePhase(state) {
  const idx = PHASES.indexOf(state.phase);
  if (idx < 0 || idx >= PHASES.length - 1) {
    return { ...state, phase: "monitor", cycle: (state.cycle ?? 0) + 1 };
  }
  return { ...state, phase: PHASES[idx + 1] };
}

export function autoApproveTop(items, limit = 3, _env) {
  let approved = 0;
  return items.map((item) => {
    if (item.status !== "new" || approved >= limit) return item;
    if (item.increasesSpend || improvementIncreasesSpend(item.summary)) {
      return { ...item, increasesSpend: true };
    }
    approved++;
    return { ...item, status: "approved" };
  });
}