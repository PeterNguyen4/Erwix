"use client";

import { useCallback, useEffect, useState } from "react";
import { api, Account, PortfolioHistory, Position } from "@/lib/api";
import PortfolioChart, { Period } from "@/components/journal/PortfolioChart";
import PositionsDetail from "@/components/journal/PositionsDetail";
import AllocationChart from "@/components/journal/AllocationChart";
import TotalAssets from "@/components/journal/TotalAssets";

export default function PortfolioPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [history, setHistory] = useState<PortfolioHistory | null>(null);
  const [period, setPeriod] = useState<Period>("1M");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    setHistoryLoading(true);
    api
      .portfolioHistory(period)
      .then(setHistory)
      .catch((e) => setError((e as Error).message))
      .finally(() => setHistoryLoading(false));
  }, [period]);

  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border bg-panel px-4 py-3 shrink-0">
        <div className="text-xl font-semibold text-white">Portfolio</div>
        <div className="text-xs text-muted">Paper account</div>
      </header>

      <div className="flex-1 overflow-auto p-4 space-y-4">
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
            <TotalAssets positions={positions} />
          </div>
        </div>

        {/* Open positions + allocation, split in half */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <PositionsDetail positions={positions} />
          <AllocationChart positions={positions} cash={account?.cash ?? 0} />
        </div>
      </div>
    </main>
  );
}
