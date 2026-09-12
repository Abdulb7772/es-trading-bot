import type {
  Candle,
  DecisionReason,
  DecisionReasonCode,
  Instrument,
  SetupEvaluation,
  StrategyInput,
  SupportResistanceLevel,
  TradePlan,
  TradingDecision,
  TradingDecisionAction,
  TradingSide
} from '@es-trading/shared';
import { ES_SYMBOL, MES_SYMBOL } from '@es-trading/shared';

export type StrategyEngine = (input: StrategyInput) => TradingDecision;

const descriptions: Readonly<Record<DecisionReasonCode, string>> = {
  INSUFFICIENT_CANDLES: 'Three completed candles are required.',
  CANDLE_1_COLOR_INVALID: 'Candle 1 has the required direction color.',
  CANDLE_1_LOCATION_INVALID: 'Candle 1 did not open at the relevant level.',
  CANDLE_2_COLOR_INVALID: 'Candle 2 has the required opposite color.',
  CANDLE_3_COLOR_INVALID: 'Candle 3 has the required direction color.',
  CANDLE_3_DID_NOT_BREAK_LEVEL: 'Candle 3 did not close beyond the level being broken.',
  EMA_ALIGNMENT_INVALID: 'EMA9 and EMA21 are not aligned for this direction.',
  WICK_TOUCHED_FORBIDDEN_NEXT_LEVEL: 'A candle wick touched the next S/R level but Candle 3 did not close beyond it.',
  INSUFFICIENT_BREATHING_ROOM: 'The next relevant level is less than 3 points from entry.',
  DAILY_LOSS_LOCKOUT: 'Unused as a strategy filter; risk management is outside setup evaluation.',
  TRADING_WINDOW_CLOSED: 'Unused as a strategy filter; trading hours are outside setup evaluation.',
  MALFORMED_LEVELS: 'A supplied level is not a finite numeric price.',
  NO_RELEVANT_SUPPORT_RESISTANCE_LEVEL: 'No relevant manual support or resistance level is available.',
  CANDLE_NOT_CLOSED: 'Every strategy candle must be completed.',
  INVALID_INSTRUMENT: 'Every strategy candle must use /ES or /MES.'
};

function makeReason(code: DecisionReasonCode, details?: Readonly<Record<string, string | number | boolean>>): DecisionReason {
  return { code, description: descriptions[code], details };
}

function makeEvaluation(
  side: TradingSide | null,
  candles: readonly Candle[],
  input: StrategyInput,
  reasons: readonly DecisionReason[],
  values: Partial<Pick<SetupEvaluation, 'playedLevel' | 'nextRelevantLevel' | 'tradePlan' | 'entryPrice' | 'brokenLevel'>> = {},
  explanation = reasons[0]?.description ?? 'Setup accepted.'
): SetupEvaluation {
  const recent = candles.slice(-3);
  return {
    accepted: reasons.length === 0,
    side,
    candle1: recent[0] ?? null,
    candle2: recent[1] ?? null,
    candle3: recent[2] ?? null,
    entryPrice: values.entryPrice ?? values.tradePlan?.entryPrice ?? null,
    brokenLevel: values.brokenLevel ?? values.playedLevel ?? null,
    candleTimestamps: recent.map((candle) => candle.timestamp),
    ema9: input.indicators.emaFast,
    ema21: input.indicators.emaSlow,
    emaFast: input.indicators.emaFast,
    emaSlow: input.indicators.emaSlow,
    playedLevel: values.playedLevel ?? null,
    nextRelevantLevel: values.nextRelevantLevel ?? null,
    reasons,
    tradePlan: values.tradePlan ?? null,
    explanation
  };
}

function activeLevels(levels: readonly SupportResistanceLevel[]): readonly SupportResistanceLevel[] {
  return levels.filter((level) => level.active).sort((left, right) => left.price - right.price);
}

