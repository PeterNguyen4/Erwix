"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickData,
  ColorType,
  IChartApi,
  ISeriesApi,
  SeriesMarker,
  Time,
  UTCTimestamp,
  createChart,
} from "lightweight-charts";
import type { Candle, ChartAnnotation, ZoomRange } from "@/lib/api";

const COMPANY_NAMES: Record<string, string> = {
  AAPL: "Apple Inc.",
  MSFT: "Microsoft Corp.",
  GOOGL: "Alphabet Inc.",
  TSLA: "Tesla Inc.",
  AMZN: "Amazon.com Inc.",
  NVDA: "NVIDIA Corp.",
  META: "Meta Platforms",
  NFLX: "Netflix Inc.",
  AMD: "Advanced Micro Devices",
  SPY: "SPDR S&P 500 ETF",
  QQQ: "Invesco QQQ Trust",
};

interface ChartProps {
  candles: Candle[];
  liveCandle?: Candle | null;
  annotations?: ChartAnnotation[];
  symbol?: string;
  visibleRange?: ZoomRange | null;
}

interface HoveredCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  prevClose?: number;
}

interface DrawingState {
  isDrawing: boolean;
  points: Array<{ x: number; y: number }>;
  mode: "crosshair" | "line" | null;
  completedLines: Array<Array<{ x: number; y: number }>>;
}

function toSeriesData(c: Candle): CandlestickData {
  return {
    time: c.time as UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  };
}

function toMarker(a: ChartAnnotation, snappedTime: UTCTimestamp): SeriesMarker<Time> {
  const isArrowUp = a.type === "arrow";
  return {
    time: snappedTime,
    position: a.type === "circle" ? "inBar" : "aboveBar",
    color: a.color ?? "#3b82f6",
    shape: isArrowUp ? "arrowUp" : "circle",
    text: a.label ?? "",
  };
}

// Snap to the candle whose time is closest to the agent's annotation time.
function nearestCandleTime(candles: Candle[], time: number): UTCTimestamp | null {
  if (candles.length === 0) return null;
  let closest = candles[0];
  let bestDiff = Math.abs(candles[0].time - time);
  for (const c of candles) {
    const diff = Math.abs(c.time - time);
    if (diff < bestDiff) {
      closest = c;
      bestDiff = diff;
    }
  }
  return closest.time as UTCTimestamp;
}

function computeSMA(candles: Candle[], period: number) {
  return candles
    .map((c, i) => {
      if (i < period - 1) return null;
      const slice = candles.slice(i - period + 1, i + 1);
      const avg = slice.reduce((sum, x) => sum + x.close, 0) / period;
      return { time: c.time as UTCTimestamp, value: avg };
    })
    .filter(Boolean) as { time: UTCTimestamp; value: number }[];
}

// --- Toolbar icons ---
function IconCursor() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path d="M3 2L15 9L9.5 10.5L7 16L3 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function IconLine() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <line x1="3" y1="15" x2="15" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="3" cy="15" r="1.5" fill="currentColor" />
      <circle cx="15" cy="3" r="1.5" fill="currentColor" />
    </svg>
  );
}

