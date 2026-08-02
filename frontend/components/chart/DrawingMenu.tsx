"use client";

import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { DRAWING_TOOLS, DrawingToolId, IconDrawingTool, IconStar } from "@/components/chart/drawingTools";
import { ToolbarTooltip } from "@/components/chart/ToolbarButton";

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
  const [hover, setHover] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const active = DRAWING_TOOLS.find((t) => t.id === value) ?? null;

  return (
    <div className="relative flex items-center" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={`flex h-7 items-center gap-1 rounded px-1.5 transition-colors ${
          active ? "bg-violet-500 text-on-accent" : "text-muted hover:bg-violet-500/20 hover:text-fg"
        }`}
      >
        {active ? <active.icon /> : <IconDrawingTool />}
        <ChevronDown size={12} strokeWidth={2} className="opacity-70" />
      </button>
      <ToolbarTooltip label="Drawing tools" hover={hover && !open} anchorRef={buttonRef} />
      {open && (
        <div
          className={`absolute top-full z-30 mt-1 w-56 rounded-md border border-border bg-panel py-1 shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {DRAWING_TOOLS.map((t) => (
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
                <span className="whitespace-nowrap">{t.label}</span>
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
