import type { Candle, Instrument } from '@es-trading/shared';
import type { ExecutionProvider, MarketBar, MarketDataProvider, MarketEvent } from '@es-trading/market';
import type { TradingDecision } from '@es-trading/shared';

export const ES_SYMBOL = '/ES' as const;
export const MES_SYMBOL = '/MES' as const;
export const INSTRUMENTS = [ES_SYMBOL, MES_SYMBOL] as const;

export interface TopstepXConfig {
  readonly baseUrl: string;
  readonly username: string;
  readonly apiKey: string;
  readonly accountId: string;
  readonly symbol?: Instrument;
  readonly contractId?: string;
  readonly pollMilliseconds?: number;
  readonly dryRun?: boolean;
}

export interface TopstepXHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly json: () => Promise<unknown>;
}

export type TopstepXHttp = (input: string, init?: RequestInit) => Promise<TopstepXHttpResponse>;

export interface TopstepXContract {
  readonly id: string;
  readonly symbol: string;
  readonly description?: string;
  readonly tickSize: number;
  readonly activeContract?: boolean;
  readonly symbolId: string;
}

export interface TopstepXAccount {
  readonly id: number;
  readonly name: string;
  readonly canTrade: boolean;
  readonly isVisible: boolean;
  readonly simulated: boolean;
}

export interface TopstepXBar {
  readonly timestamp: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume?: number;
  readonly symbol?: string;
  readonly contractId?: string;
}

export interface TopstepXOrderRequest {
  readonly side: 'BUY' | 'SELL';
  readonly quantity: 1;
  readonly stopPoints: 10;
  readonly targetPoints: 10;
  readonly tag: string;
}

export interface TopstepXAdapter {
  readonly connect: () => Promise<void>;
  readonly disconnect: () => Promise<void>;
  readonly historicalCandles: (limit: number) => Promise<readonly Candle[]>;
  readonly recentBars: (limit: number) => Promise<readonly TopstepXBar[]>;
  readonly placeBracketOrder: (request: TopstepXOrderRequest) => Promise<string>;
  readonly cancelOrder: (orderId: string) => Promise<void>;
  readonly closePosition: () => Promise<void>;
  readonly queryPosition: () => Promise<unknown | null>;
  readonly searchOpenOrders: () => Promise<readonly Record<string, unknown>[]>;
  readonly emergencyFlatten: () => Promise<void>;
}

function assertValidSymbol(value: string | undefined, name: string): void {
  if (value !== undefined && value !== ES_SYMBOL && value !== MES_SYMBOL && !value.includes('E-mini S&P 500')) {
    throw new Error(`${name} must identify /ES or /MES; received ${value}.`);
  }
}

function assertSymbol(value: string | undefined, expected: Instrument, name: string): void {
  if (value !== expected) throw new Error(`${name} must be ${expected}; received ${value ?? 'missing'}.`);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object') throw new Error('TopstepX returned an invalid response.');
  return value as Record<string, unknown>;
}

function responseItems(value: unknown, key: string): readonly Record<string, unknown>[] {
  const record = asRecord(value);
  const items = record[key];
  if (!Array.isArray(items)) throw new Error(`TopstepX response did not contain ${key}.`);
  return items.map(asRecord);
}

function numberField(record: Record<string, unknown>, key: string): number {
  const value = Number(record[key]);
  if (!Number.isFinite(value)) throw new Error(`TopstepX bar field ${key} is invalid.`);
  return value;
}

export class TopstepXRestAdapter implements TopstepXAdapter {
  private token: string | null = null;
  private contract: TopstepXContract | null = null;
  private readonly symbol: Instrument;

  constructor(private readonly config: TopstepXConfig, private readonly http: TopstepXHttp = globalThis.fetch.bind(globalThis)) {
    this.symbol = config.symbol ?? ES_SYMBOL;
    assertValidSymbol(config.contractId, 'contractId');
    if (config.accountId.trim() === '') throw new Error('TopstepX accountId is required.');
  }

