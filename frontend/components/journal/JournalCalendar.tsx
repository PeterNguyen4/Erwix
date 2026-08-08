"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Clock, DollarSign, Plus, StickyNote, Trash2, TrendingDown, TrendingUp, X } from "lucide-react";
import { api, DebriefRequest, JournalEntry, JournalEntryInput, PortfolioPoint, Trade } from "@/lib/api";
import { useClickOutside } from "@/lib/useClickOutside";

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const toDateInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const timeLabel = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", d.getMinutes() === 0 ? { hour: "numeric" } : { hour: "numeric", minute: "2-digit" });
};
const hhmmLocal = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const minutesFromHHMM = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const addYears = (d: Date, n: number) => new Date(d.getFullYear() + n, 0, 1);
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const startOfWeek = (d: Date) => addDays(startOfDay(d), -d.getDay());
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const startOfYear = (d: Date) => new Date(d.getFullYear(), 0, 1);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

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

const HOUR_HEIGHT = 88;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DEFAULT_DURATION_MIN = 60;
const TRADE_DURATION_MIN = 30;
const SNAP_MIN = 15;
const MIN_DURATION_MIN = 15;
const PANEL_WIDTH = 480;
const PANEL_MAX_HEIGHT = 460;

function hourLabel(h: number): string {
  return new Date(2000, 0, 1, h).toLocaleTimeString("en-US", { hour: "numeric" });
}

function minutesOfIso(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function isoAtMinutes(dateKeyOrDate: Date | string, minutes: number): string {
  const day = typeof dateKeyOrDate === "string" ? new Date(`${dateKeyOrDate}T00:00:00`) : startOfDay(dateKeyOrDate);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes).toISOString();
}

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
  side: "buy",
  timeframe: null,
  entry_time: null,
  entry_price: null,
  exit_time: null,
  exit_price: null,
  order_amount: null,
  notes: "",
});

const ENTRY_TIMEFRAMES: { id: string; label: string }[] = [
  { id: "1Min", label: "1m" },
  { id: "5Min", label: "5m" },
  { id: "15Min", label: "15m" },
  { id: "1Hour", label: "1H" },
  { id: "1Day", label: "1D" },
  { id: "1Week", label: "1W" },
  { id: "1Month", label: "1M" },
];

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

interface Interval {
  row: JournalRow;
  start: number;
  end: number;
}

