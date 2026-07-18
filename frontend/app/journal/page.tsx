"use client";

import { useEffect, useState } from "react";
import { api, DebriefRequest, PortfolioHistory } from "@/lib/api";
import TradeCalendar from "@/components/journal/TradeCalendar";
import JournalEntries from "@/components/journal/JournalEntries";
import AnalystDebrief from "@/components/journal/AnalystDebrief";
import DebriefReportView from "@/components/journal/DebriefReportView";
import DebriefScheduleSettings from "@/components/journal/DebriefScheduleSettings";
import SpotlightOverlay from "@/components/journal/SpotlightOverlay";
import { useDebriefReport } from "@/lib/useDebriefReport";

export default function JournalPage() {
  const [history, setHistory] = useState<PortfolioHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spotlight, setSpotlight] = useState<string | null>(null);
  const [debriefRequest, setDebriefRequest] = useState<DebriefRequest | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const { report, refresh } = useDebriefReport();

  // History (all-time) drives the calendar's green/red day coloring.
  useEffect(() => {
    api
      .portfolioHistory("1A")
      .then(setHistory)
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border bg-panel px-4 py-3 shrink-0">
        <div className="text-xl font-semibold text-fg">Journal</div>
        <div className="flex items-center gap-3">
          {process.env.NODE_ENV !== "production" && (
            <button
              onClick={() => api.resetDebrief().then(() => api.generateDebriefNow()).then(refresh)}
              title="Dev: resets last_debrief_at and immediately starts generating a debrief report, bypassing the schedule"
              className="rounded-md border border-border px-2 py-1 text-[10px] font-medium text-muted transition-colors hover:border-accent hover:text-fg"
            >
              Dev: Generate Debrief Now
            </button>
          )}
          <DebriefScheduleSettings />
          <div className="text-xs text-muted">Paper account</div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4">
        {error && (
          <div className="mb-4 rounded-lg border border-down/40 bg-down/10 px-4 py-2 text-sm text-down">
            {error}
          </div>
        )}

        {report && !reportOpen && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 animate-fade-in-up">
            <div className="text-sm text-fg">
              {report.status === "ready" && "Your scheduled debrief is ready."}
              {(report.status === "pending" || report.status === "running") &&
                `Your debrief is cooking… ${report.current_step}/${report.total_steps ?? "?"} trades reviewed` +
                  (report.eta_seconds != null ? ` — about ${Math.ceil(report.eta_seconds / 60)} min left` : "")}
              {report.status === "error" && "Your last scheduled debrief failed to generate."}
            </div>
            {report.status !== "error" && (
              <button
                onClick={() => setReportOpen(true)}
                className="shrink-0 rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-fg transition-colors hover:bg-accent/80"
              >
                {report.status === "ready" ? "Open Report" : "View Progress"}
              </button>
            )}
          </div>
        )}

        {/* Calendar + full journal */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <TradeCalendar points={history?.points ?? []} />
          </div>
          <div className="lg:col-span-2">
            <JournalEntries refreshKey={0} onDebriefTrade={setDebriefRequest} />
          </div>
        </div>
      </div>

      <SpotlightOverlay targetSelector={spotlight} />

      {debriefRequest && (
        <AnalystDebrief
          request={debriefRequest}
          onClose={() => { setDebriefRequest(null); setSpotlight(null); }}
          onSpotlight={setSpotlight}
        />
      )}

      {reportOpen && report && (
        <DebriefReportView
          report={report}
          onClose={() => { setReportOpen(false); setSpotlight(null); }}
          onSpotlight={setSpotlight}
        />
      )}
    </main>
  );
}
