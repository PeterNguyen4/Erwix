"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { api, Candle, DebriefReport, ZoomRange } from "@/lib/api";
import DebriefChat from "./DebriefChat";

const Chart = dynamic(() => import("@/components/Chart"), { ssr: false });

interface DebriefReportViewProps {
  report: DebriefReport;
  onClose: () => void;
  onSpotlight: (selector: string | null) => void;
  variant?: "popup" | "panel";
}

export default function DebriefReportView({ report, onClose, onSpotlight, variant = "popup" }: DebriefReportViewProps) {
  const [index, setIndex] = useState(0);
  const [candles, setCandles] = useState<Candle[]>([]);
  const step = report.steps[index];
  const symbol = report.symbol ?? "";

  useEffect(() => {
    if (symbol) api.candles(symbol).then(setCandles).catch(() => {});
  }, [symbol]);

  useEffect(() => {
    if (step?.spotlight) onSpotlight(step.spotlight.selector);
    return () => onSpotlight(null);
  }, [step, onSpotlight]);

  if (report.status !== "ready" && report.steps.length === 0) {
    const eta = report.eta_seconds != null ? Math.ceil(report.eta_seconds / 60) : null;
    const cookingCard = (
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <Loader2 size={20} className="animate-spin text-violet-400" />
        <div className="text-sm text-fg">Your debrief is cooking…</div>
        <div className="text-xs text-muted">
          {report.current_step}/{report.total_steps ?? "?"} trades reviewed
          {eta != null && ` — about ${eta} min left`}
        </div>
        <button onClick={onClose} className="mt-2 text-xs text-muted hover:text-fg">
          {variant === "panel" ? "Back to journal" : "Close"}
        </button>
      </div>
    );
    if (variant === "panel") {
      return <div className="flex h-full flex-col overflow-hidden">{cookingCard}</div>;
    }
    return (
      <div className="fixed bottom-4 right-4 top-20 z-30 flex w-[720px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-2xl animate-fade-in-up">
        {cookingCard}
      </div>
    );
  }

  const visibleRange: ZoomRange | null = step?.zoom ? { from: step.zoom.from, to: step.zoom.to } : null;
  const annotations = report.steps.slice(0, index + 1).flatMap((s) => s.annotations);

  const stepNav = (
    <div className="flex shrink-0 items-center gap-2">
      <button
        onClick={() => setIndex((i) => Math.max(i - 1, 0))}
        disabled={index === 0}
        aria-label="Previous trade"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-violet-500/20 hover:text-fg disabled:pointer-events-none disabled:opacity-30"
      >
        <ChevronLeft size={14} strokeWidth={2.25} />
      </button>

      <div
        className="h-1 w-20 overflow-hidden rounded-full bg-border/60"
        title={`${index + 1} / ${report.steps.length}`}
      >
        <div
          className="h-full rounded-full bg-violet-400 transition-all"
          style={{ width: `${((index + 1) / report.steps.length) * 100}%` }}
        />
      </div>

      <button
        onClick={() => setIndex((i) => Math.min(i + 1, report.steps.length - 1))}
        disabled={index === report.steps.length - 1}
        aria-label="Next trade"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-violet-500/20 hover:text-fg disabled:pointer-events-none disabled:opacity-30"
      >
        <ChevronRight size={14} strokeWidth={2.25} />
      </button>
    </div>
  );

  const navHeader = (
    <div className="relative flex shrink-0 items-center justify-between border-b border-border pl-4 pr-2.5 py-3">
      <div className="flex shrink-0 items-center gap-3">
        {variant === "panel" && (
          <button onClick={onClose} title="Back to journal" className="rounded p-1 text-muted transition-colors hover:bg-border hover:text-fg">
            <ArrowLeft size={16} strokeWidth={2} />
          </button>
        )}
        <div className="text-sm font-normal text-fg">
          {new Date(report.window_start).toLocaleDateString("en-US", { month: "short", day: "numeric" })} –{" "}
          {new Date(report.window_end).toLocaleDateString("en-US", { month: "short", day: "numeric" })} Report
        </div>
      </div>

      {variant !== "panel" && <div className="absolute left-1/2 -translate-x-1/2">{stepNav}</div>}

      {variant !== "panel" && (
        <button onClick={onClose} className="shrink-0 rounded p-1 text-muted transition-colors hover:bg-border hover:text-fg">
          <X size={16} strokeWidth={2} />
        </button>
      )}
    </div>
  );

  const narrative = (
    <>
      <p className="whitespace-pre-wrap text-sm text-fg">{step?.narrative}</p>
      {step?.note_quote && (
        <div className="mt-3 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2.5">
          <div className="mb-1 text-[10px] font-semibold tracking-wide text-accent">
            Your Note — Trade #{step.note_quote.trade_id}
          </div>
          <p className="whitespace-pre-wrap text-sm italic text-fg/90">{step.note_quote.text}</p>
        </div>
      )}
      {step?.spotlight?.message && (
        <div className="mt-3 text-xs italic text-muted">{step.spotlight.message}</div>
      )}
    </>
  );

  const chartPane = candles.length > 0 ? (
    <Chart candles={candles} annotations={annotations} symbol={symbol} visibleRange={visibleRange} infoOverlay />
  ) : (
    <div className="flex h-full items-center justify-center text-xs text-muted">No chart for this window.</div>
  );

  if (variant === "panel") {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        {navHeader}
        <div className="grid flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-2 lg:overflow-hidden">
          <div className="flex min-h-[420px] flex-col overflow-hidden rounded-lg border border-border bg-panel lg:min-h-0">
            {report.status === "ready" ? (
              <DebriefChat reportId={report.id} />
            ) : (
              <div className="flex flex-1 items-center justify-center px-4 text-center text-xs text-muted">
                Chat unlocks once this debrief finishes generating.
              </div>
            )}
          </div>

          <div className="flex min-h-[420px] flex-col overflow-hidden rounded-lg border border-border bg-panel lg:min-h-0">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
              <span className="text-xs font-medium text-muted">
                Trade {index + 1} of {report.steps.length}
              </span>
              {stepNav}
            </div>
            <div className="shrink-0 px-4 py-3">{narrative}</div>
            <div className="min-h-[280px] flex-1 border-t border-border">{chartPane}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 top-4 z-30 flex w-[720px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-2xl animate-fade-in-up">
      {navHeader}

      <div className="h-[360px] shrink-0 border-b border-border">{chartPane}</div>

      <div className="flex-1 overflow-auto px-4 py-3">{narrative}</div>

      {report.status === "ready" && (
        <div className="max-h-[240px] shrink-0">
          <DebriefChat reportId={report.id} />
        </div>
      )}
    </div>
  );
}
