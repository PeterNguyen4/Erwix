"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUp, Calendar as CalendarIcon, ChevronDown, Hammer, History, ListChecks, Loader2, Pencil, Play, Plus, Search, Settings2, SlashSquare, Trash2, X } from "lucide-react";
import ScrollToBottomButton from "@/components/ScrollToBottomButton";
import { ToolbarTooltip } from "@/components/chart/ToolbarButton";
import {
  api,
  Archetype,
  BacktestChatEvent,
  BacktestChatSessionSummary,
  BacktestConfig,
  BacktestResult,
  BacktestRisk,
  BacktestRule,
  BacktestSizing,
  CandleStep,
  GatedRule,
  PatternRule,
  StrategyNote,
  StrategyNoteSummary,
  StrategyRule,
  StrategyRuleSet,
} from "@/lib/api";
import HintLibrary, { CATEGORY_ICONS } from "@/components/backtesting/HintLibrary";
import { presentationFor } from "@/components/strategy/presentation";
import { backtestDraft, DEFAULT_BACKTEST_CONFIG } from "@/lib/backtestDraft";
import {
  createBacktestSession,
  deleteBacktestSession,
  getBacktestSession,
  getCurrentSessionId,
  listBacktestSessions,
  saveBacktestSession,
  setCurrentSessionId,
  titleFromSession,
} from "@/lib/backtestSessions";
import { useClickOutside } from "@/lib/useClickOutside";

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

const SLASH_COMMANDS: { cmd: string; description: string }[] = [
  { cmd: "/clear", description: "Start a new chat" },
];

function comparatorLabel(c: string) {
  switch (c) {
    case "crosses_above": return "crosses above";
    case "crosses_below": return "crosses below";
    default: return c;
  }
}

type RuleSegment = "comparator" | "value" | null;

const segmentClass =
  "cursor-pointer rounded px-0.5 underline decoration-dotted decoration-2 decoration-muted underline-offset-4 transition-colors hover:bg-panel hover:text-accent hover:decoration-accent";
const inlineNumberClass = `${numberInputClass} h-6 py-0`;

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

type ListState =
  | { status: "idle" | "loading" }
  | { status: "empty" }
  | { status: "ready"; strategies: StrategyNoteSummary[]; archetypes: Archetype[] };

type SelectState =
  | { status: "none" }
  | { status: "loading"; noteId: number }
  | { status: "failed"; noteId: number; error: string };

