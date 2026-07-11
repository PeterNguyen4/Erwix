"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Dims the rest of the page except for the element matching `targetSelector`,
 * with a glowing ring around it — used by the analyst debrief to point at a
 * specific calendar day (or any other data-attributed element) while talking.
 */
export default function SpotlightOverlay({ targetSelector }: { targetSelector: string | null }) {
  const [rect, setRect] = useState<Rect | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!targetSelector) {
      setRect(null);
      return;
    }

    const measure = () => {
      const el = document.querySelector(targetSelector);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
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

  if (!mounted || !rect) return null;

  const pad = 6;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-40">
      <div
        className="absolute animate-spotlight-in rounded-lg ring-2 ring-accent transition-[top,left,width,height] duration-300"
        style={{
          top: rect.top - pad,
          left: rect.left - pad,
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
          boxShadow: "0 0 0 9999px rgba(4,6,10,0.6)",
        }}
      />
    </div>,
    document.body,
  );
}
