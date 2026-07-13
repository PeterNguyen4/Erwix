"use client";

import { useState } from "react";
import { api, OrderRequest } from "@/lib/api";

interface OrderPanelProps {
  symbol: string;
  onOrderPlaced?: () => void;
  buyingPower?: number | null;
  price?: number | null;
}

const fmtUsd = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export default function OrderPanel({ symbol, onOrderPlaced, buyingPower, price }: OrderPanelProps) {
  const [qty, setQty] = useState(1);
  const [type, setType] = useState<"market" | "limit">("market");
  const [limitPrice, setLimitPrice] = useState<number>(0);
  const [bracket, setBracket] = useState(false);
  const [takeProfitPrice, setTakeProfitPrice] = useState<number>(0);
  const [stopLossPrice, setStopLossPrice] = useState<number>(0);
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
          onChange={(e) => setBracket(e.target.checked)}
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
            onChange={(e) => setTakeProfitPrice(Number(e.target.value))}
          />

          <label className="mb-1 block text-xs text-muted">Stop loss price</label>
          <input
            type="number"
            className="mb-3 w-full rounded border border-border bg-bg px-2 py-1.5 text-sm outline-none focus:border-accent"
            value={stopLossPrice}
            onChange={(e) => setStopLossPrice(Number(e.target.value))}
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
