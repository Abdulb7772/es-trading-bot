import { describe, expect, it } from 'vitest';
import {
  EMA_FAST_PERIOD,
  EMA_SLOW_PERIOD,
  StreamingEma,
  calculateEma,
  calculateEmaSeries,
  candleColor,
  getCandleColor,
  isEmaAligned
} from '@es-trading/indicators';
import type { Candle } from '@es-trading/shared';

function candle(close: number, open = close, index = 0, isClosed = true): Candle {
  return {
    timestamp: new Date(`2026-09-${String(index + 1).padStart(2, '0')}T14:00:00.000Z`),
    open,
    high: Math.max(open, close),
    low: Math.min(open, close),
    close,
    symbol: '/ES',
    timeframe: '15m',
    isClosed
  };
}

describe('candle color', () => {
  it('classifies green, red, and neutral candles', () => {
    expect(getCandleColor(candle(101, 100))).toBe('GREEN');
    expect(candleColor(candle(99, 100))).toBe('RED');
    expect(getCandleColor(candle(100, 100))).toBe('NEUTRAL');
  });
});

describe('EMA', () => {
  it('uses SMA initialization and then the standard recursive formula', () => {
    const series = calculateEmaSeries([candle(10, 10, 0), candle(20, 20, 1), candle(30, 30, 2), candle(40, 40, 3)], 3);

    expect(series[0]).toBeNull();
    expect(series[1]).toBeNull();
    expect(series[2]).toBe(20);
    expect(series[3]).toBe(30);
  });

  it('returns null when history is shorter than the period', () => {
    expect(calculateEma([candle(10), candle(20)], 3)).toBeNull();
    expect(new StreamingEma(EMA_SLOW_PERIOD).snapshot()).toMatchObject({
      period: EMA_SLOW_PERIOD,
      samples: 0,
      value: null,
      isReady: false
    });
  });

  it('produces the same result through batch and streaming updates', () => {
    const candles = [10, 12, 11, 15, 14, 18].map((close, index) => candle(close, close, index));
    const streaming = new StreamingEma(3);
    const streamingValues = candles.map((item) => streaming.update(item));

    expect(streamingValues).toEqual(calculateEmaSeries(candles, 3));
    expect(streaming.value).toBe(calculateEma(candles, 3));
  });

  it('provides the standard periods for the eventual strategy', () => {
    expect(EMA_FAST_PERIOD).toBe(9);
    expect(EMA_SLOW_PERIOD).toBe(21);
  });

  it('allows equality for both long and short EMA alignment', () => {
    expect(isEmaAligned('LONG', 100, 100)).toBe(true);
    expect(isEmaAligned('SHORT', 100, 100)).toBe(true);
    expect(isEmaAligned('LONG', 101, 100)).toBe(true);
    expect(isEmaAligned('SHORT', 99, 100)).toBe(true);
    expect(isEmaAligned('LONG', null, 100)).toBe(false);
  });

  it('only consumes completed /ES candles', () => {
    const ema = new StreamingEma(2);
    expect(() => ema.update(candle(10, 10, 0, false))).toThrow(/completed/);
    expect(() => ema.update({ ...candle(10, 10, 0), symbol: '/NQ' } as unknown as Candle)).toThrow(/\/ES/);
  });
});
