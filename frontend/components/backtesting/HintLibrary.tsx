"use client";

import type { BacktestConfig, BacktestRisk, BacktestRule, BacktestSizing } from "@/lib/api";

interface HintSnippet {
  label: string;
  description: string;
  apply: (config: BacktestConfig) => BacktestConfig;
}

const ENTRY_SNIPPETS: HintSnippet[] = [
  {
    label: "RSI oversold entry",
    description: "Enter when RSI(14) drops below 30",
    apply: (config) => addRule(config, "entry_rules", { indicator: "rsi_14", comparator: "<", value: 30 }),
  },
  {
    label: "Price crosses above SMA 50",
    description: "Enter when close crosses above the 50-period SMA",
    apply: (config) => addRule(config, "entry_rules", { indicator: "sma_50", comparator: "crosses_above", value: 0 }),
  },
  {
    label: "MACD turns positive",
    description: "Enter when MACD line crosses above 0",
    apply: (config) => addRule(config, "entry_rules", { indicator: "macd", comparator: "crosses_above", value: 0 }),
  },
];

const EXIT_SNIPPETS: HintSnippet[] = [
  {
    label: "RSI overbought exit",
    description: "Exit when RSI(14) rises above 70",
    apply: (config) => addRule(config, "exit_rules", { indicator: "rsi_14", comparator: ">", value: 70 }),
  },
  {
    label: "Price crosses below SMA 50",
    description: "Exit when close crosses below the 50-period SMA",
    apply: (config) => addRule(config, "exit_rules", { indicator: "sma_50", comparator: "crosses_below", value: 0 }),
  },
];

const RISK_SNIPPETS: HintSnippet[] = [
  {
    label: "Fixed 2% stop loss",
    description: "Close the position if it moves 2% against entry",
    apply: (config) => ({ ...config, stop_loss: { value: 2 } as BacktestRisk }),
  },
  {
    label: "Fixed 5% take profit",
    description: "Close the position once it's up 5% from entry",
    apply: (config) => ({ ...config, take_profit: { value: 5 } as BacktestRisk }),
  },
];

const SIZING_SNIPPETS: HintSnippet[] = [
  {
    label: "1 share fixed size",
    description: "Always trade exactly 1 share",
    apply: (config) => ({ ...config, position_sizing: { mode: "fixed_qty", value: 1 } as BacktestSizing }),
  },
  {
    label: "10% of equity per trade",
    description: "Size each position at 10% of current equity",
    apply: (config) => ({ ...config, position_sizing: { mode: "pct_equity", value: 10 } as BacktestSizing }),
  },
];

function addRule(
  config: BacktestConfig,
  key: "entry_rules" | "exit_rules",
  rule: BacktestRule,
): BacktestConfig {
  return { ...config, [key]: [...config[key], rule] };
}

function Section({
  title,
  snippets,
  onApply,
}: {
  title: string;
  snippets: HintSnippet[];
  onApply: (apply: HintSnippet["apply"]) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{title}</div>
      <div className="space-y-1.5">
        {snippets.map((s) => (
          <button
            key={s.label}
            onClick={() => onApply(s.apply)}
            title={s.description}
            className="block w-full rounded-md border border-border px-2.5 py-1.5 text-left text-xs text-fg transition-colors hover:border-violet-400 hover:bg-violet-500/10"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface HintLibraryProps {
  onApply: (updater: (config: BacktestConfig) => BacktestConfig) => void;
}

export default function HintLibrary({ onApply }: HintLibraryProps) {
  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-3">
      <Section title="Entry criteria" snippets={ENTRY_SNIPPETS} onApply={onApply} />
      <Section title="Exit criteria" snippets={EXIT_SNIPPETS} onApply={onApply} />
      <Section title="Risk management" snippets={RISK_SNIPPETS} onApply={onApply} />
      <Section title="Position sizing" snippets={SIZING_SNIPPETS} onApply={onApply} />
    </div>
  );
}
