import { describe, expect, it } from 'vitest';
import { evaluateDeterministicStrategy } from '@es-trading/strategy';
import { strategyConfigSchema } from '@es-trading/shared';
import type { Candle, StrategyInput, SupportResistanceLevel } from '@es-trading/shared';

const config = strategyConfigSchema.parse({
  symbol: '/ES',
  timeframe: '15m',
  tradingTimezone: 'America/New_York',
  noNewTradesAtOrAfter: '16:00',
  levels: { source: 'manual_input' }
});

const levels: readonly SupportResistanceLevel[] = [
  { id: 'support', price: 5000, active: true },
  { id: 'resistance-1', price: 5010, active: true },
  { id: 'resistance-2', price: 5020, active: true },
  { id: 'resistance-3', price: 5030, active: true },
  { id: 'support-1', price: 4990, active: true }
];

function candle(day: number, open: number, close: number, high = Math.max(open, close), low = Math.min(open, close)): Candle {
  return {
    timestamp: new Date(`2026-09-${String(day).padStart(2, '0')}T14:00:00.000Z`),
    open,
    high,
    low,
    close,
    symbol: '/ES',
    timeframe: '15m',
    isClosed: true
  };
}

function input(candles: readonly Candle[], overrides: Partial<StrategyInput> = {}): StrategyInput {
  return {
    candles,
    levels,
    indicators: { emaFast: 100, emaSlow: 90 },
    config,
    ...overrides
  };
}

describe('deterministic strategy pipeline', () => {
  it('evaluates a long setup through eligibility, levels, EMA, risk, and target selection', () => {
    const result = evaluateDeterministicStrategy(input([
      candle(1, 5000, 5005),
      candle(2, 5005, 5002),
      candle(3, 5002, 5025)
    ]));

    expect(result.action).toBe('ENTER_LONG');
    expect(result.evaluation.accepted).toBe(true);
    expect(result.evaluation.playedLevel?.price).toBe(5020);
    expect(result.evaluation.nextRelevantLevel?.price).toBe(5030);
    expect(result.evaluation.tradePlan).toMatchObject({
      entryPrice: 5025,
      stopPrice: 5015,
      targetPrice: 5030,
      breathingRoomPoints: 10
    });
  });

  it('evaluates the mirrored short setup with bearish EMA alignment', () => {
    const result = evaluateDeterministicStrategy(input([
      candle(1, 5020, 5015),
      candle(2, 5015, 5018),
      candle(3, 5018, 4995)
    ], { indicators: { emaFast: 90, emaSlow: 100 } }));

    expect(result.action).toBe('ENTER_SHORT');
    expect(result.evaluation.playedLevel?.price).toBe(5000);
    expect(result.evaluation.tradePlan).toMatchObject({ entryPrice: 4995, stopPrice: 5005, targetPrice: 4990 });
  });

  it.each([
    ['daily loss lockout', { canOpenNewTrade: false, dailyLossLocked: true, tradingWindowOpen: true }, 'DAILY_LOSS_LOCKOUT'],
    ['closed trading window', { canOpenNewTrade: true, dailyLossLocked: false, tradingWindowOpen: false }, 'TRADING_WINDOW_CLOSED']
  ])('explains %s before evaluating a setup', (_name, eligibility, reasonCode) => {
    const result = evaluateDeterministicStrategy(input([candle(1, 5000, 5005), candle(2, 5005, 5002), candle(3, 5002, 5025)], { eligibility }));

    expect(result.action).toBe('NO_TRADE');
    expect(result.evaluation.reasons[0]?.code).toBe(reasonCode);
    expect(result.evaluation.explanation).toContain('eligible');
  });

  it('rejects a wick at the final next level unless Candle 3 closes beyond it', () => {
    const nextLevel = { id: 'next', price: 5025, active: true };
    const candles = [candle(1, 5000, 5005), candle(2, 5005, 5002), candle(3, 5002, 5020, 5025)];
    const rejected = evaluateDeterministicStrategy(input(candles, { levels: [...levels, nextLevel] }));
    expect(rejected.evaluation.reasons[0]?.code).toBe('WICK_TOUCHED_FORBIDDEN_NEXT_LEVEL');

    const accepted = evaluateDeterministicStrategy(input([...candles.slice(0, 2), candle(3, 5002, 5026, 5026)], { levels: [...levels, nextLevel] }));
    expect(accepted.action).toBe('ENTER_LONG');
  });

  it('explains EMA and candle-pattern rejection without placing an order', () => {
    const result = evaluateDeterministicStrategy(input([
      candle(1, 5000, 5005),
      candle(2, 5005, 5002),
      candle(3, 5002, 5025)
    ], { indicators: { emaFast: 89, emaSlow: 90 } }));

    expect(result.action).toBe('NO_TRADE');
    expect(result.evaluation.reasons[0]?.code).toBe('EMA_ALIGNMENT_INVALID');
    expect(result.evaluation.tradePlan).toBeNull();
  });
});