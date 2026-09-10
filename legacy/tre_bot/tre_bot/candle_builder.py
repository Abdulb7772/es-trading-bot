"""
candle_builder.py
==================
Builds the SPY 15-minute candles the whole strategy runs on (Spec
Section 1: "15-minute candles"; Section 16: "Accurate SPY 15-minute
candle construction").

Alpaca's free live stream only provides 1-minute aggregated bars
(there's no native 15-minute live stream) -- so this module rolls
consecutive 1-minute bars up into 15-minute candles itself. Historical
seeding does NOT go through this class at all: bot.py fetches genuine
15-minute historical bars directly from Alpaca's historical REST
endpoint (which does support a native 15Min timeframe), so seeding is
exact, not reconstructed from 1-minute bars.

Candle boundaries are aligned to :00/:15/:30/:45 of each hour in
New York local time -- the standard convention for 15-minute charts.
"""

import threading
from datetime import datetime, timedelta
from typing import Callable, Optional

from config import NY_TZ, CANDLE_MINUTES
from models import Candle


def _window_start_ny(utc_dt: datetime) -> datetime:
    """Floor a UTC timestamp down to its containing 15-minute window,
    expressed in NY local time."""
    ny_dt = utc_dt.astimezone(NY_TZ)
    floored_minute = (ny_dt.minute // CANDLE_MINUTES) * CANDLE_MINUTES
    return ny_dt.replace(minute=floored_minute, second=0, microsecond=0)


class SPYCandleBuilder:
    def __init__(self, on_candle_closed: Callable[[Candle], None]):
        self.on_candle_closed = on_candle_closed
        self._lock = threading.Lock()
        self._window_start: Optional[datetime] = None
        self._o = self._h = self._l = self._c = None
        self._finalized_windows = set()  # guards against double-emit

    def ingest_live_minute_bar(self, utc_timestamp: datetime, o: float, h: float, l: float, c: float) -> None:
        """Feed one live 1-minute bar (Alpaca subscribe_bars callback)."""
        window_start = _window_start_ny(utc_timestamp)

        with self._lock:
            if self._window_start is None:
                # First bar since startup -- open a new window.
                self._start_window(window_start, o, h, l, c)
                return

            if window_start == self._window_start:
                # Same 15-minute window -- fold this minute bar in.
                self._h = max(self._h, h)
                self._l = min(self._l, l)
                self._c = c
                return

            if window_start > self._window_start:
                # We've crossed into a new window -- finalize the old one
                # first, then open the new one.
                self._finalize_locked()
                self._start_window(window_start, o, h, l, c)
                return

            # window_start < self._window_start: an out-of-order/late bar
            # for a window we've already moved past. Not expected in a
            # live sequential stream; ignored rather than silently
            # corrupting an already-finalized (or in-progress) candle.
            print(f"[candle_builder] ignoring late/out-of-order bar for {window_start}")

    def force_finalize_if_stale(self, now_utc: datetime, grace_seconds: int = 5) -> None:
        """
        Safety net for the case where the final minute of a 15-minute
        window has zero trades (so no triggering bar ever arrives to
        push us into the next window). Called periodically by bot.py's
        main loop. Finalizes the current candle once wall-clock time has
        clearly moved past its window, even without a new bar to trigger
        it.
        """
        with self._lock:
            if self._window_start is None:
                return
            window_end = self._window_start + timedelta(minutes=CANDLE_MINUTES)
            now_ny = now_utc.astimezone(NY_TZ)
            if now_ny >= window_end + timedelta(seconds=grace_seconds):
                self._finalize_locked()
                self._window_start = None  # next bar starts a fresh window

    def _start_window(self, window_start, o, h, l, c) -> None:
        self._window_start = window_start
        self._o, self._h, self._l, self._c = o, h, l, c

    def _finalize_locked(self) -> None:
        if self._window_start is None or self._window_start in self._finalized_windows:
            return
        candle = Candle(
            open_time=self._window_start,
            open=self._o, high=self._h, low=self._l, close=self._c,
        )
        self._finalized_windows.add(self._window_start)
        # Keep the guard set from growing forever.
        if len(self._finalized_windows) > 500:
            oldest = sorted(self._finalized_windows)[:250]
            for w in oldest:
                self._finalized_windows.discard(w)
        self.on_candle_closed(candle)
