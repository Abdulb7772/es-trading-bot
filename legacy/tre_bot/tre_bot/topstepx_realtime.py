"""
topstepx_realtime.py
=====================
SignalR connection to the ProjectX/TopstepX "User Hub" -- realtime
order, position, and trade (fill) events for our account.

WHY NOT THE MARKET HUB: this bot never subscribes to live ES quotes.
Entries are plain Market orders (Section 10: enter at "the live market
price available at that exact moment" -- a Market order fills at
whatever that is; we don't need to know the price in advance to place
it), and stop/target are resting bracket orders the exchange manages
(Q15 answer B). The actual fill price for entry, stop, and target all
arrive via GatewayUserTrade/GatewayUserOrder on the User Hub, which is
what this module subscribes to. That removes the need to guess at
Market Hub subscription method names that weren't fully extractable
from the docs at build time.

Pushes events onto the shared queue as tuples:
    ("user_order", order_dict)
    ("user_position", position_dict)
    ("user_trade", trade_dict)

VERIFY BEFORE LIVE USE: the hub URL, auth query-parameter name, and
method names below (SubscribeOrders/SubscribePositions/SubscribeTrades)
are per the ProjectX Gateway realtime docs as read while building this
bot. SignalR method names are case-sensitive. Test thoroughly against
your Combine account first and watch the console output on connect --
this module logs every raw event it receives.
"""

import threading
import time as time_module
from typing import Optional

from signalrcore.hub_connection_builder import HubConnectionBuilder

import config


class TopstepXRealtimeClient:
    def __init__(self, event_queue, token: str, account_id: str):
        self.event_queue = event_queue
        self.token = token
        self.account_id = account_id
        self._connection = None
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def _build_connection(self):
        url = f"{config.TOPSTEPX_USER_HUB_URL}?access_token={self.token}"
        conn = (
            HubConnectionBuilder()
            .with_url(url, options={"verify_ssl": True})
            .with_automatic_reconnect({
                "type": "raw",
                "keep_alive_interval": 10,
                "reconnect_interval": 5,
                "max_attempts": 999999,
            })
            .build()
        )

        conn.on_open(self._on_open)
        conn.on_close(lambda: print("[topstepx_realtime] connection closed"))
        conn.on_error(lambda data: print(f"[topstepx_realtime] error: {data}"))

        conn.on("GatewayUserOrder", lambda args: self._forward("user_order", args))
        conn.on("GatewayUserPosition", lambda args: self._forward("user_position", args))
        conn.on("GatewayUserTrade", lambda args: self._forward("user_trade", args))
        conn.on("GatewayUserAccount", lambda args: self._forward("user_account", args))

        return conn

    def _forward(self, kind: str, args) -> None:
        # SignalR delivers the payload as a single-element args list.
        payload = args[0] if args else None
        print(f"[topstepx_realtime] {kind}: {payload}")
        self.event_queue.put((kind, payload))

    def _on_open(self) -> None:
        print("[topstepx_realtime] connected -- subscribing")
        self._connection.send("SubscribeAccounts", [])
        self._connection.send("SubscribeOrders", [self.account_id])
        self._connection.send("SubscribePositions", [self.account_id])
        self._connection.send("SubscribeTrades", [self.account_id])

    def _run_forever(self) -> None:
        backoff = 5
        while not self._stop.is_set():
            try:
                self._connection = self._build_connection()
                self._connection.start()
                backoff = 5
                # signalrcore runs its own network thread once started;
                # we just idle here and watch for the stop signal.
                while not self._stop.is_set():
                    time_module.sleep(1)
                return
            except Exception as e:  # noqa: BLE001
                print(f"[topstepx_realtime] connection error: {e!r} -- retrying in {backoff}s")
                time_module.sleep(backoff)
                backoff = min(backoff * 2, 60)

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run_forever, name="topstepx-user-hub", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._connection is not None:
            try:
                self._connection.stop()
            except Exception:
                pass
