import { describe, expect, it } from "vitest";

import { indicatorsForConfig } from "@/lib/backtestIndicators";
import { BacktestConfig } from "@/lib/api";

function config(overrides: Partial<BacktestConfig> = {}): BacktestConfig {
  return {
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
    ...overrides,
  };
}

describe("indicatorsForConfig", () => {
  it("returns nothing for a config with no rules", () => {
    expect(indicatorsForConfig(config())).toEqual([]);
  });

  it("picks up a chartable sma indicator from a comparison rule", () => {
    const cfg = config({
      entry_rules: [{ type: "comparison", indicator: "sma_50", comparator: ">", value: "100" }],
    });
    expect(indicatorsForConfig(cfg)).toEqual(["sma_50"]);
  });

  it("picks up indicators on both sides of a comparison", () => {
    const cfg = config({
      entry_rules: [{ type: "comparison", indicator: "ema_20", comparator: "crosses_above", value: "sma_50" }],
    });
    expect(indicatorsForConfig(cfg)).toEqual(["ema_20", "sma_50"]);
  });

  it("normalizes macd and macd_signal to the same chart id", () => {
    const cfg = config({
      entry_rules: [{ type: "comparison", indicator: "macd", comparator: ">", value: "macd_signal" }],
    });
    expect(indicatorsForConfig(cfg)).toEqual(["macd"]);
  });

  it("skips non-chartable indicators like rsi_14 crossing a bare number, stochastics, and shape ratios", () => {
    const cfg = config({
      entry_rules: [
        { type: "comparison", indicator: "stoch_k_14", comparator: "<", value: "20" },
        { type: "comparison", indicator: "body_ratio", comparator: ">", value: "0.6" },
      ],
    });
    expect(indicatorsForConfig(cfg)).toEqual([]);
  });

  it("includes rsi_N since it matches the chartable family regex", () => {
    const cfg = config({
      exit_rules: [{ type: "comparison", indicator: "rsi_14", comparator: ">", value: "70" }],
    });
    expect(indicatorsForConfig(cfg)).toEqual(["rsi_14"]);
  });

  it("skips ha_-prefixed variants (no chart line implementation)", () => {
    const cfg = config({
      entry_rules: [{ type: "comparison", indicator: "ha_close", comparator: ">", value: "ha_ema_20" }],
    });
    expect(indicatorsForConfig(cfg)).toEqual([]);
  });

  it("dedupes an indicator referenced by both entry and exit rules", () => {
    const rule: BacktestConfig["entry_rules"][number] = {
      type: "comparison", indicator: "sma_20", comparator: ">", value: "100",
    };
    const cfg = config({ entry_rules: [rule], exit_rules: [rule] });
    expect(indicatorsForConfig(cfg)).toEqual(["sma_20"]);
  });

  it("collects indicators from a gated rule's condition and gate", () => {
    const cfg = config({
      entry_rules: [
        {
          type: "gated",
          description: "gated",
          condition: { type: "comparison", left: "ema_20", comparator: ">", right: "100", description: "cond" },
          gate: { type: "comparison", left: "sma_50", comparator: ">", right: "sma_200", description: "gate" },
        },
      ],
    });
    expect(indicatorsForConfig(cfg)).toEqual(["ema_20", "sma_50", "sma_200"]);
  });

  it("ignores a pattern rule entirely (no indicator series to chart)", () => {
    const cfg = config({
      entry_rules: [
        {
          type: "pattern", source: "candle", description: "pattern",
          steps: [{ color: "green", min_body_ratio: null, max_upper_wick_ratio: null, max_lower_wick_ratio: null }],
        },
      ],
    });
    expect(indicatorsForConfig(cfg)).toEqual([]);
  });

  it("ignores a gated rule whose condition is itself a pattern rule", () => {
    const cfg = config({
      entry_rules: [
        {
          type: "gated",
          description: "gated",
          condition: {
            type: "pattern", source: "ha", description: "pattern",
            steps: [{ color: "red", min_body_ratio: null, max_upper_wick_ratio: null, max_lower_wick_ratio: null }],
          },
          gate: { type: "comparison", left: "sma_50", comparator: ">", right: "100", description: "gate" },
        },
      ],
    });
    expect(indicatorsForConfig(cfg)).toEqual(["sma_50"]);
  });
});
