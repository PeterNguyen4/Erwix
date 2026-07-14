"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ColorType,
  IChartApi,
  ISeriesApi,
  LogicalRange,
  SeriesMarker,
  SeriesType,
  Time,
  UTCTimestamp,
  createChart,
} from "lightweight-charts";
import type { Candle, ChartAnnotation, ZoomRange } from "@/lib/api";
import ToolbarButton from "@/components/chart/ToolbarButton";
import ChartTypeMenu from "@/components/chart/ChartTypeMenu";
import { CHART_TYPES, ChartTypeId } from "@/components/chart/chartTypes";
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
}

interface ChartProps {
  candles: Candle[];
  liveCandle?: Candle | null;
  annotations?: ChartAnnotation[];
  symbol?: string;
  visibleRange?: ZoomRange | null;
  /** Entry/take-profit/stop-loss levels to highlight, e.g. for a bracket order or an open trade. */
  bracket?: BracketLevels | null;
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

function IconFib() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <line x1="2" y1="3" x2="16" y2="3" stroke="currentColor" strokeWidth="1.3" />
      <line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="1.3" />
      <line x1="2" y1="11" x2="16" y2="11" stroke="currentColor" strokeWidth="1.3" />
      <line x1="2" y1="15" x2="9" y2="15" stroke="currentColor" strokeWidth="1.3" />
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

export default function Chart({
  candles,
  liveCandle,
  annotations = [],
  symbol = "",
  visibleRange = null,
  bracket = null,
}: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const indicatorSeriesMapRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const annotationLinesRef = useRef<ReturnType<ISeriesApi<"Line">["createPriceLine"]>[]>([]);
  const bracketLinesRef = useRef<ReturnType<ISeriesApi<"Line">["createPriceLine"]>[]>([]);
  const oscillatorContainerRef = useRef<HTMLDivElement>(null);
  const oscillatorChartRef = useRef<IChartApi | null>(null);
  const oscillatorSeriesMapRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const [chartReady, setChartReady] = useState(false);
  const [oscChartReady, setOscChartReady] = useState(false);
  const [chartTypeId, setChartTypeId] = useState<ChartTypeId>("candle");
  const [drawingState, setDrawingState] = useState<DrawingState>({
    isDrawing: false,
    points: [],
    mode: "crosshair",
    completedLines: [],
  });
  const [fibDrawings, setFibDrawings] = useState<FibDrawing[]>([]);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [crosshairData, setCrosshairData] = useState<{ time: number | null; price: number | null }>({ time: null, price: null });
  const [activeIndicators, setActiveIndicators] = useState<Set<string>>(new Set());
  const [redrawTick, setRedrawTick] = useState(0);
  const [hoveredCandle, setHoveredCandle] = useState<HoveredCandle | null>(null);

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
  const hasOscillators = activeOscillatorIds.length > 0;

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
      // Fixed so the main chart and the oscillator sub-pane (which can show
      // very different label widths — RSI's "0"-"100" vs MACD's decimals)
      // always reserve the same axis width and stay pixel-aligned.
      rightPriceScale: { borderColor: "#1e2633", minimumWidth: 68 },
      watermark: { visible: false },
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

  // Swap the main series when the user picks a different chart type
  // (candles/hollow/Heikin-Ashi/bars/line/area) — remove the old series and
  // create the new one via the registry in components/chart/chartTypes.tsx.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;
    if (seriesRef.current) chart.removeSeries(seriesRef.current);
    const def = CHART_TYPES.find((t) => t.id === chartTypeId) ?? CHART_TYPES[0];
    seriesRef.current = def.createSeries(chart);
    seriesRef.current.setData(def.toData(candles) as never[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartTypeId, chartReady]);

  // Oscillator sub-pane (RSI/MACD/...) — created only while at least one
  // oscillator indicator is active, and torn down when the last one is
  // toggled off. (Previously this stayed mounted permanently and was just
  // clipped to zero height via CSS when unused, but that meant the chart's
  // container never actually changed size after the very first render,
  // which was one moving part too many to reason about reliably — mounting
  // it fresh each time guarantees it always initializes against a real,
  // visible, correctly-sized container.)
  useEffect(() => {
    if (!hasOscillators || !oscillatorContainerRef.current || !chartReady) return;
    const chart = createChart(oscillatorContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "#0b0e14" }, textColor: "#7d8799" },
      grid: { vertLines: { color: "#1e2633" }, horzLines: { color: "#1e2633" } },
      crosshair: { vertLine: { visible: false }, horzLine: { visible: false } },
      timeScale: { borderColor: "#1e2633", timeVisible: true },
      // Fixed so the main chart and the oscillator sub-pane (which can show
      // very different label widths — RSI's "0"-"100" vs MACD's decimals)
      // always reserve the same axis width and stay pixel-aligned.
      rightPriceScale: { borderColor: "#1e2633", minimumWidth: 68 },
      watermark: { visible: false },
      autoSize: true,
    });
    oscillatorChartRef.current = chart;
    setOscChartReady(true);

