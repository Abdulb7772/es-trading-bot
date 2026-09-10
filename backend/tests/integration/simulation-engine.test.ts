import { describe, expect, it } from 'vitest';
import { strategyConfigSchema } from '@es-trading/shared';
import type { Candle, SupportResistanceLevel } from '@es-trading/shared';
import {
  DeterministicSimulationClock,
  DeterministicSimulationExecutionProvider,
  ReplayMarketDataProvider,
  SimulationEngine
} from '@es-trading/simulation';

const config = strategyConfigSchema.parse({
  symbol: '/ES', timeframe: '15m', tradingTimezone: 'America/New_York', noNewTradesAtOrAfter: '16:00', levels: { source: 'manual_input' }
});
const levels: readonly SupportResistanceLevel[] = [
  { id: 'support', price: 5000, active: true },
  { id: 'resistance-1', price: 5010, active: true },
  { id: 'resistance-2', price: 5020, active: true },
  { id: 'resistance-3', price: 5030, active: true }
];

function candle(index: number, open: number, close: number, high = Math.max(open, close), low = Math.min(open, close)): Candle {
  return { timestamp: new Date(`2026-09-10T${String(13 + Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}:00.000Z`), open, high, low, close, symbol: '/ES', timeframe: '15m', isClosed: true };
}

function replay(candles: readonly Candle[], initialState = { startingBalance: 10_000, dailyLossLimit: 1_000, pointValue: 50 }) {
  return new SimulationEngine().run({ market: new ReplayMarketDataProvider(candles), levels, config, initialState });
}

describe('simulation engine', () => {
  it('replays deterministically and uses production EMA and strategy evaluation', async () => {
    const candles = [
      ...Array.from({ length: 21 }, (_, index) => candle(index, 5000, 5000)),
      candle(21, 5000, 5005), candle(22, 5005, 5002), candle(23, 5002, 5025), candle(24, 5025, 5035)
    ];
    const first = await replay(candles);
    const second = await replay(candles);

    expect(first).toEqual(second);
    expect(first.acceptedSetups).toHaveLength(1);
    expect(first.trades[0]?.exit.reason).toBe('TARGET');
    expect(first.trades[0]?.exit.pnl).toBe(250);
    expect(first.diagnostics.candlesProcessed).toBe(25);
  });

  it('settles stops and locks out after the configured daily loss', async () => {
    const candles = [
      ...Array.from({ length: 21 }, (_, index) => candle(index, 5000, 5000)),
      candle(21, 5000, 5005), candle(22, 5005, 5002), candle(23, 5002, 5025, 5025, 4990),
      candle(24, 5025, 5010, 5025, 5005), candle(25, 5000, 5005), candle(26, 5005, 5002), candle(27, 5002, 5025)
    ];
    const result = await replay(candles, { startingBalance: 10_000, dailyLossLimit: 500, pointValue: 50 });

    expect(result.trades[0]?.exit.reason).toBe('STOP');
    expect(result.trades[0]?.exit.pnl).toBe(-500);
    expect(result.lockedOut).toBe(true);
    expect(result.evaluations.at(-1)?.decision.evaluation.reasons[0]?.code).toBe('DAILY_LOSS_LOCKOUT');
  });

  it('keeps replay clock monotonic and execution provider deterministic', () => {
    const clock = new DeterministicSimulationClock(new Date(1_000));
    clock.advanceTo(new Date(2_000));
    expect(clock.now()).toEqual(new Date(2_000));
    expect(() => clock.advanceTo(new Date(1_000))).toThrow('cannot move backwards');

    const execution = new DeterministicSimulationExecutionProvider(50);
    const plan = { side: 'LONG' as const, entryPrice: 5000, stopPrice: 4990, targetPrice: 5010, playedLevel: levels[0], nextRelevantLevel: levels[1], breathingRoomPoints: 10, candleTimestamps: [new Date(1), new Date(2), new Date(3)] as [Date, Date, Date], emaFast: 100, emaSlow: 90, explanation: '', reasonCodes: [] };
    const position = execution.open(plan, candle(1, 5000, 5000));
    expect(execution.settle(position, candle(2, 5000, 5010))).toMatchObject({ reason: 'TARGET', pnl: 500 });
  });
});