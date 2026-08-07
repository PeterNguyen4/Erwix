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

export interface BacktestRule {
  type: "comparison";
  indicator: string;
  comparator: "<" | "<=" | ">" | ">=" | "==" | "crosses_above" | "crosses_below";
  value: string;
}


export type AnyBacktestRule = BacktestRule | PatternRule | GatedRule;

export interface BacktestSizing {
  mode: "fixed_qty" | "pct_equity" | "pct_risk";
  value: number;
}

export interface BacktestRisk {
  value: number;
}

export interface BacktestConfig {
  id?: number;
  name: string;
  symbol: string;
  timeframe: string;
  direction: "long" | "short" | "both";
  entry_rules: AnyBacktestRule[];
  exit_rules: AnyBacktestRule[];
  position_sizing: BacktestSizing;
  stop_loss: BacktestRisk | null;
  take_profit: BacktestRisk | null;
  max_concurrent_positions: number;
}

export interface BacktestTrade {
  entry_time: number;
  exit_time: number | null;
  side: "long" | "short";
  qty: number;
  entry_price: number;
  exit_price: number | null;
  profit_loss: number | null;
}

export interface BacktestResult {
  trades: BacktestTrade[];
  equity_curve: PortfolioPoint[];
  stats: Record<string, number>;
}

export interface BacktestRun {
  id: number;
  config_id: number;
  status: "running" | "ready" | "error";
  start: string;
  end: string;
  result: BacktestResult | null;
  error_detail: string | null;
}

export type BacktestChatEvent =
  | { type: "action"; label: string }
  | { type: "token"; text: string }
  | { type: "window"; start: string | null; end: string | null }
  | { type: "config"; config: BacktestConfig }
  | { type: "done" }
  | { type: "error"; detail: string };

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

export interface JournalEntry {
  id: number;
  entry_date: string; // YYYY-MM-DD
  symbol: string | null;
  side: "buy" | "sell" | null;
  entry_time: string | null;
  entry_price: number | null;
  exit_time: string | null;
  exit_price: number | null;
  order_amount: number | null;
  notes: string | null;
}

export interface JournalEntryInput {
  entry_date: string;
  symbol?: string | null;
  side?: "buy" | "sell" | null;
  entry_time?: string | null;
  entry_price?: number | null;
  exit_time?: string | null;
  exit_price?: number | null;
  order_amount?: number | null;
  notes?: string | null;
}

export interface NewsArticle {
  symbol: string;
  title: string;
  publisher: string;
  url: string;
  published_at: string;
  thumbnail_url?: string | null;
  related_tickers?: string[];
}

export interface MarketInsight {
  sentiment: "bullish" | "bearish" | "neutral";
  advice: string;
  rationale: string[];
  highlighted_urls: string[];
}

export interface ClosedTrade {
  symbol: string;
  qty: number;
  entry_price: number;
  exit_price: number;
  pnl: number;
  opened_at: string;
  closed_at: string;
}

export interface PnLSummary {
  total_pnl: number;
  win_count: number;
  loss_count: number;
  breakeven_count: number;
  win_rate: number | null;
  avg_win: number | null;
  avg_loss: number | null;
  largest_win: number | null;
  largest_loss: number | null;
  closed_trades: ClosedTrade[];
}

