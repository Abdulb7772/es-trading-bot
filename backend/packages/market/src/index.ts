import { calculateStandardEma21, calculateStandardEma9 } from '@es-trading/indicators';
import { calendarTradingDayResolver, MemoryRiskStateStore, TradingRiskState } from '@es-trading/risk';
import { evaluateDeterministicStrategy } from '@es-trading/strategy';
import type {
  Candle,
  Instrument,
  StrategyConfig,
  SupportResistanceLevel,
  TradingDecision
} from '@es-trading/shared';
import { ES_SYMBOL, MES_SYMBOL } from '@es-trading/shared';

export interface MarketBar {
  readonly instrument: Instrument;
  readonly timestamp: Date;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export type MarketEvent =
  | { readonly type: 'bar'; readonly id: string; readonly bar: MarketBar }
  | { readonly type: 'connected'; readonly at: Date }
  | { readonly type: 'disconnected'; readonly at: Date; readonly reason?: string }
  | { readonly type: 'error'; readonly at: Date; readonly message: string };

export interface MarketDataProvider {
  readonly bootstrap: () => Promise<readonly Candle[]>;
  readonly connect: () => Promise<void>;
  readonly subscribe: (handler: (event: MarketEvent) => void) => () => void;
  readonly disconnect: () => Promise<void>;
}

export interface ExecutionProvider {
  readonly execute: (decision: TradingDecision) => Promise<void> | void;
  readonly onMarketBar?: (bar: MarketBar) => Promise<void> | void;
  readonly reconcile?: () => Promise<void> | void;
}

export type MarketRuntimeState = 'STARTING' | 'READY' | 'RECOVERY_REQUIRED' | 'DISCONNECTED' | 'STOPPED';

export interface RecoveryPosition {
  readonly id: string;
  readonly symbol: Instrument;
  readonly side: 'LONG' | 'SHORT';
  readonly quantity: number;
  readonly entryPrice: number;
}

export interface RecoveryWorkingOrder {
  readonly id: string;
  readonly symbol: Instrument;
  readonly status: 'WORKING' | 'FILLED' | 'CANCELLED' | 'REJECTED' | 'UNKNOWN';
}

export interface RecoveryState {
  readonly state: MarketRuntimeState;
  readonly position: RecoveryPosition | null;
  readonly workingOrders: readonly RecoveryWorkingOrder[];
  readonly dailyLossLocked: boolean;
  readonly processedSetupIds: readonly string[];
}

export interface RecoveryStateStore {
  readonly load: () => RecoveryState | null;
  readonly save: (state: RecoveryState) => void;
}

export class MemoryRecoveryStateStore implements RecoveryStateStore {
  constructor(private state: RecoveryState | null = null) {}
  load(): RecoveryState | null { return this.state ? { ...this.state, workingOrders: [...this.state.workingOrders], processedSetupIds: [...this.state.processedSetupIds] } : null; }
  save(state: RecoveryState): void { this.state = { ...state, workingOrders: [...state.workingOrders], processedSetupIds: [...state.processedSetupIds] }; }
}

export interface RecoveryProvider {
  readonly authenticate: () => Promise<void>;
  readonly verifyPracticeAccount: () => Promise<boolean>;
  readonly verifyEsContract: () => Promise<boolean>;
  readonly queryPosition: () => Promise<RecoveryPosition | null>;
  readonly queryWorkingOrders: () => Promise<readonly RecoveryWorkingOrder[]>;
  readonly bootstrapMarket: () => Promise<readonly Candle[]>;
  readonly reconnectRealtime: () => Promise<void>;
}

export interface RecoveryOptions {
  readonly provider: RecoveryProvider;
  readonly stateStore: RecoveryStateStore;
  readonly restoreDailyLossLocked: () => boolean;
  readonly restoreProcessedSetupIds: () => readonly string[];
  readonly reconcile: (local: RecoveryState | null, remote: { position: RecoveryPosition | null; workingOrders: readonly RecoveryWorkingOrder[] }) => boolean;
  readonly onState?: (state: RecoveryState) => void;
}

export class RuntimeRecoveryCoordinator {
  private state: RecoveryState;

  constructor(private readonly options: RecoveryOptions) {
    this.state = options.stateStore.load() ?? { state: 'STARTING', position: null, workingOrders: [], dailyLossLocked: false, processedSetupIds: [] };
  }

  async start(): Promise<RecoveryState> {
    return this.reconcileAndStart();
  }

  async recover(): Promise<RecoveryState> {
    this.setState({ ...this.state, state: 'STARTING' });
    return this.reconcileAndStart();
  }

  markDisconnected(): RecoveryState {
    this.setState({ ...this.state, state: 'DISCONNECTED' });
    return this.snapshot();
  }

  markSetupProcessed(setupId: string): void {
    if (this.state.processedSetupIds.includes(setupId)) return;
    this.setState({ ...this.state, processedSetupIds: [...this.state.processedSetupIds, setupId] });
  }

  snapshot(): RecoveryState { return { ...this.state, workingOrders: [...this.state.workingOrders], processedSetupIds: [...this.state.processedSetupIds] }; }

