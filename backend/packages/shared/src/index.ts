import { z } from 'zod';

  export const ES_SYMBOL = '/ES' as const;
  export type Instrument = typeof ES_SYMBOL;

  export const timeframeSchema = z.string().regex(/^\d+(s|m|h|d)$/, 'Use a timeframe such as 1m or 15m.');
  export type Timeframe = z.infer<typeof timeframeSchema>;

  const finiteNumber = z.number().finite();
  const positiveNumber = finiteNumber.positive();

  export const candleColorSchema = z.enum(['GREEN', 'RED', 'NEUTRAL']);
  export type CandleColor = z.infer<typeof candleColorSchema>;

  export const tradingSideSchema = z.enum(['LONG', 'SHORT']);
  export type TradingSide = z.infer<typeof tradingSideSchema>;

  export const candleSchema = z.object({
    timestamp: z.coerce.date(),
    open: finiteNumber,
    high: finiteNumber,
    low: finiteNumber,
    close: finiteNumber,
    volume: finiteNumber.nonnegative().optional(),
    symbol: z.literal(ES_SYMBOL),
    timeframe: z.literal('15m'),
    isClosed: z.boolean()
  }).superRefine((candle, context) => {
    if (candle.high < Math.max(candle.open, candle.close)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['high'], message: 'High must contain open and close.' });
    }
    if (candle.low > Math.min(candle.open, candle.close)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['low'], message: 'Low must contain open and close.' });
    }
  });
  export type Candle = z.infer<typeof candleSchema>;

  export const supportResistanceLevelSchema = z.object({
    id: z.string().min(1),
    price: finiteNumber,
    label: z.string().min(1).optional(),
    active: z.boolean().default(true)
  });
  export type SupportResistanceLevel = z.infer<typeof supportResistanceLevelSchema>;
  export type PriceLevel = SupportResistanceLevel;

  export const levelsConfigSchema = z.object({
    source: z.enum(['manual_file', 'manual_database', 'manual_input']),
    minimumCount: z.number().int().positive().default(80),
    maximumCount: z.number().int().positive().default(200),
    selectionPolicy: z.enum(['UNSPECIFIED', 'NEAREST_RELEVANT']).default('UNSPECIFIED')
  }).superRefine((config, context) => {
    if (config.maximumCount < config.minimumCount) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['maximumCount'], message: 'Maximum count must not be below minimum count.' });
    }
  });
  export type LevelsConfig = z.infer<typeof levelsConfigSchema>;

  export const strategyConfigSchema = z.object({
    symbol: z.literal(ES_SYMBOL),
    timeframe: z.literal('15m'),
    emaFastPeriod: z.number().int().positive().default(9),
    emaSlowPeriod: z.number().int().positive().default(21),
    stopPoints: positiveNumber.default(10),
    targetPoints: positiveNumber.default(10),
    minimumBreathingRoomPoints: finiteNumber.nonnegative().default(3),
    quantity: z.number().int().positive().default(1),
    tradingTimezone: z.string().min(1),
    noNewTradesAtOrAfter: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Use a 24-hour time.'),
    levels: levelsConfigSchema
  }).superRefine((config, context) => {
    if (config.emaFastPeriod >= config.emaSlowPeriod) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['emaFastPeriod'], message: 'Fast EMA period must be below slow EMA period.' });
    }
  });
  export type StrategyConfig = z.infer<typeof strategyConfigSchema>;

  export const indicatorSnapshotSchema = z.object({
    emaFast: finiteNumber.nullable(),
    emaSlow: finiteNumber.nullable()
  });
  export type IndicatorSnapshot = z.infer<typeof indicatorSnapshotSchema>;

  export const decisionReasonCodeSchema = z.enum([
    'INSUFFICIENT_CANDLES',
    'CANDLE_1_COLOR_INVALID',
    'CANDLE_1_LOCATION_INVALID',
    'CANDLE_2_COLOR_INVALID',
    'CANDLE_3_COLOR_INVALID',
    'CANDLE_3_DID_NOT_BREAK_LEVEL',
    'EMA_ALIGNMENT_INVALID',
    'WICK_TOUCHED_FORBIDDEN_NEXT_LEVEL',
    'INSUFFICIENT_BREATHING_ROOM',
    'DAILY_LOSS_LOCKOUT',
    'TRADING_WINDOW_CLOSED',
    'MALFORMED_LEVELS',
    'NO_RELEVANT_SUPPORT_RESISTANCE_LEVEL',
    'CANDLE_NOT_CLOSED',
    'INVALID_INSTRUMENT'
  ]);
  export type DecisionReasonCode = z.infer<typeof decisionReasonCodeSchema>;

  export interface DecisionReason {
    readonly code: DecisionReasonCode;
    readonly description: string;
    readonly details?: Readonly<Record<string, string | number | boolean>>;
  }

  export const reasonDescriptions: Readonly<Record<DecisionReasonCode, string>> = {
    INSUFFICIENT_CANDLES: 'The completed candle history is too short to evaluate a setup.',
    CANDLE_1_COLOR_INVALID: 'Candle 1 does not have the required color.',
    CANDLE_1_LOCATION_INVALID: 'Candle 1 is not at the required level location.',
    CANDLE_2_COLOR_INVALID: 'Candle 2 does not have the required color.',
    CANDLE_3_COLOR_INVALID: 'Candle 3 does not have the required color.',
    CANDLE_3_DID_NOT_BREAK_LEVEL: 'Candle 3 did not close beyond the required level.',
    EMA_ALIGNMENT_INVALID: 'The EMA alignment does not permit this side.',
    WICK_TOUCHED_FORBIDDEN_NEXT_LEVEL: 'A wick touched a forbidden next level.',
    INSUFFICIENT_BREATHING_ROOM: 'The distance to the next relevant level is too small.',
    DAILY_LOSS_LOCKOUT: 'A losing trade has locked new entries for this trading day.',
    TRADING_WINDOW_CLOSED: 'The configured new-trade window is closed.',
    MALFORMED_LEVELS: 'The supplied support/resistance levels are malformed.',
    NO_RELEVANT_SUPPORT_RESISTANCE_LEVEL: 'No relevant manual support/resistance level is available.',
    CANDLE_NOT_CLOSED: 'Every candle supplied to the strategy must be completed.',
    INVALID_INSTRUMENT: 'Every candle supplied to the strategy must be an /ES candle.'
  };

  export interface TradePlan {
    readonly side: TradingSide;
    readonly entryPrice: number;
    readonly stopPrice: number;
    readonly targetPrice: number;
    readonly playedLevel: SupportResistanceLevel;
    readonly nextRelevantLevel: SupportResistanceLevel | null;
    readonly breathingRoomPoints: number | null;
    readonly candleTimestamps: readonly [Date, Date, Date];
    readonly emaFast: number | null;
    readonly emaSlow: number | null;
    readonly explanation: string;
    readonly reasonCodes: readonly DecisionReasonCode[];
  }

  export interface SetupEvaluation {
    readonly accepted: boolean;
    readonly side: TradingSide | null;
    readonly candle1: Candle | null;
    readonly candle2: Candle | null;
    readonly candle3: Candle | null;
    readonly entryPrice: number | null;
    readonly brokenLevel: SupportResistanceLevel | null;
    readonly candleTimestamps: readonly Date[];
    readonly ema9: number | null;
    readonly ema21: number | null;
    readonly emaFast: number | null;
    readonly emaSlow: number | null;
    readonly playedLevel: SupportResistanceLevel | null;
    readonly nextRelevantLevel: SupportResistanceLevel | null;
    readonly reasons: readonly DecisionReason[];
    readonly tradePlan: TradePlan | null;
    readonly explanation: string;
  }

  export interface StrategyInput {
    readonly candles: readonly Candle[];
    readonly levels: readonly SupportResistanceLevel[];
    readonly indicators: IndicatorSnapshot;
    readonly config: StrategyConfig;
    readonly eligibility?: StrategyEligibility;
  }

  export interface StrategyEligibility {
    readonly canOpenNewTrade: boolean;
    readonly dailyLossLocked: boolean;
    readonly tradingWindowOpen: boolean;
    readonly lockReason?: string | null;
    readonly lockTriggeredAt?: string | null;
    readonly realizedPnl?: number;
  }

  export const tradingDecisionActionSchema = z.enum(['NO_TRADE', 'ENTER_LONG', 'ENTER_SHORT']);
  export type TradingDecisionAction = z.infer<typeof tradingDecisionActionSchema>;

  export interface TradingDecision {
    readonly action: TradingDecisionAction;
    readonly evaluation: SetupEvaluation;
    readonly generatedAt: Date;
  }

  export interface DailyTradingState {
    readonly tradingDay: string;
    readonly hasLosingTrade: boolean;
    readonly canOpenNewTrade: boolean;
  }

  export type PositionStatus = 'OPEN' | 'CLOSED' | 'FLAT';
  export type TradeResult = 'WIN' | 'LOSS' | 'BREAKEVEN' | 'UNKNOWN';

  export interface PositionState {
    readonly status: PositionStatus;
    readonly side: TradingSide | null;
    readonly quantity: number;
    readonly entryPrice: number | null;
    readonly exitPrice: number | null;
    readonly openedAt: Date | null;
    readonly closedAt: Date | null;
  }

  export interface TradeResultRecord {
    readonly side: TradingSide;
    readonly quantity: number;
    readonly entryPrice: number;
    readonly exitPrice: number | null;
    readonly stopPrice: number;
    readonly targetPrice: number;
    readonly result: TradeResult;
    readonly points: number | null;
    readonly openedAt: Date;
    readonly closedAt: Date | null;
    readonly explanation: string;
  }

  export type Direction = Lowercase<TradingSide>;

  export type EngineEvent =
    | { readonly type: 'candle_closed'; readonly candle: Candle }
    | { readonly type: 'connection_changed'; readonly connected: boolean };

export * from './contracts';
