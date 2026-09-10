import { describe, expect, it } from 'vitest';
import {
  candleSchema,
  reasonDescriptions,
  strategyConfigSchema,
  supportResistanceLevelSchema
} from '@es-trading/shared';

const validCandle = {
  timestamp: '2026-09-10T14:00:00.000Z',
  open: 5000,
  high: 5010,
  low: 4995,
  close: 5005,
  volume: 100,
  symbol: '/ES',
  timeframe: '15m',
  isClosed: true
};

describe('domain validation', () => {
  it('accepts a completed /ES candle with point-based prices', () => {
    const result = candleSchema.parse(validCandle);

    expect(result.symbol).toBe('/ES');
    expect(result.isClosed).toBe(true);
    expect(result.open).toBe(5000);
  });

  it('rejects a non-/ES candle', () => {
    const result = candleSchema.safeParse({ ...validCandle, symbol: '/NQ' });

    expect(result.success).toBe(false);
  });

  it('rejects an unfinished candle and invalid OHLC bounds', () => {
    const result = candleSchema.safeParse({
      ...validCandle,
      high: 4999,
      isClosed: false
    });

    expect(result.success).toBe(false);
  });

  it('applies the specified strategy defaults', () => {
    const config = strategyConfigSchema.parse({
      symbol: '/ES',
      timeframe: '15m',
      tradingTimezone: 'America/New_York',
      noNewTradesAtOrAfter: '11:45',
      levels: { source: 'manual_input' }
    });

    expect(config.emaFastPeriod).toBe(9);
    expect(config.emaSlowPeriod).toBe(21);
    expect(config.stopPoints).toBe(10);
    expect(config.targetPoints).toBe(10);
    expect(config.minimumBreathingRoomPoints).toBe(3);
    expect(config.quantity).toBe(1);
  });

  it('rejects reversed EMA periods and malformed level bounds', () => {
    const result = strategyConfigSchema.safeParse({
      symbol: '/ES',
      timeframe: '15m',
      emaFastPeriod: 21,
      emaSlowPeriod: 9,
      tradingTimezone: 'America/New_York',
      noNewTradesAtOrAfter: '11:45',
      levels: { source: 'manual_input', minimumCount: 200, maximumCount: 80 }
    });

    expect(result.success).toBe(false);
  });

  it('validates manual levels as numeric /ES point values', () => {
    expect(supportResistanceLevelSchema.parse({ id: 'level-1', price: 5010 })).toMatchObject({
      id: 'level-1',
      price: 5010,
      active: true
    });

    expect(supportResistanceLevelSchema.safeParse({ id: '', price: '5010' }).success).toBe(false);
  });

  it('provides a human description for every machine-readable reason code', () => {
    expect(Object.values(reasonDescriptions)).toHaveLength(15);
    expect(reasonDescriptions.INSUFFICIENT_BREATHING_ROOM).toContain('distance');
  });
});