  private async reconcileAndStart(): Promise<RecoveryState> {
    try {
      await this.options.provider.authenticate();
      if (!await this.options.provider.verifyPracticeAccount()) return this.fail();
      if (!await this.options.provider.verifyEsContract()) return this.fail();
      const position = await this.options.provider.queryPosition();
      const workingOrders = await this.options.provider.queryWorkingOrders();
      if (!this.options.reconcile(this.state, { position, workingOrders })) return this.fail();
      const dailyLossLocked = this.options.restoreDailyLossLocked();
      const processedSetupIds = [...this.options.restoreProcessedSetupIds()];
      await this.options.provider.bootstrapMarket();
      await this.options.provider.reconnectRealtime();
      return this.ready({ ...this.state, position, workingOrders, dailyLossLocked, processedSetupIds, state: 'READY' });
    } catch {
      return this.fail();
    }
  }

  private ready(state: RecoveryState): RecoveryState { this.setState(state); return this.snapshot(); }
  private fail(): RecoveryState { this.setState({ ...this.state, state: 'RECOVERY_REQUIRED' }); return this.snapshot(); }
  private setState(state: RecoveryState): void { this.state = state; this.options.stateStore.save(state); this.options.onState?.(this.snapshot()); }
}

export interface RuntimeEvent {
  readonly at: Date;
  readonly sequence: number;
}

export type MarketRuntimeEvent =
  | (RuntimeEvent & { readonly type: 'market.connected' })
  | (RuntimeEvent & { readonly type: 'market.disconnected'; readonly reason?: string })
  | (RuntimeEvent & { readonly type: 'candle.completed'; readonly candle: Candle })
  | (RuntimeEvent & { readonly type: 'strategy.evaluated'; readonly decision: TradingDecision })
  | (RuntimeEvent & { readonly type: 'execution.requested'; readonly decision: TradingDecision })
  | (RuntimeEvent & { readonly type: 'market.error'; readonly message: string })
  | (RuntimeEvent & { readonly type: 'runtime.stopped' });

export interface CandleBuilderOptions {
  readonly timeframeMinutes: number;
  readonly symbol?: Instrument;
}

interface CandleAccumulator {
  readonly bucket: number;
  readonly timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class CandleBuilder {
  private current: CandleAccumulator | null = null;
  private readonly symbol: Instrument;

  constructor(private readonly options: CandleBuilderOptions) {
    if (options.timeframeMinutes !== 15) {
      throw new RangeError('The active strategy requires 15-minute candles.');
    }
    this.symbol = options.symbol ?? ES_SYMBOL;
  }

  update(bar: MarketBar): Candle | null {
    if (bar.instrument !== this.symbol) throw new Error(`Only ${this.symbol} market bars are supported.`);
    if (!(bar.timestamp instanceof Date) || !Number.isFinite(bar.timestamp.getTime())) throw new Error('Market bar timestamp must be valid.');
    const bucketSize = this.options.timeframeMinutes * 60_000;
    const bucket = Math.floor(bar.timestamp.getTime() / bucketSize) * bucketSize;
    if (this.current && bucket < this.current.bucket) throw new Error('Market bars must arrive in chronological order.');

    if (!this.current) {
      this.current = this.start(bucket, bar);
      return null;
    }
    if (bucket === this.current.bucket) {
      this.current.high = Math.max(this.current.high, bar.high);
      this.current.low = Math.min(this.current.low, bar.low);
      this.current.close = bar.close;
      this.current.volume += bar.volume;
      return null;
    }

    const completed = this.toCandle(this.current);
    this.current = this.start(bucket, bar);
    return completed;
  }

  flush(): Candle | null {
    if (!this.current) return null;
    const completed = this.toCandle(this.current);
    this.current = null;
    return completed;
  }

  private start(bucket: number, bar: MarketBar): CandleAccumulator {
    return { bucket, timestamp: new Date(bucket), open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume };
  }

  private toCandle(value: CandleAccumulator): Candle {
    return {
      timestamp: value.timestamp,
      open: value.open,
      high: value.high,
      low: value.low,
      close: value.close,
      volume: value.volume,
      symbol: this.symbol,
      timeframe: '15m',
      isClosed: true
    };
  }
}

export class FakeMarketDataProvider implements MarketDataProvider {
  private readonly handlers = new Set<(event: MarketEvent) => void>();
  private connected = false;

  constructor(private readonly bootstrapCandles: readonly Candle[] = []) {}

  async bootstrap(): Promise<readonly Candle[]> {
    return this.bootstrapCandles;
  }

  async connect(): Promise<void> {
    this.connected = true;
    this.publish({ type: 'connected', at: new Date(0) });
  }

  subscribe(handler: (event: MarketEvent) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    this.connected = false;
    this.publish({ type: 'disconnected', at: new Date(0), reason: 'shutdown' });
  }

  emit(event: MarketEvent): void {
    this.publish(event);
  }

  private publish(event: MarketEvent): void {
    for (const handler of this.handlers) handler(event);
  }
}

export class FakeExecutionProvider implements ExecutionProvider {
  readonly decisions: TradingDecision[] = [];

