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
import type { Candle, ChartAnnotation } from "@/lib/api";

interface ChartProps {
  candles: Candle[];
  liveCandle?: Candle | null;
  annotations?: ChartAnnotation[];
}

interface DrawingState {
  isDrawing: boolean;
  points: Array<{ x: number; y: number }>;
  mode: "crosshair" | "line" | "text" | null;
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

function toMarker(a: ChartAnnotation): SeriesMarker<Time> {
  const isArrowUp = a.type === "arrow";
  return {
    time: a.time as UTCTimestamp,
    position: a.type === "circle" ? "inBar" : "aboveBar",
    color: a.color ?? "#3b82f6",
    shape: isArrowUp ? "arrowUp" : "circle",
    text: a.label ?? "",
  };
}

export default function Chart({ candles, liveCandle, annotations = [] }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [drawingState, setDrawingState] = useState<DrawingState>({
    isDrawing: false,
    points: [],
    mode: "crosshair",
    completedLines: [],
  });
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [indicators, setIndicators] = useState<"sma20" | "sma50" | null>(null);

  // Initialize chart once.
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
      timeScale: { borderColor: "#1e2633", timeVisible: true },
      rightPriceScale: { borderColor: "#1e2633" },
      autoSize: true,
    });
    const series = chart.addCandlestickSeries({
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });
    chartRef.current = chart;
    seriesRef.current = series;

    // Add priceline series for indicators
    const priceLine = chart.addLineSeries({
      color: "#f0ad4e",
      lineWidth: 2,
      title: "SMA",
    });
    (chart as any)._indicatorSeries = priceLine;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Load historical candles.
  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.setData(candles.map(toSeriesData));
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  // Apply live updates.
  useEffect(() => {
    if (!seriesRef.current || !liveCandle) return;
    seriesRef.current.update(toSeriesData(liveCandle));
  }, [liveCandle]);

  // Draw annotation overlays (markers + horizontal lines).
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    series.setMarkers(
      annotations
        .filter((a) => a.type !== "line")
        .map(toMarker),
    );
  }, [annotations]);

  // Draw crosshair and overlays on canvas
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.style.position = "absolute";
      canvas.style.top = "0";
      canvas.style.left = "0";
      canvas.style.zIndex = "10";
      canvas.style.cursor = "crosshair";
      container.appendChild(canvas);
      canvasRef.current = canvas;
    }

    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx || !mousePos) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw crosshair
    if (drawingState.mode === "crosshair") {
      ctx.strokeStyle = "#7d8799";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(mousePos.x, 0);
      ctx.lineTo(mousePos.x, canvas.height);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(0, mousePos.y);
      ctx.lineTo(canvas.width, mousePos.y);
      ctx.stroke();

      ctx.setLineDash([]);
    }

    // Draw completed lines
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2;
    for (const line of drawingState.completedLines) {
      if (line.length === 2) {
        ctx.beginPath();
        ctx.moveTo(line[0].x, line[0].y);
        ctx.lineTo(line[1].x, line[1].y);
        ctx.stroke();
      }
    }

    // Draw line being drawn
    if (drawingState.mode === "line" && drawingState.points.length > 0) {
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(drawingState.points[0].x, drawingState.points[0].y);
      ctx.lineTo(mousePos.x, mousePos.y);
      ctx.stroke();
    }

    // Draw point markers
    for (const point of drawingState.points) {
      ctx.fillStyle = "#3b82f6";
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
      ctx.fill();
    }
    for (const line of drawingState.completedLines) {
      for (const point of line) {
        ctx.fillStyle = "#3b82f6";
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  }, [mousePos, drawingState]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleMouseClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (drawingState.mode === "line" && mousePos) {
      if (drawingState.points.length === 0) {
        setDrawingState({
          ...drawingState,
          points: [mousePos],
        });
      } else {
        setDrawingState({
          ...drawingState,
          points: [],
          completedLines: [...drawingState.completedLines, [drawingState.points[0], mousePos]],
        });
      }
    }
  };

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onClick={handleMouseClick}
        className="absolute inset-0"
        style={{ cursor: drawingState.mode === "crosshair" ? "crosshair" : "default" }}
      />
      <div className="absolute bottom-3 left-3 z-20 flex gap-2">
        <button
          onClick={() =>
            setDrawingState({
              ...drawingState,
              points: [],
              mode: drawingState.mode === "crosshair" ? "line" : "crosshair",
            })
          }
          className={`rounded px-2 py-1 text-xs font-semibold ${
            drawingState.mode === "line"
              ? "bg-blue-600 text-white"
              : "bg-border text-muted hover:bg-accent/30"
          }`}
        >
          {drawingState.mode === "line" ? "✓ Line" : "📐 Line"}
        </button>
        <button
          onClick={() =>
            setIndicators(indicators === "sma20" ? null : "sma20")
          }
          className={`rounded px-2 py-1 text-xs font-semibold ${
            indicators
              ? "bg-yellow-600 text-white"
              : "bg-border text-muted hover:bg-accent/30"
          }`}
        >
          {indicators ? "✓ SMA" : "📊 SMA"}
        </button>
      </div>
    </div>
  );
}
