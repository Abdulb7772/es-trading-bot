"""
session_windows.py
===================
Implements Spec Section 2 ("Trading Hours") as clarified in our Q&A:

  - Windows are anchored to New York LOCAL time (America/New_York), which
    is DST-aware (EST in winter, EDT in summer). The bot does NOT use a
    fixed UTC offset -- as US clocks shift for DST, the corresponding
    Manila wall-clock time of each window shifts too, by design.
  - "Asian session"   = 6:00 PM - 2:00 AM New York time (crosses midnight)
  - "New York session" = 9:00 AM - 11:45 AM New York time
  - Both start and end boundaries are INCLUSIVE.

Only NEW ENTRIES are gated by this module. Section 2 is explicit that an
already-open trade may continue past the session cutoff until its own
exit condition fires -- this module has no opinion on open trades at all;
callers simply don't consult it once a trade is open.
"""

from datetime import datetime, time
from config import NY_TZ, ASIAN_SESSION_NY, NY_SESSION_NY


def _in_window_same_day(t: time, start: tuple, end: tuple) -> bool:
    start_t = time(*start)
    end_t = time(*end)
    return start_t <= t <= end_t


def _in_window_crosses_midnight(t: time, start: tuple, end: tuple) -> bool:
    start_t = time(*start)
    end_t = time(*end)
    # e.g. 18:00 -> 23:59:59.999999 OR 00:00:00 -> 02:00
    return t >= start_t or t <= end_t


def is_new_entry_allowed(utc_or_aware_dt: datetime) -> bool:
    """
    Returns True if `utc_or_aware_dt` (any tz-aware datetime) falls inside
    either configured session window, evaluated in New York local time.

    A NAIVE datetime is rejected on purpose -- silently assuming a
    timezone for an entry-permission check is exactly the kind of
    assumption Section 19 says not to make. Callers must pass tz-aware
    timestamps (candle close times from candle_builder.py already are).
    """
    if utc_or_aware_dt.tzinfo is None:
        raise ValueError(
            "is_new_entry_allowed() requires a timezone-aware datetime; "
            "got a naive datetime. Attach a timezone at the source instead "
            "of assuming one here."
        )

    ny_dt = utc_or_aware_dt.astimezone(NY_TZ)
    ny_time = ny_dt.time()

    if _in_window_crosses_midnight(ny_time, *ASIAN_SESSION_NY):
        return True
    if _in_window_same_day(ny_time, *NY_SESSION_NY):
        return True
    return False


def session_label(utc_or_aware_dt: datetime) -> str:
    """Human-readable label for logging -- not used for any trading logic."""
    ny_dt = utc_or_aware_dt.astimezone(NY_TZ)
    ny_time = ny_dt.time()
    if _in_window_crosses_midnight(ny_time, *ASIAN_SESSION_NY):
        return "asian_session"
    if _in_window_same_day(ny_time, *NY_SESSION_NY):
        return "ny_session"
    return "outside_session"
