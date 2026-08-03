"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { api, BacktestConfig, BacktestResult, BacktestTrade, Candle, ChartAnnotation, SymbolResult } from "@/lib/api";
import ReplayControls from "@/components/backtesting/ReplayControls";
import BacktestChat from "@/components/backtesting/BacktestChat";
import { Search, ChevronDown } from "lucide-react";

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
      <span className="font-bold text-violet-400">{text.slice(idx, idx + query.length)}</span>
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
  const [tfOpen, setTfOpen] = useState(false);
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
    <main className="flex h-full flex-col overflow-auto">
      <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between min-h-[60px] border-b border-auth-field/40 bg-panel px-4 py-3 gap-3 shrink-0">
        <div className="text-xl font-normal text-fg">Backtesting</div>
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:flex-none">
          {/* Timeframe selector */}
          <div className="relative flex items-center">
            <button
              type="button"
              onClick={() => setTfOpen((o) => !o)}
              onBlur={() => setTimeout(() => setTfOpen(false), 150)}
              className={`flex items-center gap-1 rounded border bg-field px-2 py-2 text-sm text-fg transition-colors outline-none cursor-pointer ${
                tfOpen ? "border-violet-400" : "border-border"
              }`}
            >
              {TIMEFRAMES.find((tf) => tf.value === config.timeframe)?.label}
              <ChevronDown size={12} strokeWidth={2} className="opacity-70" />
            </button>
            {tfOpen && (
              <div className="absolute top-full left-0 z-30 mt-1 w-24 rounded-md border border-border bg-panel py-1 shadow-lg">
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf.value}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setConfig({ ...config, timeframe: tf.value });
                      setTfOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-xs transition-colors ${
                      tf.value === config.timeframe ? "bg-violet-500/20 text-fg" : "text-muted hover:bg-violet-500/10 hover:text-fg"
                    }`}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Ticker search */}
          <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
            <div className="flex items-center gap-2 rounded border border-border bg-field px-3 py-2 focus-within:border-violet-400">
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
                className="flex-1 bg-transparent text-sm outline-none text-fg placeholder:text-muted"
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
                    className="w-full px-3 py-2 text-left text-sm hover:bg-violet-500/15 flex items-baseline gap-2"
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
        </div>
      </header>

      {error && (
        <div className="mx-4 mt-4 rounded-lg border border-down/40 bg-down/10 px-4 py-2 text-sm text-down">
          {error}
        </div>
      )}

      <div className="grid flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-2 lg:overflow-hidden">
        <div className="flex flex-col gap-4 lg:min-h-0 lg:overflow-hidden">
          <div className="flex min-h-[420px] flex-1 flex-col rounded-lg border border-border bg-panel lg:min-h-0 lg:overflow-hidden">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
              <span className="text-sm font-semibold tracking-wide text-muted">Strategy Builder</span>
              <button
                onClick={runBacktest}
                disabled={running || candles.length === 0}
                className="rounded-md bg-accent px-3 py-1 text-xs font-semibold text-on-accent transition-colors hover:bg-accent/80 disabled:opacity-50"
              >
                {running ? "Running…" : "Run backtest"}
              </button>
            </div>
            <div className="flex-1 lg:min-h-0">
              <BacktestChat config={config} onConfigChange={setConfig} />
            </div>
          </div>
        </div>

        <div className="flex min-h-[420px] flex-col rounded-lg border border-border bg-panel lg:min-h-0">
          <div className="shrink-0 border-b border-border px-4 py-2 text-sm font-semibold tracking-wide text-muted">
            Replay Preview
          </div>
          <div className="flex-1 lg:min-h-0">
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
            <div className="grid shrink-0 grid-cols-3 divide-x divide-border border-t border-border">
              <div className="flex flex-col items-center gap-0.5 px-3 py-2.5">
                <span className="text-[10px] font-semibold tracking-wide text-muted">Trades</span>
                <span className="text-sm font-semibold tabular-nums text-fg">{result.stats.total_trades}</span>
              </div>
              <div className="flex flex-col items-center gap-0.5 px-3 py-2.5">
                <span className="text-[10px] font-semibold tracking-wide text-muted">Win Rate</span>
                <span className="text-sm font-semibold tabular-nums text-fg">{result.stats.win_rate?.toFixed(1)}%</span>
              </div>
              <div className="flex flex-col items-center gap-0.5 px-3 py-2.5">
                <span className="text-[10px] font-semibold tracking-wide text-muted">Total P/L</span>
                <span className={`text-sm font-semibold tabular-nums ${result.stats.total_pnl >= 0 ? "text-up" : "text-down"}`}>
                  {result.stats.total_pnl?.toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
