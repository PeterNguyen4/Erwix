"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { api, BacktestConfig, BacktestResult, Candle, ChartAnnotation } from "@/lib/api";
import ReplayControls from "@/components/backtesting/ReplayControls";
import ConfigEditor from "@/components/backtesting/ConfigEditor";
import HintLibrary from "@/components/backtesting/HintLibrary";
import BacktestChat from "@/components/backtesting/BacktestChat";

const Chart = dynamic(() => import("@/components/Chart"), { ssr: false });

const DEFAULT_CONFIG: BacktestConfig = {
  name: "Untitled strategy",
  symbol: "AAPL",
  timeframe: "1Day",
  direction: "long",
  entry_rules: [],
  exit_rules: [],
  position_sizing: { mode: "fixed_qty", value: 1 },
  stop_loss: null,
  take_profit: null,
  max_concurrent_positions: 1,
};

function resultToAnnotations(result: BacktestResult | null): ChartAnnotation[] {
  if (!result) return [];
  return result.trades.flatMap((t): ChartAnnotation[] => {
    const entry: ChartAnnotation = {
      type: "arrow",
      time: t.entry_time,
      price: t.entry_price,
      color: t.side === "long" ? "#4ade80" : "#f87171",
      label: t.side === "long" ? "Buy" : "Short",
    };
    if (t.exit_time == null || t.exit_price == null) return [entry];
    return [
      entry,
      {
        type: "circle",
        time: t.exit_time,
        price: t.exit_price,
        color: (t.profit_loss ?? 0) >= 0 ? "#4ade80" : "#f87171",
        label: "Exit",
      },
    ];
  });
}

export default function BacktestingPage() {
  const [config, setConfig] = useState<BacktestConfig>(DEFAULT_CONFIG);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [cursorIndex, setCursorIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(200);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .candles(config.symbol, config.timeframe)
      .then((data) => {
        setCandles(data);
        setCursorIndex(Math.max(data.length - 1, 0));
      })
      .catch((e) => setError((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.symbol, config.timeframe]);

  const runBacktest = async () => {
    if (candles.length === 0) return;
    setRunning(true);
    setError(null);
    try {
      const saved = await api.saveBacktestConfig(config);
      setConfig(saved);
      const run = await api.runBacktest(saved.id!, {
        start: new Date(candles[0].time * 1000).toISOString(),
        end: new Date(candles[candles.length - 1].time * 1000).toISOString(),
      });
      if (run.status === "error") {
        setError(run.error_detail ?? "Backtest failed");
      } else {
        setResult(run.result);
        setCursorIndex(candles.length - 1);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border bg-panel px-4 py-3 shrink-0">
        <div className="text-xl font-semibold text-white">Backtesting</div>
        <div className="flex items-center gap-3">
          <input
            value={config.symbol}
            onChange={(e) => setConfig({ ...config, symbol: e.target.value.toUpperCase() })}
            className="w-24 rounded-md border border-border bg-transparent px-2 py-1 text-sm text-white"
          />
          <button
            onClick={runBacktest}
            disabled={running || candles.length === 0}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-accent/80 disabled:opacity-50"
          >
            {running ? "Running…" : "Run backtest"}
          </button>
        </div>
      </header>

      {error && (
        <div className="mx-4 mt-4 rounded-lg border border-down/40 bg-down/10 px-4 py-2 text-sm text-down">
          {error}
        </div>
      )}

      <div className="grid flex-1 grid-cols-1 gap-3 overflow-hidden p-3 lg:grid-cols-2">
        <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
            <ConfigEditor config={config} onChange={setConfig} />
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-hidden">
            <div className="min-h-0 overflow-hidden rounded-lg border border-border">
              <HintLibrary onApply={(updater) => setConfig(updater)} />
            </div>
            <div className="min-h-0 overflow-hidden rounded-lg border border-border">
              <BacktestChat config={config} onConfigChange={setConfig} />
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border">
          <div className="min-h-0 flex-1">
            {candles.length > 0 ? (
              <Chart
                candles={candles}
                cursorIndex={cursorIndex}
                symbol={config.symbol}
                annotations={resultToAnnotations(result)}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted">Loading candles…</div>
            )}
          </div>
          <ReplayControls
            total={candles.length}
            cursorIndex={cursorIndex}
            playing={playing}
            speedMs={speedMs}
            onCursorChange={setCursorIndex}
            onPlayingChange={setPlaying}
            onSpeedChange={setSpeedMs}
          />
          {result && (
            <div className="flex shrink-0 gap-4 border-t border-border bg-panel px-3 py-2 text-xs text-muted">
              <span>Trades: <span className="text-white">{result.stats.total_trades}</span></span>
              <span>Win rate: <span className="text-white">{result.stats.win_rate?.toFixed(1)}%</span></span>
              <span>Total P/L: <span className={result.stats.total_pnl >= 0 ? "text-up" : "text-down"}>{result.stats.total_pnl?.toFixed(2)}</span></span>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
