"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowRight, RefreshCw, Sparkles } from "lucide-react";
import { api, DebriefRequest, PortfolioPoint } from "@/lib/api";
import JournalCalendar from "@/components/journal/JournalCalendar";
import DebriefScheduleSettings from "@/components/journal/DebriefScheduleSettings";
import SpotlightOverlay from "@/components/journal/SpotlightOverlay";
import { useDebriefReport } from "@/lib/useDebriefReport";
import { useAuth } from "@/components/AuthProvider";

function TwinkleIcon({ className }: { className?: string }) {
  return (
    <Sparkles
      className={`h-4 w-4 ${className ?? ""}`}
      stroke="url(#debrief-twinkle-grad)"
      strokeWidth={1.25}
      fill="url(#debrief-twinkle-grad)"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="debrief-twinkle-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6d54b5" />
          <stop offset="100%" stopColor="#c148af" />
        </linearGradient>
      </defs>
    </Sparkles>
  );
}

const AnalystDebrief = dynamic(() => import("@/components/journal/AnalystDebrief"), { ssr: false });
const DebriefReportView = dynamic(() => import("@/components/journal/DebriefReportView"), { ssr: false });

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
              <div className="flex min-h-[100px] flex-col rounded-lg border border-border bg-panel px-3.5 py-4 animate-fade-in-up">
                <div className="flex items-center gap-2">
                  <TwinkleIcon className="shrink-0" />
                  <span className="bg-gradient-to-r from-[#6d54b5] to-[#c1487f] bg-clip-text text-sm font-semibold text-transparent">
                    Debrief
                  </span>
                </div>
                <span className="mt-2.5 flex-1 text-xs leading-relaxed text-fg">
                  {report.status === "ready" && "Your scheduled review is ready."}
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
                    className="mt-3 flex items-center gap-1 self-end text-xs font-normal text-accent hover:underline"
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
              <div className="flex min-h-[100px] flex-col rounded-lg border border-border bg-panel px-3.5 py-4 animate-fade-in-up">
                <div className="mb-2 flex items-center gap-2">
                  <TwinkleIcon className="shrink-0" />
                  <span className="bg-gradient-to-r from-[#6d54b5] to-[#c1487f] bg-clip-text text-sm font-semibold text-transparent">
                    Weekly Notes
                  </span>
                </div>
                <span className="flex-1 text-xs leading-relaxed text-fg">
                  {report.summary || "Your scheduled review is ready."}
                </span>
                <button
                  onClick={() => setReportOpen(true)}
                  className="mt-3 flex items-center gap-1 self-end text-xs font-normal text-accent hover:underline"
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
