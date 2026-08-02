"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ColorType,
  IChartApi,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  LineSeries,
  SeriesMarker,
  SeriesType,
  Time,
  UTCTimestamp,
  createChart,
  createSeriesMarkers,
} from "lightweight-charts";
import { MousePointer2, Trash2 } from "lucide-react";
import type { Candle, ChartAnnotation, ZoomRange } from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";
import { CHART_PALETTES, TP_COLOR, SL_COLOR } from "@/lib/chartTheme";
import ToolbarButton from "@/components/chart/ToolbarButton";
import ChartTypeMenu from "@/components/chart/ChartTypeMenu";
import DrawingMenu from "@/components/chart/DrawingMenu";
import IndicatorsMenu from "@/components/chart/IndicatorsMenu";
import ChartContextMenu from "@/components/chart/ChartContextMenu";
import { CHART_TYPES, ChartTypeId } from "@/components/chart/chartTypes";
import { DRAWING_TOOLS, DrawingToolId } from "@/components/chart/drawingTools";
import { INDICATORS } from "@/components/chart/indicators";

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

export interface BracketLevels {
  entryPrice: number;
  takeProfitPrice?: number | null;
  stopLossPrice?: number | null;
  /** Unix seconds when the bracket was set up — lines are drawn from here forward, not from "now". */
  entryTime: number;
}

interface ChartProps {
  candles: Candle[];
  liveCandle?: Candle | null;
  annotations?: ChartAnnotation[];
  symbol?: string;
  visibleRange?: ZoomRange | null;
  bracket?: BracketLevels | null;
  onBracketDrag?: (which: "tp" | "sl", price: number) => void;
  cursorIndex?: number | null;
  onQuickOrder?: (side: "buy" | "sell") => void;
  infoOverlay?: boolean;
}

interface HoveredCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  prevClose?: number;
}

