# TRE Automated Trading Bot

A literal implementation of the TRE strategy specification: SPY 15-minute
candles generate signals, ES futures are traded, executed on TopstepX
via the ProjectX Gateway API, with SPY data from Alpaca.

**This code has not been run.** It was written without network access
to install dependencies or execute against live credentials. Read
"Before you go live" below before connecting it to any real account —
Combine or funded.

---

## 1. Setup

```bash
pip install -r requirements.txt
cp .env.example .env
# fill in .env with your Alpaca and TopstepX credentials
```

You'll also need:
- **Alpaca account** with an API key/secret (free plan is fine — see
  "Known limitations" below on what that means for data quality).
- **TopstepX API Access** enabled on your account (Subscriptions > API
  Access, $29/mo) with a generated API key.
- A `levels.csv` file in this directory with your manually supplied SPY
  price levels (single `price` column — the one you provided is
  included as a starting point).

Find your `TOPSTEPX_ACCOUNT_ID` by running a short script that calls
`TopstepXClient.search_accounts()` and reading the `id` field for the
account you want to trade (Combine or funded — same bot, just point it
at a different account id).

Run with:
```bash
python main.py
```

---

## 2. Decision record — every ambiguity we resolved together

This is here so nothing in the code is a silent assumption. Each item
below is a point where the spec was genuinely ambiguous (or where a
technical detail wasn't covered at all) and you gave an explicit answer.

| # | Question | Resolution |
|---|----------|------------|
| Q1 | "Applicable" resistance/support for Candle 1 | Nearest level relative to the reference price (see Q17) |
| Q2 | Overlapping Candle-1 candidates (Section 15) | Multiple overlapping sequences — satisfied by evaluating every new candle as the Candle 3 of a sliding 3-candle window (see `pattern_engine.py` docstring for why this is equivalent) |
| Q3 | Session boundary inclusivity | Both endpoints inclusive |
| Q4 | Session anchor timezone | New York local time, DST-aware (`America/New_York`), NOT fixed EST |
| — | Which window is which | Asian session = 6:00 PM–2:00 AM NY; New York session = 9:00 AM–11:45 AM NY |
| Q5 | Execution platform | TopstepX (ProjectX Gateway API) |
| — | SPY data source | Alpaca, free/IEX plan (explicitly accepting the signal-accuracy tradeoff vs. paid SIP) |
| Q9 | Bot-side daily loss guardrail | **Not implemented.** Left entirely to TopstepX's own Personal Daily Loss Limit, configured in TopstepX account settings, independent of this bot |
| Q10 | Contract quantity | 1 ES contract, static config constant |
| Q11 | Level file format | CSV, single `price` column, path `levels.csv` |
| Q12 | Decision log format/path | CSV, `tre_log.csv` |
| Q13 | ES contract selection | Front month, auto-detected via `Contract/search`, filtered to standard E-mini S&P 500 (excluding Micro) |
| Q13a | Contract roll while a trade is open | The open trade rides out in its original contract; only new entries use the current front month |
| Q14 | Startup/reconnect seeding | Pulls historical 15-minute SPY bars to seed EMA and pattern state, rather than starting blank |
| Q15 | Stop/target order mechanics | Resting bracket orders on the exchange (broker-enforced), with the SPY-level exit monitored and executed separately in software |
| Q16 | SPY-triggered exit sequencing | Cancel resting bracket orders first, then send the market close order |
| Q16 (pattern) | What counts as a level being "reached" for Candle 3's test | Any of the three candles' wicks — at or through the level (your "through or at" caveat) |
| Q17 | Reference price for "applicable" level | The prior candle's close (not Candle 1's own open — see `pattern_engine.py` docstring for why the alternative can't work) |

---

## 3. Before you go live

Things that could not be verified without running this against real
credentials. Test every one of these against your **Combine account**
before relying on any of it with real money:

1. **ES contract selection.** `TopstepXClient.search_es_contract()`
   filters `Contract/search` results by description text. It prints
   the selected contract on every startup — **read that line and
   confirm it's the correct, current front-month standard ES contract**
   (not Micro, not a stale expiry) before letting the bot trade.

2. **Bracket child-order correlation.** `POST /api/Order/place` returns
   only the parent (entry) order's id. The two bracket legs it creates
   (stop, target) are identified by watching subsequent order events
   for new Stop/Limit-type orders on the same contract — see the
   docstring at the top of `bot.py`. This is a best-effort heuristic
   against the documented API, not something the docs state outright.
   Watch the console output during a test trade and confirm both
   `identified stop-loss bracket order id=...` and `identified
   take-profit bracket order id=...` lines appear correctly.

3. **SignalR User Hub connection details.** The hub URL, auth
   query-parameter name, and subscription method names
   (`SubscribeOrders`, `SubscribePositions`, `SubscribeTrades`) are per
   the ProjectX Gateway docs as read while building this bot. Confirm
   on startup that you see `[topstepx_realtime] connected --
   subscribing` and that order/position events show up in the console
   during a test trade.

4. **`levels.csv` applicable-level logic**, especially the gap-rejection
   path (Section 8) — this only fires when price gaps cleanly over a
   level between two candles, which won't happen often. Consider
   testing it deliberately with a synthetic/backtest run before trusting
   it live, since the live market may not produce this case for a
   while.

5. **Pre-market data availability.** The New York session window (9:00
   AM–11:45 AM NY) starts before SPY's regular trading hours (9:30 AM
   NY). Alpaca's free IEX feed may have thin or no data between 9:00
   and 9:30 — this was flagged, not changed, since you gave those times
   explicitly.

