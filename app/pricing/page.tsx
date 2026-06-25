"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import { BILLING_EMAIL } from "@/lib/billing";
import { plans } from "@/lib/pricing";
import type { PlanId, Subscription } from "@/lib/types";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { liveExecutionNetworksLabel } from "@/lib/network-config";
import { TurnstileWidget } from "@/components/TurnstileWidget";

const turnstileEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

function PricingContent() {
  const { address, isConnected } = useAccount();
  const searchParams = useSearchParams();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const onTurnstileToken = useCallback((token: string | null) => setTurnstileToken(token), []);

  useEffect(() => {
    if (!address) return;
    fetch(`/api/subscriptions?user=${address}`)
      .then((r) => r.json())
      .then((d) => setSubscription(d.subscription));
  }, [address]);

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (checkout === "success") {
      setMessage(
        `Payment received — Pro activates after Stripe webhook (usually under 1 minute). Receipts & billing: ${BILLING_EMAIL}`,
      );
      setStatus("done");
    }
    if (checkout === "cancel") {
      setMessage("Checkout cancelled.");
      setStatus("error");
    }
  }, [searchParams]);

  async function checkout(plan: PlanId) {
    if (!address) return;
    setStatus("loading");
    setMessage(null);

    try {
      if (plan === "pro") {
        if (turnstileEnabled && !turnstileToken) {
          throw new Error("Complete the security check before checkout.");
        }
        const stripeRes = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userAddress: address, turnstileToken }),
        });
        const stripeData = await stripeRes.json();
        if (stripeRes.ok && stripeData.url) {
          window.location.href = stripeData.url;
          return;
        }
        if (stripeRes.status !== 503) {
          throw new Error(stripeData.error ?? "Stripe checkout failed");
        }
      }

      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAddress: address, plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      setSubscription(data.subscription);
      setStatus("done");
      setMessage(
        data.message ??
          (plan === "pro" ? "Pro activated (dev mode)." : "Downgraded to Free."),
      );
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Checkout failed");
    }
  }

  return (
    <div className="space-y-10">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Pricing</h1>
        <p className="mt-3 text-muted max-w-xl mx-auto">
          Paper mirroring is free forever. Pro unlocks live execution on{" "}
          {liveExecutionNetworksLabel()} — $29/mo via Stripe plus 0.5% platform fee per mirrored
          trade.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 max-w-3xl mx-auto">
        {(["free", "pro"] as PlanId[]).map((id) => {
          const plan = plans[id];
          const active = subscription?.plan === id;
          return (
            <div
              key={id}
              className={`rounded-2xl border p-6 ${
                id === "pro" ? "border-accent/40 bg-accent/5" : "border-border bg-surface"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <h2 className="text-xl font-semibold">{plan.name}</h2>
                <p className="text-2xl font-bold">
                  {plan.priceUsdMonthly === 0 ? "Free" : `$${plan.priceUsdMonthly}/mo`}
                </p>
              </div>
              <ul className="mt-4 space-y-2 text-sm text-muted">
                {plan.features.map((f) => (
                  <li key={f}>· {f}</li>
                ))}
              </ul>
              {id === "pro" && isConnected && turnstileEnabled && !active && (
                <TurnstileWidget onToken={onTurnstileToken} action="checkout" className="mt-4" />
              )}
              {isConnected ? (
                <button
                  onClick={() => checkout(id)}
                  disabled={
                    status === "loading" ||
                    active ||
                    (id === "pro" && turnstileEnabled && !turnstileToken)
                  }
                  className="mt-6 w-full rounded-xl border border-border py-2.5 text-sm font-medium disabled:opacity-50 hover:border-accent/50"
                >
                  {active
                    ? "Current plan"
                    : id === "pro"
                      ? status === "loading"
                        ? "Redirecting to Stripe…"
                        : turnstileEnabled && !turnstileToken
                          ? "Complete security check above"
                          : "Subscribe with Stripe"
                      : "Switch to Free"}
                </button>
              ) : (
                <p className="mt-6 text-center text-sm text-muted">Connect wallet to subscribe</p>
              )}
            </div>
          );
        })}
      </div>

      {message && (
        <p className={`text-center text-sm ${status === "error" ? "text-red-400" : "text-accent"}`}>
          {message}
        </p>
      )}

      <p className="text-center text-sm text-muted">
        Billing, receipts &amp; invoices:{" "}
        <a href={`mailto:${BILLING_EMAIL}`} className="text-accent hover:underline">
          {BILLING_EMAIL}
        </a>
      </p>

      <DisclaimerBanner compact />
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={<p className="text-center text-muted">Loading pricing...</p>}>
      <PricingContent />
    </Suspense>
  );
}