function validateInput(input: StrategyInput, side: TradingSide): SetupEvaluation | null {
  if (input.candles.length < 3) return makeEvaluation(side, input.candles, input, [makeReason('INSUFFICIENT_CANDLES')]);
  const candles = input.candles.slice(-3);
  if (candles.some((candle) => candle.symbol !== ES_SYMBOL && candle.symbol !== MES_SYMBOL)) return makeEvaluation(side, candles, input, [makeReason('INVALID_INSTRUMENT')]);
  if (candles.some((candle) => !candle.isClosed || candle.timeframe !== '15m')) return makeEvaluation(side, candles, input, [makeReason('CANDLE_NOT_CLOSED')]);
  if (input.levels.some((level) => !Number.isFinite(level.price))) return makeEvaluation(side, candles, input, [makeReason('MALFORMED_LEVELS')]);
  return null;
}

function evaluateSide(input: StrategyInput, side: TradingSide): SetupEvaluation {
  const invalid = validateInput(input, side);
  if (invalid) return invalid;

  const candles = input.candles.slice(-3);
  const [candle1, candle2, candle3] = candles;
  const levels = activeLevels(input.levels);
  const long = side === 'LONG';
  const relevantLevel = long
    ? levels.find((level) => level.price >= candle1.open)
    : [...levels].reverse().find((level) => level.price <= candle1.open);

  if (!relevantLevel) return makeEvaluation(side, candles, input, [makeReason('NO_RELEVANT_SUPPORT_RESISTANCE_LEVEL')]);
  if (long && candle1.open > relevantLevel.price || !long && candle1.open < relevantLevel.price) return makeEvaluation(side, candles, input, [makeReason('CANDLE_1_LOCATION_INVALID')], { playedLevel: relevantLevel, brokenLevel: relevantLevel });
  if (long && candle1.close <= candle1.open || !long && candle1.close >= candle1.open) return makeEvaluation(side, candles, input, [makeReason('CANDLE_1_COLOR_INVALID')], { playedLevel: relevantLevel, brokenLevel: relevantLevel });
  if (long && candle2.close >= candle2.open || !long && candle2.close <= candle2.open) return makeEvaluation(side, candles, input, [makeReason('CANDLE_2_COLOR_INVALID')], { playedLevel: relevantLevel, brokenLevel: relevantLevel });
  if (long && candle3.close <= candle3.open || !long && candle3.close >= candle3.open) return makeEvaluation(side, candles, input, [makeReason('CANDLE_3_COLOR_INVALID')], { playedLevel: relevantLevel, brokenLevel: relevantLevel });
  if (long && candle3.close <= relevantLevel.price || !long && candle3.close >= relevantLevel.price) return makeEvaluation(side, candles, input, [makeReason('CANDLE_3_DID_NOT_BREAK_LEVEL')], { playedLevel: relevantLevel, brokenLevel: relevantLevel });

  const emaAligned = input.indicators.emaFast !== null && input.indicators.emaSlow !== null && (long ? input.indicators.emaFast >= input.indicators.emaSlow : input.indicators.emaFast <= input.indicators.emaSlow);
  if (!emaAligned) return makeEvaluation(side, candles, input, [makeReason('EMA_ALIGNMENT_INVALID')], { playedLevel: relevantLevel, brokenLevel: relevantLevel });

  const brokenCandidates = long
    ? levels.filter((level) => level.price >= relevantLevel.price && level.price < candle3.close)
    : levels.filter((level) => level.price <= relevantLevel.price && level.price > candle3.close);
  const brokenLevel = long ? brokenCandidates.at(-1) ?? relevantLevel : brokenCandidates[0] ?? relevantLevel;
  const nextRelevantLevel = long
    ? levels.find((level) => level.price > brokenLevel.price) ?? null
    : [...levels].reverse().find((level) => level.price < brokenLevel.price) ?? null;

  const entryPrice = candle3.close;
  const breathingRoomPoints = nextRelevantLevel ? Math.abs(nextRelevantLevel.price - entryPrice) : null;
  if (nextRelevantLevel && breathingRoomPoints !== null && breathingRoomPoints < 3) {
    return makeEvaluation(side, candles, input, [makeReason('INSUFFICIENT_BREATHING_ROOM', {
      entryPrice,
      nextLevelPrice: nextRelevantLevel.price,
      distance: breathingRoomPoints,
      minimumDistance: 3
    })], { playedLevel: brokenLevel, brokenLevel, nextRelevantLevel, entryPrice }, `Breathing room ${breathingRoomPoints} points is below the required 3 points.`);
  }
  if (nextRelevantLevel) {
    const nextPrice = nextRelevantLevel.price;
    const c3BeyondNext = long ? candle3.close >= nextPrice : candle3.close <= nextPrice;
    if (!c3BeyondNext) {
      for (const [label, candle] of [['Candle 1', candle1], ['Candle 2', candle2], ['Candle 3', candle3]] as const) {
        const wickTouches = long ? candle.high >= nextPrice : candle.low <= nextPrice;
        if (wickTouches) {
          return makeEvaluation(side, candles, input, [makeReason('WICK_TOUCHED_FORBIDDEN_NEXT_LEVEL', { candle: label, entryPrice, nextLevelPrice: nextPrice })], { playedLevel: brokenLevel, brokenLevel, nextRelevantLevel, entryPrice }, `${label} wick touched next level ${nextPrice} but candle 3 did not close beyond it.`);
        }
      }
    }
  }
  const stopPoints = input.config.stopPoints;
  const targetPoints = input.config.targetPoints;
  const normalTarget = long ? entryPrice + targetPoints : entryPrice - targetPoints;
  const targetPrice = nextRelevantLevel && (long ? nextRelevantLevel.price < normalTarget : nextRelevantLevel.price > normalTarget)
    ? nextRelevantLevel.price
    : normalTarget;
  const tradePlan: TradePlan = {
    side,
    entryPrice,
    stopPrice: long ? entryPrice - stopPoints : entryPrice + stopPoints,
    targetPrice,
    playedLevel: brokenLevel,
    nextRelevantLevel,
    breathingRoomPoints,
    candleTimestamps: [candle1.timestamp, candle2.timestamp, candle3.timestamp],
    emaFast: input.indicators.emaFast,
    emaSlow: input.indicators.emaSlow,
    explanation: `${side} setup accepted at Candle 3 close ${entryPrice}.`,
    reasonCodes: []
  };
  return makeEvaluation(side, candles, input, [], { playedLevel: brokenLevel, brokenLevel, nextRelevantLevel, entryPrice, tradePlan }, tradePlan.explanation);
}

