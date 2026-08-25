"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface ToolbarButtonProps {
  label: string;
  active?: boolean;
  tone?: "default" | "danger";
  placement?: "top" | "bottom" | "left" | "right";
  showLabel?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

interface ToolbarTooltipProps {
  label: string;
  hover: boolean;
  placement?: "top" | "bottom" | "left" | "right";
  anchorRef: React.RefObject<HTMLElement | null>;
}

interface DropdownPanelProps {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  align?: "left" | "right";
  children: React.ReactNode;
}

export function DropdownPanel({ open, anchorRef, align = "left", children }: DropdownPanelProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (open && anchorRef.current) setRect(anchorRef.current.getBoundingClientRect());
  }, [open, anchorRef]);

  if (!open || !rect || typeof document === "undefined") return null;

  const style: React.CSSProperties = {
    position: "fixed",
    top: rect.bottom + 4,
    ...(align === "right" ? { right: window.innerWidth - rect.right } : { left: rect.left }),
  };

  return createPortal(
    <div style={style} className="z-[70]">
      {children}
    </div>,
    document.body,
  );
}

const GAP = 8;

export function ToolbarTooltip({ label, hover, placement = "bottom", anchorRef }: ToolbarTooltipProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (anchorRef.current) setRect(anchorRef.current.getBoundingClientRect());
  }, [hover, anchorRef]);

  if (!rect || typeof document === "undefined") return null;

  const bubble = "relative whitespace-nowrap rounded-md bg-tooltip px-3 py-2 text-sm font-medium text-tooltip-fg shadow-lg";
  const caretBase = "absolute h-2.5 w-2.5 rotate-45 bg-tooltip";

  let wrapperStyle: React.CSSProperties;
  let caretClass: string;
  let hiddenTransform: string;

  if (placement === "top") {
    wrapperStyle = { position: "fixed", left: rect.left + rect.width / 2, top: rect.top - GAP, transform: "translate(-50%, -100%)" };
    caretClass = `${caretBase} -bottom-1 left-1/2 -translate-x-1/2`;
    hiddenTransform = "translate(-50%, calc(-100% + 4px))";
  } else if (placement === "bottom") {
    wrapperStyle = { position: "fixed", left: rect.left + rect.width / 2, top: rect.bottom + GAP, transform: "translate(-50%, 0)" };
    caretClass = `${caretBase} -top-1 left-1/2 -translate-x-1/2`;
    hiddenTransform = "translate(-50%, -4px)";
  } else if (placement === "right") {
    wrapperStyle = { position: "fixed", left: rect.right + GAP, top: rect.top + rect.height / 2, transform: "translate(0, -50%)" };
    caretClass = `${caretBase} -left-1 top-1/2 -translate-y-1/2`;
    hiddenTransform = "translate(-4px, -50%)";
  } else {
    wrapperStyle = { position: "fixed", left: rect.left - GAP, top: rect.top + rect.height / 2, transform: "translate(-100%, -50%)" };
    caretClass = `${caretBase} -right-1 top-1/2 -translate-y-1/2`;
    hiddenTransform = "translate(calc(-100% + 4px), -50%)";
  }

  return createPortal(
    <div
      className="pointer-events-none z-[70] transition-all duration-150"
      style={{ ...wrapperStyle, opacity: hover ? 1 : 0, transform: hover ? wrapperStyle.transform : hiddenTransform }}
    >
      <div className={bubble}>
        <span className={caretClass} />
        {label}
      </div>
    </div>,
    document.body,
  );
}

export default function ToolbarButton({ label, active, tone = "default", placement = "bottom", showLabel = false, onClick, children }: ToolbarButtonProps) {
  const [hover, setHover] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const base = showLabel
    ? "flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 transition-colors"
    : "flex h-7 w-7 items-center justify-center rounded transition-colors";
  const palette = showLabel
    ? tone === "danger"
      ? "border-border text-muted hover:border-down/40 hover:bg-down/20 hover:text-down"
      : active
        ? "border-violet-500 bg-violet-500 text-on-accent"
        : "border-border bg-field text-muted hover:bg-violet-500/10 hover:text-fg"
    : tone === "danger"
      ? "text-muted hover:bg-down/20 hover:text-down"
      : active
        ? "bg-violet-500 text-on-accent"
        : "text-muted hover:bg-violet-500/20 hover:text-fg";

  return (
    <div className="relative flex items-center" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button ref={buttonRef} type="button" onClick={onClick} className={`${base} ${palette}`}>
        {children}
        {showLabel && <span className="whitespace-nowrap text-xs">{label}</span>}
      </button>
      {!showLabel && <ToolbarTooltip label={label} hover={hover} placement={placement} anchorRef={buttonRef} />}
    </div>
  );
}
