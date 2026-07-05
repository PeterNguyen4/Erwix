"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { api, Account, Candle, Position, Quote, SymbolResult, UserPreference } from "@/lib/api";
import { getCached, setCached } from "@/lib/candleCache";
import OrderPanel from "@/components/OrderPanel";
import PositionsTable from "@/components/PositionsTable";
import QuoteCard from "@/components/QuoteCard";

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
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="10" y1="10" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function ChartPageWrapper() {
  return (
    <Suspense>
      <ChartPage />
    </Suspense>
  );
}

function ChartPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [symbol, setSymbol] = useState(() => searchParams.get("symbol") ?? "AAPL");
  const [symbolName, setSymbolName] = useState(() => {
    const sym = searchParams.get("symbol");
    return DEFAULT_RESULTS.find((r) => r.symbol === sym)?.name ?? "Apple Inc.";
  });
  const [timeframe, setTimeframe] = useState(() => searchParams.get("tf") ?? "1Day");
  const [candles, setCandles] = useState<Candle[]>(() => getCached(searchParams.get("symbol") ?? "AAPL", searchParams.get("tf") ?? "1Day") ?? []);
  const [liveCandle, setLiveCandle] = useState<Candle | null>(null);
  const [liveQuote, setLiveQuote] = useState<Quote | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !getCached(searchParams.get("symbol") ?? "AAPL", searchParams.get("tf") ?? "1Day"));
  const [prefsResolved, setPrefsResolved] = useState(() => !!searchParams.get("symbol"));
  const [refreshKey, setRefreshKey] = useState(0);
  const [symbolSearch, setSymbolSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SymbolResult[]>(DEFAULT_RESULTS);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSymbolDropdown, setShowSymbolDropdown] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const candleRequestIdRef = useRef(0);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePrefDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadCandles = useCallback(() => {
    setError(null);
    if (!getCached(symbol, timeframe)) setLoading(true);
    const requestId = ++candleRequestIdRef.current;
    const requestedSymbol = symbol;
    const requestedTimeframe = timeframe;
    api
      .candles(requestedSymbol, requestedTimeframe)
      .then((data) => {
        if (candleRequestIdRef.current !== requestId) return; // superseded by a newer request
        setCached(requestedSymbol, requestedTimeframe, data);
        setCandles(data);
        setLoading(false);
      })
      .catch((e) => {
        if (candleRequestIdRef.current !== requestId) return;
        setError((e as Error).message);
        setLoading(false);
      });
  }, [symbol, timeframe]);

  const loadAccount = useCallback(() => {
    api.positions().then(setPositions).catch(() => {});
    api.account().then(setAccount).catch(() => {});
  }, []);

  // Load saved symbol/timeframe from DB on first mount
  useEffect(() => {
    api.getPreferences().then((prefs: UserPreference) => {
      const urlSymbol = searchParams.get("symbol");
      const urlTf = searchParams.get("tf");
      const resolvedSymbol = urlSymbol ?? prefs.last_symbol;
      const resolvedTf = urlTf ?? prefs.last_timeframe;
      if (!urlSymbol) {
        setSymbol(resolvedSymbol);
        setSymbolName(
          prefs.last_symbol_name ??
          DEFAULT_RESULTS.find((r) => r.symbol === resolvedSymbol)?.name ??
          ""
        );
      }
      if (!urlTf) setTimeframe(resolvedTf);
      // Re-derive candles/loading for the resolved symbol so we don't render
      // a stale frame (old symbol's candles paired with the new label).
      if (!urlSymbol || !urlTf) {
        const cached = getCached(resolvedSymbol, resolvedTf);
        setCandles(cached ?? []);
        setLoading(!cached);
      }
    }).catch(() => {}).finally(() => setPrefsResolved(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce-save symbol/name/timeframe changes to DB
  useEffect(() => {
    if (savePrefDebounceRef.current) clearTimeout(savePrefDebounceRef.current);
    savePrefDebounceRef.current = setTimeout(() => {
      api.savePreferences({ last_symbol: symbol, last_symbol_name: symbolName, last_timeframe: timeframe }).catch(() => {});
    }, 1000);
  }, [symbol, symbolName, timeframe]);

  useEffect(() => { loadCandles(); }, [loadCandles]);

  useEffect(() => {
    loadAccount();
    const id = setInterval(loadAccount, 15000);
    return () => clearInterval(id);
  }, [loadAccount]);

  useEffect(() => {
    setLiveQuote(null);
    let cancelled = false;
    let ws: WebSocket;
    api.streamUrl(symbol).then((url) => {
      if (cancelled) return;
      ws = new WebSocket(url);
      ws.onopen = () => { if (cancelled) ws.close(); };
      ws.onmessage = (ev) => {
        if (cancelled) return;
        const msg = JSON.parse(ev.data);
        if (msg.type === "bar") setLiveCandle(msg.candle as Candle);
        if (msg.type === "quote") setLiveQuote(msg.quote as Quote);
      };
      wsRef.current = ws;
    });
    return () => {
      cancelled = true;
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, [symbol]);

  const onOrderPlaced = () => {
    loadAccount();
    setTimeout(() => setRefreshKey((k) => k + 1), 1500);
  };

  const handleSymbolSelect = (sym: string, name = "") => {
    const upper = sym.toUpperCase();
    setSymbol(upper);
    setSymbolName(name);
    setSymbolSearch("");
    setShowSymbolDropdown(false);
    const params = new URLSearchParams(searchParams.toString());
    params.set("symbol", upper);
    router.replace(`/chart?${params.toString()}`);
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

  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border bg-panel px-4 py-3 gap-4 shrink-0">
        {/* Left: Timeframe selector */}
        <div className="flex items-center gap-3">
          <select
            value={timeframe}
            onChange={(e) => {
              setTimeframe(e.target.value);
              const params = new URLSearchParams(searchParams.toString());
              params.set("tf", e.target.value);
              router.replace(`/chart?${params.toString()}`);
            }}
            className="rounded border border-border bg-bg px-2 py-2 text-sm text-white outline-none focus:border-accent cursor-pointer"
          >
            {TIMEFRAMES.map((tf) => (
              <option key={tf.value} value={tf.value}>{tf.label}</option>
            ))}
          </select>
        </div>

        {/* Right: Ticker Search */}
        <div className="relative w-72">
          <div className="flex items-center gap-2 rounded border border-border bg-bg px-3 py-2 focus-within:border-accent">
            <span className="text-muted">
              <IconSearch />
            </span>
            <input
              type="text"
              placeholder="Search symbol/name"
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
                  handleSymbolSelect(match?.symbol ?? typed, match?.name ?? "");
                }
                if (e.key === "Escape") setShowSymbolDropdown(false);
              }}
              className="flex-1 bg-transparent text-sm outline-none text-white placeholder:text-muted"
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
                  onClick={() => handleSymbolSelect(r.symbol, r.name)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent/20 border-b border-border last:border-b-0 flex items-baseline gap-2"
                >
                  <span className="font-mono text-white min-w-[3.5rem]">
                    <HighlightMatch text={r.symbol} query={symbolSearch} />
                  </span>
                  <span className="text-xs text-muted truncate">{r.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="grid flex-1 grid-rows-1 grid-cols-[1fr_320px] gap-3 overflow-hidden p-3">
        {/* Left: chart */}
        <div className="flex flex-col overflow-hidden">
          <div className="relative flex-1 rounded-lg border border-border bg-bg overflow-hidden">
            {error ? (
              <div className="flex h-full items-center justify-center text-sm text-down">{error}</div>
            ) : loading || !prefsResolved ? (
              <div className="flex h-full items-center justify-center">
                <div className="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin" />
              </div>
            ) : candles.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center px-4">
                <div className="text-sm font-medium text-white">No chart data for {symbol}</div>
                <p className="max-w-xs text-xs text-muted">
                  We couldn&apos;t find any candles for this symbol/timeframe. Try a different symbol or timeframe.
                </p>
              </div>
            ) : (
              <Chart candles={candles} liveCandle={liveCandle} symbol={symbol} />
            )}
          </div>
        </div>

        {/* Right: quote + order panel + positions */}
        <div className="flex flex-col gap-3 overflow-auto">
          {prefsResolved && <QuoteCard symbol={symbol} symbolName={symbolName} candles={candles} liveQuote={liveQuote} />}
          <OrderPanel
            symbol={symbol}
            onOrderPlaced={onOrderPlaced}
            buyingPower={account?.buying_power ?? null}
            price={liveQuote?.price ?? candles[candles.length - 1]?.close ?? null}
          />
          <PositionsTable positions={positions} />
        </div>
      </div>
    </main>
  );
}