function IconSMA() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path d="M2 13 Q5 5 9 9 Q13 13 16 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function IconDelete() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <polyline points="3,5 15,5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M7 5V3h4v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="4" y="5" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <line x1="7" y1="8" x2="7" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="11" y1="8" x2="11" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function Chart({ candles, liveCandle, annotations = [], symbol = "", visibleRange = null }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const indicatorSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const annotationLinesRef = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>[]>([]);
  const [chartReady, setChartReady] = useState(false);
  const [drawingState, setDrawingState] = useState<DrawingState>({
    isDrawing: false,
    points: [],
    mode: "crosshair",
    completedLines: [],
  });
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [crosshairData, setCrosshairData] = useState<{ time: number | null; price: number | null }>({ time: null, price: null });
  const [indicators, setIndicators] = useState<"sma20" | null>(null);
  const [hoveredCandle, setHoveredCandle] = useState<HoveredCandle | null>(null);

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0b0e14" },
        textColor: "#7d8799",
      },
      grid: {
        vertLines: { color: "#1e2633" },
        horzLines: { color: "#1e2633" },
      },
      crosshair: {
        vertLine: { visible: false },
        horzLine: { visible: false },
      },
      timeScale: { borderColor: "#1e2633", timeVisible: true },
      rightPriceScale: { borderColor: "#1e2633" },
      watermark: { visible: false },
      autoSize: true,
    });
    const series = chart.addCandlestickSeries({
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });
    const priceLine = chart.addLineSeries({
      color: "#f0ad4e",
      lineWidth: 2,
      title: "SMA",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chartRef.current = chart;
    seriesRef.current = series;
    indicatorSeriesRef.current = priceLine;
    setChartReady(true);

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      indicatorSeriesRef.current = null;
      setChartReady(false);
    };
  }, []);

  // Load historical candles
  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.setData(candles.map(toSeriesData));
    const total = candles.length;
    if (total > 0) {
      chartRef.current?.timeScale().setVisibleLogicalRange({ from: total - 100, to: total + 2 });
    }
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    if (last) setHoveredCandle({ open: last.open, high: last.high, low: last.low, close: last.close, prevClose: prev?.close });
  }, [candles, chartReady]);

  // Apply live updates.
  useEffect(() => {
    if (!seriesRef.current || !liveCandle) return;
    seriesRef.current.update(toSeriesData(liveCandle));
  }, [liveCandle]);

  // Draw annotation overlays
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const markers = annotations
      .filter((a) => a.type !== "line")
      .map((a) => {
        const snapped = nearestCandleTime(candles, a.time);
        return snapped === null ? null : toMarker(a, snapped);
      })
      .filter((m): m is SeriesMarker<Time> => m !== null)
      .sort((a, b) => (a.time as number) - (b.time as number));
    series.setMarkers(markers);

    for (const line of annotationLinesRef.current) series.removePriceLine(line);
    annotationLinesRef.current = annotations
      .filter((a) => a.type === "line")
      .map((a) =>
        series.createPriceLine({
          price: a.price,
          color: a.color ?? "#3b82f6",
          lineWidth: 2,
          lineStyle: 2, // dashed
          axisLabelVisible: true,
          title: a.label ?? "",
        }),
      );
  }, [annotations, candles]);

  // Zoom/pan the visible time range when the agent calls zoom_to_range.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !visibleRange) return;
    chart.timeScale().setVisibleRange({
      from: visibleRange.from as UTCTimestamp,
      to: visibleRange.to as UTCTimestamp,
    });
  }, [visibleRange]);

  // Compute SMA.
  useEffect(() => {
    const indSeries = indicatorSeriesRef.current;
    if (!indSeries) return;
    if (!indicators) {
      indSeries.setData([]);
      return;
    }
    indSeries.setData(computeSMA(candles, 20));
  }, [indicators, candles, chartReady]);

  // Sync canvas buffer size with container.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const sync = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Draw crosshair and drawing overlays.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (mousePos) {
      ctx.strokeStyle = "#7d8799";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(mousePos.x, 0);
      ctx.lineTo(mousePos.x, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, mousePos.y);
      ctx.lineTo(canvas.width, mousePos.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // X-axis time label at bottom.
      if (crosshairData.time !== null) {
        const d = new Date(crosshairData.time * 1000);
        const timeLabel = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
        ctx.font = "11px monospace";
        const tw = ctx.measureText(timeLabel).width;
        const px = 6, py = 3;
        const bx = mousePos.x - tw / 2 - px;
        const by = canvas.height - 20;
        ctx.fillStyle = "#3b82f6";
        ctx.beginPath();
        ctx.roundRect(bx, by, tw + px * 2, 16 + py, 3);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.textBaseline = "middle";
        ctx.fillText(timeLabel, bx + px, by + 8 + py / 2);
      }

      // Y-axis price label at right edge.
      if (crosshairData.price !== null) {
        const priceLabel = crosshairData.price.toFixed(2);
        ctx.font = "11px monospace";
        const tw = ctx.measureText(priceLabel).width;
        const px = 6, py = 3;
        const bw = tw + px * 2;
        const bx = canvas.width - bw - 2;
        const by = mousePos.y - 8 - py / 2;
        ctx.fillStyle = "#3b82f6";
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, 16 + py, 3);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.textBaseline = "middle";
        ctx.fillText(priceLabel, bx + px, by + 8 + py / 2);
      }

      // Preview line while placing second point.
      if (drawingState.mode === "line" && drawingState.points.length > 0) {
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(drawingState.points[0].x, drawingState.points[0].y);
        ctx.lineTo(mousePos.x, mousePos.y);
        ctx.stroke();
      }
    }

    // Completed lines.
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    for (const line of drawingState.completedLines) {
      if (line.length === 2) {
        ctx.beginPath();
        ctx.moveTo(line[0].x, line[0].y);
        ctx.lineTo(line[1].x, line[1].y);
        ctx.stroke();
      }
    }

    // Point markers.
    ctx.fillStyle = "#3b82f6";
    for (const point of drawingState.points) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
      ctx.fill();
    }
    for (const line of drawingState.completedLines) {
      for (const point of line) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  }, [mousePos, drawingState, crosshairData]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });

    const chart = chartRef.current;
    if (chart && candles.length > 0) {
      const logical = chart.timeScale().coordinateToLogical(x);
      if (logical !== null) {
        const idx = Math.round(logical);
        const clampedIdx = Math.max(0, Math.min(idx, candles.length - 1));
        const candle = candles[clampedIdx];
        if (candle) {
          const prev = candles[clampedIdx - 1];
          setHoveredCandle({ open: candle.open, high: candle.high, low: candle.low, close: candle.close, prevClose: prev?.close });
        }
      }
      const time = chart.timeScale().coordinateToTime(x);
      const price = seriesRef.current?.coordinateToPrice(y) ?? null;
      setCrosshairData({ time: time as number | null, price });
    }
  };

  const handleMouseLeave = () => {
    setMousePos(null);
    setCrosshairData({ time: null, price: null });
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    if (last) setHoveredCandle({ open: last.open, high: last.high, low: last.low, close: last.close, prevClose: prev?.close });
  };

  const handleMouseClick = () => {
    if (drawingState.mode === "line" && mousePos) {
      if (drawingState.points.length === 0) {
        setDrawingState({ ...drawingState, points: [mousePos] });
      } else {
        setDrawingState({
          ...drawingState,
          mode: "crosshair",
          points: [],
          completedLines: [...drawingState.completedLines, [drawingState.points[0], mousePos]],
        });
      }
    }
  };

  const setMode = (mode: "crosshair" | "line") => {
    setDrawingState({ ...drawingState, points: [], mode });
  };

  const clearDrawings = () => {
    setDrawingState({ isDrawing: false, points: [], mode: drawingState.mode, completedLines: [] });
  };

  const toolBtn = (active: boolean) =>
    `flex items-center justify-center gap-1.5 px-2.5 h-7 rounded text-xs transition-colors ${
      active ? "bg-accent text-white" : "text-muted hover:bg-accent/20 hover:text-white"
    }`;

  // Change / % change from previous candle close.
  const changeDisplay = (() => {
    if (!hoveredCandle || hoveredCandle.prevClose == null) return null;
    const change = hoveredCandle.close - hoveredCandle.prevClose;
    const pct = (change / hoveredCandle.prevClose) * 100;
    const up = change >= 0;
    return { change, pct, up };
  })();

  return (
    <div className="relative flex flex-col h-full w-full">
      {/* Horizontal toolbar */}
      <div className="flex items-center gap-1 border-b border-border bg-panel px-2 py-1 z-20 shrink-0">
        {/* OHLC info */}
        <div className="flex items-baseline gap-2 mr-3 select-none pointer-events-none">
          {symbol && (
            <>
              <span className="text-sm font-bold text-white">{symbol}</span>
              {COMPANY_NAMES[symbol] && (
                <span className="text-xs text-muted">{COMPANY_NAMES[symbol]}</span>
              )}
            </>
          )}
          {hoveredCandle && (() => {
            const bull = hoveredCandle.close >= hoveredCandle.open;
            const valueColor = bull ? "text-up" : "text-down";
            const fmt = (v: number) => v.toFixed(2);
            return (
              <span className="flex gap-2 text-xs font-mono">
                <span className="text-white">O <span className={valueColor}>{fmt(hoveredCandle.open)}</span></span>
                <span className="text-white">H <span className={valueColor}>{fmt(hoveredCandle.high)}</span></span>
                <span className="text-white">L <span className={valueColor}>{fmt(hoveredCandle.low)}</span></span>
                <span className="text-white">C <span className={valueColor}>{fmt(hoveredCandle.close)}</span></span>
                {changeDisplay && (
                  <span className={changeDisplay.up ? "text-up" : "text-down"}>
                    {changeDisplay.up ? "+" : ""}{changeDisplay.change.toFixed(2)} ({changeDisplay.up ? "+" : ""}{changeDisplay.pct.toFixed(2)}%)
                  </span>
                )}
              </span>
            );
          })()}
        </div>

        {/* Divider */}
        <div className="h-5 w-px bg-border mx-1" />

        {/* Drawing tools */}
        <button title="Cursor" onClick={() => setMode("crosshair")} className={toolBtn(drawingState.mode === "crosshair")}>
          <IconCursor />
          <span>Cursor</span>
        </button>
        <button title="Trend Line" onClick={() => setMode("line")} className={toolBtn(drawingState.mode === "line")}>
          <IconLine />
          <span>Line</span>
        </button>

        {/* Divider */}
        <div className="h-5 w-px bg-border mx-1" />

        {/* Indicators */}
        <button title="SMA 20" onClick={() => setIndicators(indicators ? null : "sma20")} className={toolBtn(!!indicators)}>
          <IconSMA />
          <span>SMA 20</span>
        </button>

        {/* Divider */}
        <div className="h-5 w-px bg-border mx-1" />

        {/* Clear drawings */}
        <button
          title="Clear all drawings"
          onClick={clearDrawings}
          className="flex items-center justify-center gap-1.5 px-2.5 h-7 rounded text-xs transition-colors text-muted hover:bg-red-500/20 hover:text-red-400"
        >
          <IconDelete />
          <span>Delete</span>
        </button>
      </div>

      {/* Chart area */}
      <div className="relative flex-1">
        <div ref={containerRef} className="h-full w-full [&_a]:hidden" />
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleMouseClick}
          className="absolute inset-0"
          style={{
            zIndex: 10,
            cursor: drawingState.mode === "line" ? "crosshair" : "default",
          }}
        />
      </div>
    </div>
  );
}
