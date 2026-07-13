"use client";

// Parses the strategist agent's "Section:\n- bullet\n- bullet" plaintext output
// into sectioned stat-sheet blocks, matching STRATEGIST_SYSTEM_PROMPT's format
// (backend/app/services/agent_graph.py).
function parseSections(summary: string): { heading: string; bullets: string[] }[] {
  const sections: { heading: string; bullets: string[] }[] = [];
  let current: { heading: string; bullets: string[] } | null = null;
  for (const rawLine of summary.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const headingMatch = line.match(/^([A-Za-z ]{2,20}):\s*$/) || line.match(/^([A-Za-z ]{2,20}):\s*(.+)$/);
    if (headingMatch && !line.startsWith("-") && !line.startsWith("•")) {
      current = { heading: headingMatch[1].trim(), bullets: [] };
      sections.push(current);
      if (headingMatch[2]) current.bullets.push(headingMatch[2].trim());
      continue;
    }
    const bullet = line.replace(/^[-•]\s*/, "");
    if (current) current.bullets.push(bullet);
  }
  return sections;
}

const SECTION_ICON: Record<string, string> = {
  goal: "🎯",
  "entry rules": "🚪",
  "risk rules": "🛡️",
  timeframe: "⏱️",
  avoid: "⚠️",
};

interface Props {
  summary: string;
  onRegenerate?: () => void;
  regenerating?: boolean;
}

export default function StrategyCard({ summary, onRegenerate, regenerating }: Props) {
  const sections = parseSections(summary);

  return (
    <div className="rounded-xl border border-accent/30 bg-gradient-to-b from-accent/10 to-panel p-5 animate-fade-in-up">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-accent">Your Playbook</h3>
        {onRegenerate && (
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            className="rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-white disabled:opacity-50"
          >
            {regenerating ? "Regenerating…" : "Regenerate"}
          </button>
        )}
      </div>

      {sections.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {sections.map((s) => (
            <div key={s.heading} className="rounded-lg border border-border bg-bg/60 p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-white">
                <span>{SECTION_ICON[s.heading.toLowerCase()] ?? "•"}</span>
                {s.heading}
              </div>
              <ul className="space-y-1 text-xs text-muted">
                {s.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="whitespace-pre-line text-sm text-muted">{summary}</p>
      )}
    </div>
  );
}
