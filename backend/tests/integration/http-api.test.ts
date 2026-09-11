import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Server } from 'node:http';
import { createApiServer, listenApiServer } from '../../apps/engine/src/http';

let server: Server | undefined;

async function request(path: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}): Promise<{ status: number; body: unknown }> {
  const address = server?.address();
  if (!address || typeof address === 'string') throw new Error('Test server is not listening.');
  const response = await globalThis.fetch(`http://127.0.0.1:${address.port}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } });
  return { status: response.status, body: await response.json() };
}

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()));
  server = undefined;
});

describe('local backend HTTP API', () => {
  it('serves health and read-only application DTOs', async () => {
    server = await listenApiServer(createApiServer(), 0);
    const health = await request('/health');
    const status = await request('/api/status');
    const market = await request('/api/market');
    const config = await request('/api/config');
    const levels = await request('/api/levels');
    const daily = await request('/api/daily-state');
    const logs = await request('/api/logs');

    expect(health).toMatchObject({ status: 200, body: { status: 'ok' } });
    expect(status).toMatchObject({ status: 200, body: { engine: 'operational' } });
    expect(market).toMatchObject({ status: 200, body: { symbol: '/ES' } });
    expect(config).toMatchObject({ status: 200, body: { symbol: '/ES' } });
    expect(levels).toMatchObject({ status: 200, body: { id: 'manual-es-levels', levels: [] } });
    expect(daily.status).toBe(200);
    expect(logs).toMatchObject({ status: 200, body: [] });
  });

  it('validates and updates config and levels through application services', async () => {
    server = await listenApiServer(createApiServer(), 0);
    const invalidConfig = await request('/api/config', { method: 'PUT', body: JSON.stringify({ symbol: '/NQ' }) });
    const validConfig = await request('/api/config', { method: 'PUT', body: JSON.stringify({ symbol: '/ES', timeframe: '15m', tradingTimezone: 'America/New_York', noNewTradesAtOrAfter: '16:00', levels: { source: 'manual_input' } }) });
    const validation = await request('/api/levels/validate', { method: 'POST', body: JSON.stringify({ levels: [5000, 5000, 5000.25] }) });
    const updatedLevels = await request('/api/levels', { method: 'PUT', body: JSON.stringify({ levels: Array.from({ length: 80 }, (_, index) => 5000 + index * 0.25) }) });
    const importedLevels = await request('/api/levels/import', { method: 'POST', body: JSON.stringify({ text: readFileSync(resolve(process.cwd(), 'backend/tests/fixtures/es-levels-90.txt'), 'utf8') }) });

    expect(invalidConfig.status).toBe(400);
    expect(validConfig).toMatchObject({ status: 200, body: { timeframe: '15m' } });
    expect(validation).toMatchObject({ status: 200, body: { valid: true, levels: [5000, 5000.25] } });
    expect(updatedLevels.status).toBe(200);
    expect(importedLevels.status).toBe(200);
    const importedBody = importedLevels.body as { levels: Array<{ price: number }> };
    expect(importedBody.levels.map((level) => level.price)).toEqual(expect.arrayContaining([6387.25, 7838.5]));
  });

  it('serves collection/detail routes and simulator routes with validation', async () => {
    server = await listenApiServer(createApiServer(), 0);
    const evaluations = await request('/api/evaluations');
    const evaluation = await request('/api/evaluations/missing');
    const trades = await request('/api/trades');
    const trade = await request('/api/trades/missing');
    const fixtures = await request('/api/simulator/fixtures');
    const invalidSimulation = await request('/api/simulator/run', { method: 'POST', body: JSON.stringify({}) });
    const simulation = await request('/api/simulator/run', { method: 'POST', body: JSON.stringify({ fixtureId: 'local-fixture', config: { symbol: '/ES', timeframe: '15m', emaFastPeriod: 9, emaSlowPeriod: 21, stopPoints: 10, targetPoints: 10, minimumBreathingRoomPoints: 3, quantity: 1, tradingTimezone: 'America/New_York', noNewTradesAtOrAfter: '16:00', levels: { source: 'manual_input', minimumCount: 80, maximumCount: 200, selectionPolicy: 'UNSPECIFIED' } } }) });

    expect(evaluations).toMatchObject({ status: 200, body: [] });
    expect(evaluation.status).toBe(404);
    expect(trades).toMatchObject({ status: 200, body: [] });
    expect(trade.status).toBe(404);
    expect(fixtures).toMatchObject({ status: 200, body: [{ id: 'local-fixture' }] });
    expect(invalidSimulation.status).toBe(400);
    expect(simulation).toMatchObject({ status: 200, body: { fixtureId: 'local-fixture', comparison: 'PASS' } });
  });

  it('returns 404 for unknown routes', async () => {
    server = await listenApiServer(createApiServer(), 0);
    expect(await request('/api/unknown')).toMatchObject({ status: 404, body: { error: 'Route not found.' } });
  });
});