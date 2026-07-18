"use client";

import { useState } from "react";
import { ChevronDown, Check, TrendingUp } from "lucide-react";
import { INDICATORS } from "@/components/chart/indicators";
import { IconStar } from "@/components/chart/drawingTools";
import { ToolbarTooltip } from "@/components/chart/ToolbarButton";

interface IndicatorsMenuProps {
  active: Set<string>;
  onToggle: (id: string) => void;
  pinned: Set<string>;
  onTogglePin: (id: string) => void;
}

export default function IndicatorsMenu({ active, onToggle, pinned, onTogglePin }: IndicatorsMenuProps) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);

  return (
    <div className="relative flex items-center" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={`flex h-7 items-center gap-1 rounded px-1.5 transition-colors ${
          active.size > 0 ? "bg-accent text-fg" : "text-muted hover:bg-accent/20 hover:text-fg"
        }`}
      >
        <TrendingUp size={16} strokeWidth={2} />
        {active.size > 0 && <span className="text-[10px] font-semibold tabular-nums">{active.size}</span>}
        <ChevronDown size={12} strokeWidth={2} className="opacity-70" />
      </button>
      <ToolbarTooltip label="Indicators" hover={hover && !open} />
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-48 rounded-md border border-border bg-[#151a24] py-1 shadow-lg">
          {INDICATORS.map((ind) => {
            const checked = active.has(ind.id);
            return (
              <div
                key={ind.id}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                  checked ? "bg-accent/20 text-fg" : "text-muted hover:bg-accent/10 hover:text-fg"
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
                  className={`shrink-0 transition-colors ${pinned.has(ind.id) ? "text-accent" : "text-muted hover:text-fg"}`}
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
