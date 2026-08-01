"use client";

import { useState } from "react";
import { Pencil, Shield, TriangleAlert, Timer, Crosshair, LogIn } from "lucide-react";
import { api, StrategyNote } from "@/lib/api";

// Mirrors backend/app/services/strategy.py's SECTION_LABELS + StrategyPlaybook fields.
const SECTIONS = [
  { key: "goal", label: "Goal", icon: Crosshair },
  { key: "entry_rules", label: "Entry Rules", icon: LogIn },
  { key: "risk_rules", label: "Risk Rules", icon: Shield },
  { key: "timeframe", label: "Timeframe", icon: Timer },
  { key: "avoid", label: "Avoid", icon: TriangleAlert },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

function stripMarkdown(text: string): string {
  return text.replace(/\*\*/g, "").replace(/^[-•]\s*/, "").trim();
}

// New playbooks are stored as JSON (StrategyPlaybook). Falls back to parsing the
// old "Heading:\n- bullet" plaintext format for summaries generated before the
// strategist agent returned structured output.
function parseSummary(summary: string): Record<string, string[]> {
  try {
    const parsed = JSON.parse(summary);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const sections: Record<string, string[]> = {};
      for (const { key } of SECTIONS) {
        const value = (parsed as Record<string, unknown>)[key];
        if (Array.isArray(value)) sections[key] = value.map((v) => stripMarkdown(String(v)));
      }
      return sections;
    }
  } catch {
    // legacy plain-text summary — fall through to line parsing below
  }
  const sections: Record<string, string[]> = {};
  let currentKey: SectionKey | null = null;
  for (const rawLine of summary.split("\n")) {
    const line = stripMarkdown(rawLine);
    if (!line) continue;
    const match = SECTIONS.find((s) => line.toLowerCase().startsWith(`${s.label.toLowerCase()}:`));
    if (match) {
      currentKey = match.key;
      sections[currentKey] = [];
      const rest = line.slice(match.label.length + 1).trim();
      if (rest) sections[currentKey].push(rest);
      continue;
    }
    if (currentKey) sections[currentKey].push(line);
  }
  return sections;
}

interface Props {
  summary: string;
  onRegenerate?: () => void;
  regenerating?: boolean;
  onEdited?: (note: StrategyNote) => void;
}

export default function StrategyCard({ summary, onRegenerate, regenerating, onEdited }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const sections = parseSummary(summary);

  function startEditing() {
    const initial: Record<string, string> = {};
    for (const { key } of SECTIONS) initial[key] = (sections[key] ?? []).join("\n");
    setDraft(initial);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    try {
      const payload: Record<string, string[]> = {};
      for (const { key } of SECTIONS) {
        payload[key] = (draft[key] ?? "")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
      }
      const note = await api.updatePlaybook(payload);
      onEdited?.(note);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-accent/30 bg-gradient-to-b from-accent/10 to-panel p-5 animate-fade-in-up">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-accent">Your Playbook</h3>
        {!editing && (
          <div className="flex items-center gap-2">
            {onEdited && (
              <button
                onClick={startEditing}
                title="Edit playbook"
                className="rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-fg"
              >
                <Pencil size={12} strokeWidth={2} />
              </button>
            )}
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                disabled={regenerating}
                className="rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-fg disabled:opacity-50"
              >
                {regenerating ? "Regenerating…" : "Regenerate"}
              </button>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          {SECTIONS.map((s) => (
            <div key={s.key}>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-fg">
                <s.icon size={13} strokeWidth={2} />
                {s.label}
              </label>
              <textarea
                value={draft[s.key] ?? ""}
                onChange={(e) => setDraft((prev) => ({ ...prev, [s.key]: e.target.value }))}
                rows={2}
                placeholder="One bullet per line"
                className="w-full resize-y rounded-lg border border-border bg-field p-2 text-xs text-fg placeholder:text-muted/60 focus:border-accent focus:outline-none"
              />
            </div>
          ))}
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-fg transition-colors hover:bg-accent/80 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:text-fg"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border bg-bg/60">
          {SECTIONS.filter((s) => (sections[s.key] ?? []).length > 0).map((s) => (
            <div key={s.key} className="p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-fg">
                <s.icon size={13} strokeWidth={2} />
                {s.label}
              </div>
              <ul className="space-y-1 text-xs text-muted">
                {(sections[s.key] ?? []).map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
