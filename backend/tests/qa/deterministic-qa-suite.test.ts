import { describe, expect, it } from 'vitest';
import { evaluateLongSetup, evaluateShortSetup, evaluateStrategy } from '@es-trading/strategy';
import { strategyConfigSchema } from '@es-trading/shared';
import type { Candle, StrategyInput, SupportResistanceLevel } from '@es-trading/shared';

const config = strategyConfigSchema.parse({
  symbol: '/ES',
  timeframe: '15m',
  tradingTimezone: 'America/New_York',
  noNewTradesAtOrAfter: '16:00',
  levels: { source: 'manual_input' }
});

const levels: SupportResistanceLevel[] = [
  { id: 'l0', price: 5000, active: true },
  { id: 'l1', price: 5010, active: true },
  { id: 'l2', price: 5020, active: true },
  { id: 'l3', price: 5030, active: true },
  { id: 'l4', price: 5040, active: true }
];

function candle(index: number, open: number, close: number, isGreen?: boolean): Candle {
  const green = isGreen !== undefined ? isGreen : open < close;
  return {
    timestamp: new Date(`2026-09-1${String(index + 1).padStart(2, '0')}T14:00:00Z`),
    open,
    high: Math.max(open, close),
    low: Math.min(open, close),
    close,
    symbol: '/ES',
    timeframe: '15m',
    isClosed: true
  };
}

function input(candles: readonly Candle[], emaFast = 100, emaSlow = 90, suppliedLevels = levels): StrategyInput {
  return { candles, levels: suppliedLevels, indicators: { emaFast, emaSlow }, config };
}

// ============================================================
// REQ-LEVELS
// ============================================================

describe('REQ-LEVELS', () => {
  it('LEVEL-001: supplied file loads 90 ES fixture levels', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const fixture = fs.readFileSync(path.resolve(process.cwd(), 'backend/tests/fixtures/es-levels-90.txt'), 'utf8');
    const parsed = require('@es-trading/levels').parseLevelsFromText(fixture);
    expect(parsed).toHaveLength(90);
    expect(parsed).toEqual([...parsed].sort((left, right) => left - right));
  });

  it('LEVEL-002: normalizeLevels deduplicates and sorts', () => {
    const { normalizeLevels } = require('@es-trading/levels');
    expect(normalizeLevels([5020, '5000', 5010, 5000, 4990])).toEqual([4990, 5000, 5010, 5020]);
  });

  it('LEVEL-003: findNearestLowerLevel', () => {
    const { findNearestLowerLevel } = require('@es-trading/levels');
    expect(findNearestLowerLevel([4990, 5000, 5010, 5020, 5030], 5015)).toBe(5010);
    expect(findNearestLowerLevel([4990, 5000, 5010, 5020, 5030], 4990)).toBeUndefined();
  });

  it('LEVEL-004: findNearestHigherLevel', () => {
    const { findNearestHigherLevel } = require('@es-trading/levels');
    expect(findNearestHigherLevel([4990, 5000, 5010, 5020, 5030], 5015)).toBe(5020);
    expect(findNearestHigherLevel([4990, 5000, 5010, 5020, 5030], 5050)).toBeUndefined();
  });

  it('LEVEL-005: relevantSupport interpretation', () => {
    const { relevantSupport } = require('@es-trading/levels');
    expect(relevantSupport([4990, 5000, 5010, 5020, 5030], 5015)).toBe(5010);
    expect(relevantSupport([4990, 5000, 5010, 5020, 5030], 5005)).toBe(5000);
  });

  it('LEVEL-006: relevantResistance interpretation', () => {
    const { relevantResistance } = require('@es-trading/levels');
    expect(relevantResistance([4990, 5000, 5010, 5020, 5030], 5015)).toBe(5020);
    expect(relevantResistance([4990, 5000, 5010, 5020, 5030], 5010)).toBe(5020);
  });
})

// ============================================================
// REQ-LONG (modeled after existing strategy.test.ts exact patterns)
// ============================================================

describe('REQ-LONG', () => {
  it('LONG-001: rejects long Candle 1 color', () => {
    const result = evaluateLongSetup(input([
      candle(1, 5000, 5000), // C1: neutral (open == close)
      candle(2, 5005, 5010),
      candle(3, 5010, 5015)
    ]));
    expect(result.accepted).toBe(false);
    expect(result.reasons[0]?.code).toBe('CANDLE_1_COLOR_INVALID');
  });

  it('LONG-002: rejects long Candle 2 color', () => {
    const result = evaluateLongSetup(input([
      candle(1, 5000, 5005), // C1: green
      candle(2, 5005, 5005), // C2: neutral (open == close)
      candle(3, 5010, 5015)
    ]));
    expect(result.accepted).toBe(false);
    expect(result.reasons[0]?.code).toBe('CANDLE_2_COLOR_INVALID');
  });

  it('LONG-003: rejects long Candle 3 color', () => {
    const result = evaluateLongSetup(input([
      candle(1, 5000, 5005), // C1: green
      candle(2, 5010, 5005), // C2: red (pullback)
      candle(3, 5005, 5005)  // C3: neutral (open == close)
    ]));
    expect(result.accepted).toBe(false);
    expect(result.reasons[0]?.code).toBe('CANDLE_3_COLOR_INVALID');
  });

  it('LONG-004: accepts valid long setup', () => {
    const result = evaluateLongSetup(input([
      candle(1, 5000, 5005), // C1: green
      candle(2, 5005, 5002), // C2: red (pullback)
      candle(3, 5002, 5015)  // C3: green (breakout)
    ]));
    expect(result.accepted).toBe(true);
    expect(result.side).toBe('LONG');
    expect(result.entryPrice).toBe(5015);
  });

  it('LONG-005: rejects long break - C3 did not close beyond level', () => {
    const result = evaluateLongSetup(input([
      candle(1, 5000, 5005), // C1: green
      candle(2, 5005, 4998), // C2: red (pullback)
      candle(3, 4998, 4999)  // C3: green but close 4999 ≤ support 5000
    ]));
    expect(result.accepted).toBe(false);
    expect(result.reasons[0]?.code).toBe('CANDLE_3_DID_NOT_BREAK_LEVEL');
  });

  it('LONG-007: rejects long EMA alignment invalid', () => {
    const result = evaluateLongSetup(input([
      candle(1, 5000, 5005),
      candle(2, 5005, 5002), // C2: red (pullback)
      candle(3, 5002, 5020)
    ], 99, 101)); // EMA9 < EMA21
    expect(result.accepted).toBe(false);
    expect(result.reasons[0]?.code).toBe('EMA_ALIGNMENT_INVALID');
  });

  it('LONG-010: uses closer next level as target', () => {
    for (const [distance, expectedTarget] of [[5, 5006], [10, 5011], [12, 5011]] as const) {
      const result = evaluateLongSetup(input([candle(1, 5000, 5001), candle(2, 5001, 5000.5), candle(3, 5000.5, 5001)], 100, 90, [{ id: 'support', price: 5000, active: true }, { id: 'next', price: 5001 + distance, active: true }]));
      expect(result.accepted).toBe(true);
      expect(result.tradePlan?.targetPrice).toBe(expectedTarget);
    }
  });
})