function LoadStrategyMenu({ onLoad }: { onLoad: (ruleSet: StrategyRuleSet, note: StrategyNote) => void }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<ListState>({ status: "idle" });
  const [selected, setSelected] = useState<SelectState>({ status: "none" });
  const [retrying, setRetrying] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  useClickOutside(ref, () => setOpen(false), open);

  const load = async () => {
    setList({ status: "loading" });
    try {
      const [strategies, archetypes] = await Promise.all([api.listStrategies(), api.getArchetypes()]);
      setList(strategies.length === 0 ? { status: "empty" } : { status: "ready", strategies, archetypes });
    } catch {
      setList({ status: "empty" });
    }
  };

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    setSelected({ status: "none" });
    setQuery("");
    if (next && list.status === "idle") {
      await load();
    }
  };

  const selectStrategy = async (noteId: number) => {
    setSelected({ status: "loading", noteId });
    try {
      const [rulesOut, note] = await Promise.all([api.getStrategyRules(noteId), api.getStrategyById(noteId)]);
      const ruleSet = rulesOut.rules;
      if (!ruleSet || (ruleSet.entry_rules.length === 0 && ruleSet.exit_rules.length === 0)) {
        setSelected({
          status: "failed",
          noteId,
          error: rulesOut.compile_error ?? "This strategy has no compiled rules yet.",
        });
        return;
      }
      onLoad(ruleSet, note);
      setOpen(false);
      setSelected({ status: "none" });
    } catch {
      setSelected({ status: "failed", noteId, error: "Couldn't load this strategy's rules." });
    }
  };

  const retry = async (noteId: number) => {
    setRetrying(true);
    try {
      await api.regenerateStrategy(noteId);
      await selectStrategy(noteId);
    } catch {
      setSelected({ status: "failed", noteId, error: "Couldn't regenerate this strategy." });
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label="Load a saved strategy"
        className="flex shrink-0 items-center justify-center rounded-full bg-field p-1.5 text-muted transition-colors hover:bg-fg/10 hover:text-fg"
      >
        <Plus size={15} strokeWidth={2} />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-2 w-60 rounded-md border border-border bg-panel py-1 shadow-lg">
          {list.status === "loading" && <div className="px-3 py-2 text-xs text-muted">Loading…</div>}
          {list.status === "empty" && (
            <div className="flex flex-col items-start gap-1.5 px-3 py-2">
              <span className="text-xs text-muted">No strategies saved yet.</span>
              <button
                type="button"
                onClick={() => router.push("/strategy")}
                className="flex items-center gap-1 text-xs font-medium text-accent hover:underline dark:text-violet-400"
              >
                Build Strategy
                <ArrowRight size={12} strokeWidth={2.2} />
              </button>
            </div>
          )}
          {list.status === "ready" && list.strategies.length > 3 && (
            <div className="px-2 pb-1.5">
              <div className="flex items-center gap-1.5 rounded border border-border bg-field px-2 py-1 focus-within:border-violet-400">
                <Search size={11} strokeWidth={2} className="shrink-0 text-muted" />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search strategies"
                  className="w-full bg-transparent text-xs text-fg outline-none placeholder:text-muted"
                />
              </div>
            </div>
          )}
          {list.status === "ready" &&
            (() => {
              const q = query.trim().toLowerCase();
              const withArchetypeName = list.strategies.map((s) => ({
                s,
                archetypeName: list.archetypes.find((a) => a.id === s.archetype)?.name ?? "Custom",
              }));
              const filtered = q
                ? withArchetypeName.filter(
                    ({ s, archetypeName }) =>
                      s.name.toLowerCase().includes(q) || archetypeName.toLowerCase().includes(q),
                  )
                : withArchetypeName;
              if (filtered.length === 0) {
                return <div className="px-3 py-2 text-xs text-muted">No strategies match &quot;{query}&quot;.</div>;
              }
              return filtered.map(({ s, archetypeName }) => {
              const presentation = presentationFor(s.archetype);
              const Icon = presentation.icon;
              const isSelected = selected.status !== "none" && selected.noteId === s.id;

              if (isSelected && selected.status === "failed") {
                return (
                  <div key={s.id} className="flex flex-col items-start gap-1.5 px-3 py-2">
                    <span className="text-xs text-fg">{s.name}</span>
                    <span className="text-[10px] text-red-400 break-words">{selected.error}</span>
                    <button
                      type="button"
                      onClick={() => retry(s.id)}
                      disabled={retrying}
                      className="flex items-center gap-1 text-xs font-medium text-accent hover:underline disabled:opacity-50 dark:text-violet-400"
                    >
                      {retrying ? "Retrying…" : "Retry"}
                    </button>
                  </div>
                );
              }

              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => selectStrategy(s.id)}
                  disabled={selected.status === "loading"}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-violet-500/10 disabled:opacity-50"
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${presentation.color}22` }}
                  >
                    <Icon size={12} strokeWidth={2} color={presentation.color} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-xs text-fg">{s.name}</span>
                    <span className="truncate text-[10px] text-muted">{archetypeName}</span>
                  </span>
                  {isSelected && selected.status === "loading" && (
                    <Loader2 size={12} strokeWidth={2.5} className="shrink-0 animate-spin text-muted" />
                  )}
                </button>
              );
              });
            })()}
        </div>
      )}
    </div>
  );
}

function isNumericValue(value: string): boolean {
  return value.trim() !== "" && !Number.isNaN(Number(value));
}

function IndicatorFamilyPeriod({
  indicator,
  onChange,
}: {
  indicator: string;
  onChange: (indicator: string) => void;
}) {
  const [editing, setEditing] = useState<"family" | "period" | null>(null);
  const familyRef = useRef<HTMLSpanElement>(null);
  useClickOutside(familyRef, () => setEditing(null), editing === "family");
  const { familyId, period } = parseIndicator(indicator);
  const family = INDICATOR_FAMILIES.find((f) => f.id === familyId) ?? INDICATOR_FAMILIES[0];

  return (
    <>
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
              onChange(buildIndicator(next.id, next.hasPeriod ? next.defaultPeriod ?? 14 : null));
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
              onChange(buildIndicator(family.id, Number(e.target.value)));
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
    </>
  );
}

const VALUE_TYPE_OPTIONS = [{ id: "__number__", label: "Number" }, ...INDICATOR_FAMILIES.map((f) => ({ id: f.id, label: f.label }))];

function candleStepConstraints(step: CandleStep): string[] {
  const constraints: string[] = [];
  if (step.min_body_ratio != null) constraints.push(`body ≥${Math.round(step.min_body_ratio * 100)}%`);
  if (step.max_upper_wick_ratio != null)
    constraints.push(
      step.max_upper_wick_ratio === 0 ? "no upper wick" : `upper wick ≤${Math.round(step.max_upper_wick_ratio * 100)}%`
    );
  if (step.max_lower_wick_ratio != null)
    constraints.push(
      step.max_lower_wick_ratio === 0 ? "no lower wick" : `lower wick ≤${Math.round(step.max_lower_wick_ratio * 100)}%`
    );
  return constraints;
}

function CandleStepChip({ step }: { step: CandleStep }) {
  const constraints = candleStepConstraints(step);
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-field px-1.5 py-0.5 text-[10px] text-fg">
      <span className={`h-2 w-2 shrink-0 rounded-full ${step.color === "green" ? "bg-up" : "bg-down"}`} />
      {constraints.length > 0 ? constraints.join(", ") : step.color}
    </span>
  );
}

function RuleRowShell({
  onRemove,
  isFirst,
  isLast,
  children,
}: {
  onRemove: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative pl-4 text-sm text-fg">
      <span className="absolute left-[6px] top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted" />
      {!isFirst && <span className="absolute left-[6px] top-0 h-1/2 w-px -translate-x-1/2 bg-muted/60" />}
      {!isLast && <span className="absolute left-[6px] top-1/2 bottom-[-6px] w-px -translate-x-1/2 bg-muted/60" />}
      <div className="group flex items-start justify-between gap-2 rounded-md px-1 py-1 transition-colors hover:bg-panel/60">
        <div className="min-w-0 flex-1">{children}</div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove rule"
          className="mt-0.5 shrink-0 rounded p-0.5 text-muted opacity-0 transition-opacity hover:text-down group-hover:opacity-100"
        >
          <X size={16} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}

function PatternRuleRow({
  rule,
  onRemove,
  isFirst,
  isLast,
}: {
  rule: PatternRule;
  onRemove: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  return (
    <RuleRowShell onRemove={onRemove} isFirst={isFirst} isLast={isLast}>
      <div className="mb-1 text-xs text-muted">{rule.description}</div>
      <div className="flex flex-wrap items-center gap-1">
        {rule.steps.map((step, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ArrowRight size={12} strokeWidth={2.2} className="text-muted" />}
            <CandleStepChip step={step} />
          </span>
        ))}
      </div>
    </RuleRowShell>
  );
}

function GatedRuleRow({
  rule,
  onRemove,
  isFirst,
  isLast,
}: {
  rule: GatedRule;
  onRemove: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  return (
    <RuleRowShell onRemove={onRemove} isFirst={isFirst} isLast={isLast}>
      <div className="mb-1 text-xs text-muted">{rule.description}</div>
      <div className="flex flex-wrap items-center gap-1 font-mono text-xs">
        <span className="text-muted">if</span>
        <ConditionInline condition={rule.gate} />
        <ArrowRight size={13} strokeWidth={2.2} className="text-muted" />
        <ConditionInline condition={rule.condition} />
      </div>
    </RuleRowShell>
  );
}

function ConditionInline({ condition }: { condition: StrategyRule | PatternRule }) {
  if (condition.type === "pattern") {
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        {condition.steps.map((step, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ArrowRight size={11} strokeWidth={2.2} className="text-muted" />}
            <CandleStepChip step={step} />
          </span>
        ))}
      </span>
    );
  }
  return (
    <span className="rounded border border-border/60 bg-field px-1.5 py-0.5 text-fg">
      {condition.left} {comparatorLabel(condition.comparator)} {condition.right}
    </span>
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
  const [valueTypeOpen, setValueTypeOpen] = useState(false);
  const comparatorRef = useRef<HTMLSpanElement>(null);
  const valueTypeRef = useRef<HTMLSpanElement>(null);
  useClickOutside(comparatorRef, () => setEditing(null), editing === "comparator");
  useClickOutside(valueTypeRef, () => setValueTypeOpen(false), valueTypeOpen);
  const valueIsNumeric = isNumericValue(rule.value);

  return (
    <div className="relative pl-4 text-sm text-fg">
      <span className="absolute left-[6px] top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted" />
      {!isFirst && <span className="absolute left-[6px] top-0 h-1/2 w-px -translate-x-1/2 bg-muted/60" />}
      {!isLast && <span className="absolute left-[6px] top-1/2 bottom-[-6px] w-px -translate-x-1/2 bg-muted/60" />}
      <div className="group flex items-center justify-between gap-2 rounded-md px-1 py-1 font-mono transition-colors hover:bg-panel/60">
        <span className="flex flex-wrap items-center gap-0.5">
          <IndicatorFamilyPeriod indicator={rule.indicator} onChange={(indicator) => onUpdate({ ...rule, indicator })} />
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
          {valueIsNumeric ? (
            editing === "value" ? (
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
            )
          ) : (
            <IndicatorFamilyPeriod indicator={rule.value} onChange={(value) => onUpdate({ ...rule, value })} />
          )}
          <span ref={valueTypeRef} className="relative">
            <button
              type="button"
              onClick={() => setValueTypeOpen((o) => !o)}
              aria-label="Change value type"
              className="rounded p-0.5 text-muted opacity-0 transition-opacity hover:text-accent group-hover:opacity-100"
            >
              <ChevronDown size={13} strokeWidth={2.5} />
            </button>
            {valueTypeOpen && (
              <DropdownPanel
                value={valueIsNumeric ? "__number__" : parseIndicator(rule.value).familyId}
                options={VALUE_TYPE_OPTIONS}
                onSelect={(id) => {
                  if (id === "__number__") {
                    onUpdate({ ...rule, value: "0" });
                    setEditing("value");
                  } else {
                    const next = INDICATOR_FAMILIES.find((f) => f.id === id)!;
                    onUpdate({ ...rule, value: buildIndicator(next.id, next.hasPeriod ? next.defaultPeriod ?? 14 : null) });
                  }
                  setValueTypeOpen(false);
                }}
              />
            )}
          </span>
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove rule"
          className="shrink-0 rounded p-0.5 text-muted opacity-0 transition-opacity hover:text-down group-hover:opacity-100"
        >
          <X size={16} strokeWidth={2.2} />
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
      <span className="absolute left-[6px] top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted" />
      {!isFirst && <span className="absolute left-[6px] top-0 h-1/2 w-px -translate-x-1/2 bg-muted/60" />}
      {!isLast && <span className="absolute left-[6px] top-1/2 bottom-[-6px] w-px -translate-x-1/2 bg-muted/60" />}
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
              <X size={14} strokeWidth={2.2} />
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

function AddStatRow({
  label,
  onAdd,
}: {
  label: string;
  onAdd: () => void;
}) {
  return (
    <div className="relative pl-4">
      <Plus
        size={13}
        strokeWidth={2.5}
        className="absolute left-[6px] top-1/2 -translate-x-1/2 -translate-y-1/2 text-muted"
      />
      <button
        type="button"
        onClick={onAdd}
        className="flex w-full items-center rounded-md px-1 py-1 text-sm text-muted transition-colors hover:bg-panel/60 hover:text-fg"
      >
        {label}
      </button>
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

function formatMMDDYYYY(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return y && m && d ? `${m}/${d}/${y}` : isoDate;
}

function WindowRow({
  label,
  value,
  onUpdate,
  onRemove,
  isFirst,
  isLast,
}: {
  label: string;
  value: string;
  onUpdate: (v: string) => void;
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
          type="date"
          defaultValue={value}
          onBlur={(e) => {
            if (e.target.value) onUpdate(e.target.value);
            setEditing(false);
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className={`${selectClass} w-32`}
        />
      ) : (
        <span onClick={() => setEditing(true)} className={segmentClass}>
          {formatMMDDYYYY(value)}
        </span>
      )}
    </StatRow>
  );
}

function SizingRow({
  sizing,
  onUpdate,
  onReset,
}: {
  sizing: BacktestSizing;
  onUpdate: (sizing: BacktestSizing) => void;
  onReset: () => void;
}) {
  const [editingValue, setEditingValue] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const modeRef = useRef<HTMLSpanElement>(null);
  useClickOutside(modeRef, () => setModeOpen(false), modeOpen);
  const mode = SIZING_MODES.find((m) => m.id === sizing.mode) ?? SIZING_MODES[0];
  const isDefault =
    sizing.mode === DEFAULT_BACKTEST_CONFIG.position_sizing.mode &&
    sizing.value === DEFAULT_BACKTEST_CONFIG.position_sizing.value;
  return (
    <StatRow label="Position sizing" onRemove={isDefault ? undefined : onReset} isFirst isLast>
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
  className,
  children,
}: {
  icon: typeof CATEGORY_ICONS.risk;
  label: string;
  accentClass: string;
  isEmpty: boolean;
  emptyHint: string;
  onClickEmpty?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={isEmpty ? onClickEmpty : undefined}
      className={`min-w-0 rounded-lg border px-2.5 py-2 transition-colors 2xl:px-3 2xl:py-2.5 ${
        isEmpty
          ? `border-dashed border-border/50 bg-panel/20 text-muted ${onClickEmpty ? "cursor-pointer hover:border-border hover:bg-panel/40" : ""}`
          : "border-border/60 bg-panel/50"
      } ${className ?? ""}`}
    >
      <div className={`mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide 2xl:mb-2 2xl:text-xs ${isEmpty ? "text-muted" : accentClass}`}>
        <Icon size={14} strokeWidth={2.2} />
        {label}
      </div>
      {isEmpty ? <div className="text-[11px] leading-snug text-muted 2xl:text-xs">{emptyHint}</div> : <div className="space-y-1 2xl:space-y-1.5">{children}</div>}
    </div>
  );
}

const CHAT_TIMEFRAMES: { id: string; label: string }[] = [
  { id: "1Min", label: "1m" },
  { id: "5Min", label: "5m" },
  { id: "15Min", label: "15m" },
  { id: "1Hour", label: "1H" },
  { id: "1Day", label: "1D" },
  { id: "1Week", label: "1W" },
  { id: "1Month", label: "1M" },
];

function PreferencesRow({ config, onUpdateSymbol, onUpdateTimeframe, onReset }: {
  config: BacktestConfig;
  onUpdateSymbol: (symbol: string) => void;
  onUpdateTimeframe: (timeframe: string) => void;
  onReset: () => void;
}) {
  const [editingSymbol, setEditingSymbol] = useState(false);
  const [tfOpen, setTfOpen] = useState(false);
  const tfRef = useRef<HTMLSpanElement>(null);
  useClickOutside(tfRef, () => setTfOpen(false), tfOpen);
  const isDefault =
    config.symbol === DEFAULT_BACKTEST_CONFIG.symbol && config.timeframe === DEFAULT_BACKTEST_CONFIG.timeframe;

  return (
    <StatRow label="Symbol / Timeframe" onRemove={isDefault ? undefined : onReset} isFirst isLast>
      {editingSymbol ? (
        <input
          autoFocus
          type="text"
          defaultValue={config.symbol}
          onBlur={(e) => {
            const v = e.target.value.trim().toUpperCase();
            if (v) onUpdateSymbol(v);
            setEditingSymbol(false);
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className={numberInputClass}
        />
      ) : (
        <span onClick={() => setEditingSymbol(true)} className={segmentClass}>
          {config.symbol}
        </span>
      )}
      <span ref={tfRef} className="relative">
        <span onClick={() => setTfOpen((o) => !o)} className={segmentClass}>
          {CHAT_TIMEFRAMES.find((t) => t.id === config.timeframe)?.label ?? config.timeframe}
        </span>
        {tfOpen && (
          <DropdownPanel
            align="right"
            value={config.timeframe}
            options={CHAT_TIMEFRAMES}
            onSelect={(id) => {
              onUpdateTimeframe(id);
              setTfOpen(false);
            }}
          />
        )}
      </span>
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
  onResetSizing,
  onUpdateSymbol,
  onUpdateTimeframe,
  onResetPreferences,
  windowStart,
  windowEnd,
  onUpdateWindowStart,
  onUpdateWindowEnd,
  onAddRule,
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
  onResetSizing: () => void;
  onUpdateSymbol: (symbol: string) => void;
  onUpdateTimeframe: (timeframe: string) => void;
  onResetPreferences: () => void;
  windowStart: string | null;
  windowEnd: string | null;
  onUpdateWindowStart: (v: string | null) => void;
  onUpdateWindowEnd: (v: string | null) => void;
  onAddRule: (kind: "entry_rules" | "exit_rules") => void;
}) {
  const EntryIcon = CATEGORY_ICONS.entry;
  const ExitIcon = CATEGORY_ICONS.exit;
  const RiskIcon = CATEGORY_ICONS.risk;
  const SizingIcon = CATEGORY_ICONS.sizing;
  const hasRisk = Boolean(config.stop_loss || config.take_profit);

  return (
    <div className="w-full rounded-2xl border border-violet-400/30 bg-violet-500/5 px-2.5 py-2 text-xs 2xl:px-3 2xl:py-2.5 2xl:text-sm">
      <div className="mb-1.5 flex items-center justify-between gap-2 px-1 2xl:mb-2">
        <input
          type="text"
          value={config.name}
          onChange={(e) => onRename(e.target.value)}
          placeholder="Plan"
          className="min-w-0 flex-1 truncate rounded bg-transparent text-xs font-semibold text-fg outline-none placeholder:text-muted hover:bg-panel/60 focus:bg-panel/60 focus:px-1 focus:-mx-1 2xl:text-sm"
        />
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-full bg-border/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted 2xl:text-xs">
            {config.direction}
          </span>
          <button
            type="button"
            onClick={onRun}
            disabled={running || !canRun}
            aria-label="Run backtest"
            className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-[10px] font-semibold text-on-accent transition-colors hover:bg-accent/80 disabled:opacity-50 2xl:text-xs"
          >
            {running ? <Loader2 size={12} strokeWidth={2.5} className="animate-spin" /> : <Play size={12} strokeWidth={2.5} />}
            {running ? "Running…" : "Run"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 2xl:gap-2">
        <CategoryCard
          icon={EntryIcon}
          label="Entry"
          accentClass="text-up"
          isEmpty={config.entry_rules.length === 0}
          emptyHint="Add an entry condition"
          onClickEmpty={() => onAddRule("entry_rules")}
        >
          {config.entry_rules.map((r, i) => {
            const isFirst = i === 0;
            const isLast = i === config.entry_rules.length - 1;
            const onRemove = () => onRemoveRule("entry_rules", i);
            if (r.type === "pattern") return <PatternRuleRow key={i} rule={r} onRemove={onRemove} isFirst={isFirst} isLast={isLast} />;
            if (r.type === "gated") return <GatedRuleRow key={i} rule={r} onRemove={onRemove} isFirst={isFirst} isLast={isLast} />;
            return (
              <RuleRow
                key={i}
                rule={r}
                onRemove={onRemove}
                onUpdate={(rule) => onUpdateRule("entry_rules", i, rule)}
                isFirst={isFirst}
                isLast={isLast}
              />
            );
          })}
        </CategoryCard>

        <CategoryCard
          icon={ExitIcon}
          label="Exit"
          accentClass="text-down"
          isEmpty={config.exit_rules.length === 0}
          emptyHint="Add an exit condition"
          onClickEmpty={() => onAddRule("exit_rules")}
        >
          {config.exit_rules.map((r, i) => {
            const isFirst = i === 0;
            const isLast = i === config.exit_rules.length - 1;
            const onRemove = () => onRemoveRule("exit_rules", i);
            if (r.type === "pattern") return <PatternRuleRow key={i} rule={r} onRemove={onRemove} isFirst={isFirst} isLast={isLast} />;
            if (r.type === "gated") return <GatedRuleRow key={i} rule={r} onRemove={onRemove} isFirst={isFirst} isLast={isLast} />;
            return (
              <RuleRow
                key={i}
                rule={r}
                onRemove={onRemove}
                onUpdate={(rule) => onUpdateRule("exit_rules", i, rule)}
                isFirst={isFirst}
                isLast={isLast}
              />
            );
          })}
        </CategoryCard>

        <CategoryCard
          icon={RiskIcon}
          label="Risk"
          accentClass="text-fg"
          isEmpty={!hasRisk}
          emptyHint="Set a stop loss and take profit"
          onClickEmpty={() => onUpdateStopLoss({ value: 2 })}
        >
          {config.stop_loss ? (
            <RiskRow
              label="Stop loss"
              risk={config.stop_loss}
              onUpdate={onUpdateStopLoss}
              onRemove={() => onUpdateStopLoss(null)}
              isFirst
              isLast={false}
            />
          ) : (
            <AddStatRow label="Add stop loss" onAdd={() => onUpdateStopLoss({ value: 2 })} />
          )}
          {config.take_profit ? (
            <RiskRow
              label="Take profit"
              risk={config.take_profit}
              onUpdate={onUpdateTakeProfit}
              onRemove={() => onUpdateTakeProfit(null)}
              isFirst={false}
              isLast
            />
          ) : (
            <AddStatRow label="Add take profit" onAdd={() => onUpdateTakeProfit({ value: 5 })} />
          )}
        </CategoryCard>

        <CategoryCard icon={SizingIcon} label="Scale" accentClass="text-fg" isEmpty={false} emptyHint="">
          <SizingRow sizing={config.position_sizing} onUpdate={onUpdateSizing} onReset={onResetSizing} />
        </CategoryCard>

        <CategoryCard icon={Settings2} label="Preferences" accentClass="text-fg" isEmpty={false} emptyHint="">
          <PreferencesRow
            config={config}
            onUpdateSymbol={onUpdateSymbol}
            onUpdateTimeframe={onUpdateTimeframe}
            onReset={onResetPreferences}
          />
        </CategoryCard>

        <CategoryCard
          icon={CalendarIcon}
          label="Window"
          accentClass="text-fg"
          isEmpty={!windowStart && !windowEnd}
          emptyHint="Set a start and end date for the backtest"
          onClickEmpty={() => onUpdateWindowStart(new Date().toISOString().slice(0, 10))}
        >
          {windowStart ? (
            <WindowRow label="From" value={windowStart} onUpdate={onUpdateWindowStart} onRemove={() => onUpdateWindowStart(null)} isFirst isLast={false} />
          ) : (
            <AddStatRow label="Add start date" onAdd={() => onUpdateWindowStart(new Date().toISOString().slice(0, 10))} />
          )}
          {windowEnd ? (
            <WindowRow label="To" value={windowEnd} onUpdate={onUpdateWindowEnd} onRemove={() => onUpdateWindowEnd(null)} isFirst={false} isLast />
          ) : (
            <AddStatRow label="Add end date" onAdd={() => onUpdateWindowEnd(new Date().toISOString().slice(0, 10))} />
          )}
        </CategoryCard>
      </div>
    </div>
  );
}

export type ChatItem =
  | { id: number; kind: "text"; role: "user" | "assistant"; text: string; done: boolean }
  | { id: number; kind: "config"; role: "assistant"; config: BacktestConfig }
  | { id: number; kind: "action"; role: "assistant"; label: string }
  | { id: number; kind: "confirm"; role: "assistant"; message: string; resolved?: "confirmed" | "cancelled" };

function RunConfirm({
  message,
  resolved,
  onConfirm,
  onCancel,
}: {
  message: string;
  resolved?: "confirmed" | "cancelled";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (resolved) {
    return (
      <div className="px-1 py-1 text-sm text-muted">
        {message} {resolved === "confirmed" ? "Running…" : "Cancelled."}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border/60 bg-panel/50 px-3 py-2.5 text-sm text-fg">
      <div className="mb-2">{message}</div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-on-accent transition-colors hover:bg-accent/80"
        >
          Run anyway
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:text-fg"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ActionBadge({ label }: { label: string }) {
  const isBuild = label.startsWith("Build");
  const Icon = isBuild ? Hammer : Pencil;
  const verb = isBuild ? "Build" : "Edit";
  const rest = label.slice(verb.length);
  return (
    <div className="my-4 flex items-center gap-1.5 pl-5 text-xs font-medium text-muted">
      <Icon size={12} strokeWidth={2.2} />
      <span className="font-extrabold">{verb}</span>
      {rest}
    </div>
  );
}

interface BacktestChatProps {
  config: BacktestConfig;
  onConfigChange: (config: BacktestConfig) => void;
  onRunBacktest: () => void;
  running: boolean;
  canRun: boolean;
  windowStart: string | null;
  windowEnd: string | null;
  onUpdateWindowStart: (v: string | null) => void;
  onUpdateWindowEnd: (v: string | null) => void;
  hasResult: boolean;
  lastResult?: BacktestResult | null;
  chartSymbol: string;
  chartTimeframe: string;
}

export default function BacktestChat({
  config,
  onConfigChange,
  onRunBacktest,
  running,
  canRun,
  windowStart,
  windowEnd,
  onUpdateWindowStart,
  onUpdateWindowEnd,
  hasResult,
  lastResult,
  chartSymbol,
  chartTimeframe,
}: BacktestChatProps) {
  const [messages, setMessages] = useState<ChatItem[]>(() => backtestDraft.messages);
  const [input, setInput] = useState(() => backtestDraft.input);
  const [streaming, setStreaming] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendHover, setSendHover] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessionTitle, setSessionTitle] = useState("New chat");
  const [sessions, setSessions] = useState<BacktestChatSessionSummary[]>([]);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const sendButtonRef = useRef<HTMLButtonElement>(null);
  const rulesChipRef = useRef<HTMLButtonElement>(null);
  const rulesPanelRef = useRef<HTMLDivElement>(null);
  const commandsRef = useRef<HTMLDivElement>(null);
  const sessionsRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(backtestDraft.nextId);
  const configRef = useRef(config);
  configRef.current = config;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleManualRef = useRef(false);
  const isEmpty = messages.length === 0;
  useClickOutside(commandsRef, () => setCommandsOpen(false), commandsOpen);
  useClickOutside(sessionsRef, () => setSessionsOpen(false), sessionsOpen);

  const refreshSessions = () => {
    listBacktestSessions().then(setSessions).catch(() => {});
  };

  useEffect(() => {
    (async () => {
      let id = getCurrentSessionId();
      let session = id ? await getBacktestSession(id).catch(() => null) : null;
      if (!session) {
        session = await createBacktestSession();
        id = session.id;
        setCurrentSessionId(id);
      }
      setSessionId(id);
      setSessionTitle(session.title);
      titleManualRef.current = session.title !== "New chat";
      setMessages(session.messages);
      setInput(session.input);
      onConfigChange(session.config);
      onUpdateWindowStart(session.windowStart);
      onUpdateWindowEnd(session.windowEnd);
      refreshSessions();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    const title =
      !titleManualRef.current && messages.length > 0 ? titleFromSession(configRef.current, messages) : sessionTitle;
    if (title !== sessionTitle) setSessionTitle(title);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveBacktestSession({
        id: sessionId,
        title,
        config: configRef.current,
        messages,
        input,
        windowStart,
        windowEnd,
      })
        .then(refreshSessions)
        .catch(() => {});
    }, 600);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, messages, config, input, windowStart, windowEnd]);

  const startNewSession = async () => {
    setSessionsOpen(false);
    setCommandsOpen(false);
    const session = await createBacktestSession().catch(() => null);
    if (!session) return;
    setCurrentSessionId(session.id);
    setSessionId(session.id);
    setSessionTitle(session.title);
    titleManualRef.current = false;
    setMessages([]);
    setInput("");
    onConfigChange(DEFAULT_BACKTEST_CONFIG);
    onUpdateWindowStart(null);
    onUpdateWindowEnd(null);
    refreshSessions();
  };

  const loadSession = async (id: number) => {
    setSessionsOpen(false);
    if (id === sessionId) return;
    const session = await getBacktestSession(id).catch(() => null);
    if (!session) return;
    setCurrentSessionId(id);
    setSessionId(id);
    setSessionTitle(session.title);
    titleManualRef.current = session.title !== "New chat";
    setMessages(session.messages);
    setInput(session.input);
    onConfigChange(session.config);
    onUpdateWindowStart(session.windowStart);
    onUpdateWindowEnd(session.windowEnd);
  };

  const startEditTitle = () => {
    setTitleDraft(sessionTitle);
    setEditingTitle(true);
  };

  const commitTitle = () => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (!trimmed) return;
    titleManualRef.current = true;
    setSessionTitle(trimmed);
  };

  const deleteSession = async (id: number) => {
    await deleteBacktestSession(id).catch(() => {});
    refreshSessions();
    if (id === sessionId) await startNewSession();
  };

  const runSlashCommand = (cmd: string) => {
    setCommandsOpen(false);
    if (cmd === "/clear") startNewSession();
  };

  useEffect(() => {
    backtestDraft.messages = messages;
    backtestDraft.nextId = nextId.current;
  }, [messages]);

  useEffect(() => {
    backtestDraft.input = input;
  }, [input]);

  const [atBottom, setAtBottom] = useState(true);

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
  };

  useEffect(() => {
    scrollToBottom();
    setAtBottom(true);
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

  const loadStrategy = (ruleSet: StrategyRuleSet, note: StrategyNote) => {
    const toBacktestRules = (rules: StrategyRuleSet["entry_rules"]): (BacktestRule | PatternRule | GatedRule)[] =>
      rules.map((r) =>
        r.type === "comparison"
          ? { type: "comparison" as const, indicator: r.left, comparator: r.comparator, value: r.right }
          : r
      );
    const symbol = note.preferred_symbols?.[0];
    applyHint((config) => ({
      ...config,
      entry_rules: toBacktestRules(ruleSet.entry_rules),
      exit_rules: toBacktestRules(ruleSet.exit_rules),
      symbol: symbol ?? config.symbol,
      timeframe: note.entry_timeframe ?? config.timeframe,
    }));
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

  const addRuleTemplate = (kind: "entry_rules" | "exit_rules") => {
    const template: BacktestRule = { type: "comparison", indicator: "rsi_14", comparator: "<", value: "30" };
    const next = { ...configRef.current, [kind]: [...configRef.current[kind], template] };
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

  const resetSizing = () => {
    const next = { ...configRef.current, position_sizing: DEFAULT_BACKTEST_CONFIG.position_sizing };
    onConfigChange(next);
    upsertConfigCard(next);
  };

  // Stages into the plan only — the chart/backtest data doesn't switch symbol or
  // timeframe until Run is clicked (backtesting/page.tsx's runBacktest fetches fresh
  // candles for whatever's staged here).
  const updateSymbol = (symbol: string) => {
    const next = { ...configRef.current, symbol };
    onConfigChange(next);
    upsertConfigCard(next);
  };

  const updateTimeframe = (timeframe: string) => {
    const next = { ...configRef.current, timeframe };
    onConfigChange(next);
    upsertConfigCard(next);
  };

  const runNow = () => {
    const symbol = configRef.current.symbol;
    const timeframe = configRef.current.timeframe;
    const tfLabel = CHAT_TIMEFRAMES.find((t) => t.id === timeframe)?.label ?? timeframe;
    const alreadySet = symbol === chartSymbol && timeframe === chartTimeframe;
    setMessages((prev) => [
      ...prev,
      {
        id: nextId.current++,
        kind: "text",
        role: "assistant",
        text: alreadySet
          ? "Symbol and timeframe already set correctly — running."
          : `Setting the timeframe to ${tfLabel} and running on ${symbol}.`,
        done: true,
      },
    ]);
    onRunBacktest();
  };

  const handleRun = () => {
    if (!hasResult) {
      runNow();
      return;
    }
    setMessages((prev) => [
      ...prev,
      {
        id: nextId.current++,
        kind: "confirm",
        role: "assistant",
        message: "This will clear your current backtest result. Run anyway?",
      },
    ]);
  };

  const resolveRunConfirm = (id: number, confirmed: boolean) => {
    setMessages((prev) => prev.map((m) => (m.id === id && m.kind === "confirm" ? { ...m, resolved: confirmed ? "confirmed" : "cancelled" } : m)));
    if (confirmed) runNow();
  };

  const resetPreferences = () => {
    const next = {
      ...configRef.current,
      symbol: DEFAULT_BACKTEST_CONFIG.symbol,
      timeframe: DEFAULT_BACKTEST_CONFIG.timeframe,
    };
    onConfigChange(next);
    upsertConfigCard(next);
  };

  const send = async () => {
    const message = input.trim();
    if (!message || streaming) return;
    if (SLASH_COMMANDS.some((c) => c.cmd === message)) {
      setInput("");
      runSlashCommand(message);
      return;
    }
    const history: [string, string][] = messages
      .filter((m): m is Extract<ChatItem, { kind: "text" }> => m.kind === "text" && m.done)
      .map((m) => [m.role, m.text]);
    setInput("");
    setError(null);
    setMessages((prev) => [
      ...prev,
      { id: nextId.current++, kind: "text", role: "user", text: message, done: true },
    ]);
    setStreaming(true);
    setWaiting(true);
    let assistantId: number | null = null;

    const url = await api.backtestChatStreamUrl(
      configRef.current,
      message,
      windowStart,
      windowEnd,
      lastResult,
      history,
    );
    const ws = new WebSocket(url);
    ws.onmessage = (ev) => {
      const msg: BacktestChatEvent = JSON.parse(ev.data);
      setWaiting(false);
      if (msg.type === "action") {
        setMessages((prev) => [...prev, { id: nextId.current++, kind: "action", role: "assistant", label: msg.label }]);
      } else if (msg.type === "token") {
        if (assistantId == null) {
          const id = nextId.current++;
          assistantId = id;
          setMessages((prev) => [...prev, { id, kind: "text", role: "assistant", text: msg.text, done: false }]);
        } else {
          const id = assistantId;
          setMessages((prev) =>
            prev.map((m) => (m.id === id && m.kind === "text" ? { ...m, text: m.text + msg.text } : m)),
          );
        }
      } else if (msg.type === "window") {
        if (msg.start) onUpdateWindowStart(msg.start);
        if (msg.end) onUpdateWindowEnd(msg.end);
      } else if (msg.type === "config") {
        onConfigChange(msg.config);
        upsertConfigCard(msg.config);
      } else if (msg.type === "done") {
        setStreaming(false);
        const id = assistantId;
        if (id != null) {
          setMessages((prev) => prev.map((m) => (m.id === id && m.kind === "text" ? { ...m, done: true } : m)));
        }
      } else if (msg.type === "error") {
        setError(msg.detail);
        setStreaming(false);
      }
    };
    ws.onerror = () => {
      setError("Connection lost.");
      setWaiting(false);
    };
    ws.onclose = () => {
      setStreaming(false);
      setWaiting(false);
    };
  };

  const inputRow = (
    <div className="w-full shrink-0 px-4 py-3">
      <div className="mx-auto flex w-full max-w-2xl flex-col rounded-2xl border border-border bg-field focus-within:border-violet-400">
        <div className={`relative pl-[18px] pr-3 pt-3 ${isEmpty ? "pb-1" : "pb-0"}`}>
          {isEmpty && !input && (
            <div className="pointer-events-none absolute left-[18px] top-3 right-4 h-5 overflow-hidden">
              <div key={placeholderIndex} className="animate-fade-in-up text-sm text-muted">
                {PLACEHOLDER_PROMPTS[placeholderIndex]}
              </div>
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              const value = e.target.value;
              setInput(value);
              setCommandsOpen(value.startsWith("/") && !value.includes(" "));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={isEmpty ? "" : "Describe your strategy"}
            rows={1}
            className="chat-scroll max-h-40 min-h-[1.75rem] pr-2 w-full resize-none overflow-y-auto bg-transparent text-sm text-fg outline-none placeholder:text-muted"
          />
        </div>
        <div className="flex items-center justify-between px-3 pb-3">
          <div className="flex items-center gap-1.5">
            <LoadStrategyMenu onLoad={loadStrategy} />
            <div ref={commandsRef} className="relative">
              <button
                type="button"
                onClick={() => setCommandsOpen((v) => !v)}
                aria-label="Chat commands"
                className="flex shrink-0 items-center justify-center rounded-full bg-field p-1.5 text-muted transition-colors hover:bg-fg/10 hover:text-fg"
              >
                <SlashSquare size={15} strokeWidth={2} />
              </button>
              {commandsOpen && (
                <div className="absolute bottom-full left-0 z-20 mb-2 w-56 rounded-md border border-border bg-panel py-1 shadow-lg">
                  {SLASH_COMMANDS.filter((c) => !input.startsWith("/") || c.cmd.startsWith(input)).map((c) => (
                    <button
                      key={c.cmd}
                      type="button"
                      onClick={() => runSlashCommand(c.cmd)}
                      className="flex w-full flex-col items-start px-3 py-1.5 text-left transition-colors hover:bg-violet-500/10"
                    >
                      <span className="font-mono text-xs text-fg">{c.cmd}</span>
                      <span className="truncate text-[10px] text-muted">{c.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
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

  const sessionsMenu = (
    <div ref={sessionsRef} className="relative">
      <button
        type="button"
        onClick={() => setSessionsOpen((v) => !v)}
        aria-label="Chat sessions"
        className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-fg"
      >
        <History size={13} strokeWidth={2} />
        Sessions
      </button>
      {sessionsOpen && (
        <div className="absolute right-0 top-full z-30 mt-1 max-h-72 w-64 overflow-y-auto rounded-md border border-border bg-panel py-1 shadow-lg">
          <button
            type="button"
            onClick={startNewSession}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-accent transition-colors hover:bg-violet-500/10"
          >
            <Plus size={12} strokeWidth={2.2} />
            New chat
          </button>
          {sessions.length > 0 && <div className="my-1 border-t border-border" />}
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`group flex items-center gap-1 ${s.id === sessionId ? "bg-violet-500/10" : ""}`}
            >
              <button
                type="button"
                onClick={() => loadSession(s.id)}
                className="min-w-0 flex-1 truncate px-3 py-1.5 text-left text-xs text-fg transition-colors hover:text-accent"
              >
                {s.title}
              </button>
              <button
                type="button"
                onClick={() => deleteSession(s.id)}
                aria-label={`Delete ${s.title}`}
                className="mr-1 shrink-0 rounded p-1 text-muted opacity-0 transition-opacity hover:text-down group-hover:opacity-100"
              >
                <Trash2 size={11} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const titleBar = editingTitle ? (
    <input
      autoFocus
      value={titleDraft}
      onChange={(e) => setTitleDraft(e.target.value)}
      onBlur={commitTitle}
      onKeyDown={(e) => {
        if (e.key === "Enter") commitTitle();
        if (e.key === "Escape") setEditingTitle(false);
      }}
      className="w-40 rounded border border-violet-400 bg-field px-1.5 py-0.5 text-xs font-medium text-fg outline-none"
    />
  ) : (
    <button
      type="button"
      onClick={startEditTitle}
      title="Rename chat"
      className="min-w-0 truncate rounded px-1.5 py-0.5 text-xs font-medium text-muted transition-colors hover:bg-fg/10 hover:text-fg"
    >
      {sessionTitle}
    </button>
  );

  if (isEmpty) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center justify-between px-4 pt-3">
          {titleBar}
          {sessionsMenu}
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-4">
          {error && (
            <div className="mx-4 rounded-md border border-down/40 bg-down/10 px-3 py-2 text-sm text-down">{error}</div>
          )}
          <h2 className="text-2xl font-normal text-fg">Describe your strategy</h2>
          {inputRow}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        {titleBar}
        {sessionsMenu}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-[41px] z-10 h-6 bg-gradient-to-b from-panel to-transparent" />
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="chat-scroll flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-4 pb-32 pt-6"
      >
        {error && (
          <div className="rounded-md border border-down/40 bg-down/10 px-3 py-2 text-sm text-down">{error}</div>
        )}
        {messages.map((m, idx) => {
          const afterUser = idx > 0 && messages[idx - 1].role === "user" && m.role === "assistant";
          const extraSpace = m.kind === "text" && m.role === "user" ? "my-4" : afterUser ? "mt-4" : "";
          return (
            <div key={m.id} className={extraSpace || undefined}>
              {m.kind === "config" ? (
                <ConfigSummaryCard
                  config={m.config}
                  onRemoveRule={removeRule}
                  onUpdateRule={updateRule}
                  onRename={renameStrategy}
                  onRun={handleRun}
                  running={running}
                  canRun={canRun}
                  onUpdateStopLoss={updateStopLoss}
                  onUpdateTakeProfit={updateTakeProfit}
                  onUpdateSizing={updateSizing}
                  onResetSizing={resetSizing}
                  onUpdateSymbol={updateSymbol}
                  onUpdateTimeframe={updateTimeframe}
                  onResetPreferences={resetPreferences}
                  windowStart={windowStart}
                  windowEnd={windowEnd}
                  onUpdateWindowStart={onUpdateWindowStart}
                  onUpdateWindowEnd={onUpdateWindowEnd}
                  onAddRule={addRuleTemplate}
                />
              ) : m.kind === "action" ? (
                <ActionBadge label={m.label} />
              ) : m.kind === "confirm" ? (
                <RunConfirm message={m.message} resolved={m.resolved} onConfirm={() => resolveRunConfirm(m.id, true)} onCancel={() => resolveRunConfirm(m.id, false)} />
              ) : (
                <div
                  className={
                    m.role === "user"
                      ? "ml-auto max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-accent/20 px-3 py-2 text-sm text-fg"
                      : "whitespace-pre-wrap px-2 py-0.5 text-sm text-fg"
                  }
                >
                  {m.text ? m.text : !m.done ? <TypingIndicator /> : null}
                </div>
              )}
            </div>
          );
        })}
        {waiting && <TypingIndicator />}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-gradient-to-t from-panel to-transparent" />
      {!atBottom && (
        <ScrollToBottomButton onClick={scrollToBottom} className="absolute bottom-24 left-1/2 z-20 -translate-x-1/2" />
      )}
      <div className="absolute inset-x-0 bottom-0 z-20">{inputRow}</div>
    </div>
  );
}