  get resolvedContractId(): string {
    return this.requireContract().id;
  }

  get resolvedSymbol(): Instrument {
    return this.symbol;
  }

  async connect(): Promise<void> {
    if (this.token && this.contract) return;
    await this.authenticate();
  }

  async reconnect(): Promise<void> {
    this.token = null;
    this.contract = null;
    await this.authenticate();
  }

  private async authenticate(): Promise<void> {
    const result = await this.request('/api/Auth/loginKey', { userName: this.config.username, apiKey: this.config.apiKey });
    const record = asRecord(result);
    const token = record.token;
    if (typeof token !== 'string' || token.length === 0) throw new Error('TopstepX authentication did not return a token.');
    this.token = token;
    const accounts = await this.searchAccounts();
    const account = accounts.find((candidate) => String(candidate.id) === this.config.accountId);
    if (!account || !account.simulated || !account.canTrade || !account.isVisible) throw new Error('Configured TopstepX account is not an eligible visible Practice account.');
    this.contract = await this.resolveEsContract();
    if (this.config.contractId && this.contract.id !== this.config.contractId) throw new Error(`Configured TopstepX contract is not the resolved ${this.symbol} contract.`);
  }

  async disconnect(): Promise<void> {
    this.token = null;
    this.contract = null;
  }

