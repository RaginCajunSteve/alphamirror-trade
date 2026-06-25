import { NextRequest, NextResponse } from "next/server";
import { appBaseUrl, getStripe } from "@/lib/stripe";
import { checkoutSessionParams } from "@/lib/stripe-checkout";
import { verifyTurnstileToken } from "@/lib/turnstile";

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const priceId = process.env.STRIPE_PRO_PRICE_ID;

  if (!stripe || !priceId) {
    return NextResponse.json(
      { error: "Stripe not configured. Set STRIPE_SECRET_KEY and STRIPE_PRO_PRICE_ID." },
      { status: 503 },
    );
  }

  const body = await request.json();
  const { userAddress, turnstileToken } = body as {
    userAddress?: string;
    turnstileToken?: string;
  };
  if (!userAddress) {
    return NextResponse.json({ error: "Missing userAddress" }, { status: 400 });
  }

  const turnstile = await verifyTurnstileToken(
    turnstileToken,
    process.env.TURNSTILE_SECRET_KEY,
    request.headers.get("cf-connecting-ip") ?? undefined,
  );
  if (!turnstile.ok) {
    return NextResponse.json({ error: turnstile.error ?? "Verification failed" }, { status: 403 });
  }

  const base = appBaseUrl();
  try {
    const session = await stripe.checkout.sessions.create(
      checkoutSessionParams({
        priceId,
        userAddress,
        successUrl: `${base}/pricing?checkout=success`,
        cancelUrl: `${base}/pricing?checkout=cancel`,
      }),
    );
    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Checkout failed";
    console.error("stripe checkout:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}