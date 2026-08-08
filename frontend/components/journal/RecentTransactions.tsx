"use client";

import { useEffect, useState } from "react";
import { api, DebriefRequest, Trade } from "@/lib/api";

const fmtUsd = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

interface RecentTransactionsProps {
  onDebriefTrade?: (request: DebriefRequest) => void;
}

export default function RecentTransactions({ onDebriefTrade }: RecentTransactionsProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Trade | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    const from = new Date(Date.now() - 30 * 86400000).toISOString();
    api
      .trades({ from })
      .then((rows) =>
        setTrades(
          rows
            .filter((t) => t.filled_at)
            .sort((a, b) => new Date(b.filled_at!).getTime() - new Date(a.filled_at!).getTime())
            .slice(0, 12),
        ),
      )
      .catch(() => setTrades([]))
      .finally(() => setLoading(false));
  };

  useEffect(reload, []);

  const openTrade = (t: Trade) => {
    setDetail(t);
    setNoteDraft(t.notes ?? "");
  };

  const saveNote = async () => {
    if (!detail) return;
    await api.saveTradeNote(detail.id, noteDraft).catch((e) => setError((e as Error).message));
    setDetail(null);
    reload();
  };

  return (
    <div className="relative rounded-lg border border-border bg-panel p-4">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted">Recent Transactions</h2>
      {loading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between border-t border-border pt-2.5 first:border-t-0 first:pt-0">
              <div className="h-3.5 w-14 animate-pulse rounded bg-border/40" />
              <div className="h-3.5 w-10 animate-pulse rounded bg-border/40" />
              <div className="h-3.5 w-16 animate-pulse rounded bg-border/40" />
              <div className="h-3.5 w-16 animate-pulse rounded bg-border/40" />
            </div>
          ))}
        </div>
      ) : trades.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted">No fills in the last 30 days.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr className="text-left">
                <th className="py-1.5">Date</th>
                <th>Symbol</th>
                <th>Side</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Fill</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => openTrade(t)}
                  className="cursor-pointer border-t border-border hover:bg-accent/10"
                >
                  <td className="py-2 whitespace-nowrap text-muted">
                    {new Date(t.filled_at!).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </td>
                  <td className="font-semibold text-fg">{t.symbol}</td>
                  <td className={t.side === "buy" ? "text-up uppercase" : "text-down uppercase"}>{t.side}</td>
                  <td className="text-right tabular-nums">{t.qty}</td>
                  <td className="text-right tabular-nums">{t.fill_price != null ? fmtUsd(t.fill_price) : "—"}</td>
                  <td className="text-right tabular-nums">
                    {t.fill_price != null ? fmtUsd(t.fill_price * t.qty) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <div className="absolute inset-0 z-40 flex items-center justify-center rounded-lg bg-bg/70 p-4">
          <div className="w-full max-w-sm rounded-md border border-border bg-panel p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-medium tracking-wide text-muted">
                {detail.symbol} — {new Date(detail.filled_at!).toLocaleString()}
              </div>
              <button onClick={() => setDetail(null)} className="text-xs text-muted hover:text-fg">
                ✕
              </button>
            </div>
            {error && <p className="mb-2 text-xs text-down">{error}</p>}
            <div className="mb-2 grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-muted">Side</div>
                <div className={detail.side === "buy" ? "text-up uppercase" : "text-down uppercase"}>{detail.side}</div>
              </div>
              <div>
                <div className="text-muted">Qty</div>
                <div className="text-fg tabular-nums">{detail.qty}</div>
              </div>
              <div>
                <div className="text-muted">Fill</div>
                <div className="text-fg tabular-nums">${detail.fill_price?.toFixed(2)}</div>
              </div>
            </div>
            <label className="mb-1 block text-[10px] font-medium tracking-wide text-muted">Notes</label>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="What was your plan? Which confluences lined up?"
              className="h-24 w-full resize-y rounded-md border border-border bg-field px-2 py-1.5 text-sm text-fg placeholder:text-muted outline-none focus:border-accent"
            />
            <div className="mt-3 flex items-center justify-between">
              <button
                onClick={() => {
                  const t = detail;
                  const filled = new Date(t.filled_at!);
                  onDebriefTrade?.({
                    from: new Date(filled.getTime() - 3 * 86400000).toISOString(),
                    to: new Date(filled.getTime() + 86400000).toISOString(),
                    symbol: t.symbol,
                    query: `Reflect specifically on my ${t.side} of ${t.symbol} filled at $${t.fill_price} on ${filled.toLocaleDateString()}.`,
                  });
                  setDetail(null);
                }}
                className="rounded-md bg-accent/20 px-3 py-1 text-xs font-semibold text-accent hover:bg-accent/30"
              >
                Debrief this trade
              </button>
              <button
                onClick={saveNote}
                className="rounded-md bg-accent px-3 py-1 text-xs font-semibold text-on-accent transition-colors hover:bg-accent/80"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
