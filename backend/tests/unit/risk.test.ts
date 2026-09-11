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

  it('keeps trading enabled after consecutive profitable trades', () => {
    const risk = state();
    risk.recordRealizedTrade({ result: 'WIN', pnl: 100, timestamp: at('2026-09-10T14:00:00Z') });
    risk.recordRealizedTrade({ result: 'WIN', pnl: 50, timestamp: at('2026-09-10T15:00:00Z') });
    expect(risk.eligibility(at('2026-09-10T15:30:00Z'))).toMatchObject({ dailyLossLocked: false, canOpenNewTrade: true, realizedPnl: 150 });
  });

  it('locks after the first loss and stays locked for every later setup', () => {
    const risk = state();
    risk.recordRealizedTrade({ result: 'WIN', pnl: 100, timestamp: at('2026-09-10T14:00:00Z') });
    risk.recordRealizedTrade({ result: 'LOSS', pnl: -25, timestamp: at('2026-09-10T15:00:00Z') });
    const first = risk.eligibility(at('2026-09-10T15:01:00Z'));
    const second = risk.eligibility(at('2026-09-10T15:30:00Z'));
    expect(first).toMatchObject({ dailyLossLocked: true, canOpenNewTrade: false, lockReason: 'First losing trade of the trading day.' });
    expect(second).toMatchObject({ dailyLossLocked: true, canOpenNewTrade: false });
    expect(first.lockTriggeredAt).toBe(at('2026-09-10T15:00:00Z').toISOString());
  });

  it('unlocks at the next trading day', () => {
    const risk = state();
    risk.recordRealizedTrade({ result: 'LOSS', pnl: -25, timestamp: at('2026-09-10T15:00:00Z') });
    expect(risk.eligibility(at('2026-09-11T10:00:00Z'))).toMatchObject({ tradingDay: '2026-09-11', dailyLossLocked: false, canOpenNewTrade: true, realizedPnl: 0, lockReason: null, lockTriggeredAt: null });
  });

  it('restores a locked day from completed trades after restart', () => {
    const store = new MemoryRiskStateStore();
    const firstProcess = state(store);
    firstProcess.restoreFromTrades([{ pnl: 100, timestamp: at('2026-09-10T14:00:00Z') }, { pnl: -25, timestamp: at('2026-09-10T15:00:00Z') }]);
    const restarted = state(store);
    expect(restarted.eligibility(at('2026-09-10T15:30:00Z'))).toMatchObject({ dailyLossLocked: true, canOpenNewTrade: false, realizedPnl: 75 });
  });

  it('restores unlocked state on restart after the trading day changes', () => {
    const store = new MemoryRiskStateStore();
    state(store).restoreFromTrades([{ pnl: -25, timestamp: at('2026-09-10T15:00:00Z') }]);
    expect(state(store).eligibility(at('2026-09-11T10:00:00Z'))).toMatchObject({ dailyLossLocked: false, canOpenNewTrade: true });
  });
});