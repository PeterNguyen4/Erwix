"use client";

import { useState } from "react";
import { INDICATORS } from "@/components/chart/indicators";
import { IconStar } from "@/components/chart/drawingTools";

interface IndicatorsMenuProps {
  active: Set<string>;
  onToggle: (id: string) => void;
  pinned: Set<string>;
  onTogglePin: (id: string) => void;
}

function IconIndicators() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path d="M2 14 L6 8 L9 11 L16 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 5 H16" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

export default function IndicatorsMenu({ active, onToggle, pinned, onTogglePin }: IndicatorsMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        title="Indicators"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={`flex h-7 items-center gap-1 rounded px-1.5 transition-colors ${
          active.size > 0 ? "bg-accent text-white" : "text-muted hover:bg-accent/20 hover:text-white"
        }`}
      >
        <IconIndicators />
        {active.size > 0 && <span className="text-[10px] font-semibold tabular-nums">{active.size}</span>}
        <svg width="8" height="8" viewBox="0 0 10 10" className="opacity-70">
          <path d="M1 3 L5 7 L9 3" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-48 rounded-md border border-border bg-[#151a24] py-1 shadow-lg">
          {INDICATORS.map((ind) => {
            const checked = active.has(ind.id);
            return (
              <div
                key={ind.id}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                  checked ? "bg-accent/20 text-white" : "text-muted hover:bg-accent/10 hover:text-white"
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
                  {checked && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  title={pinned.has(ind.id) ? "Unpin from toolbar" : "Pin to toolbar"}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePin(ind.id);
                  }}
                  className={`shrink-0 transition-colors ${pinned.has(ind.id) ? "text-accent" : "text-muted hover:text-white"}`}
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
