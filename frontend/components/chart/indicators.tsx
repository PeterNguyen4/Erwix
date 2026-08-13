import type { UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/api";

export interface LinePoint {
  time: UTCTimestamp;
  value: number;
  color?: string;
}

export interface ZoneBox {
  startTime: UTCTimestamp;
  endTime: UTCTimestamp;
  top: number;
  bottom: number;
  color: string;
}

export interface IndicatorLineDef {
  key: string;
  color: string;
  compute: (candles: Candle[]) => LinePoint[];
  pointMarkers?: boolean;
  pointMarkersRadius?: number;
}

export interface IndicatorDef {
  id: string;
  label: string;
  kind: "overlay" | "oscillator" | "zone";
  icon: () => JSX.Element;
  lines?: IndicatorLineDef[];
  computeZones?: (candles: Candle[]) => ZoneBox[];
}

function sma(candles: Candle[], period: number): LinePoint[] {
  const out: LinePoint[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    const avg = slice.reduce((sum, c) => sum + c.close, 0) / period;
    out.push({ time: candles[i].time as UTCTimestamp, value: avg });
  }
  return out;
}

function ema(candles: Candle[], period: number): LinePoint[] {
  if (candles.length < period) return [];
  const k = 2 / (period + 1);
  const out: LinePoint[] = [];
  const seed = candles.slice(0, period).reduce((sum, c) => sum + c.close, 0) / period;
  let prev = seed;
  out.push({ time: candles[period - 1].time as UTCTimestamp, value: seed });
  for (let i = period; i < candles.length; i++) {
    const value = candles[i].close * k + prev * (1 - k);
    out.push({ time: candles[i].time as UTCTimestamp, value });
    prev = value;
  }
  return out;
}

function emaOfSeries(points: LinePoint[], period: number): LinePoint[] {
  if (points.length < period) return [];
  const k = 2 / (period + 1);
  const seed = points.slice(0, period).reduce((sum, p) => sum + p.value, 0) / period;
  const out: LinePoint[] = [{ time: points[period - 1].time, value: seed }];
  let prev = seed;
  for (let i = period; i < points.length; i++) {
    const value = points[i].value * k + prev * (1 - k);
    out.push({ time: points[i].time, value });
    prev = value;
  }
  return out;
}

function rsi(candles: Candle[], period = 14): LinePoint[] {
  if (candles.length < period + 1) return [];
  const out: LinePoint[] = [];
  const toRsi = (avgGain: number, avgLoss: number) => (avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  out.push({ time: candles[period].time as UTCTimestamp, value: toRsi(avgGain, avgLoss) });

  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out.push({ time: candles[i].time as UTCTimestamp, value: toRsi(avgGain, avgLoss) });
  }
  return out;
}

function macdLine(candles: Candle[]): LinePoint[] {
  const fast = ema(candles, 12);
  const slow = ema(candles, 26);
  const slowByTime = new Map(slow.map((p) => [p.time as number, p.value]));
  return fast
    .filter((p) => slowByTime.has(p.time as number))
    .map((p) => ({ time: p.time, value: p.value - (slowByTime.get(p.time as number) as number) }));
}

function macdSignal(candles: Candle[]): LinePoint[] {
  return emaOfSeries(macdLine(candles), 9);
}

function fvgZones(candles: Candle[], lookback = 150): ZoneBox[] {
  const zones: ZoneBox[] = [];
  if (candles.length < 3) return zones;
  const lastTime = candles[candles.length - 1].time as UTCTimestamp;
  const start = Math.max(1, candles.length - lookback);

  for (let i = start; i < candles.length - 1; i++) {
    const prev = candles[i - 1];
    const next = candles[i + 1];
    let top: number, bottom: number, color: string;
    if (prev.high < next.low) {
      top = next.low;
      bottom = prev.high;
      color = "rgba(34, 197, 94, 0.15)"; // bullish — light green
    } else if (prev.low > next.high) {
      top = prev.low;
      bottom = next.high;
      color = "rgba(239, 68, 68, 0.15)"; // bearish — light red
    } else {
      continue;
    }

    let endTime = lastTime;
    for (let j = i + 2; j < candles.length; j++) {
      const c = candles[j];
      if (c.low <= top && c.high >= bottom) {
        endTime = c.time as UTCTimestamp; // gap touched/filled — stop extending
        break;
      }
    }
    zones.push({ startTime: prev.time as UTCTimestamp, endTime, top, bottom, color });
  }
  return zones;
}

function trueRange(candles: Candle[], i: number): number {
  const c = candles[i];
  if (i === 0) return c.high - c.low;
  const prevClose = candles[i - 1].close;
  return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
}

function atrSeries(candles: Candle[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += trueRange(candles, i);
  let atr = sum / period;
  out[period - 1] = atr;
  for (let i = period; i < candles.length; i++) {
    atr = (atr * (period - 1) + trueRange(candles, i)) / period;
    out[i] = atr;
  }
  return out;
}

function rollingHigh(candles: Candle[], length: number, i: number): number {
  let max = -Infinity;
  for (let j = Math.max(0, i - length + 1); j <= i; j++) max = Math.max(max, candles[j].high);
  return max;
}

function rollingLow(candles: Candle[], length: number, i: number): number {
  let min = Infinity;
  for (let j = Math.max(0, i - length + 1); j <= i; j++) min = Math.min(min, candles[j].low);
  return min;
}

const CHANDELIER_LONG_COLOR = "#22d3ee";
const CHANDELIER_SHORT_COLOR = "#e879f9";

function computeChandelier(candles: Candle[], length: number, atrPeriod: number, mult: number): LinePoint[] {
  const points: LinePoint[] = [];
  const startIdx = Math.max(length, atrPeriod) - 1;
  if (startIdx < 0 || startIdx >= candles.length) return points;

  const atr = atrSeries(candles, atrPeriod);
  let shortvsPrev: number | null = null;
  let longvsPrev: number | null = null;
  let direction = 0;

  for (let i = startIdx; i < candles.length; i++) {
    const a = atr[i];
    if (a == null) continue;

    const shortStop = rollingLow(candles, length, i) + mult * a;
    const longStop = rollingHigh(candles, length, i) - mult * a;
    const close = candles[i].close;
    const prevClose = i > startIdx ? candles[i - 1].close : close;

    const shortvs: number = shortvsPrev == null ? shortStop : close > shortvsPrev ? shortStop : Math.min(shortStop, shortvsPrev);
    const longvs: number = longvsPrev == null ? longStop : close < longvsPrev ? longStop : Math.max(longStop, longvsPrev);

    const longSwitch = shortvsPrev != null && close >= shortvsPrev && prevClose < shortvsPrev;
    const shortSwitch = longvsPrev != null && close <= longvsPrev && prevClose > longvsPrev;
    if (direction <= 0 && longSwitch) direction = 1;
    else if (direction >= 0 && shortSwitch) direction = -1;

    const time = candles[i].time as UTCTimestamp;
    const value = direction > 0 ? longvs : shortvs;
    const color = direction > 0 ? CHANDELIER_LONG_COLOR : CHANDELIER_SHORT_COLOR;
    points.push({ time, value, color });

    shortvsPrev = shortvs;
    longvsPrev = longvs;
  }

  return points;
}

function IconChandelier() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path
        d="M2 13 L6 13 L6 9 L11 9 L11 5 L16 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="16" cy="5" r="1.4" fill="currentColor" />
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

function IconEMA() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path d="M2 11 Q6 3 9 9 Q12 15 16 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <circle cx="9" cy="9" r="1.4" fill="currentColor" />
    </svg>
  );
}

