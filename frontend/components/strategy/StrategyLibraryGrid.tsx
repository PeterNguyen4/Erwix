"use client";

import { Check, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { StrategyNoteSummary } from "@/lib/api";
import { presentationFor } from "./presentation";

interface Props {
  strategies: StrategyNoteSummary[];
  onEdit: (id: number) => void;
  onActivate: (id: number) => void;
  onDelete: (id: number) => void;
  onAdd: () => void;
}

export default function StrategyLibraryGrid({ strategies, onEdit, onActivate, onDelete, onAdd }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {strategies.map((s) => {
        const presentation = presentationFor(s.archetype);
        const Icon = presentation.icon;
        return (
          <div
            key={s.id}
            className={`group relative flex flex-col gap-3 rounded-xl border bg-panel p-4 transition-colors ${
              s.is_active ? "border-accent/60" : "border-border hover:border-accent/40"
            }`}
          >
            {s.is_active && (
              <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                <Check size={10} strokeWidth={2.5} />
                Active
              </span>
            )}
            <span
              className="flex h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: `${presentation.color}22` }}
            >
              <Icon size={18} strokeWidth={2} color={presentation.color} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-fg">{s.name}</div>
              <div className="text-xs text-muted">{new Date(s.updated_at).toLocaleDateString()}</div>
            </div>
            <div className="mt-auto flex items-center gap-2 pt-1">
              {!s.is_active && (
                <button
                  onClick={() => onActivate(s.id)}
                  title="Set as active"
                  className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-fg"
                >
                  <Star size={12} strokeWidth={2} />
                  Activate
                </button>
              )}
              <button
                onClick={() => onEdit(s.id)}
                title="Edit strategy"
                className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-fg"
              >
                <Pencil size={12} strokeWidth={2} />
                Edit
              </button>
              <button
                onClick={() => onDelete(s.id)}
                title="Delete strategy"
                className="ml-auto rounded-md border border-border p-1.5 text-muted transition-colors hover:border-down hover:text-down"
              >
                <Trash2 size={12} strokeWidth={2} />
              </button>
            </div>
          </div>
        );
      })}

      <button
        onClick={onAdd}
        className="flex min-h-[10rem] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 bg-panel/20 text-muted transition-colors hover:border-accent/60 hover:text-fg"
      >
        <Plus size={20} strokeWidth={2} />
        <span className="text-sm font-medium">Add Strategy</span>
      </button>
    </div>
  );
}
