"use client";

import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Play, Pause } from "lucide-react";
import ToolbarButton from "@/components/chart/ToolbarButton";

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
      <ToolbarButton
        label="Step back"
        placement="top"
        onClick={() => onCursorChange(Math.max(cursorIndex - 1, 0))}
      >
        <ChevronLeft size={16} strokeWidth={2} />
      </ToolbarButton>
      <ToolbarButton
        label={playing ? "Pause" : "Play"}
        active={playing}
        placement="top"
        onClick={() => onPlayingChange(!playing)}
      >
        {playing ? <Pause size={16} strokeWidth={2} /> : <Play size={16} strokeWidth={2} />}
      </ToolbarButton>
      <ToolbarButton
        label="Step forward"
        placement="top"
        onClick={() => onCursorChange(Math.min(cursorIndex + 1, total - 1))}
      >
        <ChevronRight size={16} strokeWidth={2} />
      </ToolbarButton>

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
                ? "border-violet-400 text-fg"
                : "border-border text-muted hover:border-violet-400 hover:text-fg"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
