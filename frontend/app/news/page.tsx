"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { api, MarketInsight, NewsArticle } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

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

function HeadlineSkeleton() {
  return (
    <li className="flex items-center gap-3 rounded px-2 py-4">
      <div className="h-24 w-24 shrink-0 animate-pulse rounded bg-border/40" />
      <div className="min-w-0 flex-1">
        <div className="h-3.5 w-32 animate-pulse rounded bg-border/40" />
        <div className="mt-2 h-4 w-full max-w-md animate-pulse rounded bg-border/40" />
        <div className="mt-1.5 h-4 w-2/3 max-w-sm animate-pulse rounded bg-border/40" />
      </div>
    </li>
  );
}

export default function NewsPage() {
  const { isAdmin } = useAuth();
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [insight, setInsight] = useState<MarketInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNews = () => {
    setLoadingArticles(true);
    setInsightLoading(true);
    setError(null);
    setInsight(null);

    api
      .marketArticles()
      .then(setArticles)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoadingArticles(false));

    api
      .marketInsight()
      .then(setInsight)
      .catch(() => {})
      .finally(() => setInsightLoading(false));
  };

  const regenerateInsight = () => {
    setRegenerating(true);
    api
      .marketInsight(true)
      .then(setInsight)
      .catch(() => {})
      .finally(() => setRegenerating(false));
  };

  useEffect(() => {
    loadNews();
  }, []);

  const highlighted = new Set(insight?.highlighted_urls ?? []);

  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center justify-between min-h-[60px] border-b border-auth-field/40 bg-panel px-4 py-3 shrink-0">
        <div>
          <div className="text-xl font-normal text-fg">News</div>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={regenerateInsight}
            disabled={regenerating}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-fg disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} />
            {regenerating ? "Regenerating…" : "Regenerate Insights"}
          </button>
        )}
      </header>

      <div className="flex-1 overflow-auto p-3">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {error && (
            <div className="rounded-lg border border-down/40 bg-down/10 px-4 py-2 text-sm text-down">{error}</div>
          )}

          {insightLoading ? (
            <div className="rounded-lg border border-border bg-panel p-4">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-pulse rounded bg-border/40" />
                <div className="h-4 w-20 animate-pulse rounded bg-border/40" />
                <div className="h-5 w-16 animate-pulse rounded-full bg-border/40" />
              </div>
              <div className="mt-3 h-3.5 w-full animate-pulse rounded bg-border/40" />
              <div className="mt-1.5 h-3.5 w-4/5 animate-pulse rounded bg-border/40" />
            </div>
          ) : insight ? (
            <div className="rounded-lg border border-border bg-panel p-4">
              <div className="mb-2 flex items-center gap-2">
                <Sparkles
                  className="h-4 w-4 shrink-0"
                  stroke="url(#insights-twinkle-grad)"
                  strokeWidth={1.25}
                  fill="url(#insights-twinkle-grad)"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="insights-twinkle-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#6d54b5" />
                      <stop offset="100%" stopColor="#c1487f" />
                    </linearGradient>
                  </defs>
                </Sparkles>
                <span className="bg-gradient-to-r from-[#6d54b5] to-[#c1487f] bg-clip-text text-sm font-semibold text-transparent">
                  Insights
                </span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${SENTIMENT_STYLE[insight.sentiment]}`}>
                  {insight.sentiment}
                </span>
              </div>
              <p className="mb-2 text-sm text-fg">{insight.advice}</p>
              {insight.rationale.length > 0 && (
                <ul className="list-disc pl-5 text-xs text-muted">
                  {insight.rationale.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          <div className="rounded-lg border border-border bg-panel p-4">
            <div className="mb-3 text-sm font-semibold tracking-wide text-muted">Headlines</div>
            {loadingArticles ? (
              <ul className="flex flex-col divide-y divide-border/60">
                {Array.from({ length: 5 }).map((_, i) => (
                  <HeadlineSkeleton key={i} />
                ))}
              </ul>
            ) : articles.length === 0 ? (
              <p className="text-xs text-muted">No recent headlines found.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border/60">
                {articles.map((a) => {
                  const isHighlighted = highlighted.has(a.url);
                  return (
                    <li
                      key={a.url}
                      className={`flex items-center gap-3 rounded px-2 py-4 text-base ${
                        isHighlighted ? "bg-accent/10" : ""
                      }`}
                    >
                      {a.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={a.thumbnail_url}
                          alt=""
                          className="h-24 w-24 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <div className="h-24 w-24 shrink-0 rounded bg-border/40" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-muted">
                          {a.publisher} · {timeAgo(a.published_at)}
                        </div>
                        <div className="mt-0.5 flex items-start gap-1.5">
                          {isHighlighted && <span className="shrink-0 text-accent" title="Called out by uWick">★</span>}
                          <a
                            href={a.url}
                            target="_blank"
                            rel="noreferrer"
                            className="line-clamp-2 leading-tight text-fg hover:underline"
                          >
                            {a.title}
                          </a>
                        </div>
                        {!!a.related_tickers?.length && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {a.related_tickers.map((t) => (
                              <span
                                key={t}
                                className="rounded bg-border/40 px-1.5 py-0.5 text-[11px] font-medium text-muted"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
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
