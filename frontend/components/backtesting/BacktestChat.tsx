"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Hammer, ListChecks, Loader2, Pencil, Play, X } from "lucide-react";
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
  "rounded border border-border bg-field px-1.5 py-0.5 text-sm text-fg outline-none focus:border-violet-400";
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
  "Load a strategy previously saved",
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

type RuleSegment = "family" | "period" | "comparator" | "value" | null;

const segmentClass =
  "cursor-pointer rounded px-0.5 underline decoration-dotted decoration-2 decoration-muted underline-offset-4 transition-colors hover:bg-panel hover:text-accent hover:decoration-accent";
const inlineNumberClass = `${numberInputClass} h-6 py-0`;

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [active, onOutside, ref]);
}

function DropdownPanel<T extends string>({
  options,
  value,
  onSelect,
  align = "left",
}: {
  options: { id: T; label: string }[];
  value: T;
  onSelect: (id: T) => void;
  align?: "left" | "right";
}) {
  return (
    <div
      className={`absolute top-full z-30 mt-1 min-w-[7rem] rounded-md border border-border bg-panel py-1 shadow-lg ${
        align === "right" ? "right-0" : "left-0"
      }`}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(o.id)}
          className={`flex w-full items-center px-3 py-1.5 text-left text-xs transition-colors ${
            o.id === value ? "bg-violet-500/20 text-fg" : "text-muted hover:bg-violet-500/10 hover:text-fg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function RuleRow({
  rule,
  onRemove,
  onUpdate,
  isFirst,
  isLast,
}: {
  rule: BacktestRule;
  onRemove: () => void;
  onUpdate: (rule: BacktestRule) => void;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const [editing, setEditing] = useState<RuleSegment>(null);
  const { familyId, period } = parseIndicator(rule.indicator);
  const family = INDICATOR_FAMILIES.find((f) => f.id === familyId) ?? INDICATOR_FAMILIES[0];
  const familyRef = useRef<HTMLSpanElement>(null);
  const comparatorRef = useRef<HTMLSpanElement>(null);
  useClickOutside(familyRef, () => setEditing(null), editing === "family");
  useClickOutside(comparatorRef, () => setEditing(null), editing === "comparator");

  return (
    <div className="relative pl-4 text-sm text-fg">
      <span className="absolute left-[6px] top-[13px] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted" />
      {!isFirst && <span className="absolute left-[6px] top-0 h-[13px] w-px -translate-x-1/2 bg-muted/60" />}
      {!isLast && <span className="absolute left-[6px] top-[13px] bottom-[-6px] w-px -translate-x-1/2 bg-muted/60" />}
      <div className="group flex items-center justify-between gap-2 rounded-md px-1 py-1 font-mono transition-colors hover:bg-panel/60">
        <span className="flex flex-wrap items-center gap-0.5">
          <span ref={familyRef} className="relative">
            <span onClick={() => setEditing(editing === "family" ? null : "family")} className={segmentClass}>
              {family.id}
            </span>
            {editing === "family" && (
              <DropdownPanel
                value={family.id}
                options={INDICATOR_FAMILIES.map((f) => ({ id: f.id, label: f.label }))}
                onSelect={(id) => {
                  const next = INDICATOR_FAMILIES.find((f) => f.id === id)!;
                  onUpdate({ ...rule, indicator: buildIndicator(next.id, next.hasPeriod ? next.defaultPeriod ?? 14 : null) });
                  setEditing(null);
                }}
              />
            )}
          </span>
          {family.hasPeriod &&
            (editing === "period" ? (
              <input
                autoFocus
                type="number"
                defaultValue={period ?? family.defaultPeriod}
                onBlur={(e) => {
                  onUpdate({ ...rule, indicator: buildIndicator(family.id, Number(e.target.value)) });
                  setEditing(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                className={inlineNumberClass}
              />
            ) : (
              <>
                _
                <span onClick={() => setEditing("period")} className={segmentClass}>
                  {period ?? family.defaultPeriod}
                </span>
              </>
            ))}
          <span ref={comparatorRef} className="relative">
            <span onClick={() => setEditing(editing === "comparator" ? null : "comparator")} className={segmentClass}>
              {comparatorLabel(rule.comparator)}
            </span>
            {editing === "comparator" && (
              <DropdownPanel
                value={rule.comparator}
                options={COMPARATORS.map((c) => ({ id: c.id, label: c.label }))}
                onSelect={(id) => {
                  onUpdate({ ...rule, comparator: id });
                  setEditing(null);
                }}
              />
            )}
          </span>
          {editing === "value" ? (
            <input
              autoFocus
              type="text"
              inputMode="decimal"
              defaultValue={rule.value}
              onBlur={(e) => {
                onUpdate({ ...rule, value: e.target.value });
                setEditing(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              className={inlineNumberClass}
            />
          ) : (
            <span onClick={() => setEditing("value")} className={segmentClass}>
              {rule.value}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove rule"
          className="shrink-0 rounded p-0.5 text-muted opacity-0 transition-opacity hover:text-down group-hover:opacity-100"
        >
          <X size={12} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}

const SIZING_MODES: { id: BacktestSizing["mode"]; label: string; unit: string; suffix: string }[] = [
  { id: "fixed_qty", label: "Fixed qty", unit: "share", suffix: "fixed" },
  { id: "pct_equity", label: "% of equity", unit: "%", suffix: "of equity" },
  { id: "pct_risk", label: "% risk", unit: "%", suffix: "risk" },
];

function StatRow({
  label,
  onRemove,
  isFirst,
  isLast,
  children,
}: {
  label: string;
  onRemove?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative pl-4">
      <span className="absolute left-[6px] top-[13px] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted" />
      {!isFirst && <span className="absolute left-[6px] top-0 h-[13px] w-px -translate-x-1/2 bg-muted/60" />}
      {!isLast && <span className="absolute left-[6px] top-[13px] bottom-[-6px] w-px -translate-x-1/2 bg-muted/60" />}
      <div className="group flex items-center justify-between gap-2 rounded-md px-1 py-1 text-sm text-fg transition-colors hover:bg-panel/60">
        <span className="text-muted">{label}</span>
        <span className="flex items-center gap-1 font-mono">
          {children}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${label}`}
              className="shrink-0 rounded p-0.5 text-muted opacity-0 transition-opacity hover:text-down group-hover:opacity-100"
            >
              <X size={11} strokeWidth={2.2} />
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

function RiskRow({
  label,
  risk,
  onUpdate,
  onRemove,
  isFirst,
  isLast,
}: {
  label: string;
  risk: BacktestRisk;
  onUpdate: (risk: BacktestRisk) => void;
  onRemove: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <StatRow label={label} onRemove={onRemove} isFirst={isFirst} isLast={isLast}>
      {editing ? (
        <input
          autoFocus
          type="number"
          defaultValue={risk.value}
          onBlur={(e) => {
            onUpdate({ value: Number(e.target.value) });
            setEditing(false);
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className={inlineNumberClass}
        />
      ) : (
        <span onClick={() => setEditing(true)} className={segmentClass}>
          {risk.value}
        </span>
      )}
      %
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
  const [editingValue, setEditingValue] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const modeRef = useRef<HTMLSpanElement>(null);
  useClickOutside(modeRef, () => setModeOpen(false), modeOpen);
  const mode = SIZING_MODES.find((m) => m.id === sizing.mode) ?? SIZING_MODES[0];
  return (
    <StatRow label="Position sizing" isFirst isLast>
      {editingValue ? (
        <input
          autoFocus
          type="number"
          defaultValue={sizing.value}
          onBlur={(e) => {
            onUpdate({ ...sizing, value: Number(e.target.value) });
            setEditingValue(false);
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className={inlineNumberClass}
        />
      ) : (
        <span onClick={() => setEditingValue(true)} className={segmentClass}>
          {sizing.value}
        </span>
      )}
      {mode.id === "fixed_qty" ? (sizing.value === 1 ? "share" : "shares") : mode.unit}{" "}
      <span ref={modeRef} className="relative">
        <span onClick={() => setModeOpen((o) => !o)} className={segmentClass}>
          {mode.suffix}
        </span>
        {modeOpen && (
          <DropdownPanel
            align="right"
            value={sizing.mode}
            options={SIZING_MODES.map((m) => ({ id: m.id, label: m.label }))}
            onSelect={(id) => {
              onUpdate({ ...sizing, mode: id });
              setModeOpen(false);
            }}
          />
        )}
      </span>
    </StatRow>
  );
}

function CategoryCard({
  icon: Icon,
  label,
  accentClass,
  isEmpty,
  emptyHint,
  onClickEmpty,
  children,
}: {
  icon: typeof CATEGORY_ICONS.risk;
  label: string;
  accentClass: string;
  isEmpty: boolean;
  emptyHint: string;
  onClickEmpty?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={isEmpty ? onClickEmpty : undefined}
      className={`min-w-0 rounded-lg border px-3 py-2.5 transition-colors ${
        isEmpty
          ? `border-dashed border-border/50 bg-panel/20 text-muted ${onClickEmpty ? "cursor-pointer hover:border-border hover:bg-panel/40" : ""}`
          : "border-border/60 bg-panel/50"
      }`}
    >
      <div className={`mb-2 flex items-center gap-1 text-xs font-semibold tracking-wide ${isEmpty ? "text-muted" : accentClass}`}>
        <Icon size={12} strokeWidth={2.2} />
        {label}
      </div>
      {isEmpty ? <div className="text-xs leading-snug text-muted">{emptyHint}</div> : <div className="space-y-1.5">{children}</div>}
    </div>
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
  onFocusInput,
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
  onFocusInput?: () => void;
}) {
  const EntryIcon = CATEGORY_ICONS.entry;
  const ExitIcon = CATEGORY_ICONS.exit;
  const RiskIcon = CATEGORY_ICONS.risk;
  const SizingIcon = CATEGORY_ICONS.sizing;
  const hasRisk = Boolean(config.stop_loss || config.take_profit);

  return (
    <div className="w-full rounded-2xl border border-violet-400/30 bg-violet-500/5 px-3 py-2.5 text-sm">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
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
            {running ? <Loader2 size={11} strokeWidth={2.5} className="animate-spin" /> : <Play size={11} strokeWidth={2.5} />}
            {running ? "Running…" : "Run"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <CategoryCard
          icon={EntryIcon}
          label="Entry"
          accentClass="text-up"
          isEmpty={config.entry_rules.length === 0}
          emptyHint="Describe a rule or pick from Rules"
          onClickEmpty={onFocusInput}
        >
          {config.entry_rules.map((r, i) => (
            <RuleRow
              key={i}
              rule={r}
              onRemove={() => onRemoveRule("entry_rules", i)}
              onUpdate={(rule) => onUpdateRule("entry_rules", i, rule)}
              isFirst={i === 0}
              isLast={i === config.entry_rules.length - 1}
            />
          ))}
        </CategoryCard>

        <CategoryCard
          icon={ExitIcon}
          label="Exit"
          accentClass="text-down"
          isEmpty={config.exit_rules.length === 0}
          emptyHint="Describe a rule or pick from Rules"
          onClickEmpty={onFocusInput}
        >
          {config.exit_rules.map((r, i) => (
            <RuleRow
              key={i}
              rule={r}
              onRemove={() => onRemoveRule("exit_rules", i)}
              onUpdate={(rule) => onUpdateRule("exit_rules", i, rule)}
              isFirst={i === 0}
              isLast={i === config.exit_rules.length - 1}
            />
          ))}
        </CategoryCard>

        <CategoryCard
          icon={RiskIcon}
          label="Risk"
          accentClass="text-fg"
          isEmpty={!hasRisk}
          emptyHint="No stop loss or take profit set"
          onClickEmpty={() => onUpdateStopLoss({ value: 2 })}
        >
          {config.stop_loss ? (
            <RiskRow
              label="Stop loss"
              risk={config.stop_loss}
              onUpdate={onUpdateStopLoss}
              onRemove={() => onUpdateStopLoss(null)}
              isFirst
              isLast={!config.take_profit}
            />
          ) : (
            <button
              type="button"
              onClick={() => onUpdateStopLoss({ value: 2 })}
              className="py-0.5 pl-4 text-sm text-muted hover:text-fg"
            >
              + Add stop loss
            </button>
          )}
          {config.take_profit ? (
            <RiskRow
              label="Take profit"
              risk={config.take_profit}
              onUpdate={onUpdateTakeProfit}
              onRemove={() => onUpdateTakeProfit(null)}
              isFirst={!config.stop_loss}
              isLast
            />
          ) : (
            <button
              type="button"
              onClick={() => onUpdateTakeProfit({ value: 5 })}
              className="py-0.5 pl-4 text-sm text-muted hover:text-fg"
            >
              + Add take profit
            </button>
          )}
        </CategoryCard>

        <CategoryCard icon={SizingIcon} label="Scale" accentClass="text-fg" isEmpty={false} emptyHint="">
          <SizingRow sizing={config.position_sizing} onUpdate={onUpdateSizing} />
        </CategoryCard>
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
      setPlaceholderIndex((i) => (i + 1) % PLACEHOLDER_PROMPTS.length);
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
            <div className="pointer-events-none absolute left-3 top-3 right-4 h-5 overflow-hidden">
              <div key={placeholderIndex} className="animate-fade-in-up text-sm text-muted">
                {PLACEHOLDER_PROMPTS[placeholderIndex]}
              </div>
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
              onFocusInput={() => textareaRef.current?.focus()}
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
