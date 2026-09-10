"""
test_session_and_candles.py
=============================
Verifies session_windows.py (DST-aware NY session boundaries, Q3/Q4)
and candle_builder.py (1-min -> 15-min aggregation, boundary alignment)
actually behave as specified. Run with:

    python test_session_and_candles.py
"""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from session_windows import is_new_entry_allowed, session_label
from candle_builder import SPYCandleBuilder

NY = ZoneInfo("America/New_York")


def check(name, condition):
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {name}")
    if not condition:
        raise SystemExit(1)


# ---------------------------------------------------------------------------
# Session windows -- DST awareness (Q4) and inclusivity (Q3)
# ---------------------------------------------------------------------------

# Winter (EST, UTC-5): 9:00 AM NY = 14:00 UTC. Boundary-inclusive check.
winter_ny_900am = datetime(2026, 1, 15, 9, 0, 0, tzinfo=NY)
check("winter 9:00 AM NY is allowed (inclusive start)", is_new_entry_allowed(winter_ny_900am))

winter_ny_1145am = datetime(2026, 1, 15, 11, 45, 0, tzinfo=NY)
check("winter 11:45 AM NY is allowed (inclusive end)", is_new_entry_allowed(winter_ny_1145am))

winter_ny_1146am = datetime(2026, 1, 15, 11, 46, 0, tzinfo=NY)
check("winter 11:46 AM NY is NOT allowed (just past end)", not is_new_entry_allowed(winter_ny_1146am))

winter_ny_noon = datetime(2026, 1, 15, 13, 0, 0, tzinfo=NY)
check("winter 1:00 PM NY (between windows) is NOT allowed", not is_new_entry_allowed(winter_ny_noon))

# Summer (EDT, UTC-4): same NY wall-clock time should still be allowed --
# the point of Q4 is that the window follows NY LOCAL time, DST and all.
summer_ny_900am = datetime(2026, 7, 15, 9, 0, 0, tzinfo=NY)
check("summer 9:00 AM NY is allowed (DST-aware)", is_new_entry_allowed(summer_ny_900am))

# Cross-check: convert that summer NY time to UTC and confirm the UTC
# offset actually differs from winter (i.e. DST is really being applied
# by the zoneinfo database, not silently ignored).
winter_utc_offset = winter_ny_900am.utcoffset()
summer_utc_offset = summer_ny_900am.utcoffset()
check("winter/summer UTC offsets differ (DST really applied)", winter_utc_offset != summer_utc_offset)
print(f"    winter offset={winter_utc_offset}, summer offset={summer_utc_offset}")

# Asian session crosses midnight: 6:00 PM NY through 2:00 AM NY.
asian_evening = datetime(2026, 1, 15, 18, 0, 0, tzinfo=NY)
check("6:00 PM NY (Asian session start) is allowed", is_new_entry_allowed(asian_evening))

asian_after_midnight = datetime(2026, 1, 16, 1, 30, 0, tzinfo=NY)
check("1:30 AM NY (past midnight, still Asian session) is allowed", is_new_entry_allowed(asian_after_midnight))

asian_end = datetime(2026, 1, 16, 2, 0, 0, tzinfo=NY)
check("2:00 AM NY (Asian session end) is allowed (inclusive)", is_new_entry_allowed(asian_end))

asian_just_after_end = datetime(2026, 1, 16, 2, 1, 0, tzinfo=NY)
check("2:01 AM NY is NOT allowed (just past Asian session end)", not is_new_entry_allowed(asian_just_after_end))

# A naive datetime must be rejected outright rather than silently assumed.
try:
    is_new_entry_allowed(datetime(2026, 1, 15, 9, 0, 0))
    check("naive datetime raises ValueError", False)
except ValueError:
    check("naive datetime raises ValueError", True)

print(f"    label at 6:00 PM NY = {session_label(asian_evening)}")
print(f"    label at 9:00 AM NY = {session_label(winter_ny_900am)}")
print(f"    label at 1:00 PM NY = {session_label(winter_ny_noon)}")

# ---------------------------------------------------------------------------
# Candle aggregation -- 1-minute bars roll up into aligned 15-minute candles
# ---------------------------------------------------------------------------

closed_candles = []
builder = SPYCandleBuilder(on_candle_closed=lambda c: closed_candles.append(c))

# NY 9:31, 9:32, ..., 9:44 (14 bars) should all fold into the 9:30-9:45
# window; the bar landing at 9:45 should trigger finalization of that
# window and start a new one.
base = datetime(2026, 1, 15, 9, 31, tzinfo=NY).astimezone(timezone.utc)
prices = [(650.0 + i * 0.1) for i in range(14)]
for i, p in enumerate(prices):
    ts = base.replace(minute=(base.minute + i) % 60) if False else base + __import__("datetime").timedelta(minutes=i)
    o = p
    h = p + 0.2
    l = p - 0.2
    c = p + 0.05
    builder.ingest_live_minute_bar(ts, o, h, l, c)

check("no candle finalized yet (still mid-window)", len(closed_candles) == 0)

# The bar for NY 9:45 pushes us into a new window -> finalizes 9:30 candle.
ts_945 = datetime(2026, 1, 15, 9, 45, tzinfo=NY).astimezone(timezone.utc)
builder.ingest_live_minute_bar(ts_945, 651.5, 651.8, 651.3, 651.6)

check("exactly one candle finalized after crossing the boundary", len(closed_candles) == 1)
finalized = closed_candles[0]
check("finalized candle open_time is 9:30 NY", finalized.open_time == datetime(2026, 1, 15, 9, 30, tzinfo=NY))
check("finalized candle open == first bar's open", finalized.open == prices[0])
check("finalized candle close == last bar-before-boundary's close",
      abs(finalized.close - (prices[-1] + 0.05)) < 1e-9)
expected_high = max(p + 0.2 for p in prices)
check("finalized candle high correct", abs(finalized.high - expected_high) < 1e-9)

print("\nAll session/candle tests passed.")
