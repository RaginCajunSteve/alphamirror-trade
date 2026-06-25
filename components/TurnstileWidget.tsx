"use client";

import Script from "next/script";
import { useEffect, useId, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
      execute: (container: string | HTMLElement) => void;
      getResponse: (widgetId: string) => string | undefined;
    };
  }
}

type Status = "loading" | "ready" | "verified" | "expired" | "error";

type Props = {
  onToken: (token: string | null) => void;
  action?: string;
  className?: string;
};

export function TurnstileWidget({ onToken, action = "submit", className }: Props) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const containerId = useId().replace(/:/g, "");
  const widgetIdRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    if (!scriptReady || !siteKey || !window.turnstile) return;

    const container = document.getElementById(containerId);
    if (!container) return;

    if (widgetIdRef.current) {
      window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    }

    widgetIdRef.current = window.turnstile.render(`#${containerId}`, {
      sitekey: siteKey,
      action,
      theme: "dark",
      size: "normal",
      appearance: "always",
      callback: (token: string) => {
        setStatus("verified");
        onToken(token);
      },
      "expired-callback": () => {
        setStatus("expired");
        onToken(null);
      },
      "error-callback": () => {
        setStatus("error");
        onToken(null);
      },
    });
    setStatus("ready");

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [scriptReady, siteKey, action, containerId, onToken]);

  if (!siteKey) return null;

  const statusText =
    status === "loading"
      ? "Loading security check…"
      : status === "ready"
        ? "Complete the security check below"
        : status === "verified"
          ? "Security check passed"
          : status === "expired"
            ? "Security check expired — refresh the page"
            : "Security check failed — refresh and try again";

  const statusClass =
    status === "verified"
      ? "text-accent"
      : status === "error" || status === "expired"
        ? "text-red-400"
        : "text-muted";

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
      />
      <div className={className}>
        <p className={`text-xs ${statusClass}`}>{statusText}</p>
        <div id={containerId} className="mt-2 min-h-[65px]" />
      </div>
    </>
  );
}