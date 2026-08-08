"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { api, DebriefRequest, JournalEntry, JournalEntryInput, Trade } from "@/lib/api";
import { useClickOutside } from "@/lib/useClickOutside";

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const toDateInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const toDatetimeInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");
const timeLabel = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const addYears = (d: Date, n: number) => new Date(d.getFullYear() + n, 0, 1);
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const startOfWeek = (d: Date) => addDays(startOfDay(d), -d.getDay());
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const startOfYear = (d: Date) => new Date(d.getFullYear(), 0, 1);

type ViewMode = "day" | "week" | "month" | "year" | "table";

const VIEW_OPTIONS: { id: ViewMode; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
  { id: "table", label: "Table" },
];

const WINDOWS = [
  { label: "1D", days: 1 },
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "All", days: 0 },
];

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

function monthCells(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

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

function ViewDropdown({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
          open ? "border-accent text-fg" : "border-border text-fg hover:bg-panel"
        }`}
      >
        {VIEW_OPTIONS.find((o) => o.id === view)?.label}
        <ChevronDown size={12} strokeWidth={2} className="opacity-70" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-28 rounded-md border border-border bg-panel py-1 shadow-lg">
          {VIEW_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
              className={`flex w-full items-center px-3 py-1.5 text-left text-xs transition-colors ${
                o.id === view ? "bg-accent/20 text-fg" : "text-muted hover:bg-accent/10 hover:text-fg"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface JournalCalendarProps {
  onDebriefTrade?: (request: DebriefRequest) => void;
}

export default function JournalCalendar({ onDebriefTrade }: JournalCalendarProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [rangeTrades, setRangeTrades] = useState<Trade[]>([]);
  const [rangeEntries, setRangeEntries] = useState<JournalEntry[]>([]);

  const [tableSymbol, setTableSymbol] = useState("");
  const [tableDays, setTableDays] = useState(30);
  const [windowOpen, setWindowOpen] = useState(false);
  const [tableTrades, setTableTrades] = useState<Trade[]>([]);
  const [tableEntries, setTableEntries] = useState<JournalEntry[]>([]);

  const [dayOverflow, setDayOverflow] = useState<Date | null>(null);
  const [formOpen, setFormOpen] = useState<{ mode: "create" | "edit"; entry: JournalEntry | null; dateKey: string } | null>(null);
  const [form, setForm] = useState<JournalEntryInput>(emptyForm(toDateInput(new Date())));
  const [tradeDetail, setTradeDetail] = useState<Trade | null>(null);
  const [tradeNoteDraft, setTradeNoteDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    if (viewMode === "day") {
      const start = startOfDay(anchor);
      return { start, end: addDays(start, 1) };
    }
    if (viewMode === "week") {
      const start = startOfWeek(anchor);
      return { start, end: addDays(start, 7) };
    }
    if (viewMode === "year") {
      const start = startOfYear(anchor);
      return { start, end: addYears(start, 1) };
    }
    const start = startOfMonth(anchor);
    return { start, end: addMonths(start, 1) };
  }, [viewMode, anchor]);

  const reloadRange = () => {
    if (viewMode === "table") return;
    api.trades({ from: range.start.toISOString(), to: range.end.toISOString() }).then(setRangeTrades).catch(() => setRangeTrades([]));
    api
      .journalEntries({ from: toDateInput(range.start), to: toDateInput(addDays(range.end, -1)) })
      .then(setRangeEntries)
      .catch(() => setRangeEntries([]));
  };

  const reloadTable = () => {
    const from = tableDays > 0 ? new Date(Date.now() - tableDays * 86400000) : undefined;
    api.trades({ symbol: tableSymbol || undefined, from: from?.toISOString() }).then(setTableTrades).catch(() => setTableTrades([]));
    api
      .journalEntries({ symbol: tableSymbol || undefined, from: from ? toDateInput(from) : undefined })
      .then(setTableEntries)
      .catch(() => setTableEntries([]));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reloadRange, [viewMode, range.start.getTime(), range.end.getTime()]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reloadTable, [viewMode, tableDays, tableSymbol]);

  const rangeRows = useMemo(
    () => [...rangeTrades.filter((t) => t.filled_at).map(tradeToRow), ...rangeEntries.map(entryToRow)],
    [rangeTrades, rangeEntries],
  );
  const rowsByDay = useMemo(() => {
    const m = new Map<string, JournalRow[]>();
    for (const r of rangeRows) {
      const k = dayKey(r.date);
      const list = m.get(k) ?? [];
      list.push(r);
      m.set(k, list);
    }
    for (const list of m.values()) list.sort((a, b) => (a.entryTime ?? "").localeCompare(b.entryTime ?? ""));
    return m;
  }, [rangeRows]);

  const tableRows = useMemo(
    () =>
      [...tableTrades.filter((t) => t.filled_at).map(tradeToRow), ...tableEntries.map(entryToRow)].sort(
        (a, b) => b.date.getTime() - a.date.getTime(),
      ),
    [tableTrades, tableEntries],
  );

  const todayKey = dayKey(new Date());

  const periodStart = (d: Date, mode: ViewMode) =>
    mode === "day" ? startOfDay(d) : mode === "week" ? startOfWeek(d) : mode === "year" ? startOfYear(d) : startOfMonth(d);

  const navDelta = (dir: 1 | -1) => {
    if (viewMode === "day") setAnchor((a) => addDays(a, dir));
    else if (viewMode === "week") setAnchor((a) => addDays(a, dir * 7));
    else if (viewMode === "year") setAnchor((a) => addYears(a, dir));
    else setAnchor((a) => addMonths(a, dir));
  };

  const nextDisabled = viewMode !== "table" && periodStart(range.start, viewMode) >= periodStart(new Date(), viewMode);

  const label = useMemo(() => {
    if (viewMode === "day") return anchor.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    if (viewMode === "week") {
      const start = range.start;
      const end = addDays(range.end, -1);
      const sameMonth = start.getMonth() === end.getMonth();
      const startLabel = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const endLabel = end.toLocaleDateString("en-US", sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" });
      return `${startLabel} – ${endLabel}, ${end.getFullYear()}`;
    }
    if (viewMode === "year") return `${anchor.getFullYear()}`;
    if (viewMode === "month") return anchor.toLocaleString("en-US", { month: "long", year: "numeric" });
    return "";
  }, [viewMode, anchor, range]);

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

  const reloadAll = () => {
    reloadRange();
    reloadTable();
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
      reloadAll();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const deleteEntry = async () => {
    if (formOpen?.mode !== "edit" || !formOpen.entry) return;
    await api.deleteJournalEntry(formOpen.entry.id).catch((e) => setError((e as Error).message));
    setFormOpen(null);
    reloadAll();
  };

  const saveTradeNote = async () => {
    if (!tradeDetail) return;
    await api.saveTradeNote(tradeDetail.id, tradeNoteDraft).catch((e) => setError((e as Error).message));
    setTradeDetail(null);
    reloadAll();
  };

  const inputClass =
    "w-full rounded-md border border-border bg-field px-2 py-1.5 text-sm text-fg placeholder:text-muted outline-none focus:border-accent";
  const labelClass = "mb-1 block text-[10px] font-medium tracking-wide text-muted";

  const renderDayCell = (cell: Date, maxVisible: number) => {
    const k = dayKey(cell);
    const isToday = k === todayKey;
    const rows = rowsByDay.get(k) ?? [];
    const visible = rows.slice(0, maxVisible);
    const overflow = rows.length - visible.length;
    return (
      <div
        key={k}
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
          <Plus size={11} strokeWidth={2.5} className="text-muted opacity-0 transition-opacity group-hover:opacity-100" />
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
  };

  return (
    <div className="relative flex h-full flex-col">
      <div className="mb-3 flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAnchor(new Date())}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-fg hover:bg-panel"
          >
            Today
          </button>
          {viewMode !== "table" && (
            <div className="flex items-center gap-0.5">
              <button onClick={() => navDelta(-1)} className="rounded p-1 text-muted hover:bg-panel hover:text-fg">
                <ChevronLeft size={16} strokeWidth={2} />
              </button>
              <button
                onClick={() => navDelta(1)}
                disabled={nextDisabled}
                className="rounded p-1 text-muted enabled:hover:bg-panel enabled:hover:text-fg disabled:opacity-30"
              >
                <ChevronRight size={16} strokeWidth={2} />
              </button>
            </div>
          )}
          <span className="text-lg font-normal text-fg">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          {viewMode === "table" && (
            <>
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
            </>
          )}
          <ViewDropdown view={viewMode} onChange={setViewMode} />
          <button
            onClick={() => openCreate(new Date())}
            className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1.5 text-xs font-semibold text-on-accent hover:bg-accent/80"
          >
            <Plus size={13} strokeWidth={2.5} />
            Add entry
          </button>
        </div>
      </div>

      {error && <p className="mb-2 shrink-0 text-xs text-down">{error}</p>}

      {viewMode === "table" ? (
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-panel">
          {tableRows.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted">No journal entries in this window.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-panel text-muted">
                <tr className="text-left">
                  <th className="py-2 pl-3">Date</th>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th className="text-right">Entry</th>
                  <th className="text-right">Exit</th>
                  <th className="text-right">Amount</th>
                  <th className="pr-3 text-center">Notes</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r) => (
                  <tr
                    key={r.key}
                    onClick={() => (r.trade ? openTrade(r.trade) : r.entry ? openEdit(r.entry) : undefined)}
                    className="cursor-pointer border-t border-border/50 hover:bg-accent/10"
                  >
                    <td className="py-1.5 pl-3 whitespace-nowrap text-muted">
                      {r.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </td>
                    <td className="font-medium text-fg">{r.symbol ?? "—"}</td>
                    <td className={r.side === "buy" ? "text-up uppercase" : r.side === "sell" ? "text-down uppercase" : "text-muted"}>
                      {r.side ?? "—"}
                    </td>
                    <td className="text-right tabular-nums">{r.entryPrice != null ? `$${r.entryPrice.toFixed(2)}` : "—"}</td>
                    <td className="text-right tabular-nums">{r.exitPrice != null ? `$${r.exitPrice.toFixed(2)}` : "—"}</td>
                    <td className="text-right tabular-nums">{r.amount != null ? `$${r.amount.toFixed(0)}` : "—"}</td>
                    <td className="pr-3 text-center">{r.notes ? <span className="text-accent">•</span> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : viewMode === "day" ? (
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-panel p-3">
          {(rowsByDay.get(dayKey(anchor)) ?? []).length === 0 ? (
            <button
              onClick={() => openCreate(anchor)}
              className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-border py-6 text-xs font-medium text-muted hover:border-accent hover:text-accent"
            >
              <Plus size={12} strokeWidth={2.5} />
              Add entry for this day
            </button>
          ) : (
            <div className="space-y-1.5">
              {(rowsByDay.get(dayKey(anchor)) ?? []).map((r) => (
                <button
                  key={r.key}
                  onClick={() => openRow(r)}
                  className="flex w-full items-center justify-between rounded-md border border-border/60 px-3 py-2 text-left text-sm hover:bg-accent/10"
                >
                  <span className="flex items-center gap-3">
                    <span className="w-16 shrink-0 tabular-nums text-muted">{timeLabel(r.entryTime)}</span>
                    <span className="font-medium text-fg">{r.symbol ?? "Note"}</span>
                    {r.notes && <span className="truncate text-xs text-muted">{r.notes}</span>}
                  </span>
                  <span className={r.side === "buy" ? "text-up uppercase" : r.side === "sell" ? "text-down uppercase" : "text-muted"}>
                    {r.side ?? (r.source === "trade" ? "" : "manual")}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : viewMode === "year" ? (
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-3 overflow-auto pb-1 sm:grid-cols-4">
          {Array.from({ length: 12 }, (_, month) => {
            const cells = monthCells(anchor.getFullYear(), month);
            return (
              <div key={month} className="rounded-lg border border-border bg-panel p-2">
                <button
                  onClick={() => {
                    setAnchor(new Date(anchor.getFullYear(), month, 1));
                    setViewMode("month");
                  }}
                  className="mb-1.5 w-full text-left text-xs font-semibold text-fg hover:text-accent"
                >
                  {new Date(anchor.getFullYear(), month, 1).toLocaleString("en-US", { month: "long" })}
                </button>
                <div className="grid grid-cols-7 gap-0.5 text-center text-[8px] text-muted">
                  {WEEKDAY_LABELS.map((d) => (
                    <div key={d}>{d[0]}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {cells.map((cell, i) => {
                    if (!cell) return <div key={i} className="aspect-square" />;
                    const k = dayKey(cell);
                    const hasEntries = (rowsByDay.get(k) ?? []).length > 0;
                    const isToday = k === todayKey;
                    return (
                      <button
                        key={i}
                        onClick={() => {
                          setAnchor(cell);
                          setViewMode("day");
                        }}
                        className={`flex aspect-square items-center justify-center rounded-sm text-[9px] tabular-nums transition-colors ${
                          hasEntries ? "bg-accent/30 text-fg hover:bg-accent/50" : "text-muted hover:bg-border/60"
                        } ${isToday ? "ring-1 ring-accent" : ""}`}
                      >
                        {cell.getDate()}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div className="grid shrink-0 grid-cols-7 gap-px overflow-hidden rounded-t-lg border border-b-0 border-border bg-border text-center text-[11px] font-medium text-muted">
            {WEEKDAY_LABELS.map((d) => (
              <div key={d} className="bg-panel py-1.5">
                {d}
              </div>
            ))}
          </div>
          <div
            className="grid flex-1 auto-rows-fr grid-cols-7 gap-px overflow-hidden rounded-b-lg border border-border bg-border"
            style={
              viewMode === "week"
                ? undefined
                : { gridTemplateRows: `repeat(${monthCells(anchor.getFullYear(), anchor.getMonth()).length / 7}, minmax(0, 1fr))` }
            }
          >
            {(viewMode === "week"
              ? Array.from({ length: 7 }, (_, i) => addDays(range.start, i))
              : monthCells(anchor.getFullYear(), anchor.getMonth())
            ).map((cell, i) =>
              cell ? renderDayCell(cell, viewMode === "week" ? 8 : 3) : <div key={i} className="bg-panel/40" />,
            )}
          </div>
        </>
      )}

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
