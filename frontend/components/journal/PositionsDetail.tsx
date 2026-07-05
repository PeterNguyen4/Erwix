"use client";

import { useRouter } from "next/navigation";
import { Position } from "@/lib/api";

const fmtUsd = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export default function PositionsDetail({ positions }: { positions: Position[] }) {
  const router = useRouter();
  const sorted = [...positions].sort((a, b) => b.market_value - a.market_value);

  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Open Positions</h2>
      {sorted.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted">No open positions.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr className="text-left">
                <th className="py-1.5">Symbol</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Avg Entry</th>
                <th className="text-right">Current</th>
                <th className="text-right">Mkt Value</th>
                <th className="text-right">Unreal. P/L</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const cost = p.avg_entry_price * p.qty;
                const plPct = cost ? (p.unrealized_pl / cost) * 100 : 0;
                const up = p.unrealized_pl >= 0;
                return (
                  <tr
                    key={p.symbol}
                    onClick={() => router.push(`/chart?symbol=${p.symbol}`)}
                    className="cursor-pointer border-t border-border hover:bg-accent/10"
                  >
                    <td className="py-2 font-semibold text-white">{p.symbol}</td>
                    <td className="text-right tabular-nums">{p.qty}</td>
                    <td className="text-right tabular-nums">{fmtUsd(p.avg_entry_price)}</td>
                    <td className="text-right tabular-nums">
                      {p.current_price != null ? fmtUsd(p.current_price) : "—"}
                    </td>
                    <td className="text-right tabular-nums">{fmtUsd(p.market_value)}</td>
                    <td className={`text-right tabular-nums ${up ? "text-up" : "text-down"}`}>
                      {up ? "+" : ""}
                      {fmtUsd(p.unrealized_pl)}{" "}
                      <span className="text-xs">
                        ({up ? "+" : ""}
                        {plPct.toFixed(2)}%)
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
