"use client";

import { useState } from "react";
import { api, OrderRequest } from "@/lib/api";

interface OrderPanelProps {
  symbol: string;
  onOrderPlaced?: () => void;
}

export default function OrderPanel({ symbol, onOrderPlaced }: OrderPanelProps) {
  const [qty, setQty] = useState(1);
  const [type, setType] = useState<"market" | "limit">("market");
  const [limitPrice, setLimitPrice] = useState<number>(0);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

      <div className="flex gap-2">
        <button
          disabled={busy}
          onClick={() => submit("buy")}
          className="flex-1 rounded bg-up/90 py-2 text-sm font-semibold text-white hover:bg-up disabled:opacity-50"
        >
          Buy
        </button>
        <button
          disabled={busy}
          onClick={() => submit("sell")}
          className="flex-1 rounded bg-down/90 py-2 text-sm font-semibold text-white hover:bg-down disabled:opacity-50"
        >
          Sell
        </button>
      </div>

      {status && <p className="mt-3 text-xs text-muted">{status}</p>}
    </div>
  );
}
