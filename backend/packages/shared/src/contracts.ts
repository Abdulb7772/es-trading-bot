import { z } from 'zod';

const finiteNumber = z.number().finite();
const timestamp = z.string().min(1);
const levelsConfigSchema = z.object({
  source: z.enum(['manual_file', 'manual_database', 'manual_input']),
  minimumCount: z.number().int().positive(),
  maximumCount: z.number().int().positive(),
  selectionPolicy: z.enum(['UNSPECIFIED', 'NEAREST_RELEVANT'])
});
const strategyConfigContractShape = z.object({
  symbol: z.literal('/ES'),
  timeframe: z.string().regex(/^\d+(s|m|h|d)$/),
  emaFastPeriod: z.number().int().positive(),
  emaSlowPeriod: z.number().int().positive(),
  stopPoints: finiteNumber.positive(),
  targetPoints: finiteNumber.positive(),
  minimumBreathingRoomPoints: finiteNumber.nonnegative(),
  quantity: z.number().int().positive(),
  tradingTimezone: z.string().min(1),
  noNewTradesAtOrAfter: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  levels: levelsConfigSchema
});
const decisionReasonCodeSchema = z.enum([
  'INSUFFICIENT_CANDLES', 'CANDLE_1_COLOR_INVALID', 'CANDLE_1_LOCATION_INVALID',
  'CANDLE_2_COLOR_INVALID', 'CANDLE_3_COLOR_INVALID', 'CANDLE_3_DID_NOT_BREAK_LEVEL',
  'EMA_ALIGNMENT_INVALID', 'WICK_TOUCHED_FORBIDDEN_NEXT_LEVEL', 'INSUFFICIENT_BREATHING_ROOM',
  'DAILY_LOSS_LOCKOUT', 'TRADING_WINDOW_CLOSED', 'MALFORMED_LEVELS',
  'NO_RELEVANT_SUPPORT_RESISTANCE_LEVEL', 'CANDLE_NOT_CLOSED', 'INVALID_INSTRUMENT'
]);
const diagnosticCandleSchema = z.object({
  timestamp,
  open: finiteNumber,
  high: finiteNumber,
  low: finiteNumber,
  close: finiteNumber,
  color: z.enum(['GREEN', 'RED', 'NEUTRAL'])
});

export const systemStatusSchema = z.object({
  engine: z.enum(['operational', 'attention', 'offline']),
  tradingEnabled: z.boolean(),
  dailyLossLocked: z.boolean(),
  dailyLossUsed: finiteNumber,
  dailyLossLimit: finiteNumber.nonnegative(),
  lastHeartbeat: timestamp
});
export type SystemStatus = z.infer<typeof systemStatusSchema>;

export const marketStatusSchema = z.object({
  connection: z.enum(['connected', 'degraded', 'offline']),
  session: z.enum(['open', 'closed', 'pre_open']),
  lastUpdate: timestamp
});
export type MarketStatus = z.infer<typeof marketStatusSchema>;

export const engineStatusSchema = z.object({
  state: z.enum(['running', 'paused', 'stopped', 'degraded']),
  tradingEnabled: z.boolean(),
  lastHeartbeat: timestamp
});
export type EngineStatus = z.infer<typeof engineStatusSchema>;

export const currentMarketSchema = z.object({
  symbol: z.literal('/ES'),
  mode: z.enum(['Practice', 'Simulation']),
  price: finiteNumber,
  change: finiteNumber,
  changePercent: finiteNumber,
  lastCandle: timestamp
});
export type CurrentMarket = z.infer<typeof currentMarketSchema>;

export const indicatorStateSchema = z.object({
  ema9: finiteNumber.nullable(),
  ema21: finiteNumber.nullable()
});
export type IndicatorState = z.infer<typeof indicatorStateSchema>;

export const tradingDayStateSchema = z.object({
  tradingDay: z.string().min(1),
  hasLosingTrade: z.boolean(),
  canOpenNewTrade: z.boolean(),
  dailyLossLocked: z.boolean()
});
export type TradingDayState = z.infer<typeof tradingDayStateSchema>;

