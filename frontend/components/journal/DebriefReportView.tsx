"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { api, Candle, DebriefReport, ZoomRange } from "@/lib/api";
import DebriefChat from "./DebriefChat";

const Chart = dynamic(() => import("@/components/Chart"), { ssr: false });

const ANALYST_NAME = "uWick";

interface DebriefReportViewProps {
  report: DebriefReport;
  onClose: () => void;
  onSpotlight: (selector: string | null) => void;
}

/** Navigable viewer for a completed (or in-progress) background DebriefReport:
 * one step per trade, whiteboard synced to whichever step is focused, plus a
 * persisted follow-up chat once the report is ready. */
export default function DebriefReportView({ report, onClose, onSpotlight }: DebriefReportViewProps) {
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
    return (
      <div className="fixed bottom-4 right-4 top-20 z-30 flex w-[720px] max-w-[calc(100vw-2rem)] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-panel shadow-2xl animate-fade-in-up">
        <div className="text-sm text-fg">Your debrief is cooking…</div>
        <div className="text-xs text-muted">
          {report.current_step}/{report.total_steps ?? "?"} trades reviewed
          {eta != null && ` — about ${eta} min left`}
        </div>
        <button onClick={onClose} className="mt-2 text-xs text-muted hover:text-fg">
          Close
        </button>
      </div>
    );
  }

  const visibleRange: ZoomRange | null = step?.zoom ? { from: step.zoom.from, to: step.zoom.to } : null;
  const annotations = report.steps.slice(0, index + 1).flatMap((s) => s.annotations);

  return (
    <div className="fixed bottom-4 right-4 top-20 z-30 flex w-[720px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-2xl animate-fade-in-up">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-fg">{ANALYST_NAME} — debrief report</div>
          <div className="text-[10px] text-muted">
            {new Date(report.window_start).toLocaleDateString()} – {new Date(report.window_end).toLocaleDateString()}
          </div>
        </div>
        <button onClick={onClose} className="rounded p-1 text-muted transition-colors hover:bg-border hover:text-fg">
          ✕
        </button>
      </div>

      <div className="h-[360px] shrink-0 border-b border-border">
        {candles.length > 0 ? (
          <Chart candles={candles} annotations={annotations} symbol={symbol} visibleRange={visibleRange} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">No chart for this window.</div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <button
          onClick={() => setIndex((i) => Math.max(i - 1, 0))}
          disabled={index === 0}
          className="rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-border hover:text-fg disabled:opacity-30"
        >
          ← Prev
        </button>
        <div className="text-xs text-muted">
          Step {index + 1} of {report.steps.length}
        </div>
        <button
          onClick={() => setIndex((i) => Math.min(i + 1, report.steps.length - 1))}
          disabled={index === report.steps.length - 1}
          className="rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-border hover:text-fg disabled:opacity-30"
        >
          Next →
        </button>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3">
        <p className="whitespace-pre-wrap text-sm text-fg">{step?.narrative}</p>
        {step?.note_quote && (
          <div className="mt-3 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2.5">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-accent">
              Your note — trade #{step.note_quote.trade_id}
            </div>
            <p className="whitespace-pre-wrap text-sm italic text-fg/90">{step.note_quote.text}</p>
          </div>
        )}
        {step?.spotlight?.message && (
          <div className="mt-3 text-xs italic text-muted">{step.spotlight.message}</div>
        )}
      </div>

      {report.status === "ready" && (
        <div className="max-h-[240px] shrink-0 border-t border-border">
          <DebriefChat reportId={report.id} />
        </div>
      )}
    </div>
  );
}
