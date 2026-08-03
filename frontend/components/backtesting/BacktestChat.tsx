"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, ListChecks } from "lucide-react";
import { ToolbarTooltip } from "@/components/chart/ToolbarButton";
import { api, BacktestChatEvent, BacktestConfig } from "@/lib/api";
import HintLibrary from "@/components/backtesting/HintLibrary";

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

const PLACEHOLDER_PROMPTS = [
  "Describe your strategy",
  "Pick a rule from the library",
  "e.g. buy when RSI drops below 30, sell when it crosses back above 70",
];

function comparatorLabel(c: string) {
  switch (c) {
    case "crosses_above": return "crosses above";
    case "crosses_below": return "crosses below";
    default: return c;
  }
}

function ConfigSummaryCard({ config }: { config: BacktestConfig }) {
  const rows: { label: string; value: string }[] = [];
  if (config.stop_loss) rows.push({ label: "Stop loss", value: `${config.stop_loss.value}%` });
  if (config.take_profit) rows.push({ label: "Take profit", value: `${config.take_profit.value}%` });
  rows.push({
    label: "Position sizing",
    value:
      config.position_sizing.mode === "fixed_qty"
        ? `${config.position_sizing.value} share(s) fixed`
        : config.position_sizing.mode === "pct_equity"
        ? `${config.position_sizing.value}% of equity`
        : `${config.position_sizing.value}% risk`,
  });

  return (
    <div className="max-w-[92%] rounded-2xl rounded-tl-sm border border-violet-400/30 bg-violet-500/5 px-3 py-2.5 text-xs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-semibold text-fg">{config.name || "Untitled strategy"}</span>
        <span className="shrink-0 rounded-full bg-border/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
          {config.direction}
        </span>
      </div>

      {config.entry_rules.length > 0 && (
        <div className="mb-1.5">
          <div className="mb-1 text-[10px] font-semibold tracking-wide text-up">Entry</div>
          <div className="space-y-1">
            {config.entry_rules.map((r, i) => (
              <div key={i} className="rounded-md bg-panel/60 px-2 py-1 font-mono text-[11px] text-fg">
                {r.indicator} {comparatorLabel(r.comparator)} {r.value}
              </div>
            ))}
          </div>
        </div>
      )}

      {config.exit_rules.length > 0 && (
        <div className="mb-1.5">
          <div className="mb-1 text-[10px] font-semibold tracking-wide text-down">Exit</div>
          <div className="space-y-1">
            {config.exit_rules.map((r, i) => (
              <div key={i} className="rounded-md bg-panel/60 px-2 py-1 font-mono text-[11px] text-fg">
                {r.indicator} {comparatorLabel(r.comparator)} {r.value}
              </div>
            ))}
          </div>
        </div>
      )}

      {config.entry_rules.length === 0 && config.exit_rules.length === 0 && (
        <div className="mb-1.5 text-[11px] text-muted">No rules yet — describe one or pick from Rules.</div>
      )}

      <div className="mt-1.5 space-y-0.5 border-t border-border/60 pt-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-[11px]">
            <span className="text-muted">{r.label}</span>
            <span className="font-medium text-fg">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type ChatItem =
  | { id: number; kind: "text"; role: "user" | "assistant"; text: string; done: boolean }
  | { id: number; kind: "config"; role: "assistant"; config: BacktestConfig };

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
  const [rulesOpen, setRulesOpen] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [placeholderPhase, setPlaceholderPhase] = useState<"in" | "out">("in");
  const scrollRef = useRef<HTMLDivElement>(null);
  const sendButtonRef = useRef<HTMLButtonElement>(null);
  const rulesChipRef = useRef<HTMLButtonElement>(null);
  const rulesPanelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(0);
  const configRef = useRef(config);
  configRef.current = config;
  const isEmpty = messages.length === 0;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  useEffect(() => {
    if (!isEmpty || input) return;
    const id = setInterval(() => {
      setPlaceholderPhase("out");
      setTimeout(() => {
        setPlaceholderIndex((i) => (i + 1) % PLACEHOLDER_PROMPTS.length);
        setPlaceholderPhase("in");
      }, 200);
    }, 10000);
    return () => clearInterval(id);
  }, [isEmpty, input]);

  useEffect(() => {
    if (!rulesOpen) return;
    const onClick = (e: MouseEvent) => {
      if (
        rulesPanelRef.current?.contains(e.target as Node) ||
        rulesChipRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setRulesOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [rulesOpen]);

  const applyHint = (updater: (config: BacktestConfig) => BacktestConfig) => {
    const next = updater(configRef.current);
    onConfigChange(next);
    setMessages((prev) => [...prev, { id: nextId.current++, kind: "config", role: "assistant", config: next }]);
    setRulesOpen(false);
  };

  const send = async () => {
    const message = input.trim();
    if (!message || streaming) return;
    setInput("");
    setError(null);
    setMessages((prev) => [
      ...prev,
      { id: nextId.current++, kind: "text", role: "user", text: message, done: true },
      { id: nextId.current++, kind: "text", role: "assistant", text: "", done: false },
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
          if (last.kind !== "text") return prev;
          next[next.length - 1] = { ...last, text: last.text + msg.text };
          return next;
        });
      } else if (msg.type === "config") {
        onConfigChange(msg.config);
        setMessages((prev) => [...prev, { id: nextId.current++, kind: "config", role: "assistant", config: msg.config }]);
      } else if (msg.type === "done") {
        setStreaming(false);
        setMessages((prev) =>
          prev.map((m, i) => (i === prev.length - 1 && m.kind === "text" ? { ...m, done: true } : m)),
        );
      } else if (msg.type === "error") {
        setError(msg.detail);
        setStreaming(false);
      }
    };
    ws.onerror = () => setError("Connection lost.");
    ws.onclose = () => setStreaming(false);
  };

  const inputRow = (
    <div className="w-full shrink-0 px-6 py-4">
      <div className="mx-auto flex w-full max-w-lg flex-col rounded-2xl border border-border bg-field focus-within:border-violet-400">
        <div className="relative px-3 pt-3 pb-2">
          {isEmpty && !input && (
            <div
              key={placeholderIndex}
              className={`pointer-events-none absolute left-3 top-3 right-4 text-sm text-muted ${
                placeholderPhase === "in" ? "animate-fade-in-up" : "animate-fade-out-down"
              }`}
            >
              {PLACEHOLDER_PROMPTS[placeholderIndex]}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={isEmpty ? "" : "Describe your strategy…"}
            rows={1}
            className="chat-scroll max-h-40 min-h-[2.25rem] pr-1 w-full resize-none overflow-y-auto bg-transparent text-sm text-fg outline-none placeholder:text-muted"
          />
        </div>
        <div className="flex items-center justify-between px-3 pb-2">
          <div className="relative">
            <button
              ref={rulesChipRef}
              onClick={() => setRulesOpen((v) => !v)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                rulesOpen
                  ? "border-violet-400 bg-violet-500/10 text-fg"
                  : "border-muted/70 text-muted hover:border-violet-400 hover:text-fg"
              }`}
            >
              <ListChecks size={13} strokeWidth={2} />
              Rules
            </button>
            {rulesOpen && (
              <div
                ref={rulesPanelRef}
                className="absolute bottom-full left-0 z-20 mb-2 w-48 rounded-md border border-border bg-panel shadow-lg"
              >
                <HintLibrary onApply={applyHint} />
              </div>
            )}
          </div>
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
    </div>
  );

  if (isEmpty) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 px-4">
        {error && (
          <div className="mx-4 rounded-md border border-down/40 bg-down/10 px-3 py-2 text-sm text-down">{error}</div>
        )}
        <h2 className="text-2xl font-normal text-fg">Describe your strategy</h2>
        {inputRow}
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b from-panel to-transparent" />
      <div ref={scrollRef} className="chat-scroll flex-1 space-y-2 overflow-y-auto overflow-x-hidden px-4 pb-4 pt-6">
        {error && (
          <div className="rounded-md border border-down/40 bg-down/10 px-3 py-2 text-sm text-down">{error}</div>
        )}
        {messages.map((m, i) =>
          m.kind === "config" ? (
            <ConfigSummaryCard key={m.id} config={m.config} />
          ) : (
            <div
              key={m.id}
              className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                m.role === "user"
                  ? "ml-auto rounded-tr-sm bg-accent/20 text-fg"
                  : "rounded-tl-sm bg-border/60 text-fg"
              }`}
            >
              {m.text || (i === messages.length - 1 && streaming ? <TypingIndicator /> : null)}
            </div>
          ),
        )}
      </div>
      <div className="border-t border-border">{inputRow}</div>
    </div>
  );
}
