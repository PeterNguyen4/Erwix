"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api, Archetype, StrategyNote, StrategyNoteSummary } from "@/lib/api";
import ArchetypeGrid from "@/components/strategy/ArchetypeGrid";
import StrategyEditor from "@/components/strategy/StrategyEditor";
import StrategySidebar from "@/components/strategy/StrategySidebar";
import StrategyLibraryGrid from "@/components/strategy/StrategyLibraryGrid";

function LibrarySkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-[10rem] animate-pulse rounded-xl border border-border bg-panel/40" />
      ))}
    </div>
  );
}

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

type View = "library" | "select" | "answer";

export default function StrategyPage() {
  const [archetypes, setArchetypes] = useState<Archetype[]>([]);
  const [strategies, setStrategies] = useState<StrategyNoteSummary[]>([]);
  const [note, setNote] = useState<StrategyNote | null>(null);
  const [view, setView] = useState<View>("library");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getArchetypes(), api.listStrategies()])
      .then(([a, s]) => {
        setArchetypes(a);
        setStrategies(s);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const refreshList = async () => setStrategies(await api.listStrategies());

  async function startCreate(archetypeId: string) {
    setError(null);
    try {
      const archetype = archetypes.find((a) => a.id === archetypeId);
      const created = await api.createStrategy({
        name: archetype ? `${archetype.name} Strategy` : "My Strategy",
        archetype: archetypeId,
      });
      setNote(created);
      setView("answer");
      await refreshList();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function startEdit(id: number) {
    setError(null);
    try {
      const full = await api.getStrategyById(id);
      setNote(full);
      setView("answer");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function activate(id: number) {
    setError(null);
    try {
      await api.activateStrategy(id);
      await refreshList();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(id: number) {
    setError(null);
    try {
      await api.deleteStrategy(id);
      await refreshList();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const selectedArchetype = archetypes.find((a) => a.id === note?.archetype) ?? null;

  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center min-h-[60px] border-b border-auth-field/40 bg-panel px-4 py-3 shrink-0">
        <div className="text-xl font-normal text-fg">Strategy</div>
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
              view === "library" ? <LibrarySkeleton /> : <ArchetypeGridSkeleton />
            ) : (
              <>
                {view === "library" &&
                  (strategies.length === 0 ? (
                    <button
                      onClick={() => setView("select")}
                      className="flex min-h-[16rem] w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 bg-panel/20 text-muted transition-colors hover:border-accent/60 hover:text-fg"
                    >
                      <Plus size={28} strokeWidth={2} />
                      <span className="text-base font-medium">Add Strategy</span>
                    </button>
                  ) : (
                    <StrategyLibraryGrid
                      strategies={strategies}
                      onEdit={startEdit}
                      onActivate={activate}
                      onDelete={remove}
                      onAdd={() => setView("select")}
                    />
                  ))}

                {view === "select" && (
                  <>
                    <button
                      onClick={() => setView("library")}
                      className="mb-4 flex items-center gap-1 text-xs text-muted transition-colors hover:text-fg"
                    >
                      ← Back to library
                    </button>
                    <ArchetypeGrid archetypes={archetypes} selected={note?.archetype ?? null} onSelect={startCreate} />
                  </>
                )}

                {view === "answer" && note && selectedArchetype && (
                  <StrategyEditor
                    archetype={selectedArchetype}
                    note={note}
                    onSaved={setNote}
                    onBack={() => setView("library")}
                  />
                )}
              </>
            )}
          </div>

          {view !== "library" && (
            <StrategySidebar archetype={selectedArchetype} note={note} onNoteUpdated={setNote} />
          )}
        </div>
      </div>
    </main>
  );
}
