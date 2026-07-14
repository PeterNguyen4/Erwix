"use client";

import { useState } from "react";
import { CHART_TYPES, ChartTypeId } from "@/components/chart/chartTypes";

interface ChartTypeMenuProps {
  value: ChartTypeId;
  onChange: (id: ChartTypeId) => void;
  /** Which edge the dropdown panel hangs from — use "right" when the button sits at the right edge of the chart. */
  align?: "left" | "right";
}

export default function ChartTypeMenu({ value, onChange, align = "left" }: ChartTypeMenuProps) {
  const [open, setOpen] = useState(false);
  const current = CHART_TYPES.find((t) => t.id === value) ?? CHART_TYPES[0];

  return (
    <div className="relative">
      <button
        type="button"
        title={current.label}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex h-7 items-center gap-1 rounded px-1.5 text-muted transition-colors hover:bg-accent/20 hover:text-white"
      >
        <current.icon />
        <svg width="8" height="8" viewBox="0 0 10 10" className="opacity-70">
          <path d="M1 3 L5 7 L9 3" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>
      {open && (
        <div
          className={`absolute top-full z-30 mt-1 w-40 rounded-md border border-border bg-[#151a24] py-1 shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {CHART_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(t.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                t.id === value ? "bg-accent/20 text-white" : "text-muted hover:bg-accent/10 hover:text-white"
              }`}
            >
              <t.icon />
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
