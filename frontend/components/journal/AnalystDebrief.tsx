"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft } from "lucide-react";
import { api, ChartAnnotation, Candle, DebriefEvent, DebriefRequest, ZoomRange } from "@/lib/api";
import SpotlightToast from "./SpotlightToast";

const Chart = dynamic(() => import("@/components/Chart"), { ssr: false });

const ANALYST_NAME = "uWick";
const SPOTLIGHT_DURATION_MS = 6000;

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

type ChatItem =
  | { kind: "text"; id: number; text: string; done: boolean }
  | { kind: "note"; id: number; tradeId: number; text: string };

function NoteCard({ tradeId, text }: { tradeId: number; text: string }) {
  return (
    <div className="max-w-[85%] rounded-xl border border-accent/30 bg-accent/5 px-3 py-2.5">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-accent">
        <span>&#8220;</span>
        Your Note — Trade #{tradeId}
      </div>
      <p className="whitespace-pre-wrap text-sm italic text-fg/90">{text}</p>
    </div>
  );
}

interface AnalystDebriefProps {
  request: DebriefRequest;
  onClose: () => void;
  onSpotlight: (selector: string | null) => void;
  onFinished?: () => void;
  variant?: "popup" | "panel";
}

export default function AnalystDebrief({ request, onClose, onSpotlight, onFinished, variant = "popup" }: AnalystDebriefProps) {
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [annotations, setAnnotations] = useState<ChartAnnotation[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [symbol, setSymbol] = useState(request.symbol ?? "");
  const [visibleRange, setVisibleRange] = useState<ZoomRange | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [toast, setToast] = useState<{ selector: string; message: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);
  const spotlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        setMessages([{ kind: "text", id: nextId.current++, text: "", done: false }]);
      };
      ws.onmessage = (ev) => {
        if (cancelled) return;
        const msg: DebriefEvent = JSON.parse(ev.data);
        if (msg.type === "token") {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            // A note card may have interrupted the last text bubble — start a
            // fresh one to keep streaming into rather than writing into the card.
            if (!last || last.kind !== "text") {
              return [...prev, { kind: "text", id: nextId.current++, text: msg.text, done: false }];
            }
            const next = [...prev];
            next[next.length - 1] = { ...last, text: last.text + msg.text };
            return next;
          });
        } else if (msg.type === "note_quote") {
          setMessages((prev) => [
            ...prev,
            { kind: "note", id: nextId.current++, tradeId: msg.trade_id, text: msg.text },
          ]);
        } else if (msg.type === "annotations") {
          setAnnotations((prev) => [...prev, ...msg.annotations]);
        } else if (msg.type === "spotlight") {
          onSpotlight(msg.selector);
          if (spotlightTimer.current) clearTimeout(spotlightTimer.current);
          if (msg.message) {
            setMinimized(true);
            setToast({ selector: msg.selector, message: msg.message });
            spotlightTimer.current = setTimeout(() => {
              onSpotlight(null);
              setToast(null);
              setMinimized(false);
            }, SPOTLIGHT_DURATION_MS);
          }
        } else if (msg.type === "zoom") {
          setVisibleRange({ from: msg.from, to: msg.to });
        } else if (msg.type === "symbol") {
          setSymbol(msg.symbol);
        } else if (msg.type === "done") {
          setStreaming(false);
          setMessages((prev) =>
            prev.map((m, i) => (i === prev.length - 1 && m.kind === "text" ? { ...m, done: true } : m)),
          );
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
      setMinimized(false);
      setToast(null);
      if (spotlightTimer.current) clearTimeout(spotlightTimer.current);
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

  const expand = () => {
    if (spotlightTimer.current) clearTimeout(spotlightTimer.current);
    setMinimized(false);
    setToast(null);
  };

  const chatMessages = (
    <>
      {error && (
        <div className="rounded-md border border-down/40 bg-down/10 px-3 py-2 text-xs text-down">{error}</div>
      )}
      {messages.map((m, i) => (
        <div key={m.id} className="flex items-start gap-2 animate-fade-in-up">
          <AnalystAvatar />
          {m.kind === "note" ? (
            <NoteCard tradeId={m.tradeId} text={m.text} />
          ) : (
            <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-border/60 px-3 py-2 text-sm text-fg">
              {m.text || (i === messages.length - 1 && (connecting || streaming) ? <TypingIndicator /> : null)}
            </div>
          )}
        </div>
      ))}
    </>
  );

  if (variant === "panel") {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between border-b border-auth-field/40 bg-panel px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              title="Back to journal"
              className="rounded p-1 text-muted transition-colors hover:bg-border hover:text-fg"
            >
              <ArrowLeft size={16} strokeWidth={2} />
            </button>
            <AnalystAvatar />
            <div>
              <div className="text-sm font-semibold text-fg">{ANALYST_NAME}</div>
              <div className="text-[10px] text-muted">
                {connecting ? "connecting…" : streaming ? "reviewing your trades…" : "debrief complete"}
              </div>
            </div>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-2 lg:overflow-hidden">
          <div className="flex min-h-[420px] flex-col rounded-lg border border-border bg-panel lg:min-h-0 lg:overflow-hidden">
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-auto px-4 py-3">
              {chatMessages}
            </div>
          </div>

          <div className="flex min-h-[420px] flex-col rounded-lg border border-border bg-panel lg:min-h-0">
            {candles.length > 0 ? (
              <Chart candles={candles} annotations={annotations} symbol={activeSymbol} visibleRange={visibleRange} />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted">
                Whiteboard — waiting for a chart to discuss…
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (minimized) {
    return (
      <>
        {toast && (
          <SpotlightToast
            targetSelector={toast.selector}
            message={toast.message}
            onExpand={expand}
          />
        )}
        <div className="fixed bottom-4 right-4 z-30 flex animate-fade-in-up items-center gap-1 rounded-full border border-border bg-panel p-1 pr-2 shadow-2xl">
          <button
            onClick={expand}
            title="Reopen debrief"
            className="flex items-center gap-2 rounded-full px-1.5 py-1 transition-colors hover:bg-border"
          >
            <AnalystAvatar />
            <span className="text-xs font-medium text-fg">{ANALYST_NAME}</span>
            {streaming && <TypingIndicator />}
          </button>
          <button
            onClick={onClose}
            title="Close"
            className="rounded-full p-1 text-muted transition-colors hover:bg-border hover:text-fg"
          >
            ✕
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 top-20 z-30 flex w-[720px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-2xl animate-fade-in-up">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <AnalystAvatar />
          <div>
            <div className="text-sm font-semibold text-fg">{ANALYST_NAME}</div>
            <div className="text-[10px] text-muted">
              {connecting ? "connecting…" : streaming ? "reviewing your trades…" : "debrief complete"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMinimized(true)}
            className="rounded p-1 text-muted transition-colors hover:bg-border hover:text-fg"
            title="Minimize"
          >
            &#8211;
          </button>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted transition-colors hover:bg-border hover:text-fg"
            title="Close"
          >
            ✕
          </button>
        </div>
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
        {chatMessages}
      </div>
    </div>
  );
}
