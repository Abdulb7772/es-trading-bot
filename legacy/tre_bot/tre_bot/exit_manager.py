"""
exit_manager.py
================
Spec Section 12 (SPY resistance/support profit exit) and Section 13
(exit priority). Real-time SPY trade prices are checked against the
open trade's next-target level on every tick -- not on candle close
(Section 12: "Do not wait for a candle close.").

Execution order when the SPY level triggers (your answer to the
cancel-vs-close-first question): CANCEL the resting stop/target bracket
orders first, THEN send the market order to close. This avoids a race
where a stale resting order could also fill right as we're closing for
a different reason.

This module only INITIATES the close -- the actual fill price/timestamp
for the resulting market order arrives later via the normal User Hub
trade event flow (topstepx_realtime.py), same as it does for ordinary
stop/target fills. bot.py attributes the eventual fill to "spy_level"
exit reason because it already knows this trade's close was
SPY-triggered.
"""

from typing import Optional

from models import Direction, OpenTrade
from topstepx_client import TopstepXClient


def spy_price_triggers_exit(open_trade: OpenTrade, price: float) -> bool:
    if open_trade.closed or open_trade.next_target_level is None:
        return False
    if open_trade.direction is Direction.LONG:
        return price >= open_trade.next_target_level
    else:
        return price <= open_trade.next_target_level


def execute_spy_triggered_exit(client: TopstepXClient, account_id: str, open_trade: OpenTrade) -> bool:
    """Cancel resting bracket orders, then send the market close.
    Returns True if the close request was accepted."""
    if open_trade.stop_order_id is not None:
        try:
            client.cancel_order(account_id, open_trade.stop_order_id)
        except Exception as e:  # noqa: BLE001
            print(f"[exit_manager] failed to cancel stop order {open_trade.stop_order_id}: {e}")

    if open_trade.target_order_id is not None:
        try:
            client.cancel_order(account_id, open_trade.target_order_id)
        except Exception as e:  # noqa: BLE001
            print(f"[exit_manager] failed to cancel target order {open_trade.target_order_id}: {e}")

    try:
        ok = client.close_position_market(account_id, open_trade.contract_id)
    except Exception as e:  # noqa: BLE001
        print(f"[exit_manager] close_position_market raised: {e}")
        return False

    if not ok:
        print(f"[exit_manager] WARNING: close_position_market reported failure "
              f"for contract {open_trade.contract_id}")
    return ok
