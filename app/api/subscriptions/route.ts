import { NextRequest, NextResponse } from "next/server";
import { plans } from "@/lib/pricing";
import { stripeConfigured } from "@/lib/stripe";
import { getSubscription, recordRevenueDelta, setSubscription } from "@/lib/storage";
import type { PlanId } from "@/lib/types";

export async function GET(request: NextRequest) {
  const user = request.nextUrl.searchParams.get("user");
  if (!user) {
    return NextResponse.json({ error: "Missing user" }, { status: 400 });
  }
  const subscription = await getSubscription(user);
  return NextResponse.json({ subscription, plans });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { userAddress, plan } = body as { userAddress?: string; plan?: PlanId };

  if (!userAddress || !plan) {
    return NextResponse.json({ error: "Missing userAddress or plan" }, { status: 400 });
  }
  if (plan !== "free" && plan !== "pro") {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  if (plan === "pro" && stripeConfigured()) {
    return NextResponse.json(
      { error: "Use Stripe checkout for Pro when Stripe is configured." },
      { status: 400 },
    );
  }

  const prev = await getSubscription(userAddress);
  const subscription = await setSubscription(userAddress, plan);

  if (plan === "pro" && prev.plan !== "pro") {
    await recordRevenueDelta(0, plans.pro.priceUsdMonthly);
  }

  return NextResponse.json({
    subscription,
    message:
      plan === "pro"
        ? "Pro activated (dev checkout — wire Stripe for production billing)."
        : "Downgraded to Free.",
  });
}