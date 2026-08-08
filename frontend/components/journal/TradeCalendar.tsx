"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, Table as TableIcon, Plus, Trash2 } from "lucide-react";
import { api, DebriefRequest, JournalEntry, JournalEntryInput, PortfolioPoint, Trade } from "@/lib/api";

const fmtUsd = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const toDateInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const toDatetimeInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");

const WINDOWS = [
  { label: "1D", days: 1 },
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "All", days: 0 },
];

interface JournalRow {
  key: string;
  source: "trade" | "manual";
  id: number;
  date: Date;
  symbol: string | null;
  side: "buy" | "sell" | null;
  entryTime: string | null;
  entryPrice: number | null;
  exitTime: string | null;
  exitPrice: number | null;
  amount: number | null;
  notes: string | null;
  trade?: Trade;
  entry?: JournalEntry;
}

function tradeToRow(t: Trade): JournalRow {
  return {
    key: `trade-${t.id}`,
    source: "trade",
    id: t.id,
    date: new Date(t.filled_at!),
    symbol: t.symbol,
    side: t.side as "buy" | "sell",
    entryTime: t.filled_at,
    entryPrice: t.fill_price,
    exitTime: null,
    exitPrice: null,
    amount: t.fill_price != null ? t.fill_price * t.qty : null,
    notes: t.notes,
    trade: t,
  };
}

function entryToRow(e: JournalEntry): JournalRow {
  return {
    key: `entry-${e.id}`,
    source: "manual",
    id: e.id,
    date: new Date(`${e.entry_date}T00:00:00`),
    symbol: e.symbol,
    side: e.side,
    entryTime: e.entry_time,
    entryPrice: e.entry_price,
    exitTime: e.exit_time,
    exitPrice: e.exit_price,
    amount: e.order_amount,
    notes: e.notes,
    entry: e,
  };
}

const emptyForm = (dateKey: string): JournalEntryInput => ({
  entry_date: dateKey,
  symbol: "",
  side: null,
  entry_time: null,
  entry_price: null,
  exit_time: null,
  exit_price: null,
  order_amount: null,
  notes: "",
});

interface TradeCalendarProps {
  points: PortfolioPoint[];
  onDebriefTrade?: (request: DebriefRequest) => void;
}


