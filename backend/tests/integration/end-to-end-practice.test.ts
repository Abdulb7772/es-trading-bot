import { afterEach, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { createApiServer, listenApiServer } from '../../apps/engine/src/http';
import { strategyConfigSchema } from '@es-trading/shared';
import type { Candle, SupportResistanceLevel } from '@es-trading/shared';
import { FakeExecutionProvider, FakeMarketDataProvider, MarketRuntime } from '@es-trading/market';
import { ReplayMarketDataProvider, SimulationEngine } from '@es-trading/simulation';
import { MemoryRiskStateStore, TradingRiskState } from '@es-trading/risk';
import { RuntimeRecoveryCoordinator, MemoryRecoveryStateStore, type RecoveryProvider } from '@es-trading/market';

let server: Server | undefined;

const config = strategyConfigSchema.parse({
  symbol: '/ES', timeframe: '15m', tradingTimezone: 'America/New_York', noNewTradesAtOrAfter: '16:00', levels: { source: 'manual_input' }
});
const levels: readonly SupportResistanceLevel[] = [
  { id: 'support', price: 5000, active: true },
  { id: 'resistance-1', price: 5010, active: true },
  { id: 'resistance-2', price: 5020, active: true },
  { id: 'resistance-3', price: 5030, active: true },
  { id: 'resistance-4', price: 5040, active: true }
];

function candle(index: number, open: number, close: number, high = Math.max(open, close), low = Math.min(open, close)): Candle {
  return { timestamp: new Date(`2026-09-10T${String(13 + Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}:00.000Z`), open, high, low, close, symbol: '/ES', timeframe: '15m', isClosed: true };
}

async function api(path: string, init?: { method?: string; body?: string }): Promise<{ status: number; body: unknown }> {
  const address = server?.address();
  if (!address || typeof address === 'string') throw new Error('API server is not listening.');
  const response = await globalThis.fetch(`http://127.0.0.1:${address.port}${path}`, { ...init, headers: { 'content-type': 'application/json' } });
  return { status: response.status, body: await response.json() };
}

function objectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null) throw new Error('Expected an object API response.');
  return body as Record<string, unknown>;
}

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()));
  server = undefined;
});

describe('complete local practice path', () => {
  it('connects API, market runtime, EMA, levels, strategy, execution, protection, exit, P/L, lockout, and dashboard APIs', async () => {
    server = await listenApiServer(createApiServer(), 0);
    expect((await api('/health')).status).toBe(200);
    expect(objectBody((await api('/api/config')).body).symbol).toBe('/ES');
    const updatedLevels = objectBody((await api('/api/levels', { method: 'PUT', body: JSON.stringify({ levels: levels.map((level) => level.price) }) })).body).levels as Array<{ price: number }>;
    expect(updatedLevels.map((level) => level.price)).toEqual(levels.map((level) => level.price));

    const bootstrap = Array.from({ length: 21 }, (_, index) => candle(index, 5000, 5000));
    const provider = new FakeMarketDataProvider(bootstrap);
    const execution = new FakeExecutionProvider();
    const runtime = new MarketRuntime({ provider, execution, levels, config });
    await runtime.start();
    provider.emit({ type: 'bar', id: 'bar-1', bar: { instrument: '/ES', timestamp: new Date('2026-09-10T19:00:01Z'), open: 5000, high: 5005, low: 5000, close: 5005, volume: 1 } });
    provider.emit({ type: 'bar', id: 'bar-2', bar: { instrument: '/ES', timestamp: new Date('2026-09-10T19:15:01Z'), open: 5005, high: 5005, low: 5002, close: 5002, volume: 1 } });
    provider.emit({ type: 'bar', id: 'bar-3', bar: { instrument: '/ES', timestamp: new Date('2026-09-10T19:30:01Z'), open: 5002, high: 5025, low: 5002, close: 5025, volume: 1 } });
    await runtime.stop();
    expect(runtime.snapshot().candles.every((item) => item.symbol === '/ES' && item.isClosed)).toBe(true);
    expect(execution.decisions.every((decision) => decision.action === 'ENTER_LONG')).toBe(true);

    const simulationCandles = [...bootstrap, candle(21, 5000, 5005), candle(22, 5005, 5002), candle(23, 5002, 5025), candle(24, 5025, 5035)];
    const risk = new TradingRiskState({ tradingDayResolver: { resolve: (timestamp) => timestamp.toISOString().slice(0, 10) }, stateStore: new MemoryRiskStateStore() });
    const simulation = await new SimulationEngine().run({ market: new ReplayMarketDataProvider(simulationCandles), levels, config, initialState: { startingBalance: 50_000, dailyLossLimit: 1_000, pointValue: 50 }, riskState: risk });
    expect(simulation.acceptedSetups).toHaveLength(1);
    expect(simulation.trades[0]?.stopPrice).toBe(5015);
    expect(simulation.trades[0]?.targetPrice).toBe(5030);
    expect(simulation.trades[0]?.exit.reason).toBe('TARGET');
    expect(simulation.totalPnl).toBe(250);
    expect(simulation.lockedOut).toBe(false);

    const dashboard = await api('/api/status');
    expect(objectBody(dashboard.body).tradingEnabled).toBe(false);
    expect(objectBody((await api('/api/market')).body).symbol).toBe('/ES');
  });

  it('verifies loss lockout, cutoff, restart recovery, disconnect recovery, and duplicate prevention', async () => {
    const lossRisk = new TradingRiskState({ tradingDayResolver: { resolve: (timestamp) => timestamp.toISOString().slice(0, 10) }, stateStore: new MemoryRiskStateStore() });
    lossRisk.recordRealizedTrade({ result: 'LOSS', pnl: -500, timestamp: new Date('2026-09-10T19:00:00Z') });
    expect(lossRisk.eligibility(new Date('2026-09-10T19:30:00Z')).canOpenNewTrade).toBe(false);
    expect(lossRisk.eligibility(new Date('2026-09-10T20:00:00Z')).tradingWindowOpen).toBe(false);

    const recoveryStore = new MemoryRecoveryStateStore();
    const provider: RecoveryProvider = {
      authenticate: async () => undefined,
      verifyPracticeAccount: async () => true,
      verifyEsContract: async () => true,
      queryPosition: async () => null,
      queryWorkingOrders: async () => [],
      bootstrapMarket: async () => [],
      reconnectRealtime: async () => undefined
    };
    const recovered = new RuntimeRecoveryCoordinator({ provider, stateStore: recoveryStore, restoreDailyLossLocked: () => true, restoreProcessedSetupIds: () => ['setup-1'], reconcile: () => true });
    expect((await recovered.start()).state).toBe('READY');
    expect(recovered.snapshot().dailyLossLocked).toBe(true);
    expect(recovered.snapshot().processedSetupIds).toEqual(['setup-1']);
    recovered.markSetupProcessed('setup-1');
    expect(recovered.snapshot().processedSetupIds).toEqual(['setup-1']);
    recovered.markDisconnected();
    expect(recovered.snapshot().state).toBe('DISCONNECTED');
  });
});
