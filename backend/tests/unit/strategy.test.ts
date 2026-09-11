import { describe, expect, it } from 'vitest';
import { evaluateLongSetup, evaluateShortSetup, evaluateStrategy } from '@es-trading/strategy';
import { strategyConfigSchema } from '@es-trading/shared';
import type { Candle, StrategyInput, SupportResistanceLevel } from '@es-trading/shared';

const config = strategyConfigSchema.parse({ symbol: '/ES', timeframe: '15m', tradingTimezone: 'America/New_York', noNewTradesAtOrAfter: '16:00', levels: { source: 'manual_input' } });
const levels: readonly SupportResistanceLevel[] = [
  { id: 'support', price: 5000, active: true },
  { id: 'r1', price: 5010, active: true },
  { id: 'r2', price: 5020, active: true },
  { id: 'r3', price: 5030, active: true },
  { id: 'support-1', price: 4990, active: true }
];

function candle(day: number, open: number, close: number, high = Math.max(open, close), low = Math.min(open, close)): Candle {
  return { timestamp: new Date(`2026-09-${String(day).padStart(2, '0')}T14:00:00Z`), open, high, low, close, symbol: '/ES', timeframe: '15m', isClosed: true };
}
function input(candles: readonly Candle[], emaFast = 100, emaSlow = 90, suppliedLevels = levels): StrategyInput {
  return { candles, levels: suppliedLevels, indicators: { emaFast, emaSlow }, config };
}

