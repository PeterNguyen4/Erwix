"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { api, Account, Candle, Position } from "@/lib/api";
import OrderPanel from "@/components/OrderPanel";
import PositionsTable from "@/components/PositionsTable";
import TradeJournal from "@/components/TradeJournal";

// lightweight-charts is browser-only; load without SSR.
const Chart = dynamic(() => import("@/components/Chart"), { ssr: false });

const TIMEFRAMES = ["1Min", "5Min", "15Min", "1Hour", "1Day"];

export default function Page() {
  const [symbol, setSymbol] = useState("AAPL");
  const [timeframe, setTimeframe] = useState("1Day");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [liveCandle, setLiveCandle] = useState<Candle | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
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

  // Live bar stream for the active symbol.
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
    // Give the fill stream a moment, then refresh the journal.
    setTimeout(() => setRefreshKey((k) => k + 1), 1500);
  };

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border bg-panel px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight">Entro</span>
          <span className="text-xs text-muted">paper trading terminal</span>
        </div>
        {account && (
          <div className="flex gap-6 text-xs">
            <span className="text-muted">
              Equity{" "}
              <span className="text-white">
                ${account.equity.toLocaleString()}
              </span>
            </span>
            <span className="text-muted">
              Buying power{" "}
              <span className="text-white">
                ${account.buying_power.toLocaleString()}
              </span>
            </span>
          </div>
        )}
      </header>

      <div className="grid flex-1 grid-cols-[1fr_320px] gap-3 overflow-hidden p-3">
        {/* Left: chart + journal */}
        <div className="flex flex-col gap-3 overflow-hidden">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">{symbol}</span>
            <div className="flex gap-1">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`rounded px-2 py-0.5 text-xs ${
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

          <div className="relative flex-1 rounded-lg border border-border bg-bg">
            {error ? (
              <div className="flex h-full items-center justify-center text-sm text-down">
                {error}
              </div>
            ) : (
              <Chart candles={candles} liveCandle={liveCandle} />
            )}
          </div>

          <TradeJournal refreshKey={refreshKey} />
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
