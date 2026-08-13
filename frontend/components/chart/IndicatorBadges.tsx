"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";
import { resolveIndicator, makeIndicatorId } from "@/components/chart/indicators";

interface IndicatorBadgesProps {
  active: Set<string>;
  colors: Record<string, string>;
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  onSetColor: (id: string, color: string) => void;
  onRemove: (id: string) => void;
  onChangePeriod: (oldId: string, newId: string) => void;
}

const PARAMETRIZED_ID = /^(sma|ema|rsi)_(\d+)$/;

export default function IndicatorBadges({
  active,
  colors,
  openId,
  onOpenChange,
  onSetColor,
  onRemove,
  onChangePeriod,
}: IndicatorBadgesProps) {
  const [periodDraft, setPeriodDraft] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openId) return;
    const match = PARAMETRIZED_ID.exec(openId);
    setPeriodDraft(match ? match[2] : "");
  }, [openId]);

  useEffect(() => {
    if (!openId) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onOpenChange(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openId, onOpenChange]);

  const ids = [...active];
  if (ids.length === 0) return null;

  const commitPeriod = (id: string, match: RegExpExecArray) => {
    const period = Number(periodDraft);
    if (!Number.isFinite(period) || period <= 0) return;
    const family = match[1] as "sma" | "ema" | "rsi";
    const newId = makeIndicatorId(family, period);
    if (newId !== id) onChangePeriod(id, newId);
    onOpenChange(null);
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {ids.map((id) => {
        const def = resolveIndicator(id, colors[id]);
        if (!def) return null;
        const match = PARAMETRIZED_ID.exec(id);
        const color = colors[id] ?? def.lines?.[0]?.color ?? "#888";
        const isOpen = openId === id;

        return (
          <div key={id} className="relative">
            <button
              type="button"
              onClick={() => onOpenChange(isOpen ? null : id)}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium text-fg transition-colors ${
                isOpen ? "border-violet-400 bg-violet-500/30" : "border-border bg-field hover:bg-violet-500/20"
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              {def.label}
            </button>
            {isOpen && (
              <div
                ref={popoverRef}
                className="absolute left-0 top-full z-30 mt-1 w-48 rounded-md border border-border bg-field p-2 shadow-xl"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-muted">{def.label}</span>
                  <button
                    type="button"
                    onClick={() => onOpenChange(null)}
                    title="Close"
                    className="rounded p-0.5 text-muted hover:bg-border hover:text-fg"
                  >
                    <X size={13} strokeWidth={2.2} />
                  </button>
                </div>
                {match && (
                  <div className="mb-2 flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      value={periodDraft}
                      onChange={(e) => setPeriodDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitPeriod(id, match);
                      }}
                      className="w-full rounded border border-border bg-bg px-1.5 py-1 text-xs text-fg"
                      placeholder="Period"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => commitPeriod(id, match)}
                      className="shrink-0 rounded bg-violet-500 px-2 py-1 text-xs font-medium text-on-accent"
                    >
                      Set
                    </button>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-[11px] text-muted">
                    Color
                    <span
                      className="relative h-5 w-7 shrink-0 overflow-hidden rounded border border-border"
                      style={{ backgroundColor: color }}
                    >
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => onSetColor(id, e.target.value)}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      />
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      onRemove(id);
                      onOpenChange(null);
                    }}
                    title="Remove"
                    className="rounded p-1 text-muted hover:bg-down/20 hover:text-down"
                  >
                    <Trash2 size={13} strokeWidth={2} />
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
