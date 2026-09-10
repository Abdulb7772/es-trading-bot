import { describe, expect, it } from 'vitest';
import { evaluateLongSetup, evaluateShortSetup, evaluateStrategy } from '@es-trading/strategy';
import { strategyConfigSchema } from '@es-trading/shared';
import type { Candle, StrategyConfig, StrategyInput, SupportResistanceLevel } from '@es-trading/shared';

const levels: readonly SupportResistanceLevel[] = [
  { id: 'l1', price: 5000, active: true },
  { id: 'l2', price: 5010, active: true },
  { id: 'l3', price: 5020, active: true },
  { id: 'l4', price: 5030, active: true },
  { id: 'l5', price: 5040, active: true }
];

const config: StrategyConfig = strategyConfigSchema.parse({
  symbol: '/ES' as const,
  timeframe: '15m',
  emaFastPeriod: 9,
  emaSlowPeriod: 21,
  stopPoints: 10,
  targetPoints: 10,
  minimumBreathingRoomPoints: 3,
  quantity: 1,
  tradingTimezone: 'America/New_York',
  noNewTradesAtOrAfter: '11:45',
  levels: { source: 'manual_input' as const }
});

function candle(index: number, open: number, close: number, isClosed = true): Candle {
  return {
    timestamp: new Date(`2026-09-${String(index).padStart(2, '0')}T14:00:00.000Z`),
    open,
    high: Math.max(open, close),
    low: Math.min(open, close),
    close,
    symbol: '/ES',
    timeframe: '15m',
    isClosed
  };
}

function input(candles: readonly Candle[], emaFast = 100, emaSlow = 90): StrategyInput {
  return {
    candles,
    levels,
    indicators: { emaFast, emaSlow },
    config
  };
}

const validLong = [candle(1, 5000, 5005), candle(2, 5005, 5002), candle(3, 5002, 5025)];
const validShort = [candle(1, 5020, 5015), candle(2, 5015, 5018), candle(3, 5018, 4995)];

