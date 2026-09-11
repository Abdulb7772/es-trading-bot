import { describe, expect, it } from 'vitest';
import { evaluateStrategy } from '@es-trading/strategy';
import { strategyConfigSchema } from '@es-trading/shared';
import type { Candle, StrategyInput } from '@es-trading/shared';

const config = strategyConfigSchema.parse({ symbol: '/ES', timeframe: '15m', tradingTimezone: 'America/New_York', noNewTradesAtOrAfter: '16:00', levels: { source: 'manual_input' } });
const levels = [{ id: 'support', price: 5000, active: true }, { id: 'resistance', price: 5010, active: true }];
function candle(day: number, open: number, close: number): Candle { return { timestamp: new Date(`2026-09-${day}T14:00:00Z`), open, high: Math.max(open, close), low: Math.min(open, close), close, symbol: '/ES', timeframe: '15m', isClosed: true }; }
function validInput(eligibility: StrategyInput['eligibility']): StrategyInput { return { candles: [candle(1, 5000, 5005), candle(2, 5005, 5002), candle(3, 5002, 5005)], levels, indicators: { emaFast: 100, emaSlow: 90 }, config, eligibility }; }

describe('bot first-loss entry gating', () => {
  it('rejects one valid setup after the first loss', () => {
    const result = evaluateStrategy(validInput({ canOpenNewTrade: false, dailyLossLocked: true, tradingWindowOpen: true, realizedPnl: -25, lockReason: 'First losing trade of the trading day.', lockTriggeredAt: '2026-09-10T15:00:00.000Z' }));
    expect(result.action).toBe('NO_TRADE');
    expect(result.evaluation.accepted).toBe(false);
    expect(result.evaluation.reasons[0]).toMatchObject({ code: 'DAILY_LOSS_LOCKOUT', details: { realizedPnl: -25 } });
  });

  it('rejects multiple valid setups after the first loss', () => {
    const eligibility = { canOpenNewTrade: false, dailyLossLocked: true, tradingWindowOpen: true, realizedPnl: -25, lockReason: 'First losing trade of the trading day.', lockTriggeredAt: '2026-09-10T15:00:00.000Z' };
    const first = evaluateStrategy(validInput(eligibility));
    const second = evaluateStrategy({ ...validInput(eligibility), candles: [candle(4, 5000, 5005), candle(5, 5005, 5002), candle(6, 5002, 5005)] });
    expect(first.action).toBe('NO_TRADE');
    expect(second.action).toBe('NO_TRADE');
    expect(first.evaluation.reasons[0]?.code).toBe('DAILY_LOSS_LOCKOUT');
    expect(second.evaluation.reasons[0]?.code).toBe('DAILY_LOSS_LOCKOUT');
  });
});
