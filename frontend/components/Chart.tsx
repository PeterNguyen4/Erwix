"use client";

import { useEffect, useRef } from "react";
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
  // Phase-2: the analyst agent supplies these; drawn as markers / price lines.
  annotations?: ChartAnnotation[];
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
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

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

  return <div ref={containerRef} className="h-full w-full" />;
}
