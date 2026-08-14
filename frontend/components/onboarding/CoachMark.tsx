"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MARGIN = 12;
const BUBBLE_WIDTH = 240;
const FALLBACK_HEIGHT = 130;

interface CoachMarkProps {
  targetSelector: string;
  message: string;
  onNext?: () => void;
  nextLabel?: string;
}

/** Caption bubble for walkthrough */
export default function CoachMark({ targetSelector, message, onNext, nextLabel = "Next" }: CoachMarkProps) {
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

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
      const bubbleHeight = bubbleRef.current?.offsetHeight || FALLBACK_HEIGHT;
      let left = r.left + r.width / 2 - BUBBLE_WIDTH / 2;
      left = Math.max(MARGIN, Math.min(left, vw - BUBBLE_WIDTH - MARGIN));

      const spaceBelow = vh - r.bottom;
      const alignAbove = spaceBelow < bubbleHeight + MARGIN && r.top > bubbleHeight + MARGIN;
      let top = alignAbove ? r.top - 10 - bubbleHeight : r.bottom + 10;
      top = Math.max(MARGIN, Math.min(top, vh - bubbleHeight - MARGIN));
      setPos({ top, left });
    };

    const raf = requestAnimationFrame(measure);
    const raf2 = requestAnimationFrame(() => requestAnimationFrame(measure));
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(raf2);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [targetSelector, message]);

  if (!mounted || !pos) return null;

  return createPortal(
    <div
      ref={bubbleRef}
      className={`fixed z-50 animate-fade-in ${onNext ? "" : "pointer-events-none"}`}
      style={{
        top: pos.top,
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
