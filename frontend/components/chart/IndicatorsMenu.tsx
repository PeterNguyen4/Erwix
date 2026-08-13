"use client";

import { useRef, useState } from "react";
import { ChevronDown, Check, TrendingUp } from "lucide-react";
import { INDICATORS, PARAMETRIZED_FAMILIES, makeIndicatorId } from "@/components/chart/indicators";
import { IconStar } from "@/components/chart/drawingTools";
import { ToolbarTooltip } from "@/components/chart/ToolbarButton";

interface IndicatorsMenuProps {
  active: Set<string>;
  onToggle: (id: string) => void;
  onAdd: (id: string) => void;
  pinned: Set<string>;
  onTogglePin: (id: string) => void;
}

const PARAMETRIZED_ID = /^(sma|ema|rsi)_(\d+)$/;
const STATIC_INDICATORS = INDICATORS.filter((ind) => !PARAMETRIZED_ID.test(ind.id));

export default function IndicatorsMenu({ active, onToggle, onAdd, pinned, onTogglePin }: IndicatorsMenuProps) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative flex items-center" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={`flex h-7 items-center gap-1 rounded px-1.5 transition-colors ${
          active.size > 0 ? "bg-violet-500 text-on-accent" : "text-muted hover:bg-violet-500/20 hover:text-fg"
        }`}
      >
        <TrendingUp size={16} strokeWidth={2} />
        {active.size > 0 && <span className="text-[10px] font-semibold tabular-nums">{active.size}</span>}
        <ChevronDown size={12} strokeWidth={2} className="opacity-70" />
      </button>
      <ToolbarTooltip label="Indicators" hover={hover && !open} anchorRef={buttonRef} />
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-48 rounded-md border border-border bg-panel py-1 shadow-lg">
          {PARAMETRIZED_FAMILIES.map((fam) => {
            const defaultId = makeIndicatorId(fam.id, fam.defaultPeriod);
            return (
              <div
                key={fam.id}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted transition-colors hover:bg-violet-500/10 hover:text-fg"
              >
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onAdd(defaultId);
                    setOpen(false);
                  }}
                  className="flex flex-1 items-center gap-2"
                >
                  <fam.icon />
                  <span className="flex-1 text-left">{fam.label}</span>
                </button>
                <button
                  type="button"
                  title={pinned.has(defaultId) ? "Unpin from toolbar" : "Pin to toolbar"}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePin(defaultId);
                  }}
                  className={`shrink-0 transition-colors ${pinned.has(defaultId) ? "text-violet-400" : "text-muted hover:text-fg"}`}
                >
                  <IconStar filled={pinned.has(defaultId)} />
                </button>
              </div>
            );
          })}
          <div className="my-1 border-t border-border" />
          {STATIC_INDICATORS.map((ind) => {
            const checked = active.has(ind.id);
            return (
              <div
                key={ind.id}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                  checked ? "bg-violet-500/20 text-fg" : "text-muted hover:bg-violet-500/10 hover:text-fg"
                }`}
              >
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onToggle(ind.id)}
                  className="flex flex-1 items-center gap-2"
                >
                  <ind.icon />
                  <span className="flex-1 text-left">{ind.label}</span>
                  {checked && <Check size={12} strokeWidth={2.2} />}
                </button>
                <button
                  type="button"
                  title={pinned.has(ind.id) ? "Unpin from toolbar" : "Pin to toolbar"}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePin(ind.id);
                  }}
                  className={`shrink-0 transition-colors ${pinned.has(ind.id) ? "text-violet-400" : "text-muted hover:text-fg"}`}
                >
                  <IconStar filled={pinned.has(ind.id)} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
