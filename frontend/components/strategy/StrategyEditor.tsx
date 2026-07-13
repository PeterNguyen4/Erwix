"use client";

import { useState } from "react";
import { api, Archetype, StrategyNote } from "@/lib/api";
import StrategyCard from "./StrategyCard";

interface Props {
  archetype: string | null;
  archetypes: Archetype[];
  note: StrategyNote;
  onSaved: (note: StrategyNote) => void;
}

export default function StrategyEditor({ archetype, archetypes, note, onSaved }: Props) {
  const questions = archetypes.find((a) => a.id === archetype)?.questions ?? [];
  const isFreeform = questions.length === 0;

  const [body, setBody] = useState(note.body ?? "");
  const [answers, setAnswers] = useState<Record<string, string>>(note.answers ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasContent = isFreeform ? body.trim().length > 0 : Object.values(answers).some((v) => v?.trim());

  async function generate() {
    setSaving(true);
    setError(null);
    try {
      const saved = await api.saveStrategy(
        isFreeform ? { archetype, body } : { archetype, answers },
      );
      onSaved(saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function regenerate() {
    setSaving(true);
    setError(null);
    try {
      const saved = await api.regenerateStrategy();
      onSaved(saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      {isFreeform ? (
        <div>
          <label className="mb-2 block text-sm font-semibold text-white">
            Describe your strategy in your own words
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            placeholder="Entries you look for, how you size positions, when you cut losses, your typical holding period..."
            className="w-full resize-y rounded-lg border border-border bg-bg p-3 text-sm text-white placeholder:text-muted/60 focus:border-accent focus:outline-none"
          />
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q) => (
            <div key={q.id}>
              <label className="mb-1.5 block text-sm font-medium text-white">{q.prompt}</label>
              <textarea
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                rows={2}
                className="w-full resize-y rounded-lg border border-border bg-bg p-3 text-sm text-white focus:border-accent focus:outline-none"
              />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-down/40 bg-down/10 px-3 py-2 text-sm text-down">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={generate}
          disabled={saving || !hasContent}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent/80 disabled:opacity-50"
        >
          {saving ? "Generating…" : "Generate My Playbook"}
        </button>
        {note.summarized_at && (
          <span className="text-xs text-muted">
            Last generated {new Date(note.summarized_at).toLocaleString()}
          </span>
        )}
      </div>

      {note.structured_summary && (
        <StrategyCard summary={note.structured_summary} onRegenerate={regenerate} regenerating={saving} />
      )}
    </div>
  );
}
