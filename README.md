# ES Trading Bot

Local TypeScript architecture for an automated `/ES` futures trading bot targeting a TopstepX Practice account. This repository currently contains project boundaries and development scaffolding only.

## Current status

- No trading strategy is implemented.
- No TopstepX API or WebSocket connection is implemented.
- No orders are created or submitted.
- Strategy code will be isolated from integrations so simulated and historical candles can be tested offline.

## Requirements

- Node.js 20+
- npm 10+
- MongoDB Atlas connection string when persistence is added

## Windows setup

```powershell
npm install
Copy-Item .env.example .env.local
npm run lint
npm run typecheck
npm test
npm run build
npm run dev
```

The dashboard runs at `http://localhost:3000`. The engine is intentionally a placeholder and can be started separately with `npm run dev:engine`.

## Repository layout

- `frontend`: Next.js, React, and Tailwind dashboard. It contains no strategy rules.
- `backend/apps/engine`: Node.js orchestration process and event-driven runtime boundary.
- `backend/packages/strategy`: pure deterministic strategy contracts and future implementation.
- `backend/packages/indicators`: EMA 9/21 boundaries.
- `backend/packages/levels`: manually supplied `/ES` level management.
- `backend/packages/risk`: stop, target, breathing-room, and daily loss-stop boundaries.
- `backend/packages/topstepx`: future isolated TopstepX adapter; currently disconnected.
- `backend/packages/database`: future MongoDB/Mongoose persistence boundary.
- `backend/packages/market`: `/ES` market-data and candle input contracts.
- `backend/packages/shared`: shared domain types, Zod configuration, and events.
- `backend/packages/logging`: Pino logger boundary.
- `backend/tests`: unit, integration, fixture, and manual test boundaries.
- `backend/levels`, `backend/data`, `backend/logs`: local runtime storage locations.
- `legacy/tre_bot`: untouched legacy Python reference.
- `zipfile`: reserved archive location.

## Design rule

The strategy engine accepts candles, levels, indicators, and configuration through TypeScript contracts and returns a deterministic `TradingDecision`. It must not import TopstepX, MongoDB, WebSocket, or dashboard code. Integrations translate external data into those contracts at the application boundary.

No strategy rules, TopstepX endpoints, WebSocket connections, or order placement are implemented yet.
