"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { api, ChartAnnotation, Candle, DebriefEvent, DebriefRequest, ZoomRange } from "@/lib/api";

const Chart = dynamic(() => import("@/components/Chart"), { ssr: false });

const ANALYST_NAME = "uWick";

function AnalystAvatar() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-up shadow-sm">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
        <path
          d="M10 2l1.6 4.9L16.5 8l-4.9 1.6L10 14.5l-1.6-4.9L3.5 8l4.9-1.1L10 2z"
          fill="white"
        />
      </svg>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce-dot"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}

interface Message {
  id: number;
  text: string;
  done: boolean;
}

interface AnalystDebriefProps {
  request: DebriefRequest;
  onClose: () => void;
  onSpotlight: (selector: string | null) => void;
  onFinished?: () => void;
}

export default function AnalystDebrief({ request, onClose, onSpotlight, onFinished }: AnalystDebriefProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [annotations, setAnnotations] = useState<ChartAnnotation[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [symbol, setSymbol] = useState(request.symbol ?? "");
  const [visibleRange, setVisibleRange] = useState<ZoomRange | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);

  useEffect(() => {
    if (request.symbol) {
      api.candles(request.symbol).then(setCandles).catch(() => {});
    }
  }, [request.symbol]);

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket;

    api.debriefStreamUrl(request).then((url) => {
      if (cancelled) return;
      ws = new WebSocket(url);
      ws.onopen = () => {
        if (cancelled) { ws.close(); return; }
        setConnecting(false);
        setStreaming(true);
        setMessages([{ id: nextId.current++, text: "", done: false }]);
      };
      ws.onmessage = (ev) => {
        if (cancelled) return;
        const msg: DebriefEvent = JSON.parse(ev.data);
        if (msg.type === "token") {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last) next[next.length - 1] = { ...last, text: last.text + msg.text };
            return next;
          });
        } else if (msg.type === "annotations") {
          setAnnotations(msg.annotations);
        } else if (msg.type === "spotlight") {
          const key = msg.day_keys[0];
          if (key) onSpotlight(`[data-daykey="${key}"]`);
        } else if (msg.type === "zoom") {
          setVisibleRange({ from: msg.from, to: msg.to });
        } else if (msg.type === "symbol") {
          setSymbol(msg.symbol);
        } else if (msg.type === "done") {
          setStreaming(false);
          setMessages((prev) => prev.map((m, i) => (i === prev.length - 1 ? { ...m, done: true } : m)));
          onFinished?.();
        } else if (msg.type === "error") {
          setError(msg.detail);
          setStreaming(false);
        }
      };
      ws.onerror = () => { if (!cancelled) setError("Connection lost."); };
      ws.onclose = () => { if (!cancelled) setStreaming(false); };
    });

    return () => {
      cancelled = true;
      onSpotlight(null);
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const activeSymbol = symbol || request.symbol || "";

  useEffect(() => {
    if (!activeSymbol) return;
    setSymbol(activeSymbol);
    if (candles.length === 0) {
      api.candles(activeSymbol).then(setCandles).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSymbol]);

  return (
    <div className="fixed bottom-4 right-4 top-20 z-30 flex w-[720px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-2xl animate-fade-in-up">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <AnalystAvatar />
          <div>
            <div className="text-sm font-semibold text-white">{ANALYST_NAME}</div>
            <div className="text-[10px] text-muted">
              {connecting ? "connecting…" : streaming ? "reviewing your trades…" : "debrief complete"}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-muted transition-colors hover:bg-border hover:text-white"
          title="Close"
        >
          ✕
        </button>
      </div>

      {/* Whiteboard */}
      <div className="h-[440px] shrink-0 border-b border-border">
        {candles.length > 0 ? (
          <Chart candles={candles} annotations={annotations} symbol={activeSymbol} visibleRange={visibleRange} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">
            Whiteboard — waiting for a chart to discuss…
          </div>
        )}
      </div>

      {/* Chat */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-auto px-4 py-3">
        {error && (
          <div className="rounded-md border border-down/40 bg-down/10 px-3 py-2 text-xs text-down">{error}</div>
        )}
        {messages.map((m, i) => (
          <div key={m.id} className="flex items-start gap-2 animate-fade-in-up">
            <AnalystAvatar />
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-border/60 px-3 py-2 text-sm text-white">
              {m.text || (i === messages.length - 1 && (connecting || streaming) ? <TypingIndicator /> : null)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
