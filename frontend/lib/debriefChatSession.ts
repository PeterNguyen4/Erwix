const PREFIX = "entro.debriefChatOverride.";

/** Remembers which "ask" session a given entry-point report's chat panel should
 * open into, so /clear (which detaches from the original report) survives a
 * page reload instead of snapping back to the original report's own messages. */
export function getSessionOverride(originalReportId: number): number | "blank" | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(PREFIX + originalReportId);
  if (raw == null) return null;
  if (raw === "blank") return "blank";
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

export function setSessionOverride(originalReportId: number, value: number | "blank") {
  if (typeof window !== "undefined") window.localStorage.setItem(PREFIX + originalReportId, String(value));
}
