"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
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
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [insight, setInsight] = useState<MarketInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(true);
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
      </header>

      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
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
            <div className="relative overflow-hidden rounded-lg border border-accent/30 bg-panel p-4">
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/20 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-fuchsia-500/15 blur-3xl" />
              <div className="relative mb-2 flex items-center gap-2">
                <Sparkles className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300" />
                <span className="text-sm font-semibold text-violet-600 dark:text-violet-300">Insights</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${SENTIMENT_STYLE[insight.sentiment]}`}>
                  {insight.sentiment}
                </span>
              </div>
              <p className="relative mb-2 text-sm text-fg">{insight.advice}</p>
              {insight.rationale.length > 0 && (
                <ul className="relative list-disc pl-5 text-xs text-muted">
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
