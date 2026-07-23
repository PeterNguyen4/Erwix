"use client";

import { useEffect, useRef, useState } from "react";
import { api, ChartAnnotation, RuleWatchEvent } from "./api";

export interface RuleSignal {
  id: string;
  kind: "entry" | "exit";
  description: string;
  annotation: ChartAnnotation;
}

/**
 * Opens WS /api/agent/watch/{symbol} and collects edge-triggered rule
 * signals for the current symbol/timeframe. Mirrors the market-data WS
 * effect in app/chart/page.tsx (cancelled-flag + onmessage + cleanup).
 */
export function useRuleWatch(symbol: string, timeframe: string) {
  const [signals, setSignals] = useState<RuleSignal[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket;
    api.ruleWatchUrl(symbol, timeframe).then((url) => {
      if (cancelled) return;
      ws = new WebSocket(url);
      ws.onopen = () => { if (cancelled) ws.close(); };
      ws.onmessage = (ev) => {
        if (cancelled) return;
        const msg = JSON.parse(ev.data) as RuleWatchEvent;
        if (msg.type === "signal") {
          setSignals((prev) => [
            ...prev,
            { id: `${Date.now()}-${prev.length}`, kind: msg.kind, description: msg.description, annotation: msg.annotation },
          ]);
        }
      };
      wsRef.current = ws;
    });
    return () => {
      cancelled = true;
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, [symbol, timeframe]);

  const dismiss = (id: string) => setSignals((prev) => prev.filter((s) => s.id !== id));

  return { signals, dismiss };
}
