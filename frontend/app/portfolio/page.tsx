"use client";

import { useCallback, useEffect, useState } from "react";
import { api, Account, DebriefRequest, PnLSummary, PortfolioHistory, Position } from "@/lib/api";
import PortfolioChart, { Period } from "@/components/journal/PortfolioChart";
import PositionsDetail from "@/components/journal/PositionsDetail";
import AllocationChart from "@/components/journal/AllocationChart";
import TotalAssets from "@/components/journal/TotalAssets";
import TradeCalendar from "@/components/journal/TradeCalendar";
import AnalystDebrief from "@/components/journal/AnalystDebrief";
import DebriefReportView from "@/components/journal/DebriefReportView";
import DebriefScheduleSettings from "@/components/journal/DebriefScheduleSettings";
import SpotlightOverlay from "@/components/journal/SpotlightOverlay";
import { useDebriefReport } from "@/lib/useDebriefReport";

export default function PortfolioPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [history, setHistory] = useState<PortfolioHistory | null>(null);
  const [period, setPeriod] = useState<Period>("1M");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [pnl, setPnl] = useState<PnLSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spotlight, setSpotlight] = useState<string | null>(null);
  const [debriefRequest, setDebriefRequest] = useState<DebriefRequest | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const { report, refresh } = useDebriefReport();

  const loadAccount = useCallback(() => {
    api.account().then(setAccount).catch((e) => setError((e as Error).message));
    api.positions().then(setPositions).catch(() => {});
  }, []);

  useEffect(() => {
    loadAccount();
    const id = setInterval(loadAccount, 20000);
    return () => clearInterval(id);
  }, [loadAccount]);

  useEffect(() => {
    api.pnlSummary({}).then(setPnl).catch(() => {});
  }, []);

  useEffect(() => {
    setHistoryLoading(true);
    api
      .portfolioHistory(period)
      .then(setHistory)
      .catch((e) => setError((e as Error).message))
      .finally(() => setHistoryLoading(false));
  }, [period]);

  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center justify-between min-h-[60px] border-b border-auth-field/40 bg-panel px-4 py-3 shrink-0">
        <div className="text-xl font-semibold text-fg">Portfolio</div>
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

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {error && (
          <div className="rounded-lg border border-down/40 bg-down/10 px-4 py-2 text-sm text-down">
            {error}
          </div>
        )}

        {report && !reportOpen && (
          <div className="flex items-center justify-between rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 animate-fade-in-up">
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
                className="shrink-0 rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent/80"
              >
                {report.status === "ready" ? "Open Report" : "View Progress"}
              </button>
            )}
          </div>
        )}

        {/* Portfolio value graph (2/3) + total assets (1/3) */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <PortfolioChart
              points={history?.points ?? []}
              baseValue={history?.base_value ?? 0}
              period={period}
              onPeriodChange={setPeriod}
              loading={historyLoading}
            />
          </div>
          <div className="lg:col-span-1">
            <TotalAssets positions={positions} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TradeCalendar points={history?.points ?? []} onDebriefTrade={setDebriefRequest} />
          <div className="space-y-4">
            {pnl && (
              <div className="flex flex-wrap gap-2">
                <div className="flex-1 min-w-28 rounded-md border border-border bg-panel px-3 py-4">
                  <div className="text-[10px] uppercase tracking-wide text-muted">Win Rate</div>
                  <div className="text-sm font-semibold tabular-nums text-fg">
                    {pnl.win_rate != null ? `${(pnl.win_rate * 100).toFixed(0)}%` : "—"}
                  </div>
                </div>
                <div className="flex-1 min-w-28 rounded-md border border-border bg-panel px-3 py-4">
                  <div className="text-[10px] uppercase tracking-wide text-muted">Avg Risk/Reward</div>
                  <div className="text-sm font-semibold tabular-nums text-fg">
                    {pnl.avg_win != null && pnl.avg_loss ? `1 : ${(pnl.avg_win / Math.abs(pnl.avg_loss)).toFixed(2)}` : "—"}
                  </div>
                </div>
                <div className="flex-1 min-w-28 rounded-md border border-border bg-panel px-3 py-4">
                  <div className="text-[10px] uppercase tracking-wide text-muted">Realized PnL</div>
                  <div className={`text-sm font-semibold tabular-nums ${pnl.total_pnl >= 0 ? "text-up" : "text-down"}`}>
                    {pnl.total_pnl >= 0 ? "+" : ""}
                    {pnl.total_pnl.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                  </div>
                </div>
                <div className="flex-1 min-w-28 rounded-md border border-border bg-panel px-3 py-4">
                  <div className="text-[10px] uppercase tracking-wide text-muted">W / L</div>
                  <div className="text-sm font-semibold tabular-nums text-fg">
                    <span className="text-up">{pnl.win_count}</span> / <span className="text-down">{pnl.loss_count}</span>
                  </div>
                </div>
              </div>
            )}
            <AllocationChart positions={positions} cash={account?.cash ?? 0} />
            <PositionsDetail positions={positions} />
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
