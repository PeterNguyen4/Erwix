"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { api, BacktestConfig, BacktestResult, BacktestTrade, Candle, ChartAnnotation, SymbolResult } from "@/lib/api";
import ReplayControls from "@/components/backtesting/ReplayControls";
import ConfigEditor from "@/components/backtesting/ConfigEditor";
import HintLibrary from "@/components/backtesting/HintLibrary";
import BacktestChat from "@/components/backtesting/BacktestChat";
import { Search } from "lucide-react";

const Chart = dynamic(() => import("@/components/Chart"), { ssr: false });

const TIMEFRAMES = [
  { value: "1Min",  label: "1m" },
  { value: "5Min",  label: "5m" },
  { value: "15Min", label: "15m" },
  { value: "1Hour", label: "1H" },
  { value: "1Day",  label: "1D" },
  { value: "1Week", label: "1W" },
  { value: "1Month", label: "1M" },
];

const DEFAULT_RESULTS: SymbolResult[] = [
  { symbol: "AAPL",  name: "Apple Inc." },
  { symbol: "MSFT",  name: "Microsoft Corp." },
  { symbol: "GOOGL", name: "Alphabet Inc." },
  { symbol: "AMZN",  name: "Amazon.com Inc." },
  { symbol: "NVDA",  name: "NVIDIA Corp." },
  { symbol: "TSLA",  name: "Tesla Inc." },
  { symbol: "META",  name: "Meta Platforms Inc." },
  { symbol: "SPY",   name: "SPDR S&P 500 ETF" },
  { symbol: "QQQ",   name: "Invesco QQQ Trust" },
  { symbol: "AMD",   name: "Advanced Micro Devices" },
];

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toUpperCase().indexOf(query.toUpperCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="font-bold text-blue-400">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

function IconSearch() {
  return <Search size={14} strokeWidth={2} className="shrink-0" />;
}

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
  return result.trades.flatMap((t: BacktestTrade): ChartAnnotation[] => {
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
  const [symbolSearch, setSymbolSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SymbolResult[]>(DEFAULT_RESULTS);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSymbolDropdown, setShowSymbolDropdown] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const handleSymbolSelect = (sym: string) => {
    setConfig((c) => ({ ...c, symbol: sym.toUpperCase() }));
    setSymbolSearch("");
    setShowSymbolDropdown(false);
  };

  const handleSearchChange = (value: string) => {
    setSymbolSearch(value);
    setShowSymbolDropdown(true);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!value.trim()) {
      setSearchResults(DEFAULT_RESULTS);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    searchDebounceRef.current = setTimeout(() => {
      api.searchSymbols(value)
        .then((results) => { setSearchResults(results); setSearchLoading(false); })
        .catch(() => { setSearchLoading(false); });
    }, 200);
  };

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
        <div className="text-xl font-semibold text-fg">Backtesting</div>
        <div className="flex items-center gap-3">
          <select
            value={config.timeframe}
            onChange={(e) => setConfig({ ...config, timeframe: e.target.value })}
            className="rounded border border-border bg-field px-2 py-1.5 text-sm text-fg outline-none focus:border-accent cursor-pointer"
          >
            {TIMEFRAMES.map((tf) => (
              <option key={tf.value} value={tf.value}>{tf.label}</option>
            ))}
          </select>

          <div className="relative w-56">
            <div className="flex items-center gap-2 rounded border border-border bg-field px-2 py-1.5 focus-within:border-accent">
              <span className="text-muted">
                <IconSearch />
              </span>
              <input
                type="text"
                placeholder={config.symbol}
                value={symbolSearch}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => {
                  setShowSymbolDropdown(true);
                  if (!symbolSearch.trim()) setSearchResults(DEFAULT_RESULTS);
                }}
                onBlur={() => setTimeout(() => setShowSymbolDropdown(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && symbolSearch.trim()) {
                    const typed = symbolSearch.trim();
                    const match = searchResults.find((r) => r.symbol.toUpperCase() === typed.toUpperCase());
                    handleSymbolSelect(match?.symbol ?? typed);
                  }
                  if (e.key === "Escape") setShowSymbolDropdown(false);
                }}
                className="flex-1 bg-transparent text-sm outline-none text-fg placeholder:text-fg"
              />
            </div>
            {showSymbolDropdown && (searchResults.length > 0 || searchLoading) && (
              <div className="absolute top-full left-0 right-0 mt-1 rounded border border-border bg-panel shadow-lg z-30 max-h-72 overflow-y-auto">
                {searchLoading && (
                  <div className="px-3 py-2 text-xs text-muted">Searching…</div>
                )}
                {!searchLoading && searchResults.map((r) => (
                  <button
                    key={r.symbol}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSymbolSelect(r.symbol)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-accent/20 border-b border-border last:border-b-0 flex items-baseline gap-2"
                  >
                    <span className="font-mono text-fg min-w-[3.5rem]">
                      <HighlightMatch text={r.symbol} query={symbolSearch} />
                    </span>
                    <span className="text-xs text-muted truncate">{r.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={runBacktest}
            disabled={running || candles.length === 0}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-fg transition-colors hover:bg-accent/80 disabled:opacity-50"
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
              <span>Trades: <span className="text-fg">{result.stats.total_trades}</span></span>
              <span>Win rate: <span className="text-fg">{result.stats.win_rate?.toFixed(1)}%</span></span>
              <span>Total P/L: <span className={result.stats.total_pnl >= 0 ? "text-up" : "text-down"}>{result.stats.total_pnl?.toFixed(2)}</span></span>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
