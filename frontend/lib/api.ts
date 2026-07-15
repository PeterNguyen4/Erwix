// Typed API client for the Entro backend.

const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
const WS = process.env.NEXT_PUBLIC_WS_BASE ?? "ws://localhost:8000";

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Quote {
  symbol: string;
  bid: number | null;
  ask: number | null;
  price: number | null;
  timestamp: string | null;
}

export interface Position {
  symbol: string;
  qty: number;
  avg_entry_price: number;
  market_value: number;
  unrealized_pl: number;
  current_price: number | null;
}

export interface Account {
  buying_power: number;
  cash: number;
  portfolio_value: number;
  equity: number;
  long_market_value: number;
  last_equity: number;
}

export interface PortfolioPoint {
  time: number; // unix seconds
  equity: number;
  profit_loss: number;
}

export interface PortfolioHistory {
  base_value: number;
  points: PortfolioPoint[];
}

export interface Trade {
  id: number;
  symbol: string;
  side: string;
  order_type: string | null;
  qty: number;
  fill_price: number | null;
  fees: number;
  status: string;
  order_class: string;
  leg: "take_profit" | "stop_loss" | null;
  parent_client_order_id: string | null;
  limit_price: number | null;
  stop_price: number | null;
  take_profit_price: number | null;
  stop_loss_price: number | null;
  filled_at: string | null;
  broker_order_id: string | null;
  notes: string | null;
}

export interface NewsArticle {
  symbol: string;
  title: string;
  publisher: string;
  url: string;
  published_at: string;
}

export interface MarketInsight {
  sentiment: "bullish" | "bearish" | "neutral";
  advice: string;
  rationale: string[];
  highlighted_urls: string[];
}

export interface OrderRequest {
  symbol: string;
  qty: number;
  side: "buy" | "sell";
  type: "market" | "limit";
  limit_price?: number | null;
  time_in_force?: "day" | "gtc";
  order_class?: "simple" | "bracket";
  take_profit_price?: number | null;
  stop_loss_price?: number | null;
  stop_loss_limit_price?: number | null;
}

export interface OrderLeg {
  id: string;
  client_order_id: string;
  side: string;
  type: string;
  limit_price: number | null;
  stop_price: number | null;
}

export interface OrderResponse {
  id: string;
  client_order_id: string;
  symbol: string;
  qty: number;
  side: string;
  type: string;
  order_class: string;
  status: string;
  submitted_at: string | null;
  legs: OrderLeg[];
}

// Phase-2: the analyst agent emits these; the chart draws them as overlays.
export interface SymbolResult {
  symbol: string;
  name: string;
}

export interface UserPreference {
  last_symbol: string;
  last_symbol_name?: string | null;
  last_timeframe: string;
  debrief_enabled: boolean;
  debrief_day_of_week: number | null; // 0=Mon..6=Sun
  debrief_time: string | null; // "HH:MM:SS"
}

export interface ChartAnnotation {
  type: "arrow" | "circle" | "marker" | "line";
  time: number; // unix seconds
  price: number;
  label?: string;
  color?: string;
}

// Phase-2: LangGraph analyst agent's trade-window review.
export interface AgentReviewRequest {
  from: string;
  to: string;
  symbol?: string;
  query?: string;
}

export interface AgentReviewResponse {
  narrative: string;
  annotations: ChartAnnotation[];
}

// Phase-2: streamed debrief session (WS /api/agent/debrief) + notification status.
export interface DebriefStatus {
  has_new_trades: boolean;
  new_trade_count: number;
  last_debrief_at: string | null;
}

export interface DebriefRequest {
  from: string;
  to: string;
  symbol?: string;
  query?: string;
}

export interface ZoomRange {
  from: number; // unix seconds
  to: number;
}

// Phase-2: background-generated, step-navigable debrief report + persisted follow-up chat.
export interface DebriefStep {
  trade_id: number;
  narrative: string;
  annotations: ChartAnnotation[];
  spotlight?: { selector: string; message?: string | null } | null;
  zoom?: { from: number; to: number } | null;
  note_quote?: { trade_id: number; text: string } | null;
}

export interface DebriefReport {
  id: number;
  status: "pending" | "running" | "ready" | "error";
  window_start: string;
  window_end: string;
  symbol: string | null;
  scheduled_for: string;
  started_at: string | null;
  completed_at: string | null;
  total_steps: number | null;
  current_step: number;
  eta_seconds: number | null;
  steps: DebriefStep[];
  error_detail: string | null;
}

// Phase 2: Strategy tab — archetype selection + free-form description distilled
// by the strategist agent into a structured playbook the Analyst agent reads.
export interface StrategyQuestion {
  id: string;
  prompt: string;
}

export interface Archetype {
  id: string;
  name: string;
  tagline: string;
  questions: StrategyQuestion[];
}

export interface StrategyNote {
  archetype: string | null;
  body: string | null;
  answers: Record<string, string> | null;
  structured_summary: string | null;
  summarized_at: string | null;
}

