"use client";

import { useState } from "react";
import { api, Archetype, StrategyNote } from "@/lib/api";
import { presentationFor } from "./presentation";
import StrategyCard from "./StrategyCard";

interface Props {
  archetype: Archetype | null;
  note: StrategyNote | null;
  onNoteUpdated: (note: StrategyNote) => void;
}

export default function StrategySidebar({ archetype, note, onNoteUpdated }: Props) {
  const presentation = presentationFor(archetype?.id);
  const Icon = presentation.icon;
  const [regenerating, setRegenerating] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);

  async function regenerate() {
    if (!note) return;
    setRegenerating(true);
    setRuleError(null);
    try {
      const updated = await api.regenerateStrategy(note.id);
      onNoteUpdated(updated);
      const rulesOut = await api.getStrategyRules(note.id);
      if (rulesOut.compile_error) setRuleError(rulesOut.compile_error);
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="w-full shrink-0 lg:w-[26rem]">
      <div className="space-y-4 rounded-xl border border-border bg-panel/40 p-5 lg:sticky lg:top-4">
        {archetype ? (
          <div className="text-center animate-fade-in-up">
            <span
              className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full"
              style={{ backgroundColor: `${presentation.color}22` }}
            >
              <Icon size={24} strokeWidth={2} color={presentation.color} />
            </span>
            <div className="text-sm font-semibold text-fg">{archetype.name}</div>
            <div className="text-xs text-muted">{archetype.tagline}</div>
          </div>
        ) : (
          <div className="text-center text-xs text-muted">Pick a class to begin</div>
        )}

        <div className="border-t border-border pt-4">
          {note?.structured_summary ? (
            <>
              <StrategyCard
                noteId={note.id}
                summary={note.structured_summary}
                onEdited={onNoteUpdated}
                onRegenerate={regenerate}
                regenerating={regenerating}
              />
              {ruleError && (
                <div className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">
                  Rule compilation failed: {ruleError}
                </div>
              )}
            </>
          ) : (
            <div className="text-center text-xs text-muted">
              No playbook yet — answer the questions and generate one.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
