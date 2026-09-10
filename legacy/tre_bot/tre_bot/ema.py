"""
ema.py
======
Standard exponential moving average (Spec Section 9: "Standard SPY
15-minute closing-price EMAs").

Seeding method: EMA is seeded with a simple moving average (SMA) of the
first `period` closes, then updated recursively for every close after
that using the standard EMA formula:

    k = 2 / (period + 1)
    EMA_t = close_t * k + EMA_{t-1} * (1 - k)

This is the conventional definition of EMA used by most charting
platforms. It's flagged here (and in the README) as the specific
formula/seeding choice made, since the spec says "standard EMA" without
spelling out the seeding method -- if your reference charting platform
seeds differently, this is a one-function change.
"""

from typing import List, Optional


class EMA:
    def __init__(self, period: int):
        self.period = period
        self.k = 2.0 / (period + 1)
        self._value: Optional[float] = None
        self._seed_buffer: List[float] = []  # used only if never explicitly seeded

    @property
    def seeded(self) -> bool:
        return self._value is not None

    @property
    def value(self) -> Optional[float]:
        return self._value

    def seed_from_closes(self, closes: List[float]) -> None:
        """
        Feed historical closes (oldest first) to establish the initial
        EMA value via SMA-seeding, then roll forward through any
        remaining closes with the standard recursive formula. Safe to
        call with more than `period` closes -- bot.py deliberately seeds
        with config.HISTORICAL_SEED_BARS (100) so the EMA has settled
        well away from its initial SMA value before it gates a live
        decision (Q14).
        """
        if len(closes) < self.period:
            raise ValueError(
                f"Need at least {self.period} historical closes to seed "
                f"EMA-{self.period}; got {len(closes)}."
            )
        sma = sum(closes[: self.period]) / self.period
        self._value = sma
        for c in closes[self.period:]:
            self.update(c)

    def update(self, close: float) -> float:
        """Feed one new close. If not yet seeded, accumulates closes and
        auto-seeds via SMA once `period` closes have arrived (fallback
        path -- bot.py normally seeds from historical bars first)."""
        if self._value is None:
            self._seed_buffer.append(close)
            if len(self._seed_buffer) >= self.period:
                self._value = sum(self._seed_buffer[-self.period:]) / self.period
                return self._value
            return close
        self._value = close * self.k + self._value * (1 - self.k)
        return self._value
