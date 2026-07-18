// Mirrors app/globals.css's CSS variables as hex, for lightweight-charts and
// canvas 2D drawing, neither of which can read Tailwind classes/CSS vars.
export interface ChartPalette {
  bg: string;
  panel: string;
  border: string;
  muted: string;
  fg: string;
  accent: string;
  up: string;
  down: string;
}

export const CHART_PALETTES: Record<"dark" | "light", ChartPalette> = {
  dark: {
    bg: "#0b0e14",
    panel: "#121722",
    border: "#1e2633",
    muted: "#7d8799",
    fg: "#e6e9ef",
    accent: "#3b82f6",
    up: "#26a69a",
    down: "#ef5350",
  },
  light: {
    bg: "#f7f8fa",
    panel: "#ffffff",
    border: "#e2e6ec",
    muted: "#64748b",
    fg: "#0f172a",
    accent: "#3b82f6",
    up: "#169185",
    down: "#dc2626",
  },
};
