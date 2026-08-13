"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  ListChecks,
  MinusCircle,
  PartyPopper,
  Sliders,
  Sparkles,
  StickyNote,
  User,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import {
  api,
  ChartAnnotation,
  OnboardingChecklistResult,
  OnboardingDebrief,
  OnboardingScenario,
  OnboardingTrade,
} from "@/lib/api";
import SpotlightOverlay from "@/components/journal/SpotlightOverlay";
import CoachMark from "@/components/onboarding/CoachMark";
import type { RuleSignal } from "@/lib/useRuleWatch";

const Chart = dynamic(() => import("@/components/Chart"), { ssr: false });

type Stage =
  | "welcome"
  | "experience"
  | "style"
  | "gameplan"
  | "story"
  | "trial"
  | "generating"
  | "debrief";

type Experience = "Pro" | "Advanced" | "Intermediate" | "Beginner";
type TradingStyle = "Ambitious" | "Balanced" | "Steady" | "Simple";

type FeedItem =
  | { kind: "signal"; id: string; time: number; signalKind: "entry" | "exit"; text: string }
  | { kind: "trade"; id: string; time: number; action: "buy" | "sell"; price: number };

const ENTER_SELECTOR = '[data-onboarding="enter-button"]';
const EXIT_SELECTOR = '[data-onboarding="exit-button"]';
const TRADE_ACTIONS_SELECTOR = '[data-onboarding="trade-actions"]';
const CHART_SELECTOR = '[data-onboarding="chart"]';
const CHECKLIST_SELECTOR = '[data-onboarding="checklist-toggle"]';
const TOAST_SELECTOR = '[data-onboarding="signal-toast"]';
const COUNTDOWN_START = 3;
const COUNTDOWN_STEP_MS = 800;
const RESUME_DELAY_MS = 1500;
const RESUME_STEP_MS = 1000;
const RESUME_COUNTDOWN_START = 10;
const CONGRATS_MS = 3000;
const HINT_DISMISS_MS = 4000;
const CHECKLIST_STAGGER_MS = 1500;
const TRIAL_AUTOPLAY_MS = 1300;
const SLOW_AUTOPLAY_MS = 2800;
const TRIAL_VISIBLE_CANDLES = 28;
const SIGNAL_SNAP_TOLERANCE = 2;
const GENERATING_MESSAGES = [
  "Reviewing your trial run...",
  "Scoring each part of the playbook...",
  "Almost ready...",
];

const EXPERIENCE_OPTIONS: { value: Experience; blurb: string }[] = [
  { value: "Beginner", blurb: "You're ready to learn" },
  { value: "Intermediate", blurb: "You want to polish your skills" },
  { value: "Advanced", blurb: "You've got a system that works well" },
  { value: "Pro", blurb: "You trade for a living, or close to it" },
];

const STYLE_OPTIONS: { value: TradingStyle; blurb: string }[] = [
  { value: "Simple", blurb: "Short and sweet plan that's proven to work" },
  { value: "Steady", blurb: "Preserving capital with consistency" },
  { value: "Balanced", blurb: "Growth and controlled risk" },
  { value: "Ambitious", blurb: "Higher risk and frequency, higher rewards" },
];

const STYLE_AFFIRMATIONS: Record<TradingStyle, { headline: string; body: string }> = {
  Ambitious: {
    headline: "Fortune favors the bold.",
    body: "Let's build a strategy that matches your continous search for new opportunities.",
  },
  Balanced: {
    headline: "Balance is key.",
    body: "Let's set you up with a strategy for growth and controlled risk.",
  },
  Steady: {
    headline: "Consistency compounds.",
    body: "Let's set you up with a strategy to stack steady wins.",
  },
  Simple: {
    headline: "Simple is best.",
    body: "Let's set you up with a strategy that's easy to learn and follow.",
  },
};

const WIZARD_STEPS: { stage: Stage; heading: string; subheading: string; icon: typeof Sparkles }[] = [
  { stage: "experience", heading: "Personal Details", subheading: "Provide your trading experience", icon: User },
  { stage: "style", heading: "Style", subheading: "Describe your trading preference", icon: Sliders },
  { stage: "gameplan", heading: "Game plan", subheading: "Review notes and reminders", icon: StickyNote },
  { stage: "story", heading: "Playbook", subheading: "Start learning and using your plan", icon: ListChecks },
];

const MOCK_TOAST: RuleSignal = {
  id: "mock-toast",
  kind: "entry",
  description: "EMA 20 crossed above EMA 50 — confluence stacked, good time to enter",
  annotation: { type: "marker", time: 0, price: 0, label: "", color: "#26a69a" },
};