function IconRSI() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <line x1="1" y1="5" x2="17" y2="5" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />
      <line x1="1" y1="13" x2="17" y2="13" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />
      <path d="M1 9 Q5 2 9 9 Q13 16 17 9" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function IconMACD() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path d="M2 12 Q6 4 9 9 Q12 14 16 6" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <rect x="3" y="10" width="1.6" height="4" fill="currentColor" opacity="0.6" />
      <rect x="7" y="7" width="1.6" height="7" fill="currentColor" opacity="0.6" />
      <rect x="11" y="9" width="1.6" height="5" fill="currentColor" opacity="0.6" />
    </svg>
  );
}

function IconFVG() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path d="M2 13 L6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="6" y="6" width="6" height="4" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1" />
      <path d="M12 8 L16 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function makeSMA(period: number, color = "#f0ad4e"): IndicatorDef {
  const id = `sma_${period}`;
  return {
    id,
    label: `SMA ${period}`,
    kind: "overlay",
    icon: IconSMA,
    lines: [{ key: id, color, compute: (c) => sma(c, period) }],
  };
}

function makeEMA(period: number, color = "#38bdf8"): IndicatorDef {
  const id = `ema_${period}`;
  return {
    id,
    label: `EMA ${period}`,
    kind: "overlay",
    icon: IconEMA,
    lines: [{ key: id, color, compute: (c) => ema(c, period) }],
  };
}

