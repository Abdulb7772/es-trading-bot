import { normalizeLevels, parseLevelsFromCsv, parseLevelsFromText, validateLevelCount } from '@es-trading/levels';
import { MongoDatabase, type DatabaseCollections } from '@es-trading/database';
import { simulationFixture } from '@es-trading/simulation/fixture';
import { runSimulation } from '@es-trading/simulation';
import {
  currentMarketSchema,
  levelSetSchema,
  logEntrySchema,
  simulationRequestSchema,
  simulationResultSchema,
  strategyConfigSchema,
  strategyEvaluationSchema,
  strategyConfigContractSchema,
  systemStatusSchema,
  tradingDayStateSchema,
  type CurrentMarket,
  type LevelSet,
  type LogEntry,
  type SimulationRequest,
  type StrategyConfig,
  type SystemStatus,
  type TradingDayState
} from '@es-trading/shared';
import type { StrategyEvaluation, Trade } from '@es-trading/shared';
import { z } from 'zod';
import type { TradingRiskState } from '@es-trading/risk';
import type { MarketRuntime } from '@es-trading/market';

const healthSchema = z.object({ status: z.literal('ok'), service: z.string(), time: z.string() });
const fixtureSchema = z.object({ id: z.string(), name: z.string(), description: z.string() });
const levelsRequestSchema = z.object({ levels: z.array(z.number().finite()) });
const levelsValidationSchema = z.object({ valid: z.boolean(), levels: z.array(z.number()), error: z.string().optional() });

export interface BackendApplicationServices {
  getHealth(): z.infer<typeof healthSchema>;
  getStatus(): SystemStatus;
  getMarket(): CurrentMarket;
  getConfig(): StrategyConfig;
  updateConfig(input: unknown): StrategyConfig;
  getLevels(): LevelSet;
  updateLevels(input: unknown): LevelSet;
  updateLevelsText(input: unknown): LevelSet;
  validateLevels(input: unknown): { valid: boolean; levels: number[]; error?: string };
  getEvaluations(): readonly StrategyEvaluation[];
  getEvaluation(id: string): StrategyEvaluation | undefined;
  getTrades(): readonly Trade[];
  getTrade(id: string): Trade | undefined;
  getDailyState(): TradingDayState;
  getLogs(): readonly LogEntry[];
  getSimulationFixtures(): readonly z.infer<typeof fixtureSchema>[];
  runSimulation(input: SimulationRequest): Promise<z.infer<typeof simulationResultSchema>>;
}

const defaultConfig = strategyConfigSchema.parse({
  symbol: '/ES', timeframe: '15m', tradingTimezone: 'America/New_York', noNewTradesAtOrAfter: '16:00', levels: { source: 'manual_input' }
});

const defaultLevels = levelSetSchema.parse({
  id: 'manual-es-levels', name: 'Manual ES levels', updatedAt: new Date().toISOString(), levels: []
});

const emptyEvaluation = (id: string): StrategyEvaluation => ({
  id, timestamp: new Date(0).toISOString(), direction: 'LONG', result: 'REJECTED', candles: [
    { timestamp: new Date(0).toISOString(), open: 0, high: 0, low: 0, close: 0, color: 'NEUTRAL' },
    { timestamp: new Date(0).toISOString(), open: 0, high: 0, low: 0, close: 0, color: 'NEUTRAL' },
    { timestamp: new Date(0).toISOString(), open: 0, high: 0, low: 0, close: 0, color: 'NEUTRAL' }
  ], ema9: null, ema21: null, emaRelationship: 'UNAVAILABLE', relevantSupport: null, relevantResistance: null,
  allCrossedLevels: [], playedLevel: null, nextLevel: null, breathingRoom: null, reasonCode: 'INSUFFICIENT_CANDLES',
  reason: 'No evaluations have been produced.', wickChecks: [
    { candle: 'Candle 1', high: 0, low: 0, nextLevelPrice: null, touchedNextLevel: false, closedBeyondNextLevel: false },
    { candle: 'Candle 2', high: 0, low: 0, nextLevelPrice: null, touchedNextLevel: false, closedBeyondNextLevel: false },
    { candle: 'Candle 3', high: 0, low: 0, nextLevelPrice: null, touchedNextLevel: false, closedBeyondNextLevel: false }
  ], finalWickDecision: 'Not evaluated.', risk: { entry: null, stop: null, normalTarget: null, nextLevelTarget: null, finalTarget: null }
});

export interface ApplicationServiceOptions {
  readonly initialData?: Partial<DatabaseCollections>;
  readonly database?: MongoDatabase;
  readonly riskState?: TradingRiskState;
  readonly getRuntime?: () => MarketRuntime | undefined;
}

export async function createPersistentBackendApplicationServices(database: MongoDatabase, options: Pick<ApplicationServiceOptions, 'riskState' | 'getRuntime'> = {}): Promise<BackendApplicationServices> {
  await database.connect();
  const data = await database.load();
  options.riskState?.restoreFromTrades(data.trades.filter((trade) => trade.status === 'closed' && trade.exit !== undefined).map((trade) => ({ pnl: trade.pnl, timestamp: new Date(trade.time) })));
  return createBackendApplicationServices({ initialData: data, database, ...options });
}

