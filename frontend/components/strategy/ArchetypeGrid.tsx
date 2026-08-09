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
    <div className="mx-auto grid max-w-[67rem] grid-cols-[repeat(auto-fill,16rem)] justify-center gap-4">
      {archetypes.map((a) => {
        const presentation = presentationFor(a.id);
        const Icon = presentation.icon;
        const isSelected = selected === a.id;
        return (
          <button
            key={a.id}
            onClick={() => onSelect(a.id)}
            style={isSelected ? { boxShadow: `0 0 0 2px ${presentation.color}, 0 0 24px ${presentation.color}55` } : undefined}
            className={`group relative flex flex-col overflow-hidden rounded-xl border bg-panel text-center transition-all duration-150 ${
              isSelected
                ? "border-transparent scale-[1.03]"
                : "border-border hover:border-accent/60 hover:scale-[1.02]"
            }`}
          >
            <div
              className="relative flex h-40 items-center justify-center"
              style={{ backgroundColor: `${presentation.color}14` }}
            >
              <span
                className="flex h-14 w-14 items-center justify-center rounded-2xl transition-transform group-hover:scale-110"
                style={{ backgroundColor: `${presentation.color}22` }}
              >
                <Icon size={26} strokeWidth={1.75} color={presentation.color} />
              </span>

              {isSelected && (
                <span
                  className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-fg"
                  style={{ backgroundColor: presentation.color }}
                >
                  ✓
                </span>
              )}
            </div>

            <div className="flex flex-1 flex-col items-center justify-center gap-1 p-4">
              <span className="text-sm font-semibold text-fg">{a.name}</span>
              <span className="text-xs text-muted leading-snug">{a.tagline}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