function makeRSI(period: number, color = "#a78bfa"): IndicatorDef {
  const id = `rsi_${period}`;
  return {
    id,
    label: `RSI ${period}`,
    kind: "oscillator",
    icon: IconRSI,
    lines: [{ key: id, color, compute: (c) => rsi(c, period) }],
  };
}


export const INDICATORS: IndicatorDef[] = [
  makeSMA(20),
  makeEMA(20),
  makeRSI(14),
  {
    id: "macd",
    label: "MACD",
    kind: "oscillator",
    icon: IconMACD,
    lines: [
      { key: "macd", color: "#38bdf8", compute: macdLine },
      { key: "signal", color: "#f0ad4e", compute: macdSignal },
    ],
  },
  {
    id: "fvg",
    label: "Fair Value Gap",
    kind: "zone",
    icon: IconFVG,
    computeZones: (c) => fvgZones(c),
  },
  {
    id: "chandelier",
    label: "Chandelier Stop",
    kind: "overlay",
    icon: IconChandelier,
    lines: [
      {
        key: "stop",
        color: CHANDELIER_LONG_COLOR,
        pointMarkers: true,
        pointMarkersRadius: 2,
        compute: (c) => computeChandelier(c, 22, 22, 3),
      },
    ],
  },
];

const PARAMETRIZED_ID = /^(sma|ema|rsi)_(\d+)$/;

export function resolveIndicator(id: string, color?: string): IndicatorDef | null {
  const match = PARAMETRIZED_ID.exec(id);
  if (match) {
    const period = Number(match[2]);
    if (match[1] === "sma") return makeSMA(period, color);
    if (match[1] === "ema") return makeEMA(period, color);
    return makeRSI(period, color);
  }
  const known = INDICATORS.find((i) => i.id === id);
  if (!known) return null;
  if (!color || !known.lines) return known;
  return { ...known, lines: known.lines.map((l) => ({ ...l, color })) };
}

export const PARAMETRIZED_FAMILIES: { id: "sma" | "ema" | "rsi"; label: string; icon: () => JSX.Element; defaultColor: string; defaultPeriod: number }[] = [
  { id: "sma", label: "SMA", icon: IconSMA, defaultColor: "#f0ad4e", defaultPeriod: 20 },
  { id: "ema", label: "EMA", icon: IconEMA, defaultColor: "#38bdf8", defaultPeriod: 20 },
  { id: "rsi", label: "RSI", icon: IconRSI, defaultColor: "#a78bfa", defaultPeriod: 14 },
];

export function makeIndicatorId(family: "sma" | "ema" | "rsi", period: number): string {
  return `${family}_${period}`;
}
