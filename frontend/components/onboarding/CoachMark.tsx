"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const MARGIN = 12;
const BUBBLE_WIDTH = 240;

interface CoachMarkProps {
  targetSelector: string;
  message: string;
  onNext?: () => void;
  nextLabel?: string;
}

/** Caption bubble for walkthrough */
export default function CoachMark({ targetSelector, message, onNext, nextLabel = "Next" }: CoachMarkProps) {
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; alignAbove: boolean } | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const measure = () => {
      const el = document.querySelector(targetSelector);
      if (!el) {
        setPos(null);
        return;
      }
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = r.left + r.width / 2 - BUBBLE_WIDTH / 2;
      left = Math.max(MARGIN, Math.min(left, vw - BUBBLE_WIDTH - MARGIN));

      const spaceBelow = vh - r.bottom;
      const alignAbove = spaceBelow < 100 && r.top > 100;
      const top = alignAbove ? r.top - 10 : r.bottom + 10;
      setPos({ top, left, alignAbove });
    };

    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [targetSelector]);

  if (!mounted || !pos) return null;

  return createPortal(
    <div
      className={`fixed z-50 animate-fade-in ${onNext ? "" : "pointer-events-none"}`}
      style={{
        top: pos.alignAbove ? undefined : pos.top,
        bottom: pos.alignAbove ? window.innerHeight - pos.top : undefined,
        left: pos.left,
        width: BUBBLE_WIDTH,
      }}
    >
      <div className="rounded-xl border border-accent/40 bg-panel/95 px-3 py-2.5 text-left text-sm text-fg shadow-xl backdrop-blur-sm">
        <p>{message}</p>
        {onNext && (
          <div className="mt-2 flex justify-end">
            <button
              onClick={onNext}
              className="pointer-events-auto flex items-center gap-1 rounded-md bg-accent px-3 py-1 text-sm font-medium text-on-accent hover:bg-accent/90"
            >
              {nextLabel}
              <ChevronRight size={12} strokeWidth={2} />
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
