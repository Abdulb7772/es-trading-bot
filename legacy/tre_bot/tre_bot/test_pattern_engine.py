"""
test_pattern_engine.py
=======================
Not part of the delivered bot -- a verification script confirming
pattern_engine.py reproduces every worked example given in the spec
itself (Sections 7 and 12), plus the Section 8 gap-invalidation and
Section 9 EMA-filter paths. Run with:

    python test_pattern_engine.py

This is the one part of the system fully testable without live
credentials or network access, since pattern_engine.py has no external
dependencies -- so it's been actually run, not just read over.
"""

from datetime import datetime
from zoneinfo import ZoneInfo

from models import Candle
from levels import LevelStore
import pattern_engine as pe

NY = ZoneInfo("America/New_York")


def mk_candle(t, o, h, l, c):
    return Candle(open_time=datetime(2026, 1, 5, t, 0, tzinfo=NY), open=o, high=h, low=l, close=c)


def check(name, condition):
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {name}")
    if not condition:
        raise SystemExit(1)


store = LevelStore("/tmp/tre_test/levels.csv")
print("Levels loaded:", store.all_levels())

# ---------------------------------------------------------------------------
# Test 1 -- Section 7, example 1: Candle 3 closes at 659.
# Levels 650, 653, 657, 660 -- expect 650/653/657 broken, 657 relevant,
# 660 the next resistance, ACCEPTED.
# ---------------------------------------------------------------------------
c0_close = 649.5  # so applicable resistance = 650
c1 = mk_candle(9, o=649.8, h=650.2, l=649.5, c=650.0)   # green, opens below 650
c2 = mk_candle(9, o=650.0, h=650.3, l=649.0, c=649.2)   # red
c3 = mk_candle(10, o=649.3, h=659.0, l=649.3, c=659.0)  # green, closes at 659, high reaches 659
ev = pe.evaluate_long(c3.open_time, c0_close, c1, c2, c3, store, ema_fast=10, ema_slow=5)
check("T1 accepted", ev.accepted)
check("T1 final_broken_level == 657", ev.final_broken_level == 657.0)
check("T1 next_target_level == 660", ev.next_target_level == 660.0)
check("T1 levels_broken == [650,653,657]", ev.levels_broken == [650.0, 653.0, 657.0])

# ---------------------------------------------------------------------------
# Test 2 -- Section 7, example 2: Candle 3 reaches 657 but closes below it.
# Expect REJECTED.
# ---------------------------------------------------------------------------
c3b = mk_candle(10, o=649.3, h=657.5, l=649.3, c=656.0)  # wicks to 657.5, closes at 656
ev2 = pe.evaluate_long(c3b.open_time, c0_close, c1, c2, c3b, store, ema_fast=10, ema_slow=5)
check("T2 rejected", not ev2.accepted)
check("T2 reason is level_reached_but_not_closed_through", ev2.rejection_reason == "level_reached_but_not_closed_through")

# ---------------------------------------------------------------------------
# Test 3 -- Section 12 long example: applicable=653, Candle 3 closes at
# 654, never reaches 657. Expect broken=653, next=657, ACCEPTED.
# ---------------------------------------------------------------------------
c0c = 651.0  # nearest level >= 651 is 653
c1c = mk_candle(9, o=651.5, h=652.5, l=651.0, c=652.4)   # green, opens below 653
c2c = mk_candle(9, o=652.4, h=652.6, l=651.8, c=652.0)   # red
c3c = mk_candle(10, o=652.1, h=654.2, l=652.0, c=654.0)  # green, closes 654, high 654.2 (< 657)
ev3 = pe.evaluate_long(c3c.open_time, c0c, c1c, c2c, c3c, store, ema_fast=10, ema_slow=5)
check("T3 accepted", ev3.accepted)
check("T3 final_broken_level == 653", ev3.final_broken_level == 653.0)
check("T3 next_target_level == 657", ev3.next_target_level == 657.0)

# ---------------------------------------------------------------------------
# Test 4 -- Section 12 short example (mirror): applicable support=653,
# Candle 3 closes at 652, never reaches 650. Expect broken=653, next=650.
# ---------------------------------------------------------------------------
c0d = 655.0  # nearest level <= 655 is 653
c1d = mk_candle(9, o=654.5, h=655.0, l=653.6, c=653.8)   # red, opens above 653
c2d = mk_candle(9, o=653.8, h=654.3, l=653.7, c=654.1)   # green
c3d = mk_candle(10, o=654.0, h=654.0, l=651.8, c=652.0)  # red, closes 652, low 651.8 (> 650)
ev4 = pe.evaluate_short(c3d.open_time, c0d, c1d, c2d, c3d, store, ema_fast=5, ema_slow=10)
check("T4 accepted", ev4.accepted)
check("T4 final_broken_level == 653", ev4.final_broken_level == 653.0)
check("T4 next_target_level == 650", ev4.next_target_level == 650.0)

# ---------------------------------------------------------------------------
# Test 5 -- Section 8 gap invalidation: Candle 1 gaps open ABOVE the
# level that was applicable relative to the prior close. Expect REJECTED.
# ---------------------------------------------------------------------------
c0e = 648.0  # nearest level >= 648 is 650 -> applicable = 650
c1e = mk_candle(9, o=651.0, h=651.5, l=650.8, c=651.2)   # green, but OPENS at 651 > 650
c2e = mk_candle(9, o=651.2, h=651.4, l=650.5, c=650.7)
c3e = mk_candle(10, o=650.8, h=652.0, l=650.6, c=651.9)
ev5 = pe.evaluate_long(c3e.open_time, c0e, c1e, c2e, c3e, store, ema_fast=10, ema_slow=5)
check("T5 rejected on gap", not ev5.accepted)
check("T5 reason is candle1_opened_above_resistance", ev5.rejection_reason == "candle1_opened_above_resistance")

# ---------------------------------------------------------------------------
# Test 6 -- Section 9 EMA filter: otherwise-valid long setup, but
# EMA9 < EMA21 at Candle 3 close. Expect REJECTED on ema_filter_failed.
# ---------------------------------------------------------------------------
ev6 = pe.evaluate_long(c3.open_time, c0_close, c1, c2, c3, store, ema_fast=5, ema_slow=10)
check("T6 rejected on EMA filter", not ev6.accepted)
check("T6 reason is ema_filter_failed", ev6.rejection_reason == "ema_filter_failed")

# ---------------------------------------------------------------------------
# Test 7 -- Candle 1 opening EXACTLY at the applicable level is allowed.
# ---------------------------------------------------------------------------
c0f = 648.0  # applicable = 650
c1f = mk_candle(9, o=650.0, h=650.5, l=649.8, c=650.3)   # green, opens exactly AT 650
c2f = mk_candle(9, o=650.3, h=650.4, l=649.5, c=649.7)
c3f = mk_candle(10, o=649.8, h=651.0, l=649.6, c=650.9)  # closes exactly-ish above 650
ev7 = pe.evaluate_long(c3f.open_time, c0f, c1f, c2f, c3f, store, ema_fast=10, ema_slow=5)
check("T7 accepted (open exactly at resistance allowed)", ev7.accepted)

print("\nAll pattern_engine tests passed.")
