"use client";

import { useEffect, useState } from "react";
import { api, NewsArticle, NewsInsight } from "@/lib/api";

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

type InsightState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; insight: NewsInsight };

export default function NewsPage() {
  const [symbolInput, setSymbolInput] = useState("AAPL, MSFT, NVDA");
  const [symbols, setSymbols] = useState<string[]>([]);
  const [articlesBySymbol, setArticlesBySymbol] = useState<Record<string, NewsArticle[]>>({});
  const [insights, setInsights] = useState<Record<string, InsightState>>({});
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNews = () => {
    const parsed = symbolInput
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (parsed.length === 0) return;

    setSymbols(parsed);
    setArticlesBySymbol({});
    setInsights({});
    setError(null);
    setLoadingArticles(true);

    // Show the raw headlines the moment they're scraped — don't make the
    // trader wait on the agent's LLM call (one per symbol) before seeing
    // anything. Advice fills in per-card afterward, independently.
    api
      .newsArticles(parsed)
      .then((articles) => {
        const grouped: Record<string, NewsArticle[]> = {};
        for (const symbol of parsed) grouped[symbol] = articles.filter((a) => a.symbol === symbol);
        setArticlesBySymbol(grouped);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoadingArticles(false));

    for (const symbol of parsed) {
      setInsights((prev) => ({ ...prev, [symbol]: { status: "loading" } }));
      api
        .newsInsight(symbol)
        .then((insight) => setInsights((prev) => ({ ...prev, [symbol]: { status: "ready", insight } })))
        .catch((e) =>
          setInsights((prev) => ({ ...prev, [symbol]: { status: "error", message: (e as Error).message } })),
        );
    }
  };

  useEffect(() => {
    loadNews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="flex h-full flex-col">
      <header className="border-b border-border bg-panel px-4 py-3 shrink-0">
        <div className="text-xl font-semibold text-white">News</div>
        <div className="text-xs text-muted">
          Recent headlines per symbol, with uWick's read against your Strategy tab archetype
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-4xl flex-col gap-4">
          <div className="flex gap-2">
            <input
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadNews()}
              placeholder="AAPL, MSFT, NVDA"
              className="flex-1 rounded-md border border-border bg-panel px-3 py-2 text-sm text-white placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <button
              onClick={loadNews}
              disabled={loadingArticles}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent/80 disabled:opacity-50"
            >
              {loadingArticles ? "Scanning…" : "Scan"}
            </button>
          </div>

          {error && (
            <div className="rounded-lg border border-down/40 bg-down/10 px-4 py-2 text-sm text-down">{error}</div>
          )}

          {!loadingArticles && !error && symbols.length === 0 && (
            <p className="py-12 text-center text-sm text-muted">
              Enter one or more symbols above and hit Scan for a news read.
            </p>
          )}

          {symbols.map((symbol) => {
            const articles = articlesBySymbol[symbol] ?? [];
            const insightState = insights[symbol];
            return (
              <div key={symbol} className="rounded-lg border border-border bg-panel p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-base font-bold text-white">{symbol}</span>
                  {insightState?.status === "ready" && (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${SENTIMENT_STYLE[insightState.insight.sentiment]}`}>
                      {insightState.insight.sentiment}
                    </span>
                  )}
                </div>

                {/* Raw headlines render as soon as they're scraped, independent of the agent. */}
                {loadingArticles ? (
                  <p className="mb-3 text-xs text-muted">Fetching headlines…</p>
                ) : articles.length === 0 ? (
                  <p className="mb-3 text-xs text-muted">No recent headlines found.</p>
                ) : (
                  <ul className="mb-3 flex flex-col gap-1">
                    {articles.map((a) => (
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
                )}

                {/* uWick's take fills in independently per symbol once its LLM call resolves. */}
                <div className="border-t border-border pt-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">uWick's Take</div>
                  {!insightState || insightState.status === "loading" ? (
                    <p className="text-xs text-muted">Reading the headlines…</p>
                  ) : insightState.status === "error" ? (
                    <p className="text-xs text-down">{insightState.message}</p>
                  ) : (
                    <>
                      <p className="mb-2 text-sm text-white">{insightState.insight.advice}</p>
                      {insightState.insight.rationale.length > 0 && (
                        <ul className="list-disc pl-5 text-xs text-muted">
                          {insightState.insight.rationale.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
