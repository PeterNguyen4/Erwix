"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Hammer, ListChecks, Pencil, Play, X } from "lucide-react";
import { ToolbarTooltip } from "@/components/chart/ToolbarButton";
import { api, BacktestChatEvent, BacktestConfig, BacktestRisk, BacktestRule, BacktestSizing } from "@/lib/api";
import HintLibrary, { CATEGORY_ICONS } from "@/components/backtesting/HintLibrary";

const INDICATOR_FAMILIES: { id: string; label: string; hasPeriod: boolean; defaultPeriod?: number }[] = [
  { id: "rsi", label: "RSI", hasPeriod: true, defaultPeriod: 14 },
  { id: "sma", label: "SMA", hasPeriod: true, defaultPeriod: 50 },
  { id: "ema", label: "EMA", hasPeriod: true, defaultPeriod: 20 },
  { id: "macd", label: "MACD", hasPeriod: false },
  { id: "macd_signal", label: "MACD Signal", hasPeriod: false },
  { id: "close", label: "Close", hasPeriod: false },
  { id: "open", label: "Open", hasPeriod: false },
  { id: "high", label: "High", hasPeriod: false },
  { id: "low", label: "Low", hasPeriod: false },
];

const COMPARATORS: { id: BacktestRule["comparator"]; label: string }[] = [
  { id: "<", label: "<" },
  { id: "<=", label: "≤" },
  { id: ">", label: ">" },
  { id: ">=", label: "≥" },
  { id: "==", label: "=" },
  { id: "crosses_above", label: "crosses above" },
  { id: "crosses_below", label: "crosses below" },
];

const PERIODED_FAMILIES = new Set(["rsi", "sma", "ema"]);

function parseIndicator(indicator: string): { familyId: string; period: number | null } {
  const idx = indicator.lastIndexOf("_");
  if (idx > 0) {
    const family = indicator.slice(0, idx);
    const period = Number(indicator.slice(idx + 1));
    if (PERIODED_FAMILIES.has(family) && !Number.isNaN(period)) return { familyId: family, period };
  }
  return { familyId: indicator, period: null };
}

function buildIndicator(familyId: string, period: number | null): string {
  return period != null ? `${familyId}_${period}` : familyId;
}

const selectClass =
  "rounded border border-border bg-field px-1.5 py-0.5 text-xs text-fg outline-none focus:border-violet-400";
const numberInputClass = `${selectClass} w-16`;

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

function RuleRow({
  rule,
  onRemove,
  onUpdate,
}: {
  rule: BacktestRule;
  onRemove: () => void;
  onUpdate: (rule: BacktestRule) => void;
}) {
  const [open, setOpen] = useState(false);
  const { familyId, period } = parseIndicator(rule.indicator);
  const family = INDICATOR_FAMILIES.find((f) => f.id === familyId) ?? INDICATOR_FAMILIES[0];

  return (
    <div className="rounded-md bg-panel/60 text-xs text-fg">
      <div
        onClick={() => setOpen((o) => !o)}
        className="group flex cursor-pointer items-center justify-between gap-2 px-2 py-1 font-mono transition-colors hover:bg-panel"
      >
        <span>
          {rule.indicator} {comparatorLabel(rule.comparator)} {rule.value}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Remove rule"
          className="shrink-0 rounded p-0.5 text-muted opacity-0 transition-opacity hover:text-down group-hover:opacity-100"
        >
          <X size={12} strokeWidth={2.2} />
        </button>
      </div>
      {open && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 px-2 py-1.5">
          <select
            value={family.id}
            onChange={(e) => {
              const next = INDICATOR_FAMILIES.find((f) => f.id === e.target.value)!;
              onUpdate({ ...rule, indicator: buildIndicator(next.id, next.hasPeriod ? next.defaultPeriod ?? 14 : null) });
            }}
            className={selectClass}
          >
            {INDICATOR_FAMILIES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          {family.hasPeriod && (
            <input
              type="number"
              value={period ?? family.defaultPeriod}
              onChange={(e) => onUpdate({ ...rule, indicator: buildIndicator(family.id, Number(e.target.value)) })}
              className={numberInputClass}
            />
          )}
          <select
            value={rule.comparator}
            onChange={(e) => onUpdate({ ...rule, comparator: e.target.value as BacktestRule["comparator"] })}
            className={selectClass}
          >
            {COMPARATORS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            value={rule.value}
            onChange={(e) => onUpdate({ ...rule, value: Number(e.target.value) })}
            className={numberInputClass}
          />
        </div>
      )}
    </div>
  );
}

const SIZING_MODES: { id: BacktestSizing["mode"]; label: string; unit: string }[] = [
  { id: "fixed_qty", label: "Fixed qty", unit: "share(s)" },
  { id: "pct_equity", label: "% of equity", unit: "%" },
  { id: "pct_risk", label: "% risk", unit: "%" },
];

function sizingLabel(sizing: BacktestSizing): string {
  return sizing.mode === "fixed_qty"
    ? `${sizing.value} share(s) fixed`
    : sizing.mode === "pct_equity"
    ? `${sizing.value}% of equity`
    : `${sizing.value}% risk`;
}

function StatRow({
  icon: Icon,
  label,
  displayValue,
  onRemove,
  children,
}: {
  icon: typeof CATEGORY_ICONS.risk;
  label: string;
  displayValue: string;
  onRemove?: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md text-xs text-fg">
      <div
        onClick={() => setOpen((o) => !o)}
        className="group -mx-1 flex cursor-pointer items-center justify-between gap-2 rounded-md px-1 py-0.5 transition-colors hover:bg-panel/60"
      >
        <span className="flex items-center gap-1 text-muted">
          <Icon size={12} strokeWidth={2} />
          {label}
        </span>
        <span className="flex items-center gap-1">
          <span className="font-medium text-fg">{displayValue}</span>
          {onRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              aria-label={`Remove ${label}`}
              className="shrink-0 rounded p-0.5 text-muted opacity-0 transition-opacity hover:text-down group-hover:opacity-100"
            >
              <X size={11} strokeWidth={2.2} />
            </button>
          )}
        </span>
      </div>
      {open && (
        <div className="flex flex-wrap items-center gap-1.5 px-1 py-1.5" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      )}
    </div>
  );
}

