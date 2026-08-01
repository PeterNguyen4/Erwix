"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { CHART_TYPES, ChartTypeId } from "@/components/chart/chartTypes";
import { IconStar } from "@/components/chart/drawingTools";
import { ToolbarTooltip } from "@/components/chart/ToolbarButton";

interface ChartTypeMenuProps {
  value: ChartTypeId;
  onChange: (id: ChartTypeId) => void;
  /** Which edge the dropdown panel hangs from — use "right" when the button sits at the right edge of the chart. */
  align?: "left" | "right";
  pinned: Set<ChartTypeId>;
  onTogglePin: (id: ChartTypeId) => void;
}

export default function ChartTypeMenu({ value, onChange, align = "left", pinned, onTogglePin }: ChartTypeMenuProps) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const current = CHART_TYPES.find((t) => t.id === value) ?? CHART_TYPES[0];

  return (
    <div className="relative flex items-center" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex h-7 items-center gap-1 rounded px-1.5 text-muted transition-colors hover:bg-violet-500/20 hover:text-fg"
      >
        <current.icon />
        <ChevronDown size={12} strokeWidth={2} className="opacity-70" />
      </button>
      <ToolbarTooltip label={current.label} hover={hover && !open} />
      {open && (
        <div
          className={`absolute top-full z-30 mt-1 w-40 rounded-md border border-border bg-panel py-1 shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {CHART_TYPES.map((t) => (
            <div
              key={t.id}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                t.id === value ? "bg-violet-500/20 text-fg" : "text-muted hover:bg-violet-500/10 hover:text-fg"
              }`}
            >
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(t.id);
                  setOpen(false);
                }}
                className="flex flex-1 items-center gap-2"
              >
                <t.icon />
                {t.label}
              </button>
              <button
                type="button"
                title={pinned.has(t.id) ? "Unpin from toolbar" : "Pin to toolbar"}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePin(t.id);
                }}
                className={`shrink-0 transition-colors ${pinned.has(t.id) ? "text-violet-400" : "text-muted hover:text-fg"}`}
              >
                <IconStar filled={pinned.has(t.id)} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
