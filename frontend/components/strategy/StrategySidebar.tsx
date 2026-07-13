"use client";

import { Archetype, StrategyNote } from "@/lib/api";
import { presentationFor } from "./presentation";
import StrategyCard from "./StrategyCard";

interface Props {
  archetype: Archetype | null;
  note: StrategyNote | null;
  onNoteUpdated: (note: StrategyNote) => void;
}

export default function StrategySidebar({ archetype, note, onNoteUpdated }: Props) {
  const presentation = presentationFor(archetype?.id);

  return (
    <div className="w-[26rem] shrink-0">
      <div className="sticky top-4 space-y-4 rounded-xl border border-border bg-panel/40 p-5">
        {archetype ? (
          <div className="text-center animate-fade-in-up">
            <span
              className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full text-2xl"
              style={{ backgroundColor: `${presentation.color}22` }}
            >
              {presentation.glyph}
            </span>
            <div className="text-sm font-semibold text-white">{archetype.name}</div>
            <div className="text-xs text-muted">{archetype.tagline}</div>
          </div>
        ) : (
          <div className="text-center text-xs text-muted">Pick a class to begin</div>
        )}

        <div className="border-t border-border pt-4">
          {note?.structured_summary ? (
            <StrategyCard summary={note.structured_summary} onEdited={onNoteUpdated} />
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
