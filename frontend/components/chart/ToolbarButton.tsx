"use client";

import { useState } from "react";

interface ToolbarButtonProps {
  label: string;
  active?: boolean;
  tone?: "default" | "danger";
  /** Which side of the icon the tooltip fans out from. Use "left" for a toolbar docked on the right edge of the chart. */
  placement?: "bottom" | "left";
  onClick: () => void;
  children: React.ReactNode;
}

interface ToolbarTooltipProps {
  label: string;
  hover: boolean;
  placement?: "bottom" | "left";
}

// The floating label bubble shared by ToolbarButton and the toolbar's dropdown
// triggers (ChartTypeMenu/DrawingMenu/IndicatorsMenu), so every toolbar icon
// gets the same fade-in tooltip with its bezier-curve "tail" instead of the
// native browser title tooltip.
export function ToolbarTooltip({ label, hover, placement = "bottom" }: ToolbarTooltipProps) {
  return placement === "bottom" ? (
    <div
      className={`pointer-events-none absolute left-1/2 top-full z-30 -translate-x-1/2 pt-1.5 transition-all duration-150 ${
        hover ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"
      }`}
    >
      <svg width="16" height="7" viewBox="0 0 16 7" className="absolute left-1/2 top-0 -translate-x-1/2">
        <path d="M0,0 C4,0 4,7 8,7 C12,7 12,0 16,0 Z" fill="#151a24" stroke="#2a3342" strokeWidth="1" />
      </svg>
      <div className="mt-[6px] whitespace-nowrap rounded-md border border-border bg-[#151a24] px-2 py-1 text-xs font-medium text-white shadow-lg">
        {label}
      </div>
    </div>
  ) : (
    <div
      className={`pointer-events-none absolute right-full top-1/2 z-30 -translate-y-1/2 pr-1.5 transition-all duration-150 ${
        hover ? "opacity-100 translate-x-0" : "opacity-0 translate-x-1"
      }`}
    >
      <svg width="7" height="16" viewBox="0 0 7 16" className="absolute right-0 top-1/2 -translate-y-1/2">
        <path d="M7,0 C7,4 0,4 0,8 C0,12 7,12 7,16 Z" fill="#151a24" stroke="#2a3342" strokeWidth="1" />
      </svg>
      <div className="mr-[6px] whitespace-nowrap rounded-md border border-border bg-[#151a24] px-2 py-1 text-xs font-medium text-white shadow-lg">
        {label}
      </div>
    </div>
  );
}

// Icon-only toolbar button. The label lives in a floating tooltip that fades
// in on hover, connected to the icon by a small bezier-curve "tail" drawn as
// an SVG path (rather than the usual CSS-triangle notch).
export default function ToolbarButton({ label, active, tone = "default", placement = "bottom", onClick, children }: ToolbarButtonProps) {
  const [hover, setHover] = useState(false);

  const base = "flex h-7 w-7 items-center justify-center rounded transition-colors";
  const palette =
    tone === "danger"
      ? "text-muted hover:bg-down/20 hover:text-down"
      : active
        ? "bg-accent text-white"
        : "text-muted hover:bg-accent/20 hover:text-white";

  return (
    <div className="relative flex items-center" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button type="button" onClick={onClick} className={`${base} ${palette}`}>
        {children}
      </button>
      <ToolbarTooltip label={label} hover={hover} placement={placement} />
    </div>
  );
}
