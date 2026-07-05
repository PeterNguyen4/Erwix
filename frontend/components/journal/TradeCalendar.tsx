"use client";

import { useMemo, useState } from "react";
import { PortfolioPoint } from "@/lib/api";

const fmtUsd = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/**
 * Monthly calendar that colors each day green/red by the day-over-day change in
 * portfolio equity derived from the equity-curve points. Trade activity is not
 * P/L-bearing on its own (fills carry no realized P/L yet), so equity delta is
 * the closest proxy available in Phase 1.
 */
export default function TradeCalendar({ points }: { points: PortfolioPoint[] }) {
  const [monthOffset, setMonthOffset] = useState(0);

  // Map of dayKey -> day P/L (close-over-previous-close).
  const dailyPl = useMemo(() => {
    const closes = new Map<string, { equity: number; time: number }>();
    for (const p of points) {
      const d = new Date(p.time * 1000);
      const k = dayKey(d);
      const prev = closes.get(k);
      if (!prev || p.time >= prev.time) closes.set(k, { equity: p.equity, time: p.time });
    }
    const ordered = [...closes.entries()].sort((a, b) => a[1].time - b[1].time);
    const pl = new Map<string, number>();
    for (let i = 1; i < ordered.length; i++) {
      pl.set(ordered[i][0], ordered[i][1].equity - ordered[i - 1][1].equity);
    }
    return pl;
  }, [points]);

  const view = useMemo(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const label = first.toLocaleString("en-US", { month: "long", year: "numeric" });
    const startWeekday = first.getDay();
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(first.getFullYear(), first.getMonth(), d));
    return { label, cells };
  }, [monthOffset]);

  const todayKey = dayKey(new Date());

  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Calendar</h2>
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => setMonthOffset((m) => m - 1)}
            className="rounded bg-border px-2 py-0.5 text-muted hover:bg-accent/30"
          >
            ‹
          </button>
          <span className="w-32 text-center font-medium text-white">{view.label}</span>
          <button
            onClick={() => setMonthOffset((m) => Math.min(0, m + 1))}
            disabled={monthOffset >= 0}
            className="rounded bg-border px-2 py-0.5 text-muted enabled:hover:bg-accent/30 disabled:opacity-40"
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {view.cells.map((cell, i) => {
          if (!cell) return <div key={i} />;
          const k = dayKey(cell);
          const pl = dailyPl.get(k);
          const hasData = pl != null && Math.abs(pl) > 0.005;
          const up = (pl ?? 0) >= 0;
          const isToday = k === todayKey;
          return (
            <div
              key={i}
              title={hasData ? `${up ? "+" : ""}${fmtUsd(pl!)}` : undefined}
              className={`flex aspect-square flex-col items-center justify-center rounded text-xs tabular-nums ${
                hasData
                  ? up
                    ? "bg-up/20 text-up"
                    : "bg-down/20 text-down"
                  : "bg-border/40 text-muted"
              } ${isToday ? "ring-1 ring-accent" : ""}`}
            >
              <span>{cell.getDate()}</span>
              {hasData && (
                <span className="text-[9px] leading-none">
                  {up ? "+" : ""}
                  {fmtUsd(pl!)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
