"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import TradeJournal from "@/components/TradeJournal";

export default function JournalPage() {
  const [refreshKey] = useState(0);

  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center border-b border-border bg-panel px-4 py-3 shrink-0">
        <div className="text-xl font-semibold text-white">Trade Journal</div>
      </header>

      <div className="flex-1 overflow-hidden p-3">
        <div className="h-full rounded-lg border border-border bg-bg overflow-auto">
          <TradeJournal refreshKey={refreshKey} />
        </div>
      </div>
    </main>
  );
}