  execute(decision: TradingDecision): void {
    this.decisions.push(decision);
  }
}

export interface MarketRuntimeOptions {
  readonly provider: MarketDataProvider;
  readonly execution: ExecutionProvider;
  readonly levels: readonly SupportResistanceLevel[];
  readonly config: StrategyConfig;
  readonly timeframeMinutes?: number;
  readonly riskState?: TradingRiskState;
  readonly onEvent?: (event: MarketRuntimeEvent) => void;
}

export class MarketRuntime {
  private readonly builder: CandleBuilder;
  private readonly riskState: TradingRiskState;
  private readonly events: MarketRuntimeEvent[] = [];
  private readonly seenEventIds = new Set<string>();
  private readonly completedCandles: Candle[] = [];
  private unsubscribe: (() => void) | null = null;
  private running = false;
  private processing: Promise<void> = Promise.resolve();
  private sequence = 0;
  private config: StrategyConfig;
  private levels: readonly SupportResistanceLevel[];

  constructor(private readonly options: MarketRuntimeOptions) {
    this.config = options.config;
    this.levels = options.levels;
    this.builder = new CandleBuilder({ timeframeMinutes: options.timeframeMinutes ?? 15, symbol: options.config.symbol });
    this.riskState = options.riskState ?? new TradingRiskState({ tradingDayResolver: calendarTradingDayResolver(), stateStore: new MemoryRiskStateStore() });
  }

  updateConfig(config: StrategyConfig): void {
    this.config = config;
  }

  updateLevels(levels: readonly SupportResistanceLevel[]): void {
    this.levels = levels;
  }

  async start(): Promise<void> {
    if (this.running) return;
    await this.options.execution.reconcile?.();
    this.running = true;
    const bootstrap = await this.options.provider.bootstrap();
    for (const candle of bootstrap) this.acceptCompletedCandle(candle);
    this.unsubscribe = this.options.provider.subscribe((event) => {
      this.processing = this.processing.then(() => this.handle(event));
    });
    await this.options.provider.connect();
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    await this.processing;
    const finalCandle = this.builder.flush();
    if (finalCandle) this.acceptCompletedCandle(finalCandle);
    await this.options.provider.disconnect();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.running = false;
    this.emit({ type: 'runtime.stopped', at: new Date(this.lastTimestamp()), sequence: 0 });
  }

  async idle(): Promise<void> {
    await this.processing;
  }

  snapshot(): { readonly events: readonly MarketRuntimeEvent[]; readonly candles: readonly Candle[] } {
    return { events: [...this.events], candles: [...this.completedCandles] };
  }

  private async handle(event: MarketEvent): Promise<void> {
    if (event.type === 'connected') {
      this.emit({ type: 'market.connected', at: event.at, sequence: 0 });
      return;
    }
    if (event.type === 'disconnected') {
      this.emit({ type: 'market.disconnected', at: event.at, reason: event.reason, sequence: 0 });
      return;
    }
    if (event.type === 'error') {
      this.emit({ type: 'market.error', at: event.at, message: event.message, sequence: 0 });
      return;
    }
    if (this.seenEventIds.has(event.id)) return;
    this.seenEventIds.add(event.id);
    await this.options.execution.onMarketBar?.(event.bar);
    const completed = this.builder.update(event.bar);
    if (completed) this.acceptCompletedCandle(completed);
  }

  private acceptCompletedCandle(candle: Candle): void {
    if (candle.symbol !== this.config.symbol || !candle.isClosed) throw new Error(`Runtime accepts only completed ${this.config.symbol} candles.`);
    if (this.completedCandles.some((existing) => existing.timestamp.getTime() === candle.timestamp.getTime())) return;
    this.completedCandles.push(candle);
    const decision = evaluateDeterministicStrategy({
      candles: this.completedCandles,
      levels: this.levels,
      config: this.config,
      indicators: { emaFast: calculateStandardEma9(this.completedCandles), emaSlow: calculateStandardEma21(this.completedCandles) },
      eligibility: this.riskState.eligibility(candle.timestamp)
    });
    this.emit({ type: 'candle.completed', at: candle.timestamp, candle, sequence: 0 });
    this.emit({ type: 'strategy.evaluated', at: candle.timestamp, decision, sequence: 0 });
    if (decision.action !== 'NO_TRADE') {
      this.options.execution.execute(decision);
      this.emit({ type: 'execution.requested', at: candle.timestamp, decision, sequence: 0 });
    }
  }

  private emit(event: MarketRuntimeEvent): void {
    const sequenced = { ...event, sequence: ++this.sequence } as MarketRuntimeEvent;
    this.events.push(sequenced);
    this.options.onEvent?.(sequenced);
  }

  private lastTimestamp(): number {
    return this.events.at(-1)?.at.getTime() ?? 0;
  }
}

export interface MarketDataAdapter extends MarketDataProvider {
  readonly stream: (onBar: (bar: MarketBar) => void) => Promise<void>;
  readonly historicalCandles: (limit: number) => Promise<readonly Candle[]>;
}

