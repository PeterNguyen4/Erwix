"use client";

import { useEffect, useState } from "react";
import { api, PortfolioHistory } from "@/lib/api";
import TradeCalendar from "@/components/journal/TradeCalendar";
import JournalEntries from "@/components/journal/JournalEntries";

export default function JournalPage() {
  const [history, setHistory] = useState<PortfolioHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  // History (all-time) drives the calendar's green/red day coloring.
  useEffect(() => {
    api
      .portfolioHistory("1A")
      .then(setHistory)
      .catch((e) => setError((e as Error).message));
  }, []);

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

        {/* Calendar + full journal */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <TradeCalendar points={history?.points ?? []} />
          </div>
          <div className="lg:col-span-2">
            <JournalEntries refreshKey={0} />
          </div>
        </div>
      </div>
    </main>
  );
}
