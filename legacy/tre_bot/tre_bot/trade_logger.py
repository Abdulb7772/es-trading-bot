"""
trade_logger.py
================
Spec Section 18: "Log every meaningful setup decision, not just
completed trades," with a specific list of required fields.

Design note on WHEN a row gets written (not a strategy rule -- an
engineering choice, flagged here for transparency): each 3-candle
candidate gets exactly one CSV row.
  - If REJECTED, the row is written immediately (every field the spec
    asks for is already known at rejection time; entry/exit columns are
    left blank).
  - If ACCEPTED and traded, the row is written once the trade fully
    resolves (exit price and reason known), so the one row contains the
    complete lifecycle -- setup, entry, and exit -- rather than being
    split across multiple partial CSV rows that would need rewriting
    later (CSV doesn't support in-place row updates cleanly). bot.py
    holds the accepted SetupEvaluation in memory for the duration of the
    trade and calls log_completed_trade() at the end.
"""

import csv
import os
import threading
from typing import Optional

from models import SetupEvaluation

FIELDNAMES = [
    "timestamp",
    "direction",
    "candle1_open", "candle1_high", "candle1_low", "candle1_close",
    "candle2_open", "candle2_high", "candle2_low", "candle2_close",
    "candle3_open", "candle3_high", "candle3_low", "candle3_close",
    "relevant_levels",
    "levels_touched",
    "levels_broken",
    "final_broken_level",
    "next_profit_level",
    "ema9",
    "ema21",
    "status",              # accepted / rejected
    "rejection_reason",
    "es_entry_price",
    "es_stop_price",
    "es_target_price",
    "spy_early_exit_trigger_level",
    "es_exit_price",
    "exit_reason",
    "entry_timestamp",
    "exit_timestamp",
]


class TradeLogger:
    def __init__(self, path: str):
        self.path = path
        self._lock = threading.Lock()
        if not os.path.exists(self.path):
            with open(self.path, "w", newline="") as f:
                csv.DictWriter(f, fieldnames=FIELDNAMES).writeheader()

    def _write_row(self, row: dict) -> None:
        with self._lock:
            with open(self.path, "a", newline="") as f:
                csv.DictWriter(f, fieldnames=FIELDNAMES).writerow(row)

    @staticmethod
    def _base_row(ev: SetupEvaluation) -> dict:
        return {
            "timestamp": ev.timestamp.isoformat(),
            "direction": ev.direction.value,
            "candle1_open": ev.candle1.open, "candle1_high": ev.candle1.high,
            "candle1_low": ev.candle1.low, "candle1_close": ev.candle1.close,
            "candle2_open": ev.candle2.open, "candle2_high": ev.candle2.high,
            "candle2_low": ev.candle2.low, "candle2_close": ev.candle2.close,
            "candle3_open": ev.candle3.open, "candle3_high": ev.candle3.high,
            "candle3_low": ev.candle3.low, "candle3_close": ev.candle3.close,
            "relevant_levels": ";".join(str(x) for x in ev.relevant_levels),
            "levels_touched": ";".join(str(x) for x in ev.levels_touched),
            "levels_broken": ";".join(str(x) for x in ev.levels_broken),
            "final_broken_level": ev.final_broken_level,
            "next_profit_level": ev.next_target_level,
            "ema9": ev.ema_fast,
            "ema21": ev.ema_slow,
            "status": "accepted" if ev.accepted else "rejected",
            "rejection_reason": ev.rejection_reason,
            "es_entry_price": "",
            "es_stop_price": "",
            "es_target_price": "",
            "spy_early_exit_trigger_level": "",
            "es_exit_price": "",
            "exit_reason": "",
            "entry_timestamp": "",
            "exit_timestamp": "",
        }

    def log_rejected(self, ev: SetupEvaluation) -> None:
        assert not ev.accepted
        self._write_row(self._base_row(ev))

    def log_blocked(self, ev: SetupEvaluation, block_reason: str) -> None:
        """
        For a pattern that PASSED the candle/level/EMA checks but was
        blocked from becoming a trade by session hours or 'ES trade
        already open' (Section 14's other two failure conditions, kept
        separate from pattern failures per pattern_engine.py's design).
        """
        row = self._base_row(ev)
        row["status"] = "blocked"
        row["rejection_reason"] = block_reason
        self._write_row(row)

    def log_completed_trade(
        self,
        ev: SetupEvaluation,
        entry_price: float,
        entry_timestamp,
        stop_price: float,
        target_price: float,
        spy_early_exit_trigger_level: Optional[float],
        exit_price: Optional[float],
        exit_reason: str,
        exit_timestamp,
    ) -> None:
        assert ev.accepted
        row = self._base_row(ev)
        row["es_entry_price"] = entry_price
        row["es_stop_price"] = stop_price
        row["es_target_price"] = target_price
        row["spy_early_exit_trigger_level"] = (
            spy_early_exit_trigger_level if spy_early_exit_trigger_level is not None else ""
        )
        row["es_exit_price"] = exit_price if exit_price is not None else ""
        row["exit_reason"] = exit_reason
        row["entry_timestamp"] = entry_timestamp.isoformat() if entry_timestamp else ""
        row["exit_timestamp"] = exit_timestamp.isoformat() if exit_timestamp else ""
        self._write_row(row)
