"use client";

import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { TurnstileWidget } from "./TurnstileWidget";

const categories = [
  { value: "ux", label: "UX / confusing" },
  { value: "bug", label: "Bug" },
  { value: "ranking", label: "Rankings feel wrong" },
  { value: "mirror", label: "Mirror / copy issue" },
  { value: "feature", label: "Feature request" },
  { value: "other", label: "Other" },
];

const turnstileEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

export function FeedbackWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("ux");
  const [message, setMessage] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [feedbackId, setFeedbackId] = useState<string | null>(null);

  const onTurnstileToken = useCallback((token: string | null) => {
    setTurnstileToken(token);
  }, []);

  async function submit() {
    if (!message.trim()) return;
    if (turnstileEnabled && !turnstileToken) return;
    setStatus("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page: pathname,
          category,
          message,
          turnstileToken,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setFeedbackId(data.id);
      setStatus("sent");
      setMessage("");
      setTurnstileToken(null);
    } catch {
      setStatus("error");
    }
  }

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          setStatus("idle");
          setFeedbackId(null);
          setTurnstileToken(null);
        }}
        className="fixed bottom-5 right-5 z-50 rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground shadow-lg shadow-accent/20 hover:bg-accent/90 transition-colors"
      >
        Feedback
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl">
            {status === "sent" ? (
              <div className="space-y-3 text-center">
                <p className="text-lg font-medium text-accent">Thanks for the feedback</p>
                {feedbackId && (
                  <p className="text-xs font-mono text-muted">ID: {feedbackId}</p>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-lg bg-accent px-4 py-2 text-sm text-accent-foreground"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-semibold">Help us improve</h3>
                <p className="mt-1 text-sm text-muted">Page: {pathname}</p>

                <label className="mt-4 block text-sm">
                  Category
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                  >
                    {categories.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="mt-3 block text-sm">
                  Message
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                    placeholder="What's confusing or broken?"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 resize-none"
                  />
                </label>

                <TurnstileWidget onToken={onTurnstileToken} action="feedback" />

                {status === "error" && (
                  <p className="mt-2 text-sm text-red-400">Failed to send. Try again.</p>
                )}

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    onClick={() => setOpen(false)}
                    className="rounded-lg border border-border px-4 py-2 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submit}
                    disabled={
                      status === "sending" ||
                      !message.trim() ||
                      (turnstileEnabled && !turnstileToken)
                    }
                    className="rounded-lg bg-accent px-4 py-2 text-sm text-accent-foreground disabled:opacity-50"
                  >
                    {status === "sending" ? "Sending..." : "Submit"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}