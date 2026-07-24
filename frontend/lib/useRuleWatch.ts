"use client";

import { useEffect, useRef, useState } from "react";
import { api, ChartAnnotation, RuleWatchEvent } from "./api";
import type { BracketLevels } from "@/components/Chart";

export interface RuleSignal {
  id: string;
  kind: "entry" | "exit";
  description: string;
  annotation: ChartAnnotation;
}

function sendLevels(ws: WebSocket, bracket: BracketLevels | null) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    type: "set_levels",
    entry_price: bracket?.entryPrice ?? null,
    stop_loss_price: bracket?.stopLossPrice ?? null,
    take_profit_price: bracket?.takeProfitPrice ?? null,
  }));
}

/**
 * Opens WS /api/agent/watch/{symbol} and collects edge-triggered rule
 * signals plus stop-loss/take-profit breach signals for the current
 * symbol/timeframe. The server evaluates on every live quote tick (not a
 * poll timer), so signals arrive within roughly one tick; `refreshSeconds`
 * only controls how often the server backstops with a fresh REST candle
 * fetch. Mirrors the market-data WS effect in app/chart/page.tsx
 * (cancelled-flag + onmessage + cleanup). `bracket` is the trader's currently
 * active TP/SL levels (pre-trade draft or an open position); every change —
 * including a live drag of the chart's TP/SL lines — is pushed to the server
 * over the same socket via `set_levels` instead of reconnecting.
 */
export function useRuleWatch(symbol: string, timeframe: string, bracket: BracketLevels | null, refreshSeconds = 30) {
  const [signals, setSignals] = useState<RuleSignal[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const bracketRef = useRef(bracket);
  bracketRef.current = bracket;

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket;
    api.ruleWatchUrl(symbol, timeframe, refreshSeconds).then((url) => {
      if (cancelled) return;
      ws = new WebSocket(url);
      ws.onopen = () => {
        if (cancelled) { ws.close(); return; }
        wsRef.current = ws;
        sendLevels(ws, bracketRef.current);
      };
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
    });
    return () => {
      cancelled = true;
      wsRef.current = null;
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, [symbol, timeframe, refreshSeconds]);

  useEffect(() => {
    const ws = wsRef.current;
    if (ws) sendLevels(ws, bracket);
  }, [bracket?.entryPrice, bracket?.stopLossPrice, bracket?.takeProfitPrice]);

  const dismiss = (id: string) => setSignals((prev) => prev.filter((s) => s.id !== id));

  return { signals, dismiss };
}
