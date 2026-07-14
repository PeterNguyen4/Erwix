"use client";

import { useEffect, useState } from "react";
import { api, DebriefReport } from "@/lib/api";

const POLL_MS = 30_000;

/** Polls the latest background-generated DebriefReport — drives the journal
 * banner's pending/running/ready state and ETA. */
export function useDebriefReport() {
  const [report, setReport] = useState<DebriefReport | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = () => {
      api
        .latestDebriefReport()
        .then((r) => {
          if (cancelled) return;
          setReport(r);
          // Poll faster while a report is actively cooking so the ETA stays fresh.
          timer = setTimeout(poll, r && r.status !== "ready" && r.status !== "error" ? 10_000 : POLL_MS);
        })
        .catch(() => {
          if (!cancelled) timer = setTimeout(poll, POLL_MS);
        });
    };
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return { report, refresh: () => api.latestDebriefReport().then(setReport).catch(() => {}) };
}
