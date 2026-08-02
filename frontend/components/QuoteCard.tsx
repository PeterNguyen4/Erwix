"use client";

import { useEffect, useRef, useState } from "react";
import { api, Candle, Quote } from "@/lib/api";

interface QuoteCardProps {
  symbol: string;
  symbolName: string;
  candles: Candle[];
  liveQuote?: Quote | null;
}

export default function QuoteCard({ symbol, symbolName, candles, liveQuote }: QuoteCardProps) {
  const [polledQuote, setPolledQuote] = useState<Quote | null>(null);
  const liveQuoteRef = useRef(liveQuote);
  liveQuoteRef.current = liveQuote;

  // Initial snapshot + fallback polling for when the live stream is unavailable
  // (e.g. missing/expired Alpaca stream auth). Skipped once liveQuote is arriving.
  useEffect(() => {
    setPolledQuote(null);
    let cancelled = false;
    const load = () => {
      if (liveQuoteRef.current) return;
      api.quote(symbol).then((q) => { if (!cancelled) setPolledQuote(q); }).catch(() => {});
    };
    load();
    const id = setInterval(load, 10000);
    return () => { cancelled = true; clearInterval(id); };
  }, [symbol]);

  const quote = liveQuote ?? polledQuote;

  const price = quote?.price ?? candles[candles.length - 1]?.close ?? null;
  const prevClose = candles[candles.length - 2]?.close ?? null;

  const change = price != null && prevClose != null ? price - prevClose : null;
  const changePct = change != null && prevClose ? (change / prevClose) * 100 : null;
  const up = change == null || change >= 0;

  const fmt = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      {/* Symbol + name */}
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-base font-bold text-fg font-mono">{symbol}</span>
        {symbolName && <span className="text-xs text-muted truncate">{symbolName}</span>}
      </div>

      {/* Price */}
      <div className="flex items-baseline gap-3 mb-3">
        {price != null ? (
          <>
            <span className="text-2xl font-bold text-fg">${fmt(price)}</span>
            {change != null && changePct != null && (
              <span className={`text-sm font-semibold ${up ? "text-up" : "text-down"}`}>
                {up ? "+" : ""}{fmt(change)} ({up ? "+" : ""}{changePct.toFixed(2)}%)
              </span>
            )}
          </>
        ) : (
          <span className="text-2xl font-bold text-muted">—</span>
        )}
      </div>

      {/* Bid / Ask */}
      {(quote?.bid != null || quote?.ask != null) && (
        <div className="flex gap-4 text-xs border-t border-border pt-2">
          <div>
            <div className="text-muted mb-0.5">Bid</div>
            <div className="text-fg">{quote.bid != null ? fmt(quote.bid) : "—"}</div>
          </div>
          <div>
            <div className="text-muted mb-0.5">Ask</div>
            <div className="text-fg">{quote.ask != null ? fmt(quote.ask) : "—"}</div>
          </div>
          {quote.bid != null && quote.ask != null && (
            <div>
              <div className="text-muted mb-0.5">Spread</div>
              <div className="text-fg">{fmt(quote.ask - quote.bid)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
