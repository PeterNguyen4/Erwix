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
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill={filled ? "currentColor" : "none"}>
      <path
        d="M8 1.5l1.98 4.26 4.52.55-3.34 3.24.86 4.6L8 11.9l-4.02 2.25.86-4.6-3.34-3.24 4.52-.55L8 1.5z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconDrawingTool() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path
        d="M3 15l1.5-4.5L12 3l3 3-7.5 7.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M11 5l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export const DRAWING_TOOLS: DrawingToolDef[] = [
  { id: "line", label: "Trend Line", icon: IconLine },
  { id: "fib", label: "Fibonacci Retracement", icon: IconFib },
];
