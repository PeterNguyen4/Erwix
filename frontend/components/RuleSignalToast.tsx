"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { RuleSignal } from "@/lib/useRuleWatch";

const AUTO_DISMISS_MS = 8000;

interface RuleSignalToastStackProps {
  signals: RuleSignal[];
  onDismiss: (id: string) => void;
}

export default function RuleSignalToastStack({ signals, onDismiss }: RuleSignalToastStackProps) {
  if (typeof document === "undefined" || signals.length === 0) return null;

  return createPortal(
    <div className="fixed right-4 top-16 z-50 flex flex-col gap-2">
      {signals.map((s) => (
        <ToastItem key={s.id} signal={s} onDismiss={() => onDismiss(s.id)} />
      ))}
    </div>,
    document.body,
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
      className="w-72 animate-fade-in-up rounded-xl border bg-panel/95 px-3 py-2.5 text-left text-xs shadow-xl backdrop-blur-sm"
      style={{ borderColor: signal.annotation.color ?? (isEntry ? "#26a69a" : "#ef5350") }}
    >
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: signal.annotation.color ?? (isEntry ? "#26a69a" : "#ef5350") }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: signal.annotation.color ?? (isEntry ? "#26a69a" : "#ef5350") }} />
        {isEntry ? "Entry signal" : "Exit signal"}
      </div>
      <p className="leading-snug text-fg">{signal.description}</p>
    </button>
  );
}
