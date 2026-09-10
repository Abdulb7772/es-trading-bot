"""
pattern_engine.py
==================
The literal implementation of the TRE three-candle pattern (Spec
Sections 5, 6, 7, 8, 9, 14). This is the highest-stakes file in the
project -- every branch below is commented with the exact spec section
and, where our Q&A resolved an ambiguity, the question number.

ALGORITHM SUMMARY (verified against all three worked examples in the
spec: Section 7's two examples and Section 12's long/short examples):

  1. applicable_level = nearest level at/above (long) or at/below (short)
     the REFERENCE PRICE, where reference price = the close of the
     candle immediately before Candle 1 (Q1, Q17). Using Candle 1's own
     open as the reference would make the "opens at/below resistance"
     check tautologically always-true, which would make Section 8's
     gap-invalidation impossible to ever trigger -- so the prior
     candle's close is used instead.

  2. Candle 1 must be green (long) / red (short), and must open at or
     below applicable_level (long) / at or above applicable_level
     (short). Equality is explicitly allowed (Section 5/6). No
     requirement to cross or close beyond it (Section 5/6). Opening
     beyond it is a gap-invalidation (Section 8).

  3. Candle 2 must be red (long) / green (short). No price-location
     requirement (Section 5/6).

  4. Candle 3 must be green (long) / red (short) AND close at or above
     (long) / at or below (short) applicable_level (baseline, Section
     5/6), AND must close at or above/below EVERY level in the ladder
     (all levels at/beyond applicable_level) that was "reached" by ANY
     of the three candles' highs/lows (Section 7). "Reached" means a
     candle's high >= level (long) / low <= level (short) -- i.e. the
     wick is at or through the level (Q16: interpretation B, with your
     "at or through" caveat). A reached-but-not-closed-through level
     rejects the whole setup (Section 7, second example).

  5. If accepted: the relevant broken level is the highest (long) /
     lowest (short) level that was successfully broken. The next
     profit-target level (Section 12) is the next level in the level
     file strictly beyond the broken level.

  6. EMA filter (Section 9) is checked LAST, independently of the
     candle/level checks, exactly as Section 14 lists it as a separate
     failure condition from the pattern checks themselves.

Session-hours and "ES trade already open" gating (also listed in
Section 14) are deliberately NOT done in this module -- they're applied
by bot.py on top of an already-accepted pattern, so the decision log
can distinguish "pattern failed" from "pattern valid but blocked by
session/position" as the distinct reasons Section 14 lists them as.
"""

from typing import List, Optional

from models import Candle, Direction, SetupEvaluation
from levels import LevelStore