export function evaluateLongSetup(input: StrategyInput): SetupEvaluation { return evaluateSide(input, 'LONG'); }
export function evaluateShortSetup(input: StrategyInput): SetupEvaluation { return evaluateSide(input, 'SHORT'); }

export const evaluateStrategy: StrategyEngine = (input) => {
  const longEvaluation = evaluateLongSetup(input);
  const shortEvaluation = evaluateShortSetup(input);
  let action: TradingDecisionAction = 'NO_TRADE';
  let evaluation = longEvaluation;
  if (input.eligibility?.dailyLossLocked || input.eligibility?.canOpenNewTrade === false) {
    const details = input.eligibility.lockTriggeredAt ? { lockTriggeredAt: input.eligibility.lockTriggeredAt, realizedPnl: input.eligibility.realizedPnl ?? 0 } : undefined;
    evaluation = makeEvaluation(null, input.candles, input, [makeReason('DAILY_LOSS_LOCKOUT', details)], {}, input.eligibility.lockReason ?? 'Daily-loss lock is active; no new position may be opened.');
  } else if (longEvaluation.accepted && !shortEvaluation.accepted) {
    action = 'ENTER_LONG';
  } else if (shortEvaluation.accepted && !longEvaluation.accepted) {
    action = 'ENTER_SHORT';
    evaluation = shortEvaluation;
  } else if (longEvaluation.accepted && shortEvaluation.accepted) {
    evaluation = makeEvaluation(null, input.candles, input, [makeReason('MALFORMED_LEVELS')], {}, 'Both directions matched; no unambiguous side was selected.');
  } else {
    evaluation = longEvaluation.reasons.length > 0 ? longEvaluation : shortEvaluation;
  }
  return { action, evaluation, generatedAt: input.candles.at(-1)?.timestamp ?? new Date(0) };
};

export const evaluateDeterministicStrategy: StrategyEngine = evaluateStrategy;
