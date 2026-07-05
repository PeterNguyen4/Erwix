"use client";

import { useRouter } from "next/navigation";
import { Position } from "@/lib/api";

const fmtUsd = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export default function TotalAssets({ positions }: { positions: Position[] }) {
  const router = useRouter();
  const sorted = [...positions].sort((a, b) => b.market_value - a.market_value);

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-panel p-4">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Total Assets</h2>
      {sorted.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted">No open positions.</p>
      ) : (
        <div className="flex-1 divide-y divide-border overflow-auto">
          {sorted.map((p) => {
            const cost = p.avg_entry_price * p.qty;
            const plPct = cost ? (p.unrealized_pl / cost) * 100 : 0;
            const up = p.unrealized_pl >= 0;
            return (
              <button
                key={p.symbol}
                onClick={() => router.push(`/chart?symbol=${p.symbol}`)}
                className="flex w-full items-center justify-between py-2.5 text-left transition-colors hover:bg-accent/10"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-white">{p.symbol}</div>
                  <div className="text-xs text-muted">
                    {p.qty} share{p.qty === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="tabular-nums text-white">
                    {p.current_price != null ? fmtUsd(p.current_price) : "—"}
                  </div>
                  <div className={`text-xs tabular-nums ${up ? "text-up" : "text-down"}`}>
                    {up ? "+" : ""}
                    {plPct.toFixed(2)}%
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
