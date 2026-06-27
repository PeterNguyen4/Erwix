"use client";

import { Position } from "@/lib/api";

export default function PositionsTable({ positions }: { positions: Position[] }) {
  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <h2 className="mb-3 text-sm font-semibold text-muted">Positions</h2>
      {positions.length === 0 ? (
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
