"use client";

import { useState } from "react";

interface ToolbarButtonProps {
  label: string;
  active?: boolean;
  tone?: "default" | "danger";
  placement?: "bottom" | "left" | "right";
  onClick: () => void;
  children: React.ReactNode;
}

interface ToolbarTooltipProps {
  label: string;
  hover: boolean;
  placement?: "bottom" | "left" | "right";
}

export function ToolbarTooltip({ label, hover, placement = "bottom" }: ToolbarTooltipProps) {
  const bubble = "relative whitespace-nowrap rounded-md bg-tooltip px-3 py-2 text-sm font-medium text-tooltip-fg shadow-lg";
  const caret = "absolute h-2.5 w-2.5 rotate-45 bg-tooltip";

  if (placement === "bottom") {
    return (
      <div
        className={`pointer-events-none absolute left-1/2 top-full z-30 -translate-x-1/2 pt-2 transition-all duration-150 ${
          hover ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"
        }`}
      >
        <div className={bubble}>
          <span className={`${caret} -top-1 left-1/2 -translate-x-1/2`} />
          {label}
        </div>
      </div>
    );
  }

  if (placement === "right") {
    return (
      <div
        className={`pointer-events-none absolute left-full top-1/2 z-30 -translate-y-1/2 pl-2 transition-all duration-150 ${
          hover ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-1"
        }`}
      >
        <div className={bubble}>
          <span className={`${caret} -left-1 top-1/2 -translate-y-1/2`} />
          {label}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`pointer-events-none absolute right-full top-1/2 z-30 -translate-y-1/2 pr-2 transition-all duration-150 ${
        hover ? "opacity-100 translate-x-0" : "opacity-0 translate-x-1"
      }`}
    >
      <div className={bubble}>
        <span className={`${caret} -right-1 top-1/2 -translate-y-1/2`} />
        {label}
      </div>
    </div>
  );
}

export default function ToolbarButton({ label, active, tone = "default", placement = "bottom", onClick, children }: ToolbarButtonProps) {
  const [hover, setHover] = useState(false);

  const base = "flex h-7 w-7 items-center justify-center rounded transition-colors";
  const palette =
    tone === "danger"
      ? "text-muted hover:bg-down/20 hover:text-down"
      : active
        ? "bg-violet-500 text-on-accent"
        : "text-muted hover:bg-violet-500/20 hover:text-fg";

  return (
    <div className="relative flex items-center" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button type="button" onClick={onClick} className={`${base} ${palette}`}>
        {children}
      </button>
      <ToolbarTooltip label={label} hover={hover} placement={placement} />
    </div>
  );
}
