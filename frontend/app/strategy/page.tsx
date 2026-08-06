"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ChevronDown, NotebookPen, Plus, Search } from "lucide-react";
import { api, Archetype, StrategyNote, StrategyNoteSummary } from "@/lib/api";
import ArchetypeGrid from "@/components/strategy/ArchetypeGrid";
import StrategyEditor from "@/components/strategy/StrategyEditor";
import StrategyCard from "@/components/strategy/StrategyCard";
import StrategyLibraryGrid from "@/components/strategy/StrategyLibraryGrid";
import { presentationFor } from "@/components/strategy/presentation";

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

type View = "library" | "select";

export default function StrategyPage() {
  const [archetypes, setArchetypes] = useState<Archetype[]>([]);
  const [strategies, setStrategies] = useState<StrategyNoteSummary[]>([]);
  const [note, setNote] = useState<StrategyNote | null>(null);
  const [view, setView] = useState<View>("library");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"playbook" | "questions">("playbook");
  const [regenerating, setRegenerating] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [archetypeFilter, setArchetypeFilter] = useState<string>("all");
  const [archetypeFilterOpen, setArchetypeFilterOpen] = useState(false);

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
      const created = await api.createStrategy({
        name: "Untitled Strategy",
        archetype: archetypeId,
      });
      setNote(created);
      setView("library");
      setDrawerTab("questions");
      setDrawerOpen(true);
      await refreshList();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function rename(id: number, name: string) {
    setError(null);
    try {
      await api.renameStrategy(id, name);
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
      setDrawerTab(full.structured_summary ? "playbook" : "questions");
      setDrawerOpen(true);
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
      if (note?.id === id) {
        setDrawerOpen(false);
        setNote(null);
      }
      await refreshList();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setNote(null);
    setRuleError(null);
  }

  async function regeneratePlaybook() {
    if (!note) return;
    setRegenerating(true);
    setRuleError(null);
    try {
      const updated = await api.regenerateStrategy(note.id);
      setNote(updated);
      const rulesOut = await api.getStrategyRules(note.id);
      if (rulesOut.compile_error) setRuleError(rulesOut.compile_error);
    } finally {
      setRegenerating(false);
    }
  }

  const selectedArchetype = archetypes.find((a) => a.id === note?.archetype) ?? null;

  const filteredStrategies = strategies.filter((s) => {
    const matchesSearch = s.name.toLowerCase().includes(search.trim().toLowerCase());
    const matchesArchetype = archetypeFilter === "all" || s.archetype === archetypeFilter;
    return matchesSearch && matchesArchetype;
  });

  return (
    <main className="flex h-full flex-col">
      <header className="flex min-h-[60px] flex-wrap items-center justify-between gap-3 border-b border-auth-field/40 bg-panel px-4 py-3 shrink-0">
        <div className="text-xl font-normal text-fg">Strategy</div>

        {view === "library" && strategies.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="relative flex items-center">
              <button
                type="button"
                onClick={() => setArchetypeFilterOpen((o) => !o)}
                onBlur={() => setTimeout(() => setArchetypeFilterOpen(false), 150)}
                className={`flex items-center gap-1 rounded border bg-field px-3 py-2 text-sm text-fg transition-colors outline-none cursor-pointer ${
                  archetypeFilterOpen ? "border-violet-400" : "border-border"
                }`}
              >
                {archetypeFilter === "all" ? "All styles" : archetypes.find((a) => a.id === archetypeFilter)?.name}
                <ChevronDown size={12} strokeWidth={2} className="opacity-70" />
              </button>
              {archetypeFilterOpen && (
                <div className="absolute top-full left-0 z-30 mt-1 w-40 rounded-md border border-border bg-panel py-1 shadow-lg">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setArchetypeFilter("all");
                      setArchetypeFilterOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-xs transition-colors ${
                      archetypeFilter === "all" ? "bg-violet-500/20 text-fg" : "text-muted hover:bg-violet-500/10 hover:text-fg"
                    }`}
                  >
                    All styles
                  </button>
                  {archetypes.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setArchetypeFilter(a.id);
                        setArchetypeFilterOpen(false);
                      }}
                      className={`w-full px-3 py-1.5 text-left text-xs transition-colors ${
                        archetypeFilter === a.id ? "bg-violet-500/20 text-fg" : "text-muted hover:bg-violet-500/10 hover:text-fg"
                      }`}
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 rounded border border-border bg-field px-3 py-2 focus-within:border-violet-400">
              <Search size={14} strokeWidth={2} className="shrink-0 text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search strategies"
                className="w-40 bg-transparent text-sm text-fg placeholder:text-muted focus:outline-none"
              />
            </div>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-auto p-4">
        <div
          className={`flex flex-col gap-8 transition-[padding] duration-150 lg:flex-row ${
            drawerOpen ? "lg:pr-[592px]" : ""
          }`}
        >
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
                    <div className="flex min-h-[24rem] w-full flex-col items-center justify-center gap-4 px-6 text-center">
                      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
                        <NotebookPen size={26} strokeWidth={1.75} />
                      </span>
                      <div className="space-y-1.5">
                        <div className="text-base font-normal text-fg">What's your trading strategy?</div>
                        <p className="max-w-xs text-sm text-muted">
                          Define the setups, entry/exit rules, signals, and indicators you use to trade.
                          This is your game plan.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setDrawerOpen(false);
                          setNote(null);
                          setView("select");
                        }}
                        className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
                      >
                        <Plus size={16} strokeWidth={2.5} />
                        New Strategy
                      </button>
                    </div>
                  ) : filteredStrategies.length === 0 ? (
                    <div className="flex min-h-[10rem] w-full items-center justify-center rounded-xl border border-dashed border-border/60 bg-panel/20 text-sm text-muted">
                      No strategies match your search.
                    </div>
                  ) : (
                    <StrategyLibraryGrid
                      strategies={filteredStrategies}
                      archetypes={archetypes}
                      onEdit={startEdit}
                      onActivate={activate}
                      onDelete={remove}
                      onRename={rename}
                      onAdd={() => {
                        setDrawerOpen(false);
                        setNote(null);
                        setView("select");
                      }}
                    />
                  ))}

                {view === "select" && (
                  <div className="mx-auto max-w-[67rem]">
                    <button
                      onClick={() => setView("library")}
                      className="mb-4 flex items-center gap-1 text-xs text-muted transition-colors hover:text-fg"
                    >
                      <ArrowLeft size={12} strokeWidth={2} />
                      Back to library
                    </button>
                    <ArchetypeGrid archetypes={archetypes} selected={note?.archetype ?? null} onSelect={startCreate} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {drawerOpen && note && selectedArchetype && (() => {
        const presentation = presentationFor(selectedArchetype.id);
        const Icon = presentation.icon;
        return (
          <div className="fixed bottom-4 right-4 top-20 z-40 flex w-[560px] max-w-[calc(100vw-2rem)] animate-fade-in-up flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${presentation.color}22` }}
                >
                  <Icon size={16} strokeWidth={2} color={presentation.color} />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-fg">{note.name}</div>
                  <div className="truncate text-[10px] text-muted">{selectedArchetype.name}</div>
                </div>
              </div>
              <button
                onClick={closeDrawer}
                title="Close"
                className="rounded p-1 text-muted transition-colors hover:bg-border hover:text-fg"
              >
                ✕
              </button>
            </div>

            <div className="flex shrink-0 items-center gap-1 pl-3 pr-4 pt-2">
              {(["playbook", "questions"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setDrawerTab(tab)}
                  className={`rounded-t-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                    drawerTab === tab
                      ? "border-b-2 border-accent text-fg"
                      : "border-b-2 border-transparent text-muted hover:text-fg"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-auto p-4">
              {drawerTab === "playbook" ? (
                note.structured_summary ? (
                  <>
                    <StrategyCard
                      noteId={note.id}
                      summary={note.structured_summary}
                      onEdited={setNote}
                      onRegenerate={regeneratePlaybook}
                      regenerating={regenerating}
                    />
                    {ruleError && (
                      <div className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">
                        Rule compilation failed: {ruleError}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center">
                    <div className="text-xs text-muted">No playbook yet — answer the questions and generate one.</div>
                    <button
                      onClick={() => setDrawerTab("questions")}
                      className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent transition-colors hover:bg-accent/80"
                    >
                      Go to Questions
                    </button>
                  </div>
                )
              ) : (
                <StrategyEditor
                  archetype={selectedArchetype}
                  note={note}
                  onSaved={(updated) => {
                    setNote(updated);
                    setDrawerTab("playbook");
                  }}
                />
              )}
            </div>
          </div>
        );
      })()}
    </main>
  );
}
