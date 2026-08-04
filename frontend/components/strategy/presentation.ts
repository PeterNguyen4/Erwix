import { Compass, Landmark, LucideIcon, PenLine, Rocket, Shield, Target, TrendingUp, Zap } from "lucide-react";

// Frontend-only presentation (icon + accent color) keyed by the backend's
// archetype id — copy itself (name/tagline/questions) stays server-owned via api.getArchetypes.
export const ARCHETYPE_PRESENTATION: Record<string, { icon: LucideIcon; color: string }> = {
  trend_rider: { icon: TrendingUp, color: "#3b82f6" },
  swing_sniper: { icon: Target, color: "#a855f7" },
  scalper: { icon: Zap, color: "#f59e0b" },
  breakout: { icon: Rocket, color: "#ef5350" },
  value: { icon: Landmark, color: "#26a69a" },
  guardian: { icon: Shield, color: "#64748b" },
  freeform: { icon: PenLine, color: "#78716c" },
};

export function presentationFor(id: string | null | undefined) {
  return (id && ARCHETYPE_PRESENTATION[id]) || { icon: Compass, color: "#3b82f6" };
}
