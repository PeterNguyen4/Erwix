"use client";

import { useEffect, useState } from "react";
import { api, DebriefStatus } from "@/lib/api";

const POLL_MS = 60_000;

/** Polls whether the analyst has new fills to debrief — drives the sidebar badge. */
export function useDebriefStatus() {
  const [status, setStatus] = useState<DebriefStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      api
        .debriefStatus()
        .then((s) => { if (!cancelled) setStatus(s); })
        .catch(() => { /* best-effort — badge just stays hidden */ });
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return {
    hasNewTrades: status?.has_new_trades ?? false,
    newTradeCount: status?.new_trade_count ?? 0,
    lastDebriefAt: status?.last_debrief_at ?? null,
    refresh: () => api.debriefStatus().then(setStatus).catch(() => {}),
  };
}