---

## 4. Known limitations (by design, not oversights)

- **No bot-side risk management.** No daily loss limit, no drawdown
  protection, nothing beyond the TRE spec itself. This was a deliberate
  choice (Q9) — configure TopstepX's own Personal DLL if you want that
  protection.
- **Alpaca free/IEX data**, not the full consolidated SIP tape. Candle
  closes and level touches are judged against IEX prints only. Flagged
  in our conversation; you chose free over the $99/mo SIP plan.
- **Market Hub not used.** ES live quotes aren't subscribed to — entries
  are Market orders (no price needed in advance) and all fill prices
  arrive via User Hub order/trade events instead. See `topstepx_realtime.py`.
- **Level file polling, not filesystem events.** New rows in `levels.csv`
  are picked up within `LEVEL_FILE_POLL_SECONDS` (default 5s), not
  instantaneously. An engineering parameter, adjustable in `config.py`.

---

## 5. File overview

| File | Purpose |
|---|---|
| `config.py` | All tunable constants and credentials loading |
| `models.py` | Shared dataclasses (Candle, SetupEvaluation, OpenTrade) |
| `session_windows.py` | Section 2 — NY-time, DST-aware session gating |
| `levels.py` | Sections 4, 17 — level file load/append/lookup |
| `ema.py` | Section 9 — standard EMA calculation |
| `candle_builder.py` | Sections 1, 16 — live 1-min bars rolled into 15-min candles |
| `pattern_engine.py` | Sections 5–9, 14 — the actual TRE pattern logic |
| `spy_feed.py` | Alpaca historical + live SPY data |
| `topstepx_client.py` | REST: auth, contracts, orders, positions |
| `topstepx_realtime.py` | SignalR User Hub: order/position/trade events |
| `exit_manager.py` | Sections 12, 13 — real-time SPY level exit trigger |
| `trade_logger.py` | Section 18 — CSV decision log |
| `bot.py` | Orchestrator — the single-consumer event loop |
| `main.py` | Entry point |

---

## 6. Implementation principle (Section 19)

Nothing here optimizes, filters, or adds to the strategy beyond what's
specified. Where the spec was ambiguous, the resolution came from you,
not from an assumption — see the decision record above. Anything you
want changed is a targeted edit to one file, not a rewrite.
