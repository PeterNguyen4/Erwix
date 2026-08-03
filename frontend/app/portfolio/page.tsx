"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, Triangle } from "lucide-react";
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

function WeekDelta({ value }: { value: number | null }) {
  if (value == null || Number.isNaN(value) || value === 0) return null;
  const up = value > 0;
  return (
    <div className={`flex items-center gap-0.5 text-xs font-semibold tabular-nums ${up ? "text-up" : "text-down"}`}>
      <Triangle size={8} className={up ? "" : "rotate-180"} fill="currentColor" strokeWidth={0} />
      <span>
        {up ? "+" : ""}
        {value.toFixed(0)}%
      </span>
    </div>
  );
}

function pctDelta(current: number | null, prev: number | null): number | null {
  if (current == null || prev == null) return null;
  if (prev === 0) return current === 0 ? 0 : null;
  return ((current - prev) / Math.abs(prev)) * 100;
}

export default function PortfolioPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(true);
  const [history, setHistory] = useState<PortfolioHistory | null>(null);
  const [period, setPeriod] = useState<Period>("1M");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [pnl, setPnl] = useState<PnLSummary | null>(null);
  const [pnlLoading, setPnlLoading] = useState(true);
  const [weekPnl, setWeekPnl] = useState<PnLSummary | null>(null);
  const [prevWeekPnl, setPrevWeekPnl] = useState<PnLSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spotlight, setSpotlight] = useState<string | null>(null);
  const [debriefRequest, setDebriefRequest] = useState<DebriefRequest | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const { report, refresh } = useDebriefReport();

  const loadAccount = useCallback(() => {
    api.account().then(setAccount).catch((e) => setError((e as Error).message));
    api
      .positions()
      .then(setPositions)
      .catch(() => {})
      .finally(() => setPositionsLoading(false));
  }, []);

  useEffect(() => {
    loadAccount();
    const id = setInterval(loadAccount, 20000);
    return () => clearInterval(id);
  }, [loadAccount]);

  useEffect(() => {
    api
      .pnlSummary({})
      .then(setPnl)
      .catch(() => {})
      .finally(() => setPnlLoading(false));

    api
      .pnlWeeklyComparison()
      .then((cmp) => {
        setWeekPnl(cmp.current);
        setPrevWeekPnl(cmp.previous);
      })
      .catch(() => {});
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
    <main className="flex h-full flex-col overflow-auto">
      <header className="sticky top-0 z-10 flex items-center justify-between min-h-[60px] border-b border-auth-field/40 bg-panel px-4 py-3 shrink-0">
        <div className="text-xl font-semibold text-fg">Portfolio</div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-muted">Paper account</div>
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
        </div>
      </header>

      <div className="flex-1 p-4 space-y-4">
        {error && (
          <div className="rounded-lg border border-down/40 bg-down/10 px-4 py-2 text-sm text-down">
            {error}
          </div>
        )}

        {report && !reportOpen && (
          <div className="relative flex items-center justify-between overflow-hidden rounded-lg border border-accent/30 bg-violet-500/[0.03] px-4 py-3 animate-fade-in-up">
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-fuchsia-500/15 blur-3xl" />
            <div className="relative flex items-center gap-2 text-sm text-fg">
              <Sparkles className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300" />
              {report.status === "ready" && "Your scheduled debrief is ready."}
              {(report.status === "pending" || report.status === "running") &&
                `${report.current_step}/${report.total_steps ?? "?"} trades reviewed` +
                  (report.eta_seconds != null ? ` ~ ${Math.ceil(report.eta_seconds / 60)} min left` : "")}
              {report.status === "error" && "Your last scheduled debrief failed to generate."}
            </div>
            {report.status !== "error" && (
              <button
                onClick={() => setReportOpen(true)}
                className="relative shrink-0 rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent/80"
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
            <TotalAssets positions={positions} loading={positionsLoading} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TradeCalendar points={history?.points ?? []} onDebriefTrade={setDebriefRequest} />
          <div className="space-y-4">
            {pnlLoading ? (
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex-1 min-w-28 rounded-md border border-border bg-panel px-3 py-4">
                    <div className="h-3 w-16 animate-pulse rounded bg-border/40" />
                    <div className="mt-2 h-7 w-16 animate-pulse rounded bg-border/40" />
                  </div>
                ))}
              </div>
            ) : (
              pnl && (
                <div className="flex flex-wrap gap-2">
                  <div className="flex-1 min-w-28 rounded-md border border-border bg-panel px-3 py-4">
                    <div className="text-xs font-medium tracking-wide text-muted">Win Rate</div>
                    <div className="mt-1 flex items-baseline gap-4">
                      <span className="text-2xl font-normal tabular-nums text-fg">
                        {pnl.win_rate != null ? `${(pnl.win_rate * 100).toFixed(0)}%` : "—"}
                      </span>
                      <WeekDelta value={pctDelta(weekPnl?.win_rate ?? null, prevWeekPnl?.win_rate ?? null)} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-28 rounded-md border border-border bg-panel px-3 py-4">
                    <div className="text-xs font-medium tracking-wide text-muted">Avg Risk/Reward</div>
                    <div className="mt-1 flex items-baseline gap-4">
                      <span className="text-2xl font-normal tabular-nums text-fg">
                        {pnl.avg_win != null && pnl.avg_loss ? `1 : ${(pnl.avg_win / Math.abs(pnl.avg_loss)).toFixed(2)}` : "—"}
                      </span>
                      <WeekDelta
                        value={pctDelta(
                          weekPnl?.avg_win != null && weekPnl?.avg_loss ? weekPnl.avg_win / Math.abs(weekPnl.avg_loss) : null,
                          prevWeekPnl?.avg_win != null && prevWeekPnl?.avg_loss
                            ? prevWeekPnl.avg_win / Math.abs(prevWeekPnl.avg_loss)
                            : null
                        )}
                      />
                    </div>
                  </div>
                  <div className="flex-1 min-w-28 rounded-md border border-border bg-panel px-3 py-4">
                    <div className="text-xs font-medium tracking-wide text-muted">Realized PnL</div>
                    <div className="mt-1 flex items-baseline gap-4">
                      <span className={`text-2xl font-normal tabular-nums ${pnl.total_pnl >= 0 ? "text-up" : "text-down"}`}>
                        {pnl.total_pnl >= 0 ? "+" : ""}
                        {pnl.total_pnl.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                      </span>
                      <WeekDelta value={pctDelta(weekPnl?.total_pnl ?? null, prevWeekPnl?.total_pnl ?? null)} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-28 rounded-md border border-border bg-panel px-3 py-4">
                    <div className="text-xs font-medium tracking-wide text-muted">W / L</div>
                    <div className="mt-1 flex items-baseline gap-4">
                      <span className="text-2xl font-normal tabular-nums text-fg">
                        <span className="text-up">{pnl.win_count}</span> / <span className="text-down">{pnl.loss_count}</span>
                      </span>
                      <WeekDelta
                        value={pctDelta(
                          weekPnl ? weekPnl.win_count - weekPnl.loss_count : null,
                          prevWeekPnl ? prevWeekPnl.win_count - prevWeekPnl.loss_count : null
                        )}
                      />
                    </div>
                  </div>
                </div>
              )
            )}
            <AllocationChart positions={positions} cash={account?.cash ?? 0} loading={positionsLoading} />
            <PositionsDetail positions={positions} loading={positionsLoading} />
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
