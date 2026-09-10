# TopstepX API Mapping

Status: preparation only. No TopstepX connection, credential handling, live trading, or undocumented behavior is implemented.

## Evidence Boundary

The repository does not currently contain official, current TopstepX API documentation or an API specification supplied for this project. The files under `legacy/tre_bot/` were inspected only for conceptual vocabulary and are **not authoritative**. Their comments explicitly require verification before live use.

Accordingly, every item below is marked `UNKNOWN` unless it is a project-level constraint rather than a TopstepX API fact.

## Authentication

- Current authentication endpoint: **UNKNOWN**
- Authentication method and request body: **UNKNOWN**
- Required credential names and formats: **UNKNOWN**
- Token type, lifetime, refresh, and revocation: **UNKNOWN**
- Required authorization header or connection query parameter: **UNKNOWN**
- Authentication error payloads and status codes: **UNKNOWN**
- Credential storage policy: credentials must remain server-side and must never be exposed to the frontend; TopstepX-specific storage is **UNKNOWN**.

## Practice Account Discovery

- Account discovery endpoint: **UNKNOWN**
- Practice-account identifier field: **UNKNOWN**
- How practice accounts are distinguished from live accounts: **UNKNOWN**
- Account status and permissions fields: **UNKNOWN**
- Required account selection rules: **UNKNOWN**

## Contract Discovery

- Contract discovery endpoint: **UNKNOWN**
- Search request and response schema: **UNKNOWN**
- Contract identifier field: **UNKNOWN**
- Active/front-month selection field: **UNKNOWN**
- Contract rollover semantics: **UNKNOWN**

## `/ES` Identification

- Official contract symbol/name for standard E-mini S&P 500: **UNKNOWN**
- Official identifier for `/ES`: **UNKNOWN**
- How to distinguish standard `/ES` from `/MES` or other contracts: **UNKNOWN**
- Tick size, point value, and quantity rules from the current API: **UNKNOWN**
- The application will not infer `/ES` identity from description text until official documentation confirms the rule.

## Realtime Market Data

- Realtime market-data transport: **UNKNOWN**
- Market-data base URL or hub: **UNKNOWN**
- Authentication for market data: **UNKNOWN**
- Subscription request and instrument identifier: **UNKNOWN**
- Quote, trade, or bar event names: **UNKNOWN**
- Event payload schema: **UNKNOWN**
- Timestamp and timezone semantics: **UNKNOWN**
- Sequence numbers and ordering guarantees: **UNKNOWN**
- Duplicate-event identity: **UNKNOWN**
- Market-data heartbeat/keep-alive: **UNKNOWN**

## Candle / Historical Data

- Historical candle endpoint: **UNKNOWN**
- Whether historical candles are available through the current API: **UNKNOWN**
- Request fields, pagination, limits, and retention: **UNKNOWN**
- Candle interval values: **UNKNOWN**
- OHLCV response schema: **UNKNOWN**
- Candle completion/finality field: **UNKNOWN**
- Adjustments, session boundaries, and timezone semantics: **UNKNOWN**

## Order Submission

- Order submission endpoint: **UNKNOWN**
- Supported order types: **UNKNOWN**
- Side enum values: **UNKNOWN**
- Quantity field and units: **UNKNOWN**
- Contract/account fields: **UNKNOWN**
- Client/custom order identifier: **UNKNOWN**
- Stop-loss and take-profit/bracket support: **UNKNOWN**
- Idempotency behavior: **UNKNOWN**
- Practice-mode safeguards: **UNKNOWN**

No order-submission implementation will be added until the current official documentation confirms the complete request and response contract.

## Order Status

- Order lookup endpoint: **UNKNOWN**
- Working-order query endpoint: **UNKNOWN**
- Order status values: **UNKNOWN**
- Status transition guarantees: **UNKNOWN**
- Rejection reason schema: **UNKNOWN**
- Cancelled/expired/replaced semantics: **UNKNOWN**

## Fills

- Fill/trade endpoint or event: **UNKNOWN**
- Fill identifier: **UNKNOWN**
- Fill price, quantity, timestamp, and fee fields: **UNKNOWN**
- Partial-fill behavior: **UNKNOWN**
- Fill ordering and replay behavior: **UNKNOWN**

## Positions

- Open-position endpoint: **UNKNOWN**
- Position event: **UNKNOWN**
- Position identifier and contract fields: **UNKNOWN**
- Side, quantity, average price, and realized/unrealized P/L fields: **UNKNOWN**
- Flatten/close-position operation: **UNKNOWN**
- Position reconciliation semantics: **UNKNOWN**

## Working Orders

- Working-order endpoint: **UNKNOWN**
- Working-order response schema: **UNKNOWN**
- Relationship between working orders and positions: **UNKNOWN**
- Bracket/OCO relationship identifiers: **UNKNOWN**

## Cancellation

- Cancellation endpoint: **UNKNOWN**
- Cancellation request fields: **UNKNOWN**
- Cancellation response and final status: **UNKNOWN**
- Cancellation race behavior with fills: **UNKNOWN**
- Bulk cancellation support: **UNKNOWN**

No cancellation behavior will be inferred from legacy code.

## Reconnect

- Reconnect protocol: **UNKNOWN**
- Official retry guidance and backoff limits: **UNKNOWN**
- Session/token behavior after disconnect: **UNKNOWN**
- Subscription restoration procedure: **UNKNOWN**
- Bootstrap/reconciliation procedure after reconnect: **UNKNOWN**
- Duplicate or out-of-order event handling requirements: **UNKNOWN**

The provider-independent runtime already exposes reconnect/bootstrap interfaces, but no TopstepX-specific implementation is authorized by the available evidence.

## Heartbeat

- Heartbeat mechanism: **UNKNOWN**
- Client heartbeat request/message: **UNKNOWN**
- Server heartbeat event: **UNKNOWN**
- Timeout and liveness thresholds: **UNKNOWN**
- Relationship to reconnect behavior: **UNKNOWN**

## Errors

- HTTP status conventions: **UNKNOWN**
- API success/error envelope: **UNKNOWN**
- Validation-error schema: **UNKNOWN**
- Authentication and authorization errors: **UNKNOWN**
- Rate-limit response and retry headers: **UNKNOWN**
- Market-data disconnect/error payloads: **UNKNOWN**
- Order rejection and risk-error payloads: **UNKNOWN**
- Correlation/request identifiers: **UNKNOWN**

## Implementation Gate

A TopstepX adapter may be implemented only after official current documentation is supplied to the project and this document is updated with verified endpoint names, transports, schemas, enums, authentication, lifecycle, and error behavior. Until then:

- no network requests are made;
- no credentials are read, stored, logged, or exposed;
- no live or practice orders are enabled;
- no legacy endpoint or event name is treated as current API behavior;
- unknown behavior remains unimplemented.
