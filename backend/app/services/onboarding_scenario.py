from datetime import UTC, datetime

from app.schemas_strategy import StrategyRule

SYMBOL = "NVDA"
TIMEFRAME = "1Day"
WINDOW_START = datetime(2023, 10, 1, tzinfo=UTC)
WINDOW_END = datetime(2024, 1, 15, tzinfo=UTC)
LOOKBACK_DAYS = 300

TITLE = "The Trend-Confirmation Playbook"

STORY: list[dict[str, str]] = [
    {
        "heading": "Two moving averages",
        "body": (
            "A fast average (EMA 20) and a slow average (EMA 50). When the fast one "
            "is above the slow one, the trend is up."
        ),
    },
    {
        "heading": "The trigger",
        "body": (
            "When EMA 20 crosses above EMA 50, the trend just turned up. "
            "That's your entry signal — you'll see a toast for it."
        ),
    },
    {
        "heading": "Confluence",
        "body": (
            "A green Heikin-Ashi candle right after adds confirmation. More signals "
            "agreeing means more confidence — but don't wait forever, enter within a "
            "couple candles."
        ),
    },
    {
        "heading": "The exit",
        "body": (
            "Ride the trend until EMA 20 crosses back below EMA 50 — or your "
            "stop-loss/take-profit gets hit first, whichever comes first."
        ),
    },
]

CHECKLIST = [
    "EMA 20 crosses above EMA 50 (trend turning up)",
    "Heikin-Ashi candle confirms green (momentum agrees)",
    "Enter within a couple candles of the signal — don't chase it late",
    "Exit when EMA 20 crosses back below EMA 50, or your stop/target is hit",
]

CHART_INDICATORS = ["ema_20", "ema_50"]

ENTRY_RULES = [
    StrategyRule(
        left="ema_20",
        comparator="crosses_above",
        right="ema_50",
        description="EMA 20 crossed above EMA 50 — trend turning up",
    ),
]

CONFIRMATION_RULE = StrategyRule(
    left="ha_close",
    comparator=">",
    right="ha_open",
    description="Heikin-Ashi candle confirms green",
)
CONFIRMATION_WINDOW = 2

EXIT_RULES = [
    StrategyRule(
        left="ema_20",
        comparator="crosses_below",
        right="ema_50",
        description="EMA 20 crossed below EMA 50 — trend reversing",
    ),
]

ALL_RULES: list[StrategyRule] = [*ENTRY_RULES, CONFIRMATION_RULE, *EXIT_RULES]
