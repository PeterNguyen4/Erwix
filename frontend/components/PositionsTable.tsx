"use client";

import { Position } from "@/lib/api";

export default function PositionsTable({ positions, loading }: { positions: Position[]; loading?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <h2 className="mb-3 text-sm font-semibold text-muted">Positions</h2>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between border-t border-border pt-2 first:border-t-0 first:pt-0">
              <div className="h-3.5 w-14 animate-pulse rounded bg-border/40" />
              <div className="h-3.5 w-8 animate-pulse rounded bg-border/40" />
              <div className="h-3.5 w-12 animate-pulse rounded bg-border/40" />
              <div className="h-3.5 w-12 animate-pulse rounded bg-border/40" />
            </div>
          ))}
        </div>
      ) : positions.length === 0 ? (
        <p className="text-xs text-muted">No open positions.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs text-muted">
            <tr className="text-left">
              <th className="py-1">Symbol</th>
              <th>Qty</th>
              <th>Avg</th>
              <th className="text-right">P/L</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.symbol} className="border-t border-border">
                <td className="py-1.5 font-medium">{p.symbol}</td>
                <td>{p.qty}</td>
                <td>{p.avg_entry_price.toFixed(2)}</td>
                <td
                  className={`text-right ${
                    p.unrealized_pl >= 0 ? "text-up" : "text-down"
                  }`}
                >
                  {p.unrealized_pl >= 0 ? "+" : ""}
                  {p.unrealized_pl.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
