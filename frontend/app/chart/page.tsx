"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { api, Account, Candle, Position } from "@/lib/api";
import OrderPanel from "@/components/OrderPanel";
import PositionsTable from "@/components/PositionsTable";
import TradeJournal from "@/components/TradeJournal";

const Chart = dynamic(() => import("@/components/Chart"), { ssr: false });

const TIMEFRAMES = ["1Min", "5Min", "15Min", "1Hour", "1Day"];
const COMMON_SYMBOLS = ["AAPL", "MSFT", "GOOGL", "TSLA", "AMZN", "NVDA"];

export default function ChartPage() {
  const router = useRouter();
  const [symbol, setSymbol] = useState("AAPL");
  const [timeframe, setTimeframe] = useState("1Day");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [liveCandle, setLiveCandle] = useState<Candle | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [symbolSearch, setSymbolSearch] = useState(symbol);
  const [showSymbolDropdown, setShowSymbolDropdown] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const loadCandles = useCallback(() => {
    setError(null);
    api
      .candles(symbol, timeframe)
      .then(setCandles)
      .catch((e) => setError((e as Error).message));
  }, [symbol, timeframe]);

  const loadAccount = useCallback(() => {
    api.positions().then(setPositions).catch(() => {});
    api.account().then(setAccount).catch(() => {});
  }, []);

  useEffect(() => {
    loadCandles();
  }, [loadCandles]);

  useEffect(() => {
    loadAccount();
    const id = setInterval(loadAccount, 15000);
    return () => clearInterval(id);
  }, [loadAccount]);

  useEffect(() => {
    wsRef.current?.close();
    const ws = new WebSocket(api.streamUrl(symbol));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "bar") setLiveCandle(msg.candle as Candle);
    };
    wsRef.current = ws;
    return () => ws.close();
  }, [symbol]);

  const onOrderPlaced = () => {
    loadAccount();
    setTimeout(() => setRefreshKey((k) => k + 1), 1500);
  };

  const handleSymbolSelect = (sym: string) => {
    setSymbol(sym.toUpperCase());
    setSymbolSearch(sym.toUpperCase());
    setShowSymbolDropdown(false);
  };

  useEffect(() => {
    setSymbolSearch(symbol);
  }, [symbol]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showMenu && !(e.target as HTMLElement).closest("button")) {
        setShowMenu(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showMenu]);

  const filteredSymbols = symbolSearch
    ? COMMON_SYMBOLS.filter((s) =>
        s.toUpperCase().includes(symbolSearch.toUpperCase())
      )
    : COMMON_SYMBOLS;

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border bg-panel px-4 py-3 gap-4">
        {/* Left: Hamburger + Search */}
        <div className="flex items-center gap-3">
          {/* Hamburger Menu */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="flex flex-col gap-1.5 p-2 hover:bg-accent/20 rounded transition-colors"
            >
              <div className="w-6 h-0.5 bg-white rounded"></div>
              <div className="w-6 h-0.5 bg-white rounded"></div>
              <div className="w-6 h-0.5 bg-white rounded"></div>
            </button>

            {/* Dropdown Menu */}
            {showMenu && (
              <div className="absolute top-full left-0 mt-2 bg-panel border border-border rounded shadow-lg z-50 w-48">
                <button
                  onClick={() => {
                    router.push("/chart");
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-accent/20 border-b border-border text-white"
                >
                  📈 Chart
                </button>
                <button
                  onClick={() => {
                    router.push("/journal");
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-accent/20 border-b border-border text-white"
                >
                  📋 Journal
                </button>
                <button
                  onClick={() => {
                    router.push("/settings");
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-accent/20 text-white"
                >
                  ⚙️ Settings
                </button>
              </div>
            )}
          </div>

          {/* Ticker Search Bar */}
          <div className="relative w-56">
            <input
              type="text"
              placeholder="Search ticker..."
              value={symbolSearch}
              onChange={(e) => {
                setSymbolSearch(e.target.value);
                setShowSymbolDropdown(true);
              }}
              onFocus={() => setShowSymbolDropdown(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && symbolSearch) {
                  handleSymbolSelect(symbolSearch);
                }
              }}
              className="w-full rounded border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
            />
            {showSymbolDropdown && (symbolSearch || filteredSymbols.length > 0) && (
              <div className="absolute top-full left-0 right-0 mt-1 rounded border border-border bg-panel shadow-lg z-30">
                {(symbolSearch ? filteredSymbols : COMMON_SYMBOLS).map((sym) => (
                  <button
                    key={sym}
                    onClick={() => handleSymbolSelect(sym)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-accent/20 border-b border-border last:border-b-0"
                  >
                    {sym}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Account Info */}
        {account && (
          <div className="flex gap-8 text-xs">
            <div>
              <div className="text-muted">Equity</div>
              <div className="text-white font-semibold">
                ${account.equity.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-muted">Buying power</div>
              <div className="text-white font-semibold">
                ${account.buying_power.toLocaleString()}
              </div>
            </div>
          </div>
        )}
      </header>

      <div className="grid flex-1 grid-cols-[1fr_320px] gap-3 overflow-hidden p-3">
        {/* Left: controls + content */}
        <div className="flex flex-col gap-3 overflow-hidden">
          {/* Timeframe controls */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-lg font-semibold text-white">{symbol}</span>
            <div className="flex gap-1">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`rounded px-2 py-1 text-xs font-semibold ${
                    timeframe === tf
                      ? "bg-accent text-white"
                      : "bg-border text-muted hover:bg-accent/30"
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {/* Chart Content */}
          <div className="relative flex-1 rounded-lg border border-border bg-bg overflow-hidden">
            {error ? (
              <div className="flex h-full items-center justify-center text-sm text-down">
                {error}
              </div>
            ) : (
              <Chart candles={candles} liveCandle={liveCandle} />
            )}
          </div>
        </div>

        {/* Right: order panel + positions */}
        <div className="flex flex-col gap-3 overflow-auto">
          <OrderPanel
            symbol={symbol}
            onSymbolChange={setSymbol}
            onOrderPlaced={onOrderPlaced}
          />
          <PositionsTable positions={positions} />
        </div>
      </div>
    </main>
  );
}