const WALKTHROUGH_ITEMS: { selector: string; message: string; mockToast?: boolean }[] = [
  {
    selector: CHART_SELECTOR,
    message: "The chart will run on its own, like a live market. You can't pause or rewind.",
  },
  {
    selector: TOAST_SELECTOR,
    message: "Signals show up as messages here as they happen. When one lands, that's your cue to act.",
    mockToast: true,
  },
  {
    selector: TOAST_SELECTOR,
    message: "Wait patiently for the signal to enter and exit at the right time.",
    mockToast: true,
  },
  {
    selector: TRADE_ACTIONS_SELECTOR,
    message: "Enter and exit are yours to call. Remember that the signal messages will be there to help.",
    mockToast: true,
  },
  {
    selector: CHECKLIST_SELECTOR,
    message: "The playbook is always here for reference.",
  },
  {
    selector: CHART_SELECTOR,
    message: "Now it's your turn. Wait for the signals to enter and exit at the right time. Best of luck!",
  },
];

const CHECKLIST_ICON: Record<OnboardingChecklistResult["status"], typeof CheckCircle2> = {
  met: CheckCircle2,
  missed: XCircle,
  not_attempted: MinusCircle,
};

const CHECKLIST_COLOR: Record<OnboardingChecklistResult["status"], string> = {
  met: "text-green-500",
  missed: "text-red-500",
  not_attempted: "text-muted",
};

const CONFETTI_COLORS = ["#f87171", "#fb923c", "#facc15", "#4ade80", "#38bdf8", "#a78bfa", "#f472b6"];
const CONFETTI_PIECES = Array.from({ length: 18 }, (_, i) => ({
  left: (i * 61) % 100,
  top: (i * 23) % 40,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  delay: (i % 7) * 0.08,
  duration: 1.1 + (i % 5) * 0.15,
  rotate: (i * 89) % 360,
  size: i % 3 === 0 ? 9 : 6,
}));

const PROGRESS_STORAGE_KEY = "erwix-onboarding-progress";
const STAGE_RESTORE_CEILING: Partial<Record<Stage, Stage>> = {
  trial: "story",
  generating: "story",
  debrief: "story",
};

interface StoredProgress {
  stage: Stage;
  experience: Experience | null;
  style: TradingStyle | null;
}

function renderStoryBody(body: string): React.ReactNode {
  return body.split("\n").map((line, lineIndex, lines) => (
    <span key={lineIndex}>
      {line.split(/(\*\*[^*]+\*\*)/g).map((chunk, i) =>
        chunk.startsWith("**") && chunk.endsWith("**") ? (
          <span key={i} className="font-normal italic text-accent dark:text-violet-400">
            {chunk.slice(2, -2)}
          </span>
        ) : (
          <span key={i}>{chunk}</span>
        ),
      )}
      {lineIndex < lines.length - 1 && <br />}
    </span>
  ));
}

export default function OnboardingPage() {
  const { completeOnboarding } = useAuth();
  const router = useRouter();

  const [stage, setStage] = useState<Stage>("welcome");
  const [experience, setExperience] = useState<Experience | null>(null);
  const [style, setStyle] = useState<TradingStyle | null>(null);
  const [storyIndex, setStoryIndex] = useState(0);
  const [scenario, setScenario] = useState<OnboardingScenario | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [cursorIndex, setCursorIndex] = useState(0);
  const [seenSignalKeys, setSeenSignalKeys] = useState<Set<string>>(new Set());
  const [toastedKinds, setToastedKinds] = useState<Set<"entry" | "exit">>(new Set());
  const [toasts, setToasts] = useState<RuleSignal[]>([]);
  const [openTrade, setOpenTrade] = useState<{ time: number; price: number } | null>(null);
  const [trades, setTrades] = useState<OnboardingTrade[]>([]);
  const [bracket, setBracket] = useState<{
    entryPrice: number;
    stopLossPrice: number | null;
    takeProfitPrice: number | null;
    entryTime: number;
  } | null>(null);
  const [coach, setCoach] = useState<{ selector: string; message: string; spotlight?: boolean } | null>(null);
  const [awaitingAction, setAwaitingAction] = useState(false);
  const [resumeCountdown, setResumeCountdown] = useState<number | null>(null);
  const [introStarted, setIntroStarted] = useState(false);
  const [introStep, setIntroStep] = useState(0);
  const [introDone, setIntroDone] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showCongrats, setShowCongrats] = useState(false);

  const [generatingMessageIndex, setGeneratingMessageIndex] = useState(0);
  const [debrief, setDebrief] = useState<OnboardingDebrief | null>(null);
  const [finishing, setFinishing] = useState(false);

  const tradesRef = useRef(trades);
  tradesRef.current = trades;
  const openTradeRef = useRef(openTrade);
  openTradeRef.current = openTrade;
  const finishedRef = useRef(false);
  const narratedIndexRef = useRef<number>(-1);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const breakoutIndex = scenario ? scenario.checklist_stage.findIndex((s) => s >= 1) : -1;
  const pullbackIndex = scenario ? scenario.checklist_stage.findIndex((s) => s >= 2) : -1;
  const exitSignalIndex = scenario ? (scenario.signals.find((s) => s.kind === "exit")?.index ?? -1) : -1;
  const slowdownStartIndex = breakoutIndex >= 0 ? Math.max(0, breakoutIndex - 3) : -1;

  useEffect(() => {
    api
      .onboardingScenario()
      .then((s) => {
        setScenario(s);
        setCursorIndex(s.trial_start_index);
      })
      .catch(() => setLoadError("Couldn't load the trial scenario. Please try again shortly."));
  }, []);

