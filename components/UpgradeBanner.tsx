"use client";

import Link from "next/link";
import type { PlanId } from "@/lib/types";

export function UpgradeBanner({ plan }: { plan: PlanId }) {
  if (plan === "pro") {
    return (
      <div className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm">
        <span className="font-medium text-accent">Pro active</span>
        <span className="text-muted"> — live mirrors enabled · 0.5% fee per trade</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="font-medium">Upgrade to Pro for live mirroring</p>
        <p className="text-sm text-muted">$29/mo + 0.5% per mirrored trade · paper mode stays free</p>
      </div>
      <Link
        href="/pricing"
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90"
      >
        View plans
      </Link>
    </div>
  );
}