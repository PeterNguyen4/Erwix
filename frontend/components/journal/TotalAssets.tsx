"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { List, Table as TableIcon } from "lucide-react";
import { Position } from "@/lib/api";

const fmtUsd = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export default function TotalAssets({ positions, loading }: { positions: Position[]; loading?: boolean }) {
  const router = useRouter();
  const [view, setView] = useState<"list" | "table">("list");
  const sorted = [...positions].sort((a, b) => b.market_value - a.market_value);

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-muted">Total Assets</h2>
        <div className="flex items-center gap-1 rounded-md bg-field p-0.5">
          <button
            onClick={() => setView("list")}
            title="List view"
            className={`flex items-center rounded p-1 transition-colors ${
              view === "list" ? "bg-accent text-on-accent" : "text-muted hover:text-fg"
            }`}
          >
            <List size={12} strokeWidth={2} />
          </button>
          <button
            onClick={() => setView("table")}
            title="Positions table"
            className={`flex items-center rounded p-1 transition-colors ${
              view === "table" ? "bg-accent text-on-accent" : "text-muted hover:text-fg"
            }`}
          >
            <TableIcon size={12} strokeWidth={2} />
          </button>
        </div>
      </div>
      {loading ? (
        <div className="flex-1 divide-y divide-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-2.5">
              <div>
                <div className="h-3.5 w-12 animate-pulse rounded bg-border/40" />
                <div className="mt-1.5 h-3 w-16 animate-pulse rounded bg-border/40" />
              </div>
              <div className="text-right">
                <div className="h-3.5 w-14 animate-pulse rounded bg-border/40" />
                <div className="mt-1.5 h-3 w-10 animate-pulse rounded bg-border/40 ml-auto" />
              </div>
            </div>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted">No open positions.</p>
      ) : view === "table" ? (
        <div className="flex-1 overflow-auto">
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
                    <td className="py-2 font-semibold text-fg">{p.symbol}</td>
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
                  <div className="font-semibold text-fg">{p.symbol}</div>
                  <div className="text-xs text-muted">
                    {p.qty} share{p.qty === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="text-right">
                    <div className="tabular-nums text-fg">
                      {p.current_price != null ? fmtUsd(p.current_price) : "—"}
                    </div>
                    <div className={`mt-0.5 text-xs tabular-nums ${up ? "text-up" : "text-down"}`}>
                      {up ? "+" : ""}
                      {fmtUsd(p.unrealized_pl)}
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1.5 text-xs font-medium tabular-nums ${
                      up ? "bg-up/15 text-up" : "bg-down/15 text-down"
                    }`}
                  >
                    {up ? "+" : ""}
                    {plPct.toFixed(2)}%
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
