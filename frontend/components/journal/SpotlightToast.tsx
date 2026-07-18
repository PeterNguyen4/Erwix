"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const TYPE_SPEED_MS = 18;
const MARGIN = 12;
const TOAST_WIDTH = 280;

interface SpotlightToastProps {
  targetSelector: string;
  message: string;
  onExpand: () => void;
}

/**
 * A caption bubble anchored near the element SpotlightOverlay is ringing —
 * used while the analyst debrief drawer is minimized, so the highlight and
 * the accompanying blurb read as one thing instead of two disconnected UI
 * elements. Falls back to bottom-center if the target isn't on screen.
 * Text reveals with a typewriter effect (see AnalystDebrief for why this
 * isn't real token streaming).
 */
export default function SpotlightToast({ targetSelector, message, onExpand }: SpotlightToastProps) {
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; alignBottom: boolean } | null>(null);
  const [shown, setShown] = useState("");
  const typeTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const measure = () => {
      const el = document.querySelector(targetSelector);
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      if (!el) {
        setPos({ top: vh - MARGIN, left: vw / 2 - TOAST_WIDTH / 2, alignBottom: true });
        return;
      }

      const r = el.getBoundingClientRect();
      let left = r.left + r.width / 2 - TOAST_WIDTH / 2;
      left = Math.max(MARGIN, Math.min(left, vw - TOAST_WIDTH - MARGIN));

      const spaceBelow = vh - r.bottom;
      const preferBelow = spaceBelow > 120 || spaceBelow > r.top;
      const top = preferBelow ? r.bottom + 10 : r.top - 10;

      setPos({ top, left, alignBottom: !preferBelow });
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

  // Typewriter reveal — resets whenever the message changes.
  useEffect(() => {
    setShown("");
    if (typeTimer.current) clearInterval(typeTimer.current);
    let i = 0;
    typeTimer.current = setInterval(() => {
      i += 1;
      setShown(message.slice(0, i));
      if (i >= message.length && typeTimer.current) {
        clearInterval(typeTimer.current);
        typeTimer.current = null;
      }
    }, TYPE_SPEED_MS);
    return () => {
      if (typeTimer.current) clearInterval(typeTimer.current);
    };
  }, [message]);

  if (!mounted || !pos) return null;

  return createPortal(
    <div
      className="fixed z-50 animate-fade-in-up"
      style={{
        top: pos.alignBottom ? undefined : pos.top,
        bottom: pos.alignBottom ? window.innerHeight - pos.top : undefined,
        left: pos.left,
        width: TOAST_WIDTH,
      }}
    >
      <button
        onClick={onExpand}
        title="Open full chat"
        className="w-full rounded-xl border border-accent/40 bg-panel/95 px-3 py-2.5 text-left text-xs text-fg shadow-xl backdrop-blur-sm transition-colors hover:border-accent"
      >
        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          uWick
        </div>
        <p className="leading-snug text-fg">
          {shown}
          {shown.length < message.length && <span className="animate-pulse">▍</span>}
        </p>
      </button>
    </div>,
    document.body,
  );
}
