"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { CHART_TYPES, ChartTypeId } from "@/components/chart/chartTypes";
import { DRAWING_TOOLS, DrawingToolId } from "@/components/chart/drawingTools";
import { INDICATORS } from "@/components/chart/indicators";

const SUBMENU_WIDTH = 192; // w-48

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

type SubmenuId = "chartType" | "drawing" | "indicators";

const itemClass = (active: boolean) =>
  `flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
    active ? "bg-violet-500/20 text-fg" : "text-muted hover:bg-violet-500/10 hover:text-fg"
  }`;

/** Hover-opens a flyout panel to the side of the row. `flip` is decided once
 * up front by the parent menu (from its own clamped screen position), so the
 * chevron/panel side is correct on the very first hover — no post-render
 * measure-and-correct flash. */
function SubmenuRow({
  id,
  label,
  icon,
  openSub,
  setOpenSub,
  flip,
  children,
}: {
  id: SubmenuId;
  label: string;
  icon?: React.ReactNode;
  openSub: SubmenuId | null;
  setOpenSub: (id: SubmenuId | null) => void;
  flip: boolean;
  children: React.ReactNode;
}) {
  const open = openSub === id;

  return (
    <div className="relative" onMouseEnter={() => setOpenSub(id)}>
      <button type="button" className={itemClass(open)}>
        {flip && <ChevronLeft size={12} strokeWidth={2.2} className="opacity-70" />}
        {icon}
        <span className="flex-1 text-left">{label}</span>
        {!flip && <ChevronRight size={12} strokeWidth={2.2} className="opacity-70" />}
      </button>
      {open && (
        <div
          onClick={() => setOpenSub(id)}
          className={`absolute -top-1.5 z-10 w-48 rounded-md border border-border bg-panel py-1 shadow-lg ${
            flip ? "right-full" : "left-full"
          }`}
        >
          {children}
        </div>
      )}
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
  const [submenuFlip, setSubmenuFlip] = useState(false);
  const [openSub, setOpenSub] = useState<SubmenuId | null>(null);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const clampedX = Math.min(x, window.innerWidth - rect.width - 8);
    const clampedY = Math.min(y, window.innerHeight - rect.height - 8);
    setPos({ x: Math.max(8, clampedX), y: Math.max(8, clampedY) });
    setSubmenuFlip(clampedX + rect.width + SUBMENU_WIDTH + 8 > window.innerWidth);
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

  const activeChartType = CHART_TYPES.find((t) => t.id === chartTypeId);
  const activeDrawingTool = DRAWING_TOOLS.find((t) => t.id === drawingMode);
  const activeIndicatorCount = activeIndicators.size;

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

      <SubmenuRow
        id="chartType"
        label={activeChartType ? `Chart Type: ${activeChartType.label}` : "Chart Type"}
        icon={activeChartType && <activeChartType.icon />}
        openSub={openSub}
        setOpenSub={setOpenSub}
        flip={submenuFlip}
      >
        {CHART_TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChartTypeChange(t.id)}
            className={itemClass(t.id === chartTypeId)}
          >
            <t.icon />
            {t.label}
          </button>
        ))}
      </SubmenuRow>

      <SubmenuRow
        id="drawing"
        label={drawingMode === "crosshair" ? "Drawing Tool" : `Drawing Tool: ${activeDrawingTool?.label ?? ""}`}
        icon={activeDrawingTool && <activeDrawingTool.icon />}
        openSub={openSub}
        setOpenSub={setOpenSub}
        flip={submenuFlip}
      >
        <button
          type="button"
          onClick={() => onDrawingModeChange("crosshair")}
          className={itemClass(drawingMode === "crosshair")}
        >
          Cursor
        </button>
        {DRAWING_TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onDrawingModeChange(t.id)}
            className={itemClass(t.id === drawingMode)}
          >
            <t.icon />
            {t.label}
          </button>
        ))}
      </SubmenuRow>

      <SubmenuRow
        id="indicators"
        label={activeIndicatorCount > 0 ? `Indicators (${activeIndicatorCount})` : "Indicators"}
        openSub={openSub}
        setOpenSub={setOpenSub}
        flip={submenuFlip}
      >
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
      </SubmenuRow>
    </div>
  );
}
