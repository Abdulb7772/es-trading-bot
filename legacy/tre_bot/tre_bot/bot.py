"""
bot.py
======
Orchestrates the whole system. Architecture: Alpaca's live stream and
TopstepX's User Hub each run in their own background thread, both
pushing events onto one shared, thread-safe queue.Queue. This module
runs the single consumer loop on the main thread, so all strategy
state (candle history, EMAs, the one open trade) is only ever touched
from one place -- no locks needed around strategy logic itself.

Event types on the queue:
    ("minute_bar", utc_ts, o, h, l, c)      -- from spy_feed.py
    ("trade_price", utc_ts, price)          -- from spy_feed.py
    ("candle_closed", Candle)               -- from candle_builder.py's callback
    ("user_order", order_dict)              -- from topstepx_realtime.py
    ("user_position", position_dict)        -- from topstepx_realtime.py
    ("user_trade", trade_dict)              -- from topstepx_realtime.py
    ("user_account", account_dict)          -- from topstepx_realtime.py

BRACKET CHILD-ORDER CORRELATION -- residual integration risk, flagged
explicitly: POST /api/Order/place returns only the parent (entry)
order's id; the two bracket legs it creates (stop, target) are not
returned directly. This bot identifies them by watching subsequent
GatewayUserOrder events on the same account/contract for new order ids
of type Stop / Limit appearing shortly after the entry fills, and
capturing the first of each. This is a best-effort heuristic against
the documented API surface, not a guarantee from the docs themselves --
TEST THIS SPECIFIC BEHAVIOR THOROUGHLY on your Combine before trusting
it live (see README "Before you go live").
"""

import queue
import threading
from datetime import datetime, timezone

import config
from models import Candle, Direction, OpenTrade, SetupEvaluation
from levels import LevelStore, start_level_file_poller
from ema import EMA
from candle_builder import SPYCandleBuilder
from session_windows import is_new_entry_allowed
import pattern_engine
from spy_feed import fetch_historical_15min_candles, SPYLiveStream
from topstepx_client import (
    TopstepXClient, points_to_ticks,
    ORDER_SIDE_BUY, ORDER_SIDE_SELL,
    ORDER_TYPE_STOP, ORDER_TYPE_LIMIT,
    ORDER_STATUS_FILLED, ORDER_STATUS_REJECTED,
)
from topstepx_realtime import TopstepXRealtimeClient
from exit_manager import spy_price_triggers_exit, execute_spy_triggered_exit
from trade_logger import TradeLogger