describe('current ES three-bar strategy', () => {
  it('accepts the exact long rules and returns all structured decision fields', () => {
    const result = evaluateLongSetup(input([candle(1, 5000, 5005), candle(2, 5005, 5002), candle(3, 5002, 5025)]));
    expect(result).toMatchObject({ accepted: true, side: 'LONG', entryPrice: 5025, ema9: 100, ema21: 90, brokenLevel: { price: 5020 }, nextRelevantLevel: { price: 5030 }, candle1: { open: 5000 }, candle2: { close: 5002 }, candle3: { close: 5025 } });
    expect(result.tradePlan?.breathingRoomPoints).toBe(5);
    expect(result.reasons).toEqual([]);
  });

  it('accepts the exact short rules with equality allowed for EMA', () => {
    const result = evaluateShortSetup(input([candle(1, 5020, 5015), candle(2, 5015, 5018), candle(3, 5018, 4995)], 100, 100));
    expect(result).toMatchObject({ accepted: true, side: 'SHORT', entryPrice: 4995, brokenLevel: { price: 5000 }, nextRelevantLevel: { price: 4990 }, ema9: 100, ema21: 100 });
  });

  it.each([
    ['insufficient candles', [candle(1, 5000, 5005), candle(2, 5005, 5002)], 'INSUFFICIENT_CANDLES'],
    ['long Candle 1 color', [candle(1, 5000, 5000), candle(2, 5000, 4998), candle(3, 4998, 5010)], 'CANDLE_1_COLOR_INVALID'],
    ['long Candle 2 color', [candle(1, 5000, 5005), candle(2, 5005, 5005), candle(3, 5005, 5010)], 'CANDLE_2_COLOR_INVALID'],
    ['long Candle 3 color', [candle(1, 5000, 5005), candle(2, 5005, 5002), candle(3, 5002, 5002)], 'CANDLE_3_COLOR_INVALID'],
    ['long break', [candle(1, 5000, 5005), candle(2, 5005, 5002), candle(3, 4998, 4999)], 'CANDLE_3_DID_NOT_BREAK_LEVEL'],
    ['long EMA', [candle(1, 5000, 5005), candle(2, 5005, 5002), candle(3, 5002, 5025)], 'EMA_ALIGNMENT_INVALID']
  ])('rejects %s with an explicit reason', (_name, candles, code) => {
    const result = evaluateLongSetup(input(candles, code === 'EMA_ALIGNMENT_INVALID' ? 89 : 100, 90));
    expect(result.accepted).toBe(false);
    expect(result.reasons[0]?.code).toBe(code);
    expect(result.reasons[0]?.description).toBeTruthy();
  });

  it('rejects invalid instrument and incomplete candles explicitly', () => {
    expect(evaluateLongSetup(input([candle(1, 5000, 5005), candle(2, 5005, 5002), { ...candle(3, 5002, 5025), symbol: '/NQ' } as unknown as Candle])).reasons[0]?.code).toBe('INVALID_INSTRUMENT');
    expect(evaluateLongSetup(input([candle(1, 5000, 5005), candle(2, 5005, 5002), { ...candle(3, 5002, 5025), isClosed: false }])).reasons[0]?.code).toBe('CANDLE_NOT_CLOSED');
  });

  it.each([2.99, 3, 3.01])('applies the unrounded long breathing-room boundary at %s points', (distance) => {
    const suppliedLevels = [{ id: 'support', price: 5000, active: true }, { id: 'next', price: 5001 + distance, active: true }];
    const result = evaluateLongSetup(input([candle(1, 5000, 5001), candle(2, 5001, 5000.5), candle(3, 5000.5, 5001)], 100, 90, suppliedLevels));
    expect(result.accepted).toBe(distance >= 3);
    if (distance < 3) expect(result.reasons[0]?.details?.distance).toBeCloseTo(distance, 10);
    else expect(result.tradePlan?.breathingRoomPoints).toBeCloseTo(distance, 10);
  });

  it.each([2.99, 3, 3.01])('applies the unrounded short breathing-room boundary at %s points', (distance) => {
    const suppliedLevels = [{ id: 'resistance', price: 5000, active: true }, { id: 'next', price: 4999 - distance, active: true }];
    const result = evaluateShortSetup(input([candle(1, 5000, 4995), candle(2, 4995, 4999.5), candle(3, 4999.5, 4999)], 90, 100, suppliedLevels));
    expect(result.accepted).toBe(distance >= 3);
    if (distance < 3) expect(result.reasons[0]?.details?.distance).toBeCloseTo(distance, 10);
    else expect(result.tradePlan?.breathingRoomPoints).toBeCloseTo(distance, 10);
  });

  it('uses the closer next level as target and keeps the 10-point target at equal or farther levels', () => {
    for (const [distance, expectedTarget] of [[5, 5006], [10, 5011], [12, 5011]] as const) {
      const result = evaluateLongSetup(input([candle(1, 5000, 5001), candle(2, 5001, 5000.5), candle(3, 5000.5, 5001)], 100, 90, [{ id: 'support', price: 5000, active: true }, { id: 'next', price: 5001 + distance, active: true }]));
      expect(result.accepted).toBe(true);
      expect(result.tradePlan?.stopPrice).toBe(4991);
      expect(result.tradePlan?.targetPrice).toBe(expectedTarget);
    }
  });

  it('uses the closer next level for short targets and fixed 10-point risk', () => {
    for (const [distance, expectedTarget] of [[5, 4994], [10, 4989], [12, 4989]] as const) {
      const result = evaluateShortSetup(input([candle(1, 5000, 4995), candle(2, 4995, 4999.5), candle(3, 4999.5, 4999)], 90, 100, [{ id: 'resistance', price: 5000, active: true }, { id: 'next', price: 4999 - distance, active: true }]));
      expect(result.accepted).toBe(true);
      expect(result.tradePlan?.stopPrice).toBe(5009);
      expect(result.tradePlan?.targetPrice).toBe(expectedTarget);
    }
  });

  it('returns one direction action and no trade for rejected decisions', () => {
    const accepted = evaluateStrategy(input([candle(1, 5000, 5005), candle(2, 5005, 5002), candle(3, 5002, 5025)]));
    expect(accepted.action).toBe('ENTER_LONG');
    const rejected = evaluateStrategy(input([candle(1, 5000, 5000), candle(2, 5000, 4998), candle(3, 4998, 5010)]));
    expect(rejected.action).toBe('NO_TRADE');
    expect(rejected.evaluation.reasons[0]?.description).toBeTruthy();
  });
});