export interface DebriefMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export type DebriefEvent =
  | { type: "token"; text: string }
  | { type: "annotations"; annotations: ChartAnnotation[] }
  | { type: "spotlight"; selector: string; message?: string | null }
  | { type: "zoom"; from: number; to: number }
  | { type: "symbol"; symbol: string }
  | { type: "note_quote"; trade_id: number; text: string }
  | { type: "done" }
  | { type: "error"; detail: string };

let _getToken: (() => Promise<string | null>) | null = null;
let _resolveReady: (() => void) | null = null;
// Resolves when AuthBridge confirms a signed-in session is available.
// Races against a 3s timeout so sign-in page requests don't hang forever.
const _ready = Promise.race([
  new Promise<void>((res) => { _resolveReady = res; }),
  new Promise<void>((res) => setTimeout(res, 3000)),
]);

export function setTokenGetter(fn: () => Promise<string | null>) {
  _getToken = fn;
  _resolveReady?.();
}

async function authHeaders(): Promise<HeadersInit> {
  await _ready;
  try {
    const token = await _getToken?.();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: await authHeaders() });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json();
}

async function postJSON<T>(path: string, body: unknown, method = "POST"): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json();
}

export const api = {
  candles: (symbol: string, timeframe = "1Day") =>
    getJSON<Candle[]>(
      `/api/market/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}`,
    ),
  quote: (symbol: string) =>
    getJSON<Quote>(`/api/market/quote?symbol=${encodeURIComponent(symbol)}`),
  positions: () => getJSON<Position[]>("/api/trading/positions"),
  account: () => getJSON<Account>("/api/trading/account"),
  portfolioHistory: (period = "1M") =>
    getJSON<PortfolioHistory>(`/api/trading/portfolio/history?period=${encodeURIComponent(period)}`),
  submitOrder: (order: OrderRequest) =>
    postJSON<OrderResponse>("/api/trading/orders", order),
  trades: (params: { symbol?: string; from?: string; to?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.symbol) q.set("symbol", params.symbol);
    if (params.from) q.set("from", params.from);
    if (params.to) q.set("to", params.to);
    return getJSON<Trade[]>(`/api/journal/trades?${q.toString()}`);
  },
  saveTradeNote: (id: number, notes: string) =>
    postJSON<Trade>(`/api/journal/trades/${id}/notes`, { notes }, "PATCH"),
  searchSymbols: (q: string) =>
    getJSON<SymbolResult[]>(`/api/market/search?q=${encodeURIComponent(q)}`),
  marketArticles: () => getJSON<NewsArticle[]>("/api/news/market-articles"),
  marketInsight: () => getJSON<MarketInsight>("/api/news/market-insight"),
  reviewTrades: (req: AgentReviewRequest) =>
    postJSON<AgentReviewResponse>("/api/agent/review", req),
  debriefStatus: () => getJSON<DebriefStatus>("/api/agent/status"),
  resetDebrief: () => postJSON<DebriefStatus>("/api/agent/debrief/reset", {}),
  debriefStreamUrl: async (params: DebriefRequest) => {
    const token = await _getToken?.();
    const q = new URLSearchParams();
    q.set("from", params.from);
    q.set("to", params.to);
    if (params.symbol) q.set("symbol", params.symbol);
    if (params.query) q.set("query", params.query);
    if (token) q.set("token", token);
    return `${WS}/api/agent/debrief?${q.toString()}`;
  },
  generateDebriefNow: () => postJSON<DebriefReport>("/api/agent/debrief/generate", {}),
  latestDebriefReport: () => getJSON<DebriefReport | null>("/api/agent/debrief/latest"),
  getDebriefReport: (id: number) => getJSON<DebriefReport>(`/api/agent/debrief/${id}`),
  debriefMessages: (id: number) => getJSON<DebriefMessage[]>(`/api/agent/debrief/${id}/messages`),
  postDebriefMessage: (id: number, message: string) =>
    postJSON<DebriefMessage>(`/api/agent/debrief/${id}/messages`, { message }),
  getArchetypes: () => getJSON<Archetype[]>("/api/strategy/archetypes"),
  getStrategy: () => getJSON<StrategyNote>("/api/strategy"),
  saveStrategy: (body: { archetype: string | null; body?: string; answers?: Record<string, string> }) =>
    postJSON<StrategyNote>("/api/strategy", body, "PUT"),
  regenerateStrategy: () => postJSON<StrategyNote>("/api/strategy/regenerate", {}),
  updatePlaybook: (sections: Record<string, string[]>) =>
    postJSON<StrategyNote>("/api/strategy/playbook", { sections }, "PUT"),
  getPreferences: () => getJSON<UserPreference>("/api/user/preferences"),
  savePreferences: (prefs: Partial<UserPreference>) =>
    postJSON<UserPreference>("/api/user/preferences", prefs, "PATCH"),
  streamUrl: async (symbol: string) => {
    const token = await _getToken?.();
    const base = `${WS}/api/market/stream/${encodeURIComponent(symbol)}`;
    return token ? `${base}?token=${encodeURIComponent(token)}` : base;
  },
};
