import { describe, expect, it } from 'vitest';
import {
  MemoryRiskStateStore,
  TradingRiskState,
  type TradingDayResolver
} from '@es-trading/risk';

const resolver: TradingDayResolver = { resolve: (timestamp) => timestamp.toISOString().slice(0, 10) };
const at = (value: string) => new Date(value);

function state(store = new MemoryRiskStateStore()) {
  return new TradingRiskState({ tradingDayResolver: resolver, stateStore: store });
}

describe('runtime trading eligibility and daily risk', () => {
  it.each([
    ['15:59:59', true],
    ['16:00:00', false],
    ['16:30:00', false]
  ])('allows new trades before 16:00 and rejects %s at or after cutoff', (time, expected) => {
    expect(state().eligibility(at(`2026-09-10T${time}-04:00`)).tradingWindowOpen).toBe(expected);
  });

  it('wins do not lock new entries', () => {
    const risk = state();
    risk.recordRealizedTrade({ result: 'WIN', pnl: 500, timestamp: at('2026-09-10T15:00:00-04:00') });
    expect(risk.eligibility(at('2026-09-10T15:30:00-04:00')).canOpenNewTrade).toBe(true);
  });

  it('the first realized losing trade locks new entries', () => {
    const risk = state();
    risk.recordRealizedTrade({ result: 'LOSS', pnl: -1, timestamp: at('2026-09-10T15:00:00-04:00') });
    expect(risk.eligibility(at('2026-09-10T15:30:00-04:00'))).toMatchObject({ dailyLossLocked: true, canOpenNewTrade: false });
  });

  it('break-even does not lock new entries', () => {
    const risk = state();
    risk.recordRealizedTrade({ result: 'BREAKEVEN', pnl: 0, timestamp: at('2026-09-10T15:00:00-04:00') });
    expect(risk.eligibility(at('2026-09-10T15:30:00-04:00')).canOpenNewTrade).toBe(true);
  });

  it('restores lockout after restart', () => {
    const store = new MemoryRiskStateStore();
    state(store).recordRealizedTrade({ result: 'LOSS', pnl: -25, timestamp: at('2026-09-10T15:00:00-04:00') });
    const restarted = state(store);
    expect(restarted.eligibility(at('2026-09-10T15:30:00-04:00')).dailyLossLocked).toBe(true);
  });

  it('resets only when the injected resolver returns a new trading day', () => {
    const risk = state();
    risk.recordRealizedTrade({ result: 'LOSS', pnl: -25, timestamp: at('2026-09-10T15:00:00Z') });
    expect(risk.eligibility(at('2026-09-10T23:59:59Z')).dailyLossLocked).toBe(true);
    expect(risk.eligibility(at('2026-09-11T15:00:00Z'))).toMatchObject({ tradingDay: '2026-09-11', dailyLossLocked: false, canOpenNewTrade: true });
  });

  it('does not invent a boundary when the resolver groups timestamps differently', () => {
    const sessionResolver: TradingDayResolver = { resolve: (timestamp) => timestamp < at('2026-09-11T18:00:00Z') ? 'session-a' : 'session-b' };
    const risk = new TradingRiskState({ tradingDayResolver: sessionResolver, stateStore: new MemoryRiskStateStore() });
    risk.recordRealizedTrade({ result: 'LOSS', pnl: -25, timestamp: at('2026-09-10T20:00:00Z') });
    expect(risk.eligibility(at('2026-09-11T17:59:59Z')).dailyLossLocked).toBe(true);
    expect(risk.eligibility(at('2026-09-11T18:00:00Z')).dailyLossLocked).toBe(false);
  });
});