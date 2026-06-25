import Link from "next/link";
import { LiveMirrorGuide } from "@/components/LiveMirrorGuide";
import { SupportChatWidget } from "@/components/SupportChatWidget";
import {
  BILLING_EMAIL,
  HELLO_EMAIL,
  SUPPORT_EMAIL,
  supportFaq,
} from "@/lib/support-faq";

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <div>
        <h1 className="text-3xl font-bold">Support</h1>
        <p className="mt-3 text-lg text-muted">
          Get help with mirroring, billing, and your account. Chat with our AI assistant or
          reach the team by email.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "General", email: HELLO_EMAIL, desc: "Product questions & feedback" },
          { label: "Support", email: SUPPORT_EMAIL, desc: "AI-assisted email replies" },
          { label: "Billing", email: BILLING_EMAIL, desc: "Pro, invoices & receipts" },
        ].map((c) => (
          <a
            key={c.email}
            href={`mailto:${c.email}`}
            className="rounded-xl border border-border bg-surface p-4 hover:border-accent/40 transition-colors"
          >
            <p className="text-xs uppercase tracking-wide text-muted">{c.label}</p>
            <p className="mt-1 font-medium text-accent">{c.email}</p>
            <p className="mt-2 text-sm text-muted">{c.desc}</p>
          </a>
        ))}
      </section>

      <LiveMirrorGuide />

      <section>
        <h2 className="text-xl font-semibold">Live chat</h2>
        <p className="mt-2 text-sm text-muted">
          Powered by Cloudflare Workers AI on the edge. For refunds or account changes, email{" "}
          <a href={`mailto:${BILLING_EMAIL}`} className="text-accent hover:underline">
            {BILLING_EMAIL}
          </a>
          .
        </p>
        <div className="mt-4">
          <SupportChatWidget variant="embedded" />
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Frequently asked questions</h2>
        <dl className="mt-4 space-y-6">
          {supportFaq.map((item) => (
            <div key={item.question}>
              <dt className="font-medium">{item.question}</dt>
              <dd className="mt-1 text-sm text-muted">{item.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="text-sm text-muted">
        See also{" "}
        <Link href="/how-it-works" className="text-accent hover:underline">
          How it works
        </Link>{" "}
        and{" "}
        <Link href="/pricing" className="text-accent hover:underline">
          Pricing
        </Link>
        .
      </p>
    </div>
  );
}