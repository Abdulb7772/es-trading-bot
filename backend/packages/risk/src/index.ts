import { readFileSync, writeFileSync } from 'node:fs';
import type { TradeResult } from '@es-trading/shared';

export interface RiskPolicy {
  readonly maxDailyLoss: number;
  readonly maxContracts: number;
}

export interface TradingDayResolver {
  readonly resolve: (timestamp: Date) => string;
}

export interface DailyRiskState {
  readonly tradingDay: string;
  readonly losingTradeRecorded: boolean;
  readonly realizedPnl: number;
}

export interface RiskStateStore {
  readonly load: () => DailyRiskState | null;
  readonly save: (state: DailyRiskState) => void;
}

export class MemoryRiskStateStore implements RiskStateStore {
  private state: DailyRiskState | null;

  constructor(initialState: DailyRiskState | null = null) {
    this.state = initialState;
  }

  load(): DailyRiskState | null {
    return this.state ? { ...this.state } : null;
  }

  save(state: DailyRiskState): void {
    this.state = { ...state };
  }
}

export class JsonFileRiskStateStore implements RiskStateStore {
  constructor(private readonly filePath: string) {}

  load(): DailyRiskState | null {
    try {
      return JSON.parse(readFileSync(this.filePath, 'utf8')) as DailyRiskState;
    } catch {
      return null;
    }
  }

  save(state: DailyRiskState): void {
    writeFileSync(this.filePath, JSON.stringify(state, null, 2), 'utf8');
  }
}

export interface TradingEligibility {
  readonly tradingDay: string;
  readonly tradingWindowOpen: boolean;
  readonly dailyLossLocked: boolean;
  readonly canOpenNewTrade: boolean;
}

export interface RealizedTrade {
  readonly result: Extract<TradeResult, 'WIN' | 'LOSS' | 'BREAKEVEN'>;
  readonly pnl: number;
  readonly timestamp: Date;
}

export interface TradingRiskStateOptions {
  readonly tradingDayResolver: TradingDayResolver;
  readonly stateStore: RiskStateStore;
  readonly timeZone?: string;
  readonly cutoffHour?: number;
  readonly cutoffMinute?: number;
}

export class TradingRiskState {
  private readonly tradingDayResolver: TradingDayResolver;
  private readonly stateStore: RiskStateStore;
  private readonly timeZone: string;
  private readonly cutoffHour: number;
  private readonly cutoffMinute: number;
  private state: DailyRiskState | null;

  constructor(options: TradingRiskStateOptions) {
    this.tradingDayResolver = options.tradingDayResolver;
    this.stateStore = options.stateStore;
    this.timeZone = options.timeZone ?? 'America/New_York';
    this.cutoffHour = options.cutoffHour ?? 16;
    this.cutoffMinute = options.cutoffMinute ?? 0;
    this.state = this.stateStore.load();
  }

  eligibility(timestamp: Date): TradingEligibility {
    const tradingDay = this.currentTradingDay(timestamp);
    this.ensureTradingDay(tradingDay);
    const dailyLossLocked = this.state?.losingTradeRecorded ?? false;
    const tradingWindowOpen = this.isBeforeCutoff(timestamp);
    return { tradingDay, tradingWindowOpen, dailyLossLocked, canOpenNewTrade: tradingWindowOpen && !dailyLossLocked };
  }

  recordRealizedTrade(trade: RealizedTrade): DailyRiskState {
    const tradingDay = this.currentTradingDay(trade.timestamp);
    this.ensureTradingDay(tradingDay);
    const current = this.state ?? { tradingDay, losingTradeRecorded: false, realizedPnl: 0 };
    const next: DailyRiskState = {
      tradingDay,
      losingTradeRecorded: current.losingTradeRecorded || trade.result === 'LOSS',
      realizedPnl: current.realizedPnl + trade.pnl
    };
    this.state = next;
    this.stateStore.save(next);
    return { ...next };
  }

  snapshot(): DailyRiskState | null {
    return this.state ? { ...this.state } : null;
  }

  private currentTradingDay(timestamp: Date): string {
    return this.tradingDayResolver.resolve(timestamp);
  }

  private ensureTradingDay(tradingDay: string): void {
    if (this.state?.tradingDay === tradingDay) return;
    this.state = { tradingDay, losingTradeRecorded: false, realizedPnl: 0 };
    this.stateStore.save(this.state);
  }

  private isBeforeCutoff(timestamp: Date): boolean {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: this.timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(timestamp).reduce<Record<string, string>>((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});
    const seconds = Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second);
    return seconds < this.cutoffHour * 3600 + this.cutoffMinute * 60;
  }
}

export const calendarTradingDayResolver = (timeZone = 'America/New_York'): TradingDayResolver => ({
  resolve: (timestamp) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(timestamp)
});
