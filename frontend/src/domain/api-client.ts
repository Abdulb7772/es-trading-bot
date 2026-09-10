import {
  currentMarketSchema,
  levelSetSchema,
  logEntrySchema,
  simulationResultSchema,
  strategyEvaluationSchema,
  strategyConfigContractSchema,
  systemStatusSchema,
  type CurrentMarket,
  type LevelSet,
  type LogEntry,
  type SimulationRequest,
  type SimulationResult,
  type StrategyConfig,
  type SystemStatus,
  type Trade
} from '@es-trading/shared';
import { z } from 'zod';
import type { DashboardData, Level, MarketSnapshot } from './types';

const fixtureSchema = z.object({ id: z.string(), name: z.string(), description: z.string() });
const API_BASE_URL = 'http://localhost:3001';

export type SimulationFixture = z.infer<typeof fixtureSchema>;

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiRequestInit = { method?: string; headers?: Record<string, string>; body?: string };

async function request<T>(path: string, schema: z.ZodType<T>, init?: ApiRequestInit, retries = init?.method ? 0 : 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await globalThis.fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
        cache: 'no-store'
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new ApiError(response.status, typeof body === 'object' && body !== null && 'error' in body ? String(body.error) : `Request failed with ${response.status}.`);
      return schema.parse(body);
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => globalThis.setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('API request failed.');
}

export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return `Backend request failed (${error.status}): ${error.message}`;
  return 'The local backend is unavailable. Start the engine with API_PORT=3001 and try again.';
}

const tradeSchema = z.object({ id: z.string(), time: z.string(), side: z.enum(['long', 'short']), entry: z.number(), exit: z.number().optional(), contracts: z.number(), pnl: z.number(), status: z.enum(['open', 'closed']) });
export async function getStatus(): Promise<SystemStatus> { return request('/api/status', systemStatusSchema); }
export async function getMarket(): Promise<CurrentMarket> { return request('/api/market', currentMarketSchema); }
export async function getConfig(): Promise<StrategyConfig> { return request('/api/config', strategyConfigContractSchema); }
export async function updateConfig(config: StrategyConfig): Promise<StrategyConfig> { return request('/api/config', strategyConfigContractSchema, { method: 'PUT', body: JSON.stringify(config) }); }
export async function getLevels(): Promise<LevelSet> { return request('/api/levels', levelSetSchema); }
export async function updateLevels(levels: number[]): Promise<LevelSet> { return request('/api/levels', levelSetSchema, { method: 'PUT', body: JSON.stringify({ levels }) }); }
export async function validateLevels(levels: number[]): Promise<{ valid: boolean; levels: number[]; error?: string }> { return request('/api/levels/validate', z.object({ valid: z.boolean(), levels: z.array(z.number()), error: z.string().optional() }), { method: 'POST', body: JSON.stringify({ levels }) }); }
export async function getEvaluations(): Promise<z.infer<typeof strategyEvaluationSchema>[]> { return request('/api/evaluations', z.array(strategyEvaluationSchema)); }
export async function getTrades(): Promise<Trade[]> { return request('/api/trades', z.array(tradeSchema)); }
export async function getLogs(): Promise<LogEntry[]> { return request('/api/logs', z.array(logEntrySchema)); }
export async function getFixtures(): Promise<SimulationFixture[]> { return request('/api/simulator/fixtures', z.array(fixtureSchema)); }
export async function runSimulation(input: SimulationRequest): Promise<SimulationResult> { return request('/api/simulator/run', simulationResultSchema, { method: 'POST', body: JSON.stringify(input) }); }

export async function getDashboardData(): Promise<DashboardData> {
  const [system, market, levelSet, trades] = await Promise.all([getStatus(), getMarket(), getLevels(), getTrades()]);
  const levels: Level[] = levelSet.levels.map((level, index) => ({ id: level.id, label: level.label ?? `Level ${index + 1}`, price: level.price, kind: level.kind ?? 'pivot', distance: level.distance ?? 'Unavailable' }));
  const snapshot: MarketSnapshot = { ...market, marketConnection: system.engine === 'offline' ? 'offline' : 'connected', ema9: null, ema21: null };
  return { market: snapshot, system, levels, trades };
}
