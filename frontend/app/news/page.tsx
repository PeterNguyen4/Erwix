"use client";

import { useEffect, useState } from "react";
import { api, NewsInsight } from "@/lib/api";

const SENTIMENT_STYLE: Record<NewsInsight["sentiment"], string> = {
  bullish: "bg-up/20 text-up",
  bearish: "bg-down/20 text-down",
  neutral: "bg-muted/20 text-muted",
};

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

export default function NewsPage() {
  const [symbolInput, setSymbolInput] = useState("AAPL, MSFT, NVDA");
  const [insights, setInsights] = useState<NewsInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadInsights = () => {
    const symbols = symbolInput
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (symbols.length === 0) return;
    setLoading(true);
    setError(null);
    api
      .newsInsights(symbols)
      .then(setInsights)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="flex h-full flex-col">
      <header className="border-b border-border bg-panel px-4 py-3 shrink-0">
        <div className="text-xl font-semibold text-white">News</div>
        <div className="text-xs text-muted">
          Recent headlines per symbol, judged against your Strategy tab archetype
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-4xl flex-col gap-4">
          <div className="flex gap-2">
            <input
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadInsights()}
              placeholder="AAPL, MSFT, NVDA"
              className="flex-1 rounded-md border border-border bg-panel px-3 py-2 text-sm text-white placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <button
              onClick={loadInsights}
              disabled={loading}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent/80 disabled:opacity-50"
            >
              {loading ? "Scanning…" : "Scan"}
            </button>
          </div>

          {error && (
            <div className="rounded-lg border border-down/40 bg-down/10 px-4 py-2 text-sm text-down">{error}</div>
          )}

          {!loading && !error && insights.length === 0 && (
            <p className="py-12 text-center text-sm text-muted">
              Enter one or more symbols above and hit Scan for a news read.
            </p>
          )}

          {insights.map((insight) => (
            <div key={insight.symbol} className="rounded-lg border border-border bg-panel p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-base font-bold text-white">{insight.symbol}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${SENTIMENT_STYLE[insight.sentiment]}`}>
                  {insight.sentiment}
                </span>
              </div>

              <p className="mb-2 text-sm text-white">{insight.advice}</p>

              {insight.rationale.length > 0 && (
                <ul className="mb-3 list-disc pl-5 text-xs text-muted">
                  {insight.rationale.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}

              {insight.articles.length > 0 && (
                <div className="border-t border-border pt-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">Sources</div>
                  <ul className="flex flex-col gap-1">
                    {insight.articles.map((a) => (
                      <li key={a.url} className="flex items-baseline gap-2 text-xs">
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate text-white hover:text-accent hover:underline"
                        >
                          {a.title}
                        </a>
                        <span className="shrink-0 text-muted">
                          {a.publisher} · {timeAgo(a.published_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
