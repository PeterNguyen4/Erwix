"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, X } from "lucide-react";
import { api, Quote, SymbolResult, WatchlistItem } from "@/lib/api";

const fmtUsd = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

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

interface Row extends WatchlistItem {
  quote: Quote | null;
  prevClose: number | null;
}

export default function Watchlist() {
  const router = useRouter();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [prevCloses, setPrevCloses] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SymbolResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = () => {
    api
      .watchlist()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(reload, []);

  useEffect(() => {
    if (items.length === 0) return;
    let cancelled = false;
    const fetchQuotes = () => {
      items.forEach((item) => {
        api
          .quote(item.symbol)
          .then((q) => !cancelled && setQuotes((prev) => ({ ...prev, [item.symbol]: q })))
          .catch(() => {});
        if (prevCloses[item.symbol] == null) {
          api
            .candles(item.symbol, "1Day")
            .then((candles) => {
              if (cancelled || candles.length < 2) return;
              setPrevCloses((prev) => ({ ...prev, [item.symbol]: candles[candles.length - 2].close }));
            })
            .catch(() => {});
        }
      });
    };
    fetchQuotes();
    const id = setInterval(fetchQuotes, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  useEffect(() => {
    if (query.trim().length < 1) {
      setResults([]);
      return;
    }
    const id = setTimeout(() => {
      api
        .searchSymbols(query.trim())
        .then(setResults)
        .catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(id);
  }, [query]);

  const addSymbol = async (symbol: string) => {
    try {
      await api.addWatchlistItem(symbol);
      setAdding(false);
      setQuery("");
      setResults([]);
      reload();
    } catch {
      // symbol already on watchlist or invalid — silently ignore
    }
  };

  const removeSymbol = async (symbol: string) => {
    await api.removeWatchlistItem(symbol).catch(() => {});
    setItems((prev) => prev.filter((i) => i.symbol !== symbol));
  };

  const rows: Row[] = items.map((item) => ({
    ...item,
    quote: quotes[item.symbol] ?? null,
    prevClose: prevCloses[item.symbol] ?? null,
  }));

  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-muted">Watchlist</h2>
        <button
          onClick={() => {
            setAdding((a) => !a);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-fg"
        >
          <Plus size={12} strokeWidth={2.5} />
          Add
        </button>
      </div>

      {adding && (
        <div className="relative mb-3">
          <div className="flex items-center gap-2 rounded border border-border bg-field px-3 py-2 focus-within:border-violet-400">
            <span className="text-muted">
              <Search size={14} strokeWidth={2} className="shrink-0" />
            </span>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter" && query.trim()) addSymbol(query.trim());
                if (e.key === "Escape") setAdding(false);
              }}
              placeholder="Search symbol/name"
              className="flex-1 bg-transparent text-sm outline-none text-fg placeholder:text-muted"
            />
          </div>
          {results.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded border border-border bg-panel shadow-lg">
              {results.map((r) => (
                <button
                  key={r.symbol}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addSymbol(r.symbol)}
                  className="flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm hover:bg-violet-500/15"
                >
                  <span className="font-mono text-fg min-w-[3.5rem]">
                    <HighlightMatch text={r.symbol} query={query} />
                  </span>
                  <span className="text-xs text-muted truncate">{r.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex-1 divide-y divide-border">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-2.5">
              <div className="h-3.5 w-12 animate-pulse rounded bg-border/40" />
              <div className="h-3.5 w-16 animate-pulse rounded bg-border/40" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted">No symbols yet. Add one to track it here.</p>
      ) : (
        <div className="flex-1 divide-y divide-border overflow-auto">
          {rows.map((r) => {
            const price = r.quote?.price ?? null;
            const change = price != null && r.prevClose ? price - r.prevClose : null;
            const changePct = change != null && r.prevClose ? (change / r.prevClose) * 100 : null;
            const up = (change ?? 0) >= 0;
            return (
              <div key={r.symbol} className="group flex items-center justify-between py-2.5">
                <button
                  onClick={() => router.push(`/chart?symbol=${r.symbol}`)}
                  className="min-w-0 flex-1 text-left font-semibold text-fg hover:text-accent"
                >
                  {r.symbol}
                </button>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <div className="tabular-nums text-fg">{price != null ? fmtUsd(price) : "—"}</div>
                    {changePct != null && (
                      <div className={`text-xs tabular-nums ${up ? "text-up" : "text-down"}`}>
                        {up ? "+" : ""}
                        {changePct.toFixed(2)}%
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => removeSymbol(r.symbol)}
                    className="opacity-0 transition-opacity group-hover:opacity-100 text-muted hover:text-down"
                  >
                    <X size={14} strokeWidth={2} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
