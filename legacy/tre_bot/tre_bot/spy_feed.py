"""
spy_feed.py
===========
SPY market data via Alpaca (Q7: free/IEX feed, chosen with the
signal-accuracy tradeoff explicitly acknowledged).

Two responsibilities:
  1. fetch_historical_15min_candles() -- a plain REST call for startup/
     reconnect seeding (Q14). Alpaca's historical endpoint supports a
     native 15-minute timeframe directly, so this is NOT reconstructed
     from 1-minute bars -- it's the real thing.
  2. SPYLiveStream -- live 1-minute bars (fed to candle_builder.py to
     roll up into 15-minute candles) AND live trade prices (fed to
     exit_manager.py for real-time SPY level-touch monitoring, Section
     12: "Do not wait for a candle close.").

Both push events onto a shared, thread-safe queue.Queue rather than
calling back directly into strategy code -- bot.py's main loop is the
single consumer of that queue, which keeps all strategy-state mutation
on one thread even though Alpaca's stream and (separately) TopstepX's
realtime hub each run in their own thread.
"""

import queue
import threading
import time as time_module
from datetime import datetime, timezone
from typing import List

from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.live import StockDataStream
from alpaca.data.requests import StockBarsRequest
from alpaca.data.timeframe import TimeFrame, TimeFrameUnit
from alpaca.data.enums import DataFeed

import config
from models import Candle


def fetch_historical_15min_candles(n_bars: int = config.HISTORICAL_SEED_BARS) -> List[Candle]:
    client = StockHistoricalDataClient(config.ALPACA_API_KEY, config.ALPACA_SECRET_KEY)
    req = StockBarsRequest(
        symbol_or_symbols=config.SPY_SYMBOL,
        timeframe=TimeFrame(15, TimeFrameUnit.Minute),
        limit=n_bars,
        feed=DataFeed.IEX,  # Q7: free plan, IEX only
    )
    bar_set = client.get_stock_bars(req)
    bars = bar_set[config.SPY_SYMBOL]

    candles = []
    for b in bars:
        ts = b.timestamp
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        candles.append(Candle(
            open_time=ts.astimezone(config.NY_TZ),
            open=float(b.open), high=float(b.high),
            low=float(b.low), close=float(b.close),
        ))
    candles.sort(key=lambda c: c.open_time)
    return candles


class SPYLiveStream:
    """
    Runs Alpaca's StockDataStream in its own background thread (its
    .run() call is blocking and manages its own asyncio loop
    internally). Live bars and trade prices are pushed onto
    `event_queue` as tuples:
        ("minute_bar", utc_datetime, open, high, low, close)
        ("trade_price", utc_datetime, price)
    """

    def __init__(self, event_queue: "queue.Queue"):
        self.event_queue = event_queue
        self._stream: StockDataStream = None
        self._thread: threading.Thread = None
        self._stop = threading.Event()

    async def _on_bar(self, bar) -> None:
        ts = bar.timestamp
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        self.event_queue.put((
            "minute_bar", ts, float(bar.open), float(bar.high),
            float(bar.low), float(bar.close),
        ))

    async def _on_trade(self, trade) -> None:
        ts = trade.timestamp
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        self.event_queue.put(("trade_price", ts, float(trade.price)))

    def _run_forever(self) -> None:
        backoff = 5
        while not self._stop.is_set():
            try:
                self._stream = StockDataStream(
                    config.ALPACA_API_KEY, config.ALPACA_SECRET_KEY, feed=DataFeed.IEX,
                )
                self._stream.subscribe_bars(self._on_bar, config.SPY_SYMBOL)
                self._stream.subscribe_trades(self._on_trade, config.SPY_SYMBOL)
                backoff = 5  # reset after a successful connection
                self._stream.run()  # blocks until the stream drops/errors
            except Exception as e:  # noqa: BLE001
                print(f"[spy_feed] stream error: {e!r} -- reconnecting in {backoff}s")
            if self._stop.is_set():
                return
            time_module.sleep(backoff)
            backoff = min(backoff * 2, 60)

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run_forever, name="alpaca-spy-stream", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._stream is not None:
            try:
                self._stream.stop()
            except Exception:
                pass
