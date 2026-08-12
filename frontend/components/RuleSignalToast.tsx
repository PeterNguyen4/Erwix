"use client";

import { useEffect } from "react";
import type { RuleSignal } from "@/lib/useRuleWatch";

const AUTO_DISMISS_MS = 8000;

interface RuleSignalToastStackProps {
  signals: RuleSignal[];
  onDismiss: (id: string) => void;
  autoDismissMs?: number;
  position?: "top-center" | "top-left";
}

const POSITION_CLASSES: Record<NonNullable<RuleSignalToastStackProps["position"]>, string> = {
  "top-center": "left-1/2 top-3 -translate-x-1/2 items-center",
  "top-left": "left-3 top-3 items-start",
};


export default function RuleSignalToastStack({
  signals,
  onDismiss,
  autoDismissMs = AUTO_DISMISS_MS,
  position = "top-center",
}: RuleSignalToastStackProps) {
  if (signals.length === 0) return null;

  return (
    <div className={`pointer-events-none absolute z-40 flex flex-col gap-2 ${POSITION_CLASSES[position]}`}>
      {signals.map((s) => (
        <ToastItem key={s.id} signal={s} onDismiss={onDismiss} autoDismissMs={autoDismissMs} />
      ))}
    </div>
  );
}

function ToastItem({
  signal,
  onDismiss,
  autoDismissMs,
}: {
  signal: RuleSignal;
  onDismiss: (id: string) => void;
  autoDismissMs: number;
}) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(signal.id), autoDismissMs);
    return () => clearTimeout(t);
  }, [signal.id, onDismiss, autoDismissMs]);

  const isEntry = signal.kind === "entry";
  const handleDismiss = () => onDismiss(signal.id);

  return (
    <button
      onClick={handleDismiss}
      className="pointer-events-auto w-72 animate-fade-in-up rounded-xl border bg-panel/95 px-3 py-2.5 text-left text-xs shadow-xl backdrop-blur-sm"
      style={{ borderColor: signal.annotation.color ?? (isEntry ? "#26a69a" : "#ef5350") }}
    >
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold tracking-wide" style={{ color: signal.annotation.color ?? (isEntry ? "#26a69a" : "#ef5350") }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: signal.annotation.color ?? (isEntry ? "#26a69a" : "#ef5350") }} />
        {isEntry ? "Entry Signal" : "Exit Signal"}
      </div>
      <p className="leading-snug text-fg">{signal.description}</p>
    </button>
  );
}
