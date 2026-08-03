"use client";

import { useEffect, useState } from "react";
import { api, Archetype, StrategyNote } from "@/lib/api";
import ArchetypeGrid from "@/components/strategy/ArchetypeGrid";
import StrategyEditor from "@/components/strategy/StrategyEditor";
import StrategySidebar from "@/components/strategy/StrategySidebar";

function ArchetypeGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-2 rounded-xl border border-border bg-panel px-4 py-6">
          <div className="h-14 w-14 animate-pulse rounded-full bg-border/40" />
          <div className="h-3.5 w-16 animate-pulse rounded bg-border/40" />
          <div className="h-3 w-20 animate-pulse rounded bg-border/40" />
        </div>
      ))}
    </div>
  );
}

function StrategySidebarSkeleton() {
  return (
    <div className="w-full shrink-0 lg:w-[26rem]">
      <div className="space-y-4 rounded-xl border border-border bg-panel/40 p-5">
        <div className="flex flex-col items-center gap-2">
          <div className="h-14 w-14 animate-pulse rounded-full bg-border/40" />
          <div className="h-3.5 w-24 animate-pulse rounded bg-border/40" />
          <div className="h-3 w-32 animate-pulse rounded bg-border/40" />
        </div>
        <div className="space-y-2 border-t border-border pt-4">
          <div className="h-3 w-full animate-pulse rounded bg-border/40" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-border/40" />
          <div className="h-3 w-3/5 animate-pulse rounded bg-border/40" />
        </div>
      </div>
    </div>
  );
}

export default function StrategyPage() {
  const [archetypes, setArchetypes] = useState<Archetype[]>([]);
  const [note, setNote] = useState<StrategyNote | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"select" | "answer">("select");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getArchetypes(), api.getStrategy()])
      .then(([a, n]) => {
        setArchetypes(a);
        setNote(n);
        setSelected(n.archetype);
        if (n.archetype) setView("answer");
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const selectedArchetype = archetypes.find((a) => a.id === selected) ?? null;

  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center min-h-[60px] border-b border-auth-field/40 bg-panel px-4 py-3 shrink-0">
        <div className="text-xl font-semibold text-fg">Strategy</div>
      </header>

      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 lg:flex-row">
          <div className="min-w-0 flex-1">
            {error && (
              <div className="mb-4 rounded-lg border border-down/40 bg-down/10 px-4 py-2 text-sm text-down">
                {error}
              </div>
            )}

            {loading ? (
              <ArchetypeGridSkeleton />
            ) : (
              <>
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
              </>
            )}
          </div>

          {loading ? (
            <StrategySidebarSkeleton />
          ) : (
            <StrategySidebar archetype={selectedArchetype} note={note} onNoteUpdated={setNote} />
          )}
        </div>
      </div>
    </main>
  );
}
