"use client";

import { useRef, useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { DropdownPanel, ToolbarTooltip } from "@/components/chart/ToolbarButton";

interface ClearMenuProps {
  drawingCount: number;
  indicatorCount: number;
  onClearDrawings: () => void;
  onClearIndicators: () => void;
  onClearAll: () => void;
  showLabel?: boolean;
}

export default function ClearMenu({ drawingCount, indicatorCount, onClearDrawings, onClearIndicators, onClearAll, showLabel = false }: ClearMenuProps) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const items: { label: string; onClick: () => void }[] = [
    { label: `Clear all drawings (${drawingCount})`, onClick: onClearDrawings },
    { label: `Clear all indicators (${indicatorCount})`, onClick: onClearIndicators },
    { label: `Clear all drawings and indicators (${drawingCount + indicatorCount})`, onClick: onClearAll },
  ];

  return (
    <div className="relative flex items-center" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={
          showLabel
            ? "flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-field px-3 text-muted transition-colors hover:border-down/40 hover:bg-down/20 hover:text-down"
            : "flex h-7 items-center gap-1 rounded px-1.5 text-muted transition-colors hover:bg-down/20 hover:text-down"
        }
      >
        <Trash2 size={16} strokeWidth={2} />
        {showLabel && <span className="whitespace-nowrap text-xs">Clear</span>}
        <ChevronDown size={12} strokeWidth={2} className="opacity-70" />
      </button>
      {!showLabel && <ToolbarTooltip label="Clear" hover={hover && !open} anchorRef={buttonRef} />}
      <DropdownPanel open={open} anchorRef={buttonRef} align="right">
        <div className="w-56 rounded-md border border-border bg-panel py-1 shadow-lg">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                item.onClick();
                setOpen(false);
              }}
              className="flex w-full items-center px-3 py-1.5 text-left text-xs text-muted transition-colors hover:bg-down/10 hover:text-down"
            >
              {item.label}
            </button>
          ))}
        </div>
      </DropdownPanel>
    </div>
  );
}
