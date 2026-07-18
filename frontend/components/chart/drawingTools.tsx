import { Star, Brush } from "lucide-react";

// Drawing-tool registry (trend line / Fibonacci retracement)
export type DrawingToolId = "line" | "fib";

export interface DrawingToolDef {
  id: DrawingToolId;
  label: string;
  icon: () => JSX.Element;
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

export function IconStar({ filled }: { filled: boolean }) {
  return <Star size={12} strokeWidth={1.6} fill={filled ? "currentColor" : "none"} />;
}

export function IconDrawingTool() {
  return <Brush size={16} strokeWidth={2} />;
}

export const DRAWING_TOOLS: DrawingToolDef[] = [
  { id: "line", label: "Trend Line", icon: IconLine },
  { id: "fib", label: "Fibonacci Retracement", icon: IconFib },
];
