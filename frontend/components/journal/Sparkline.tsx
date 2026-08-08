"use client";

import { useMemo } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { CHART_PALETTES } from "@/lib/chartTheme";

interface SparklineProps {
  values: (number | null)[];
  up: boolean;
  width?: number;
  height?: number;
}

export default function Sparkline({ values, up, width = 96, height = 32 }: SparklineProps) {
  const { theme } = useTheme();
  const palette = CHART_PALETTES[theme];
  const stroke = up ? palette.up : palette.down;

  const geom = useMemo(() => {
    const clean = values.filter((v): v is number => v != null);
    if (clean.length < 2) return null;
    const min = Math.min(...clean);
    const max = Math.max(...clean);
    const span = max - min || 1;
    const x = (i: number) => (i / (clean.length - 1)) * width;
    const y = (v: number) => height - 2 - ((v - min) / span) * (height - 4);
    const line = clean.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    return { line };
  }, [values, width, height]);

  if (!geom) return <div style={{ width, height }} />;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <path d={geom.line} fill="none" stroke={stroke} strokeWidth="1.5" vectorEffect="non-scaling-stroke" opacity="0.85" />
    </svg>
  );
}