function RiskRow({
  icon,
  label,
  risk,
  onUpdate,
  onRemove,
}: {
  icon: typeof CATEGORY_ICONS.risk;
  label: string;
  risk: BacktestRisk;
  onUpdate: (risk: BacktestRisk) => void;
  onRemove: () => void;
}) {
  return (
    <StatRow icon={icon} label={label} displayValue={`${risk.value}%`} onRemove={onRemove}>
      <input
        type="number"
        value={risk.value}
        onChange={(e) => onUpdate({ value: Number(e.target.value) })}
        className={numberInputClass}
      />
      <span className="text-xs text-muted">%</span>
    </StatRow>
  );
}

function SizingRow({
  sizing,
  onUpdate,
}: {
  sizing: BacktestSizing;
  onUpdate: (sizing: BacktestSizing) => void;
}) {
  const mode = SIZING_MODES.find((m) => m.id === sizing.mode) ?? SIZING_MODES[0];
  return (
    <StatRow icon={CATEGORY_ICONS.sizing} label="Position sizing" displayValue={sizingLabel(sizing)}>
      <select
        value={sizing.mode}
        onChange={(e) => onUpdate({ ...sizing, mode: e.target.value as BacktestSizing["mode"] })}
        className={selectClass}
      >
        {SIZING_MODES.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <input
        type="number"
        value={sizing.value}
        onChange={(e) => onUpdate({ ...sizing, value: Number(e.target.value) })}
        className={numberInputClass}
      />
      <span className="text-xs text-muted">{mode.unit}</span>
    </StatRow>
  );
}

function ConfigSummaryCard({
  config,
  onRemoveRule,
  onUpdateRule,
  onRename,
  onRun,
  running,
  canRun,
  onUpdateStopLoss,
  onUpdateTakeProfit,
  onUpdateSizing,
}: {
  config: BacktestConfig;
  onRemoveRule: (kind: "entry_rules" | "exit_rules", index: number) => void;
  onUpdateRule: (kind: "entry_rules" | "exit_rules", index: number, rule: BacktestRule) => void;
  onRename: (name: string) => void;
  onRun: () => void;
  running: boolean;
  canRun: boolean;
  onUpdateStopLoss: (risk: BacktestRisk | null) => void;
  onUpdateTakeProfit: (risk: BacktestRisk | null) => void;
  onUpdateSizing: (sizing: BacktestSizing) => void;
}) {
  const EntryIcon = CATEGORY_ICONS.entry;
  const ExitIcon = CATEGORY_ICONS.exit;
  const RiskIcon = CATEGORY_ICONS.risk;

  return (
    <div className="w-full rounded-2xl border border-violet-400/30 bg-violet-500/5 px-3 py-2.5 text-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <input
          type="text"
          value={config.name}
          onChange={(e) => onRename(e.target.value)}
          placeholder="Plan"
          className="min-w-0 flex-1 truncate rounded bg-transparent text-sm font-semibold text-fg outline-none placeholder:text-muted hover:bg-panel/60 focus:bg-panel/60 focus:px-1 focus:-mx-1"
        />
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-full bg-border/60 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-muted">
            {config.direction}
          </span>
          <button
            type="button"
            onClick={onRun}
            disabled={running || !canRun}
            aria-label="Run backtest"
            className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs font-semibold text-on-accent transition-colors hover:bg-accent/80 disabled:opacity-50"
          >
            <Play size={11} strokeWidth={2.5} />
            {running ? "Running…" : "Run"}
          </button>
        </div>
      </div>

      {config.entry_rules.length > 0 && (
        <div className="mb-1.5">
          <div className="mb-1 flex items-center gap-1 text-xs font-semibold tracking-wide text-up">
            <EntryIcon size={12} strokeWidth={2.2} />
            Entry
          </div>
          <div className="space-y-1">
            {config.entry_rules.map((r, i) => (
              <RuleRow
                key={i}
                rule={r}
                onRemove={() => onRemoveRule("entry_rules", i)}
                onUpdate={(rule) => onUpdateRule("entry_rules", i, rule)}
              />
            ))}
          </div>
        </div>
      )}

      {config.exit_rules.length > 0 && (
        <div className="mb-1.5">
          <div className="mb-1 flex items-center gap-1 text-xs font-semibold tracking-wide text-down">
            <ExitIcon size={12} strokeWidth={2.2} />
            Exit
          </div>
          <div className="space-y-1">
            {config.exit_rules.map((r, i) => (
              <RuleRow
                key={i}
                rule={r}
                onRemove={() => onRemoveRule("exit_rules", i)}
                onUpdate={(rule) => onUpdateRule("exit_rules", i, rule)}
              />
            ))}
          </div>
        </div>
      )}

      {config.entry_rules.length === 0 && config.exit_rules.length === 0 && (
        <div className="mb-1.5 text-xs text-muted">No rules yet — describe one or pick from Rules.</div>
      )}

      <div className="mt-1.5 space-y-0.5 border-t border-border/60 pt-1.5">
        {config.stop_loss ? (
          <RiskRow
            icon={RiskIcon}
            label="Stop loss"
            risk={config.stop_loss}
            onUpdate={onUpdateStopLoss}
            onRemove={() => onUpdateStopLoss(null)}
          />
        ) : (
          <button
            type="button"
            onClick={() => onUpdateStopLoss({ value: 2 })}
            className="flex items-center gap-1 py-0.5 text-xs text-muted hover:text-fg"
          >
            <RiskIcon size={12} strokeWidth={2} />
            + Add stop loss
          </button>
        )}
        {config.take_profit ? (
          <RiskRow
            icon={RiskIcon}
            label="Take profit"
            risk={config.take_profit}
            onUpdate={onUpdateTakeProfit}
            onRemove={() => onUpdateTakeProfit(null)}
          />
        ) : (
          <button
            type="button"
            onClick={() => onUpdateTakeProfit({ value: 5 })}
            className="flex items-center gap-1 py-0.5 text-xs text-muted hover:text-fg"
          >
            <RiskIcon size={12} strokeWidth={2} />
            + Add take profit
          </button>
        )}
        <SizingRow sizing={config.position_sizing} onUpdate={onUpdateSizing} />
      </div>
    </div>
  );
}

type ChatItem =
  | { id: number; kind: "text"; role: "user" | "assistant"; text: string; done: boolean }
  | { id: number; kind: "config"; role: "assistant"; config: BacktestConfig }
  | { id: number; kind: "action"; role: "assistant"; label: "Build" | "Edit" };

function ActionBadge({ label }: { label: "Build" | "Edit" }) {
  const Icon = label === "Build" ? Hammer : Pencil;
  return (
    <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
      <Icon size={12} strokeWidth={2.2} />
      {label}
    </div>
  );
}

interface BacktestChatProps {
  config: BacktestConfig;
  onConfigChange: (config: BacktestConfig) => void;
  onRunBacktest: () => void;
  running: boolean;
  canRun: boolean;
}

export default function BacktestChat({ config, onConfigChange, onRunBacktest, running, canRun }: BacktestChatProps) {
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

  const upsertConfigCard = (next: BacktestConfig) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.kind === "config");
      if (idx === -1)
        return [...prev, { id: nextId.current++, kind: "config", role: "assistant", config: next } as ChatItem];
      const copy = [...prev];
      copy[idx] = { ...copy[idx], config: next } as ChatItem;
      return copy;
    });
  };

  const applyHint = (updater: (config: BacktestConfig) => BacktestConfig) => {
    const next = updater(configRef.current);
    onConfigChange(next);
    upsertConfigCard(next);
    setRulesOpen(false);
  };

  const removeRule = (kind: "entry_rules" | "exit_rules", index: number) => {
    const next = { ...configRef.current, [kind]: configRef.current[kind].filter((_, i) => i !== index) };
    onConfigChange(next);
    upsertConfigCard(next);
  };

  const updateRule = (kind: "entry_rules" | "exit_rules", index: number, rule: BacktestRule) => {
    const next = { ...configRef.current, [kind]: configRef.current[kind].map((r, i) => (i === index ? rule : r)) };
    onConfigChange(next);
    upsertConfigCard(next);
  };

  const renameStrategy = (name: string) => {
    const next = { ...configRef.current, name };
    onConfigChange(next);
    upsertConfigCard(next);
  };

  const updateStopLoss = (risk: BacktestRisk | null) => {
    const next = { ...configRef.current, stop_loss: risk };
    onConfigChange(next);
    upsertConfigCard(next);
  };

  const updateTakeProfit = (risk: BacktestRisk | null) => {
    const next = { ...configRef.current, take_profit: risk };
    onConfigChange(next);
    upsertConfigCard(next);
  };

  const updateSizing = (sizing: BacktestSizing) => {
    const next = { ...configRef.current, position_sizing: sizing };
    onConfigChange(next);
    upsertConfigCard(next);
  };

  const send = async () => {
    const message = input.trim();
    if (!message || streaming) return;
    setInput("");
    setError(null);
    setMessages((prev) => [
      ...prev,
      { id: nextId.current++, kind: "text", role: "user", text: message, done: true },
    ]);
    setStreaming(true);
    let textStarted = false;

    const url = await api.backtestChatStreamUrl(configRef.current, message);
    const ws = new WebSocket(url);
    ws.onmessage = (ev) => {
      const msg: BacktestChatEvent = JSON.parse(ev.data);
      if (msg.type === "action") {
        setMessages((prev) => [...prev, { id: nextId.current++, kind: "action", role: "assistant", label: msg.label }]);
      } else if (msg.type === "token") {
        setMessages((prev) => {
          if (!textStarted) {
            textStarted = true;
            return [...prev, { id: nextId.current++, kind: "text", role: "assistant", text: msg.text, done: false }];
          }
          const next = [...prev];
          const last = next[next.length - 1];
          if (last.kind !== "text") return prev;
          next[next.length - 1] = { ...last, text: last.text + msg.text };
          return next;
        });
      } else if (msg.type === "config") {
        onConfigChange(msg.config);
        upsertConfigCard(msg.config);
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
    <div className="w-full shrink-0 px-4 py-3">
      <div className="mx-auto flex w-full max-w-2xl flex-col rounded-2xl border border-border bg-field focus-within:border-violet-400">
        <div className={`relative px-3 pt-3 ${isEmpty ? "pb-1" : "pb-0"}`}>
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
            placeholder={isEmpty ? "" : "Describe your strategy"}
            rows={1}
            className="chat-scroll max-h-40 min-h-[1.75rem] pr-1 w-full resize-none overflow-y-auto bg-transparent text-sm text-fg outline-none placeholder:text-muted"
          />
        </div>
        <div className="flex items-center justify-between px-3 pb-3">
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
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent text-on-accent transition-colors hover:bg-accent/80 disabled:opacity-50"
            >
              <ArrowUp size={13} strokeWidth={2.5} />
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
      <div ref={scrollRef} className="chat-scroll flex-1 space-y-2 overflow-y-auto overflow-x-hidden px-4 pb-24 pt-6">
        {error && (
          <div className="rounded-md border border-down/40 bg-down/10 px-3 py-2 text-sm text-down">{error}</div>
        )}
        {messages.map((m, i) =>
          m.kind === "config" ? (
            <ConfigSummaryCard
              key={m.id}
              config={m.config}
              onRemoveRule={removeRule}
              onUpdateRule={updateRule}
              onRename={renameStrategy}
              onRun={onRunBacktest}
              running={running}
              canRun={canRun}
              onUpdateStopLoss={updateStopLoss}
              onUpdateTakeProfit={updateTakeProfit}
              onUpdateSizing={updateSizing}
            />
          ) : m.kind === "action" ? (
            <ActionBadge key={m.id} label={m.label} />
          ) : (
            <div
              key={m.id}
              className={
                m.role === "user"
                  ? "ml-auto max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-accent/20 px-3 py-2 text-sm text-fg"
                  : "whitespace-pre-wrap px-1 py-1 text-sm text-fg"
              }
            >
              {m.text || (i === messages.length - 1 && streaming ? <TypingIndicator /> : null)}
            </div>
          ),
        )}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-gradient-to-t from-panel to-transparent" />
      <div className="absolute inset-x-0 bottom-0 z-20">{inputRow}</div>
    </div>
  );
}
