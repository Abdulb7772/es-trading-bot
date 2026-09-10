import { strategyConfigSchema } from '@es-trading/shared';
import type { Candle, SupportResistanceLevel } from '@es-trading/shared';
import { ReplayMarketDataProvider, type SimulationInput } from './index';

const candle = (day: number, open: number, close: number, high = Math.max(open, close), low = Math.min(open, close)): Candle => ({
  timestamp: new Date(`2026-09-${String(day).padStart(2, '0')}T14:00:00.000Z`),
  open,
  high,
  low,
  close,
  symbol: '/ES',
  timeframe: '15m',
  isClosed: true
});

export const simulationFixture: SimulationInput = {
  market: new ReplayMarketDataProvider([
    ...Array.from({ length: 21 }, (_, index) => candle(index + 1, 5000, 5000)),
    candle(22, 5000, 5005), candle(23, 5005, 5002), candle(24, 5002, 5025),
    candle(25, 5025, 5035)
  ]),
  levels: [
    { id: 'support', price: 5000, active: true },
    { id: 'resistance-1', price: 5010, active: true },
    { id: 'resistance-2', price: 5020, active: true },
    { id: 'resistance-3', price: 5030, active: true },
    { id: 'resistance-4', price: 5040, active: true }
  ] satisfies readonly SupportResistanceLevel[],
  config: strategyConfigSchema.parse({
    symbol: '/ES', timeframe: '15m', tradingTimezone: 'America/New_York', noNewTradesAtOrAfter: '16:00', levels: { source: 'manual_input' }
  }),
  initialState: { startingBalance: 50_000, dailyLossLimit: 1_000, pointValue: 50 }
};