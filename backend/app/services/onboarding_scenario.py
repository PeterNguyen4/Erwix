from datetime import UTC, datetime

from app.schemas_strategy import StrategyRule

SYMBOL = "NVDA"
TIMEFRAME = "1Day"
WINDOW_START = datetime(2023, 10, 1, tzinfo=UTC)
WINDOW_END = datetime(2024, 1, 15, tzinfo=UTC)

TITLE = "The Trend-Confirmation Playbook"

MARKDOWN = (
    "A simple trend-following setup: wait for the fast average to cross above the "
    "slow average, then confirm with a green Heikin-Ashi candle before entering. "
    "Exit when the trend reverses (fast average crosses back below the slow "
    "average) or your stop-loss/take-profit is hit.\n\n"
    "This isn't a promise it always works — it's a clean example to learn the "
    "mechanics: watch for signals, wait for confluence, enter with a plan, exit on "
    "your terms."
)

CHECKLIST = [
    "EMA 20 crosses above EMA 50 (trend turning up)",
    "Heikin-Ashi candle confirms green (momentum agrees)",
    "Enter within a couple candles of the signal — don't chase it late",
    "Exit when EMA 20 crosses back below EMA 50, or your stop/target is hit",
]

ENTRY_RULES = [
    StrategyRule(
        left="ema_20",
        comparator="crosses_above",
        right="ema_50",
        description="EMA 20 crossed above EMA 50",
    ),
    StrategyRule(
        left="ha_close",
        comparator=">",
        right="ha_open",
        description="Heikin-Ashi candle confirms green",
    ),
]

EXIT_RULES = [
    StrategyRule(
        left="ema_20",
        comparator="crosses_below",
        right="ema_50",
        description="EMA 20 crossed below EMA 50 — trend reversing",
    ),
]

ALL_RULES: list[StrategyRule] = [*ENTRY_RULES, *EXIT_RULES]
