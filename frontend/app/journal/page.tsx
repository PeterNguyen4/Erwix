"use client";

import { useEffect, useState } from "react";
import { api, DebriefRequest, PortfolioHistory } from "@/lib/api";
import TradeCalendar from "@/components/journal/TradeCalendar";
import JournalEntries from "@/components/journal/JournalEntries";
import AnalystDebrief from "@/components/journal/AnalystDebrief";
import SpotlightOverlay from "@/components/journal/SpotlightOverlay";
import { useDebriefStatus } from "@/lib/useDebriefStatus";

export default function JournalPage() {
  const [history, setHistory] = useState<PortfolioHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spotlight, setSpotlight] = useState<string | null>(null);
  const [debriefRequest, setDebriefRequest] = useState<DebriefRequest | null>(null);
  const { hasNewTrades, newTradeCount, lastDebriefAt, refresh } = useDebriefStatus();

  // History (all-time) drives the calendar's green/red day coloring.
  useEffect(() => {
    api
      .portfolioHistory("1A")
      .then(setHistory)
      .catch((e) => setError((e as Error).message));
  }, []);

  const startDebrief = () => {
    const from = lastDebriefAt ?? new Date(Date.now() - 30 * 86400000).toISOString();
    setDebriefRequest({ from, to: new Date().toISOString() });
  };

  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border bg-panel px-4 py-3 shrink-0">
        <div className="text-xl font-semibold text-white">Journal</div>
        <div className="text-xs text-muted">Paper account</div>
      </header>

      <div className="flex-1 overflow-auto p-4">
        {error && (
          <div className="mb-4 rounded-lg border border-down/40 bg-down/10 px-4 py-2 text-sm text-down">
            {error}
          </div>
        )}

        {hasNewTrades && !debriefRequest && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 animate-fade-in-up">
            <div className="text-sm text-white">
              Your analyst has a debrief ready — {newTradeCount} trade{newTradeCount === 1 ? "" : "s"} since your
              last review.
            </div>
            <button
              onClick={startDebrief}
              className="shrink-0 rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-accent/80"
            >
              Start Debrief
            </button>
          </div>
        )}

        {/* Calendar + full journal */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <TradeCalendar points={history?.points ?? []} />
          </div>
          <div className="lg:col-span-2">
            <JournalEntries refreshKey={0} onDebriefTrade={setDebriefRequest} />
          </div>
        </div>
      </div>

      <SpotlightOverlay targetSelector={spotlight} />

      {debriefRequest && (
        <AnalystDebrief
          request={debriefRequest}
          onClose={() => { setDebriefRequest(null); setSpotlight(null); }}
          onSpotlight={setSpotlight}
          onFinished={refresh}
        />
      )}
    </main>
  );
}
