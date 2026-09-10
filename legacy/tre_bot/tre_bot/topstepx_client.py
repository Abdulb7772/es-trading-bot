"""
topstepx_client.py
===================
Thin REST wrapper around the TopstepX/ProjectX Gateway API, built
directly against the officially documented endpoints at
https://gateway.docs.projectx.com/ (Auth, Account, Contract, Order,
Position). No third-party SDK dependency -- every request body/response
field used here was confirmed against the live docs while building
this bot.

IMPORTANT -- verify before going live:
  - ES contract selection (search_es_contract) filters by description
    text ("E-mini S&P 500", excluding "Micro"). PRINT/LOG the selected
    contract on every startup and visually confirm it's the correct
    front-month standard ES contract before letting the bot trade --
    see README "Before you go live".
"""

import requests
from typing import List, Optional

import config


class TopstepXError(RuntimeError):
    pass


# OrderType / OrderSide enums, confirmed from ProjectX Gateway docs.
ORDER_TYPE_LIMIT = 1
ORDER_TYPE_MARKET = 2
ORDER_TYPE_STOP = 4

ORDER_SIDE_BUY = 0   # "Bid" -- buy to open long / buy to close short
ORDER_SIDE_SELL = 1  # "Ask" -- sell to open short / sell to close long

ORDER_STATUS_OPEN = 1
ORDER_STATUS_FILLED = 2
ORDER_STATUS_CANCELLED = 3
ORDER_STATUS_REJECTED = 5


def points_to_ticks(points: float, tick_size: float) -> int:
    """ES bracket orders are specified in ticks, not points. The spec's
    '10 ES points' (Section 11) is converted using the contract's own
    tickSize, fetched dynamically at startup rather than hardcoded."""
    return int(round(points / tick_size))


class TopstepXClient:
    def __init__(self):
        self.base = config.TOPSTEPX_API_BASE
        self.session = requests.Session()
        self.token: Optional[str] = None

    # -- auth ----------------------------------------------------------------

    def authenticate(self) -> None:
        resp = self.session.post(
            f"{self.base}/api/Auth/loginKey",
            json={"userName": config.TOPSTEPX_USERNAME, "apiKey": config.TOPSTEPX_API_KEY},
        )
        data = resp.json()
        if not data.get("success"):
            raise TopstepXError(f"Authentication failed: {data}")
        self.token = data["token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})

    # -- accounts --------------------------------------------------------------

    def search_accounts(self, only_active: bool = True) -> List[dict]:
        resp = self.session.post(
            f"{self.base}/api/Account/search",
            json={"onlyActiveAccounts": only_active},
        )
        data = resp.json()
        if not data.get("success"):
            raise TopstepXError(f"Account search failed: {data}")
        return data.get("accounts", [])

    # -- contracts ---------------------------------------------------------------

    def search_es_contract(self) -> dict:
        resp = self.session.post(
            f"{self.base}/api/Contract/search",
            json={"searchText": config.ES_CONTRACT_SEARCH_TEXT, "live": True},
        )
        data = resp.json()
        if not data.get("success"):
            raise TopstepXError(f"Contract search failed: {data}")

        candidates = [
            c for c in data.get("contracts", [])
            if config.ES_DESCRIPTION_MUST_CONTAIN.lower() in c.get("description", "").lower()
            and config.ES_DESCRIPTION_MUST_NOT_CONTAIN.lower() not in c.get("description", "").lower()
            and c.get("activeContract") is True
        ]
        if not candidates:
            raise TopstepXError(
                "No active standard E-mini S&P 500 contract found in "
                f"Contract/search results: {data.get('contracts')}"
            )
        if len(candidates) > 1:
            print(f"[topstepx_client] WARNING: {len(candidates)} candidate ES contracts "
                  f"matched -- using the first. Verify this is correct: {candidates}")
        chosen = candidates[0]
        print(f"[topstepx_client] Selected ES contract: {chosen}")
        return chosen

    # -- orders -----------------------------------------------------------------

    def place_bracket_market_order(
        self, account_id: str, contract_id: str, side: int, size: int,
        stop_ticks: int, target_ticks: int, custom_tag: str,
    ) -> int:
        """
        Places a Market entry order with a stop-loss and take-profit
        bracket attached in the same call (Section 11: 10-point stop,
        10-point default target; Q15 answer B: resting bracket orders
        on the exchange).
        """
        body = {
            "accountId": account_id,
            "contractId": contract_id,
            "type": ORDER_TYPE_MARKET,
            "side": side,
            "size": size,
            "customTag": custom_tag,
            "stopLossBracket": {"ticks": stop_ticks, "type": ORDER_TYPE_STOP},
            "takeProfitBracket": {"ticks": target_ticks, "type": ORDER_TYPE_LIMIT},
        }
        resp = self.session.post(f"{self.base}/api/Order/place", json=body)
        data = resp.json()
        if not data.get("success"):
            raise TopstepXError(f"Order place failed: {data}")
        return data["orderId"]

    def cancel_order(self, account_id: str, order_id: int) -> bool:
        resp = self.session.post(
            f"{self.base}/api/Order/cancel",
            json={"accountId": account_id, "orderId": order_id},
        )
        data = resp.json()
        return bool(data.get("success"))

    def search_open_orders(self, account_id: str) -> List[dict]:
        resp = self.session.post(
            f"{self.base}/api/Order/searchOpen", json={"accountId": account_id},
        )
        data = resp.json()
        if not data.get("success"):
            raise TopstepXError(f"Order/searchOpen failed: {data}")
        return data.get("orders", [])

    # -- positions --------------------------------------------------------------

    def close_position_market(self, account_id: str, contract_id: str) -> bool:
        """Immediately flattens any open position in this contract at
        market (used for the SPY-triggered early exit, Section 12/13,
        after resting bracket orders have already been cancelled -- Q's
        answer A: cancel first, then close)."""
        resp = self.session.post(
            f"{self.base}/api/Position/closeContract",
            json={"accountId": account_id, "contractId": contract_id},
        )
        data = resp.json()
        return bool(data.get("success"))

    def search_open_positions(self, account_id: str) -> List[dict]:
        resp = self.session.post(
            f"{self.base}/api/Position/searchOpen", json={"accountId": account_id},
        )
        data = resp.json()
        if not data.get("success"):
            raise TopstepXError(f"Position/searchOpen failed: {data}")
        return data.get("positions", [])