export default function TradeCalendar({ points, onDebriefTrade }: TradeCalendarProps) {
  const [view, setView] = useState<"calendar" | "table">("calendar");
  const [monthOffset, setMonthOffset] = useState(0);
  const [monthTrades, setMonthTrades] = useState<Trade[]>([]);
  const [monthEntries, setMonthEntries] = useState<JournalEntry[]>([]);

  const [tableSymbol, setTableSymbol] = useState("");
  const [tableDays, setTableDays] = useState(30);
  const [windowOpen, setWindowOpen] = useState(false);
  const [tableTrades, setTableTrades] = useState<Trade[]>([]);
  const [tableEntries, setTableEntries] = useState<JournalEntry[]>([]);

  const [dayPanel, setDayPanel] = useState<Date | null>(null);
  const [formOpen, setFormOpen] = useState<{ mode: "create" | "edit"; entry: JournalEntry | null; dateKey: string } | null>(null);
  const [form, setForm] = useState<JournalEntryInput>(emptyForm(toDateInput(new Date())));
  const [tradeDetail, setTradeDetail] = useState<Trade | null>(null);
  const [tradeNoteDraft, setTradeNoteDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reloadMonth = () => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const from = first.toISOString();
    const to = new Date(first.getFullYear(), first.getMonth(), daysInMonth + 1).toISOString();
    api.trades({ from, to }).then(setMonthTrades).catch(() => setMonthTrades([]));
    api.journalEntries({ from: toDateInput(first), to: toDateInput(new Date(to)) }).then(setMonthEntries).catch(() => setMonthEntries([]));
  };

  const reloadTable = () => {
    const from = tableDays > 0 ? new Date(Date.now() - tableDays * 86400000) : undefined;
    api.trades({ symbol: tableSymbol || undefined, from: from?.toISOString() }).then(setTableTrades).catch(() => setTableTrades([]));
    api.journalEntries({ symbol: tableSymbol || undefined, from: from ? toDateInput(from) : undefined }).then(setTableEntries).catch(() => setTableEntries([]));
  };

  const view_ = useMemo(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const label = first.toLocaleString("en-US", { month: "long", year: "numeric" });
    const startWeekday = first.getDay();
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(first.getFullYear(), first.getMonth(), d));
    return { label, cells };
  }, [monthOffset]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reloadMonth, [monthOffset]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reloadTable, [tableDays, tableSymbol]);

  const dailyPl = useMemo(() => {
    const closes = new Map<string, { equity: number; time: number }>();
    for (const p of points) {
      const d = new Date(p.time * 1000);
      const k = dayKey(d);
      const prev = closes.get(k);
      if (!prev || p.time >= prev.time) closes.set(k, { equity: p.equity, time: p.time });
    }
    const ordered = [...closes.entries()].sort((a, b) => a[1].time - b[1].time);
    const pl = new Map<string, number>();
    for (let i = 1; i < ordered.length; i++) pl.set(ordered[i][0], ordered[i][1].equity - ordered[i - 1][1].equity);
    return pl;
  }, [points]);

  const monthRows = useMemo(
    () => [...monthTrades.filter((t) => t.filled_at).map(tradeToRow), ...monthEntries.map(entryToRow)],
    [monthTrades, monthEntries],
  );
  const rowsByDay = useMemo(() => {
    const m = new Map<string, JournalRow[]>();
    for (const r of monthRows) {
      const k = dayKey(r.date);
      const list = m.get(k) ?? [];
      list.push(r);
      m.set(k, list);
    }
    return m;
  }, [monthRows]);

  const tableRows = useMemo(
    () =>
      [...tableTrades.filter((t) => t.filled_at).map(tradeToRow), ...tableEntries.map(entryToRow)].sort(
        (a, b) => b.date.getTime() - a.date.getTime(),
      ),
    [tableTrades, tableEntries],
  );

  const todayKey = dayKey(new Date());

  const openCreate = (date: Date) => {
    const k = toDateInput(date);
    setForm(emptyForm(k));
    setFormOpen({ mode: "create", entry: null, dateKey: k });
  };

  const openEdit = (entry: JournalEntry) => {
    setForm({
      entry_date: entry.entry_date,
      symbol: entry.symbol ?? "",
      side: entry.side,
      entry_time: entry.entry_time,
      entry_price: entry.entry_price,
      exit_time: entry.exit_time,
      exit_price: entry.exit_price,
      order_amount: entry.order_amount,
      notes: entry.notes ?? "",
    });
    setFormOpen({ mode: "edit", entry, dateKey: entry.entry_date });
  };

  const openTrade = (t: Trade) => {
    setTradeDetail(t);
    setTradeNoteDraft(t.notes ?? "");
  };

  const saveForm = async () => {
    try {
      const payload: JournalEntryInput = {
        ...form,
        symbol: form.symbol ? form.symbol.toUpperCase() : null,
        entry_time: form.entry_time || null,
        exit_time: form.exit_time || null,
        notes: form.notes || null,
      };
      if (formOpen?.mode === "edit" && formOpen.entry) {
        await api.updateJournalEntry(formOpen.entry.id, payload);
      } else {
        await api.createJournalEntry(payload);
      }
      setFormOpen(null);
      reloadMonth();
      reloadTable();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const deleteEntry = async () => {
    if (formOpen?.mode !== "edit" || !formOpen.entry) return;
    await api.deleteJournalEntry(formOpen.entry.id).catch((e) => setError((e as Error).message));
    setFormOpen(null);
    reloadMonth();
    reloadTable();
  };

  const saveTradeNote = async () => {
    if (!tradeDetail) return;
    await api.saveTradeNote(tradeDetail.id, tradeNoteDraft).catch((e) => setError((e as Error).message));
    setTradeDetail(null);
    reloadMonth();
    reloadTable();
  };

  const inputClass =
    "w-full rounded-md border border-border bg-field px-2 py-1.5 text-sm text-fg placeholder:text-muted outline-none focus:border-accent";
  const labelClass = "mb-1 block text-[10px] font-medium tracking-wide text-muted";

  return (
    <div className="relative rounded-lg border border-border bg-panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-md bg-field p-0.5">
          <button
            onClick={() => setView("calendar")}
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
              view === "calendar" ? "bg-accent text-on-accent" : "text-muted hover:text-fg"
            }`}
          >
            <CalendarDays size={12} strokeWidth={2} />
            Calendar
          </button>
          <button
            onClick={() => setView("table")}
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
              view === "table" ? "bg-accent text-on-accent" : "text-muted hover:text-fg"
            }`}
          >
            <TableIcon size={12} strokeWidth={2} />
            Table
          </button>
        </div>

        {view === "calendar" ? (
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => setMonthOffset((m) => m - 1)}
              className="rounded bg-border px-2 py-0.5 text-muted hover:bg-accent/30"
            >
              ‹
            </button>
            <span className="w-32 text-center font-medium text-fg">{view_.label}</span>
            <button
              onClick={() => setMonthOffset((m) => Math.min(0, m + 1))}
              disabled={monthOffset >= 0}
              className="rounded bg-border px-2 py-0.5 text-muted enabled:hover:bg-accent/30 disabled:opacity-40"
            >
              ›
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="relative flex items-center">
              <button
                type="button"
                onClick={() => setWindowOpen((o) => !o)}
                onBlur={() => setTimeout(() => setWindowOpen(false), 150)}
                className={`flex items-center gap-1 rounded border bg-field px-2 py-1 text-xs text-fg transition-colors outline-none ${
                  windowOpen ? "border-accent" : "border-transparent"
                }`}
              >
                {WINDOWS.find((w) => w.days === tableDays)?.label}
                <ChevronDown size={12} strokeWidth={2} className="opacity-70" />
              </button>
              {windowOpen && (
                <div className="absolute right-0 top-full z-30 mt-1 w-20 rounded-md border border-border bg-panel py-1 shadow-lg">
                  {WINDOWS.map((w) => (
                    <button
                      key={w.label}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setTableDays(w.days);
                        setWindowOpen(false);
                      }}
                      className={`flex w-full items-center px-3 py-1.5 text-xs transition-colors ${
                        tableDays === w.days ? "bg-accent/20 text-fg" : "text-muted hover:bg-accent/10 hover:text-fg"
                      }`}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input
              value={tableSymbol}
              onChange={(e) => setTableSymbol(e.target.value.toUpperCase())}
              placeholder="Symbol"
              className="w-20 rounded border border-border bg-field px-2 py-1 text-xs text-fg outline-none focus:border-accent"
            />
            <button
              onClick={() => openCreate(new Date())}
              className="flex items-center gap-1 rounded bg-accent px-2 py-1 text-xs font-semibold text-on-accent hover:bg-accent/80"
            >
              <Plus size={12} strokeWidth={2.5} />
              Add
            </button>
          </div>
        )}
      </div>

      {error && <p className="mb-2 text-xs text-down">{error}</p>}

      {view === "calendar" ? (
        <>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {view_.cells.map((cell, i) => {
              if (!cell) return <div key={i} />;
              const k = dayKey(cell);
              const pl = dailyPl.get(k);
              const hasData = pl != null && Math.abs(pl) > 0.005;
              const up = (pl ?? 0) >= 0;
              const isToday = k === todayKey;
              const entryCount = (rowsByDay.get(k) ?? []).length;
              return (
                <div
                  key={i}
                  data-daykey={k}
                  title={hasData ? `${up ? "+" : ""}${fmtUsd(pl!)}` : undefined}
                  onClick={() => (entryCount > 0 ? setDayPanel(cell) : openCreate(cell))}
                  className={`group relative flex aspect-square cursor-pointer flex-col items-center justify-center rounded text-xs tabular-nums hover:ring-1 hover:ring-accent ${
                    hasData ? (up ? "bg-up/20 text-up" : "bg-down/20 text-down") : "bg-border/40 text-muted"
                  } ${isToday ? "ring-1 ring-accent" : ""}`}
                >
                  {entryCount > 0 && (
                    <span
                      className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-on-accent"
                      title={`${entryCount} journal entr${entryCount === 1 ? "y" : "ies"}`}
                    >
                      {entryCount > 3 ? "3+" : entryCount}
                    </span>
                  )}
                  <span>{cell.getDate()}</span>
                  {hasData && (
                    <span className="text-[9px] leading-none">
                      {up ? "+" : ""}
                      {fmtUsd(pl!)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="max-h-96 overflow-auto">
          {tableRows.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted">No journal entries in this window.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-muted">
                <tr className="text-left">
                  <th className="py-1">Date</th>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th className="text-right">Entry</th>
                  <th className="text-right">Exit</th>
                  <th className="text-right">Amount</th>
                  <th className="text-center">Notes</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r) => (
                  <tr
                    key={r.key}
                    onClick={() => (r.trade ? openTrade(r.trade) : r.entry ? openEdit(r.entry) : undefined)}
                    className="cursor-pointer border-t border-border/50 hover:bg-accent/10"
                  >
                    <td className="py-1.5 whitespace-nowrap text-muted">
                      {r.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </td>
                    <td className="font-medium text-fg">{r.symbol ?? "—"}</td>
                    <td className={r.side === "buy" ? "text-up uppercase" : r.side === "sell" ? "text-down uppercase" : "text-muted"}>
                      {r.side ?? "—"}
                    </td>
                    <td className="text-right tabular-nums">{r.entryPrice != null ? `$${r.entryPrice.toFixed(2)}` : "—"}</td>
                    <td className="text-right tabular-nums">{r.exitPrice != null ? `$${r.exitPrice.toFixed(2)}` : "—"}</td>
                    <td className="text-right tabular-nums">{r.amount != null ? fmtUsd(r.amount) : "—"}</td>
                    <td className="text-center">{r.notes ? <span className="text-accent">•</span> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Day panel: list of entries for a clicked calendar day */}
      {dayPanel && (
        <div className="absolute inset-0 z-40 flex items-center justify-center rounded-lg bg-bg/70 p-4">
          <div className="w-full max-w-sm rounded-md border border-border bg-panel p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-medium tracking-wide text-muted">
                {dayPanel.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </div>
              <button onClick={() => setDayPanel(null)} className="text-xs text-muted hover:text-fg">
                ✕
              </button>
            </div>
            <div className="max-h-64 space-y-1 overflow-auto">
              {(rowsByDay.get(dayKey(dayPanel)) ?? []).map((r) => (
                <button
                  key={r.key}
                  onClick={() => {
                    setDayPanel(null);
                    if (r.trade) openTrade(r.trade);
                    else if (r.entry) openEdit(r.entry);
                  }}
                  className="flex w-full items-center justify-between rounded-md border border-border/60 px-2 py-1.5 text-left text-xs hover:bg-accent/10"
                >
                  <span className="font-medium text-fg">{r.symbol ?? "Note"}</span>
                  <span className={r.side === "buy" ? "text-up uppercase" : r.side === "sell" ? "text-down uppercase" : "text-muted"}>
                    {r.side ?? (r.source === "trade" ? "" : "manual")}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                const d = dayPanel;
                setDayPanel(null);
                openCreate(d);
              }}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-border py-1.5 text-xs font-medium text-muted hover:border-accent hover:text-accent"
            >
              <Plus size={12} strokeWidth={2.5} />
              Add entry
            </button>
          </div>
        </div>
      )}

      {/* Manual entry create/edit form */}
      {formOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center rounded-lg bg-bg/70 p-4">
          <div className="w-full max-w-md rounded-md border border-border bg-panel p-6 shadow-lg">
            <div className="mb-5 flex items-center justify-between">
              <div className="text-xs font-medium tracking-wide text-muted">
                {formOpen.mode === "edit" ? "Edit Entry" : "New Entry"} — {formOpen.dateKey}
              </div>
              <button onClick={() => setFormOpen(null)} className="text-xs text-muted hover:text-fg">
                ✕
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>Date</label>
                  <input
                    type="date"
                    value={form.entry_date}
                    onChange={(e) => setForm((f) => ({ ...f, entry_date: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Symbol</label>
                  <input
                    value={form.symbol ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                    placeholder="AAPL"
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Side</label>
                <div className="flex gap-1">
                  {(["buy", "sell"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, side: f.side === s ? null : s }))}
                      className={`flex-1 rounded px-2 py-1 text-xs font-medium uppercase transition-colors ${
                        form.side === s
                          ? s === "buy"
                            ? "bg-up/20 text-up"
                            : "bg-down/20 text-down"
                          : "bg-field text-muted hover:text-fg"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>Entry Time</label>
                  <input
                    type="datetime-local"
                    value={toDatetimeInput(form.entry_time ?? null)}
                    onChange={(e) => setForm((f) => ({ ...f, entry_time: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Entry Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.entry_price ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, entry_price: e.target.value ? Number(e.target.value) : null }))}
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>Exit Time</label>
                  <input
                    type="datetime-local"
                    value={toDatetimeInput(form.exit_time ?? null)}
                    onChange={(e) => setForm((f) => ({ ...f, exit_time: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Exit Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.exit_price ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, exit_price: e.target.value ? Number(e.target.value) : null }))}
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Order Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.order_amount ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, order_amount: e.target.value ? Number(e.target.value) : null }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Notes</label>
                <textarea
                  value={form.notes ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="What was your plan? How did it play out?"
                  className={`${inputClass} h-20 resize-y`}
                />
              </div>
            </div>
            <div className="mt-6 flex items-center justify-between">
              {formOpen.mode === "edit" ? (
                <button onClick={deleteEntry} className="flex items-center gap-1 text-xs font-medium text-down hover:text-down/80">
                  <Trash2 size={12} strokeWidth={2} />
                  Delete
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button onClick={() => setFormOpen(null)} className="rounded-md px-3 py-1 text-xs font-medium text-muted hover:text-fg">
                  Cancel
                </button>
                <button
                  onClick={saveForm}
                  className="rounded-md bg-accent px-3 py-1 text-xs font-semibold text-on-accent transition-colors hover:bg-accent/80"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tradeDetail && (
        <div className="absolute inset-0 z-40 flex items-center justify-center rounded-lg bg-bg/70 p-4">
          <div className="w-full max-w-sm rounded-md border border-border bg-panel p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-medium tracking-wide text-muted">
                {tradeDetail.symbol} — {new Date(tradeDetail.filled_at!).toLocaleString()}
              </div>
              <button onClick={() => setTradeDetail(null)} className="text-xs text-muted hover:text-fg">
                ✕
              </button>
            </div>
            <div className="mb-2 grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-muted">Side</div>
                <div className={tradeDetail.side === "buy" ? "text-up uppercase" : "text-down uppercase"}>{tradeDetail.side}</div>
              </div>
              <div>
                <div className="text-muted">Qty</div>
                <div className="text-fg tabular-nums">{tradeDetail.qty}</div>
              </div>
              <div>
                <div className="text-muted">Fill</div>
                <div className="text-fg tabular-nums">${tradeDetail.fill_price?.toFixed(2)}</div>
              </div>
            </div>
            <label className={labelClass}>Notes</label>
            <textarea
              value={tradeNoteDraft}
              onChange={(e) => setTradeNoteDraft(e.target.value)}
              placeholder="What was your plan? Which confluences lined up?"
              className={`${inputClass} h-24 resize-y`}
            />
            <div className="mt-3 flex items-center justify-between">
              <button
                onClick={() => {
                  const t = tradeDetail;
                  const filled = new Date(t.filled_at!);
                  onDebriefTrade?.({
                    from: new Date(filled.getTime() - 3 * 86400000).toISOString(),
                    to: new Date(filled.getTime() + 86400000).toISOString(),
                    symbol: t.symbol,
                    query: `Reflect specifically on my ${t.side} of ${t.symbol} filled at $${t.fill_price} on ${filled.toLocaleDateString()}.`,
                  });
                  setTradeDetail(null);
                }}
                className="rounded-md bg-accent/20 px-3 py-1 text-xs font-semibold text-accent hover:bg-accent/30"
              >
                Debrief this trade
              </button>
              <button
                onClick={saveTradeNote}
                className="rounded-md bg-accent px-3 py-1 text-xs font-semibold text-on-accent transition-colors hover:bg-accent/80"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
