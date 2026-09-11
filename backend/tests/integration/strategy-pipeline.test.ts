import { describe, expect, it } from 'vitest';
import { evaluateDeterministicStrategy } from '@es-trading/strategy';
import { strategyConfigSchema } from '@es-trading/shared';
import type { Candle, StrategyInput, SupportResistanceLevel } from '@es-trading/shared';

const config = strategyConfigSchema.parse({ symbol: '/ES', timeframe: '15m', tradingTimezone: 'America/New_York', noNewTradesAtOrAfter: '16:00', levels: { source: 'manual_input' } });
const levels: readonly SupportResistanceLevel[] = [
  { id: 'support', price: 5000, active: true }, { id: 'r1', price: 5010, active: true }, { id: 'r2', price: 5020, active: true }, { id: 'r3', price: 5030, active: true }, { id: 'support-1', price: 4990, active: true }
];
function candle(day: number, open: number, close: number): Candle { return { timestamp: new Date(`2026-09-${String(day).padStart(2, '0')}T14:00:00Z`), open, high: Math.max(open, close), low: Math.min(open, close), close, symbol: '/ES', timeframe: '15m', isClosed: true }; }
function input(candles: readonly Candle[], indicators = { emaFast: 100, emaSlow: 90 }): StrategyInput { return { candles, levels, indicators, config }; }

describe('exact ES strategy pipeline', () => {
  it('uses Candle 3 close as entry and the last level Candle 3 closes beyond', () => {
    const result = evaluateDeterministicStrategy(input([candle(1, 5000, 5005), candle(2, 5005, 5002), candle(3, 5002, 5025)]));
    expect(result.action).toBe('ENTER_LONG');
    expect(result.evaluation.entryPrice).toBe(5025);
    expect(result.evaluation.brokenLevel?.price).toBe(5020);
    expect(result.evaluation.nextRelevantLevel?.price).toBe(5030);
  });

  it('uses ES closes supplied to the strategy for EMA values and allows equality', () => {
    const result = evaluateDeterministicStrategy(input([candle(1, 5020, 5015), candle(2, 5015, 5018), candle(3, 5018, 4995)], { emaFast: 100, emaSlow: 100 }));
    expect(result.action).toBe('ENTER_SHORT');
    expect(result.evaluation.ema9).toBe(100);
    expect(result.evaluation.ema21).toBe(100);
    expect(result.evaluation.candle1?.symbol).toBe('/ES');
  });
});
