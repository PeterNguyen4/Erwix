import { AnyBacktestRule, BacktestConfig } from "@/lib/api";

// Only families the chart's indicator registry (components/chart/indicators.tsx)
// can actually draw a line for. Stochastics, trend strength, candle-shape ratios,
// and Heikin Ashi variants (ha_*) have no chart-line implementation yet, so a rule
// referencing them is silently skipped rather than shown as a broken toggle.
const CHARTABLE_FAMILY = /^(sma|ema|rsi)_\d+$/;

function tokenToIndicatorId(token: string): string | null {
  if (token === "macd" || token === "macd_signal") return "macd";
  if (CHARTABLE_FAMILY.test(token)) return token;
  return null;
}

function collect(rule: AnyBacktestRule, out: Set<string>): void {
  if (rule.type === "comparison") {
    const left = tokenToIndicatorId(rule.indicator);
    if (left) out.add(left);
    const right = tokenToIndicatorId(rule.value);
    if (right) out.add(right);
    return;
  }
  if (rule.type === "gated") {
    if (rule.condition.type === "comparison") {
      const left = tokenToIndicatorId(rule.condition.left);
      if (left) out.add(left);
      const right = tokenToIndicatorId(rule.condition.right);
      if (right) out.add(right);
    }
    const gateLeft = tokenToIndicatorId(rule.gate.left);
    if (gateLeft) out.add(gateLeft);
    const gateRight = tokenToIndicatorId(rule.gate.right);
    if (gateRight) out.add(gateRight);
  }
  // PatternRule: candle-shape based, no indicator series to chart.
}

// Indicator ids (chart registry scheme, e.g. "sma_50") referenced by a plan's
// entry/exit rules — used to auto-enable matching overlay/oscillator lines on
// Run so the chart reflects what the strategy actually checks.
export function indicatorsForConfig(config: BacktestConfig): string[] {
  const out = new Set<string>();
  for (const rule of [...config.entry_rules, ...config.exit_rules]) collect(rule, out);
  return [...out];
}