    // One-directional: the main chart drives the oscillator pane's time axis.
    // (Syncing the other way too would let the oscillator chart's own initial
    // auto-fit range — which appears the moment it's created or the moment a
    // series is added to it — stomp the main chart's deliberately-set "last
    // 100 candles" view, which is what caused the whole chart to jump/empty
    // out whenever an oscillator indicator was toggled.)
    const mainChart = chartRef.current;
    const fromMain = (range: LogicalRange | null) => {
      if (!range) return;
      chart.timeScale().setVisibleLogicalRange(range);
    };
    mainChart?.timeScale().subscribeVisibleLogicalRangeChange(fromMain);
    // Adopt the main chart's current range immediately — don't wait for its
    // next pan/zoom event, which may never come if the view is already settled.
    const initialRange = mainChart?.timeScale().getVisibleLogicalRange();
    if (initialRange) chart.timeScale().setVisibleLogicalRange(initialRange);

    return () => {
      mainChart?.timeScale().unsubscribeVisibleLogicalRangeChange(fromMain);
      chart.remove();
      oscillatorChartRef.current = null;
      oscillatorSeriesMapRef.current.clear();
      setOscChartReady(false);
    };
  }, [hasOscillators, chartReady]);

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
          series = chart.addLineSeries({
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

  // Same, but for oscillator indicators (RSI/MACD/...) in the sub-pane below.
  useEffect(() => {
    const chart = oscillatorChartRef.current;
    if (!chart || !oscChartReady) return;
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
          series = chart.addLineSeries({
            color: line.color,
            lineWidth: 2,
            title: `${def.label} ${line.key}`,
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

    // The pane-to-pane range sync only fires on the main chart's *next* pan/
    // zoom event — but by the time an oscillator is toggled on, that event
    // may already be long past (the main chart's "last 100 candles" view was
    // set once on load). Without this, newly-added RSI/MACD data can sit
    // entirely outside the oscillator pane's still-default visible range,
    // making it look like nothing rendered. Force the match right now too.
    if (activeKeys.size > 0) {
      const mainRange = chartRef.current?.timeScale().getVisibleLogicalRange();
      if (mainRange) chart.timeScale().setVisibleLogicalRange(mainRange);
    }
  }, [activeOscillatorIds, candles, oscChartReady]);

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
        color: "#e2e8f0",
        lineWidth: 2,
        lineStyle: 0, // solid
        axisLabelVisible: true,
        title: "Entry",
      }),
    );
    if (bracket.takeProfitPrice != null) {
      bracketLinesRef.current.push(
        series.createPriceLine({
          price: bracket.takeProfitPrice,
          color: "#38bdf8", // light blue
          lineWidth: 2,
          lineStyle: 2, // dashed
          axisLabelVisible: true,
          title: "TP",
        }),
      );
    }
    if (bracket.stopLossPrice != null) {
      bracketLinesRef.current.push(
        series.createPriceLine({
          price: bracket.stopLossPrice,
          color: "#f87171", // light red
          lineWidth: 2,
          lineStyle: 2, // dashed
          axisLabelVisible: true,
          title: "SL",
        }),
      );
    }
  }, [bracket, chartReady]);

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
    // level, so the risk/reward is visible at a glance (price lines above
    // handle the labeled level lines themselves).
    if (bracket && seriesRef.current) {
      const entryY = seriesRef.current.priceToCoordinate(bracket.entryPrice);
      if (entryY != null) {
        if (bracket.takeProfitPrice != null) {
          const tpY = seriesRef.current.priceToCoordinate(bracket.takeProfitPrice);
          if (tpY != null) {
            ctx.fillStyle = "rgba(56, 189, 248, 0.12)"; // light blue
            ctx.fillRect(0, Math.min(entryY, tpY), canvas.width, Math.abs(entryY - tpY));
          }
        }
        if (bracket.stopLossPrice != null) {
          const slY = seriesRef.current.priceToCoordinate(bracket.stopLossPrice);
          if (slY != null) {
            ctx.fillStyle = "rgba(248, 113, 113, 0.12)"; // light red
            ctx.fillRect(0, Math.min(entryY, slY), canvas.width, Math.abs(entryY - slY));
          }
        }
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

    // Fibonacci retracement drawings.
    if (chartRef.current && seriesRef.current) {
      const chart = chartRef.current;
      const mainSeries = seriesRef.current;
      for (const fib of fibDrawings) {
        const x1 = chart.timeScale().timeToCoordinate(fib.time1 as UTCTimestamp);
        const x2 = chart.timeScale().timeToCoordinate(fib.time2 as UTCTimestamp);
        if (x1 == null || x2 == null) continue;
        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        for (const level of FIB_LEVELS) {
          const price = fib.price1 + (fib.price2 - fib.price1) * level.ratio;
          const y = mainSeries.priceToCoordinate(price);
          if (y == null) continue;
          ctx.strokeStyle = level.color;
          ctx.lineWidth = 1;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(left, y);
          ctx.lineTo(right, y);
          ctx.stroke();
          ctx.font = "10px monospace";
          ctx.fillStyle = level.color;
          ctx.fillText(`${(level.ratio * 100).toFixed(1)}% (${price.toFixed(2)})`, left + 4, y - 3);
        }
      }
    }

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
  }, [mousePos, drawingState, crosshairData, bracket, redrawTick, activeIndicators, fibDrawings, candles]);

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
          setHoveredCandle({ open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume, prevClose: prev?.close });
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
    if (last) setHoveredCandle({ open: last.open, high: last.high, low: last.low, close: last.close, volume: last.volume, prevClose: prev?.close });
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
    } else if (drawingState.mode === "fib" && mousePos) {
      if (drawingState.points.length === 0) {
        setDrawingState({ ...drawingState, points: [mousePos] });
      } else {
        const chart = chartRef.current;
        const series = seriesRef.current;
        const p0 = drawingState.points[0];
        if (chart && series) {
          const time1 = chart.timeScale().coordinateToTime(p0.x) as number | null;
          const price1 = series.coordinateToPrice(p0.y);
          const time2 = chart.timeScale().coordinateToTime(mousePos.x) as number | null;
          const price2 = series.coordinateToPrice(mousePos.y);
          if (time1 != null && price1 != null && time2 != null && price2 != null) {
            setFibDrawings((prev) => [...prev, { time1, price1, time2, price2 }]);
          }
        }
        setDrawingState({ ...drawingState, mode: "crosshair", points: [] });
      }
    }
  };

  const setMode = (mode: "crosshair" | "line" | "fib") => {
    setDrawingState({ ...drawingState, points: [], mode });
  };

  const clearDrawings = () => {
    setDrawingState({ isDrawing: false, points: [], mode: drawingState.mode, completedLines: [] });
    setFibDrawings([]);
  };


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
      {/* Info bar + toolbar (single horizontal row) */}
      <div className="flex items-center gap-1 border-b border-border bg-panel px-2 py-1 z-20 shrink-0">
        {/* OHLC/volume info */}
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
                <span className="text-muted">Vol <span className="text-white">{formatVolume(hoveredCandle.volume)}</span></span>
              </span>
            );
          })()}
        </div>

        {/* Everything else pushed to the right of the info bar, same row */}
        <div className="ml-auto flex items-center gap-1">
          {/* Chart type */}
          <ChartTypeMenu value={chartTypeId} onChange={setChartTypeId} align="right" />

          {/* Divider */}
          <div className="h-5 w-px bg-border mx-1" />

          {/* Drawings */}
          <ToolbarButton label="Cursor" active={drawingState.mode === "crosshair"} onClick={() => setMode("crosshair")}>
            <IconCursor />
          </ToolbarButton>
          <ToolbarButton label="Trend Line" active={drawingState.mode === "line"} onClick={() => setMode("line")}>
            <IconLine />
          </ToolbarButton>
          <ToolbarButton label="Fibonacci Retracement" active={drawingState.mode === "fib"} onClick={() => setMode("fib")}>
            <IconFib />
          </ToolbarButton>
          <ToolbarButton label="Clear all drawings" tone="danger" onClick={clearDrawings}>
            <IconDelete />
          </ToolbarButton>

          {/* Divider */}
          <div className="h-5 w-px bg-border mx-1" />

          {/* Indicators — rendered from the registry, so adding one is just adding an entry there. */}
          {INDICATORS.map((ind) => (
            <ToolbarButton
              key={ind.id}
              label={ind.label}
              active={activeIndicators.has(ind.id)}
              onClick={() => toggleIndicator(ind.id)}
            >
              <ind.icon />
            </ToolbarButton>
          ))}
        </div>
      </div>

      {/* Chart area */}
      <div className="relative flex-1 min-h-0">
        <div ref={containerRef} className="h-full w-full [&_a]:hidden" />
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleMouseClick}
          className="absolute inset-0"
          style={{
            zIndex: 10,
            cursor: drawingState.mode === "line" || drawingState.mode === "fib" ? "crosshair" : "default",
          }}
        />
      </div>

      {/* Oscillator sub-pane (RSI/MACD/...) — only mounted while at least
          one oscillator indicator is active; see the creation effect above
          for why this isn't just CSS-collapsed instead. */}
      {hasOscillators && (
        <div className="h-[130px] w-full shrink-0 border-t border-border">
          <div ref={oscillatorContainerRef} className="h-full w-full [&_a]:hidden" />
        </div>
      )}
    </div>
  );
}