describe('three-candle strategy base patterns', () => {
  it.each([
    ['insufficient candles', [candle(1, 5000, 5005), candle(2, 5005, 5002)], 'INSUFFICIENT_CANDLES'],
    ['Candle 1 color', [candle(1, 5000, 5000), candle(2, 5000, 4998), candle(3, 4998, 5010)], 'CANDLE_1_COLOR_INVALID'],
    ['Candle 2 color', [candle(1, 5000, 5005), candle(2, 5005, 5005), candle(3, 5005, 5010)], 'CANDLE_2_COLOR_INVALID'],
    ['Candle 3 color', [candle(1, 5000, 5005), candle(2, 5005, 5002), candle(3, 5002, 5002)], 'CANDLE_3_COLOR_INVALID'],
    ['Candle 3 break', [candle(1, 5000, 5005), candle(2, 5005, 5002), candle(3, 4998, 5000)], 'CANDLE_3_DID_NOT_BREAK_LEVEL'],
    ['EMA alignment', validLong, 'EMA_ALIGNMENT_INVALID']
  ])('rejects long %s', (_name, candles, code) => {
    const result = evaluateLongSetup(input(candles, code === 'EMA_ALIGNMENT_INVALID' ? 89 : 100, 90));
    expect(result.accepted).toBe(false);
    expect(result.reasons[0]?.code).toBe(code);
  });

  it.each([
    ['Candle 1 color', [candle(1, 5000, 5000), candle(2, 5000, 5002), candle(3, 5002, 4990)], 'CANDLE_1_COLOR_INVALID'],
    ['Candle 2 color', [candle(1, 5020, 5015), candle(2, 5015, 5015), candle(3, 5015, 5000)], 'CANDLE_2_COLOR_INVALID'],
    ['Candle 3 color', [candle(1, 5020, 5015), candle(2, 5015, 5018), candle(3, 5018, 5018)], 'CANDLE_3_COLOR_INVALID'],
    ['Candle 3 break', [candle(1, 5020, 5015), candle(2, 5015, 5018), candle(3, 5025, 5020)], 'CANDLE_3_DID_NOT_BREAK_LEVEL'],
    ['EMA alignment', validShort, 'EMA_ALIGNMENT_INVALID']
  ])('rejects short %s', (_name, candles, code) => {
    const result = evaluateShortSetup(input(candles, code === 'EMA_ALIGNMENT_INVALID' ? 101 : 90, 100));
    expect(result.accepted).toBe(false);
    expect(result.reasons[0]?.code).toBe(code);
  });

  it('accepts a long setup at Candle 1 equality and chooses the highest broken level', () => {
    const result = evaluateLongSetup(input(validLong, 100, 100));

    expect(result.accepted).toBe(true);
    expect(result.side).toBe('LONG');
    expect(result.tradePlan?.entryPrice).toBe(5025);
    expect(result.playedLevel?.price).toBe(5020);
    expect(result.nextRelevantLevel?.price).toBe(5030);
  });

  it('accepts a short setup at Candle 1 equality and chooses the lowest broken level', () => {
    const result = evaluateShortSetup(input(validShort, 100, 100));

    expect(result.accepted).toBe(true);
    expect(result.side).toBe('SHORT');
    expect(result.tradePlan?.entryPrice).toBe(4995);
    expect(result.playedLevel?.price).toBe(5000);
    expect(result.nextRelevantLevel).toBeNull();
  });

  it('rejects Candle 3 equality with the relevant level because the break is strict', () => {
    const result = evaluateLongSetup(input([candle(1, 5000, 5005), candle(2, 5005, 5002), candle(3, 4998, 5000)]));

    expect(result.accepted).toBe(false);
    expect(result.reasons[0]?.code).toBe('CANDLE_3_DID_NOT_BREAK_LEVEL');
  });

  it('rejects an open or non-/ES candle with a specific reason', () => {
    expect(evaluateLongSetup(input([candle(1, 5000, 5005), candle(2, 5005, 5002), candle(3, 5002, 5025, false)])).reasons[0]?.code).toBe('CANDLE_NOT_CLOSED');
    expect(evaluateLongSetup(input([candle(1, 5000, 5005), candle(2, 5005, 5002), { ...candle(3, 5002, 5025), symbol: '/NQ' } as unknown as Candle])).reasons[0]?.code).toBe('INVALID_INSTRUMENT');
  });

it('returns an entry action only for one accepted direction', () => {
     const result = evaluateStrategy(input(validLong));

     expect(result.action).toBe('ENTER_LONG');
     expect(result.generatedAt).toEqual(validLong[2].timestamp);
   });

   it('rejects a long where a wick touches the next level and Candle 3 does not close beyond it', () => {
     const candles = [candle(1, 5000, 5005), candle(2, 5005, 5002), candle(3, 5002, 5025, true)];
     const levelsWithWick = [...levels, { id: 'l6', price: 5025, active: true }];
     const result = evaluateLongSetup({ ...input(candles), levels: levelsWithWick });
     expect(result.accepted).toBe(false);
     expect(result.reasons[0]?.code).toBe('WICK_TOUCHED_FORBIDDEN_NEXT_LEVEL');
   });

   it('accepts a long where a wick touches the next level but Candle 3 closes beyond it', () => {
     const candles = [candle(1, 5000, 5005), candle(2, 5005, 5002), candle(3, 5002, 5035)];
     const levelsWithWick = [...levels, { id: 'l6', price: 5025, active: true }];
     const result = evaluateLongSetup({ ...input(candles), levels: levelsWithWick });
     expect(result.accepted).toBe(true);
   });

   it('rejects a long with insufficient breathing room', () => {
    const tightLevels = [{ id: 't1', price: 5000, active: true }, { id: 't2', price: 5002, active: true }, { id: 't3', price: 5004.75, active: true }, { id: 't4', price: 5006, active: true }];
    const candles = [candle(1, 5000, 5001), candle(2, 5001, 5000.5), candle(3, 5000.5, 5002.5)];
     const result = evaluateLongSetup({ ...input(candles), levels: tightLevels });
     expect(result.accepted).toBe(false);
     expect(result.reasons[0]?.code).toBe('INSUFFICIENT_BREATHING_ROOM');
   });

   it('sets targetPrice at the next relevant level when closer than 10 points', () => {
     const result = evaluateLongSetup(input(validLong, 100, 100));
     expect(result.tradePlan?.targetPrice).toBe(5030);
   });

   it('sets breathingRoomPoints correctly and null when no next level', () => {
     const longResult = evaluateLongSetup(input(validLong, 100, 100));
     expect(longResult.tradePlan?.breathingRoomPoints).toBe(10);
     const shortResult = evaluateShortSetup(input(validShort, 100, 100));
     expect(shortResult.tradePlan?.breathingRoomPoints).toBeNull();
   });

it('rejects a short where a wick touches the next level and Candle 3 does not close beyond it', () => {
      const candles = [candle(1, 5020, 5015), candle(2, 5015, 5018), candle(3, 5018, 4990)];
      const levelsWithWick = [...levels, { id: 'l6', price: 4990, active: true }];
      const result = evaluateShortSetup({ ...input(candles, 90, 100), levels: levelsWithWick });
      expect(result.accepted).toBe(false);
      expect(result.reasons[0]?.code).toBe('WICK_TOUCHED_FORBIDDEN_NEXT_LEVEL');
    });
  });
