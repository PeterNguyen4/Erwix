"use client";

import { useEffect, useState } from "react";
import { api, Archetype, StrategyNote } from "@/lib/api";
import ArchetypeGrid from "@/components/strategy/ArchetypeGrid";
import StrategyEditor from "@/components/strategy/StrategyEditor";
import StrategySidebar from "@/components/strategy/StrategySidebar";

export default function StrategyPage() {
  const [archetypes, setArchetypes] = useState<Archetype[]>([]);
  const [note, setNote] = useState<StrategyNote | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"select" | "answer">("select");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getArchetypes(), api.getStrategy()])
      .then(([a, n]) => {
        setArchetypes(a);
        setNote(n);
        setSelected(n.archetype);
        if (n.archetype) setView("answer");
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const selectedArchetype = archetypes.find((a) => a.id === selected) ?? null;

  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center min-h-[60px] border-b border-auth-field/40 bg-panel px-4 py-3 shrink-0">
        <div className="text-xl font-semibold text-fg">Strategy</div>
      </header>

      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-6xl gap-8">
          <div className="min-w-0 flex-1">
            {error && (
              <div className="mb-4 rounded-lg border border-down/40 bg-down/10 px-4 py-2 text-sm text-down">
                {error}
              </div>
            )}

            {view === "select" && archetypes.length > 0 && (
              <ArchetypeGrid
                archetypes={archetypes}
                selected={selected}
                onSelect={(id) => {
                  setSelected(id);
                  setView("answer");
                }}
              />
            )}

            {view === "answer" && note && selectedArchetype && (
              <StrategyEditor
                archetype={selectedArchetype}
                note={note}
                onSaved={setNote}
                onBack={() => setView("select")}
              />
            )}
          </div>

          <StrategySidebar archetype={selectedArchetype} note={note} onNoteUpdated={setNote} />
        </div>
      </div>
    </main>
  );
}
