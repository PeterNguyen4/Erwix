"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { api, DebriefRequest, JournalEntry, JournalEntryInput, Trade } from "@/lib/api";

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const toDateInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const toDatetimeInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");
const timeLabel = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";

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

const MAX_VISIBLE_CHIPS = 3;

function EventChip({ row, onClick }: { row: JournalRow; onClick: () => void }) {
  const sideClass =
    row.side === "buy"
      ? "bg-up/15 text-up hover:bg-up/25"
      : row.side === "sell"
        ? "bg-down/15 text-down hover:bg-down/25"
        : "bg-accent/15 text-accent hover:bg-accent/25";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium transition-colors ${sideClass}`}
      title={`${row.symbol ?? "Note"} ${row.side ?? ""} ${timeLabel(row.entryTime)}`}
    >
      {row.entryTime && <span className="shrink-0 tabular-nums opacity-70">{timeLabel(row.entryTime)}</span>}
      <span className="truncate">{row.symbol ?? "Note"}</span>
      {row.notes && <span className="shrink-0 opacity-60">•</span>}
    </button>
  );
}

interface JournalCalendarProps {
  onDebriefTrade?: (request: DebriefRequest) => void;
}

export default function JournalCalendar({ onDebriefTrade }: JournalCalendarProps) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [monthTrades, setMonthTrades] = useState<Trade[]>([]);
  const [monthEntries, setMonthEntries] = useState<JournalEntry[]>([]);

  const [dayOverflow, setDayOverflow] = useState<Date | null>(null);
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
    api
      .journalEntries({ from: toDateInput(first), to: toDateInput(new Date(to)) })
      .then(setMonthEntries)
      .catch(() => setMonthEntries([]));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reloadMonth, [monthOffset]);

  const view = useMemo(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const label = first.toLocaleString("en-US", { month: "long", year: "numeric" });
    const startWeekday = first.getDay();
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(first.getFullYear(), first.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);
    return { label, cells };
  }, [monthOffset]);

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
    for (const list of m.values()) list.sort((a, b) => (a.entryTime ?? "").localeCompare(b.entryTime ?? ""));
    return m;
  }, [monthRows]);

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

  const openRow = (r: JournalRow) => {
    if (r.trade) openTrade(r.trade);
    else if (r.entry) openEdit(r.entry);
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
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const deleteEntry = async () => {
    if (formOpen?.mode !== "edit" || !formOpen.entry) return;
    await api.deleteJournalEntry(formOpen.entry.id).catch((e) => setError((e as Error).message));
    setFormOpen(null);
    reloadMonth();
  };

  const saveTradeNote = async () => {
    if (!tradeDetail) return;
    await api.saveTradeNote(tradeDetail.id, tradeNoteDraft).catch((e) => setError((e as Error).message));
    setTradeDetail(null);
    reloadMonth();
  };

  const inputClass =
    "w-full rounded-md border border-border bg-field px-2 py-1.5 text-sm text-fg placeholder:text-muted outline-none focus:border-accent";
  const labelClass = "mb-1 block text-[10px] font-medium tracking-wide text-muted";

  return (
    <div className="relative flex h-full flex-col">
      <div className="mb-3 flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonthOffset(0)}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-fg hover:bg-panel"
          >
            Today
          </button>
          <div className="flex items-center gap-0.5">
            <button onClick={() => setMonthOffset((m) => m - 1)} className="rounded p-1 text-muted hover:bg-panel hover:text-fg">
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
            <button
              onClick={() => setMonthOffset((m) => Math.min(0, m + 1))}
              disabled={monthOffset >= 0}
              className="rounded p-1 text-muted enabled:hover:bg-panel enabled:hover:text-fg disabled:opacity-30"
            >
              <ChevronRight size={16} strokeWidth={2} />
            </button>
          </div>
          <span className="text-lg font-normal text-fg">{view.label}</span>
        </div>
        <button
          onClick={() => openCreate(new Date())}
          className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1.5 text-xs font-semibold text-on-accent hover:bg-accent/80"
        >
          <Plus size={13} strokeWidth={2.5} />
          Add entry
        </button>
      </div>

      {error && <p className="mb-2 shrink-0 text-xs text-down">{error}</p>}

      <div className="grid shrink-0 grid-cols-7 gap-px overflow-hidden rounded-t-lg border border-b-0 border-border bg-border text-center text-[11px] font-medium text-muted">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="bg-panel py-1.5">
            {d}
          </div>
        ))}
      </div>
      <div
        className="grid flex-1 auto-rows-fr grid-cols-7 gap-px overflow-hidden rounded-b-lg border border-border bg-border"
        style={{ gridTemplateRows: `repeat(${view.cells.length / 7}, minmax(0, 1fr))` }}
      >
        {view.cells.map((cell, i) => {
          if (!cell) return <div key={i} className="bg-panel/40" />;
          const k = dayKey(cell);
          const isToday = k === todayKey;
          const rows = rowsByDay.get(k) ?? [];
          const visible = rows.slice(0, MAX_VISIBLE_CHIPS);
          const overflow = rows.length - visible.length;
          return (
            <div
              key={i}
              data-daykey={k}
              onClick={() => openCreate(cell)}
              className="group flex min-h-0 cursor-pointer flex-col gap-0.5 bg-panel p-1 transition-colors hover:bg-panel/80"
            >
              <div className="flex items-center justify-between px-0.5">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] tabular-nums ${
                    isToday ? "bg-accent font-semibold text-on-accent" : "text-muted"
                  }`}
                >
                  {cell.getDate()}
                </span>
                <Plus
                  size={11}
                  strokeWidth={2.5}
                  className="text-muted opacity-0 transition-opacity group-hover:opacity-100"
                />
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                {visible.map((r) => (
                  <EventChip key={r.key} row={r} onClick={() => openRow(r)} />
                ))}
                {overflow > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDayOverflow(cell);
                    }}
                    className="w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-muted hover:bg-border/60 hover:text-fg"
                  >
                    +{overflow} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Overflow panel: full list of entries for a day with more than MAX_VISIBLE_CHIPS */}
      {dayOverflow && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-bg/70 p-4"
          onClick={() => setDayOverflow(null)}
        >
          <div className="w-full max-w-sm rounded-md border border-border bg-panel p-3 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-medium tracking-wide text-muted">
                {dayOverflow.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </div>
              <button onClick={() => setDayOverflow(null)} className="text-xs text-muted hover:text-fg">
                ✕
              </button>
            </div>
            <div className="max-h-64 space-y-1 overflow-auto">
              {(rowsByDay.get(dayKey(dayOverflow)) ?? []).map((r) => (
                <button
                  key={r.key}
                  onClick={() => {
                    setDayOverflow(null);
                    openRow(r);
                  }}
                  className="flex w-full items-center justify-between rounded-md border border-border/60 px-2 py-1.5 text-left text-xs hover:bg-accent/10"
                >
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums text-muted">{timeLabel(r.entryTime)}</span>
                    <span className="font-medium text-fg">{r.symbol ?? "Note"}</span>
                  </span>
                  <span className={r.side === "buy" ? "text-up uppercase" : r.side === "sell" ? "text-down uppercase" : "text-muted"}>
                    {r.side ?? (r.source === "trade" ? "" : "manual")}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                const d = dayOverflow;
                setDayOverflow(null);
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
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-bg/70 p-4" onClick={() => setFormOpen(null)}>
          <div className="w-full max-w-md rounded-md border border-border bg-panel p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
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

      {/* Auto-logged trade detail: read-only fields + editable notes + debrief action */}
      {tradeDetail && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-bg/70 p-4" onClick={() => setTradeDetail(null)}>
          <div className="w-full max-w-sm rounded-md border border-border bg-panel p-3 shadow-lg" onClick={(e) => e.stopPropagation()}>
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