export const positionSchema = z.object({
  id: z.string().min(1),
  symbol: z.literal('/ES'),
  side: z.enum(['long', 'short']),
  quantity: z.number().int().positive(),
  entryPrice: finiteNumber,
  currentPrice: finiteNumber,
  unrealizedPnl: finiteNumber,
  openedAt: timestamp
});
export type Position = z.infer<typeof positionSchema>;

const wickCheckSchema = z.object({
  candle: z.enum(['Candle 1', 'Candle 2', 'Candle 3']),
  high: finiteNumber,
  low: finiteNumber,
  nextLevelPrice: finiteNumber.nullable(),
  touchedNextLevel: z.boolean(),
  closedBeyondNextLevel: z.boolean()
});

export const strategyEvaluationSchema = z.object({
  id: z.string().min(1),
  timestamp,
  direction: z.enum(['LONG', 'SHORT']),
  result: z.enum(['ACCEPTED', 'REJECTED']),
  candles: z.tuple([diagnosticCandleSchema, diagnosticCandleSchema, diagnosticCandleSchema]),
  ema9: finiteNumber.nullable(),
  ema21: finiteNumber.nullable(),
  emaRelationship: z.enum(['FAST_ABOVE_SLOW', 'FAST_BELOW_SLOW', 'UNAVAILABLE']),
  relevantSupport: finiteNumber.nullable(),
  relevantResistance: finiteNumber.nullable(),
  allCrossedLevels: z.array(finiteNumber),
  playedLevel: finiteNumber.nullable(),
  nextLevel: finiteNumber.nullable(),
  breathingRoom: finiteNumber.nullable(),
  reasonCode: decisionReasonCodeSchema,
  reason: z.string().min(1),
  wickChecks: z.tuple([wickCheckSchema, wickCheckSchema, wickCheckSchema]),
  finalWickDecision: z.string().min(1),
  risk: z.object({ entry: finiteNumber.nullable(), stop: finiteNumber.nullable(), normalTarget: finiteNumber.nullable(), nextLevelTarget: finiteNumber.nullable(), finalTarget: finiteNumber.nullable() })
});
export type StrategyEvaluation = z.infer<typeof strategyEvaluationSchema>;

export const tradeSchema = z.object({
  id: z.string().min(1),
  time: timestamp,
  side: z.enum(['long', 'short']),
  entry: finiteNumber,
  exit: finiteNumber.optional(),
  contracts: z.number().int().positive(),
  pnl: finiteNumber,
  status: z.enum(['open', 'closed'])
});
export type Trade = z.infer<typeof tradeSchema>;

export type StrategyConfigContract = z.infer<typeof strategyConfigContractShape>;

export const levelSetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  levels: z.array(z.object({ id: z.string().min(1), label: z.string().min(1).optional(), price: finiteNumber, kind: z.enum(['resistance', 'support', 'pivot']).optional(), distance: z.string().optional() })),
  updatedAt: timestamp
});
export type LevelSet = z.infer<typeof levelSetSchema>;

export const simulationRequestSchema = z.object({
  fixtureId: z.string().min(1),
  config: strategyConfigContractShape
});
export type SimulationRequest = z.infer<typeof simulationRequestSchema>;

export const simulationResultSchema = z.object({
  fixtureId: z.string().min(1),
  actual: strategyEvaluationSchema,
  comparison: z.enum(['PASS', 'FAIL']),
  comparisonExplanation: z.string().min(1)
});
export type SimulationResult = z.infer<typeof simulationResultSchema>;

export const logEntrySchema = z.object({
  id: z.string().min(1),
  timestamp,
  severity: z.enum(['INFO', 'WARN', 'ERROR']),
  component: z.enum(['system', 'market', 'strategy', 'execution']),
  event: z.string().min(1),
  message: z.string().min(1),
  evaluationId: z.string().nullable(),
  tradeId: z.string().nullable(),
  correlationId: z.string().min(1)
});
export type LogEntry = z.infer<typeof logEntrySchema>;

export const strategyConfigContractSchema = strategyConfigContractShape;
