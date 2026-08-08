"use client";

import { useEffect, useState } from "react";
import { api, DebriefRequest, PortfolioPoint } from "@/lib/api";
import JournalCalendar from "@/components/journal/JournalCalendar";
import AnalystDebrief from "@/components/journal/AnalystDebrief";
import SpotlightOverlay from "@/components/journal/SpotlightOverlay";

export default function JournalPage() {
  const [spotlight, setSpotlight] = useState<string | null>(null);
  const [debriefRequest, setDebriefRequest] = useState<DebriefRequest | null>(null);
  const [points, setPoints] = useState<PortfolioPoint[]>([]);

  useEffect(() => {
    api
      .portfolioHistory("all")
      .then((h) => setPoints(h.points))
      .catch(() => setPoints([]));
  }, []);

  return (
    <main className="flex h-full flex-col overflow-hidden">
      <header className="flex min-h-[60px] shrink-0 items-center justify-between border-b border-auth-field/40 bg-panel px-4 py-3">
        <div className="text-xl font-normal text-fg">Journal</div>
      </header>

      <div className="min-h-0 flex-1 p-4">
        <JournalCalendar onDebriefTrade={setDebriefRequest} points={points} />
      </div>

      <SpotlightOverlay targetSelector={spotlight} />

      {debriefRequest && (
        <AnalystDebrief
          request={debriefRequest}
          onClose={() => {
            setDebriefRequest(null);
            setSpotlight(null);
          }}
          onSpotlight={setSpotlight}
        />
      )}
    </main>
  );
}
