from datetime import UTC, datetime

SYMBOL = "AAPL"
TIMEFRAME = "1Day"

DATA_START = datetime(2021, 3, 3, tzinfo=UTC)
TRIAL_START = datetime(2021, 5, 25, tzinfo=UTC)
WINDOW_END = datetime(2021, 7, 24, tzinfo=UTC)

STORY: list[dict[str, str | None]] = [
    {
        "heading": "The 50 EMA",
        "body": (
            "The **50-day Exponential Moving Average** shows the average price over the "
            "last 50 days. More weight is given to recent candles, so it reacts fast to sudden "
            "price changes."
        ),
        "image": "/slides/the-50-ema.webp",
    },
    {
        "heading": "Breaking above",
        "body": (
            "We start below the 50 EMA. Our first sign is when price breaks above the 50 EMA "
            "and the **candle closes above it**. Notice how the top of the candle's body sits "
            "above the line."
        ),
        "image": "/slides/break-above.webp",
    },
    {
        "heading": "Pullback",
        "body": (
            "Now wait for a **real pullback** (at least 2 red candles back-to-back "
            "coming down). Then draw a horizontal line at the top wick just before "
            "those red candles. That's the swing high."
        ),
        "image": "/slides/pullback.webp",
    },
    {
        "heading": "Entry",
        "body": (
            "Buy when price breaks back above that horizontal line, right at the breakout candle's "
            "close. But how do know when and how much to buy/sell?"
        ),
        "image": "/slides/entry.webp",
    },
    {
        "heading": "Helping hands",
        "body": (
            "The **Chandelier Exit** is a helpful tool to know when to leave a trade. The marker "
            "widens in volatile markets and tightens in calm ones. When combining the right tools "
            "and signals, we are able to form strong confluences that help us trade."
        ),
        "image": "/slides/helping-hands.webp",
    },
    {
        "heading": "Guidance",
        "body": (
            "Set stop-loss at the Chandelier stop and **take-profit at 2x** the stop distance. "
            "In a real trade, that would mean that we aim to make $100 for every $50 we risk. "
        ),
        "image": "/slides/guidance.webp",
    },
    {
        "heading": "Invalidation: Broken EMA",
        "body": (
            "The setup is void if the pullback breaks back below the 50 EMA. The pullback was "
            "too strong and not clean, so skip the trade."
        ),
        "image": "/slides/invalid-1.webp",
    },
    {
        "heading": "Invalidation: oversized candle",
        "body": (
            "It's is also void if the breakout candle is 3-4x the size of an average candle. "
            "Price may reverse back down."
        ),
        "image": "/slides/invalid-2.webp",
    },
]

CHECKLIST = [
    "Price breaks above the 50 EMA and closes above it (body, not just a wick)",
    "A real pullback follows (2 back-to-back red candles)",
    "Draw horizontal line at the swing high right before the pullback",
    "Buy on the close back above that line",
    "Set stop at the Chandelier and target an exit at 2x the stop distance",
]

EMA_PERIOD = 50
PULLBACK_MIN_RED_CANDLES = 2
BIG_CANDLE_LOOKBACK = 20
BIG_CANDLE_MULT = 3.0
CHANDELIER_LENGTH = 22
CHANDELIER_ATR_PERIOD = 22
CHANDELIER_MULT = 3.0
RISK_REWARD_MULTIPLE = 2.0

LINE_COLOR = "#60a5fa"

CHART_INDICATORS = [
    f"ema_{EMA_PERIOD}",
    f"chandelier_{CHANDELIER_LENGTH}_{CHANDELIER_ATR_PERIOD}_{int(CHANDELIER_MULT)}",
]
