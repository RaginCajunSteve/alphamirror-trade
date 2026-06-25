"use client";

import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { Component, type ReactNode, Suspense, useEffect, useRef, useState } from "react";

const BAKED_AGENT_HOST = process.env.NEXT_PUBLIC_SUPPORT_AGENT_URL;

function ChatPanelConnected({
  onClose,
  agentHost,
}: {
  onClose: () => void;
  agentHost: string;
}) {
  const [sessionId] = useState(() => crypto.randomUUID());
  const bottomRef = useRef<HTMLDivElement>(null);

  const agent = useAgent({
    agent: "SupportAgent",
    host: agentHost,
    name: sessionId,
  });

  const { messages, sendMessage, status } = useAgentChat({
    agent,
    // Fresh session per mount — skip HTTP resume fetch that suspends without a boundary.
    getInitialMessages: null,
    resume: false,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex h-[min(28rem,70vh)] flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="font-semibold">Alpha Mirror Support</h3>
          <p className="text-xs text-muted">AI assistant · billing → billing@alphamirror.trade</p>
        </div>
        <button onClick={onClose} className="text-muted hover:text-foreground text-sm">
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-muted">
            Ask about mirroring, pricing, Pro subscriptions, or how Alpha Mirror works.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`text-sm rounded-lg px-3 py-2 max-w-[90%] ${
              m.role === "user"
                ? "ml-auto bg-accent/20 text-foreground"
                : "bg-surface border border-border text-muted"
            }`}
          >
            {m.parts?.map((part, i) =>
              part.type === "text" ? <span key={i}>{part.text}</span> : null,
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form
        className="border-t border-border p-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const input = (e.currentTarget.elements.namedItem("chat") as HTMLInputElement)
            .value;
          if (!input.trim() || status !== "ready") return;
          sendMessage({ text: input.trim() });
          (e.currentTarget.elements.namedItem("chat") as HTMLInputElement).value = "";
        }}
      >
        <input
          name="chat"
          placeholder="Type your question..."
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          disabled={status !== "ready"}
        />
        <button
          type="submit"
          disabled={status !== "ready"}
          className="rounded-lg bg-accent px-4 py-2 text-sm text-accent-foreground disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}

class ChatErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-5 text-sm text-muted">
          Support chat failed to load. Email{" "}
          <a href="mailto:support@alphamirror.trade" className="text-accent">
            support@alphamirror.trade
          </a>
          .
        </div>
      );
    }
    return this.props.children;
  }
}

function ChatPanel({ onClose }: { onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [agentHost, setAgentHost] = useState<string | null>(BAKED_AGENT_HOST ?? null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || agentHost) return;
    fetch("/api/support-config")
      .then((r) => r.json())
      .then((d: { agentUrl?: string | null }) => {
        if (d.agentUrl) setAgentHost(d.agentUrl);
        else setLoadError(true);
      })
      .catch(() => setLoadError(true));
  }, [mounted, agentHost]);

  if (!mounted) {
    return (
      <div className="flex h-[min(28rem,70vh)] items-center justify-center p-6 text-sm text-muted">
        Loading support chat…
      </div>
    );
  }

  if (!agentHost) {
    return (
      <div className="p-5 text-sm text-muted">
        {loadError ? (
          <>
            Support chat is temporarily unavailable. Email{" "}
            <a href="mailto:support@alphamirror.trade" className="text-accent">
              support@alphamirror.trade
            </a>
            .
          </>
        ) : (
          "Loading support chat…"
        )}
      </div>
    );
  }

  return (
    <ChatErrorBoundary>
      <Suspense
        fallback={
          <div className="flex h-[min(28rem,70vh)] items-center justify-center p-6 text-sm text-muted">
            Connecting to support chat…
          </div>
        }
      >
        <ChatPanelConnected onClose={onClose} agentHost={agentHost} />
      </Suspense>
    </ChatErrorBoundary>
  );
}

type Props = {
  variant?: "floating" | "embedded";
};

export function SupportChatWidget({ variant = "floating" }: Props) {
  const [open, setOpen] = useState(false);

  if (variant === "embedded") {
    return (
      <div className="rounded-2xl border border-border bg-background overflow-hidden shadow-lg">
        <ChatPanel onClose={() => {}} />
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 left-5 z-50 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium shadow-lg hover:border-accent/50 transition-colors"
      >
        Help
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
            <ChatPanel onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}