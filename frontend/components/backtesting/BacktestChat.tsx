"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { ToolbarTooltip } from "@/components/chart/ToolbarButton";
import { api, BacktestChatEvent, BacktestConfig } from "@/lib/api";

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce-dot"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}

type ChatItem = { id: number; role: "user" | "assistant"; text: string; done: boolean };

interface BacktestChatProps {
  config: BacktestConfig;
  onConfigChange: (config: BacktestConfig) => void;
}

export default function BacktestChat({ config, onConfigChange }: BacktestChatProps) {
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendHover, setSendHover] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sendButtonRef = useRef<HTMLButtonElement>(null);
  const nextId = useRef(0);
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const message = input.trim();
    if (!message || streaming) return;
    setInput("");
    setError(null);
    setMessages((prev) => [
      ...prev,
      { id: nextId.current++, role: "user", text: message, done: true },
      { id: nextId.current++, role: "assistant", text: "", done: false },
    ]);
    setStreaming(true);

    const url = await api.backtestChatStreamUrl(configRef.current, message);
    const ws = new WebSocket(url);
    ws.onmessage = (ev) => {
      const msg: BacktestChatEvent = JSON.parse(ev.data);
      if (msg.type === "token") {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, text: last.text + msg.text };
          return next;
        });
      } else if (msg.type === "config") {
        onConfigChange(msg.config);
      } else if (msg.type === "done") {
        setStreaming(false);
        setMessages((prev) =>
          prev.map((m, i) => (i === prev.length - 1 ? { ...m, done: true } : m)),
        );
      } else if (msg.type === "error") {
        setError(msg.detail);
        setStreaming(false);
      }
    };
    ws.onerror = () => setError("Connection lost.");
    ws.onclose = () => setStreaming(false);
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-auto p-3">
        {error && (
          <div className="rounded-md border border-down/40 bg-down/10 px-3 py-2 text-xs text-down">{error}</div>
        )}
        {messages.length === 0 && (
          <div className="text-xs text-muted">
            Describe what you want the strategy to do, e.g. &ldquo;buy when RSI drops below 30, sell when it crosses back above 70&rdquo;.
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={m.id}
            className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-xs ${
              m.role === "user"
                ? "ml-auto rounded-tr-sm bg-accent/20 text-fg"
                : "rounded-tl-sm bg-border/60 text-fg"
            }`}
          >
            {m.text || (i === messages.length - 1 && streaming ? <TypingIndicator /> : null)}
          </div>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-border p-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Describe your strategy…"
          className="flex-1 rounded-md border border-border bg-field px-2 py-1.5 text-xs text-fg outline-none focus:border-violet-400"
        />
        <div
          className="relative flex items-center"
          onMouseEnter={() => setSendHover(true)}
          onMouseLeave={() => setSendHover(false)}
        >
          <button
            ref={sendButtonRef}
            onClick={send}
            disabled={streaming}
            aria-label="Send"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-on-accent transition-colors hover:bg-accent/80 disabled:opacity-50"
          >
            <ArrowUp size={14} strokeWidth={2.5} />
          </button>
          <ToolbarTooltip label="Send" hover={sendHover} placement="top" anchorRef={sendButtonRef} />
        </div>
      </div>
    </div>
  );
}
