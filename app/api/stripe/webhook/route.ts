import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { applyBillingDefaultsToCustomer } from "@/lib/stripe-checkout";
import {
  proPlanAmountUsd,
  sendInvoiceReceipt,
  sendProWelcomeReceipt,
} from "@/lib/stripe-emails";
import { addOpsNotifyContact } from "@/lib/ops/storage";
import { recordRevenueDelta, setSubscription } from "@/lib/storage";
import { plans } from "@/lib/pricing";

export const runtime = "nodejs";

async function customerEmail(
  stripe: Stripe,
  customerId: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): Promise<string | null> {
  if (!customerId || typeof customerId !== "string") return null;
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) return null;
  return customer.email ?? null;
}

export async function POST(request: Request) {
  try {
    return await handleStripeWebhook(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook handler failed";
    console.error("stripe webhook unhandled:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleStripeWebhook(request: Request) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook not configured" }, { status: 503 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userAddress = session.metadata?.userAddress;
    if (userAddress) {
      try {
        await setSubscription(userAddress, "pro", {
          stripeCustomerId: session.customer?.toString(),
          stripeSubscriptionId: session.subscription?.toString(),
        });
        await recordRevenueDelta(0, plans.pro.priceUsdMonthly);

        const customerId = session.customer?.toString();
        if (customerId) {
          try {
            await applyBillingDefaultsToCustomer(stripe, customerId);
          } catch (err) {
            console.error("stripe billing defaults:", err);
          }
        }

        const to = session.customer_details?.email;
        if (!to && customerId) {
          try {
            const fetched = await customerEmail(stripe, customerId);
            if (fetched) {
              const mailed = await sendProWelcomeReceipt({
                to: fetched,
                walletAddress: userAddress,
                amountUsd: proPlanAmountUsd(),
              });
              if (!mailed.ok) console.error("pro welcome email:", mailed.error);
            }
          } catch (err) {
            console.error("stripe customer email:", err);
          }
        } else if (to) {
          const mailed = await sendProWelcomeReceipt({
            to,
            walletAddress: userAddress,
            amountUsd: proPlanAmountUsd(),
          });
          if (!mailed.ok) console.error("pro welcome email:", mailed.error);
        }

        const notifyEmail =
          session.customer_details?.email ??
          (customerId ? await customerEmail(stripe, customerId) : null);
        if (notifyEmail) {
          await addOpsNotifyContact({
            email: notifyEmail,
            wallet: userAddress,
            source: "stripe",
          });
        }
      } catch (err) {
        console.error("checkout.session.completed:", err);
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "checkout handler failed" },
          { status: 500 },
        );
      }
    }
  }

  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    if (invoice.billing_reason === "subscription_create") {
      return NextResponse.json({ received: true });
    }

    const to = invoice.customer_email ?? (await customerEmail(stripe, invoice.customer));
    if (to && invoice.amount_paid > 0) {
      await sendInvoiceReceipt({
        to,
        amountUsd: invoice.amount_paid / 100,
        invoiceNumber: invoice.number,
        periodLabel: invoice.lines?.data?.[0]?.description ?? null,
      });
    }
  }

  if (
    event.type === "customer.subscription.deleted" ||
    event.type === "customer.subscription.updated"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const userAddress = sub.metadata?.userAddress;
    if (!userAddress) return NextResponse.json({ received: true });

    const active =
      sub.status === "active" ||
      sub.status === "trialing" ||
      sub.status === "past_due";
    if (active) {
      await setSubscription(userAddress, "pro", {
        stripeCustomerId: sub.customer?.toString(),
        stripeSubscriptionId: sub.id,
      });
    } else {
      await setSubscription(userAddress, "free");
    }
  }

  return NextResponse.json({ received: true });
}