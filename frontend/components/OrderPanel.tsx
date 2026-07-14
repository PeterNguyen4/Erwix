"use client";

import { useEffect, useState } from "react";
import { api, OrderRequest } from "@/lib/api";
import type { BracketLevels } from "@/components/Chart";

interface OrderPanelProps {
  symbol: string;
  onOrderPlaced?: () => void;
  buyingPower?: number | null;
  price?: number | null;
  /** Fires with the live entry/TP/SL preview while the bracket toggle is on, so the chart can shade it. */
  onBracketChange?: (bracket: BracketLevels | null) => void;
  /** Controlled so the chart's draggable TP/SL lines can push edits back into these inputs. */
  takeProfitPrice: number;
  onTakeProfitPriceChange: (price: number) => void;
  stopLossPrice: number;
  onStopLossPriceChange: (price: number) => void;
  /** Latest plotted candle time (unix seconds) — used as the bracket's entry time so it lines up with the chart's own timeline instead of the wall clock. */
  currentTime?: number | null;
}

const fmtUsd = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export default function OrderPanel({
  symbol,
  onOrderPlaced,
  buyingPower,
  price,
  onBracketChange,
  takeProfitPrice,
  onTakeProfitPriceChange,
  stopLossPrice,
  onStopLossPriceChange,
  currentTime,
}: OrderPanelProps) {
  const [qty, setQty] = useState(1);
  const [type, setType] = useState<"market" | "limit">("market");
  const [limitPrice, setLimitPrice] = useState<number>(0);
  const [bracket, setBracket] = useState(false);
  const [entryTime, setEntryTime] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const estPrice = type === "limit" && limitPrice > 0 ? limitPrice : price ?? null;
  const estCost = estPrice != null ? estPrice * qty : null;
  const insufficient =
    buyingPower != null && estCost != null && estCost > buyingPower;
  const riskPerShare =
    bracket && estPrice != null && stopLossPrice > 0 ? Math.abs(estPrice - stopLossPrice) : null;
  const totalRisk = riskPerShare != null ? riskPerShare * qty : null;
  const bracketValid = !bracket || (takeProfitPrice > 0 && stopLossPrice > 0);

  // Live-preview the bracket levels on the chart while the trader is setting them up.
  useEffect(() => {
    if (!bracket || estPrice == null) {
      onBracketChange?.(null);
      return;
    }
    onBracketChange?.({
      entryPrice: estPrice,
      takeProfitPrice: takeProfitPrice > 0 ? takeProfitPrice : null,
      stopLossPrice: stopLossPrice > 0 ? stopLossPrice : null,
      // Fixed at the moment the bracket was set up, so the chart's lines
      // don't keep sliding forward to the latest candle on every tick.
      // Anchored to the chart's own latest candle time (not the wall clock)
      // so it always resolves to a coordinate on the plotted timeline.
      entryTime: entryTime ?? currentTime ?? Math.floor(Date.now() / 1000),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bracket, estPrice, takeProfitPrice, stopLossPrice, entryTime, currentTime]);

  useEffect(() => () => onBracketChange?.(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(side: "buy" | "sell") {
    setBusy(true);
    setStatus(null);
    try {
      const order: OrderRequest = {
        symbol: symbol.toUpperCase(),
        qty,
        side,
        type,
        limit_price: type === "limit" ? limitPrice : null,
        order_class: bracket ? "bracket" : "simple",
        take_profit_price: bracket ? takeProfitPrice : null,
        stop_loss_price: bracket ? stopLossPrice : null,
      };
      const res = await api.submitOrder(order);
      setStatus(`✓ ${side.toUpperCase()} ${qty} ${order.symbol} — ${res.status}`);
      onOrderPlaced?.();
    } catch (e) {
      setStatus(`✕ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <h2 className="mb-3 text-sm font-semibold text-muted">Order (paper)</h2>

      <div className="mb-3 flex items-center justify-between rounded border border-border bg-bg px-3 py-2">
        <span className="text-xs text-muted">Available to trade</span>
        <span className="text-sm font-semibold tabular-nums text-white">
          {buyingPower != null ? fmtUsd(buyingPower) : "—"}
        </span>
      </div>

      <label className="mb-1 block text-xs text-muted">Quantity</label>
      <input
        type="number"
        min={1}
        className="mb-3 w-full rounded border border-border bg-bg px-2 py-1.5 text-sm outline-none focus:border-accent"
        value={qty}
        onChange={(e) => setQty(Number(e.target.value))}
      />

      <label className="mb-1 block text-xs text-muted">Type</label>
      <select
        className="mb-3 w-full rounded border border-border bg-bg px-2 py-1.5 text-sm outline-none focus:border-accent"
        value={type}
        onChange={(e) => setType(e.target.value as "market" | "limit")}
      >
        <option value="market">Market</option>
        <option value="limit">Limit</option>
      </select>

      {type === "limit" && (
        <>
          <label className="mb-1 block text-xs text-muted">Limit price</label>
          <input
            type="number"
            className="mb-3 w-full rounded border border-border bg-bg px-2 py-1.5 text-sm outline-none focus:border-accent"
            value={limitPrice}
            onChange={(e) => setLimitPrice(Number(e.target.value))}
          />
        </>
      )}

      {estCost != null && (
        <div className="mb-3 flex items-center justify-between text-xs">
          <span className="text-muted">Est. {type === "limit" ? "cost" : "cost @ mkt"}</span>
          <span className={`tabular-nums font-medium ${insufficient ? "text-down" : "text-white"}`}>
            {fmtUsd(estCost)}
          </span>
        </div>
      )}

      <label className="mb-3 flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={bracket}
          onChange={(e) => {
            const checked = e.target.checked;
            setBracket(checked);
            if (checked) {
              setEntryTime(currentTime ?? Math.floor(Date.now() / 1000));
              // Default to a 1:1 risk/reward band (1% of entry each side) so the
              // trader has a starting point instead of blank TP/SL fields.
              if (estPrice != null && takeProfitPrice === 0 && stopLossPrice === 0) {
                const delta = estPrice * 0.01;
                onTakeProfitPriceChange(Number((estPrice + delta).toFixed(2)));
                onStopLossPriceChange(Number((estPrice - delta).toFixed(2)));
              }
            } else {
              setEntryTime(null);
            }
          }}
        />
        Attach take-profit / stop-loss (bracket order)
      </label>

      {bracket && (
        <>
          <label className="mb-1 block text-xs text-muted">Take profit price</label>
          <input
            type="number"
            className="mb-3 w-full rounded border border-border bg-bg px-2 py-1.5 text-sm outline-none focus:border-accent"
            value={takeProfitPrice}
            onChange={(e) => onTakeProfitPriceChange(Number(e.target.value))}
          />

          <label className="mb-1 block text-xs text-muted">Stop loss price</label>
          <input
            type="number"
            className="mb-3 w-full rounded border border-border bg-bg px-2 py-1.5 text-sm outline-none focus:border-accent"
            value={stopLossPrice}
            onChange={(e) => onStopLossPriceChange(Number(e.target.value))}
          />

          {totalRisk != null && (
            <div className="mb-3 flex items-center justify-between text-xs">
              <span className="text-muted">Est. risk to stop</span>
              <span className="tabular-nums font-medium text-down">{fmtUsd(totalRisk)}</span>
            </div>
          )}
        </>
      )}

      <div className="flex gap-2">
        <button
          disabled={busy || insufficient || !bracketValid}
          onClick={() => submit("buy")}
          className="flex-1 rounded bg-up/90 py-2 text-sm font-semibold text-white hover:bg-up disabled:opacity-50"
        >
          Buy
        </button>
        <button
          disabled={busy || !bracketValid}
          onClick={() => submit("sell")}
          className="flex-1 rounded bg-down/90 py-2 text-sm font-semibold text-white hover:bg-down disabled:opacity-50"
        >
          Sell
        </button>
      </div>

      {insufficient && (
        <p className="mt-2 text-xs text-down">Estimated cost exceeds available buying power.</p>
      )}
      {bracket && !bracketValid && (
        <p className="mt-2 text-xs text-down">Bracket orders need both a take-profit and stop-loss price.</p>
      )}
      {status && <p className="mt-3 text-xs text-muted">{status}</p>}
    </div>
  );
}
