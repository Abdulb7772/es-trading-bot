"""
models.py
=========
Shared plain-data structures. Kept dependency-free (stdlib dataclasses
only) so every other module can import from here without a heavy
dependency chain.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional


class Direction(Enum):
    LONG = "LONG"
    SHORT = "SHORT"


@dataclass
class Candle:
    """One 15-minute SPY candle, timestamped at its OPEN time (NY local)."""
    open_time: datetime  # tz-aware, America/New_York
    open: float
    high: float
    low: float
    close: float

    @property
    def is_green(self) -> bool:
        return self.close > self.open

    @property
    def is_red(self) -> bool:
        return self.close < self.open


@dataclass
class SetupEvaluation:
    """
    The full record of one candidate 3-candle window being evaluated,
    win or lose. This is the natural source for the Section 18 decision
    log -- every candidate gets one of these, not just accepted trades.
    """
    timestamp: datetime
    direction: Direction
    candle1: Candle
    candle2: Candle
    candle3: Candle
    applicable_level: float           # nearest level at candle1 open (Q1)
    relevant_levels: list             # all levels in the "ladder" considered
    levels_touched: list              # levels reached by any of the 3 candles (Q16)
    levels_broken: list               # levels successfully broken (closed through)
    final_broken_level: Optional[float]
    next_target_level: Optional[float]
    ema_fast: Optional[float]
    ema_slow: Optional[float]
    accepted: bool
    rejection_reason: str = ""


@dataclass
class OpenTrade:
    """State for the single ES trade that may be open at a time (Section 3)."""
    direction: Direction
    contract_id: str
    entry_order_id: int
    entry_price: Optional[float] = None
    stop_price: Optional[float] = None
    target_price: Optional[float] = None
    stop_order_id: Optional[int] = None
    target_order_id: Optional[int] = None
    next_target_level: Optional[float] = None   # SPY level, Section 12
    broken_level: Optional[float] = None
    entry_time: Optional[datetime] = None
    custom_tag: str = ""
    closed: bool = False