function formatVolume(v: number): string {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(2)}K`;
  return `${v}`;
}

interface DrawingState {
  isDrawing: boolean;
  points: Array<{ x: number; y: number }>;
  mode: "crosshair" | "line" | "fib" | null;
  completedLines: Array<Array<{ x: number; y: number }>>;
}

interface FibDrawing {
  time1: number;
  price1: number;
  time2: number;
  price2: number;
}

const FIB_LEVELS: { ratio: number; color: string }[] = [
  { ratio: 0, color: "#787b86" },
  { ratio: 0.236, color: "#f23645" },
  { ratio: 0.382, color: "#ff9800" },
  { ratio: 0.5, color: "#4caf50" },
  { ratio: 0.618, color: "#00bcd4" },
  { ratio: 0.786, color: "#3f51b5" },
  { ratio: 1, color: "#9c27b0" },
];

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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

// --- Toolbar icons ---
function IconCursor() {
  return <MousePointer2 size={16} strokeWidth={2} />;
}

function IconDelete() {
  return <Trash2 size={16} strokeWidth={2} />;
}

export default function Chart({
  candles: allCandles,
  liveCandle,
  annotations = [],
  symbol = "",
  visibleRange = null,
  bracket = null,
  onBracketDrag,
  cursorIndex = null,
  onQuickOrder,
  infoOverlay = false,
}: ChartProps) {
  const candles = useMemo(
    () => (cursorIndex == null ? allCandles : allCandles.slice(0, cursorIndex + 1)),
    [allCandles, cursorIndex],
  );
  const { theme } = useTheme();
  const palette = CHART_PALETTES[theme];
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const indicatorSeriesMapRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const annotationLinesRef = useRef<ReturnType<ISeriesApi<"Line">["createPriceLine"]>[]>([]);
  const bracketLinesRef = useRef<ReturnType<ISeriesApi<"Line">["createPriceLine"]>[]>([]);
  const oscillatorSeriesMapRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const [chartReady, setChartReady] = useState(false);
  const [chartTypeId, setChartTypeId] = useState<ChartTypeId>("candle");
  const [drawingState, setDrawingState] = useState<DrawingState>({
    isDrawing: false,
    points: [],
    mode: "crosshair",
    completedLines: [],
  });
  const [fibDrawings, setFibDrawings] = useState<FibDrawing[]>([]);
  const [fibPreviewStart, setFibPreviewStart] = useState<{ time: number; price: number } | null>(null);
  const [draggingFibHandle, setDraggingFibHandle] = useState<{ index: number; handle: "start" | "end" } | null>(null);
  const [draggingBracketHandle, setDraggingBracketHandle] = useState<"tp" | "sl" | null>(null);
  const [hoveredBracketHandle, setHoveredBracketHandle] = useState<"tp" | "sl" | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [crosshairData, setCrosshairData] = useState<{ time: number | null; price: number | null }>({ time: null, price: null });
  const [activeIndicators, setActiveIndicators] = useState<Set<string>>(new Set());
  const [pinnedIndicators, setPinnedIndicators] = useState<Set<string>>(new Set());
  const [pinnedDrawingTools, setPinnedDrawingTools] = useState<Set<DrawingToolId>>(new Set());
  const [pinnedChartTypes, setPinnedChartTypes] = useState<Set<ChartTypeId>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [redrawTick, setRedrawTick] = useState(0);
  const [hoveredCandle, setHoveredCandle] = useState<HoveredCandle | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isNarrow, setIsNarrow] = useState(false);

  const NARROW_BREAKPOINT = 700;
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setIsNarrow(entry.contentRect.width < NARROW_BREAKPOINT);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const showInfoOverlay = infoOverlay || isNarrow;

  const togglePinnedIndicator = (id: string) => {
    setPinnedIndicators((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePinnedDrawingTool = (id: DrawingToolId) => {
    setPinnedDrawingTools((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePinnedChartType = (id: ChartTypeId) => {
    setPinnedChartTypes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleIndicator = (id: string) => {
    setActiveIndicators((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const activeOscillatorIds = useMemo(
    () => [...activeIndicators].filter((id) => INDICATORS.find((i) => i.id === id)?.kind === "oscillator"),
    [activeIndicators],
  );

  // Fixed to bracket.entryTime (when the bracket was set up) so the start of
  // the lines/zones doesn't drift forward as new candles arrive.
  const getBracketStartX = () => {
    const chart = chartRef.current;
    if (!chart || !bracket) return null;
    return chart.timeScale().timeToCoordinate(bracket.entryTime as UTCTimestamp);
  };

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: palette.bg },
        textColor: palette.muted,
      },
      grid: {
        vertLines: { color: palette.border },
        horzLines: { color: palette.border },
      },
      crosshair: {
        vertLine: { visible: false, labelVisible: false },
        horzLine: { visible: false, labelVisible: false },
      },
      timeScale: { borderColor: palette.border, timeVisible: true },
      // Fixed so the main pane and the oscillator sub-pane (which can show
      // very different label widths — RSI's "0"-"100" vs MACD's decimals)
      // always reserve the same axis width and stay pixel-aligned.
      rightPriceScale: { borderColor: palette.border, minimumWidth: 68 },
      autoSize: true,
    });
    const series = CHART_TYPES[0].createSeries(chart);
    chartRef.current = chart;
    seriesRef.current = series;
    setChartReady(true);

    // Bracket-zone/FVG/Fib shading (drawn on the overlay canvas) depends on
    // price->y and time->x coordinates, which shift on pan/zoom/autoscale —
    // bump a tick so the draw effect re-runs even without its own deps changing.
    const bumpRedraw = () => setRedrawTick((t) => t + 1);
    chart.timeScale().subscribeVisibleTimeRangeChange(bumpRedraw);

    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(bumpRedraw);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      indicatorSeriesMapRef.current.clear();
      setChartReady(false);
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: palette.bg },
        textColor: palette.muted,
      },
      grid: {
        vertLines: { color: palette.border },
        horzLines: { color: palette.border },
      },
      timeScale: { borderColor: palette.border },
      rightPriceScale: { borderColor: palette.border },
    });
  }, [palette, chartReady]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;
    if (seriesRef.current) chart.removeSeries(seriesRef.current);
    const def = CHART_TYPES.find((t) => t.id === chartTypeId) ?? CHART_TYPES[0];
    seriesRef.current = def.createSeries(chart);
    seriesRef.current.setData(def.toData(candles) as never[]);
  }, [chartTypeId, chartReady]);

  // Lock chart while setting line or fibonacci retracement
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;
    const suspend =
      drawingState.mode === "fib" ||
      drawingState.mode === "line" ||
      draggingFibHandle !== null ||
      draggingBracketHandle !== null;
    chart.applyOptions({ handleScroll: !suspend, handleScale: !suspend });
  }, [drawingState.mode, draggingFibHandle, draggingBracketHandle, chartReady]);

  // Load historical candles
  useEffect(() => {
    if (!seriesRef.current) return;
    const def = CHART_TYPES.find((t) => t.id === chartTypeId) ?? CHART_TYPES[0];
    seriesRef.current.setData(def.toData(candles) as never[]);
    const total = candles.length;
    if (total > 0) {
      chartRef.current?.timeScale().setVisibleLogicalRange({ from: total - 100, to: total + 2 });
    }
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    if (last) setHoveredCandle({ open: last.open, high: last.high, low: last.low, close: last.close, volume: last.volume, prevClose: prev?.close });
  }, [candles, chartReady, chartTypeId]);

  // Apply live updates. Heikin-Ashi recomputes fully (its candles depend on
  // the running average of prior ones, so there's no cheap incremental form).
  useEffect(() => {
    if (!seriesRef.current || !liveCandle) return;
    if (chartTypeId === "heikinashi") {
      const def = CHART_TYPES.find((t) => t.id === "heikinashi")!;
      seriesRef.current.setData(def.toData([...candles, liveCandle]) as never[]);
    } else if (chartTypeId === "line" || chartTypeId === "area") {
      seriesRef.current.update({ time: liveCandle.time as UTCTimestamp, value: liveCandle.close } as never);
    } else {
      seriesRef.current.update({
        time: liveCandle.time as UTCTimestamp,
        open: liveCandle.open,
        high: liveCandle.high,
        low: liveCandle.low,
        close: liveCandle.close,
      } as never);
    }
  }, [liveCandle, chartTypeId]);

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
    if (!markersPluginRef.current) markersPluginRef.current = createSeriesMarkers(series, markers);
    else markersPluginRef.current.setMarkers(markers);

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

  // Sync overlay indicator series (drawn on the main price pane) with the
  // active set — add a line series the first time an indicator is toggled
  // on, remove it when toggled off, and recompute whenever candles change.
  // New overlay indicators only need an entry in the INDICATORS registry
  // (components/chart/indicators.tsx); no changes needed here.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;
    const map = indicatorSeriesMapRef.current;
    const activeKeys = new Set<string>();

    for (const id of activeIndicators) {
      const def = INDICATORS.find((i) => i.id === id);
      if (!def || def.kind !== "overlay" || !def.lines) continue;
      for (const line of def.lines) {
        const key = `${id}:${line.key}`;
        activeKeys.add(key);
        let series = map.get(key);
        if (!series) {
          series = chart.addSeries(LineSeries, {
            color: line.color,
            lineWidth: 2,
            title: def.label,
            lastValueVisible: false,
            priceLineVisible: false,
          });
          map.set(key, series);
        }
        series.setData(line.compute(candles));
      }
    }
    for (const [key, series] of map) {
      if (!activeKeys.has(key)) {
        chart.removeSeries(series);
        map.delete(key);
      }
    }
  }, [activeIndicators, candles, chartReady]);

  // Sync main pane with oscillators
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;
    const map = oscillatorSeriesMapRef.current;
    const activeKeys = new Set<string>();

    for (const id of activeOscillatorIds) {
      const def = INDICATORS.find((i) => i.id === id);
      if (!def?.lines) continue;
      for (const line of def.lines) {
        const key = `${id}:${line.key}`;
        activeKeys.add(key);
        let series = map.get(key);
        if (!series) {
          series = chart.addSeries(
            LineSeries,
            {
              color: line.color,
              lineWidth: 2,
              title: `${def.label} ${line.key}`,
              lastValueVisible: false,
              priceLineVisible: false,
            },
            1,
          );
          map.set(key, series);
        }
        series.setData(line.compute(candles));
      }
    }
    for (const [key, series] of map) {
      if (!activeKeys.has(key)) {
        chart.removeSeries(series);
        map.delete(key);
      }
    }

    const pane = chart.panes()[1];
    if (pane) pane.setHeight(activeKeys.size > 0 ? 130 : 0);
  }, [activeOscillatorIds, candles, chartReady]);

  // Entry/take-profit/stop-loss price lines for a bracket order or open trade.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    for (const line of bracketLinesRef.current) series.removePriceLine(line);
    bracketLinesRef.current = [];
    if (!bracket) return;

    bracketLinesRef.current.push(
      series.createPriceLine({
        price: bracket.entryPrice,
        color: palette.fg,
        lineWidth: 2,
        lineStyle: 0, // solid
        lineVisible: false,
        axisLabelVisible: true,
        title: "Entry",
      }),
    );
    if (bracket.takeProfitPrice != null) {
      bracketLinesRef.current.push(
        series.createPriceLine({
          price: bracket.takeProfitPrice,
          color: TP_COLOR,
          lineWidth: 2,
          lineStyle: 2, // dashed
          lineVisible: false,
          axisLabelVisible: true,
          title: "TP",
        }),
      );
    }
    if (bracket.stopLossPrice != null) {
      bracketLinesRef.current.push(
        series.createPriceLine({
          price: bracket.stopLossPrice,
          color: SL_COLOR,
          lineWidth: 2,
          lineStyle: 2, // dashed
          lineVisible: false,
          axisLabelVisible: true,
          title: "SL",
        }),
      );
    }
  }, [bracket, chartReady, palette]);

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

    // Bracket TP/SL zones — shaded bands between the entry price and each
    // level, so the risk/reward is visible at a glance. Clipped to start at
    // bracket.entryTime's x-coordinate instead of the left edge of the chart.
    if (bracket && chartRef.current && seriesRef.current) {
      const series = seriesRef.current;
      const nowX = getBracketStartX();
      if (nowX != null) {
        const startX = Math.max(0, Math.min(nowX, canvas.width));
        const zoneWidth = canvas.width - startX;
        const entryY = series.priceToCoordinate(bracket.entryPrice);
        if (entryY != null && zoneWidth > 0) {
          if (bracket.takeProfitPrice != null) {
            const tpY = series.priceToCoordinate(bracket.takeProfitPrice);
            if (tpY != null) {
              ctx.fillStyle = hexToRgba(TP_COLOR, 0.12);
              ctx.fillRect(startX, Math.min(entryY, tpY), zoneWidth, Math.abs(entryY - tpY));
            }
          }
          if (bracket.stopLossPrice != null) {
            const slY = series.priceToCoordinate(bracket.stopLossPrice);
            if (slY != null) {
              ctx.fillStyle = hexToRgba(SL_COLOR, 0.12);
              ctx.fillRect(startX, Math.min(entryY, slY), zoneWidth, Math.abs(entryY - slY));
            }
          }
        }

        // Hand-drawn level lines (the price lines above only supply the
        // axis label), each starting at startX and running to the right edge.
        const drawLevelLine = (levelY: number | null, color: string, dashed: boolean) => {
          if (levelY == null) return;
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.setLineDash(dashed ? [6, 4] : []);
          ctx.beginPath();
          ctx.moveTo(startX, levelY);
          ctx.lineTo(canvas.width, levelY);
          ctx.stroke();
          ctx.setLineDash([]);
        };
        drawLevelLine(entryY, palette.fg, false);
        if (bracket.takeProfitPrice != null) drawLevelLine(series.priceToCoordinate(bracket.takeProfitPrice), TP_COLOR, true);
        if (bracket.stopLossPrice != null) drawLevelLine(series.priceToCoordinate(bracket.stopLossPrice), SL_COLOR, true);
      }
    }

    // Tooltip showing the live price while dragging a TP/SL handle.
    if (draggingBracketHandle && bracket && mousePos) {
      const price =
        draggingBracketHandle === "tp" ? bracket.takeProfitPrice : bracket.stopLossPrice;
      if (price != null) {
        const label = `${draggingBracketHandle === "tp" ? "TP" : "SL"} ${price.toFixed(2)}`;
        ctx.font = "12px monospace";
        const padding = 6;
        const textWidth = ctx.measureText(label).width;
        const boxW = textWidth + padding * 2;
        const boxH = 20;
        const boxX = Math.min(mousePos.x + 10, canvas.width - boxW - 4);
        const boxY = mousePos.y - boxH / 2;
        ctx.fillStyle = draggingBracketHandle === "tp" ? TP_COLOR : SL_COLOR;
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.fillStyle = "#0b0e14";
        ctx.textBaseline = "middle";
        ctx.fillText(label, boxX + padding, boxY + boxH / 2 + 1);
        ctx.textBaseline = "alphabetic";
      }
    }

    // Zone indicators (e.g. Fair Value Gap) — shaded boxes from time/price
    // ranges computed by the indicator registry.
    if (chartRef.current && seriesRef.current) {
      const chart = chartRef.current;
      const mainSeries = seriesRef.current;
      for (const id of activeIndicators) {
        const def = INDICATORS.find((i) => i.id === id);
        if (!def || def.kind !== "zone" || !def.computeZones) continue;
        for (const zone of def.computeZones(candles)) {
          const x1 = chart.timeScale().timeToCoordinate(zone.startTime);
          const x2 = chart.timeScale().timeToCoordinate(zone.endTime);
          const yTop = mainSeries.priceToCoordinate(zone.top);
          const yBottom = mainSeries.priceToCoordinate(zone.bottom);
          if (x1 == null || x2 == null || yTop == null || yBottom == null) continue;
          ctx.fillStyle = zone.color;
          ctx.fillRect(Math.min(x1, x2), Math.min(yTop, yBottom), Math.abs(x2 - x1), Math.abs(yBottom - yTop));
        }
      }
    }

    // Fibonacci retracement drawings
    if (chartRef.current && seriesRef.current) {
      const chart = chartRef.current;
      const mainSeries = seriesRef.current;

      const drawFib = (fib: FibDrawing, preview: boolean, handles: boolean) => {
        const x1 = chart.timeScale().timeToCoordinate(fib.time1 as UTCTimestamp);
        const x2 = chart.timeScale().timeToCoordinate(fib.time2 as UTCTimestamp);
        const y1 = mainSeries.priceToCoordinate(fib.price1);
        const y2 = mainSeries.priceToCoordinate(fib.price2);
        if (x1 == null || x2 == null || y1 == null || y2 == null) return;
        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);

        const levelYs = FIB_LEVELS.map((level) => ({
          level,
          y: mainSeries.priceToCoordinate(fib.price1 + (fib.price2 - fib.price1) * level.ratio),
        })).filter((l) => l.y != null) as { level: (typeof FIB_LEVELS)[number]; y: number }[];

        // Subtly tinted band between each consecutive pair of levels, in
        // that band's own level color.
        for (let i = 0; i < levelYs.length - 1; i++) {
          const a = levelYs[i];
          const b = levelYs[i + 1];
          ctx.fillStyle = hexToRgba(a.level.color, preview ? 0.06 : 0.1);
          ctx.fillRect(left, Math.min(a.y, b.y), right - left, Math.abs(b.y - a.y));
        }

        for (const { level, y } of levelYs) {
          ctx.strokeStyle = level.color;
          ctx.lineWidth = 1;
          ctx.setLineDash(preview ? [4, 3] : []);
          ctx.beginPath();
          // Level lines only span between the two anchor points
          ctx.moveTo(left, y);
          ctx.lineTo(right, y);
          ctx.stroke();
          const price = fib.price1 + (fib.price2 - fib.price1) * level.ratio;
          ctx.font = "10px monospace";
          ctx.fillStyle = level.color;
          ctx.fillText(`${(level.ratio * 100).toFixed(1)}% (${price.toFixed(2)})`, left + 4, y - 3);
        }
        ctx.setLineDash([]);

        if (handles) {
          for (const [hx, hy] of [
            [x1, y1],
            [x2, y2],
          ] as const) {
            ctx.beginPath();
            ctx.arc(hx, hy, 5, 0, 2 * Math.PI);
            ctx.fillStyle = palette.bg;
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#3b82f6";
            ctx.stroke();
          }
        }
      };

      fibDrawings.forEach((fib, index) => {
        const isDragging = draggingFibHandle?.index === index;
        drawFib(fib, isDragging, true);
      });

      if (fibPreviewStart && mousePos) {
        const time2 = chart.timeScale().coordinateToTime(mousePos.x) as number | null;
        const price2 = mainSeries.coordinateToPrice(mousePos.y);
        if (time2 != null && price2 != null) {
          drawFib({ time1: fibPreviewStart.time, price1: fibPreviewStart.price, time2, price2 }, true, false);
        }
      }
    }

    if (mousePos) {
      ctx.strokeStyle = palette.muted;
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
        ctx.fillStyle = "#8b5cf6";
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
        ctx.fillStyle = "#8b5cf6";
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, 16 + py, 3);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.textBaseline = "middle";
        ctx.fillText(priceLabel, bx + px, by + 8 + py / 2);
      }

      // Preview line while placing second point.
      if (drawingState.mode === "line" && drawingState.points.length > 0) {
        ctx.strokeStyle = "#8b5cf6";
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
  }, [mousePos, drawingState, crosshairData, bracket, redrawTick, activeIndicators, fibDrawings, fibPreviewStart, candles, draggingBracketHandle, palette]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });

    if (draggingBracketHandle) {
      const series = seriesRef.current;
      const price = series?.coordinateToPrice(y);
      if (price != null) onBracketDrag?.(draggingBracketHandle, price);
      return;
    }

    if (bracket && drawingState.mode === "crosshair") {
      const series = seriesRef.current;
      const startX = getBracketStartX();
      const onLine = startX != null && x >= startX;
      const tpY = onLine && bracket.takeProfitPrice != null ? series?.priceToCoordinate(bracket.takeProfitPrice) : null;
      const slY = onLine && bracket.stopLossPrice != null ? series?.priceToCoordinate(bracket.stopLossPrice) : null;
      if (tpY != null && Math.abs(y - tpY) <= HANDLE_LINE_TOLERANCE) setHoveredBracketHandle("tp");
      else if (slY != null && Math.abs(y - slY) <= HANDLE_LINE_TOLERANCE) setHoveredBracketHandle("sl");
      else setHoveredBracketHandle(null);
    }

    if (draggingFibHandle) {
      const chart = chartRef.current;
      const series = seriesRef.current;
      if (chart && series) {
        const time = chart.timeScale().coordinateToTime(x) as number | null;
        const price = series.coordinateToPrice(y);
        if (time != null && price != null) {
          setFibDrawings((prev) =>
            prev.map((fib, i) =>
              i !== draggingFibHandle.index
                ? fib
                : draggingFibHandle.handle === "start"
                  ? { ...fib, time1: time, price1: price }
                  : { ...fib, time2: time, price2: price },
            ),
          );
        }
      }
      return;
    }

    const chart = chartRef.current;
    if (chart && candles.length > 0) {
      const logical = chart.timeScale().coordinateToLogical(x);
      if (logical !== null) {
        const idx = Math.round(logical);
        const clampedIdx = Math.max(0, Math.min(idx, candles.length - 1));
        const candle = candles[clampedIdx];
        if (candle) {
          const prev = candles[clampedIdx - 1];
          setHoveredCandle({ open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume, prevClose: prev?.close });
        }
      }
      const time = chart.timeScale().coordinateToTime(x);
      const price = seriesRef.current?.coordinateToPrice(y) ?? null;
      setCrosshairData({ time: time as number | null, price });
    }
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleMouseLeave = () => {
    setMousePos(null);
    setCrosshairData({ time: null, price: null });
    setHoveredBracketHandle(null);
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    if (last) setHoveredCandle({ open: last.open, high: last.high, low: last.low, close: last.close, volume: last.volume, prevClose: prev?.close });
  };

  const handleMouseClick = () => {
    if (drawingState.mode !== "line" || !mousePos) return;
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
  };

  // Fib retracement is click-and-drag with 2 anchor points
  const HANDLE_HIT_RADIUS = 8;
  const HANDLE_LINE_TOLERANCE = 6; // px tolerance for hovering/grabbing a TP/SL price line

  const handleMouseDown = () => {
    if (!mousePos) return;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    if (drawingState.mode === "crosshair") {
      const bracketStartX = getBracketStartX();
      if (bracket && bracketStartX != null && mousePos.x >= bracketStartX) {
        if (bracket.takeProfitPrice != null) {
          const tpY = series.priceToCoordinate(bracket.takeProfitPrice);
          if (tpY != null && Math.abs(mousePos.y - tpY) <= HANDLE_LINE_TOLERANCE) {
            setDraggingBracketHandle("tp");
            return;
          }
        }
        if (bracket.stopLossPrice != null) {
          const slY = series.priceToCoordinate(bracket.stopLossPrice);
          if (slY != null && Math.abs(mousePos.y - slY) <= HANDLE_LINE_TOLERANCE) {
            setDraggingBracketHandle("sl");
            return;
          }
        }
      }
      for (let i = fibDrawings.length - 1; i >= 0; i--) {
        const fib = fibDrawings[i];
        const x1 = chart.timeScale().timeToCoordinate(fib.time1 as UTCTimestamp);
        const y1 = series.priceToCoordinate(fib.price1);
        const x2 = chart.timeScale().timeToCoordinate(fib.time2 as UTCTimestamp);
        const y2 = series.priceToCoordinate(fib.price2);
        if (x1 != null && y1 != null && Math.hypot(mousePos.x - x1, mousePos.y - y1) <= HANDLE_HIT_RADIUS) {
          setDraggingFibHandle({ index: i, handle: "start" });
          return;
        }
        if (x2 != null && y2 != null && Math.hypot(mousePos.x - x2, mousePos.y - y2) <= HANDLE_HIT_RADIUS) {
          setDraggingFibHandle({ index: i, handle: "end" });
          return;
        }
      }
      return;
    }

    if (drawingState.mode !== "fib") return;
    const time = chart.timeScale().coordinateToTime(mousePos.x) as number | null;
    const price = series.coordinateToPrice(mousePos.y);
    if (time == null || price == null) return;
    setFibPreviewStart({ time, price });
  };

  const handleMouseUp = () => {
    if (draggingBracketHandle) {
      setDraggingBracketHandle(null);
      return;
    }
    if (draggingFibHandle) {
      setDraggingFibHandle(null);
      return;
    }
    if (drawingState.mode !== "fib" || !fibPreviewStart || !mousePos) return;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (chart && series) {
      const time2 = chart.timeScale().coordinateToTime(mousePos.x) as number | null;
      const price2 = series.coordinateToPrice(mousePos.y);
      if (time2 != null && price2 != null && time2 !== fibPreviewStart.time) {
        setFibDrawings((prev) => [...prev, { time1: fibPreviewStart.time, price1: fibPreviewStart.price, time2, price2 }]);
      }
    }
    setFibPreviewStart(null);
    setDrawingState((prev) => ({ ...prev, mode: "crosshair", points: [] }));
  };

  const setMode = (mode: "crosshair" | "line" | "fib") => {
    setDrawingState({ ...drawingState, points: [], mode });
    setFibPreviewStart(null);
  };

  const clearDrawings = () => {
    setDrawingState({ isDrawing: false, points: [], mode: drawingState.mode, completedLines: [] });
    setFibDrawings([]);
    setFibPreviewStart(null);
  };


  // Change / % change from previous candle close.
  const changeDisplay = (() => {
    if (!hoveredCandle || hoveredCandle.prevClose == null) return null;
    const change = hoveredCandle.close - hoveredCandle.prevClose;
    const pct = (change / hoveredCandle.prevClose) * 100;
    const up = change >= 0;
    return { change, pct, up };
  })();

  const symbolBlock = symbol && (
    <div className="flex items-baseline gap-2 select-none pointer-events-none">
      <span className="text-sm font-bold text-fg">{symbol}</span>
      {COMPANY_NAMES[symbol] && (
        <span className="text-xs text-muted">{COMPANY_NAMES[symbol]}</span>
      )}
    </div>
  );

  const ohlcBlock = hoveredCandle && (() => {
    const bull = hoveredCandle.close >= hoveredCandle.open;
    const valueColor = bull ? "text-up" : "text-down";
    const fmt = (v: number) => v.toFixed(2);
    return (
      <span className="flex select-none gap-2 text-xs tabular-nums pointer-events-none">
        <span className="text-fg">O <span className={valueColor}>{fmt(hoveredCandle.open)}</span></span>
        <span className="text-fg">H <span className={valueColor}>{fmt(hoveredCandle.high)}</span></span>
        <span className="text-fg">L <span className={valueColor}>{fmt(hoveredCandle.low)}</span></span>
        <span className="text-fg">C <span className={valueColor}>{fmt(hoveredCandle.close)}</span></span>
        {changeDisplay && (
          <span className={changeDisplay.up ? "text-up" : "text-down"}>
            {changeDisplay.up ? "+" : ""}{changeDisplay.change.toFixed(2)} ({changeDisplay.up ? "+" : ""}{changeDisplay.pct.toFixed(2)}%)
          </span>
        )}
        <span className="text-muted">Vol <span className={valueColor}>{formatVolume(hoveredCandle.volume)}</span></span>
      </span>
    );
  })();

  return (
    <div ref={wrapperRef} className="relative flex flex-col h-full w-full">
      {/* Info bar + toolbar (single horizontal row) */}
      <div className="flex items-center gap-1 border-b border-border bg-panel px-2 py-1 z-20 shrink-0">
        {(symbolBlock || !showInfoOverlay) && (
          <div className={`mr-3 flex items-baseline gap-2 ${showInfoOverlay ? "pl-1.5" : ""}`}>
            {symbolBlock}
            {!showInfoOverlay && ohlcBlock}
          </div>
        )}

        {/* Everything else pushed to the right of the info bar, same row */}
        <div className="ml-auto flex items-center gap-1">
          {/* Chart type */}
          <ChartTypeMenu
            value={chartTypeId}
            onChange={setChartTypeId}
            align="right"
            pinned={pinnedChartTypes}
            onTogglePin={togglePinnedChartType}
          />
          {/* Pinned chart types — starred in the dropdown, surfaced here for one-click access. */}
          {CHART_TYPES.filter((t) => pinnedChartTypes.has(t.id)).map((t) => (
            <ToolbarButton key={t.id} label={t.label} active={chartTypeId === t.id} onClick={() => setChartTypeId(t.id)}>
              <t.icon />
            </ToolbarButton>
          ))}

          {/* Divider */}
          <div className="h-5 w-px bg-border mx-1" />

          {/* Drawings */}
          <ToolbarButton label="Cursor" active={drawingState.mode === "crosshair"} onClick={() => setMode("crosshair")}>
            <IconCursor />
          </ToolbarButton>
          <DrawingMenu
            value={drawingState.mode === "line" || drawingState.mode === "fib" ? drawingState.mode : "crosshair"}
            onChange={(id: DrawingToolId) => setMode(id)}
            align="right"
            pinned={pinnedDrawingTools}
            onTogglePin={togglePinnedDrawingTool}
          />
          {/* Pinned drawing tools — starred in the dropdown, surfaced here for one-click access. */}
          {DRAWING_TOOLS.filter((t) => pinnedDrawingTools.has(t.id)).map((t) => (
            <ToolbarButton key={t.id} label={t.label} active={drawingState.mode === t.id} onClick={() => setMode(t.id)}>
              <t.icon />
            </ToolbarButton>
          ))}

          {/* Divider */}
          <div className="h-5 w-px bg-border mx-1" />

          {/* Indicators — rendered from the registry, so adding one is just adding an entry there. */}
          <IndicatorsMenu
            active={activeIndicators}
            onToggle={toggleIndicator}
            pinned={pinnedIndicators}
            onTogglePin={togglePinnedIndicator}
          />
          {/* Pinned indicators — starred in the dropdown, surfaced here for one-click access. */}
          {INDICATORS.filter((ind) => pinnedIndicators.has(ind.id)).map((ind) => (
            <ToolbarButton key={ind.id} label={ind.label} active={activeIndicators.has(ind.id)} onClick={() => toggleIndicator(ind.id)}>
              <ind.icon />
            </ToolbarButton>
          ))}

          <ToolbarButton label="Clear all drawings" tone="danger" onClick={clearDrawings}>
            <IconDelete />
          </ToolbarButton>
        </div>
      </div>

      {/* Chart area */}
      <div
        className="relative flex-1 min-h-0"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleMouseClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onContextMenu={handleContextMenu}
        style={{
          cursor:
            draggingBracketHandle || hoveredBracketHandle
              ? "ns-resize"
              : drawingState.mode === "line" || drawingState.mode === "fib"
                ? "crosshair"
                : "default",
        }}
      >
        <div ref={containerRef} className="h-full w-full [&_a]:hidden" />
        {showInfoOverlay && ohlcBlock && (
          <div className="absolute left-2 top-2 z-20 rounded-md bg-panel/80 px-2 py-1 backdrop-blur-sm">
            {ohlcBlock}
          </div>
        )}
        {/* pointer-events-none so mouse events fall through to lightweight-charts'
            own canvas underneath — otherwise its native per-series crosshair
            markers (e.g. the dots that track the MACD/signal lines) never see
            the mousemove. Our own crosshair reticle/labels are still drawn here;
            the handlers just live on the wrapping div instead. */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 pointer-events-none"
          style={{ zIndex: 10 }}
        />
      </div>

      {contextMenu && (
        <ChartContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          chartTypeId={chartTypeId}
          onChartTypeChange={setChartTypeId}
          drawingMode={drawingState.mode === "line" || drawingState.mode === "fib" ? drawingState.mode : "crosshair"}
          onDrawingModeChange={setMode}
          activeIndicators={activeIndicators}
          onToggleIndicator={toggleIndicator}
          onQuickOrder={onQuickOrder}
        />
      )}
    </div>
  );
}
