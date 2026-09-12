import { describe, expect, it } from 'vitest';
import { TopstepXExecutionProvider, TopstepXRestAdapter } from '@es-trading/topstepx';
import type { TradingDecision } from '@es-trading/shared';

type ResponseData = { readonly status?: number; readonly payload: unknown };

function fakeHttp(responses: readonly ResponseData[]) {
  const calls: Array<{ url: string; body: string }> = [];
  let index = 0;
  const http = async (url: string, init?: RequestInit) => {
    calls.push({ url, body: String(init?.body ?? '') });
    const response = responses[index++];
    if (!response) throw new Error('Unexpected TopstepX request.');
    return {
      ok: true,
      status: response.status ?? 200,
      json: async () => response.payload,
      text: async () => JSON.stringify(response.payload)
    };
  };
  return { http, calls };
}

function adapterWith(responses: readonly ResponseData[]) {
  const fake = fakeHttp(responses);
  const adapter = new TopstepXRestAdapter({ baseUrl: 'https://topstepx.test', username: 'user', apiKey: 'key', accountId: '1' }, fake.http);
  return { adapter, ...fake };
}

describe('active TopstepX integration is /ES-only', () => {
  it('rejects a configured non-ES contract before making a request', () => {
    expect(() => new TopstepXRestAdapter({ baseUrl: 'https://topstepx.test', username: 'user', apiKey: 'key', accountId: '1', contractId: 'MES' }, async () => { throw new Error('network must not be called'); })).toThrow('/ES');
  });

  it('accepts only the standard active ES contract and requests 15-minute historical candles', async () => {
    const { adapter, calls } = adapterWith([
      { payload: { success: true, token: 'token' } },                                              // 1. Auth login returns token
      { payload: { success: true, accounts: [{ id: 1, name: 'practice', canTrade: true, isVisible: true, simulated: true }] } }, // 2. Account search returns practice account
      { payload: { success: true, contracts: [{ id: 'es-dec', name: 'ES', description: 'E-mini S&P 500 December', tickSize: 0.25, activeContract: true, symbolId: 'F.US.EP' }] } }, // 3. Contract search returns /ES contract
      { payload: { success: true, bars: [{ t: '2026-09-11T13:00:00Z', o: 5000, h: 5002, l: 4999, c: 5001, v: 10, symbol: '/ES', contractId: 'es-dec' }] } } // 4. Historical candles (uses 't' for timestamp)
    ]);

    await adapter.connect();
    const candles = await adapter.historicalCandles(100);

    expect(candles[0]).toMatchObject({ symbol: '/ES', timeframe: '15m', open: 5000, close: 5001, isClosed: true });
    // Verify the historicalCandles request includes required parameters
    const histCall = calls.find((c) => c.url.includes('/api/History/retrieveBars'));
    expect(histCall).toBeDefined();
    const histBody = JSON.parse(histCall!.body);
    expect(histBody.contractId).toBe('es-dec');
    expect(histBody.live).toBe(false);
    expect(histBody.unit).toBe(2);
    expect(histBody.unitNumber).toBe(15);
  });

  it('rejects non-ES realtime bars and closes an ES position at the next level', async () => {
    const { adapter, calls } = adapterWith([
      { payload: { success: true, token: 'token' } },                                              // 1. Auth login returns token
      { payload: { success: true, accounts: [{ id: 1, name: 'practice', canTrade: true, isVisible: true, simulated: true }] } }, // 2. Account search returns practice account
      { payload: { success: true, contracts: [{ id: 'es-dec', name: 'ES', description: 'E-mini S&P 500 December', tickSize: 0.25, activeContract: true, symbolId: 'F.US.EP' }] } }, // 3. Contract search returns /ES contract
      { payload: { success: true, orderId: 'order-1' } },                                          // 4. Place order
      { payload: { success: true } },                                                              // 5. Cancel order
      { payload: { success: true } }                                                               // 6. Close position
    ]);
    await adapter.connect();
    const execution = new TopstepXExecutionProvider(adapter, false);  // dryRun=false to enable order execution
    const decision: TradingDecision = {
      action: 'ENTER_LONG',
      generatedAt: new Date('2026-09-11T13:00:00Z'),
      evaluation: {
        tradePlan: {
          side: 'LONG',
          entryPrice: 5001,
          stopPrice: 4991,
          targetPrice: 5011,
          playedLevel: { id: 'level-1', price: 5000, active: true },
          nextRelevantLevel: { id: 'level-2', price: 5005, active: true },
          breathingRoomPoints: 5,
          candleTimestamps: [new Date(1), new Date(2), new Date(3)],
          emaFast: 5010,
          emaSlow: 5000,
          explanation: 'test',
          reasonCodes: []
        }
      }
    };

    await execution.execute(decision);
    await execution.onMarketBar?.({ instrument: '/ES', timestamp: new Date(), open: 5001, high: 5005, low: 5000, close: 5004, volume: 1 });

    expect(calls.map((call) => call.url)).toEqual([
      'https://topstepx.test/api/Auth/loginKey',
      'https://topstepx.test/api/Account/search',
      'https://topstepx.test/api/Contract/search',
      'https://topstepx.test/api/Order/place',
      'https://topstepx.test/api/Order/cancel',
      'https://topstepx.test/api/Position/closeContract'
    ]);
    await expect(execution.onMarketBar?.({ instrument: '/NQ', timestamp: new Date(), open: 0, high: 0, low: 0, close: 0, volume: 1 } as unknown as Parameters<NonNullable<typeof execution.onMarketBar>>[0])).rejects.toThrow('/ES');
  });
});