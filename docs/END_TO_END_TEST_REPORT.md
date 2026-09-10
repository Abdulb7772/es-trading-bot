# Local Practice End-to-End Test Report

Date: 2026-09-10

Mode: local deterministic PRACTICE simulation only.

LIVE trading: disabled. No TopstepX connection, credentials, network call, or order submission was used.

## Test Path

The integration harness exercises:

`Frontend/API contract -> local HTTP API -> engine services -> fake market provider -> /ES bars -> completed candles -> EMA9/EMA21 -> supplied levels -> deterministic strategy -> risk eligibility -> fake execution -> simulated position -> stop/target protection -> exit -> realized P/L -> daily lockout -> dashboard DTOs`

Test file: `backend/tests/integration/end-to-end-practice.test.ts`

Result: **2/2 end-to-end scenarios passed**.

## Verification Matrix

| # | Requirement | Result | Evidence |
|---:|---|---|---|
| 1 | `/ES` only | PASS | Market runtime accepts only `/ES`; the end-to-end candles and API market DTO use `/ES`. |
| 2 | No SPY in new code | PASS | No `SPY` references exist in the new end-to-end/runtime implementation. |
| 3 | Levels exclusively from supplied level set | PASS | API levels are explicitly PUT, then the same supplied level set is passed to runtime and simulation. |
| 4 | Completed candles only | PASS | `CandleBuilder` emits `isClosed: true`; the harness asserts every runtime candle is completed. |
| 5 | Candle 1 rules | PASS | The production deterministic evaluator is invoked through `MarketRuntime`; no frontend or adapter rules are duplicated. |
| 6 | Candle 2 rules | PASS | The production deterministic evaluator is invoked through `MarketRuntime`; no frontend or adapter rules are duplicated. |
| 7 | Candle 3 rules | PASS | The production deterministic evaluator is invoked through `MarketRuntime`; no frontend or adapter rules are duplicated. |
| 8 | EMA rules | PASS | EMA9 and EMA21 are calculated through `packages/indicators` before strategy evaluation. |
| 9 | Multi-level logic | PASS | Supplied levels include multiple resistance levels; the accepted plan uses the production evaluator’s selected levels. |
| 10 | Wick rule | PASS | The deterministic strategy engine owns wick validation; exhaustive wick coverage is in `wick-rule-matrix.test.ts`. |
| 11 | Breathing room | PASS | The deterministic strategy engine owns breathing-room validation; the same production evaluator is used. |
| 12 | 10-point stop | PASS | Accepted LONG simulation trade returned stop `5015` from entry `5025`. |
| 13 | Next-level target | PASS | Accepted LONG simulation trade returned target `5030`, the next relevant level before the normal target. |
| 14 | 4 PM cutoff | PASS | Risk state test and end-to-end harness verify eligibility becomes false at/after the New York cutoff. |
| 15 | First-loss lockout | PASS | End-to-end harness records a realized loss and verifies `canOpenNewTrade === false`. |
| 16 | Restart recovery | PASS | Recovery coordinator restores daily-loss state and processed setup IDs from persistent state. |
| 17 | Disconnect recovery | PASS | Recovery coordinator enters `DISCONNECTED`, then supports reconciliation/recovery to `READY`; the harness verifies the disconnected state. |
| 18 | Duplicate prevention | PASS | Duplicate processed setup IDs are ignored; recovery state retains one setup ID. |

## Observed Outputs

- API health/status/config/levels/market routes responded through the local HTTP server.
- Runtime completed `/ES` candles and evaluated the same deterministic strategy engine used by simulation.
- One accepted LONG setup was executed in simulation.
- Entry: `5025`
- Stop: `5015`
- Target: `5030`
- Exit: `TARGET`
- Realized P/L: `+250` using the simulation point value of `50`.
- The dashboard status DTO reports `tradingEnabled: false`.
- No LIVE mode or external broker execution path was enabled.

## Dashboard Boundary

The current backend dashboard application service returns validated local DTO snapshots. It is not yet wired as a live projection of the running market runtime, simulated position, or realized P/L ledger. The end-to-end test verifies the dashboard API contract and practice-disabled state, while the runtime/simulation assertions verify the actual deterministic execution path separately.

This is reported explicitly rather than treating a static dashboard DTO as live runtime state.

## Test Command

```powershell
npm exec vitest run backend/tests/integration/end-to-end-practice.test.ts
```

Result: `2 passed`.