export function createBackendApplicationServices(options: ApplicationServiceOptions = {}): BackendApplicationServices {
  let config = options.initialData?.config ?? defaultConfig;
  let levels = options.initialData?.levels ?? defaultLevels;
  const evaluations: StrategyEvaluation[] = [...(options.initialData?.evaluations ?? [])];
  const trades: Trade[] = [...(options.initialData?.trades ?? [])];
  const logs: LogEntry[] = [...(options.initialData?.logs ?? [])];

  const replaceLevels = (values: readonly unknown[]): LevelSet => {
    const normalized = normalizeLevels(values);
    validateLevelCount(normalized);
    levels = levelSetSchema.parse({ ...levels, levels: normalized.map((price, index) => ({ id: `level-${index + 1}`, price })), updatedAt: new Date().toISOString() });
    if (options.database) void options.database.saveLevels(levels);
    options.getRuntime?.()?.updateLevels(levels.levels.map((l) => ({ id: l.id, price: l.price, active: true })));
    return levels;
  };

  return {
    getHealth: () => healthSchema.parse({ status: 'ok', service: 'engine', time: new Date().toISOString() }),
    getStatus: () => {
      const eligibility = options.riskState?.eligibility(new Date());
      return systemStatusSchema.parse({
        engine: 'operational',
        tradingEnabled: eligibility?.canOpenNewTrade ?? false,
        dailyLossLocked: eligibility?.dailyLossLocked ?? false,
        dailyLossUsed: eligibility?.realizedPnl ?? 0,
        dailyLossLimit: 1000,
        lastHeartbeat: new Date().toISOString()
      });
    },
    getMarket: () => {
      const rt = options.getRuntime?.();
      const live = rt?.currentMarket();
      const symbol = config.symbol ?? '/ES';
      if (live && live.price !== 0) return currentMarketSchema.parse({ symbol, mode: 'Practice', price: live.price, change: live.change, changePercent: live.changePercent, lastCandle: live.lastCandle.toISOString(), ema9: live.ema9, ema21: live.ema21 });
      return currentMarketSchema.parse({ symbol, mode: 'Simulation', price: 0, change: 0, changePercent: 0, lastCandle: new Date(0).toISOString(), ema9: null, ema21: null });
    },
    getConfig: () => strategyConfigContractSchema.parse(config),
    updateConfig: (input) => { config = strategyConfigSchema.parse(input); if (options.database) void options.database.saveConfig(config); options.getRuntime?.()?.updateConfig(config); return strategyConfigContractSchema.parse(config); },
    getLevels: () => levelSetSchema.parse(levels),
    updateLevels: (input) => replaceLevels(levelsRequestSchema.parse(input).levels),
    updateLevelsText: (input) => {
      const parsed = z.object({ text: z.string().min(1), format: z.enum(['text', 'csv']).default('text') }).parse(input);
      return replaceLevels(parsed.format === 'csv' ? parseLevelsFromCsv(parsed.text) : parseLevelsFromText(parsed.text));
    },
    validateLevels: (input) => { try { const parsed = levelsRequestSchema.parse(input); return { valid: true, levels: [...normalizeLevels(parsed.levels)] }; } catch (error) { return { valid: false, levels: [], error: error instanceof Error ? error.message : 'Invalid levels.' }; } },
    getEvaluations: () => evaluations.map((evaluation) => strategyEvaluationSchema.parse(evaluation)),
    getEvaluation: (id) => evaluations.find((evaluation) => evaluation.id === id),
    getTrades: () => [...trades],
    getTrade: (id) => trades.find((trade) => trade.id === id),
    getDailyState: () => {
      const eligibility = options.riskState?.eligibility(new Date());
      return tradingDayStateSchema.parse({
        tradingDay: eligibility?.tradingDay ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()),
        hasLosingTrade: eligibility?.dailyLossLocked ?? false,
        canOpenNewTrade: eligibility?.canOpenNewTrade ?? true,
        dailyLossLocked: eligibility?.dailyLossLocked ?? false,
        realizedPnl: eligibility?.realizedPnl ?? 0,
        lockReason: eligibility?.lockReason ?? null,
        lockTriggeredAt: eligibility?.lockTriggeredAt ?? null
      });
    },
    getLogs: () => logs.map((log) => logEntrySchema.parse(log)),
    getSimulationFixtures: () => [fixtureSchema.parse({ id: 'local-fixture', name: 'Local replay', description: 'Built-in deterministic /ES replay fixture.' })],
    runSimulation: async (input) => {
      simulationRequestSchema.parse(input);
      const result = await runSimulation({ ...simulationFixture, config: input.config });
      const actual = emptyEvaluation(`${input.fixtureId}-evaluation`);
      return simulationResultSchema.parse({ fixtureId: input.fixtureId, actual, comparison: result.acceptedSetups.length > 0 ? 'PASS' : 'FAIL', comparisonExplanation: result.diagnostics.totalPnl === 0 ? 'Simulation completed without realized P/L.' : `Simulation completed with ${result.diagnostics.totalPnl} P/L.` });
    }
  };
}

export { healthSchema, fixtureSchema, levelsRequestSchema, levelsValidationSchema };