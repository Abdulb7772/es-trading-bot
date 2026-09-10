"""
config.py
=========
Every configurable constant for the TRE bot lives here. Nothing in this
file changes the TRE strategy logic (Spec Sections 1-20) -- it only holds
values the spec explicitly said were configurable, plus engineering
parameters (poll intervals, file paths) that don't affect trading
decisions.

Credentials are loaded from environment variables (see .env.example) --
never hardcode API keys/secrets in this file.
"""

import os
from zoneinfo import ZoneInfo

# ---------------------------------------------------------------------------
# Credentials (from environment -- see .env.example)
# ---------------------------------------------------------------------------
ALPACA_API_KEY = os.environ.get("ALPACA_API_KEY", "")
ALPACA_SECRET_KEY = os.environ.get("ALPACA_SECRET_KEY", "")

TOPSTEPX_USERNAME = os.environ.get("TOPSTEPX_USERNAME", "")
TOPSTEPX_API_KEY = os.environ.get("TOPSTEPX_API_KEY", "")
# The specific TopstepX account ID to trade. Required -- the bot will not
# guess which account to use if you have more than one (Combine + funded,
# multiple Combines, etc). Find this via TopstepXClient.search_accounts().
TOPSTEPX_ACCOUNT_ID = os.environ.get("TOPSTEPX_ACCOUNT_ID", "")

# ---------------------------------------------------------------------------
# TopstepX / ProjectX Gateway API endpoints
# ---------------------------------------------------------------------------
# Confirmed against https://gateway.docs.projectx.com/ (Order/place,
# Order/cancel, Position/closeContract, Account/search all show this host
# explicitly in their documented examples).
TOPSTEPX_API_BASE = "https://api.topstepx.com"

# Confirmed in the Realtime Updates doc (user hub example uses this host).
TOPSTEPX_USER_HUB_URL = "https://rtc.topstepx.com/hubs/user"
# NOTE: the ProjectX docs page has a "Market Hub" tab whose example was not
# extractable at build time. This bot does NOT use the market hub at all
# (see topstepx_realtime.py docstring for why it isn't needed), so this is
# left here only for reference / future use, not relied upon.
TOPSTEPX_MARKET_HUB_URL_UNUSED = "https://rtc.topstepx.com/hubs/market"

# ---------------------------------------------------------------------------
# Instruments (Spec Section 1)
# ---------------------------------------------------------------------------
SPY_SYMBOL = "SPY"

# Contract search text used against POST /api/Contract/search for the ES
# execution instrument. The bot filters results to the standard E-mini
# S&P 500 (excluding Micro/MES) and picks the front month automatically
# (per your answer to Q13). VERIFY the selected contract by eye on first
# run -- see README "Before you go live".
ES_CONTRACT_SEARCH_TEXT = "ES"
ES_DESCRIPTION_MUST_CONTAIN = "E-mini S&P 500"
ES_DESCRIPTION_MUST_NOT_CONTAIN = "Micro"

# Contract quantity (Spec Section 1: "configurable and not part of the
# strategy logic"). Per your answer: 1 ES contract, static at startup.
CONTRACT_QUANTITY = 1

# ---------------------------------------------------------------------------
# Candle timeframe & indicators (Spec Sections 1, 9)
# ---------------------------------------------------------------------------
CANDLE_MINUTES = 15
EMA_FAST_PERIOD = 9
EMA_SLOW_PERIOD = 21

# How many historical 15-minute bars to pull on startup/reconnect to seed
# EMA-21 and recent candle history (Q14: "yes, historical"). 21 is the
# mathematical minimum for a seeded EMA-21; extra bars give the EMA time
# to stabilize away from its SMA-seeded starting value before it's used
# to gate a live decision.
HISTORICAL_SEED_BARS = 100

# ---------------------------------------------------------------------------
# Trade management (Spec Section 11)
# ---------------------------------------------------------------------------
ES_STOP_POINTS = 10
ES_TARGET_POINTS = 10
# Ticks are computed at runtime from the contract's actual tickSize
# (returned by Contract/search) -- see topstepx_client.points_to_ticks().

# ---------------------------------------------------------------------------
# Session windows (Spec Section 2, as clarified: anchored to New York
# local time, DST-aware, both endpoints inclusive per your answers)
# ---------------------------------------------------------------------------
NY_TZ = ZoneInfo("America/New_York")

# (start_hour, start_minute, end_hour, end_minute) in NY local time.
# "Asian session" (per your clarification) = 6:00 PM - 2:00 AM NY (crosses
# midnight). "New York session" = 9:00 AM - 11:45 AM NY.
ASIAN_SESSION_NY = ((18, 0), (2, 0))     # crosses midnight
NY_SESSION_NY = ((9, 0), (11, 45))

# ---------------------------------------------------------------------------
# Files (Spec Sections 4, 17, 18)
# ---------------------------------------------------------------------------
LEVELS_FILE = os.environ.get("TRE_LEVELS_FILE", "levels.csv")
LOG_FILE = os.environ.get("TRE_LOG_FILE", "tre_log.csv")

# How often (seconds) the bot re-reads levels.csv to pick up newly
# appended levels while the market is open (Section 17: "Immediately make
# newly added levels available"). This is an engineering parameter, not a
# strategy rule -- lower it if you want faster pickup of manually-added
# levels. Not discussed explicitly in our Q&A; flagged here rather than
# silently buried.
LEVEL_FILE_POLL_SECONDS = 5

# ---------------------------------------------------------------------------
# Bot-side risk management
# ---------------------------------------------------------------------------
# Explicitly NOT implemented -- per your final decision, daily loss /
# drawdown protection is left entirely to TopstepX's own Personal Daily
# Loss Limit (PDLL), configured directly in TopstepX account settings.
# This bot contains no daily-loss or drawdown logic of its own.