function layoutDay(rows: JournalRow[]): Map<string, { col: number; cols: number }> {
  const intervals: Interval[] = rows
    .map((r) => {
      const start = r.entryTime ? minutesOfIso(r.entryTime) : 0;
      const defaultDuration = r.source === "trade" ? TRADE_DURATION_MIN : DEFAULT_DURATION_MIN;
      const end = r.exitTime ? minutesOfIso(r.exitTime) : start + defaultDuration;
      return { row: r, start, end: Math.max(end, start + MIN_DURATION_MIN) };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const result = new Map<string, { col: number; cols: number }>();
  let cluster: Interval[] = [];
  let clusterEnd = -Infinity;

  const flushCluster = () => {
    if (cluster.length === 0) return;
    const colEnds: number[] = [];
    const colOf = new Map<Interval, number>();
    for (const iv of cluster) {
      let placed = false;
      for (let c = 0; c < colEnds.length; c++) {
        if (colEnds[c] <= iv.start) {
          colEnds[c] = iv.end;
          colOf.set(iv, c);
          placed = true;
          break;
        }
      }
      if (!placed) {
        colEnds.push(iv.end);
        colOf.set(iv, colEnds.length - 1);
      }
    }
    const cols = colEnds.length;
    for (const iv of cluster) result.set(iv.row.key, { col: colOf.get(iv)!, cols });
    cluster = [];
  };

  for (const iv of intervals) {
    if (cluster.length > 0 && iv.start >= clusterEnd) {
      flushCluster();
      clusterEnd = -Infinity;
    }
    cluster.push(iv);
    clusterEnd = Math.max(clusterEnd, iv.end);
  }
  flushCluster();
  return result;
}

function ResizeHandle({ edge, onStart }: { edge: "start" | "end"; onStart: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onStart}
      className={`absolute inset-x-0 z-20 flex cursor-ns-resize items-center justify-center ${edge === "start" ? "-top-1.5" : "-bottom-1.5"}`}
      style={{ height: 10 }}
    >
      <div className="h-0.5 w-6 rounded-full bg-fg/40 opacity-0 transition-opacity group-hover/card:opacity-100" />
    </div>
  );
}

function EventChip({ row, onClick }: { row: JournalRow; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className="flex w-full items-center gap-1 truncate rounded bg-violet-500/20 px-1.5 py-0.5 text-left text-[11px] font-medium text-fg transition-colors hover:bg-violet-500/30"
      title={`${row.symbol ?? "Note"} ${row.side ?? ""} ${timeLabel(row.entryTime)}`}
    >
      {row.entryTime && <span className="shrink-0 tabular-nums text-fg/70">{timeLabel(row.entryTime)}</span>}
      <span className="truncate">{row.symbol ?? "Note"}</span>
      {row.notes && <span className="shrink-0 text-fg/60">•</span>}
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
        className={`flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
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

function MiniMonthPicker({
  month,
  onMonthChange,
  selectedKey,
  todayKey,
  onSelect,
  dailyPl,
}: {
  month: Date;
  onMonthChange: (d: Date) => void;
  selectedKey: string;
  todayKey: string;
  onSelect: (d: Date) => void;
  dailyPl: Map<string, number>;
}) {
  const cells = monthCells(month.getFullYear(), month.getMonth());
  return (
    <div className="w-52 shrink-0 rounded-lg border border-border bg-panel p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={() => onMonthChange(addMonths(month, -1))}
          className="rounded p-1 text-muted hover:bg-border/60 hover:text-fg"
        >
          <ChevronLeft size={14} strokeWidth={2} />
        </button>
        <span className="text-xs font-semibold text-fg">{month.toLocaleString("en-US", { month: "long", year: "numeric" })}</span>
        <button
          onClick={() => onMonthChange(addMonths(month, 1))}
          className="rounded p-1 text-muted hover:bg-border/60 hover:text-fg"
        >
          <ChevronRight size={14} strokeWidth={2} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] text-muted">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d}>{d[0]}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} className="aspect-square" />;
          const k = dayKey(cell);
          const pl = dailyPl.get(k);
          const hasData = pl != null && Math.abs(pl) > 0.005;
          const up = (pl ?? 0) >= 0;
          const isToday = k === todayKey;
          const isSelected = k === selectedKey;
          return (
            <button
              key={i}
              onClick={() => onSelect(cell)}
              className={`flex aspect-square items-center justify-center rounded-sm text-[10px] font-medium tabular-nums transition-colors ${
                hasData ? (up ? "bg-up/25 text-up hover:bg-up/40" : "bg-down/25 text-down hover:bg-down/40") : "text-muted hover:bg-border/60"
              } ${isToday ? "ring-1 ring-accent" : ""} ${isSelected ? "ring-1 ring-fg/50" : ""}`}
            >
              {cell.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface JournalCalendarProps {
  onDebriefTrade?: (request: DebriefRequest) => void;
  points?: PortfolioPoint[];
  leftPanelExtra?: ReactNode;
  leftPanelBelow?: ReactNode;
  leftPanelTop?: ReactNode;
}

type DragTarget = { id: number; edge: "start" | "end" } | { id: "draft"; edge: "start" | "end" };

export default function JournalCalendar({
  onDebriefTrade,
  points = [],
  leftPanelExtra,
  leftPanelBelow,
  leftPanelTop,
}: JournalCalendarProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [pickerMonth, setPickerMonth] = useState(() => startOfMonth(new Date()));
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
  const [panelAnchor, setPanelAnchor] = useState<{ x: number; y: number; side: "left" | "right" } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const startTimeInputRef = useRef<HTMLInputElement>(null);
  const endTimeInputRef = useRef<HTMLInputElement>(null);
  const [activeTimeField, setActiveTimeField] = useState<"date" | "start" | "end">("date");
  const timeFieldRefs = { date: dateInputRef, start: startTimeInputRef, end: endTimeInputRef };

  const openPicker = (ref: React.RefObject<HTMLInputElement>) => {
    const el = ref.current;
    if (!el) return;
    if (typeof (el as { showPicker?: () => void }).showPicker === "function") {
      try {
        (el as { showPicker: () => void }).showPicker();
        return;
      } catch {
        // unsupported or blocked — fall back to a plain focus below
      }
    }
    el.focus();
  };

  const [dragging, setDragging] = useState<DragTarget | null>(null);
  const [draftTimes, setDraftTimes] = useState<Record<number, { start?: number; end?: number }>>({});
  const draftTimesRef = useRef<Record<number, { start?: number; end?: number }>>({});
  const gridRef = useRef<HTMLDivElement>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const justDraggedRef = useRef(false);
  const [nowMinutes, setNowMinutes] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });

  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date();
      setNowMinutes(n.getHours() * 60 + n.getMinutes());
    }, 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (viewMode !== "day" && viewMode !== "week") return;
    const el = gridScrollRef.current;
    if (!el) return;
    const target = (nowMinutes / 60) * HOUR_HEIGHT - el.clientHeight / 4;
    el.scrollTop = clamp(target, 0, HOURS.length * HOUR_HEIGHT - el.clientHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  const startResize = (e: React.MouseEvent, id: number | "draft", edge: "start" | "end") => {
    e.preventDefault();
    e.stopPropagation();
    justDraggedRef.current = true;
    setDragging({ id, edge } as DragTarget);
  };

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

  type PanelAnchor = { x: number; y: number; side: "left" | "right" };

  const anchorPanel = (e: React.MouseEvent, override?: PanelAnchor) =>
    setPanelAnchor(override ?? { x: e.clientX, y: e.clientY, side: "right" });

  const cardAnchor = (e: React.MouseEvent, day: Date): PanelAnchor => {
    const rect = e.currentTarget.getBoundingClientRect();
    const side: "left" | "right" = day.getDay() >= 4 ? "left" : "right";
    return { x: side === "right" ? rect.right : rect.left, y: rect.top, side };
  };

  const setFormDate = (dateStr: string) => {
    setForm((f) => {
      const rebase = (iso: string | null | undefined) => (iso ? isoAtMinutes(dateStr, minutesOfIso(iso)) : iso ?? null);
      return { ...f, entry_date: dateStr, entry_time: rebase(f.entry_time), exit_time: rebase(f.exit_time) };
    });
  };

  const setFormStartTime = (hhmm: string) => {
    setForm((f) => ({ ...f, entry_time: hhmm ? isoAtMinutes(f.entry_date, minutesFromHHMM(hhmm)) : null }));
  };

  const setFormEndTime = (hhmm: string) => {
    setForm((f) => ({ ...f, exit_time: hhmm ? isoAtMinutes(f.entry_date, minutesFromHHMM(hhmm)) : null }));
  };

  const openCreate = (date: Date, minutes: number | undefined, e: React.MouseEvent, override?: PanelAnchor) => {
    const k = toDateInput(date);
    const start = minutes != null ? Math.round(minutes / SNAP_MIN) * SNAP_MIN : null;
    const base = emptyForm(k);
    if (start != null) {
      base.entry_time = isoAtMinutes(date, clamp(start, 0, 1440 - DEFAULT_DURATION_MIN));
      base.exit_time = isoAtMinutes(date, clamp(start + DEFAULT_DURATION_MIN, DEFAULT_DURATION_MIN, 1440));
    }
    setForm(base);
    setFormOpen({ mode: "create", entry: null, dateKey: k });
    anchorPanel(e, override);
  };

  const openEdit = (entry: JournalEntry, e: React.MouseEvent, override?: PanelAnchor) => {
    setForm({
      entry_date: entry.entry_date,
      symbol: entry.symbol ?? "",
      side: entry.side ?? "buy",
      timeframe: entry.timeframe,
      entry_time: entry.entry_time,
      entry_price: entry.entry_price,
      exit_time: entry.exit_time,
      exit_price: entry.exit_price,
      order_amount: entry.order_amount,
      notes: entry.notes ?? "",
    });
    setFormOpen({ mode: "edit", entry, dateKey: entry.entry_date });
    anchorPanel(e, override);
  };

  const openTrade = (t: Trade, e: React.MouseEvent, override?: PanelAnchor) => {
    setTradeDetail(t);
    setTradeNoteDraft(t.notes ?? "");
    anchorPanel(e, override);
  };

  const openRow = (r: JournalRow, e: React.MouseEvent, override?: PanelAnchor) => {
    if (r.trade) openTrade(r.trade, e, override);
    else if (r.entry) openEdit(r.entry, e, override);
  };

  const closePanel = () => {
    setFormOpen(null);
    setTradeDetail(null);
    setPanelAnchor(null);
  };

  useClickOutside(panelRef, closePanel, formOpen != null || tradeDetail != null);

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
      closePanel();
      reloadAll();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const deleteEntry = async () => {
    if (formOpen?.mode !== "edit" || !formOpen.entry) return;
    await api.deleteJournalEntry(formOpen.entry.id).catch((e) => setError((e as Error).message));
    closePanel();
    reloadAll();
  };

  const saveTradeNote = async () => {
    if (!tradeDetail) return;
    await api.saveTradeNote(tradeDetail.id, tradeNoteDraft).catch((e) => setError((e as Error).message));
    closePanel();
    reloadAll();
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const el = gridRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const rawMinutes = ((e.clientY - rect.top) / HOUR_HEIGHT) * 60;
      const minutes = clamp(Math.round(rawMinutes / SNAP_MIN) * SNAP_MIN, 0, 1440);
      if (dragging.id === "draft") {
        setForm((f) => {
          const day = f.entry_date;
          if (dragging.edge === "start") {
            const endMinutes = f.exit_time ? minutesOfIso(f.exit_time) : minutes + DEFAULT_DURATION_MIN;
            const start = Math.min(minutes, endMinutes - MIN_DURATION_MIN);
            return { ...f, entry_time: isoAtMinutes(day, start) };
          }
          const startMinutes = f.entry_time ? minutesOfIso(f.entry_time) : minutes - DEFAULT_DURATION_MIN;
          const end = Math.max(minutes, startMinutes + MIN_DURATION_MIN);
          return { ...f, exit_time: isoAtMinutes(day, end) };
        });
      } else {
        const id = dragging.id;
        draftTimesRef.current = { ...draftTimesRef.current, [id]: { ...draftTimesRef.current[id], [dragging.edge]: minutes } };
        setDraftTimes(draftTimesRef.current);
      }
    };
    const onUp = () => {
      if (dragging.id !== "draft") {
        const id = dragging.id;
        const entry = rangeEntries.find((e) => e.id === id);
        const times = draftTimesRef.current[id];
        if (entry && times) {
          const startMin = times.start ?? (entry.entry_time ? minutesOfIso(entry.entry_time) : 0);
          const endMin = times.end ?? (entry.exit_time ? minutesOfIso(entry.exit_time) : startMin + DEFAULT_DURATION_MIN);
          api
            .updateJournalEntry(id, {
              entry_time: isoAtMinutes(entry.entry_date, Math.min(startMin, endMin - MIN_DURATION_MIN)),
              exit_time: isoAtMinutes(entry.entry_date, Math.max(endMin, startMin + MIN_DURATION_MIN)),
            })
            .then(reloadAll)
            .catch((err) => setError((err as Error).message));
        }
        const next = { ...draftTimesRef.current };
        delete next[id];
        draftTimesRef.current = next;
        setDraftTimes(next);
      }
      setDragging(null);
      setTimeout(() => {
        justDraggedRef.current = false;
      }, 0);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  const inputClass =
    "w-full rounded-md border border-border bg-field px-2 py-1.5 text-sm text-fg placeholder:text-muted outline-none focus:border-accent";

  const renderDayCell = (cell: Date, maxVisible: number) => {
    const k = dayKey(cell);
    const isToday = k === todayKey;
    const rows = rowsByDay.get(k) ?? [];
    const visible = rows.slice(0, maxVisible);
    const overflow = rows.length - visible.length;
    const pl = dailyPl.get(k);
    const hasData = pl != null && Math.abs(pl) > 0.005;
    const up = (pl ?? 0) >= 0;
    return (
      <div
        key={k}
        data-daykey={k}
        onClick={(e) => openCreate(cell, undefined, e)}
        className={`group relative flex min-h-0 cursor-pointer flex-col gap-0.5 p-1 transition-colors ${
          hasData ? (up ? "bg-up/10 hover:bg-up/15" : "bg-down/10 hover:bg-down/15") : "bg-panel hover:bg-panel/80"
        }`}
      >
        <div className="flex items-center justify-center pt-0.5">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium tabular-nums ${
              isToday ? "bg-accent font-semibold text-on-accent" : hasData ? (up ? "text-up" : "text-down") : "text-fg"
            }`}
          >
            {cell.getDate()}
          </span>
        </div>
        <Plus
          size={11}
          strokeWidth={2.5}
          className="absolute right-1.5 top-1.5 text-muted opacity-0 transition-opacity group-hover:opacity-100"
        />
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
          {visible.map((r) => (
            <EventChip key={r.key} row={r} onClick={(e) => openRow(r, e)} />
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

  const renderTimeColumn = (day: Date, isDraftDay: boolean) => {
    const k = dayKey(day);
    const rows = rowsByDay.get(k) ?? [];
    const layout = layoutDay(rows);
    return (
      <div
        key={k}
        data-daykey={k}
        className="relative flex-1 border-l border-border first:border-l-0"
        onClick={(e) => {
          if (justDraggedRef.current) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const side: "left" | "right" = day.getDay() >= 4 ? "left" : "right";
          openCreate(day, ((e.clientY - rect.top) / HOUR_HEIGHT) * 60, e, {
            x: side === "right" ? rect.right : rect.left,
            y: e.clientY,
            side,
          });
        }}
      >
        {HOURS.map((h) => (
          <div key={h} className="absolute inset-x-0 border-t border-border" style={{ top: h * HOUR_HEIGHT }} />
        ))}
        {dayKey(day) === todayKey && (
          <div
            className="pointer-events-none absolute inset-x-0 z-30 flex items-center"
            style={{ top: (nowMinutes / 60) * HOUR_HEIGHT }}
          >
            <span className="-ml-[3px] h-[7px] w-[7px] shrink-0 rounded-full bg-accent" />
            <span className="h-px flex-1 bg-accent" />
          </div>
        )}
        {rows.map((r) => {
          const slot = layout.get(r.key) ?? { col: 0, cols: 1 };
          const drag = r.source === "manual" ? draftTimes[r.id] : undefined;
          const startMin = drag?.start ?? (r.entryTime ? minutesOfIso(r.entryTime) : 0);
          const defaultDuration = r.source === "trade" ? TRADE_DURATION_MIN : DEFAULT_DURATION_MIN;
          const endMin = drag?.end ?? (r.exitTime ? minutesOfIso(r.exitTime) : startMin + defaultDuration);
          const top = (startMin / 60) * HOUR_HEIGHT;
          const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 20);
          const widthPct = 100 / slot.cols;
          const leftPct = slot.col * widthPct;
          const isDragging = r.source === "manual" && dragging && dragging.id === r.id;
          return (
            <div
              key={r.key}
              onClick={(e) => {
                e.stopPropagation();
                if (justDraggedRef.current) return;
                openRow(r, e, cardAnchor(e, day));
              }}
              className={`group/card absolute z-10 flex cursor-pointer flex-col overflow-visible rounded-md border border-violet-400/30 bg-violet-500/20 px-1.5 py-0.5 text-[11px] font-medium text-fg shadow-sm transition-colors hover:bg-violet-500/30 ${
                isDragging ? "ring-1 ring-accent" : ""
              }`}
              style={{ top, height, left: `calc(${leftPct}% + 2px)`, width: `calc(${widthPct}% - 4px)` }}
            >
              {r.source === "manual" && <ResizeHandle edge="start" onStart={(e) => startResize(e, r.id, "start")} />}
              <span className="truncate overflow-hidden font-semibold">{r.symbol ?? "Note"}</span>
              <span className="flex items-center gap-1 overflow-hidden truncate text-fg/70">
                {timeLabel(isoAtMinutes(day, startMin))}
                {r.side && <span className="uppercase">{r.side}</span>}
              </span>
              {r.source === "manual" && <ResizeHandle edge="end" onStart={(e) => startResize(e, r.id, "end")} />}
            </div>
          );
        })}
        {isDraftDay && formOpen?.mode === "create" && form.entry_time && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute left-1 right-1 z-20 flex flex-col overflow-visible rounded-md border border-violet-400/30 bg-violet-500/20 px-1.5 py-0.5 text-[11px] font-medium text-fg"
            style={{
              top: (minutesOfIso(form.entry_time) / 60) * HOUR_HEIGHT,
              height: Math.max(
                (((form.exit_time ? minutesOfIso(form.exit_time) : minutesOfIso(form.entry_time) + DEFAULT_DURATION_MIN) -
                  minutesOfIso(form.entry_time)) /
                  60) *
                  HOUR_HEIGHT,
                20,
              ),
            }}
          >
            <ResizeHandle edge="start" onStart={(e) => startResize(e, "draft", "start")} />
            <span className="truncate overflow-hidden">{form.symbol || "New entry"}</span>
            <ResizeHandle edge="end" onStart={(e) => startResize(e, "draft", "end")} />
          </div>
        )}
      </div>
    );
  };

  const timeGridDays = viewMode === "week" ? Array.from({ length: 7 }, (_, i) => addDays(range.start, i)) : [anchor];

  const rowClass = "flex items-center gap-3 py-2";
  const fieldClass =
    "rounded-md border border-border bg-field px-2 py-1.5 text-sm text-fg placeholder:text-muted outline-none focus:border-accent";

  const formPanelContent = formOpen && (
    <>
      <div className="mb-1 flex items-start justify-between gap-2">
        <input
          autoFocus
          value={form.symbol ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value.toUpperCase() }))}
          placeholder="Symbol (e.g. AAPL)"
          className="min-w-0 flex-1 border-b border-border bg-transparent pb-1.5 text-lg font-medium text-fg outline-none placeholder:text-muted focus:border-accent"
        />
        <button onClick={closePanel} className="mt-1 shrink-0 rounded p-1 text-muted hover:bg-border/60 hover:text-fg">
          <X size={16} strokeWidth={2} />
        </button>
      </div>

      <div className="mt-3">
        <div className={rowClass}>
          {form.side === "sell" ? (
            <TrendingDown size={16} strokeWidth={2} className="shrink-0 text-down" />
          ) : (
            <TrendingUp size={16} strokeWidth={2} className="shrink-0 text-up" />
          )}
          <div className="flex gap-1.5">
            {(["buy", "sell"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setForm((f) => ({ ...f, side: s }))}
                className={`rounded-md px-3 py-1 text-xs font-semibold uppercase transition-colors ${
                  form.side === s ? "bg-accent text-on-accent" : "bg-field text-muted hover:text-fg"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-start gap-3 py-2">
          <button
            type="button"
            onClick={() => openPicker(timeFieldRefs[activeTimeField])}
            className="mt-2.5 flex h-[16px] w-[16px] shrink-0 items-center justify-center text-muted hover:text-fg"
            aria-label="Open date/time picker"
          >
            <Clock size={15} strokeWidth={2} />
          </button>
          <div className="flex flex-1 flex-col gap-4">
            <div className="flex flex-1 flex-nowrap items-center gap-1.5">
              <input
                ref={dateInputRef}
                type="date"
                value={form.entry_date}
                onFocus={() => setActiveTimeField("date")}
                onChange={(e) => setFormDate(e.target.value)}
                className={`${fieldClass} w-[7.5rem]`}
              />
              <input
                ref={startTimeInputRef}
                type="time"
                lang="en-US"
                value={hhmmLocal(form.entry_time ?? null)}
                onFocus={() => setActiveTimeField("start")}
                onChange={(e) => setFormStartTime(e.target.value)}
                className={`${fieldClass} w-[7rem]`}
              />
              <span className="shrink-0 text-xs text-muted">–</span>
              <input
                ref={endTimeInputRef}
                type="time"
                lang="en-US"
                value={hhmmLocal(form.exit_time ?? null)}
                onFocus={() => setActiveTimeField("end")}
                onChange={(e) => setFormEndTime(e.target.value)}
                className={`${fieldClass} w-[7rem]`}
              />
            </div>
            <select
              value={form.timeframe ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, timeframe: e.target.value || null }))}
              title="Chart timeframe this trade was taken on"
              className={`${fieldClass} w-fit`}
            >
              <option value="">No timeframe</option>
              {ENTRY_TIMEFRAMES.map((tf) => (
                <option key={tf.id} value={tf.id}>
                  {tf.label} chart
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={rowClass}>
          <DollarSign size={16} strokeWidth={2} className="shrink-0 text-muted" />
          <div className="grid flex-1 grid-cols-3 gap-1.5">
            <input
              type="number"
              step="0.01"
              placeholder="Entry"
              value={form.entry_price ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, entry_price: e.target.value ? Number(e.target.value) : null }))}
              className={inputClass}
            />
            <input
              type="number"
              step="0.01"
              placeholder="Exit"
              value={form.exit_price ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, exit_price: e.target.value ? Number(e.target.value) : null }))}
              className={inputClass}
            />
            <input
              type="number"
              step="0.01"
              placeholder="Quantity"
              value={form.order_amount ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, order_amount: e.target.value ? Number(e.target.value) : null }))}
              className={inputClass}
            />
          </div>
        </div>

        <div className={rowClass}>
          <StickyNote size={16} strokeWidth={2} className="mt-1 shrink-0 self-start text-muted" />
          <textarea
            value={form.notes ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="What was your plan? How did it play out?"
            className={`${inputClass} h-16 flex-1 resize-y`}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        {formOpen.mode === "edit" ? (
          <button onClick={deleteEntry} className="flex items-center gap-1 text-xs font-medium text-down hover:text-down/80">
            <Trash2 size={12} strokeWidth={2} />
            Delete
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button onClick={closePanel} className="rounded-md px-3 py-1.5 text-xs font-medium text-muted hover:text-fg">
            Cancel
          </button>
          <button
            onClick={saveForm}
            className="rounded-md bg-accent px-4 py-1.5 text-xs font-semibold text-on-accent transition-colors hover:bg-accent/80"
          >
            Save
          </button>
        </div>
      </div>
    </>
  );

  const tradePanelContent = tradeDetail && (
    <>
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="pb-1.5 text-lg font-medium text-fg">{tradeDetail.symbol}</div>
        <button onClick={closePanel} className="mt-0.5 shrink-0 rounded p-1 text-muted hover:bg-border/60 hover:text-fg">
          <X size={16} strokeWidth={2} />
        </button>
      </div>

      <div>
        <div className={rowClass}>
          <Clock size={15} strokeWidth={2} className="shrink-0 text-muted" />
          <span className="text-sm text-fg">{new Date(tradeDetail.filled_at!).toLocaleString()}</span>
        </div>
        <div className={rowClass}>
          {tradeDetail.side === "sell" ? (
            <TrendingDown size={15} strokeWidth={2} className="shrink-0 text-down" />
          ) : (
            <TrendingUp size={15} strokeWidth={2} className="shrink-0 text-up" />
          )}
          <span className="text-sm uppercase text-fg">{tradeDetail.side}</span>
          <span className="text-xs text-muted">•</span>
          <span className="text-sm tabular-nums text-fg">{tradeDetail.qty} qty</span>
        </div>
        <div className={rowClass}>
          <DollarSign size={15} strokeWidth={2} className="shrink-0 text-muted" />
          <span className="text-sm tabular-nums text-fg">${tradeDetail.fill_price?.toFixed(2)} fill</span>
        </div>
        <div className={rowClass}>
          <StickyNote size={15} strokeWidth={2} className="mt-1 shrink-0 self-start text-muted" />
          <textarea
            value={tradeNoteDraft}
            onChange={(e) => setTradeNoteDraft(e.target.value)}
            placeholder="What was your plan? Which confluences lined up?"
            className={`${inputClass} h-20 flex-1 resize-y`}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
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
            closePanel();
          }}
          className="rounded-md bg-accent/20 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/30"
        >
          Debrief this trade
        </button>
        <button
          onClick={saveTradeNote}
          className="rounded-md bg-accent px-4 py-1.5 text-xs font-semibold text-on-accent transition-colors hover:bg-accent/80"
        >
          Save
        </button>
      </div>
    </>
  );

  const panelOpen = formOpen != null || tradeDetail != null;

  return (
    <div className="relative flex h-full flex-col">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <div className="flex w-52 shrink-0 items-center">{leftPanelTop}</div>
        <div className="flex flex-1 items-center gap-2">
          <button
            onClick={() => setAnchor(new Date())}
            className="rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-fg hover:bg-panel"
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
        <div className="flex shrink-0 items-center gap-2">
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
            onClick={(e) => openCreate(viewMode === "day" ? anchor : new Date(), undefined, e)}
            className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1.5 text-xs font-semibold text-on-accent hover:bg-accent/80"
          >
            <Plus size={13} strokeWidth={2.5} />
            Add entry
          </button>
        </div>
      </div>

      {error && <p className="mb-2 shrink-0 text-xs text-down">{error}</p>}

      <div className="flex min-h-0 flex-1 gap-3">
        <div className="flex w-52 shrink-0 flex-col gap-3 overflow-y-auto">
          {leftPanelExtra}
          <MiniMonthPicker
            month={pickerMonth}
            onMonthChange={setPickerMonth}
            selectedKey={dayKey(anchor)}
            todayKey={todayKey}
            dailyPl={dailyPl}
            onSelect={(d) => {
              setAnchor(d);
              setPickerMonth(startOfMonth(d));
            }}
          />
          {leftPanelBelow}
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
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
                        onClick={(e) => (r.trade ? openTrade(r.trade, e) : r.entry ? openEdit(r.entry, e) : undefined)}
                        className="cursor-pointer border-t border-border hover:bg-accent/10"
                      >
                        <td className="py-1.5 pl-3 whitespace-nowrap text-muted">
                          {r.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </td>
                        <td className="font-medium text-fg">{r.symbol ?? "—"}</td>
                        <td className="uppercase text-muted">{r.side ?? "—"}</td>
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
          ) : viewMode === "day" || viewMode === "week" ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-panel">
              {viewMode === "week" && (
                <div className="flex shrink-0 border-b border-border">
                  <div className="w-14 shrink-0" />
                  {timeGridDays.map((d) => {
                    const isToday = dayKey(d) === todayKey;
                    return (
                      <div key={dayKey(d)} className="flex flex-1 flex-col items-center border-l border-border py-2 first:border-l-0">
                        <span className="text-xs font-medium text-muted">{d.toLocaleDateString("en-US", { weekday: "short" })}</span>
                        <span
                          className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium tabular-nums ${
                            isToday ? "bg-accent font-semibold text-on-accent" : "text-fg"
                          }`}
                        >
                          {d.getDate()}
                        </span>
                      </div>
                    );
                  })}
                  <div className="w-2 shrink-0" />
                </div>
              )}
              <div ref={gridScrollRef} className="min-h-0 flex-1 overflow-auto">
                <div ref={gridRef} className="relative flex" style={{ height: HOURS.length * HOUR_HEIGHT }}>
                  <div className="sticky left-0 z-10 w-14 shrink-0 bg-panel">
                    {HOURS.map((h) => (
                      <div key={h} className="relative pr-2 text-right text-xs text-muted" style={{ height: HOUR_HEIGHT, top: -8 }}>
                        {h > 0 && hourLabel(h)}
                      </div>
                    ))}
                  </div>
                  {timeGridDays.map((d) =>
                    renderTimeColumn(d, formOpen?.mode === "create" && formOpen.dateKey === toDateInput(d)),
                  )}
                </div>
              </div>
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
                        const pl = dailyPl.get(k);
                        const hasData = pl != null && Math.abs(pl) > 0.005;
                        const up = (pl ?? 0) >= 0;
                        const isToday = k === todayKey;
                        return (
                          <button
                            key={i}
                            onClick={() => {
                              setAnchor(cell);
                              setViewMode("day");
                            }}
                            className={`flex aspect-square items-center justify-center rounded-sm text-[9px] tabular-nums transition-colors ${
                              hasData ? (up ? "bg-up/30 text-up hover:bg-up/50" : "bg-down/30 text-down hover:bg-down/50") : "text-muted hover:bg-border/60"
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
              <div className="grid shrink-0 grid-cols-7 gap-px overflow-hidden rounded-t-lg border border-b-0 border-border bg-border">
                {WEEKDAY_LABELS.map((d) => (
                  <div key={d} className="bg-panel py-2 text-center text-sm font-semibold text-fg">
                    {d}
                  </div>
                ))}
              </div>
              <div
                className="grid flex-1 auto-rows-fr grid-cols-7 gap-px overflow-hidden rounded-b-lg border border-border bg-border"
                style={{ gridTemplateRows: `repeat(${monthCells(anchor.getFullYear(), anchor.getMonth()).length / 7}, minmax(0, 1fr))` }}
              >
                {monthCells(anchor.getFullYear(), anchor.getMonth()).map((cell, i) =>
                  cell ? renderDayCell(cell, 3) : <div key={i} className="bg-panel/40" />,
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {dayOverflow && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-bg/70 p-4" onClick={() => setDayOverflow(null)}>
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
                  onClick={(e) => {
                    setDayOverflow(null);
                    openRow(r, e);
                  }}
                  className="flex w-full items-center justify-between rounded-md border border-border/60 px-2 py-1.5 text-left text-xs hover:bg-accent/10"
                >
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums text-muted">{timeLabel(r.entryTime)}</span>
                    <span className="font-medium text-fg">{r.symbol ?? "Note"}</span>
                  </span>
                  <span className="uppercase text-muted">{r.side ?? (r.source === "trade" ? "" : "manual")}</span>
                </button>
              ))}
            </div>
            <button
              onClick={(e) => {
                const d = dayOverflow;
                setDayOverflow(null);
                openCreate(d, undefined, e);
              }}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-border py-1.5 text-xs font-medium text-muted hover:border-accent hover:text-accent"
            >
              <Plus size={12} strokeWidth={2.5} />
              Add entry
            </button>
          </div>
        </div>
      )}

      {panelOpen &&
        panelAnchor &&
        typeof window !== "undefined" &&
        (() => {
          const rawLeft = panelAnchor.side === "left" ? panelAnchor.x - PANEL_WIDTH - 10 : panelAnchor.x + 10;
          const left = clamp(rawLeft, 8, window.innerWidth - PANEL_WIDTH - 8);
          const top = clamp(panelAnchor.y - 10, 8, window.innerHeight - PANEL_MAX_HEIGHT - 8);
          return (
            <div
              ref={panelRef}
              style={{ position: "fixed", left, top, width: PANEL_WIDTH, maxHeight: PANEL_MAX_HEIGHT }}
              className="z-50 overflow-y-auto rounded-xl border border-border bg-panel p-4 shadow-2xl"
            >
              {formPanelContent}
              {tradePanelContent}
            </div>
          );
        })()}
    </div>
  );
}
