import { describe, expect, it } from 'vitest';
import { strategyConfigSchema } from '@es-trading/shared';
import type { Candle } from '@es-trading/shared';
import {
  CandleBuilder,
  FakeExecutionProvider,
  FakeMarketDataProvider,
  MarketRuntime,
  type MarketBar
} from '@es-trading/market';

const bar = (id: string, timestamp: string, open: number, close: number, instrument: '/ES' | '/NQ' = '/ES'): { id: string; type: 'bar'; bar: MarketBar } => ({
  id,
  type: 'bar',
  bar: { instrument, timestamp: new Date(timestamp), open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 1 } as unknown as MarketBar
});

const config = strategyConfigSchema.parse({
  symbol: '/ES', timeframe: '15m', tradingTimezone: 'America/New_York', noNewTradesAtOrAfter: '16:00', levels: { source: 'manual_input' }
});

function candle(timestamp: string, close = 5000): Candle {
  return { timestamp: new Date(timestamp), open: close, high: close, low: close, close, symbol: '/ES', timeframe: '15m', isClosed: true };
}

describe('provider-independent realtime market runtime', () => {
  it('builds completed candles in chronological order and rejects non-/ES bars', () => {
    const builder = new CandleBuilder({ timeframeMinutes: 15 });
    expect(builder.update(bar('a', '2026-09-10T13:00:01Z', 5000, 5001).bar)).toBeNull();
    expect(builder.update(bar('b', '2026-09-10T13:14:59Z', 5001, 5002).bar)).toBeNull();
    const completed = builder.update(bar('c', '2026-09-10T13:15:00Z', 5002, 5003).bar);
    expect(completed).toMatchObject({ open: 5000, high: 5002, low: 5000, close: 5002, volume: 2, isClosed: true });
    expect(() => builder.update(bar('bad', '2026-09-10T13:30:00Z', 5003, 5004, '/NQ').bar)).toThrow('/ES');
    expect(() => builder.update(bar('late', '2026-09-10T13:00:00Z', 5003, 5004).bar)).toThrow('chronological');
  });

  it('bootstraps before live events, ignores duplicate event ids, and serializes events', async () => {
    const provider = new FakeMarketDataProvider([candle('2026-09-10T13:00:00Z')]);
    const execution = new FakeExecutionProvider();
    const runtime = new MarketRuntime({ provider, execution, levels: [], config, timeframeMinutes: 15 });
    await runtime.start();
    provider.emit(bar('duplicate', '2026-09-10T13:15:01Z', 5000, 5001));
    provider.emit(bar('duplicate', '2026-09-10T13:15:02Z', 5001, 5002));
    provider.emit(bar('next', '2026-09-10T13:30:01Z', 5002, 5003));
    await runtime.idle();

    const snapshot = runtime.snapshot();
    expect(snapshot.candles).toHaveLength(2);
    expect(snapshot.events.map((event) => event.sequence)).toEqual(snapshot.events.map((_, index) => index + 1));
    expect(snapshot.events.find((event) => event.type === 'market.connected')).toBeDefined();
    expect(snapshot.events.find((event) => event.type === 'candle.completed')).toBeDefined();

    await runtime.stop();
    expect(runtime.snapshot().events.at(-1)?.type).toBe('runtime.stopped');
  });

  it('supports reconnect lifecycle events and does not execute incomplete candles', async () => {
    const provider = new FakeMarketDataProvider();
    const execution = new FakeExecutionProvider();
    const runtime = new MarketRuntime({ provider, execution, levels: [], config });
    await runtime.start();
    provider.emit({ type: 'disconnected', at: new Date('2026-09-10T13:00:00Z'), reason: 'test' });
    provider.emit({ type: 'connected', at: new Date('2026-09-10T13:01:00Z') });
    provider.emit(bar('one', '2026-09-10T13:00:00Z', 5000, 5001));
    await runtime.idle();
    expect(runtime.snapshot().events.filter((event) => event.type === 'market.disconnected' || event.type === 'market.connected')).toHaveLength(3);
    expect(execution.decisions).toHaveLength(0);
    await runtime.stop();
  });
});