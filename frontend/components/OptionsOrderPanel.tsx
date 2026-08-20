"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { api, OptionContract, OptionOrderRequest, OptionPositionIntent } from "@/lib/api";

interface OptionsOrderPanelProps {
  symbol: string;
  onOrderPlaced?: () => void;
  buyingPower?: number | null;
  underlyingPrice?: number | null;
  onRequireAlpacaConnect?: () => boolean;
}

const fmtUsd = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

const INTENT_OPTIONS: { value: OptionPositionIntent; label: string }[] = [
  { value: "buy_to_open", label: "Buy to open" },
  { value: "sell_to_open", label: "Sell to open" },
  { value: "buy_to_close", label: "Buy to close" },
  { value: "sell_to_close", label: "Sell to close" },
];

function positionLabel(optionType: "call" | "put", intent: OptionPositionIntent): string {
  const isOpen = intent.endsWith("open");
  const isBuy = intent.startsWith("buy");
  const side = isBuy ? "Long" : "Short";
  const verb = optionType === "call" ? "Call" : "Put";
  return isOpen ? `${side} ${verb}` : `${side} ${verb} (closing)`;
}

export default function OptionsOrderPanel({
  symbol,
  onOrderPlaced,
  buyingPower,
  underlyingPrice,
  onRequireAlpacaConnect,
}: OptionsOrderPanelProps) {
  const [contracts, setContracts] = useState<OptionContract[]>([]);
  const [loadingChain, setLoadingChain] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);

  const [optionType, setOptionType] = useState<"call" | "put">("call");
  const [expiration, setExpiration] = useState<string>("");
  const [selectedSymbol, setSelectedSymbol] = useState<string>("");

  const [qty, setQty] = useState(1);
  const [type, setType] = useState<"market" | "limit">("market");
  const [limitPrice, setLimitPrice] = useState<number>(0);
  const [intent, setIntent] = useState<OptionPositionIntent>("buy_to_open");
  const [intentOpen, setIntentOpen] = useState(false);

  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setLoadingChain(true);
    setChainError(null);
    api
      .optionsChain(symbol)
      .then((res) => {
        if (cancelled) return;
        setContracts(res);
        if (res.length > 0) {
          const firstExp = res.map((c) => c.expiration_date).sort()[0];
          setExpiration((prev) => prev || firstExp);
        }
      })
      .catch((e) => {
        if (!cancelled) setChainError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoadingChain(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const expirations = useMemo(
    () => Array.from(new Set(contracts.map((c) => c.expiration_date))).sort(),
    [contracts]
  );

  const strikesForExpiration = useMemo(
    () =>
      contracts
        .filter((c) => c.expiration_date === expiration && c.type === optionType)
        .sort((a, b) => a.strike_price - b.strike_price),
    [contracts, expiration, optionType]
  );

  useEffect(() => {
    if (strikesForExpiration.length === 0) {
      setSelectedSymbol("");
      return;
    }
    if (!strikesForExpiration.some((c) => c.symbol === selectedSymbol)) {
      setSelectedSymbol(strikesForExpiration[0].symbol);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strikesForExpiration]);

  const selectedContract = strikesForExpiration.find((c) => c.symbol === selectedSymbol) ?? null;
  const estPrice =
    type === "limit" && limitPrice > 0 ? limitPrice : selectedContract?.close_price ?? null;
  const estCost = estPrice != null ? estPrice * qty * 100 : null;
  const isBuy = intent.startsWith("buy");
  const insufficient =
    isBuy && buyingPower != null && estCost != null && estCost > buyingPower;

  async function submit() {
    if (!selectedContract) return;
    if (onRequireAlpacaConnect?.()) return;
    setBusy(true);
    setStatus(null);
    try {
      const order: OptionOrderRequest = {
        symbol: selectedContract.symbol,
        qty,
        position_intent: intent,
        type,
        limit_price: type === "limit" ? limitPrice : null,
      };
      const res = await api.submitOptionOrder(order);
      setStatus(`✓ ${intent.replace(/_/g, " ")} ${qty} ${selectedContract.symbol} — ${res.status}`);
      onOrderPlaced?.();
    } catch (e) {
      setStatus(`✕ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <h2 className="mb-3 text-sm font-semibold text-muted">Options (paper)</h2>

      <div className="mb-3 flex items-center justify-between rounded border border-border bg-field px-3 py-2">
        <span className="text-xs text-muted">Available to trade</span>
        <span className="text-sm font-semibold tabular-nums text-fg">
          {buyingPower != null ? fmtUsd(buyingPower) : "—"}
        </span>
      </div>

      {chainError && <p className="mb-3 text-xs text-down">{chainError}</p>}
      {loadingChain && <p className="mb-3 text-xs text-muted">Loading option chain…</p>}

      {!loadingChain && !chainError && contracts.length === 0 && (
        <p className="mb-3 text-xs text-muted">No option contracts available for {symbol}.</p>
      )}

      {contracts.length > 0 && (
        <>
          <div className="mb-3 flex rounded-lg border border-border bg-field p-1">
            <button
              type="button"
              onClick={() => setOptionType("call")}
              className={`flex-1 rounded-md py-1.5 text-sm font-semibold transition-colors ${
                optionType === "call" ? "bg-up/20 text-up" : "text-muted hover:text-fg"
              }`}
            >
              Call
            </button>
            <button
              type="button"
              onClick={() => setOptionType("put")}
              className={`flex-1 rounded-md py-1.5 text-sm font-semibold transition-colors ${
                optionType === "put" ? "bg-down/20 text-down" : "text-muted hover:text-fg"
              }`}
            >
              Put
            </button>
          </div>

          <label className="mb-1 block text-xs text-muted">Expiration</label>
          <select
            className="mb-3 w-full rounded border border-border bg-field px-2 py-1.5 text-sm text-fg outline-none focus:border-accent"
            value={expiration}
            onChange={(e) => setExpiration(e.target.value)}
          >
            {expirations.map((exp) => (
              <option key={exp} value={exp}>
                {exp}
              </option>
            ))}
          </select>

          <div className="mb-1 flex items-center justify-between">
            <label className="block text-xs text-muted">Strike</label>
            {underlyingPrice != null && (
              <span className="text-[11px] text-muted">
                {symbol} {fmtUsd(underlyingPrice)}
              </span>
            )}
          </div>
          <div className="mb-3 max-h-48 overflow-y-auto rounded border border-border bg-field">
            <div className="grid grid-cols-3 gap-1 border-b border-border px-2 py-1 text-[10px] uppercase tracking-wide text-muted">
              <span>Strike</span>
              <span className="text-right">Last</span>
              <span className="text-right">OI</span>
            </div>
            {strikesForExpiration.map((c) => {
              const itm =
                underlyingPrice != null &&
                (optionType === "call" ? c.strike_price < underlyingPrice : c.strike_price > underlyingPrice);
              const selected = c.symbol === selectedSymbol;
              return (
                <button
                  key={c.symbol}
                  type="button"
                  onClick={() => setSelectedSymbol(c.symbol)}
                  className={`grid w-full grid-cols-3 gap-1 border-l-2 px-2 py-1.5 text-left text-xs transition-colors ${
                    selected
                      ? "border-l-violet-400 bg-violet-500/15 text-fg"
                      : itm
                      ? "border-l-transparent bg-accent/5 text-fg hover:bg-violet-500/10"
                      : "border-l-transparent text-muted hover:bg-violet-500/10 hover:text-fg"
                  }`}
                >
                  <span className="tabular-nums font-medium">{c.strike_price.toFixed(2)}</span>
                  <span className="text-right tabular-nums">
                    {c.close_price != null ? fmtUsd(c.close_price) : "—"}
                  </span>
                  <span className="text-right tabular-nums">{c.open_interest ?? "—"}</span>
                </button>
              );
            })}
            {strikesForExpiration.length === 0 && (
              <p className="px-2 py-2 text-xs text-muted">No strikes for this expiration.</p>
            )}
          </div>

          <label className="mb-1 block text-xs text-muted">Contracts</label>
          <input
            type="number"
            min={1}
            className="mb-3 w-full rounded border border-border bg-field px-2 py-1.5 text-sm outline-none focus:border-accent"
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
          />

          <label className="mb-1 block text-xs text-muted">Type</label>
          <div className="relative mb-3">
            <select
              className="w-full rounded border border-border bg-field px-2 py-1.5 text-sm text-fg outline-none focus:border-accent"
              value={type}
              onChange={(e) => setType(e.target.value as "market" | "limit")}
            >
              <option value="market">Market</option>
              <option value="limit">Limit</option>
            </select>
          </div>

          {type === "limit" && (
            <>
              <label className="mb-1 block text-xs text-muted">Limit price</label>
              <input
                type="number"
                className="mb-3 w-full rounded border border-border bg-field px-2 py-1.5 text-sm outline-none focus:border-accent"
                value={limitPrice}
                onChange={(e) => setLimitPrice(Number(e.target.value))}
              />
            </>
          )}

          {estCost != null && (
            <div className="mb-3 flex items-center justify-between text-xs">
              <span className="text-muted">
                Est. {type === "limit" ? "cost" : "cost @ mkt"} (×100/contract)
              </span>
              <span className={`tabular-nums font-medium ${insufficient ? "text-down" : "text-fg"}`}>
                {fmtUsd(estCost)}
              </span>
            </div>
          )}

          <div className="mb-1 flex items-center justify-between">
            <label className="block text-xs text-muted">Action</label>
            <span className={`text-[11px] font-medium ${isBuy ? "text-up" : "text-down"}`}>
              {positionLabel(optionType, intent)}
            </span>
          </div>
          <div className="relative mb-3">
            <button
              type="button"
              onClick={() => setIntentOpen((o) => !o)}
              onBlur={() => setTimeout(() => setIntentOpen(false), 150)}
              className={`flex w-full items-center justify-between rounded border bg-field px-2 py-1.5 text-sm text-fg outline-none cursor-pointer ${
                intentOpen ? "border-violet-400" : "border-border"
              }`}
            >
              {INTENT_OPTIONS.find((o) => o.value === intent)?.label}
              <ChevronDown size={12} strokeWidth={2} className="opacity-70" />
            </button>
            {intentOpen && (
              <div className="absolute top-full left-0 right-0 z-30 mt-1 rounded-md border border-border bg-panel py-1 shadow-lg">
                {INTENT_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setIntent(o.value);
                      setIntentOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-xs transition-colors ${
                      o.value === intent
                        ? "bg-violet-500/20 text-fg"
                        : "text-muted hover:bg-violet-500/10 hover:text-fg"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            disabled={busy || !selectedContract || insufficient}
            onClick={submit}
            className={`w-full rounded py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50 ${
              isBuy ? "bg-accent text-on-accent" : "bg-down/80 text-white"
            }`}
          >
            {busy ? "Placing…" : `Execute ${INTENT_OPTIONS.find((o) => o.value === intent)?.label}`}
          </button>

          {insufficient && (
            <p className="mt-2 text-xs text-down">Estimated cost exceeds available buying power.</p>
          )}
          {status && <p className="mt-3 text-xs text-muted">{status}</p>}
        </>
      )}
    </div>
  );
}