export interface PnLWeeklyComparison {
  current: PnLSummary;
  previous: PnLSummary;
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

export interface UserPrivate {
  id: number;
  username: string;
  email: string;
  role: "user" | "admin";
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface AlpacaStatus {
  connected: boolean;
  env: "paper" | "live" | null;
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

export interface NotificationItem {
  id: string;
  type: "debrief_ready" | "news_insight" | "alpaca_disconnected" | "strategy_missing";
  title: string;
  body: string;
  href: string;
  created_at: string;
  unseen: boolean;
}

export interface NotificationsOut {
  items: NotificationItem[];
  unseen_count: number;
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
  id: number;
  name: string;
  is_active: boolean;
  archetype: string | null;
  body: string | null;
  answers: Record<string, string> | null;
  structured_summary: string | null;
  summarized_at: string | null;
  preferred_symbols: string[] | null;
  context_timeframe: string | null;
  entry_timeframe: string | null;
}

export interface StrategyNoteSummary {
  id: number;
  name: string;
  archetype: string | null;
  is_active: boolean;
  updated_at: string;
}

export interface StrategyRule {
  type: "comparison";
  left: string;
  comparator: "<" | "<=" | ">" | ">=" | "==" | "crosses_above" | "crosses_below";
  right: string;
  description: string;
}

export interface CandleStep {
  color: "green" | "red";
  min_body_ratio: number | null;
  max_upper_wick_ratio: number | null;
  max_lower_wick_ratio: number | null;
}

export interface PatternRule {
  type: "pattern";
  source: "ha" | "candle";
  steps: CandleStep[];
  description: string;
}

export interface GatedRule {
  type: "gated";
  condition: StrategyRule | PatternRule;
  gate: StrategyRule;
  description: string;
}

export type AnyStrategyRule = StrategyRule | PatternRule | GatedRule;

export interface StrategyRuleSet {
  entry_rules: AnyStrategyRule[];
  exit_rules: AnyStrategyRule[];
}

export interface StrategyRuleSetOut {
  rules: StrategyRuleSet | null;
  compiled_model: string | null;
  compiled_at: string | null;
  is_stale: boolean;
  compile_error: string | null;
}

export interface DebriefMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface AttachedReference {
  type: "trade" | "journal_entry" | "day" | "symbol";
  refId: string;
  label: string;
}

export type RuleWatchEvent =
  | { type: "signal"; kind: "entry" | "exit"; description: string; annotation: ChartAnnotation }
  | { type: "error"; detail: string };

export type DebriefEvent =
  | { type: "token"; text: string }
  | { type: "annotations"; annotations: ChartAnnotation[] }
  | { type: "spotlight"; selector: string; message?: string | null }
  | { type: "zoom"; from: number; to: number }
  | { type: "symbol"; symbol: string }
  | { type: "note_quote"; trade_id: number; text: string }
  | { type: "done" }
  | { type: "error"; detail: string };

let _refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!_refreshInFlight) {
    _refreshInFlight = fetch(`${API}/api/users/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        _refreshInFlight = null;
      });
  }
  return _refreshInFlight;
}

async function getJSON<T>(path: string, _retried = false): Promise<T> {
  const res = await fetch(`${API}${path}`, { credentials: "include" });
  if (res.status === 401 && !_retried && (await tryRefresh())) {
    return getJSON<T>(path, true);
  }
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json();
}

async function postJSON<T>(path: string, body: unknown, method = "POST", _retried = false): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401 && !_retried && (await tryRefresh())) {
    return postJSON<T>(path, body, method, true);
  }
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json();
}

async function deleteRequest(path: string, _retried = false): Promise<void> {
  const res = await fetch(`${API}${path}`, { method: "DELETE", credentials: "include" });
  if (res.status === 401 && !_retried && (await tryRefresh())) {
    return deleteRequest(path, true);
  }
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`${res.status}: ${detail}`);
  }
}

async function login(email: string, password: string): Promise<UserPrivate> {
  const body = new URLSearchParams();
  body.set("username", email);
  body.set("password", password);
  const res = await fetch(`${API}/api/users/token`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json();
}

export const api = {
  login,
  logout: () => postJSON<{ success: boolean }>("/api/users/logout", {}),
  register: (body: RegisterRequest) => postJSON<UserPrivate>("/api/users/register", body),
  forgotPassword: (email: string) =>
    postJSON<{ success: boolean }>("/api/users/forgot-password", { email }),
  resetPassword: (token: string, new_password: string) =>
    postJSON<{ success: boolean }>("/api/users/reset-password", { token, new_password }),
  me: () => getJSON<UserPrivate>("/api/users/me"),
  candles: (symbol: string, timeframe = "1Day", start?: string | null, end?: string | null) => {
    const q = new URLSearchParams({ symbol, timeframe });
    if (start) q.set("start", start);
    if (end) q.set("end", end);
    return getJSON<Candle[]>(`/api/market/candles?${q.toString()}`);
  },
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
  journalEntries: (params: { symbol?: string; from?: string; to?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.symbol) q.set("symbol", params.symbol);
    if (params.from) q.set("from", params.from);
    if (params.to) q.set("to", params.to);
    return getJSON<JournalEntry[]>(`/api/journal/entries?${q.toString()}`);
  },
  createJournalEntry: (entry: JournalEntryInput) =>
    postJSON<JournalEntry>("/api/journal/entries", entry),
  updateJournalEntry: (id: number, entry: Partial<JournalEntryInput>) =>
    postJSON<JournalEntry>(`/api/journal/entries/${id}`, entry, "PATCH"),
  deleteJournalEntry: (id: number) => deleteRequest(`/api/journal/entries/${id}`),
  searchSymbols: (q: string) =>
    getJSON<SymbolResult[]>(`/api/market/search?q=${encodeURIComponent(q)}`),
  marketArticles: () => getJSON<NewsArticle[]>("/api/news/market-articles"),
  marketInsight: (refresh = false) =>
    getJSON<MarketInsight>(`/api/news/market-insight${refresh ? "?refresh=true" : ""}`),
  pnlSummary: (params: { from?: string; to?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.from) q.set("from", params.from);
    if (params.to) q.set("to", params.to);
    return getJSON<PnLSummary>(`/api/journal/pnl-summary?${q.toString()}`);
  },
  pnlWeeklyComparison: () => getJSON<PnLWeeklyComparison>("/api/journal/pnl-summary/weekly"),
  reviewTrades: (req: AgentReviewRequest) =>
    postJSON<AgentReviewResponse>("/api/agent/review", req),
  debriefStatus: () => getJSON<DebriefStatus>("/api/agent/status"),
  listNotifications: () => getJSON<NotificationsOut>("/api/notifications"),
  markNotificationRead: (key: string) => postJSON<NotificationsOut>("/api/notifications/read", { key }),
  dismissNotification: (key: string) => postJSON<NotificationsOut>("/api/notifications/dismiss", { key }),
  resetDebrief: () => postJSON<DebriefStatus>("/api/agent/debrief/reset", {}),
  debriefStreamUrl: async (params: DebriefRequest) => {
    const q = new URLSearchParams();
    q.set("from", params.from);
    q.set("to", params.to);
    if (params.symbol) q.set("symbol", params.symbol);
    if (params.query) q.set("query", params.query);
    return `${WS}/api/agent/debrief?${q.toString()}`;
  },
  ruleWatchUrl: async (symbol: string, timeframe: string, refreshSeconds = 30) => {
    const q = new URLSearchParams();
    q.set("timeframe", timeframe);
    q.set("refresh_seconds", String(refreshSeconds));
    return `${WS}/api/agent/watch/${encodeURIComponent(symbol)}?${q.toString()}`;
  },
  generateDebriefNow: () => postJSON<DebriefReport>("/api/agent/debrief/generate", {}),
  latestDebriefReport: () => getJSON<DebriefReport | null>("/api/agent/debrief/latest"),
  getDebriefReport: (id: number) => getJSON<DebriefReport>(`/api/agent/debrief/${id}`),
  debriefMessages: (id: number) => getJSON<DebriefMessage[]>(`/api/agent/debrief/${id}/messages`),
  postDebriefMessage: (id: number, message: string, references: AttachedReference[] = []) =>
    postJSON<DebriefMessage>(`/api/agent/debrief/${id}/messages`, {
      message,
      references: references.map(({ type, refId }) => ({ type, ref_id: refId })),
    }),
  getArchetypes: () => getJSON<Archetype[]>("/api/strategy/archetypes"),
  listStrategies: () => getJSON<StrategyNoteSummary[]>("/api/strategy"),
  createStrategy: (body: { name: string; archetype: string | null }) =>
    postJSON<StrategyNote>("/api/strategy", body, "POST"),
  getActiveStrategy: () => getJSON<StrategyNote | null>("/api/strategy/active"),
  getStrategyById: (id: number) => getJSON<StrategyNote>(`/api/strategy/${id}`),
  saveStrategy: (id: number, body: { archetype: string | null; body?: string; answers?: Record<string, string> }) =>
    postJSON<StrategyNote>(`/api/strategy/${id}`, body, "PUT"),
  regenerateStrategy: (id: number) => postJSON<StrategyNote>(`/api/strategy/${id}/regenerate`, {}),
  activateStrategy: (id: number) => postJSON<StrategyNote>(`/api/strategy/${id}/activate`, {}),
  renameStrategy: (id: number, name: string) =>
    postJSON<StrategyNote>(`/api/strategy/${id}/name`, { name }, "PUT"),
  deleteStrategy: (id: number) => deleteRequest(`/api/strategy/${id}`),
  getStrategyRules: (id: number) => getJSON<StrategyRuleSetOut>(`/api/strategy/${id}/rules`),
  updatePlaybook: (id: number, sections: Record<string, string[]>) =>
    postJSON<StrategyNote>(`/api/strategy/${id}/playbook`, { sections }, "PUT"),
  getPreferences: () => getJSON<UserPreference>("/api/users/preferences"),
  savePreferences: (prefs: Partial<UserPreference>) =>
    postJSON<UserPreference>("/api/users/preferences", prefs, "PATCH"),
  saveBacktestConfig: (config: BacktestConfig) =>
    config.id
      ? postJSON<BacktestConfig>(`/api/backtest/configs/${config.id}`, config, "PATCH")
      : postJSON<BacktestConfig>("/api/backtest/configs", config),
  runBacktest: (configId: number, params: { start: string; end: string }) => {
    const q = new URLSearchParams({ start: params.start, end: params.end });
    return postJSON<BacktestRun>(`/api/backtest/configs/${configId}/run?${q.toString()}`, {});
  },
  backtestChatStreamUrl: async (
    config: BacktestConfig,
    message: string,
    windowStart: string | null,
    windowEnd: string | null,
  ) => {
    const q = new URLSearchParams();
    q.set("message", message);
    q.set("config", JSON.stringify(config));
    if (windowStart) q.set("window_start", windowStart);
    if (windowEnd) q.set("window_end", windowEnd);
    return `${WS}/api/backtest/chat?${q.toString()}`;
  },
  streamUrl: async (symbol: string) => {
    return `${WS}/api/market/stream/${encodeURIComponent(symbol)}`;
  },
  alpacaStatus: () => getJSON<AlpacaStatus>("/api/alpaca/status"),
  connectAlpaca: async (env: "paper" | "live" = "paper") => {
    const { url } = await getJSON<{ url: string }>(`/api/alpaca/connect?env=${env}`);
    window.location.href = url;
  },
  disconnectAlpaca: () => postJSON<{ success: boolean }>("/api/alpaca/disconnect", {}),
  listUsers: () => getJSON<UserPrivate[]>("/api/users/admin/users"),
  updateUserRole: (userId: number, role: "user" | "admin") =>
    postJSON<UserPrivate>(`/api/users/admin/users/${userId}/role`, { role }, "PATCH"),
};
