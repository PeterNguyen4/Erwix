"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Trade } from "@/lib/api";

const WINDOWS = [
  { label: "1D", days: 1 },
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "All", days: 0 },
];

export default function TradeJournal({ refreshKey }: { refreshKey: number }) {
  const router = useRouter();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [days, setDays] = useState(7);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const from =
      days > 0
        ? new Date(Date.now() - days * 86400000).toISOString()
        : undefined;
    api
      .trades({ from })
      .then(setTrades)
      .catch((e) => setError((e as Error).message));
  }, [days, refreshKey]);

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
                days === w.days
                  ? "bg-accent text-white"
                  : "bg-border text-muted hover:bg-accent/30"
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
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-panel text-xs text-muted">
              <tr className="text-left">
                <th className="py-1">Time</th>
                <th>Symbol</th>
                <th>Side</th>
                <th>Qty</th>
                <th className="text-right">Fill</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="py-1.5 text-muted">
                    {new Date(t.filled_at).toLocaleString()}
                  </td>
                  <td className="font-medium">{t.symbol}</td>
                  <td
                    className={t.side === "buy" ? "text-up" : "text-down"}
                  >
                    {t.side}
                  </td>
                  <td>{t.qty}</td>
                  <td className="text-right">{t.fill_price.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
