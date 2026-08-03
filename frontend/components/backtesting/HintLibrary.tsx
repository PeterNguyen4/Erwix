"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, WeightTilde, ShieldAlert, SquareArrowLeft, SquareArrowRight } from "lucide-react";
import type { BacktestConfig, BacktestRisk, BacktestRule, BacktestSizing } from "@/lib/api";

export const CATEGORY_ICONS = {
  entry: SquareArrowRight,
  exit: SquareArrowLeft,
  risk: ShieldAlert,
  sizing: WeightTilde,
} as const;

const SUBMENU_WIDTH = 224; // w-56

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

const rowClass = (active: boolean) =>
  `flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
    active ? "bg-violet-500/20 text-fg" : "text-muted hover:bg-violet-500/10 hover:text-fg"
  }`;

type CategoryId = "entry" | "exit" | "risk" | "sizing";

function CategoryRow({
  id,
  label,
  openId,
  setOpenId,
  flip,
  snippets,
  onApply,
}: {
  id: CategoryId;
  label: string;
  openId: CategoryId | null;
  setOpenId: (id: CategoryId | null) => void;
  flip: boolean;
  snippets: HintSnippet[];
  onApply: (apply: HintSnippet["apply"]) => void;
}) {
  const open = openId === id;
  const Icon = CATEGORY_ICONS[id];

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpenId(open ? null : id)} className={rowClass(open)}>
        {flip && <ChevronRight size={12} strokeWidth={2.2} className="rotate-180 opacity-70" />}
        <Icon size={13} strokeWidth={2} className="shrink-0 opacity-80" />
        <span className="flex-1 text-left">{label}</span>
        {!flip && <ChevronRight size={12} strokeWidth={2.2} className="opacity-70" />}
      </button>
      {open && (
        <div
          onClick={() => setOpenId(id)}
          className={`absolute -top-1.5 z-20 w-56 rounded-md border border-border bg-panel py-1 shadow-lg ${
            flip ? "right-full mr-0.5" : "left-full ml-0.5"
          }`}
        >
          {snippets.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => onApply(s.apply)}
              className="block w-full px-3 py-1.5 text-left transition-colors hover:bg-violet-500/10"
            >
              <div className="text-xs text-fg">{s.label}</div>
              <div className="text-[10px] text-muted">{s.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface HintLibraryProps {
  onApply: (updater: (config: BacktestConfig) => BacktestConfig) => void;
}

export default function HintLibrary({ onApply }: HintLibraryProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [openId, setOpenId] = useState<CategoryId | null>(null);
  const [flip, setFlip] = useState(false);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    setFlip(rect.right + SUBMENU_WIDTH + 8 > window.innerWidth);
  }, []);

  const handleApply = (apply: HintSnippet["apply"]) => {
    onApply(apply);
    setOpenId(null);
  };

  return (
    <div ref={menuRef} className="py-1">
      <CategoryRow
        id="entry"
        label="Entry Criteria"
        openId={openId}
        setOpenId={setOpenId}
        flip={flip}
        snippets={ENTRY_SNIPPETS}
        onApply={handleApply}
      />
      <CategoryRow
        id="exit"
        label="Exit Criteria"
        openId={openId}
        setOpenId={setOpenId}
        flip={flip}
        snippets={EXIT_SNIPPETS}
        onApply={handleApply}
      />
      <CategoryRow
        id="risk"
        label="Risk Management"
        openId={openId}
        setOpenId={setOpenId}
        flip={flip}
        snippets={RISK_SNIPPETS}
        onApply={handleApply}
      />
      <CategoryRow
        id="sizing"
        label="Position Sizing"
        openId={openId}
        setOpenId={setOpenId}
        flip={flip}
        snippets={SIZING_SNIPPETS}
        onApply={handleApply}
      />
    </div>
  );
}
