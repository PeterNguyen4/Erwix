"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { CHART_TYPES, ChartTypeId } from "@/components/chart/chartTypes";
import { DRAWING_TOOLS, DrawingToolId } from "@/components/chart/drawingTools";
import { INDICATORS } from "@/components/chart/indicators";

interface ChartContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  chartTypeId: ChartTypeId;
  onChartTypeChange: (id: ChartTypeId) => void;
  drawingMode: "crosshair" | DrawingToolId;
  onDrawingModeChange: (id: "crosshair" | DrawingToolId) => void;
  activeIndicators: Set<string>;
  onToggleIndicator: (id: string) => void;
  onQuickOrder?: (side: "buy" | "sell") => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <div className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{title}</div>
      {children}
    </div>
  );
}

// Right-click chart menu for quick buy/sell and toolbar options
export default function ChartContextMenu({
  x,
  y,
  onClose,
  chartTypeId,
  onChartTypeChange,
  drawingMode,
  onDrawingModeChange,
  activeIndicators,
  onToggleIndicator,
  onQuickOrder,
}: ChartContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const clampedX = Math.min(x, window.innerWidth - rect.width - 8);
    const clampedY = Math.min(y, window.innerHeight - rect.height - 8);
    setPos({ x: Math.max(8, clampedX), y: Math.max(8, clampedY) });
  }, [x, y]);

  useEffect(() => {
    const handleClickAway = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClickAway);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickAway);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const itemClass = (active: boolean) =>
    `flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
      active ? "bg-violet-500/20 text-fg" : "text-muted hover:bg-violet-500/10 hover:text-fg"
    }`;

  return (
    <div
      ref={menuRef}
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-50 w-48 rounded-md border border-border bg-panel py-1 shadow-lg"
      onContextMenu={(e) => e.preventDefault()}
    >
      {onQuickOrder && (
        <>
          <div className="flex gap-2 px-2 pt-1 pb-2">
            <button
              type="button"
              onClick={() => {
                onQuickOrder("buy");
                onClose();
              }}
              className="flex-1 rounded bg-up/90 py-1.5 text-xs font-semibold text-fg hover:bg-up"
            >
              Buy
            </button>
            <button
              type="button"
              onClick={() => {
                onQuickOrder("sell");
                onClose();
              }}
              className="flex-1 rounded bg-down/90 py-1.5 text-xs font-semibold text-fg hover:bg-down"
            >
              Sell
            </button>
          </div>

          <div className="h-px bg-border" />
        </>
      )}

      <Section title="Chart Type">
        {CHART_TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              onChartTypeChange(t.id);
              onClose();
            }}
            className={itemClass(t.id === chartTypeId)}
          >
            <t.icon />
            {t.label}
          </button>
        ))}
      </Section>

      <div className="h-px bg-border" />

      <Section title="Drawing Tool">
        <button
          type="button"
          onClick={() => {
            onDrawingModeChange("crosshair");
            onClose();
          }}
          className={itemClass(drawingMode === "crosshair")}
        >
          Cursor
        </button>
        {DRAWING_TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              onDrawingModeChange(t.id);
              onClose();
            }}
            className={itemClass(t.id === drawingMode)}
          >
            <t.icon />
            {t.label}
          </button>
        ))}
      </Section>

      <div className="h-px bg-border" />

      <Section title="Indicators">
        {INDICATORS.map((ind) => {
          const checked = activeIndicators.has(ind.id);
          return (
            <button
              key={ind.id}
              type="button"
              onClick={() => onToggleIndicator(ind.id)}
              className={itemClass(checked)}
            >
              <ind.icon />
              <span className="flex-1 text-left">{ind.label}</span>
              {checked && <Check size={12} strokeWidth={2.2} />}
            </button>
          );
        })}
      </Section>
    </div>
  );
}
