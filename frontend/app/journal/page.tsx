"use client";

import { useEffect, useState } from "react";
import { ArrowRight, RefreshCw, Sparkles } from "lucide-react";
import { api, DebriefRequest, PortfolioPoint } from "@/lib/api";
import JournalCalendar from "@/components/journal/JournalCalendar";
import AnalystDebrief from "@/components/journal/AnalystDebrief";
import DebriefReportView from "@/components/journal/DebriefReportView";
import DebriefScheduleSettings from "@/components/journal/DebriefScheduleSettings";
import SpotlightOverlay from "@/components/journal/SpotlightOverlay";
import { useDebriefReport } from "@/lib/useDebriefReport";
import { useAuth } from "@/components/AuthProvider";

export default function JournalPage() {
  const { isAdmin } = useAuth();
  const [spotlight, setSpotlight] = useState<string | null>(null);
  const [debriefRequest, setDebriefRequest] = useState<DebriefRequest | null>(null);
  const [points, setPoints] = useState<PortfolioPoint[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const { report, refresh } = useDebriefReport();

  const regenerateDebrief = () => {
    setRegenerating(true);
    api
      .resetDebrief()
      .then(() => api.generateDebriefNow())
      .then(refresh)
      .catch(() => {})
      .finally(() => setRegenerating(false));
  };

  useEffect(() => {
    api
      .portfolioHistory("all")
      .then((h) => setPoints(h.points))
      .catch(() => setPoints([]));
  }, []);

  if (debriefRequest) {
    return (
      <main className="flex h-full flex-col overflow-hidden">
        <AnalystDebrief
          request={debriefRequest}
          variant="panel"
          onClose={() => {
            setDebriefRequest(null);
            setSpotlight(null);
          }}
          onSpotlight={setSpotlight}
        />
        <SpotlightOverlay targetSelector={spotlight} />
      </main>
    );
  }

  if (reportOpen && report) {
    return (
      <main className="flex h-full flex-col overflow-hidden">
        <DebriefReportView
          report={report}
          variant="panel"
          onClose={() => {
            setReportOpen(false);
            setSpotlight(null);
          }}
          onSpotlight={setSpotlight}
        />
        <SpotlightOverlay targetSelector={spotlight} />
      </main>
    );
  }

  return (
    <main className="flex h-full flex-col overflow-hidden">
      <header className="flex min-h-[60px] shrink-0 items-center justify-between border-b border-auth-field/40 bg-panel px-4 py-3">
        <div className="text-xl font-normal text-fg">Journal</div>
        {process.env.NODE_ENV !== "production" && isAdmin && (
          <button
            onClick={regenerateDebrief}
            disabled={regenerating}
            title="Dev: resets last_debrief_at and immediately starts generating a debrief report, bypassing the schedule"
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-fg disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} />
            {regenerating ? "Regenerating…" : "Regenerate Debrief"}
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 p-3">
        <JournalCalendar
          onDebriefTrade={setDebriefRequest}
          points={points}
          leftPanelTop={<DebriefScheduleSettings />}
          leftPanelExtra={
            report &&
            !(report.status === "ready" && report.viewed_at) && (
              <div className="relative flex min-h-[100px] flex-col overflow-hidden rounded-lg border border-accent/30 bg-violet-500/[0.03] px-3.5 py-4 animate-fade-in-up">
                <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-accent/20 blur-2xl" />
                <div className="pointer-events-none absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-fuchsia-500/15 blur-2xl" />
                <Sparkles className="relative h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300" />
                <span className="relative mt-2.5 flex-1 text-xs leading-relaxed text-fg">
                  {report.status === "ready" && "Your scheduled debrief is ready."}
                  {(report.status === "pending" || report.status === "running") &&
                    `${report.current_step}/${report.total_steps ?? "?"} trades reviewed` +
                      (report.eta_seconds != null ? ` ~ ${Math.ceil(report.eta_seconds / 60)} min left` : "")}
                  {report.status === "error" && "Your last scheduled debrief failed to generate."}
                </span>
                {report.status !== "error" && (
                  <button
                    onClick={() => {
                      setReportOpen(true);
                      if (report.status === "ready") api.markDebriefViewed(report.id).then(refresh).catch(() => {});
                    }}
                    className="relative mt-3 flex items-center gap-1 self-end text-xs font-normal text-accent hover:underline dark:text-violet-400"
                  >
                    {report.status === "ready" ? "Open Report" : "View Progress"}
                    <ArrowRight size={12} strokeWidth={2.2} />
                  </button>
                )}
              </div>
            )
          }
          leftPanelBelow={
            report &&
            report.status === "ready" &&
            report.viewed_at && (
              <div className="relative flex min-h-[100px] flex-col overflow-hidden rounded-lg border border-accent/30 bg-violet-500/[0.03] px-3.5 py-4 animate-fade-in-up">
                <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-accent/20 blur-2xl" />
                <div className="pointer-events-none absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-fuchsia-500/15 blur-2xl" />
                <div className="relative mb-2 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300" />
                  <span className="text-sm font-semibold text-violet-600 dark:text-violet-300">Weekly Notes</span>
                </div>
                <span className="relative flex-1 text-xs leading-relaxed text-fg">
                  {report.summary || "Your scheduled debrief is ready."}
                </span>
                <button
                  onClick={() => setReportOpen(true)}
                  className="relative mt-3 flex items-center gap-1 self-end text-xs font-normal text-accent hover:underline dark:text-violet-400"
                >
                  Open Report
                  <ArrowRight size={12} strokeWidth={2.2} />
                </button>
              </div>
            )
          }
        />
      </div>

      <SpotlightOverlay targetSelector={spotlight} />
    </main>
  );
}