class TREBot:
    def __init__(self):
        self.event_queue: "queue.Queue" = queue.Queue()

        self.level_store = LevelStore(config.LEVELS_FILE)
        self.trade_logger = TradeLogger(config.LOG_FILE)

        self.ema_fast = EMA(config.EMA_FAST_PERIOD)
        self.ema_slow = EMA(config.EMA_SLOW_PERIOD)
        self.candle_history = []  # list[Candle], most-recent last

        self.candle_builder = SPYCandleBuilder(on_candle_closed=self._on_candle_closed)

        self.client = TopstepXClient()
        self.account_id = config.TOPSTEPX_ACCOUNT_ID
        self.contract_id = None
        self.tick_size = None
        self.stop_ticks = None
        self.target_ticks = None

        self.current_open_trade: OpenTrade = None
        self.pending_evaluation: SetupEvaluation = None

        self.foreign_position_blocking_entries = False
        self._last_foreign_position_check = 0.0

        self._stop_flag = threading.Event()

    # -- startup ---------------------------------------------------------------

    def start(self) -> None:
        print("[bot] authenticating with TopstepX...")
        self.client.authenticate()

        accounts = self.client.search_accounts(only_active=True)
        match = next((a for a in accounts if str(a.get("id")) == str(self.account_id)), None)
        if match is None:
            raise RuntimeError(
                f"TOPSTEPX_ACCOUNT_ID={self.account_id!r} not found among active "
                f"accounts: {accounts}. Double-check the account id."
            )
        print(f"[bot] trading account confirmed: {match}")

        contract = self.client.search_es_contract()
        self.contract_id = contract["id"]
        self.tick_size = float(contract["tickSize"])
        self.stop_ticks = points_to_ticks(config.ES_STOP_POINTS, self.tick_size)
        self.target_ticks = points_to_ticks(config.ES_TARGET_POINTS, self.tick_size)
        print(f"[bot] ES contract={self.contract_id} tickSize={self.tick_size} "
              f"stop_ticks={self.stop_ticks} target_ticks={self.target_ticks}")

        self._check_foreign_positions(force=True)

        print(f"[bot] fetching {config.HISTORICAL_SEED_BARS} historical 15-min "
              f"SPY candles to seed EMA + pattern state...")
        historical = fetch_historical_15min_candles(config.HISTORICAL_SEED_BARS)
        self.candle_history = historical[-500:]
        closes = [c.close for c in historical]
        self.ema_fast.seed_from_closes(closes)
        self.ema_slow.seed_from_closes(closes)
        print(f"[bot] seeded with {len(historical)} candles. "
              f"EMA9={self.ema_fast.value:.4f} EMA21={self.ema_slow.value:.4f}")

        stop_event = threading.Event()
        start_level_file_poller(self.level_store, config.LEVEL_FILE_POLL_SECONDS, stop_event)
        self._level_poll_stop = stop_event

        self.spy_stream = SPYLiveStream(self.event_queue)
        self.spy_stream.start()

        self.realtime = TopstepXRealtimeClient(self.event_queue, self.client.token, self.account_id)
        self.realtime.start()

        print("[bot] startup complete -- entering main loop.")
        self._main_loop()

    # -- main loop ---------------------------------------------------------------

    def _main_loop(self) -> None:
        while not self._stop_flag.is_set():
            try:
                event = self.event_queue.get(timeout=1.0)
            except queue.Empty:
                self._on_tick()
                continue

            kind = event[0]
            try:
                if kind == "minute_bar":
                    _, ts, o, h, l, c = event
                    self.candle_builder.ingest_live_minute_bar(ts, o, h, l, c)
                elif kind == "candle_closed":
                    self._on_candle_closed_event(event[1])
                elif kind == "trade_price":
                    _, ts, price = event
                    self._on_trade_price(price)
                elif kind == "user_order":
                    self._on_user_order(event[1])
                elif kind == "user_position":
                    print(f"[bot] position update: {event[1]}")
                elif kind == "user_trade":
                    print(f"[bot] trade fill event: {event[1]}")
                elif kind == "user_account":
                    pass
            except Exception as e:  # noqa: BLE001
                print(f"[bot] ERROR handling event {kind}: {e!r}")

            self._on_tick()

    def _on_tick(self) -> None:
        """Runs on every loop iteration (at least once/sec via the queue
        timeout). Houses the small periodic housekeeping tasks."""
        now = datetime.now(timezone.utc)
        self.candle_builder.force_finalize_if_stale(now)
        self._check_foreign_positions(force=False)

    # -- candle callback (runs on the Alpaca thread -- just forwards) ----------

    def _on_candle_closed(self, candle: Candle) -> None:
        self.event_queue.put(("candle_closed", candle))

    # -- candle handling (runs on main thread) ----------------------------------

    def _on_candle_closed_event(self, candle: Candle) -> None:
        print(f"[bot] candle closed: {candle.open_time} O={candle.open} H={candle.high} "
              f"L={candle.low} C={candle.close} {'green' if candle.is_green else 'red'}")

        self.candle_history.append(candle)
        if len(self.candle_history) > 500:
            self.candle_history = self.candle_history[-500:]

        # Section 9: EMA is updated on every close, unconditionally --
        # this candle's close IS "the close of Candle 3" for whichever
        # window it ends up serving as Candle 3 in.
        self.ema_fast.update(candle.close)
        self.ema_slow.update(candle.close)

        evaluations = pattern_engine.evaluate_both_directions(
            self.candle_history, self.level_store, self.ema_fast.value, self.ema_slow.value,
        )
        for ev in evaluations:
            self._handle_evaluation(ev)

    def _handle_evaluation(self, ev: SetupEvaluation) -> None:
        if not ev.accepted:
            self.trade_logger.log_rejected(ev)
            return

        # Section 2: session hours gate (applied on top of an accepted pattern).
        if not is_new_entry_allowed(ev.timestamp):
            self.trade_logger.log_blocked(ev, "outside_session_hours")
            return

        # Section 3: only one ES trade open at a time; ignore, don't queue.
        if self.current_open_trade is not None or self.foreign_position_blocking_entries:
            self.trade_logger.log_blocked(ev, "es_trade_already_open")
            return

        self._enter_trade(ev)

    # -- entry -------------------------------------------------------------------

    def _enter_trade(self, ev: SetupEvaluation) -> None:
        side = ORDER_SIDE_BUY if ev.direction is Direction.LONG else ORDER_SIDE_SELL
        custom_tag = f"TRE-{ev.direction.value}-{ev.timestamp.strftime('%Y%m%dT%H%M%S')}"

        print(f"[bot] ENTERING {ev.direction.value} -- broken={ev.final_broken_level} "
              f"next_target={ev.next_target_level} EMA9={ev.ema_fast:.4f} EMA21={ev.ema_slow:.4f}")

        try:
            order_id = self.client.place_bracket_market_order(
                account_id=self.account_id, contract_id=self.contract_id,
                side=side, size=config.CONTRACT_QUANTITY,
                stop_ticks=self.stop_ticks, target_ticks=self.target_ticks,
                custom_tag=custom_tag,
            )
        except Exception as e:  # noqa: BLE001
            print(f"[bot] ORDER PLACEMENT FAILED: {e!r}")
            self.trade_logger.log_blocked(ev, f"order_placement_failed:{e}")
            return

        self.current_open_trade = OpenTrade(
            direction=ev.direction, contract_id=self.contract_id,
            entry_order_id=order_id, next_target_level=ev.next_target_level,
            broken_level=ev.final_broken_level, custom_tag=custom_tag,
        )
        self.pending_evaluation = ev

    # -- live SPY price -> early-exit check (Sections 12, 13) -------------------

    def _on_trade_price(self, price: float) -> None:
        trade = self.current_open_trade
        if trade is None or trade.closed:
            return
        if trade.entry_price is None:
            return  # not confirmed filled yet -- nothing to manage
        if getattr(trade, "spy_exit_initiated", False):
            return  # already in the process of closing
        if spy_price_triggers_exit(trade, price):
            print(f"[bot] SPY price {price} touched next target level "
                  f"{trade.next_target_level} -- closing ES trade early.")
            trade.spy_exit_initiated = True
            execute_spy_triggered_exit(self.client, self.account_id, trade)

    # -- TopstepX order events -> entry/stop/target/spy-exit fills --------------

    def _on_user_order(self, order: dict) -> None:
        trade = self.current_open_trade
        if trade is None or order is None:
            return
        if str(order.get("accountId")) != str(self.account_id):
            return
        if str(order.get("contractId")) != str(self.contract_id):
            return

        order_id = order.get("id") or order.get("orderId")
        status = order.get("status")
        order_type = order.get("type")
        filled_price = order.get("filledPrice") or order.get("averageFillPrice")
        ts = self._parse_ts(order.get("updateTimestamp") or order.get("creationTimestamp"))

        # -- entry fill --------------------------------------------------------
        if order_id == trade.entry_order_id:
            if status == ORDER_STATUS_FILLED and trade.entry_price is None:
                trade.entry_price = float(filled_price)
                trade.entry_time = ts
                if trade.direction is Direction.LONG:
                    trade.stop_price = trade.entry_price - config.ES_STOP_POINTS
                    trade.target_price = trade.entry_price + config.ES_TARGET_POINTS
                else:
                    trade.stop_price = trade.entry_price + config.ES_STOP_POINTS
                    trade.target_price = trade.entry_price - config.ES_TARGET_POINTS
                print(f"[bot] ENTRY FILLED at {trade.entry_price} "
                      f"stop~{trade.stop_price} target~{trade.target_price}")
            elif status == ORDER_STATUS_REJECTED:
                print(f"[bot] ENTRY ORDER REJECTED: {order}")
                self.trade_logger.log_blocked(self.pending_evaluation, "entry_order_rejected")
                self.current_open_trade = None
                self.pending_evaluation = None
            return

        # -- learn the bracket child order ids as they appear (see module
        #    docstring re: correlation heuristic) ------------------------------
        if trade.stop_order_id is None and order_type == ORDER_TYPE_STOP and status is not None:
            trade.stop_order_id = order_id
            print(f"[bot] identified stop-loss bracket order id={order_id}")
        if trade.target_order_id is None and order_type == ORDER_TYPE_LIMIT and status is not None:
            trade.target_order_id = order_id
            print(f"[bot] identified take-profit bracket order id={order_id}")

        # -- stop / target fills -------------------------------------------------
        if status == ORDER_STATUS_FILLED:
            if order_id == trade.stop_order_id:
                self._finalize_trade(float(filled_price), "es_stop", ts, None)
            elif order_id == trade.target_order_id:
                self._finalize_trade(float(filled_price), "es_target", ts, None)
            elif getattr(trade, "spy_exit_initiated", False):
                # The market order we sent for the SPY-triggered close.
                self._finalize_trade(float(filled_price), "spy_level", ts, trade.next_target_level)

    def _finalize_trade(self, exit_price, exit_reason, exit_ts, spy_trigger_level) -> None:
        trade = self.current_open_trade
        if trade is None or trade.closed:
            return
        trade.closed = True
        print(f"[bot] TRADE CLOSED exit={exit_price} reason={exit_reason}")

        self.trade_logger.log_completed_trade(
            ev=self.pending_evaluation,
            entry_price=trade.entry_price, entry_timestamp=trade.entry_time,
            stop_price=trade.stop_price, target_price=trade.target_price,
            spy_early_exit_trigger_level=spy_trigger_level,
            exit_price=exit_price, exit_reason=exit_reason, exit_timestamp=exit_ts,
        )

        # Defensive cleanup: cancel whichever bracket leg didn't fire.
        if exit_reason in ("es_stop", "es_target"):
            other_id = trade.target_order_id if exit_reason == "es_stop" else trade.stop_order_id
            if other_id is not None:
                try:
                    self.client.cancel_order(self.account_id, other_id)
                except Exception as e:  # noqa: BLE001
                    print(f"[bot] cleanup cancel failed for order {other_id}: {e}")

        self.current_open_trade = None
        self.pending_evaluation = None

    # -- startup / ongoing safety check for a pre-existing position (Section 3) --

    def _check_foreign_positions(self, force: bool) -> None:
        import time as time_module
        now = time_module.time()
        if not force and (now - self._last_foreign_position_check) < 30:
            return
        self._last_foreign_position_check = now

        if self.current_open_trade is not None:
            return  # the bot's own trade already covers Section 3's "one at a time"

        try:
            positions = self.client.search_open_positions(self.account_id)
        except Exception as e:  # noqa: BLE001
            print(f"[bot] foreign-position check failed: {e}")
            return

        has_es_position = any(
            str(p.get("contractId")) == str(self.contract_id) and p.get("size", 0) != 0
            for p in positions
        )
        if has_es_position and not self.foreign_position_blocking_entries:
            print("[bot] WARNING: an ES position already exists on this account that "
                  "this bot did not open. New entries are blocked (Section 3) until it "
                  "is closed. The bot has no stop/target context for this position -- "
                  "manage it manually.")
            self.foreign_position_blocking_entries = True
        elif not has_es_position and self.foreign_position_blocking_entries:
            print("[bot] previously-detected foreign ES position is now closed -- "
                  "new entries un-blocked.")
            self.foreign_position_blocking_entries = False

    @staticmethod
    def _parse_ts(raw):
        if raw is None:
            return datetime.now(timezone.utc)
        try:
            ts = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            return ts
        except Exception:
            return datetime.now(timezone.utc)
