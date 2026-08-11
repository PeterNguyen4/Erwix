"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CheckCircle2, LogIn, LogOut } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { api, OnboardingDebrief, OnboardingScenario, OnboardingTrade } from "@/lib/api";
import ReplayControls from "@/components/backtesting/ReplayControls";
import RuleSignalToastStack from "@/components/RuleSignalToast";
import type { RuleSignal } from "@/lib/useRuleWatch";

const Chart = dynamic(() => import("@/components/Chart"), { ssr: false });

type Stage = "intro" | "trial" | "debrief";

export default function OnboardingPage() {
  const { completeOnboarding } = useAuth();
  const router = useRouter();

  const [stage, setStage] = useState<Stage>("intro");
  const [scenario, setScenario] = useState<OnboardingScenario | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [cursorIndex, setCursorIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(200);
  const [seenSignalKeys, setSeenSignalKeys] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<RuleSignal[]>([]);
  const [openTrade, setOpenTrade] = useState<{ time: number; price: number } | null>(null);
  const [trades, setTrades] = useState<OnboardingTrade[]>([]);

  const [debrief, setDebrief] = useState<OnboardingDebrief | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    api
      .onboardingScenario()
      .then(setScenario)
      .catch(() => setLoadError("Couldn't load the trial scenario. Please try again shortly."));
  }, []);

  useEffect(() => {
    if (!scenario || stage !== "trial") return;
    const candle = scenario.candles[cursorIndex];
    if (!candle) return;
    const fired = scenario.signals.filter(
      (s) => s.index === cursorIndex && !seenSignalKeys.has(`${s.kind}-${s.index}`),
    );
    if (fired.length === 0) return;
    setSeenSignalKeys((prev) => {
      const next = new Set(prev);
      fired.forEach((s) => next.add(`${s.kind}-${s.index}`));
      return next;
    });
    setToasts((prev) => [
      ...prev,
      ...fired.map((s) => ({
        id: `${s.kind}-${s.index}`,
        kind: s.kind,
        description: s.description,
        annotation: s.annotation,
      })),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorIndex, scenario, stage]);

  const dismissToast = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  const handleEnter = () => {
    if (!scenario || openTrade) return;
    const candle = scenario.candles[cursorIndex];
    if (!candle) return;
    setOpenTrade({ time: candle.time, price: candle.close });
  };

  const handleExit = () => {
    if (!scenario || !openTrade) return;
    const candle = scenario.candles[cursorIndex];
    if (!candle) return;
    setTrades((prev) => [
      ...prev,
      {
        enter_time: openTrade.time,
        enter_price: openTrade.price,
        exit_time: candle.time,
        exit_price: candle.close,
      },
    ]);
    setOpenTrade(null);
  };

  const finishTrial = async () => {
    if (!scenario) return;
    setPlaying(false);
    setSubmitting(true);
    const finalTrades = openTrade
      ? [
          ...trades,
          {
            enter_time: openTrade.time,
            enter_price: openTrade.price,
            exit_time: null,
            exit_price: null,
          },
        ]
      : trades;
    try {
      const result = await api.submitOnboardingDebrief(finalTrades);
      setDebrief(result);
      setStage("debrief");
    } catch {
      setLoadError("Couldn't generate your debrief. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const finishOnboarding = async () => {
    setFinishing(true);
    try {
      await api.savePreferences({ onboarding_completed_at: new Date().toISOString() });
      completeOnboarding();
      router.replace("/");
    } finally {
      setFinishing(false);
    }
  };

  const atEnd = scenario ? cursorIndex >= scenario.candles.length - 1 : false;

  return (
    <div className="flex h-screen w-full flex-col overflow-auto bg-bg">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-6">
        <header className="flex items-center justify-between">
          <div className="text-lg font-semibold text-fg">Welcome to Erwix</div>
          <button
            onClick={finishOnboarding}
            disabled={finishing}
            className="flex items-center gap-1.5 text-xs text-muted hover:text-fg disabled:opacity-50"
          >
            <LogOut size={14} strokeWidth={2} />
            Skip for now
          </button>
        </header>

        {loadError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
            {loadError}
          </div>
        )}

        {!scenario && !loadError && (
          <div className="flex flex-1 items-center justify-center text-sm text-muted">
            Loading your trial scenario…
          </div>
        )}

        {scenario && stage === "intro" && (
          <div className="flex flex-1 flex-col gap-4">
            <div className="rounded-lg border border-border bg-panel p-6">
              <h2 className="mb-3 text-lg font-semibold text-fg">{scenario.playbook.title}</h2>
              <div className="prose prose-sm prose-invert max-w-none text-sm text-fg">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{scenario.playbook.markdown}</ReactMarkdown>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-panel p-6">
              <h3 className="mb-3 text-sm font-semibold text-fg">The checklist</h3>
              <ul className="space-y-2">
                {scenario.playbook.checklist.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-fg">
                    <CheckCircle2 size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-accent" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-muted">
              Next, you&apos;ll replay a real historical window for {scenario.symbol} where this
              playbook played out. Watch for the signals, and trade however you see fit — the
              debrief afterward will reflect what you actually did.
            </p>
            <button
              onClick={() => setStage("trial")}
              className="flex items-center justify-center gap-1.5 self-start rounded-md bg-accent/20 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30 dark:text-violet-400"
            >
              <LogIn size={14} strokeWidth={2} />
              Start the trial run
            </button>
          </div>
        )}

        {scenario && stage === "trial" && (
          <div className="flex flex-1 flex-col gap-3">
            <div className="relative min-h-[420px] flex-1 rounded-lg border border-border bg-panel">
              <Chart candles={scenario.candles} cursorIndex={cursorIndex} symbol={scenario.symbol} />
              <RuleSignalToastStack signals={toasts} onDismiss={dismissToast} />
            </div>
            <ReplayControls
              total={scenario.candles.length}
              cursorIndex={cursorIndex}
              playing={playing}
              speedMs={speedMs}
              onCursorChange={setCursorIndex}
              onPlayingChange={setPlaying}
              onSpeedChange={setSpeedMs}
            />
            <div className="flex items-center justify-between rounded-lg border border-border bg-panel px-4 py-3">
              <div className="text-xs text-muted">
                {openTrade
                  ? `In a trade — entered at ${openTrade.price.toFixed(2)}`
                  : trades.length > 0
                    ? `${trades.length} trade${trades.length === 1 ? "" : "s"} so far`
                    : "No trade open — enter whenever you see fit"}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleEnter}
                  disabled={!!openTrade}
                  className="rounded-md bg-green-500/20 px-3 py-1.5 text-xs font-medium text-green-500 hover:bg-green-500/30 disabled:opacity-40"
                >
                  Enter
                </button>
                <button
                  onClick={handleExit}
                  disabled={!openTrade}
                  className="rounded-md bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/30 disabled:opacity-40"
                >
                  Exit
                </button>
                <button
                  onClick={finishTrial}
                  disabled={submitting || (!atEnd && trades.length === 0 && !openTrade)}
                  className="rounded-md bg-accent/20 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/30 disabled:opacity-40 dark:text-violet-400"
                >
                  {submitting ? "Finishing…" : atEnd ? "Finish trial" : "Skip to debrief"}
                </button>
              </div>
            </div>
          </div>
        )}

        {stage === "debrief" && debrief && (
          <div className="flex flex-1 flex-col gap-4">
            <div className="rounded-lg border border-border bg-panel p-6">
              <h2 className="mb-2 text-lg font-semibold text-fg">
                {debrief.classification === "perfect" && "Nice work"}
                {debrief.classification === "sat_out" && "Here's how it played out"}
                {debrief.classification === "mistimed" && "Let's break it down"}
              </h2>
              <p className="whitespace-pre-wrap text-sm text-fg">{debrief.debrief.summary}</p>
            </div>
            <p className="text-xs text-muted">
              In real trading, this session would have been automatically saved to your journal —
              every fill gets logged so you can review it later.
            </p>
            <button
              onClick={finishOnboarding}
              disabled={finishing}
              className="flex items-center justify-center gap-1.5 self-start rounded-md bg-accent/20 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30 disabled:opacity-50 dark:text-violet-400"
            >
              {finishing ? "Getting started…" : "Get started"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