  async historicalCandles(limit: number): Promise<readonly Candle[]> {
    const contract = this.requireContract();
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - Math.max(limit, 21) * 15 * 60_000);
    const result = await this.request('/api/History/retrieveBars', {
      contractId: contract.id,
      live: false,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      unit: 2,
      unitNumber: 15,
      limit,
      includePartialBar: false
    });
    return responseItems(result, 'bars').map((bar) => this.toCandle(bar));
  }

  async recentBars(limit: number): Promise<readonly TopstepXBar[]> {
    const contract = this.requireContract();
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - Math.max(limit, 3) * 60_000);
    const result = await this.request('/api/History/retrieveBars', {
      contractId: contract.id,
      live: false,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      unit: 2,
      unitNumber: 1,
      limit,
      includePartialBar: false
    });
    return responseItems(result, 'bars').map((bar) => ({
      timestamp: String(bar.t),
      open: numberField(bar, 'o'),
      high: numberField(bar, 'h'),
      low: numberField(bar, 'l'),
      close: numberField(bar, 'c'),
      volume: bar.v === undefined ? undefined : numberField(bar, 'v'),
      symbol: bar.symbol === undefined ? this.symbol : String(bar.symbol),
      contractId: bar.contractId === undefined ? contract.id : String(bar.contractId)
    }));
  }

  async placeBracketOrder(request: TopstepXOrderRequest): Promise<string> {
    const contract = this.requireContract();
    if (request.quantity !== 1) throw new Error(`The active ${this.symbol} strategy only permits one contract per trade.`);
    const result = await this.request('/api/Order/place', {
      accountId: this.config.accountId,
      contractId: contract.id,
      type: 2,
      side: request.side === 'BUY' ? 0 : 1,
      size: 1,
      customTag: request.tag,
      stopLossBracket: { ticks: Math.round(request.stopPoints / contract.tickSize), type: 4 },
      takeProfitBracket: { ticks: Math.round(request.targetPoints / contract.tickSize), type: 1 }
    });
    const orderId = asRecord(result).orderId;
    if (typeof orderId !== 'string' && typeof orderId !== 'number') throw new Error('TopstepX order response did not return an order id.');
    return String(orderId);
  }

  async cancelOrder(orderId: string): Promise<void> {
    await this.request('/api/Order/cancel', { accountId: this.config.accountId, orderId: Number(orderId) });
  }

  async closePosition(): Promise<void> {
    const contract = this.requireContract();
    await this.request('/api/Position/closeContract', { accountId: this.config.accountId, contractId: contract.id });
  }

  async queryPosition(): Promise<unknown | null> {
    const result = await this.request('/api/Position/searchOpen', { accountId: this.config.accountId });
    const positions = responseItems(result, 'positions').filter((position) => String(position.contractId) === this.requireContract().id);
    return positions[0] ?? null;
  }

  async searchOpenOrders(): Promise<readonly Record<string, unknown>[]> {
    const result = await this.request('/api/Order/searchOpen', { accountId: Number(this.config.accountId) });
    return responseItems(result, 'orders');
  }

  async emergencyFlatten(): Promise<void> {
    for (const order of await this.searchOpenOrders()) {
      const id = order.id;
      if (typeof id !== 'number') throw new Error('TopstepX returned an open order without a numeric id.');
      await this.cancelOrder(String(id));
    }
    if (await this.queryPosition()) await this.closePosition();
  }

  private async searchAccounts(): Promise<readonly TopstepXAccount[]> {
    const result = await this.request('/api/Account/search', { onlyActiveAccounts: true });
    return responseItems(result, 'accounts').map((account) => ({
      id: Number(account.id), name: String(account.name), canTrade: account.canTrade === true, isVisible: account.isVisible === true, simulated: account.simulated === true
    }));
  }

  private async request(path: string, body: unknown): Promise<unknown> {
    const response = await this.http(`${this.config.baseUrl.replace(/\/+$/, '')}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(this.token ? { authorization: `Bearer ${this.token}` } : {}) },
      body: JSON.stringify(body)
    });
    const text = await response.text();
    let result: unknown;
    try { result = text ? JSON.parse(text) : null; } catch { throw new Error(`TopstepX ${path} returned non-JSON (HTTP ${response.status}): ${text.slice(0, 200)}`); }
    if (!response.ok || (result !== null && typeof result === 'object' && 'success' in result && !(result as { success: unknown }).success)) throw new Error(`TopstepX request ${path} failed with HTTP ${response.status}.`);
    return result;
  }

  private async resolveEsContract(): Promise<TopstepXContract> {
    const searchText = this.symbol === MES_SYMBOL ? 'MES' : 'ES';
    const result = await this.request('/api/Contract/search', { searchText, live: false });
    const contracts = responseItems(result, 'contracts').filter((contract) => {
      const description = String(contract.description ?? '');
      const symbolId = String(contract.symbolId ?? '');
      const name = String(contract.name ?? '');
      if (!contract.activeContract) return false;
      if (this.symbol === MES_SYMBOL) {
        return symbolId === 'F.US.MES' && name.startsWith('MES');
      }
      return symbolId === 'F.US.EP' && name.startsWith('ES') && !name.startsWith('MES');
    });
    if (contracts.length !== 1) throw new Error(`TopstepX must resolve exactly one active ${this.symbol} contract; received ${contracts.length}.`);
    const contract = contracts[0];
    return { id: String(contract.id), symbol: this.symbol, symbolId: String(contract.symbolId), description: String(contract.description), tickSize: numberField(contract, 'tickSize'), activeContract: true };
  }

  private requireContract(): TopstepXContract {
    if (!this.contract) throw new Error('TopstepX adapter is not connected.');
    return this.contract;
  }

  private toCandle(bar: Record<string, unknown>): Candle {
    const timestamp = new Date(String(bar.t));
    if (!Number.isFinite(timestamp.getTime())) throw new Error('TopstepX returned an invalid bar timestamp.');
    return { timestamp, open: numberField(bar, 'o'), high: numberField(bar, 'h'), low: numberField(bar, 'l'), close: numberField(bar, 'c'), volume: bar.v === undefined ? undefined : numberField(bar, 'v'), symbol: this.symbol, timeframe: '15m', isClosed: true };
  }
}

export class TopstepXPollingMarketProvider implements MarketDataProvider {
  private readonly handlers = new Set<(event: MarketEvent) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTimestamp = 0;

  constructor(private readonly adapter: TopstepXRestAdapter, private readonly pollMilliseconds = 15_000) {}

  async bootstrap(): Promise<readonly Candle[]> {
    await this.adapter.connect();
    return this.adapter.historicalCandles(100);
  }

  async connect(): Promise<void> {
    await this.adapter.connect();
    this.publish({ type: 'connected', at: new Date() });
    this.timer = setInterval(() => void this.poll(), this.pollMilliseconds);
    await this.poll();
  }

  subscribe(handler: (event: MarketEvent) => void): () => void { this.handlers.add(handler); return () => this.handlers.delete(handler); }

  async disconnect(): Promise<void> { if (this.timer) clearInterval(this.timer); this.timer = null; await this.adapter.disconnect(); this.publish({ type: 'disconnected', at: new Date(), reason: 'shutdown' }); }

  private async poll(): Promise<void> {
    try {
      const bars = await this.adapter.recentBars(3);
      for (const bar of bars) {
        assertSymbol(bar.symbol, this.adapter.resolvedSymbol, 'realtime bar symbol');
        const timestamp = new Date(bar.timestamp);
        if (!Number.isFinite(timestamp.getTime()) || timestamp.getTime() <= this.lastTimestamp) continue;
        if (bar.contractId && bar.contractId !== this.adapterContractId) throw new Error(`TopstepX realtime bar is not the resolved ${this.adapter.resolvedSymbol} contract.`);
        this.lastTimestamp = timestamp.getTime();
        this.publish({ type: 'bar', id: `topstepx-${this.lastTimestamp}`, bar: { instrument: this.adapter.resolvedSymbol, timestamp, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume ?? 0 } });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'TopstepX market polling failed.';
      this.publish({ type: 'error', at: new Date(), message });
      if (message.includes('401') || message.includes('403') || message.includes('token') || message.includes('auth') || message.includes('not connected')) {
        try { await this.adapter.reconnect(); } catch { /* will retry next tick */ }
      }
    }
  }

  private get adapterContractId(): string {
    return this.adapter.resolvedContractId;
  }

  private publish(event: MarketEvent): void { for (const handler of this.handlers) handler(event); }
}

export class TopstepXExecutionProvider implements ExecutionProvider {
  private activePlan: TradingDecision['evaluation']['tradePlan'] = null;
  private activeOrderId: string | null = null;
  private positionOpen = false;

  constructor(private readonly adapter: TopstepXRestAdapter, private readonly dryRun = true) {}

  async reconcile(): Promise<void> {
    this.positionOpen = (await this.adapter.queryPosition()) !== null;
  }

  async execute(decision: TradingDecision): Promise<void> {
    if (decision.action === 'NO_TRADE' || !decision.evaluation.tradePlan) return;
    if (this.dryRun) return;
    if (this.positionOpen) return;
    const plan = decision.evaluation.tradePlan;
    if (plan.playedLevel.id === '') throw new Error('Cannot execute an /ES trade without a played level.');
    this.activeOrderId = await this.adapter.placeBracketOrder({ side: plan.side === 'LONG' ? 'BUY' : 'SELL', quantity: 1, stopPoints: 10, targetPoints: 10, tag: `ES-${plan.side}-${decision.generatedAt.toISOString()}` });
    this.activePlan = plan;
    this.positionOpen = true;
  }

  async emergencyFlatten(): Promise<void> {
    await this.adapter.emergencyFlatten();
    this.positionOpen = false;
    this.activeOrderId = null;
    this.activePlan = null;
  }

  async onMarketBar(bar: MarketBar): Promise<void> {
    assertSymbol(bar.instrument, this.adapter.resolvedSymbol, 'execution bar instrument');
    if (bar.instrument !== this.adapter.resolvedSymbol || !this.activePlan?.nextRelevantLevel || !this.positionOpen) return;
    const level = this.activePlan.nextRelevantLevel.price;
    const reached = this.activePlan.side === 'LONG' ? bar.high >= level : bar.low <= level;
    if (!reached) return;
    if (this.activeOrderId) await this.adapter.cancelOrder(this.activeOrderId);
    await this.adapter.closePosition();
    this.activeOrderId = null;
    this.activePlan = null;
    this.positionOpen = false;
  }
}
