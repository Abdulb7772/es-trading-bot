import { strategyConfigSchema, type StrategyConfig } from '@es-trading/shared';

export { strategyConfigSchema };
export type StrategyConfigForm = StrategyConfig;

export const defaultStrategyConfig: StrategyConfigForm = {
  symbol: '/ES',
  timeframe: '15m',
  emaFastPeriod: 9,
  emaSlowPeriod: 21,
  stopPoints: 10,
  targetPoints: 10,
  minimumBreathingRoomPoints: 3,
  quantity: 1,
  tradingTimezone: 'America/New_York',
  noNewTradesAtOrAfter: '16:00',
  levels: { source: 'manual_input', minimumCount: 80, maximumCount: 200, selectionPolicy: 'UNSPECIFIED' }
};

export type StrategyMode = 'SIMULATION' | 'PRACTICE';
