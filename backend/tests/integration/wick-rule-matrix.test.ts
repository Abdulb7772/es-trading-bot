import { describe, expect, it } from 'vitest';
import { evaluateLongSetup, evaluateShortSetup } from '@es-trading/strategy';
import { strategyConfigSchema } from '@es-trading/shared';
import type { Candle, SetupEvaluation, StrategyInput, SupportResistanceLevel, TradingSide } from '@es-trading/shared';

const config = strategyConfigSchema.parse({
  symbol: '/ES', timeframe: '15m', tradingTimezone: 'America/New_York', noNewTradesAtOrAfter: '16:00', levels: { source: 'manual_input' }
});
const tick = 0.25;
const longLevels: readonly SupportResistanceLevel[] = [
  { id: 'l0', price: 5000, active: true }, { id: 'l1', price: 5010, active: true },
  { id: 'l2', price: 5020, active: true }, { id: 'l3', price: 5030, active: true }, { id: 'l4', price: 5040, active: true }
];
const shortLevels: readonly SupportResistanceLevel[] = [
  { id: 's0', price: 4960, active: true }, { id: 's1', price: 4970, active: true },
  { id: 's2', price: 4980, active: true }, { id: 's3', price: 4990, active: true }, { id: 's4', price: 5000, active: true }
];

type WickPlacement = { readonly candle: 0 | 1 | 2; readonly amount: number };
type MatrixCase = { readonly id: string; readonly description: string; readonly placement?: WickPlacement | readonly WickPlacement[]; readonly closeOffset?: number; readonly closePrice?: { readonly LONG: number; readonly SHORT: number }; readonly levels?: readonly SupportResistanceLevel[]; readonly levelsBySide?: { readonly LONG: readonly SupportResistanceLevel[]; readonly SHORT: readonly SupportResistanceLevel[] }; readonly expected: 'ACCEPTED' | 'REJECTED'; readonly reason?: string };

function makeCandle(side: TradingSide, index: number, placement: WickPlacement | readonly WickPlacement[] | undefined, closeOffset: number, closePrice?: number): Candle {
  const long = side === 'LONG';
  const base = long ? [5000, 5005, 5002] : [5000, 4995, 4998];
  const close = long ? [5005, 5002, 5025][index] : [4995, 4998, 4975][index];
  const touches = (Array.isArray(placement) ? placement : placement ? [placement] : []).filter((item) => item.candle === index).reduce((result, item) => result + item.amount, 0);
  const finalClose = index === 2 ? closePrice ?? close + (long ? closeOffset : -closeOffset) : close;
  const defaultHigh = Math.max(base[index], finalClose);
  const defaultLow = Math.min(base[index], finalClose);
  const forbidden = long ? 5030 : 4970;
  const hasTouch = (Array.isArray(placement) ? placement : placement ? [placement] : []).some((item) => item.candle === index);
  return {
    timestamp: new Date(`2026-09-${String(index + 1).padStart(2, '0')}T14:00:00.000Z`),
    open: base[index], high: long ? Math.max(defaultHigh, hasTouch ? forbidden + touches : defaultHigh) : defaultHigh,
    low: long ? defaultLow : Math.min(defaultLow, hasTouch ? forbidden - touches : defaultLow), close: finalClose,
    symbol: '/ES', timeframe: '15m', isClosed: true
  };
}

function run(side: TradingSide, matrixCase: MatrixCase): SetupEvaluation {
  const candles = [0, 1, 2].map((index) => makeCandle(side, index as 0 | 1 | 2, matrixCase.placement, matrixCase.closeOffset ?? 0, index === 2 ? matrixCase.closePrice?.[side] : undefined));
  const input: StrategyInput = { candles, levels: matrixCase.levelsBySide?.[side] ?? matrixCase.levels ?? (side === 'LONG' ? longLevels : shortLevels), indicators: side === 'LONG' ? { emaFast: 100, emaSlow: 90 } : { emaFast: 90, emaSlow: 100 }, config };
  return side === 'LONG' ? evaluateLongSetup(input) : evaluateShortSetup(input);
}

function actual(evaluation: SetupEvaluation): string {
  return evaluation.accepted ? 'ACCEPTED' : `REJECTED:${evaluation.reasons[0]?.code ?? 'UNKNOWN'}`;
}

