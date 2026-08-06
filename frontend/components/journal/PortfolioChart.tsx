"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { PortfolioPoint } from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";
import { CHART_PALETTES } from "@/lib/chartTheme";

const PERIODS = ["1D", "1W", "1M", "3M", "1A", "all"] as const;
export type Period = (typeof PERIODS)[number];

interface PortfolioChartProps {
  points: PortfolioPoint[];
  baseValue: number;
  period: Period;
  onPeriodChange: (p: Period) => void;
  loading?: boolean;
}

const fmtUsd = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export default function PortfolioChart({
  points,
  baseValue,
  period,
  onPeriodChange,
  loading,
}: PortfolioChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const [periodOpen, setPeriodOpen] = useState(false);
  const { theme } = useTheme();
  const palette = CHART_PALETTES[theme];

  const geom = useMemo(() => {
    if (points.length < 2) return null;
    const W = 1000;
    const H = 260;
    const padY = 16;
    const eqs = points.map((p) => p.equity);
    const min = Math.min(...eqs, baseValue || Infinity);
    const max = Math.max(...eqs, baseValue || -Infinity);
    const span = max - min || 1;
    const x = (i: number) => (i / (points.length - 1)) * W;
    const y = (v: number) => padY + (1 - (v - min) / span) * (H - 2 * padY);
    const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.equity).toFixed(1)}`).join(" ");
    const area = `${line} L${W},${H} L0,${H} Z`;
    const baseY = baseValue ? y(baseValue) : null;
    return { W, H, x, y, line, area, baseY };
  }, [points, baseValue]);

  const last = points[points.length - 1];
  const first = points[0];
  const active = hover != null ? points[hover] : last;
  const start = baseValue || first?.equity || 0;
  const change = active ? active.equity - start : 0;
  const changePct = start ? (change / start) * 100 : 0;
  const up = change >= 0;
  const stroke = up ? palette.up : palette.down;

  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-muted">Total Value</h2>
          <div className="mt-1 text-3xl font-normal tabular-nums text-fg">
            {active ? fmtUsd(active.equity) : "—"}
          </div>
          <div className={`text-sm font-semibold tabular-nums ${up ? "text-up" : "text-down"}`}>
            {up ? "+" : ""}
            {fmtUsd(change)} ({up ? "+" : ""}
            {changePct.toFixed(2)}%){" "}
            <span className="text-muted font-normal">
              {active ? new Date(active.time * 1000).toLocaleString() : ""}
            </span>
          </div>
        </div>
        <div className="relative sm:hidden">
          <button
            type="button"
            onClick={() => setPeriodOpen((o) => !o)}
            onBlur={() => setTimeout(() => setPeriodOpen(false), 150)}
            className={`flex items-center gap-1 rounded border bg-field px-2.5 py-1.5 text-xs font-medium text-fg transition-colors outline-none ${
              periodOpen ? "border-accent" : "border-border"
            }`}
          >
            {period === "1A" ? "1Y" : period === "all" ? "All" : period}
            <ChevronDown size={12} strokeWidth={2} className="opacity-70" />
          </button>
          {periodOpen && (
            <div className="absolute right-0 top-full z-30 mt-1 w-20 rounded-md border border-border bg-panel py-1 shadow-lg">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onPeriodChange(p);
                    setPeriodOpen(false);
                  }}
                  className={`flex w-full items-center px-3 py-1.5 text-xs transition-colors ${
                    period === p ? "bg-accent/20 text-fg" : "text-muted hover:bg-accent/10 hover:text-fg"
                  }`}
                >
                  {p === "1A" ? "1Y" : p === "all" ? "All" : p}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="hidden gap-1 sm:flex">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => onPeriodChange(p)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                period === p ? "bg-accent text-on-accent" : "bg-border text-muted hover:bg-accent/30"
              }`}
            >
              {p === "1A" ? "1Y" : p === "all" ? "All" : p}
            </button>
          ))}
        </div>
      </div>

      <div className="relative h-[260px] w-full">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : !geom ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            Not enough history to chart yet.
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${geom.W} ${geom.H}`}
            preserveAspectRatio="none"
            className="h-full w-full"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = (e.clientX - rect.left) / rect.width;
              setHover(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))));
            }}
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id="pfFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
                <stop offset="100%" stopColor={stroke} stopOpacity="0" />
              </linearGradient>
            </defs>
            {geom.baseY != null && (
              <line
                x1="0"
                y1={geom.baseY}
                x2={geom.W}
                y2={geom.baseY}
                stroke={palette.muted}
                strokeWidth="1"
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
                opacity="0.5"
              />
            )}
            <path d={geom.area} fill="url(#pfFill)" />
            <path d={geom.line} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            {hover != null && (
              <line
                x1={geom.x(hover)}
                y1="0"
                x2={geom.x(hover)}
                y2={geom.H}
                stroke={palette.muted}
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                opacity="0.6"
              />
            )}
            {active && (
              <circle
                cx={geom.x(hover ?? points.length - 1)}
                cy={geom.y(active.equity)}
                r="3.5"
                fill={stroke}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
        )}
      </div>
    </div>
  );
}
