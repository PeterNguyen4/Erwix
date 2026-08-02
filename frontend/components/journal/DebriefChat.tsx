"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { ToolbarTooltip } from "@/components/chart/ToolbarButton";
import { api, DebriefMessage } from "@/lib/api";

/** Persisted follow-up chat tied to a ready DebriefReport — request/response
 * (not streaming), since a single Q&A turn doesn't need token-level streaming
 * the way the multi-trade generation does. Reloading the report replays this
 * history via GET /api/agent/debrief/{id}/messages. */
export default function DebriefChat({ reportId }: { reportId: number }) {
  const [messages, setMessages] = useState<DebriefMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendHover, setSendHover] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sendButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    api.debriefMessages(reportId).then(setMessages).catch(() => {});
  }, [reportId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { id: -1, role: "user", content: text, created_at: new Date().toISOString() },
    ]);
    try {
      const reply = await api.postDebriefMessage(reportId, text);
      setMessages((prev) => [...prev, reply]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: -3, role: "assistant", content: "Sorry, that follow-up failed. Try again?", created_at: new Date().toISOString() },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-auto px-4 py-2">
        {messages.map((m) => (
          <div
            key={m.id}
            className={
              m.role === "user"
                ? "ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-accent/20 px-2 py-1.5 text-sm text-fg"
                : "max-w-[85%] rounded-2xl rounded-tl-sm bg-border/60 px-2 py-1.5 text-sm text-fg"
            }
          >
            {m.content}
          </div>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask a follow-up…"
          className="h-9 flex-1 rounded-md border border-border bg-field px-2 text-sm text-fg outline-none focus:border-violet-400"
        />
        <div
          className="relative flex items-center"
          onMouseEnter={() => setSendHover(true)}
          onMouseLeave={() => setSendHover(false)}
        >
          <button
            ref={sendButtonRef}
            onClick={send}
            disabled={sending || !input.trim()}
            aria-label="Send"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-on-accent transition-colors hover:bg-accent/80 disabled:opacity-40"
          >
            <ArrowUp size={14} strokeWidth={2.5} />
          </button>
          <ToolbarTooltip label="Send" hover={sendHover} placement="top" anchorRef={sendButtonRef} />
        </div>
      </div>
    </div>
  );
}