def _evaluate_common(
    direction: Direction,
    timestamp,
    candle0_close: Optional[float],
    candle1: Candle,
    candle2: Candle,
    candle3: Candle,
    level_store: LevelStore,
    ema_fast: Optional[float],
    ema_slow: Optional[float],
) -> SetupEvaluation:
    long_side = direction is Direction.LONG

    def reject(reason: str, **extra) -> SetupEvaluation:
        return SetupEvaluation(
            timestamp=timestamp, direction=direction,
            candle1=candle1, candle2=candle2, candle3=candle3,
            applicable_level=extra.get("applicable_level", float("nan")),
            relevant_levels=extra.get("relevant_levels", []),
            levels_touched=extra.get("levels_touched", []),
            levels_broken=extra.get("levels_broken", []),
            final_broken_level=extra.get("final_broken_level"),
            next_target_level=extra.get("next_target_level"),
            ema_fast=ema_fast, ema_slow=ema_slow,
            accepted=False, rejection_reason=reason,
        )

    # -- Step 1: applicable level (Q1, Q17) ---------------------------------
    reference_price = candle0_close if candle0_close is not None else candle1.open
    if long_side:
        applicable_level = level_store.nearest_resistance(reference_price)
    else:
        applicable_level = level_store.nearest_support(reference_price)

    if applicable_level is None:
        return reject("no_applicable_level_available")

    # -- Step 2: Candle 1 (Section 5 / 6, gap rule Section 8) ---------------
    if long_side:
        if not candle1.is_green:
            return reject("candle1_not_green", applicable_level=applicable_level)
        if candle1.open > applicable_level:
            return reject("candle1_opened_above_resistance", applicable_level=applicable_level)
    else:
        if not candle1.is_red:
            return reject("candle1_not_red", applicable_level=applicable_level)
        if candle1.open < applicable_level:
            return reject("candle1_opened_below_support", applicable_level=applicable_level)

    # -- Step 3: Candle 2 (Section 5 / 6) -----------------------------------
    if long_side:
        if not candle2.is_red:
            return reject("candle2_not_red", applicable_level=applicable_level)
    else:
        if not candle2.is_green:
            return reject("candle2_not_green", applicable_level=applicable_level)

    # -- Step 4: Candle 3 baseline (Section 5 / 6) --------------------------
    if long_side:
        if not candle3.is_green:
            return reject("candle3_not_green", applicable_level=applicable_level)
        if candle3.close < applicable_level:
            return reject("candle3_failed_to_close_above_applicable_level",
                           applicable_level=applicable_level)
    else:
        if not candle3.is_red:
            return reject("candle3_not_red", applicable_level=applicable_level)
        if candle3.close > applicable_level:
            return reject("candle3_failed_to_close_below_applicable_level",
                           applicable_level=applicable_level)

    # -- Step 4b: Candle 3 vs. the full ladder (Section 7, Q16) -------------
    if long_side:
        relevant_levels = level_store.levels_at_or_above(applicable_level)
        upper_ladder = [lv for lv in relevant_levels if lv > applicable_level]
        touched_beyond_baseline = [
            lv for lv in upper_ladder
            if candle1.high >= lv or candle2.high >= lv or candle3.high >= lv
        ]
        rejected_levels = [lv for lv in touched_beyond_baseline if candle3.close < lv]
    else:
        relevant_levels = level_store.levels_at_or_below(applicable_level)
        lower_ladder = [lv for lv in relevant_levels if lv < applicable_level]
        touched_beyond_baseline = [
            lv for lv in lower_ladder
            if candle1.low <= lv or candle2.low <= lv or candle3.low <= lv
        ]
        rejected_levels = [lv for lv in touched_beyond_baseline if candle3.close > lv]

    levels_touched = sorted(set(touched_beyond_baseline + [applicable_level]))

    if rejected_levels:
        return reject(
            "level_reached_but_not_closed_through",
            applicable_level=applicable_level,
            relevant_levels=relevant_levels,
            levels_touched=levels_touched,
        )

    levels_broken = sorted(set(touched_beyond_baseline + [applicable_level]))
    final_broken_level = max(levels_broken) if long_side else min(levels_broken)
    next_target_level = (
        level_store.next_level_above(final_broken_level) if long_side
        else level_store.next_level_below(final_broken_level)
    )

    # -- Step 5: EMA filter (Section 9), checked independently/last --------
    if ema_fast is None or ema_slow is None:
        return reject(
            "ema_not_yet_available", applicable_level=applicable_level,
            relevant_levels=relevant_levels, levels_touched=levels_touched,
            levels_broken=levels_broken, final_broken_level=final_broken_level,
            next_target_level=next_target_level,
        )
    if long_side and not (ema_fast > ema_slow):
        return reject(
            "ema_filter_failed", applicable_level=applicable_level,
            relevant_levels=relevant_levels, levels_touched=levels_touched,
            levels_broken=levels_broken, final_broken_level=final_broken_level,
            next_target_level=next_target_level,
        )
    if (not long_side) and not (ema_fast < ema_slow):
        return reject(
            "ema_filter_failed", applicable_level=applicable_level,
            relevant_levels=relevant_levels, levels_touched=levels_touched,
            levels_broken=levels_broken, final_broken_level=final_broken_level,
            next_target_level=next_target_level,
        )

    # -- Accepted ------------------------------------------------------------
    return SetupEvaluation(
        timestamp=timestamp, direction=direction,
        candle1=candle1, candle2=candle2, candle3=candle3,
        applicable_level=applicable_level,
        relevant_levels=relevant_levels,
        levels_touched=levels_touched,
        levels_broken=levels_broken,
        final_broken_level=final_broken_level,
        next_target_level=next_target_level,
        ema_fast=ema_fast, ema_slow=ema_slow,
        accepted=True, rejection_reason="",
    )


def evaluate_long(timestamp, candle0_close, candle1, candle2, candle3,
                   level_store, ema_fast, ema_slow) -> SetupEvaluation:
    return _evaluate_common(Direction.LONG, timestamp, candle0_close,
                             candle1, candle2, candle3, level_store, ema_fast, ema_slow)


def evaluate_short(timestamp, candle0_close, candle1, candle2, candle3,
                    level_store, ema_fast, ema_slow) -> SetupEvaluation:
    return _evaluate_common(Direction.SHORT, timestamp, candle0_close,
                             candle1, candle2, candle3, level_store, ema_fast, ema_slow)


def evaluate_both_directions(
    candle_history: List[Candle],
    level_store: LevelStore,
    ema_fast: Optional[float],
    ema_slow: Optional[float],
) -> List[SetupEvaluation]:
    """
    Called once per newly-closed candle. Evaluates the last three candles
    in candle_history as a potential LONG setup AND independently as a
    potential SHORT setup.

    This sliding-window approach -- always checking the most recent three
    candles, on every new close -- is what satisfies Section 15's
    "newly completed candles should continuously be evaluated as
    potential Candle 1 candidates" and your "multiple overlapping"
    answer: because a 3-candle setup must be CONSECUTIVE (Section 5/6
    say so explicitly), any given candle plays the role of Candle 3 in
    exactly one window, but that same candle becomes Candle 2 and then
    Candle 1 of the following windows as new candles arrive -- so every
    candle is naturally evaluated in every role over time, with no
    cooldown and no candle "used up" by a prior failure (Section 15).
    """
    if len(candle_history) < 3:
        return []

    c1, c2, c3 = candle_history[-3], candle_history[-2], candle_history[-1]
    c0_close = candle_history[-4].close if len(candle_history) >= 4 else None
    timestamp = c3.open_time

    results = []
    results.append(evaluate_long(timestamp, c0_close, c1, c2, c3, level_store, ema_fast, ema_slow))
    results.append(evaluate_short(timestamp, c0_close, c1, c2, c3, level_store, ema_fast, ema_slow))
    return results
