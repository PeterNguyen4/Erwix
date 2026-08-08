"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Calendar, CandlestickChart, NotebookPen, Plus, Receipt, Search } from "lucide-react";
import { api, AttachedReference, JournalEntry, Trade } from "@/lib/api";
import { useClickOutside } from "@/lib/useClickOutside";

type ListState =
  | { status: "idle" | "loading" }
  | { status: "ready"; trades: Trade[]; entries: JournalEntry[] }
  | { status: "failed" };

interface PickerItem {
  ref: AttachedReference;
  title: string;
  subtitle: string;
}

export const REFERENCE_TYPE_STYLE: Record<
  AttachedReference["type"],
  { icon: typeof Receipt; textClass: string; bgClass: string; borderClass: string }
> = {
  trade: {
    icon: Receipt,
    textClass: "text-violet-600 dark:text-violet-400",
    bgClass: "bg-violet-500/5 dark:bg-violet-500/10",
    borderClass: "border-violet-500/25 dark:border-violet-400/30",
  },
  journal_entry: {
    icon: NotebookPen,
    textClass: "text-amber-600 dark:text-amber-400",
    bgClass: "bg-amber-500/5 dark:bg-amber-500/10",
    borderClass: "border-amber-500/25 dark:border-amber-400/30",
  },
  day: {
    icon: Calendar,
    textClass: "text-sky-600 dark:text-sky-400",
    bgClass: "bg-sky-500/5 dark:bg-sky-500/10",
    borderClass: "border-sky-500/25 dark:border-sky-400/30",
  },
  symbol: {
    icon: CandlestickChart,
    textClass: "text-emerald-600 dark:text-emerald-400",
    bgClass: "bg-emerald-500/5 dark:bg-emerald-500/10",
    borderClass: "border-emerald-500/25 dark:border-emerald-400/30",
  },
};

function tradeItem(t: Trade): PickerItem {
  return {
    ref: { type: "trade", refId: String(t.id), label: `${t.symbol} ${t.side}` },
    title: `${t.side.toUpperCase()} ${t.symbol} @ ${t.fill_price != null ? `$${t.fill_price.toFixed(2)}` : "—"}`,
    subtitle: t.filled_at ? new Date(t.filled_at).toLocaleString() : "unfilled",
  };
}

function journalEntryItem(e: JournalEntry): PickerItem {
  return {
    ref: { type: "journal_entry", refId: String(e.id), label: e.symbol ?? e.entry_date },
    title: e.symbol ? `${e.symbol} journal entry` : "Journal entry",
    subtitle: e.entry_date,
  };
}

function dayItems(trades: Trade[], entries: JournalEntry[]): PickerItem[] {
  const days = new Set<string>();
  for (const t of trades) if (t.filled_at) days.add(t.filled_at.slice(0, 10));
  for (const e of entries) days.add(e.entry_date);
  return [...days]
    .sort((a, b) => b.localeCompare(a))
    .map((day) => ({
      ref: { type: "day", refId: day, label: day },
      title: day,
      subtitle: "Day summary",
    }));
}

function symbolItems(trades: Trade[]): PickerItem[] {
  const symbols = new Set(trades.map((t) => t.symbol));
  return [...symbols].sort().map((symbol) => ({
    ref: { type: "symbol", refId: symbol, label: symbol },
    title: symbol,
    subtitle: "Recent trades",
  }));
}

export interface ReferencePickerHandle {
  /** Opens the picker pre-filtered — used by the textarea's `@` trigger. */
  openWithQuery: (query: string) => void;
}

const ReferencePicker = forwardRef<ReferencePickerHandle, { onAttach: (ref: AttachedReference) => void }>(
  function ReferencePicker({ onAttach }, handleRef) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<ListState>({ status: "idle" });
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  const load = async () => {
    setList({ status: "loading" });
    try {
      const [trades, entries] = await Promise.all([api.trades(), api.journalEntries()]);
      setList({ status: "ready", trades, entries });
    } catch {
      setList({ status: "failed" });
    }
  };

  const openPanel = async (initialQuery: string) => {
    setOpen(true);
    setQuery(initialQuery);
    if (list.status === "idle") await load();
    setTimeout(() => searchRef.current?.focus(), 0);
  };

  useImperativeHandle(handleRef, () => ({
    openWithQuery: (q: string) => {
      void openPanel(q);
    },
  }));

  const toggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    await openPanel("");
  };

  const select = (item: PickerItem) => {
    onAttach(item.ref);
    setOpen(false);
  };

  return (
    <div ref={ref}>
      <button
        type="button"
        onClick={toggle}
        aria-label="Attach a reference"
        className="flex shrink-0 items-center justify-center rounded-full bg-field p-1.5 text-muted transition-colors hover:bg-fg/10 hover:text-fg"
      >
        <Plus size={15} strokeWidth={2} />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-2 w-64 rounded-md border border-border bg-panel py-1 shadow-lg">
          <div className="px-2 pb-1.5">
            <div className="flex items-center gap-1.5 rounded border border-border bg-field px-2 py-1 focus-within:border-violet-400">
              <Search size={11} strokeWidth={2} className="shrink-0 text-muted" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search trades, journal, days, symbols"
                className="w-full bg-transparent text-xs text-fg outline-none placeholder:text-muted"
              />
            </div>
          </div>
          {list.status === "loading" && <div className="px-3 py-2 text-xs text-muted">Loading…</div>}
          {list.status === "failed" && <div className="px-3 py-2 text-xs text-muted">Couldn&apos;t load references.</div>}
          {list.status === "ready" &&
            (() => {
              const q = query.trim().toLowerCase();
              const groups: { label: string; items: PickerItem[] }[] = [
                { label: "Symbols", items: symbolItems(list.trades) },
                { label: "Days", items: dayItems(list.trades, list.entries) },
                { label: "Trades", items: list.trades.map(tradeItem) },
                { label: "Journal Entries", items: list.entries.map(journalEntryItem) },
              ];
              const filtered = groups
                .map((g) => ({
                  ...g,
                  items: q
                    ? g.items.filter(
                        (item) => item.title.toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q),
                      )
                    : g.items,
                }))
                .filter((g) => g.items.length > 0);
              if (filtered.length === 0) {
                return <div className="px-3 py-2 text-xs text-muted">No matches.</div>;
              }
              return (
                <div className="max-h-72 overflow-y-auto">
                  {filtered.map((g) => (
                    <div key={g.label}>
                      <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                        {g.label}
                      </div>
                      {g.items.slice(0, 8).map((item, i) => {
                        const Icon = REFERENCE_TYPE_STYLE[item.ref.type].icon;
                        return (
                          <button
                            key={`${item.ref.type}-${item.ref.refId}-${i}`}
                            type="button"
                            onClick={() => select(item)}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-violet-500/10"
                          >
                            <Icon size={12} strokeWidth={2} className={`shrink-0 ${REFERENCE_TYPE_STYLE[item.ref.type].textClass}`} />
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate text-xs text-fg">{item.title}</span>
                              <span className="truncate text-[10px] text-muted">{item.subtitle}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              );
            })()}
        </div>
      )}
    </div>
  );
  },
);

export default ReferencePicker;
