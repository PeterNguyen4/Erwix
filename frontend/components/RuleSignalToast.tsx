"use client";

import { useEffect } from "react";
import type { RuleSignal } from "@/lib/useRuleWatch";

const AUTO_DISMISS_MS = 8000;

interface RuleSignalToastStackProps {
  signals: RuleSignal[];
  onDismiss: (id: string) => void;
}

/** Anchored top-center over the chart itself (parent must be `relative`) so a
 * fired signal lands in the trader's eyeline instead of a page corner. */
export default function RuleSignalToastStack({ signals, onDismiss }: RuleSignalToastStackProps) {
  if (signals.length === 0) return null;

  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-40 flex -translate-x-1/2 flex-col items-center gap-2">
      {signals.map((s) => (
        <ToastItem key={s.id} signal={s} onDismiss={() => onDismiss(s.id)} />
      ))}
    </div>
  );
}

function ToastItem({ signal, onDismiss }: { signal: RuleSignal; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const isEntry = signal.kind === "entry";

  return (
    <button
      onClick={onDismiss}
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