const sharedCases: MatrixCase[] = [
  { id: '1', description: 'wick one tick below forbidden level', placement: { candle: 2, amount: -tick }, expected: 'ACCEPTED' },
  { id: '2', description: 'wick exactly at forbidden level', placement: { candle: 2, amount: 0 }, expected: 'REJECTED', reason: 'WICK_TOUCHED_FORBIDDEN_NEXT_LEVEL' },
  { id: '3', description: 'wick one tick beyond forbidden level', placement: { candle: 2, amount: tick }, expected: 'REJECTED', reason: 'WICK_TOUCHED_FORBIDDEN_NEXT_LEVEL' },
  { id: '4', description: 'Candle 1 violation', placement: { candle: 0, amount: 0 }, expected: 'REJECTED', reason: 'WICK_TOUCHED_FORBIDDEN_NEXT_LEVEL' },
  { id: '5', description: 'Candle 2 violation', placement: { candle: 1, amount: 0 }, expected: 'REJECTED', reason: 'WICK_TOUCHED_FORBIDDEN_NEXT_LEVEL' },
  { id: '6', description: 'Candle 3 violation', placement: { candle: 2, amount: 0 }, expected: 'REJECTED', reason: 'WICK_TOUCHED_FORBIDDEN_NEXT_LEVEL' },
  { id: '7', description: 'multiple candles touching', placement: [{ candle: 0, amount: 0 }, { candle: 1, amount: 0 }, { candle: 2, amount: 0 }], expected: 'REJECTED', reason: 'WICK_TOUCHED_FORBIDDEN_NEXT_LEVEL' },
  { id: '8', description: 'Candle 3 closes exactly at level', placement: { candle: 2, amount: 0 }, closeOffset: 15, expected: 'REJECTED', reason: 'WICK_TOUCHED_FORBIDDEN_NEXT_LEVEL' },
  { id: '9', description: 'Candle 3 closes one tick beyond', placement: { candle: 2, amount: 0 }, closeOffset: 15.25, expected: 'ACCEPTED' },
  { id: '10', description: 'Candle 3 crosses one level', closePrice: { LONG: 5015, SHORT: 4985 }, expected: 'ACCEPTED' },
  { id: '11', description: 'Candle 3 crosses two levels', closePrice: { LONG: 5025, SHORT: 4975 }, expected: 'ACCEPTED' },
  { id: '12', description: 'Candle 3 crosses three levels', closePrice: { LONG: 5035, SHORT: 4965 }, expected: 'ACCEPTED' },
  { id: '13', description: 'candle wick crosses multiple levels but close does not', placement: { candle: 1, amount: 0 }, expected: 'REJECTED', reason: 'WICK_TOUCHED_FORBIDDEN_NEXT_LEVEL' },
  { id: '14', description: 'candle wick touches a level already legitimately broken', placement: { candle: 2, amount: -20 }, expected: 'ACCEPTED' },
  { id: '15', description: 'final next level untouched', expected: 'ACCEPTED' },
  { id: '16', description: 'no next level', levels: [{ id: 'a', price: 5000, active: true }, { id: 'b', price: 5010, active: true }, { id: 'c', price: 5020, active: true }], expected: 'ACCEPTED' },
  { id: '17', description: 'levels exactly one tick apart where valid', levelsBySide: { LONG: [{ id: 'a', price: 5000, active: true }, { id: 'b', price: 5010, active: true }, { id: 'c', price: 5010.25, active: true }, { id: 'd', price: 5010.5, active: true }], SHORT: [{ id: 'a', price: 5000, active: true }, { id: 'b', price: 4990, active: true }, { id: 'c', price: 4989.75, active: true }, { id: 'd', price: 4989.5, active: true }] }, closePrice: { LONG: 5010.4, SHORT: 4989.6 }, expected: 'REJECTED', reason: 'INSUFFICIENT_BREATHING_ROOM' },
  { id: '18', description: 'boundary equality', placement: { candle: 2, amount: 0 }, closeOffset: 15, expected: 'REJECTED', reason: 'WICK_TOUCHED_FORBIDDEN_NEXT_LEVEL' }
];

for (const side of ['LONG', 'SHORT'] as const) {
  describe(`${side} three-candle wick rule matrix`, () => {
    for (const matrixCase of sharedCases) {
      it(`${matrixCase.id}: ${matrixCase.description}`, () => {
        const result = run(side, matrixCase);
        expect(result.accepted ? 'ACCEPTED' : 'REJECTED', `${side}-${matrixCase.id} actual=${actual(result)} plan=${JSON.stringify(result.tradePlan)} explanation=${result.explanation}`).toBe(matrixCase.expected);
        if (matrixCase.reason) expect(result.reasons[0]?.code).toBe(matrixCase.reason);
      });
    }
  });
}
