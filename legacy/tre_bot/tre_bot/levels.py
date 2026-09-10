"""
levels.py
=========
Spec Sections 4 and 17: manually supplied SPY price levels, loaded from a
CSV file. The bot never calculates levels itself, never deletes or
modifies existing rows, and only ever appends new ones. New rows added
to the file while the bot is running are picked up automatically
(polled -- see config.LEVEL_FILE_POLL_SECONDS).

Reference-price resolution for "applicable" level (Q1, Q17):
    The applicable resistance/support for a candidate Candle 1 is computed
    using the PRIOR candle's close as the reference price -- i.e. the last
    known SPY price at the instant Candle 1 begins -- NOT Candle 1's own
    open. Using Candle 1's own open as the reference would make "Candle 1
    opens at or below resistance" tautologically true 100% of the time
    (the nearest-above level relative to a price is, by construction,
    always >= that price), which would make Section 8's "opening above
    resistance is invalid" gap rule impossible to ever trigger. Using the
    prior close as reference keeps that gap-rejection path real and
    reachable: a candle that gaps up through the level that WAS nearest-
    above relative to the prior close is correctly flagged invalid.
"""

import csv
import os
import threading
from typing import List, Optional


class LevelStore:
    def __init__(self, path: str):
        self.path = path
        self._lock = threading.Lock()
        self._levels: List[float] = []
        self._mtime: Optional[float] = None
        self._size: Optional[int] = None
        self._load_full()

    # -- loading -----------------------------------------------------------

    def _load_full(self) -> None:
        """Read the entire file fresh. Used at startup and whenever the
        file's mtime/size changes (see reload_if_changed)."""
        levels = []
        if os.path.exists(self.path):
            with open(self.path, "r", newline="") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    raw = (row.get("price") or "").strip()
                    if not raw:
                        continue
                    levels.append(float(raw))
        else:
            # No file yet -- start empty; the trader can create it later
            # and the bot will pick it up via reload_if_changed().
            levels = []

        with self._lock:
            self._levels = sorted(set(levels))
            if os.path.exists(self.path):
                st = os.stat(self.path)
                self._mtime = st.st_mtime
                self._size = st.st_size

    def reload_if_changed(self) -> bool:
        """Cheap check (mtime+size) so we don't re-parse the file every
        poll tick unless it actually changed. Returns True if reloaded."""
        if not os.path.exists(self.path):
            return False
        st = os.stat(self.path)
        if st.st_mtime == self._mtime and st.st_size == self._size:
            return False
        self._load_full()
        return True

    # -- writing (append-only, Section 4 & 17) ------------------------------

    def append_level(self, price: float) -> None:
        """
        Adds a new level to the file WITHOUT touching any existing row.
        Existing levels are never rewritten -- we open in append mode
        only. This is here for programmatic use; levels are more commonly
        added by the trader editing the CSV directly, which
        reload_if_changed() picks up on its own.
        """
        file_exists = os.path.exists(self.path)
        with self._lock:
            with open(self.path, "a", newline="") as f:
                writer = csv.writer(f)
                if not file_exists:
                    writer.writerow(["price"])
                writer.writerow([price])
            if price not in self._levels:
                self._levels.append(price)
                self._levels.sort()
            st = os.stat(self.path)
            self._mtime = st.st_mtime
            self._size = st.st_size

    # -- lookups -------------------------------------------------------------

    def all_levels(self) -> List[float]:
        with self._lock:
            return list(self._levels)

    def nearest_resistance(self, reference_price: float) -> Optional[float]:
        """Nearest level AT OR ABOVE reference_price (>=), or None if the
        level file has nothing at or above that price."""
        with self._lock:
            candidates = [lv for lv in self._levels if lv >= reference_price]
        return min(candidates) if candidates else None

    def nearest_support(self, reference_price: float) -> Optional[float]:
        """Nearest level AT OR BELOW reference_price (<=), or None if the
        level file has nothing at or below that price."""
        with self._lock:
            candidates = [lv for lv in self._levels if lv <= reference_price]
        return max(candidates) if candidates else None

    def levels_at_or_above(self, floor_price: float) -> List[float]:
        """Sorted ascending levels >= floor_price -- used to build the
        'ladder' of levels a long setup's Candle 3 might have reached."""
        with self._lock:
            return sorted(lv for lv in self._levels if lv >= floor_price)

    def levels_at_or_below(self, ceiling_price: float) -> List[float]:
        """Sorted descending levels <= ceiling_price -- the short-side
        mirror of levels_at_or_above."""
        with self._lock:
            return sorted((lv for lv in self._levels if lv <= ceiling_price), reverse=True)

    def next_level_above(self, price: float) -> Optional[float]:
        """Smallest level STRICTLY greater than price. Used for 'next
        resistance' (Section 12) once a broken level is known."""
        with self._lock:
            candidates = [lv for lv in self._levels if lv > price]
        return min(candidates) if candidates else None

    def next_level_below(self, price: float) -> Optional[float]:
        """Largest level STRICTLY less than price. Used for 'next
        support' (Section 12) once a broken level is known."""
        with self._lock:
            candidates = [lv for lv in self._levels if lv < price]
        return max(candidates) if candidates else None


def start_level_file_poller(store: LevelStore, poll_seconds: float, stop_event: threading.Event) -> threading.Thread:
    """Background thread that periodically calls reload_if_changed() so
    manually-added levels become available without restarting the bot
    (Section 17: 'Immediately make newly added levels available')."""

    def _run():
        while not stop_event.is_set():
            try:
                store.reload_if_changed()
            except Exception as e:  # noqa: BLE001 -- log and keep polling
                print(f"[levels] poll error: {e}")
            stop_event.wait(poll_seconds)

    t = threading.Thread(target=_run, name="level-file-poller", daemon=True)
    t.start()
    return t
