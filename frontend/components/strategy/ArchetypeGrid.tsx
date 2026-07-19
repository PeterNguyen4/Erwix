"use client";

import { Archetype } from "@/lib/api";
import { presentationFor } from "./presentation";

interface Props {
  archetypes: Archetype[];
  selected: string | null;
  onSelect: (id: string) => void;
}

export default function ArchetypeGrid({ archetypes, selected, onSelect }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {archetypes.map((a) => {
        const presentation = presentationFor(a.id);
        const Icon = presentation.icon;
        const isSelected = selected === a.id;
        return (
          <button
            key={a.id}
            onClick={() => onSelect(a.id)}
            style={isSelected ? { boxShadow: `0 0 0 2px ${presentation.color}, 0 0 24px ${presentation.color}55` } : undefined}
            className={`group relative flex flex-col items-center gap-2 rounded-xl border bg-panel px-4 py-6 text-center transition-all duration-150 ${
              isSelected
                ? "border-transparent scale-[1.03]"
                : "border-border hover:border-accent/60 hover:scale-[1.02]"
            }`}
          >
            <span
              className="flex h-14 w-14 items-center justify-center rounded-full transition-transform group-hover:scale-110"
              style={{ backgroundColor: `${presentation.color}22` }}
            >
              <Icon size={24} strokeWidth={2} color={presentation.color} />
            </span>
            <span className="text-sm font-semibold text-fg">{a.name}</span>
            <span className="text-xs text-muted leading-snug">{a.tagline}</span>
            {isSelected && (
              <span
                className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-fg"
                style={{ backgroundColor: presentation.color }}
              >
                ✓
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
