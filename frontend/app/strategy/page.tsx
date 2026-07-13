"use client";

import { useEffect, useState } from "react";
import { api, Archetype, StrategyNote } from "@/lib/api";
import ArchetypeGrid from "@/components/strategy/ArchetypeGrid";
import StrategyEditor from "@/components/strategy/StrategyEditor";

export default function StrategyPage() {
  const [archetypes, setArchetypes] = useState<Archetype[]>([]);
  const [note, setNote] = useState<StrategyNote | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getArchetypes(), api.getStrategy()])
      .then(([a, n]) => {
        setArchetypes(a);
        setNote(n);
        setSelected(n.archetype);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <main className="flex h-full flex-col">
      <header className="border-b border-border bg-panel px-4 py-3 shrink-0">
        <div className="text-xl font-semibold text-white">Strategy</div>
        <div className="text-xs text-muted">Choose your class, then teach uWick how you trade</div>
      </header>

      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-3xl">
          {error && (
            <div className="mb-4 rounded-lg border border-down/40 bg-down/10 px-4 py-2 text-sm text-down">
              {error}
            </div>
          )}

          {archetypes.length > 0 && (
            <ArchetypeGrid archetypes={archetypes} selected={selected} onSelect={setSelected} />
          )}

          {note && selected && (
            <StrategyEditor
              archetype={selected}
              archetypes={archetypes}
              note={note}
              onSaved={(saved) => {
                setNote(saved);
                setSelected(saved.archetype);
              }}
            />
          )}
        </div>
      </div>
    </main>
  );
}