// Restore progress on refresh
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PROGRESS_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as StoredProgress;
      const restoredStage = STAGE_RESTORE_CEILING[saved.stage] ?? saved.stage;
      if (restoredStage === "welcome") return;
      setExperience(saved.experience);
      setStyle(saved.style);
      setStage(restoredStage);
    } catch {
      // corrupt or inaccessible storage — just start fresh
    }
  }, []);

  useEffect(() => {
    if (stage === "welcome") {
      sessionStorage.removeItem(PROGRESS_STORAGE_KEY);
      return;
    }
    const progress: StoredProgress = { stage, experience, style };
    sessionStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  }, [stage, experience, style]);

  useEffect(() => {
    if (stage !== "trial" || countdown !== null) return;
    if (!introStarted) {
      setCoach({ selector: CHART_SELECTOR, message: "Welcome to the trial! Ready to see how this works?" });
      return;
    }
    if (introStep >= WALKTHROUGH_ITEMS.length) return;
    setCoach(WALKTHROUGH_ITEMS[introStep]);
  }, [stage, introStarted, introStep, countdown]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      setIntroDone(true);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c ?? 1) - 1), COUNTDOWN_STEP_MS);
    return () => clearTimeout(t);
  }, [countdown]);

  const handleIntroNext = () => {
    if (!introStarted) {
      setIntroStarted(true);
      return;
    }
    if (introStep >= WALKTHROUGH_ITEMS.length - 1) {
      setCoach(null);
      setIntroStep(WALKTHROUGH_ITEMS.length);
      setCountdown(COUNTDOWN_START);
    } else {
      setIntroStep((i) => i + 1);
    }
  };

  useEffect(() => {
    if (!introDone) return;
    const hintMessage = "Remember to wait for the signal.";
    setCoach({ selector: TRADE_ACTIONS_SELECTOR, message: hintMessage, spotlight: false });
    const t = setTimeout(() => {
      setCoach((prev) => (prev?.message === hintMessage ? null : prev));
    }, HINT_DISMISS_MS);
    return () => clearTimeout(t);
  }, [introDone]);

  useEffect(() => {
    if (stage !== "trial" || !scenario || !introDone || awaitingAction) return;
    const total = scenario.candles.length;
    const isSlow =
      slowdownStartIndex >= 0 &&
      cursorIndex >= slowdownStartIndex &&
      (exitSignalIndex < 0 || cursorIndex < exitSignalIndex);
    const t = setTimeout(() => {
      setCursorIndex((i) => Math.min(i + 1, total - 1));
    }, isSlow ? SLOW_AUTOPLAY_MS : TRIAL_AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [stage, scenario, introDone, awaitingAction, cursorIndex, slowdownStartIndex, exitSignalIndex]);

  useEffect(() => {
    if (!awaitingAction) {
      setResumeCountdown(null);
      return;
    }
    const t = setTimeout(() => setResumeCountdown(RESUME_COUNTDOWN_START), RESUME_DELAY_MS);
    return () => clearTimeout(t);
  }, [awaitingAction]);

  useEffect(() => {
    if (resumeCountdown === null) return;
    if (resumeCountdown <= 0) {
      setResumeCountdown(null);
      setAwaitingAction(false);
      setCoach(null);
      return;
    }
    const t = setTimeout(() => setResumeCountdown((c) => (c ?? 1) - 1), RESUME_STEP_MS);
    return () => clearTimeout(t);
  }, [resumeCountdown]);

  useEffect(() => {
    if (stage !== "trial" || !scenario || !introDone || awaitingAction) return;
    if (cursorIndex === narratedIndexRef.current) return;

    let message: string | null = null;
    if (slowdownStartIndex >= 0 && cursorIndex === slowdownStartIndex) {
      message = "Here we go! I'm slowing it down for you.";
    } else if (breakoutIndex >= 0 && cursorIndex === breakoutIndex) {
      message = "Breakout! Price just closed above the 50 EMA.";
    } else if (pullbackIndex >= 0 && cursorIndex === pullbackIndex) {
      message = "Real pullback! I drew the horizontal line for you.";
    }
    if (message == null) return;
    narratedIndexRef.current = cursorIndex;

    const text = message;
    setCoach({ selector: CHART_SELECTOR, message: text, spotlight: true });
    const t = setTimeout(() => {
      setCoach((prev) => (prev?.message === text ? null : prev));
    }, HINT_DISMISS_MS);
    return () => clearTimeout(t);
  }, [cursorIndex, scenario, stage, introDone, awaitingAction, slowdownStartIndex, breakoutIndex, pullbackIndex]);

  useEffect(() => {
    if (!scenario || stage !== "trial" || !introDone) return;
    const candle = scenario.candles[cursorIndex];
    if (!candle) return;
    const fired = scenario.signals.filter(
      (s) => s.index === cursorIndex && !seenSignalKeys.has(`${s.kind}-${s.index}`),
    );
    if (fired.length > 0) {
      setSeenSignalKeys((prev) => {
        const next = new Set(prev);
        fired.forEach((s) => next.add(`${s.kind}-${s.index}`));
        return next;
      });

      const toastable = fired.filter((s) => !s.is_confirmation && !toastedKinds.has(s.kind));
      if (toastable.length > 0) {
        setToastedKinds((prev) => {
          const next = new Set(prev);
          toastable.forEach((s) => next.add(s.kind));
          return next;
        });
        setToasts((prev) => [
          ...prev,
          ...toastable.map((s) => ({
            id: `${s.kind}-${s.index}`,
            kind: s.kind,
            description: s.description,
            annotation: s.annotation,
          })),
        ]);
      }

      const entryFired = fired.some((s) => s.kind === "entry");
      const exitFired = fired.some((s) => s.kind === "exit");
      if (entryFired && !openTrade) {
        setAwaitingAction(true);
        setCoach({
          selector: ENTER_SELECTOR,
          message: "It's go time. I'll set the 1:2 stop-loss and take-profit. Tap Enter to take the trade.",
          spotlight: true,
        });
      } else if (exitFired && openTrade) {
        setAwaitingAction(true);
        setCoach({ selector: EXIT_SELECTOR, message: "We hit our take profit! Tap Exit to close out" });
      }
    }

    if (cursorIndex >= scenario.candles.length - 1) {
      finishTrial();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorIndex, scenario, stage]);

  useEffect(() => {
    if (stage !== "generating") return;
    const t = setInterval(() => {
      setGeneratingMessageIndex((i) => (i + 1) % GENERATING_MESSAGES.length);
    }, 3000);
    return () => clearInterval(t);
  }, [stage]);

  const handleEnter = () => {
    if (!scenario || openTrade) return;
    const candle = scenario.candles[cursorIndex];
    if (!candle) return;
    setOpenTrade({ time: candle.time, price: candle.close });
    setAwaitingAction(false);
    setResumeCountdown(null);

    const entrySignal = scenario.signals.find(
      (s) => s.kind === "entry" && Math.abs(s.index - cursorIndex) <= SIGNAL_SNAP_TOLERANCE,
    );
    if (entrySignal?.stop_loss_price != null && entrySignal?.take_profit_price != null) {
      setBracket({
        entryPrice: candle.close,
        stopLossPrice: entrySignal.stop_loss_price,
        takeProfitPrice: entrySignal.take_profit_price,
        entryTime: candle.time,
      });
    }
    setCoach(null);
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
    setBracket(null);
    setAwaitingAction(false);
    setResumeCountdown(null);

    const speedMessage = "Speeding back up to normal...";
    setCoach({ selector: CHART_SELECTOR, message: speedMessage, spotlight: false });
    setTimeout(() => {
      setCoach((prev) => (prev?.message === speedMessage ? null : prev));
    }, HINT_DISMISS_MS);
  };

  const finishTrial = async () => {
    if (!scenario || finishedRef.current) return;
    finishedRef.current = true;
    setShowCongrats(true);
    await new Promise((resolve) => setTimeout(resolve, CONGRATS_MS));
    setShowCongrats(false);
    setStage("generating");
    const currentTrades = tradesRef.current;
    const currentOpenTrade = openTradeRef.current;
    const finalTrades = currentOpenTrade
      ? [
          ...currentTrades,
          {
            enter_time: currentOpenTrade.time,
            enter_price: currentOpenTrade.price,
            exit_time: null,
            exit_price: null,
          },
        ]
      : currentTrades;
    try {
      const result = await api.submitOnboardingDebrief(finalTrades);
      setDebrief(result);
      setStage("debrief");
    } catch {
      setLoadError("Couldn't generate your debrief. Please try again.");
      finishedRef.current = false;
      setStage("trial");
    }
  };

  const finishOnboarding = async () => {
    setFinishing(true);
    try {
      await api.savePreferences({ onboarding_completed_at: new Date().toISOString() });
      sessionStorage.removeItem(PROGRESS_STORAGE_KEY);
      completeOnboarding();
      router.replace("/");
    } finally {
      setFinishing(false);
    }
  };

  const storySlideCount = scenario ? scenario.playbook.story.length + 1 : 0;
  const onChecklistStep = scenario ? storyIndex === scenario.playbook.story.length : false;
  const currentWizardIndex = WIZARD_STEPS.findIndex((s) => s.stage === stage);
  const showWizardSteps = currentWizardIndex !== -1;
  const showingMockToast =
    introStarted && !introDone && countdown === null && WALKTHROUGH_ITEMS[introStep]?.mockToast === true;

  const revealedLines: ChartAnnotation[] = scenario
    ? scenario.horizontal_lines
        .filter((l) => (l.index ?? 0) <= cursorIndex)
        .map((l) => ({ ...l, label: undefined }))
    : [];

  const tradeAnnotations: ChartAnnotation[] = [
    ...trades.flatMap((t): ChartAnnotation[] => [
      { type: "marker", time: t.enter_time, price: t.enter_price, label: "Buy", color: "#26a69a" },
      ...(t.exit_time !== null && t.exit_price !== null
        ? ([{ type: "marker", time: t.exit_time, price: t.exit_price, label: "Sell", color: "#ef5350" }] as ChartAnnotation[])
        : []),
    ]),
    ...(openTrade
      ? [{ type: "marker", time: openTrade.time, price: openTrade.price, label: "Buy", color: "#26a69a" } as ChartAnnotation]
      : []),
    ...revealedLines,
  ];

  const feedItems: FeedItem[] = [
    ...toasts.map(
      (t): FeedItem => ({
        kind: "signal",
        id: t.id,
        time: t.annotation.time,
        signalKind: t.kind,
        text: t.description,
      }),
    ),
    ...trades.flatMap((t, i): FeedItem[] => [
      { kind: "trade", id: `buy-${i}-${t.enter_time}`, time: t.enter_time, action: "buy", price: t.enter_price },
      ...(t.exit_time != null && t.exit_price != null
        ? ([
            {
              kind: "trade",
              id: `sell-${i}-${t.exit_time}`,
              time: t.exit_time,
              action: "sell",
              price: t.exit_price,
            },
          ] as FeedItem[])
        : []),
    ]),
    ...(openTrade
      ? [{ kind: "trade", id: `buy-open-${openTrade.time}`, time: openTrade.time, action: "buy", price: openTrade.price } as FeedItem]
      : []),
    ...(showingMockToast
      ? [{ kind: "signal", id: MOCK_TOAST.id, time: 0, signalKind: MOCK_TOAST.kind, text: MOCK_TOAST.description } as FeedItem]
      : []),
  ].sort((a, b) => a.time - b.time);

  const feedItemCount = feedItems.length;
  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [feedItemCount]);

  const visibleRange = scenario
    ? {
        from: scenario.candles[Math.max(0, cursorIndex - TRIAL_VISIBLE_CANDLES)].time,
        to: scenario.candles[cursorIndex].time,
      }
    : null;

  return (
    <div className="flex h-screen w-full flex-col overflow-auto bg-bg">
      <div className="flex w-full flex-1 gap-8 p-8">
        <div key={stage} className="flex flex-1 flex-col gap-6 animate-slide-in-right">
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

        {scenario && stage === "welcome" && (
          <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 text-center">
            <div className="mb-2 text-3xl font-semibold tracking-tight text-fg">Welcome to Erwix</div>
            <p className="text-base leading-relaxed text-muted">
              Build your strategy, then automate journaling and analysis with AI.
            </p>
            <button
              onClick={() => setStage("experience")}
              className="mt-6 flex items-center justify-center gap-1.5 rounded-lg bg-accent px-8 py-3 text-sm font-medium text-on-accent hover:bg-accent/90"
            >
              Get started
            </button>
          </div>
        )}

        {scenario && stage === "experience" && (
          <StepWizardCard
            onBack={() => setStage("welcome")}
            onContinue={() => setStage("style")}
            continueDisabled={!experience}
          >
            <h1 className="mb-6 text-2xl font-medium tracking-tight text-fg">
              What is your experience with trading?
            </h1>
            <OptionGrid>
              {EXPERIENCE_OPTIONS.map((opt) => (
                <OptionCard
                  key={opt.value}
                  label={opt.value}
                  blurb={opt.blurb}
                  selected={experience === opt.value}
                  onClick={() => setExperience(opt.value)}
                />
              ))}
            </OptionGrid>
          </StepWizardCard>
        )}

        {scenario && stage === "style" && (
          <StepWizardCard
            onBack={() => setStage("experience")}
            onContinue={() => setStage("gameplan")}
            continueDisabled={!style}
          >
            <h1 className="mb-6 text-2xl font-medium tracking-tight text-fg">
              What is your trading style?
            </h1>
            <OptionGrid>
              {STYLE_OPTIONS.map((opt) => (
                <OptionCard
                  key={opt.value}
                  label={opt.value}
                  blurb={opt.blurb}
                  selected={style === opt.value}
                  onClick={() => setStyle(opt.value)}
                />
              ))}
            </OptionGrid>
          </StepWizardCard>
        )}

        {scenario && stage === "gameplan" && style && (
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 text-center">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted">The game plan</div>
            <h1 className="text-3xl font-normal leading-snug tracking-tight text-fg">
              <span className="text-accent dark:text-violet-400">
                {STYLE_AFFIRMATIONS[style].headline}
              </span>
            </h1>
            <p className="text-base leading-relaxed text-muted">{STYLE_AFFIRMATIONS[style].body}</p>
            <button
              onClick={() => setStage("story")}
              className="mt-6 flex items-center justify-center gap-1.5 rounded-lg bg-accent px-8 py-3 text-sm font-medium text-on-accent hover:bg-accent/90"
            >
              See your playbook
              <ChevronRight size={14} strokeWidth={2} />
            </button>
          </div>
        )}

        {scenario && stage === "story" && (
          <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6">
            <div className="text-sm font-medium text-muted">{scenario.playbook.title}</div>

            <div className="flex min-h-[240px] flex-col justify-center rounded-xl border border-border bg-bg p-8">
              <div key={storyIndex} className="animate-slide-in-right">
                {!onChecklistStep ? (
                  <>
                    <h2 className="mb-4 text-xl font-semibold tracking-tight text-fg">
                      {scenario.playbook.story[storyIndex].heading}
                    </h2>
                    {scenario.playbook.story[storyIndex].image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={scenario.playbook.story[storyIndex].image!}
                        alt=""
                        className="mb-4 max-h-40 w-full rounded-lg object-contain"
                      />
                    )}
                    <div className="text-base leading-relaxed text-fg">
                      {renderStoryBody(scenario.playbook.story[storyIndex].body)}
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="mb-4 text-xl font-semibold tracking-tight text-fg">Your checklist</h2>
                    <ul className="space-y-3">
                      {scenario.playbook.checklist.map((item) => (
                        <li key={item} className="flex items-start gap-2.5 text-sm text-fg">
                          <CheckCircle2 size={17} strokeWidth={2} className="mt-0.5 shrink-0 text-accent" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center justify-center gap-2">
              {Array.from({ length: storySlideCount }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full transition-colors ${
                    i === storyIndex ? "bg-accent" : "bg-border"
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() =>
                  storyIndex === 0 ? setStage("gameplan") : setStoryIndex((i) => i - 1)
                }
                className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-muted hover:text-fg"
              >
                <ChevronLeft size={14} strokeWidth={2} />
                Back
              </button>
              {!onChecklistStep ? (
                <button
                  onClick={() => setStoryIndex((i) => i + 1)}
                  className="flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-on-accent hover:bg-accent/90"
                >
                  Next
                  <ChevronRight size={14} strokeWidth={2} />
                </button>
              ) : (
                <button
                  onClick={() => {
                    setIntroStep(0);
                    setIntroDone(false);
                    setStage("trial");
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-on-accent hover:bg-accent/90"
                >
                  Start the trial
                  <ChevronRight size={14} strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        )}

        {scenario && stage === "trial" && (
          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-3">
            {coach && !introStarted && <WelcomeOverlay message={coach.message} onNext={handleIntroNext} />}
            <div className="flex gap-3">
              <div
                data-onboarding="checklist-toggle"
                title="Playbook checklist"
                className="w-64 shrink-0 overflow-hidden rounded-xl border border-border bg-bg p-4"
              >
                <div className="mb-3 text-sm font-semibold text-muted">Checklist</div>
                <ul className="space-y-3">
                  {scenario.playbook.checklist.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-xs leading-snug text-fg">
                      <CheckCircle2 size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-accent dark:text-violet-400" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div data-onboarding="chart" className="relative h-[400px] flex-1 rounded-xl border border-border bg-bg">
                <Chart
                  candles={scenario.candles}
                  cursorIndex={cursorIndex}
                  symbol={scenario.symbol}
                  requiredIndicators={scenario.chart_indicators}
                  annotations={tradeAnnotations}
                  bracket={bracket}
                  visibleRange={visibleRange}
                  hideToolbar
                  lockIndicators
                  hideIndicatorBadges
                />

                {coach && introStarted && (
                  <>
                    {coach.spotlight !== false && <SpotlightOverlay targetSelector={coach.selector} />}
                    <CoachMark
                      key={coach.message}
                      targetSelector={coach.selector}
                      message={coach.message}
                      onNext={!introDone && countdown === null ? handleIntroNext : undefined}
                      nextLabel={introStep >= WALKTHROUGH_ITEMS.length - 1 ? "Start the trial" : "Next"}
                    />
                  </>
                )}

                {resumeCountdown !== null && (
                  <div
                    key={resumeCountdown}
                    className="pointer-events-none absolute bottom-4 right-4 z-40 flex animate-pop-in items-center gap-2 rounded-full border-2 border-accent bg-bg px-4 py-2 text-sm font-bold text-accent shadow-xl dark:border-violet-400 dark:text-violet-400"
                  >
                    Resuming in {resumeCountdown}...
                  </div>
                )}

                {countdown !== null && (
                  <div className="pointer-events-none absolute inset-0 z-50 grid place-items-center rounded-xl bg-bg/50 backdrop-blur-sm">
                    <span key={countdown} className="animate-pop-in text-7xl font-bold text-accent">
                      {countdown}
                    </span>
                  </div>
                )}

                {showCongrats && (
                  <div className="pointer-events-none absolute inset-0 z-50 grid place-items-center overflow-hidden rounded-xl bg-bg/60 px-6 backdrop-blur-sm">
                    <div className="absolute inset-x-0 -top-4 h-32 overflow-visible">
                      {CONFETTI_PIECES.map((p, i) => (
                        <span
                          key={i}
                          className="absolute animate-confetti-fall rounded-sm"
                          style={{
                            left: `${p.left}%`,
                            top: `${p.top}%`,
                            width: p.size,
                            height: p.size * 2,
                            backgroundColor: p.color,
                            animationDelay: `${p.delay}s`,
                            animationDuration: `${p.duration}s`,
                            transform: `rotate(${p.rotate}deg)`,
                          }}
                        />
                      ))}
                    </div>
                    <span className="relative z-10 animate-pop-in text-center text-xl font-bold text-accent dark:text-violet-400">
                      Congrats on your first Erwix trade!
                    </span>
                  </div>
                )}
              </div>

              <div
                data-onboarding="signal-toast"
                title="Trade chat"
                className="flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-bg"
              >
                <div className="shrink-0 border-b border-border px-4 py-2.5 text-sm font-semibold text-muted">
                  Trade chat
                </div>
                <div ref={chatScrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
                  {feedItems.length === 0 && (
                    <p className="text-xs leading-relaxed text-muted">
                      Signals and your trades will show up here as they happen.
                    </p>
                  )}
                  {feedItems.map((item) =>
                    item.kind === "signal" ? (
                      <div
                        key={item.id}
                        className="flex animate-fade-in-up items-start gap-2 rounded-lg bg-field px-3 py-2 text-xs"
                      >
                        <span
                          className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: item.signalKind === "entry" ? "#26a69a" : "#ef5350" }}
                        />
                        <p className="leading-snug text-fg">{item.text}</p>
                      </div>
                    ) : (
                      <div key={item.id} className="flex animate-fade-in-up justify-end">
                        <div className="max-w-[85%] rounded-lg bg-accent/20 px-3 py-2 text-xs text-fg dark:bg-violet-500/20">
                          {item.action === "buy" ? "Bought" : "Sold"} at ${item.price.toFixed(2)}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border bg-bg p-4">
              <div>
                <div className="text-xs font-semibold text-muted">Your position</div>
                <div className="mt-0.5 text-sm text-fg">
                  {openTrade
                    ? `In a trade — entered at ${openTrade.price.toFixed(2)}`
                    : trades.length > 0
                      ? `${trades.length} trade${trades.length === 1 ? "" : "s"} so far`
                      : "Watching for a signal..."}
                </div>
              </div>
              <div data-onboarding="trade-actions" className="flex items-center gap-2">
                <button
                  data-onboarding="enter-button"
                  title="Open a simulated position at the current price"
                  onClick={handleEnter}
                  disabled={!!openTrade || !introDone}
                  className={`rounded-md bg-green-500/20 px-4 py-2 text-sm font-medium text-green-500 hover:bg-green-500/30 disabled:opacity-40 ${
                    awaitingAction && !openTrade
                      ? "animate-pulse ring-2 ring-green-400 ring-offset-2 ring-offset-bg"
                      : ""
                  }`}
                >
                  Enter
                </button>
                <button
                  data-onboarding="exit-button"
                  title="Close your simulated position at the current price"
                  onClick={handleExit}
                  disabled={!openTrade || !introDone}
                  className={`rounded-md bg-red-500/20 px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-500/30 disabled:opacity-40 ${
                    awaitingAction && openTrade
                      ? "animate-pulse ring-2 ring-red-400 ring-offset-2 ring-offset-bg"
                      : ""
                  }`}
                >
                  Exit
                </button>
              </div>
            </div>
          </div>
        )}

        {stage === "generating" && (
          <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-8">
            <div className="text-center">
              <div className="mb-3 flex justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent/30 border-t-accent dark:border-t-violet-400" />
              </div>
              <p className="text-sm font-medium text-muted transition-opacity">
                {GENERATING_MESSAGES[generatingMessageIndex]}
              </p>
            </div>

            <div className="w-full space-y-2.5 opacity-50">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-bg p-4">
                  <div className="h-4 w-4 shrink-0 animate-pulse rounded-full bg-border" />
                  <div className="h-3 flex-1 animate-pulse rounded bg-border" style={{ width: `${70 - i * 8}%` }} />
                </div>
              ))}
            </div>
          </div>
        )}

        {stage === "debrief" && debrief && (
          <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6">
            <div className="text-center">
              <div className="relative mb-1 flex items-center justify-center">
                <PartyPopper size={30} strokeWidth={2} className="relative z-10 animate-pop-in text-accent dark:text-violet-400" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-fg">
                {debrief.classification === "perfect" && "Nice work!"}
                {debrief.classification === "sat_out" && "Here's how it played out"}
                {debrief.classification === "mistimed" && "Let's break it down"}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">{debrief.debrief.summary}</p>
            </div>

            <div className="space-y-2.5">
              {debrief.checklist_results.map((r, i) => {
                const Icon = CHECKLIST_ICON[r.status];
                return (
                  <div
                    key={r.item}
                    className="flex animate-fade-in-up items-start gap-3 rounded-lg border border-border bg-bg p-4"
                    style={{ animationDelay: `${i * CHECKLIST_STAGGER_MS}ms`, animationFillMode: "backwards" }}
                  >
                    <Icon size={18} strokeWidth={2} className={`mt-0.5 shrink-0 ${CHECKLIST_COLOR[r.status]}`} />
                    <span className="text-sm leading-snug text-fg">{r.item}</span>
                  </div>
                );
              })}
            </div>

            <div
              className="flex animate-fade-in-up flex-col items-center gap-6"
              style={{
                animationDelay: `${debrief.checklist_results.length * CHECKLIST_STAGGER_MS}ms`,
                animationFillMode: "backwards",
              }}
            >
              <p className="text-center text-xs text-muted">
                In real trading, this session would have been automatically saved to your journal for later review.
              </p>
              <button
                onClick={finishOnboarding}
                disabled={finishing}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-accent px-8 py-3 text-sm font-medium text-on-accent hover:bg-accent/90 disabled:opacity-50"
              >
                {finishing ? "Getting started…" : "Get started"}
              </button>
            </div>
          </div>
        )}
        </div>

        {showWizardSteps && (
          <WizardStepper steps={WIZARD_STEPS} currentIndex={currentWizardIndex} />
        )}
      </div>
    </div>
  );
}

function WelcomeOverlay({ message, onNext }: { message: string; onNext: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex animate-fade-in items-center justify-center bg-bg/80 backdrop-blur-sm">
      <div className="mx-4 w-[240px] rounded-xl border border-accent/40 bg-panel/95 px-4 py-3 text-center text-sm text-fg shadow-xl backdrop-blur-sm">
        <p>{message}</p>
        <div className="mt-2 flex justify-center">
          <button
            onClick={onNext}
            className="flex items-center gap-1 rounded-md bg-accent px-3 py-1 text-sm font-medium text-on-accent hover:bg-accent/90"
          >
            Let&apos;s go
            <ChevronRight size={12} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function WizardStepper({
  steps,
  currentIndex,
}: {
  steps: { stage: Stage; heading: string; subheading: string; icon: typeof Sparkles }[];
  currentIndex: number;
}) {
  return (
    <div className="hidden w-80 shrink-0 rounded-xl border border-border bg-panel p-10 pt-10 md:block">
      {steps.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        const Icon = done ? Check : step.icon;
        return (
          <div key={step.stage} className="flex items-start">
            <div className="flex flex-col items-center">
              <div
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition-colors ${
                  done
                    ? "border-accent bg-accent text-on-accent brightness-90 dark:border-violet-400 dark:bg-violet-400"
                    : active
                      ? "border-accent bg-accent/10 text-accent dark:border-violet-400 dark:text-violet-400"
                      : "border-border text-muted"
                }`}
              >
                <Icon size={13} strokeWidth={2} />
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`my-1.5 w-px flex-1 transition-colors ${
                    done ? "bg-accent dark:bg-violet-400" : "bg-border"
                  }`}
                  style={{ minHeight: "2.5rem" }}
                />
              )}
            </div>
            <div className={`ml-3.5 -mt-1.5 ${i < steps.length - 1 ? "pb-8" : ""}`}>
              <div className={`flex h-7 items-center text-sm font-semibold ${active ? "text-fg" : "text-muted"}`}>
                {step.heading}
              </div>
              <div className="mt-0.5 whitespace-nowrap text-xs text-muted">{step.subheading}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StepWizardCard({
  onBack,
  onContinue,
  continueDisabled,
  continueLabel = "Continue",
  children,
}: {
  onBack: () => void;
  onContinue: () => void;
  continueDisabled?: boolean;
  continueLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6">
      <div className="flex flex-col">{children}</div>
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-muted hover:text-fg"
        >
          <ChevronLeft size={14} strokeWidth={2} />
          Back
        </button>
        <button
          onClick={onContinue}
          disabled={continueDisabled}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-on-accent hover:bg-accent/90 disabled:opacity-40"
        >
          {continueLabel}
          <ChevronRight size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

function OptionGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-4">{children}</div>;
}

function OptionCard({
  label,
  blurb,
  selected,
  onClick,
}: {
  label: string;
  blurb: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border p-5 text-left transition-colors ${
        selected
          ? "border-accent bg-accent/10 dark:border-violet-400"
          : "border-border bg-bg hover:border-accent/50"
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className={`text-sm font-medium ${selected ? "text-accent text-fg" : "text-fg"}`}>
          {label}
        </span>
        {selected ? (
          <CheckCircle2 size={16} strokeWidth={2} className="text-accent dark:text-violet-400" />
        ) : (
          <Circle size={16} strokeWidth={2} className="text-border" />
        )}
      </div>
      <div className="text-xs leading-relaxed text-muted">{blurb}</div>
    </button>
  );
}
