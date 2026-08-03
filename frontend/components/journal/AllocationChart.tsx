"use client";

import { useMemo } from "react";
import { Position } from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";
import { CHART_PALETTES } from "@/lib/chartTheme";

// Categorical palette tuned for the dark panel bg. Cash is always the last, muted slice.
const PALETTE = ["#3b82f6", "#26a69a", "#a855f7", "#f59e0b", "#ec4899", "#14b8a6", "#f97316", "#6366f1"];
const CASH_COLOR = "#4b5563";

const fmtUsd = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });

interface Slice {
  label: string;
  value: number;
  color: string;
}

export default function AllocationChart({
  positions,
  cash,
  loading,
}: {
  positions: Position[];
  cash: number;
  loading?: boolean;
}) {
  const { theme } = useTheme();
  const palette = CHART_PALETTES[theme];
  const { slices, total } = useMemo(() => {
    const sorted = [...positions]
      .filter((p) => p.market_value > 0)
      .sort((a, b) => b.market_value - a.market_value);
    const s: Slice[] = sorted.map((p, i) => ({
      label: p.symbol,
      value: p.market_value,
      color: PALETTE[i % PALETTE.length],
    }));
    if (cash > 0) s.push({ label: "Cash", value: cash, color: CASH_COLOR });
    const t = s.reduce((acc, x) => acc + x.value, 0);
    return { slices: s, total: t };
  }, [positions, cash]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-panel p-4">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted">Allocation</h2>
        <div className="flex items-center gap-4">
          <div className="h-32 w-32 shrink-0 animate-pulse rounded-full bg-border/40" />
          <div className="flex-1 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-3 w-full animate-pulse rounded bg-border/40" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (total <= 0) {
    return (
      <div className="rounded-lg border border-border bg-panel p-4">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted">Allocation</h2>
        <p className="py-8 text-center text-xs text-muted">No holdings to allocate yet.</p>
      </div>
    );
  }

  // Build donut arcs.
  const R = 42;
  const CX = 50;
  const CY = 50;
  const STROKE = 14;
  const circ = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted">Allocation</h2>
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 100 100" className="h-32 w-32 shrink-0 -rotate-90">
          {slices.map((s) => {
            const frac = s.value / total;
            const dash = frac * circ;
            const el = (
              <circle
                key={s.label}
                cx={CX}
                cy={CY}
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth={STROKE}
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return el;
          })}
          <circle cx={CX} cy={CY} r={R - STROKE / 2 - 2} fill={palette.panel} />
        </svg>
        <div className="flex-1 space-y-1.5 overflow-hidden">
          {slices.slice(0, 6).map((s) => (
            <div key={s.label} className="flex items-center gap-2 text-xs">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
              <span className="font-medium text-fg">{s.label}</span>
              <span className="ml-auto tabular-nums text-muted">
                {((s.value / total) * 100).toFixed(1)}%
              </span>
              <span className="w-16 text-right tabular-nums text-muted">{fmtUsd(s.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
