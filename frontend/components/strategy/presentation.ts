// Frontend-only presentation (icon glyph + accent color) keyed by the backend's
// archetype id — copy itself (name/tagline/questions) stays server-owned via api.getArchetypes.
export const ARCHETYPE_PRESENTATION: Record<string, { glyph: string; color: string }> = {
  trend_rider: { glyph: "📈", color: "#3b82f6" },
  swing_sniper: { glyph: "🎯", color: "#a855f7" },
  scalper: { glyph: "⚡", color: "#f59e0b" },
  breakout: { glyph: "🚀", color: "#ef5350" },
  value: { glyph: "🏛️", color: "#26a69a" },
  guardian: { glyph: "🛡️", color: "#64748b" },
  freeform: { glyph: "✍️", color: "#e6e9ef" },
};

export function presentationFor(id: string | null | undefined) {
  return (id && ARCHETYPE_PRESENTATION[id]) || { glyph: "🧭", color: "#3b82f6" };
}
