"use client";

import { useState } from "react";
import { DRAWING_TOOLS, DrawingToolId, IconDrawingTool, IconStar } from "@/components/chart/drawingTools";

interface DrawingMenuProps {
  /** "crosshair" means no drawing tool is active. */
  value: "crosshair" | DrawingToolId;
  onChange: (id: DrawingToolId) => void;
  /** Which edge the dropdown panel hangs from — use "right" when the button sits at the right edge of the chart. */
  align?: "left" | "right";
  pinned: Set<DrawingToolId>;
  onTogglePin: (id: DrawingToolId) => void;
}

export default function DrawingMenu({ value, onChange, align = "left", pinned, onTogglePin }: DrawingMenuProps) {
  const [open, setOpen] = useState(false);
  const active = DRAWING_TOOLS.find((t) => t.id === value) ?? null;

  return (
    <div className="relative">
      <button
        type="button"
        title="Drawing tools"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={`flex h-7 items-center gap-1 rounded px-1.5 transition-colors ${
          active ? "bg-accent text-white" : "text-muted hover:bg-accent/20 hover:text-white"
        }`}
      >
        {active ? <active.icon /> : <IconDrawingTool />}
        <svg width="8" height="8" viewBox="0 0 10 10" className="opacity-70">
          <path d="M1 3 L5 7 L9 3" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>
      {open && (
        <div
          className={`absolute top-full z-30 mt-1 w-48 rounded-md border border-border bg-[#151a24] py-1 shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {DRAWING_TOOLS.map((t) => (
            <div
              key={t.id}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                t.id === value ? "bg-accent/20 text-white" : "text-muted hover:bg-accent/10 hover:text-white"
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
                className={`shrink-0 transition-colors ${pinned.has(t.id) ? "text-accent" : "text-muted hover:text-white"}`}
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
