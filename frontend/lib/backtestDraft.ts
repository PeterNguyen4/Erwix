import { BacktestConfig, BacktestResult } from "@/lib/api";
import type { ChatItem } from "@/components/backtesting/BacktestChat";

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  name: "Plan",
  symbol: "AAPL",
  timeframe: "1Day",
  direction: "long",
  entry_rules: [],
  exit_rules: [],
  position_sizing: { mode: "fixed_qty", value: 1 },
  stop_loss: null,
  take_profit: null,
  max_concurrent_positions: 1,
};

interface BacktestDraft {
  config: BacktestConfig;
  result: BacktestResult | null;
  messages: ChatItem[];
  nextId: number;
  input: string;
}

export const backtestDraft: BacktestDraft = {
  config: DEFAULT_BACKTEST_CONFIG,
  result: null,
  messages: [],
  nextId: 0,
  input: "",
};
