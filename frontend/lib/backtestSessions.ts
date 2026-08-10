import { api, BacktestChatSessionSummary } from "@/lib/api";
import type { ChatItem } from "@/components/backtesting/BacktestChat";
import { DEFAULT_BACKTEST_CONFIG } from "@/lib/backtestDraft";

export interface BacktestSession {
  id: number;
  title: string;
  config: typeof DEFAULT_BACKTEST_CONFIG;
  messages: ChatItem[];
  input: string;
  windowStart: string | null;
  windowEnd: string | null;
}

const CURRENT_KEY = "erwix.backtestSessions.current";

export function listBacktestSessions(): Promise<BacktestChatSessionSummary[]> {
  return api.listBacktestChatSessions();
}

export async function getBacktestSession(id: number): Promise<BacktestSession> {
  const data = await api.getBacktestChatSession(id);
  return {
    id: data.id,
    title: data.title,
    config: data.config,
    messages: data.messages as ChatItem[],
    input: data.input,
    windowStart: data.window_start,
    windowEnd: data.window_end,
  };
}

export async function createBacktestSession(): Promise<BacktestSession> {
  const data = await api.createBacktestChatSession();
  return {
    id: data.id,
    title: data.title,
    config: data.config,
    messages: data.messages as ChatItem[],
    input: data.input,
    windowStart: data.window_start,
    windowEnd: data.window_end,
  };
}

export function saveBacktestSession(session: BacktestSession): Promise<void> {
  return api
    .updateBacktestChatSession(session.id, {
      title: session.title,
      config: session.config,
      messages: session.messages,
      input: session.input,
      window_start: session.windowStart,
      window_end: session.windowEnd,
    })
    .then(() => undefined);
}

export function deleteBacktestSession(id: number): Promise<void> {
  return api.deleteBacktestChatSession(id);
}

export function getCurrentSessionId(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(CURRENT_KEY);
  return raw ? Number(raw) : null;
}

export function setCurrentSessionId(id: number) {
  if (typeof window !== "undefined") window.localStorage.setItem(CURRENT_KEY, String(id));
}

export function titleFromSession(config: { symbol: string }, messages: ChatItem[]): string {
  const firstUserText = messages.find(
    (m): m is Extract<ChatItem, { kind: "text" }> => m.kind === "text" && m.role === "user",
  )?.text;
  if (firstUserText) return firstUserText.slice(0, 60);
  return `${config.symbol} strategy`;
}
