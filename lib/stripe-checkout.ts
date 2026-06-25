import type Stripe from "stripe";
import {
  BILLING_CHECKOUT_AFTER_MESSAGE,
  BILLING_CHECKOUT_SUBMIT_MESSAGE,
  BILLING_INVOICE_FOOTER,
} from "@/lib/billing";

export function checkoutSessionParams(opts: {
  priceId: string;
  userAddress: string;
  successUrl: string;
  cancelUrl: string;
}): Stripe.Checkout.SessionCreateParams {
  const wallet = opts.userAddress.toLowerCase();

  return {
    mode: "subscription",
    line_items: [{ price: opts.priceId, quantity: 1 }],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    billing_address_collection: "auto",
    custom_text: {
      submit: { message: BILLING_CHECKOUT_SUBMIT_MESSAGE },
      after_submit: { message: BILLING_CHECKOUT_AFTER_MESSAGE },
    },
    metadata: { userAddress: wallet },
    subscription_data: {
      metadata: { userAddress: wallet },
    },
  };
}

export async function applyBillingDefaultsToCustomer(
  stripe: Stripe,
  customerId: string,
): Promise<void> {
  await stripe.customers.update(customerId, {
    invoice_settings: {
      footer: BILLING_INVOICE_FOOTER,
    },
  });
}