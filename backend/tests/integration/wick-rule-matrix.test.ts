import { describe, expect, it } from 'vitest';
import { evaluateLongSetup, evaluateShortSetup } from '@es-trading/strategy';
import { strategyConfigSchema } from '@es-trading/shared';
import type { Candle, StrategyInput, SupportResistanceLevel } from '@es-trading/shared';

const config = strategyConfigSchema.parse({
  symbol: '/ES',
  timeframe: '15m',
  tradingTimezone: 'America/New_York',
  noNewTradesAtOrAfter: '16:00',
  levels: { source: 'manual_input' }
});
const longLevels: readonly SupportResistanceLevel[] = [
  { id: 'l0', price: 5000, active: true },
  { id: 'l1', price: 5010, active: true },
  { id: 'l2', price: 5020, active: true },
  { id: 'l3', price: 5030, active: true },
  { id: 'l4', price: 5040, active: true }
];
const shortLevels: readonly SupportResistanceLevel[] = [
  { id: 's0', price: 4960, active: true },
  { id: 's1', price: 4970, active: true },
  { id: 's2', price: 4980, active: true },
  { id: 's3', price: 4990, active: true },
  { id: 's4', price: 5000, active: true }
];

function makeCandle(side: TradingSide, index: number, placement: any, closeOffset: number, closePrice: any): Candle {
  const long = side === 'LONG';
  const base = long ? [5000, 5005, 5002] : [5000, 4995, 4998];
  const close = long ? [5005, 5002, 5025][index] : [4995, 4998, 4975][index];
  const touchAmount = (Array.isArray(placement) ? placement : placement ? [placement] : []).filter((item: any) => item.candle === index).reduce((result: number, item: any) => result + item.amount, 0);
  const finalClose = index === 2 ? closePrice ?? close + (long ? closeOffset : -closeOffset) : close;
  const defaultHigh = Math.max(base[index], finalClose);
  const defaultLow = Math.min(base[index], finalClose);
  const hasTouch = (Array.isArray(placement) ? placement : placement ? [placement] : []).some((item: any) => item.candle === index);
  const wickExtension = hasTouch ? touchAmount : 0;
  return {
    timestamp: new Date('2026-09-11T14:00:00.000Z'),
    open: base[index],
    high: long ? Math.max(defaultHigh, 5030 + wickExtension) : defaultHigh,
    low: long ? defaultLow : Math.min(defaultLow, 4970 - wickExtension),
    close: finalClose,
    symbol: '/ES',
    timeframe: '15m',
    isClosed: true
  };
}

type WickPlacement = { candle: number; amount: number };
type MatrixCase = { id: string; description: string; placement?: WickPlacement | WickPlacement[]; closeOffset?: number; closePrice?: { LONG: number; SHORT: number }; levels?: SupportResistanceLevel[]; levelsBySide?: { LONG: SupportResistanceLevel[]; SHORT: SupportResistanceLevel[] }; expected: 'ACCEPTED' | 'REJECTED'; reason?: string; side?: 'LONG' | 'SHORT' };

function run(side: TradingSide, matrixCase: MatrixCase): SetupEvaluation {
  const candles = [0, 1, 2].map((idx: number) => makeCandle(side, idx, matrixCase.placement, matrixCase.closeOffset ?? 0, idx === 2 ? matrixCase.closePrice?.[side] : undefined));
  const input: StrategyInput = { candles, levels: matrixCase.levelsBySide?.[side] ?? matrixCase.levels ?? (side === 'LONG' ? longLevels : shortLevels), indicators: side === 'LONG' ? { emaFast: 100, emaSlow: 90 } : { emaFast: 90, emaSlow: 100 }, config };
  return side === 'LONG' ? evaluateLongSetup(input) : evaluateShortSetup(input);
}

function actual(evaluation: SetupEvaluation): string {
  return evaluation.accepted ? 'ACCEPTED' : 'REJECTED:' + (evaluation.reasons[0]?.code ?? 'UNKNOWN');
}

const wickCases: MatrixCase[] = [
  { id: '1', description: 'C1 wick touches next, C3 not close beyond', placement: { candle: 0, amount: 0 }, expected: 'REJECTED', reason: 'LONG_WICK_NEXT_LEVEL_NOT_CLOSED', side: 'LONG' },
  { id: '2', description: 'C2 wick touches next, C3 not close beyond', placement: { candle: 1, amount: 0 }, expected: 'REJECTED', reason: 'LONG_WICK_NEXT_LEVEL_NOT_CLOSED', side: 'LONG' },
  { id: '3', description: 'C3 wick touches next, C3 not close beyond', placement: { candle: 2, amount: 0 }, expected: 'REJECTED', reason: 'LONG_WICK_NEXT_LEVEL_NOT_CLOSED', side: 'LONG' },
  { id: '4', description: 'C3 closes beyond touched level', closeOffset: 5, expected: 'ACCEPTED', side: 'LONG' },
  { id: '5', description: 'C3 crosses 2 levels beyond', closePrice: { LONG: 5025, SHORT: 4975 }, expected: 'ACCEPTED' },
  { id: '6', description: 'C3 crosses 3 levels beyond', closePrice: { LONG: 5035, SHORT: 4965 }, expected: 'ACCEPTED' },
  { id: '7', description: 'C3 wick 3rd, close between 2nd/3rd', placement: { candle: 2, amount: 0 }, closeOffset: 5, expected: 'REJECTED', reason: 'LONG_WICK_NEXT_LEVEL_NOT_CLOSED', side: 'LONG' },
  { id: '8', description: 'Wick exactly touches level', placement: { candle: 2, amount: 0 }, expected: 'REJECTED', reason: 'LONG_WICK_NEXT_LEVEL_NOT_CLOSED', side: 'LONG' },
  { id: '9', description: 'C3 closes exactly at level', closePrice: { LONG: 5030, SHORT: 4970 }, expected: 'REJECTED', reason: 'LONG_WICK_NEXT_LEVEL_NOT_CLOSED', side: 'LONG' },
  { id: '10', description: 'Short C1 wick touches next', placement: { candle: 0, amount: 0 }, expected: 'REJECTED', reason: 'SHORT_WICK_NEXT_LEVEL_NOT_CLOSED', side: 'SHORT' },
  { id: '11', description: 'Short C2 wick touches next', placement: { candle: 1, amount: 0 }, expected: 'REJECTED', reason: 'SHORT_WICK_NEXT_LEVEL_NOT_CLOSED', side: 'SHORT' },
  { id: '12', description: 'Short C3 wick touches next', placement: { candle: 2, amount: 0 }, expected: 'REJECTED', reason: 'SHORT_WICK_NEXT_LEVEL_NOT_CLOSED', side: 'SHORT' }
];

for (const side of ['LONG', 'SHORT']) {
  describe(side + ' wick rule deterministic test', () => {
    for (const matrixCase of wickCases) {
      if (matrixCase.side && matrixCase.side !== side) continue;
      it(matrixCase.id + ': ' + matrixCase.description, () => {
        const result = run(side, matrixCase);
        expect(actual(result)).toBe(matrixCase.expected);
        if (matrixCase.reason) expect(result.reasons[0]?.code).toBe(matrixCase.reason);
      });
    }
  });
}