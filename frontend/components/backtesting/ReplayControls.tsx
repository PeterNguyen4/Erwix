"use client";

import { useEffect, useRef } from "react";

interface ReplayControlsProps {
  total: number;
  cursorIndex: number;
  playing: boolean;
  speedMs: number;
  onCursorChange: (index: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onSpeedChange: (speedMs: number) => void;
}

const SPEED_OPTIONS = [
  { value: 500, label: "1x" },
  { value: 200, label: "2.5x" },
  { value: 80, label: "6x" },
];

export default function ReplayControls({
  total,
  cursorIndex,
  playing,
  speedMs,
  onCursorChange,
  onPlayingChange,
  onSpeedChange,
}: ReplayControlsProps) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!playing) return;
    intervalRef.current = setInterval(() => {
      onCursorChange(Math.min(cursorIndex + 1, total - 1));
    }, speedMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speedMs, cursorIndex, total]);

  useEffect(() => {
    if (cursorIndex >= total - 1) onPlayingChange(false);
  }, [cursorIndex, total, onPlayingChange]);

  return (
    <div className="flex items-center gap-3 border-t border-border bg-panel px-3 py-2 shrink-0">
      <button
        onClick={() => onCursorChange(Math.max(cursorIndex - 1, 0))}
        className="rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-fg"
      >
        ◀ Step
      </button>
      <button
        onClick={() => onPlayingChange(!playing)}
        className="rounded-md bg-accent px-3 py-1 text-xs font-semibold text-on-accent transition-colors hover:bg-accent/80"
      >
        {playing ? "Pause" : "Play"}
      </button>
      <button
        onClick={() => onCursorChange(Math.min(cursorIndex + 1, total - 1))}
        className="rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-fg"
      >
        Step ▶
      </button>

      <input
        type="range"
        min={0}
        max={Math.max(total - 1, 0)}
        value={cursorIndex}
        onChange={(e) => onCursorChange(Number(e.target.value))}
        className="mx-2 flex-1 accent-accent"
      />
      <span className="w-20 shrink-0 text-right text-xs text-muted">
        {total > 0 ? `${cursorIndex + 1} / ${total}` : "0 / 0"}
      </span>

      <div className="flex items-center gap-1">
        {SPEED_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onSpeedChange(opt.value)}
            className={`rounded-md border px-2 py-1 text-xs transition-colors ${
              speedMs === opt.value
                ? "border-accent text-fg"
                : "border-border text-muted hover:border-accent hover:text-fg"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
