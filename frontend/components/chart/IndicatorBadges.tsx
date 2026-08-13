"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";
import { resolveIndicator, makeIndicatorId, makeChandelierId } from "@/components/chart/indicators";

interface IndicatorBadgesProps {
  active: Set<string>;
  colors: Record<string, string>;
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  onSetColor: (id: string, color: string) => void;
  onRemove: (id: string) => void;
  onChangePeriod: (oldId: string, newId: string) => void;
  locked?: boolean;
}

const PARAMETRIZED_ID = /^(sma|ema|rsi)_(\d+)$/;
const CHANDELIER_ID = /^chandelier_(\d+)_(\d+)_(\d+)$/;

export default function IndicatorBadges({
  active,
  colors,
  openId,
  onOpenChange,
  onSetColor,
  onRemove,
  onChangePeriod,
  locked = false,
}: IndicatorBadgesProps) {
  const [periodDraft, setPeriodDraft] = useState("");
  const [chandelierDraft, setChandelierDraft] = useState({ length: "", atrPeriod: "", mult: "" });
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openId) return;
    const match = PARAMETRIZED_ID.exec(openId);
    setPeriodDraft(match ? match[2] : "");
    const chMatch = CHANDELIER_ID.exec(openId);
    setChandelierDraft(chMatch ? { length: chMatch[1], atrPeriod: chMatch[2], mult: chMatch[3] } : { length: "", atrPeriod: "", mult: "" });
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

  const commitChandelier = (id: string) => {
    const length = Number(chandelierDraft.length);
    const atrPeriod = Number(chandelierDraft.atrPeriod);
    const mult = Number(chandelierDraft.mult);
    if (![length, atrPeriod, mult].every((n) => Number.isFinite(n) && n > 0)) return;
    const newId = makeChandelierId(length, atrPeriod, mult);
    if (newId !== id) onChangePeriod(id, newId);
    onOpenChange(null);
  };

  return (
    <div className="flex flex-col items-start gap-1">
      {ids.map((id) => {
        const def = resolveIndicator(id, colors[id]);
        if (!def) return null;
        const match = PARAMETRIZED_ID.exec(id);
        const isChandelier = CHANDELIER_ID.test(id);
        const color = colors[id] ?? def.lines?.[0]?.color ?? "#888";
        const isOpen = !locked && openId === id;

        return (
          <div key={id} className="relative">
            <button
              type="button"
              disabled={locked}
              onClick={() => onOpenChange(isOpen ? null : id)}
              title={locked ? def.label : undefined}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium text-fg transition-colors ${
                locked
                  ? "cursor-default border-border bg-field opacity-90"
                  : isOpen
                    ? "border-violet-400 bg-violet-500/30"
                    : "border-border bg-field hover:bg-violet-500/20"
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              {def.label}
            </button>
            {isOpen && (
              <div
                ref={popoverRef}
                className={`absolute left-0 top-full z-30 mt-1 rounded-md border border-border bg-field px-3 py-2 shadow-xl ${isChandelier ? "w-56" : "w-48"}`}
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
                  <label className="mb-2 flex items-center justify-between gap-2 text-[11px] text-muted">
                    Length
                    <input
                      type="number"
                      min={1}
                      value={periodDraft}
                      onChange={(e) => setPeriodDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitPeriod(id, match);
                      }}
                      className="w-16 rounded border border-border bg-bg px-1.5 py-1 text-xs text-fg"
                      autoFocus
                    />
                  </label>
                )}
                {isChandelier && (
                  <div className="mb-2 space-y-1.5">
                    {(
                      [
                        ["length", "Look Back"],
                        ["atrPeriod", "ATR Period"],
                        ["mult", "ATR Mult"],
                      ] as const
                    ).map(([field, fieldLabel]) => (
                      <label key={field} className="flex items-center justify-between gap-2 text-[11px] text-muted">
                        {fieldLabel}
                        <input
                          type="number"
                          min={1}
                          value={chandelierDraft[field]}
                          onChange={(e) => setChandelierDraft((d) => ({ ...d, [field]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitChandelier(id);
                          }}
                          className="w-16 rounded border border-border bg-bg px-1.5 py-1 text-xs text-fg"
                        />
                      </label>
                    ))}
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
                  <div className="flex items-center gap-1">
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
                    {(match || isChandelier) && (
                      <button
                        type="button"
                        onClick={() => (isChandelier ? commitChandelier(id) : commitPeriod(id, match!))}
                        className="rounded bg-violet-500 px-3 py-1 text-xs font-medium text-on-accent transition-colors hover:bg-violet-600"
                      >
                        Set
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
