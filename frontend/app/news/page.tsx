"use client";

import { useEffect, useState } from "react";
import { api, MarketInsight, NewsArticle } from "@/lib/api";

const SENTIMENT_STYLE: Record<MarketInsight["sentiment"], string> = {
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
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [insight, setInsight] = useState<MarketInsight | null>(null);
  const [insightError, setInsightError] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadNews = () => {
    setLoadingArticles(true);
    setInsightLoading(true);
    setError(null);
    setInsightError(null);
    setInsight(null);

    // Raw headlines render the moment they're scraped — the agent's read
    // (one LLM call over the whole pool) fills in separately afterward,
    // instead of gating the page on it.
    api
      .marketArticles()
      .then(setArticles)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoadingArticles(false));

    api
      .marketInsight()
      .then(setInsight)
      .catch((e) => setInsightError((e as Error).message))
      .finally(() => setInsightLoading(false));
  };

  useEffect(() => {
    loadNews();
  }, []);

  const highlighted = new Set(insight?.highlighted_urls ?? []);

  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border bg-panel px-4 py-3 shrink-0">
        <div>
          <div className="text-xl font-semibold text-white">News</div>
          <div className="text-xs text-muted">
            The most compelling market-wide stories right now, with uWick's read against your Strategy tab archetype
          </div>
        </div>
        <button
          onClick={loadNews}
          disabled={loadingArticles}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent/80 disabled:opacity-50"
        >
          {loadingArticles ? "Scanning…" : "Refresh"}
        </button>
      </header>

      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {error && (
            <div className="rounded-lg border border-down/40 bg-down/10 px-4 py-2 text-sm text-down">{error}</div>
          )}

          {/* uWick's overall market read */}
          <div className="rounded-lg border border-border bg-panel p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-semibold text-white">uWick's Take</span>
              {insight && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${SENTIMENT_STYLE[insight.sentiment]}`}>
                  {insight.sentiment}
                </span>
              )}
            </div>
            {insightLoading ? (
              <p className="text-xs text-muted">Reading the market…</p>
            ) : insightError ? (
              <p className="text-xs text-down">{insightError}</p>
            ) : insight ? (
              <>
                <p className="mb-2 text-sm text-white">{insight.advice}</p>
                {insight.rationale.length > 0 && (
                  <ul className="list-disc pl-5 text-xs text-muted">
                    {insight.rationale.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
              </>
            ) : null}
          </div>

          {/* Raw headline pool — the ones uWick called out above are highlighted. */}
          <div className="rounded-lg border border-border bg-panel p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Headlines</div>
            {loadingArticles ? (
              <p className="text-xs text-muted">Fetching headlines…</p>
            ) : articles.length === 0 ? (
              <p className="text-xs text-muted">No recent headlines found.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {articles.map((a) => {
                  const isHighlighted = highlighted.has(a.url);
                  return (
                    <li
                      key={a.url}
                      className={`flex items-baseline gap-2 rounded px-2 py-1 text-sm ${
                        isHighlighted ? "bg-accent/10" : ""
                      }`}
                    >
                      {isHighlighted && <span className="shrink-0 text-accent" title="Called out by uWick">★</span>}
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-white hover:text-accent hover:underline"
                      >
                        {a.title}
                      </a>
                      <span className="shrink-0 text-xs text-muted">
                        {a.publisher} · {timeAgo(a.published_at)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
