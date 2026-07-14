// Chart-type registry (candles / hollow candles / Heikin-Ashi / bars / line /
// area). Each entry owns how to create its lightweight-charts series and how
// to transform raw candles into that series' data shape — Chart.tsx just
// swaps the active series when the user picks a different type.
import type { CandlestickData, IChartApi, ISeriesApi, LineData, SeriesType, UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/api";

export type ChartTypeId = "candle" | "hollow" | "heikinashi" | "bar" | "line" | "area";

export interface ChartTypeDef {
  id: ChartTypeId;
  label: string;
  icon: () => JSX.Element;
  createSeries: (chart: IChartApi) => ISeriesApi<SeriesType>;
  toData: (candles: Candle[]) => unknown[];
}

export function toCandleData(c: Candle): CandlestickData {
  return { time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close };
}

function toCloseLine(c: Candle): LineData {
  return { time: c.time as UTCTimestamp, value: c.close };
}

// Standard Heikin-Ashi recurrence: each HA candle smooths the prior one in.
export function toHeikinAshi(candles: Candle[]): Candle[] {
  const out: Candle[] = [];
  let prevOpen = 0;
  let prevClose = 0;
  candles.forEach((c, i) => {
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = i === 0 ? (c.open + c.close) / 2 : (prevOpen + prevClose) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);
    out.push({ time: c.time, open: haOpen, high: haHigh, low: haLow, close: haClose, volume: c.volume });
    prevOpen = haOpen;
    prevClose = haClose;
  });
  return out;
}

function IconCandle() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <line x1="5" y1="2" x2="5" y2="16" stroke="currentColor" strokeWidth="1" />
      <rect x="3" y="5" width="4" height="6" fill="currentColor" />
      <line x1="13" y1="2" x2="13" y2="16" stroke="currentColor" strokeWidth="1" />
      <rect x="11" y="7" width="4" height="5" fill="currentColor" />
    </svg>
  );
}

function IconHollow() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <line x1="5" y1="2" x2="5" y2="16" stroke="currentColor" strokeWidth="1" />
      <rect x="3" y="5" width="4" height="6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <line x1="13" y1="2" x2="13" y2="16" stroke="currentColor" strokeWidth="1" />
      <rect x="11" y="7" width="4" height="5" fill="currentColor" />
    </svg>
  );
}

function IconHeikin() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <line x1="4" y1="3" x2="4" y2="15" stroke="currentColor" strokeWidth="1" />
      <rect x="2.5" y="6" width="3" height="5" rx="1" fill="currentColor" />
      <line x1="9" y1="2" x2="9" y2="16" stroke="currentColor" strokeWidth="1" />
      <rect x="7.5" y="8" width="3" height="6" rx="1" fill="currentColor" />
      <line x1="14" y1="4" x2="14" y2="13" stroke="currentColor" strokeWidth="1" />
      <rect x="12.5" y="5" width="3" height="4" rx="1" fill="currentColor" />
    </svg>
  );
}

function IconBar() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <line x1="5" y1="4" x2="5" y2="14" stroke="currentColor" strokeWidth="1.5" />
      <line x1="5" y1="4" x2="2" y2="4" stroke="currentColor" strokeWidth="1.5" />
      <line x1="5" y1="14" x2="8" y2="14" stroke="currentColor" strokeWidth="1.5" />
      <line x1="13" y1="2" x2="13" y2="12" stroke="currentColor" strokeWidth="1.5" />
      <line x1="13" y1="2" x2="10" y2="2" stroke="currentColor" strokeWidth="1.5" />
      <line x1="13" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconLineType() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path d="M2 13 L6 9 L10 11 L16 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconArea() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path d="M2 13 L6 9 L10 11 L16 3 V16 H2 Z" fill="currentColor" opacity="0.3" />
      <path d="M2 13 L6 9 L10 11 L16 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const CHART_TYPES: ChartTypeDef[] = [
  {
    id: "candle",
    label: "Candles",
    icon: IconCandle,
    createSeries: (chart) =>
      chart.addCandlestickSeries({
        upColor: "#26a69a",
        downColor: "#ef5350",
        borderVisible: false,
        wickUpColor: "#26a69a",
        wickDownColor: "#ef5350",
      }),
    toData: (candles) => candles.map(toCandleData),
  },
  {
    id: "hollow",
    label: "Hollow Candles",
    icon: IconHollow,
    createSeries: (chart) =>
      chart.addCandlestickSeries({
        upColor: "rgba(0,0,0,0)",
        downColor: "#ef5350",
        borderVisible: true,
        borderUpColor: "#26a69a",
        borderDownColor: "#ef5350",
        wickUpColor: "#26a69a",
        wickDownColor: "#ef5350",
      }),
    toData: (candles) => candles.map(toCandleData),
  },
  {
    id: "heikinashi",
    label: "Heikin-Ashi",
    icon: IconHeikin,
    createSeries: (chart) =>
      chart.addCandlestickSeries({
        upColor: "#26a69a",
        downColor: "#ef5350",
        borderVisible: false,
        wickUpColor: "#26a69a",
        wickDownColor: "#ef5350",
      }),
    toData: (candles) => toHeikinAshi(candles).map(toCandleData),
  },
  {
    id: "bar",
    label: "Bars",
    icon: IconBar,
    createSeries: (chart) => chart.addBarSeries({ upColor: "#26a69a", downColor: "#ef5350" }),
    toData: (candles) => candles.map(toCandleData),
  },
  {
    id: "line",
    label: "Line",
    icon: IconLineType,
    createSeries: (chart) => chart.addLineSeries({ color: "#3b82f6", lineWidth: 2 }),
    toData: (candles) => candles.map(toCloseLine),
  },
  {
    id: "area",
    label: "Area",
    icon: IconArea,
    createSeries: (chart) =>
      chart.addAreaSeries({
        lineColor: "#3b82f6",
        topColor: "rgba(59, 130, 246, 0.35)",
        bottomColor: "rgba(59, 130, 246, 0.02)",
        lineWidth: 2,
      }),
    toData: (candles) => candles.map(toCloseLine),
  },
];
