"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Trade } from "@/lib/api";

const WINDOWS = [
  { label: "1D", days: 1 },
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "All", days: 0 },
];

const NOTE_SAVE_DEBOUNCE_MS = 600;

export default function JournalEntries({ refreshKey }: { refreshKey: number }) {
  const router = useRouter();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [days, setDays] = useState(30);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const saveTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const from = days > 0 ? new Date(Date.now() - days * 86400000).toISOString() : undefined;
    api
      .trades({ from })
      .then((t) => {
        setTrades(t);
        setNotes(Object.fromEntries(t.map((x) => [x.id, x.notes ?? ""])));
      })
      .catch((e) => setError((e as Error).message));
  }, [days, refreshKey]);

  const saveNote = (id: number, value: string) => {
    setNotes((n) => ({ ...n, [id]: value }));
    clearTimeout(saveTimers.current[id]);
    saveTimers.current[id] = setTimeout(() => {
      api.saveTradeNote(id, value).catch((e) => setError((e as Error).message));
    }, NOTE_SAVE_DEBOUNCE_MS);
  };

  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted">Trade Journal</h2>
        <div className="flex gap-1">
          {WINDOWS.map((w) => (
            <button
              key={w.label}
              onClick={() => setDays(w.days)}
              className={`rounded px-2 py-0.5 text-xs ${
                days === w.days ? "bg-accent text-white" : "bg-border text-muted hover:bg-accent/30"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-down">{error}</p>}
      {trades.length === 0 && !error ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <p className="text-sm text-muted">No trades logged in this window.</p>
          <button
            onClick={() => router.push("/chart")}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent/80"
          >
            Execute Trade
          </button>
        </div>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr className="text-left">
                <th className="py-1 pr-2 w-6"></th>
                <th className="py-1">Date / Time</th>
                <th>Symbol</th>
                <th>Side</th>
                <th>Type</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Fill</th>
                <th className="text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => {
                const open = expanded === t.id;
                const hasNote = (notes[t.id] ?? "").trim().length > 0;
                return (
                  <Fragment key={t.id}>
                    <tr
                      onClick={() => setExpanded(open ? null : t.id)}
                      className="cursor-pointer border-t border-border hover:bg-accent/10"
                    >
                      <td className="py-1.5 pr-2 text-muted">{open ? "▾" : "▸"}</td>
                      <td className="py-1.5 whitespace-nowrap text-muted">
                        {new Date(t.filled_at).toLocaleString()}
                      </td>
                      <td className="font-medium text-white">
                        {t.symbol}
                        {hasNote && <span className="ml-1 text-accent" title="Has note">•</span>}
                      </td>
                      <td className={`uppercase ${t.side === "buy" ? "text-up" : "text-down"}`}>{t.side}</td>
                      <td className="text-muted">{t.order_type ?? "—"}</td>
                      <td className="text-right tabular-nums">{t.qty}</td>
                      <td className="text-right tabular-nums">${t.fill_price.toFixed(2)}</td>
                      <td className="text-right tabular-nums">
                        $
                        {(t.fill_price * t.qty).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-t border-border/50 bg-bg/40">
                        <td />
                        <td colSpan={7} className="py-3 pr-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            {/* Open note */}
                            <div>
                              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                                Trade Notes
                              </div>
                              <textarea
                                value={notes[t.id] ?? ""}
                                onChange={(e) => saveNote(t.id, e.target.value)}
                                placeholder="What was your plan? Which confluences lined up? How did you feel executing this?"
                                className="h-28 w-full resize-y rounded-md border border-border bg-panel p-2 text-sm text-white placeholder:text-muted focus:border-accent focus:outline-none"
                              />
                            </div>
                            {/* AI summary placeholder */}
                            <div>
                              <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
                                AI Reflection
                                <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-normal text-accent">
                                  Coming soon
                                </span>
                              </div>
                              <div className="h-28 overflow-auto rounded-md border border-dashed border-border bg-panel/60 p-2 text-sm text-muted">
                                Once wired up, Claude will read this execution alongside your notes and
                                plan and give you a discipline-focused reflection — e.g. acknowledging
                                that you followed every confluence and stuck to your plan even when the
                                trade closed red.
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
