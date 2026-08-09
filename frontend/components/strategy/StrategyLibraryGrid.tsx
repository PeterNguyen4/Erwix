"use client";

import { useEffect, useRef, useState } from "react";
import { Check, MoreVertical, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Archetype, StrategyNoteSummary } from "@/lib/api";
import { presentationFor } from "./presentation";

interface Props {
  strategies: StrategyNoteSummary[];
  archetypes: Archetype[];
  onEdit: (id: number) => void;
  onActivate: (id: number) => void;
  onDelete: (id: number) => void;
  onRename: (id: number, name: string) => void;
  onAdd: () => void;
}

function StrategyCard({
  strategy: s,
  archetypeName,
  onEdit,
  onActivate,
  onDelete,
  onRename,
}: {
  strategy: StrategyNoteSummary;
  archetypeName: string | null;
  onEdit: (id: number) => void;
  onActivate: (id: number) => void;
  onDelete: (id: number) => void;
  onRename: (id: number, name: string) => void;
}) {
  const presentation = presentationFor(s.archetype);
  const Icon = presentation.icon;
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(s.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  const commitRename = () => {
    setRenaming(false);
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== s.name) onRename(s.id, trimmed);
    else setNameDraft(s.name);
  };

  return (
    <div
      onClick={() => {
        if (!renaming) onEdit(s.id);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !renaming) onEdit(s.id);
      }}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-panel transition-all duration-150 cursor-pointer hover:border-accent/60 hover:scale-[1.02]"
    >
      <div
        className="relative flex h-40 items-center justify-center"
        style={{ backgroundColor: `${presentation.color}14` }}
      >
        <span
          className="flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ backgroundColor: `${presentation.color}22` }}
        >
          <Icon size={26} strokeWidth={1.75} color={presentation.color} />
        </span>

        {s.is_active && (
          <span className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full border border-violet-400/40 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-accent dark:text-violet-400">
            <Check size={10} strokeWidth={2.5} />
            Active
          </span>
        )}

        <div className="absolute right-2 top-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
            title="More options"
            className="flex h-6 w-6 items-center justify-center rounded-md bg-black/20 text-zinc-100/80 backdrop-blur-sm transition-colors hover:bg-black/35 hover:text-zinc-100"
          >
            <MoreVertical size={14} strokeWidth={2} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-32 rounded-md border border-border bg-panel py-1 text-left shadow-lg">
              {!s.is_active && (
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setMenuOpen(false);
                    onActivate(s.id);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted transition-colors hover:bg-violet-500/10 hover:text-fg"
                >
                  <Star size={12} strokeWidth={2} />
                  Activate
                </button>
              )}
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setMenuOpen(false);
                  setRenaming(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted transition-colors hover:bg-violet-500/10 hover:text-fg"
              >
                <Pencil size={12} strokeWidth={2} />
                Rename
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(s.id);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-down transition-colors hover:bg-down/10"
              >
                <Trash2 size={12} strokeWidth={2} />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center gap-2 p-4 text-center">
        {renaming ? (
          <input
            ref={inputRef}
            value={nameDraft}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setNameDraft(s.name);
                setRenaming(false);
              }
            }}
            className="w-full rounded border border-violet-400 bg-field px-1.5 py-0.5 text-center text-sm font-semibold text-fg outline-none"
          />
        ) : (
          <div
            onDoubleClick={(e) => {
              e.stopPropagation();
              setRenaming(true);
            }}
            title="Double-click to rename"
            className="truncate text-sm font-semibold text-fg"
          >
            {s.name}
          </div>
        )}

        <div className="flex items-center justify-center gap-1.5 text-xs text-muted">
          <span>{archetypeName ?? "Custom"}</span>
          <span className="text-muted">•</span>
          <span>{new Date(s.updated_at).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}

export default function StrategyLibraryGrid({
  strategies,
  archetypes,
  onEdit,
  onActivate,
  onDelete,
  onRename,
  onAdd,
}: Props) {
  const archetypeName = (id: string | null) => archetypes.find((a) => a.id === id)?.name ?? null;

  return (
    <div className="mx-auto grid max-w-[67rem] grid-cols-[repeat(auto-fill,16rem)] justify-center gap-4">
      {strategies.map((s) => (
        <StrategyCard
          key={s.id}
          strategy={s}
          archetypeName={archetypeName(s.archetype)}
          onEdit={onEdit}
          onActivate={onActivate}
          onDelete={onDelete}
          onRename={onRename}
        />
      ))}

      <button
        onClick={onAdd}
        className="flex min-h-[14rem] w-64 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-panel/40 text-muted transition-colors hover:border-accent hover:bg-fg/5 hover:text-fg"
      >
        <Plus size={20} strokeWidth={2} />
        <span className="text-sm font-medium">Add Strategy</span>
      </button>
    </div>
  );
}
