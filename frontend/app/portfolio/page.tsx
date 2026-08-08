"use client";

import { ReactNode, useCallback, useEffect, useState } from "react";
import { Triangle } from "lucide-react";
import { api, Account, DebriefRequest, PnLSummary, PnLTrend, PortfolioHistory, Position } from "@/lib/api";
import PortfolioChart, { Period } from "@/components/journal/PortfolioChart";
import AllocationChart from "@/components/journal/AllocationChart";
import TotalAssets from "@/components/journal/TotalAssets";
import RecentTransactions from "@/components/journal/RecentTransactions";
import Watchlist from "@/components/journal/Watchlist";
import Sparkline from "@/components/journal/Sparkline";
import AnalystDebrief from "@/components/journal/AnalystDebrief";
import DebriefScheduleSettings from "@/components/journal/DebriefScheduleSettings";
import SpotlightOverlay from "@/components/journal/SpotlightOverlay";
import { useAuth } from "@/components/AuthProvider";

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

interface Chip {
  key: string;
  label: string;
  value: ReactNode;
  delta: number | null;
  colorClass: string;
  series: (number | null)[] | null;
}

function StatChip({ chip }: { chip: Chip }) {
  const up = (chip.delta ?? 0) >= 0;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-panel px-4 py-4">
      <div>
        <div className="text-xs font-medium tracking-wide text-muted">{chip.label}</div>
        <div className={`mt-1 text-xl font-normal tabular-nums ${chip.colorClass}`}>{chip.value}</div>
        <div className="mt-0.5">
          <WeekDelta value={chip.delta} />
        </div>
      </div>
      {chip.series && <Sparkline values={chip.series} up={up} width={56} height={28} />}
    </div>
  );
}

export default function PortfolioPage() {
  const { isAdmin } = useAuth();
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
  const [trend, setTrend] = useState<PnLTrend | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spotlight, setSpotlight] = useState<string | null>(null);
  const [debriefRequest, setDebriefRequest] = useState<DebriefRequest | null>(null);

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

    api.pnlTrend(14).then(setTrend).catch(() => setTrend(null));
  }, []);

  useEffect(() => {
    setHistoryLoading(true);
    api
      .portfolioHistory(period)
      .then(setHistory)
      .catch((e) => setError((e as Error).message))
      .finally(() => setHistoryLoading(false));
  }, [period]);

  const chips: Chip[] | null = pnl
    ? [
        {
          key: "win-rate",
          label: "Win Rate",
          value: pnl.win_rate != null ? `${(pnl.win_rate * 100).toFixed(0)}%` : "—",
          delta: pctDelta(weekPnl?.win_rate ?? null, prevWeekPnl?.win_rate ?? null),
          colorClass: "text-fg",
          series: trend?.win_rate ?? null,
        },
        {
          key: "risk-reward",
          label: "Risk : Reward",
          value:
            pnl.avg_win != null && pnl.avg_loss ? `1 : ${(pnl.avg_win / Math.abs(pnl.avg_loss)).toFixed(2)}` : "—",
          delta: pctDelta(
            weekPnl?.avg_win != null && weekPnl?.avg_loss ? weekPnl.avg_win / Math.abs(weekPnl.avg_loss) : null,
            prevWeekPnl?.avg_win != null && prevWeekPnl?.avg_loss
              ? prevWeekPnl.avg_win / Math.abs(prevWeekPnl.avg_loss)
              : null
          ),
          colorClass: "text-fg",
          series: trend?.risk_reward ?? null,
        },
        {
          key: "realized-pnl",
          label: "Realized PnL",
          value: `${pnl.total_pnl >= 0 ? "+" : ""}${pnl.total_pnl.toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
          })}`,
          delta: pctDelta(weekPnl?.total_pnl ?? null, prevWeekPnl?.total_pnl ?? null),
          colorClass: pnl.total_pnl >= 0 ? "text-up" : "text-down",
          series: trend?.total_pnl ?? null,
        },
        {
          key: "win-loss",
          label: "W / L",
          value: (
            <>
              <span className="text-up">{pnl.win_count}</span> / <span className="text-down">{pnl.loss_count}</span>
            </>
          ),
          delta: pctDelta(
            weekPnl ? weekPnl.win_count - weekPnl.loss_count : null,
            prevWeekPnl ? prevWeekPnl.win_count - prevWeekPnl.loss_count : null
          ),
          colorClass: "text-fg",
          series: trend?.win_loss_diff ?? null,
        },
      ]
    : null;

  return (
    <main className="flex h-full flex-col overflow-auto">
      <header className="sticky top-0 z-10 flex items-center justify-between min-h-[60px] border-b border-auth-field/40 bg-panel px-4 py-3 shrink-0">
        <div className="text-xl font-normal text-fg">Portfolio</div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-muted">Paper account</div>
          {process.env.NODE_ENV !== "production" && isAdmin && (
            <button
              onClick={() => api.resetDebrief().then(() => api.generateDebriefNow())}
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

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <RecentTransactions onDebriefTrade={setDebriefRequest} />

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {pnlLoading || !chips
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-lg border border-border bg-panel px-4 py-4">
                      <div className="h-3 w-20 animate-pulse rounded bg-border/40" />
                      <div className="mt-2 h-6 w-16 animate-pulse rounded bg-border/40" />
                    </div>
                  ))
                : chips.map((c) => <StatChip key={c.key} chip={c} />)}
            </div>
            <div className="grid grid-cols-2 items-start gap-4">
              <AllocationChart positions={positions} cash={account?.cash ?? 0} loading={positionsLoading} />
              <Watchlist />
            </div>
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

    </main>
  );
}
