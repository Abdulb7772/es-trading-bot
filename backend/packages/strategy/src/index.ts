import type {
	Candle,
	DecisionReason,
	DecisionReasonCode,
	SetupEvaluation,
	StrategyInput,
	SupportResistanceLevel,
	TradePlan,
	TradingDecision,
	TradingDecisionAction,
	TradingSide
} from '@es-trading/shared';

import { isEmaAligned } from '@es-trading/indicators';

export type StrategyEngine = (input: StrategyInput) => TradingDecision;

function reason(code: DecisionReasonCode, details?: Readonly<Record<string, string | number | boolean>>): DecisionReason {
	const descriptions: Readonly<Record<DecisionReasonCode, string>> = {
		INSUFFICIENT_CANDLES: 'The strategy requires three completed /ES candles.',
		CANDLE_1_COLOR_INVALID: 'Candle 1 has the wrong color for this side.',
		CANDLE_1_LOCATION_INVALID: 'Candle 1 did not open at or beyond the relevant contextual level.',
		CANDLE_2_COLOR_INVALID: 'Candle 2 has the wrong color for this side.',
		CANDLE_3_COLOR_INVALID: 'Candle 3 has the wrong color for this side.',
		CANDLE_3_DID_NOT_BREAK_LEVEL: 'Candle 3 did not close strictly beyond the relevant level.',
		EMA_ALIGNMENT_INVALID: 'EMA 9 and EMA 21 are not aligned for this side.',
		WICK_TOUCHED_FORBIDDEN_NEXT_LEVEL: 'A wick touched a forbidden next level.',
		INSUFFICIENT_BREATHING_ROOM: 'The distance to the next relevant level is too small.',
		DAILY_LOSS_LOCKOUT: 'Daily loss lockout prevents new trades.',
		TRADING_WINDOW_CLOSED: 'The configured trading window is closed.',
		MALFORMED_LEVELS: 'The supplied manual levels are malformed.',
		NO_RELEVANT_SUPPORT_RESISTANCE_LEVEL: 'No relevant contextual level was supplied.',
		CANDLE_NOT_CLOSED: 'Every strategy candle must be completed.',
		INVALID_INSTRUMENT: 'Every strategy candle must use /ES.',
	};

	return { code, description: descriptions[code], details };
}

function emptyEvaluation(
	side: TradingSide | null,
	candles: readonly Candle[],
	emaFast: number | null,
	emaSlow: number | null,
	reasons: readonly DecisionReason[],
	explanation: string
): SetupEvaluation {
	return {
		accepted: false,
		side,
		candleTimestamps: candles.slice(-3).map((candle) => candle.timestamp),
		emaFast,
		emaSlow,
		playedLevel: null,
		nextRelevantLevel: null,
		reasons,
		tradePlan: null,
		explanation
	};
}

function validateInput(input: StrategyInput, side: TradingSide): SetupEvaluation | null {
	const { candles, indicators } = input;
	const eligibility = input.eligibility ?? { canOpenNewTrade: true, dailyLossLocked: false, tradingWindowOpen: true };
	if (eligibility.dailyLossLocked || !eligibility.canOpenNewTrade) {
		return emptyEvaluation(side, candles, indicators.emaFast, indicators.emaSlow, [reason('DAILY_LOSS_LOCKOUT')], 'New trades are not eligible because the daily loss lock is active.');
	}
	if (!eligibility.tradingWindowOpen) {
		return emptyEvaluation(side, candles, indicators.emaFast, indicators.emaSlow, [reason('TRADING_WINDOW_CLOSED')], 'New trades are not eligible because the trading window is closed.');
	}
	if (candles.length < 3) {
		return emptyEvaluation(side, candles, indicators.emaFast, indicators.emaSlow, [reason('INSUFFICIENT_CANDLES')], 'At least three completed candles are required.');
	}

	const recentCandles = candles.slice(-3);
	const invalidInstrument = recentCandles.some((candle) => candle.symbol !== '/ES');
	if (invalidInstrument) {
		return emptyEvaluation(side, recentCandles, indicators.emaFast, indicators.emaSlow, [reason('INVALID_INSTRUMENT')], 'Every strategy candle must use /ES.');
	}
	if (recentCandles.some((candle) => !candle.isClosed)) {
		return emptyEvaluation(side, recentCandles, indicators.emaFast, indicators.emaSlow, [reason('CANDLE_NOT_CLOSED')], 'Every strategy candle must be completed.');
	}

	if (!input.levels.every((level) => Number.isFinite(level.price))) {
		return emptyEvaluation(side, recentCandles, indicators.emaFast, indicators.emaSlow, [reason('MALFORMED_LEVELS')], 'Every supplied level must have a finite numeric price.');
	}
	return null;
}

function activeSortedLevels(levels: readonly SupportResistanceLevel[]): readonly SupportResistanceLevel[] {
	return levels.filter((level) => level.active).sort((left, right) => left.price - right.price);
}

function evaluateSide(input: StrategyInput, side: TradingSide): SetupEvaluation {
	const invalid = validateInput(input, side);
	if (invalid) return invalid;

	const candles = input.candles.slice(-3);
	const [candle1, candle2, candle3] = candles;
	const levels = activeSortedLevels(input.levels);
	const longSide = side === 'LONG';
	const candle1Green = candle1.close > candle1.open;
	const candle1Red = candle1.close < candle1.open;
	const candle2Green = candle2.close > candle2.open;
	const candle2Red = candle2.close < candle2.open;
	const candle3Green = candle3.close > candle3.open;
	const candle3Red = candle3.close < candle3.open;

	const relevantLevel = longSide
		? levels.find((level) => level.price >= candle1.open)
		: [...levels].reverse().find((level) => level.price <= candle1.open);

	if (!relevantLevel) {
		return emptyEvaluation(side, candles, input.indicators.emaFast, input.indicators.emaSlow, [reason('NO_RELEVANT_SUPPORT_RESISTANCE_LEVEL')], 'No contextual level is available for Candle 1.');
	}
	if (longSide && !candle1Green || !longSide && !candle1Red) {
		return emptyEvaluation(side, candles, input.indicators.emaFast, input.indicators.emaSlow, [reason('CANDLE_1_COLOR_INVALID')], 'Candle 1 color does not match the requested side.');
	}
	if (longSide && candle1.open > relevantLevel.price || !longSide && candle1.open < relevantLevel.price) {
		return emptyEvaluation(side, candles, input.indicators.emaFast, input.indicators.emaSlow, [reason('CANDLE_1_LOCATION_INVALID')], 'Candle 1 opened on the wrong side of the relevant level.');
	}
	if (longSide && !candle2Red || !longSide && !candle2Green) {
		return emptyEvaluation(side, candles, input.indicators.emaFast, input.indicators.emaSlow, [reason('CANDLE_2_COLOR_INVALID')], 'Candle 2 color does not match the requested side.');
	}
	if (longSide && !candle3Green || !longSide && !candle3Red) {
		return emptyEvaluation(side, candles, input.indicators.emaFast, input.indicators.emaSlow, [reason('CANDLE_3_COLOR_INVALID')], 'Candle 3 color does not match the requested side.');
	}

	const breaksLevel = longSide ? candle3.close > relevantLevel.price : candle3.close < relevantLevel.price;
	if (!breaksLevel) {
		return emptyEvaluation(side, candles, input.indicators.emaFast, input.indicators.emaSlow, [reason('CANDLE_3_DID_NOT_BREAK_LEVEL')], 'Candle 3 did not close strictly beyond the relevant level.');
	}

	if (!isEmaAligned(side, input.indicators.emaFast, input.indicators.emaSlow)) {
		return emptyEvaluation(side, candles, input.indicators.emaFast, input.indicators.emaSlow, [reason('EMA_ALIGNMENT_INVALID')], 'EMA values are not aligned for the requested side.');
	}

	const crossedLevels = longSide
		? levels.filter((level) => level.price >= relevantLevel.price && level.price < candle3.close)
		: levels.filter((level) => level.price <= relevantLevel.price && level.price > candle3.close);
	const playedLevel = longSide ? crossedLevels.at(-1) : crossedLevels[0];
	if (!playedLevel) {
		return emptyEvaluation(side, candles, input.indicators.emaFast, input.indicators.emaSlow, [reason('CANDLE_3_DID_NOT_BREAK_LEVEL')], 'Candle 3 did not close beyond a playable level.');
	}

	const nextRelevantLevel = longSide
		? levels.find((level) => level.price > playedLevel.price) ?? null
		: [...levels].reverse().find((level) => level.price < playedLevel.price) ?? null;
	const entryPrice = candle3.close;
	const defaultTarget = longSide ? entryPrice + input.config.targetPoints : entryPrice - input.config.targetPoints;
	const breathingRoomPoints = nextRelevantLevel ? Math.abs(playedLevel.price - nextRelevantLevel.price) : null;
	const targetPrice = nextRelevantLevel
		? longSide
			? (nextRelevantLevel.price > entryPrice && nextRelevantLevel.price < defaultTarget ? nextRelevantLevel.price : defaultTarget)
			: (nextRelevantLevel.price < entryPrice && nextRelevantLevel.price > defaultTarget ? nextRelevantLevel.price : defaultTarget)
		: defaultTarget;

	if (nextRelevantLevel) {
		const nextLevelPrice = nextRelevantLevel.price;
		const wickTouched = longSide
			? candles.some((candle) => candle.high >= nextLevelPrice)
			: candles.some((candle) => candle.low <= nextLevelPrice);
		if (wickTouched && !(longSide ? candle3.close > nextLevelPrice : candle3.close < nextLevelPrice)) {
			return emptyEvaluation(side, candles, input.indicators.emaFast, input.indicators.emaSlow, [reason('WICK_TOUCHED_FORBIDDEN_NEXT_LEVEL')], 'A wick touched a forbidden next level.');
		}

		const br = breathingRoomPoints!;
		if (br < input.config.minimumBreathingRoomPoints) {
			return emptyEvaluation(side, candles, input.indicators.emaFast, input.indicators.emaSlow, [reason('INSUFFICIENT_BREATHING_ROOM')], 'The distance to the next relevant level is too small.');
		}
	}

	const tradePlan: TradePlan = {
		side,
		entryPrice,
		stopPrice: longSide ? entryPrice - input.config.stopPoints : entryPrice + input.config.stopPoints,
		targetPrice,
		playedLevel,
		nextRelevantLevel,
		breathingRoomPoints,
		candleTimestamps: [candle1.timestamp, candle2.timestamp, candle3.timestamp],
		emaFast: input.indicators.emaFast,
		emaSlow: input.indicators.emaSlow,
		explanation: `${side} base pattern accepted at Candle 3 close ${entryPrice}.`,
		reasonCodes: []
	};
	return {
		accepted: true,
		side,
		candleTimestamps: [candle1.timestamp, candle2.timestamp, candle3.timestamp],
		emaFast: input.indicators.emaFast,
		emaSlow: input.indicators.emaSlow,
		playedLevel,
		nextRelevantLevel,
		reasons: [],
		tradePlan,
		explanation: tradePlan.explanation
	};
}

export function evaluateLongSetup(input: StrategyInput): SetupEvaluation {
	return evaluateSide(input, 'LONG');
}

export function evaluateShortSetup(input: StrategyInput): SetupEvaluation {
	return evaluateSide(input, 'SHORT');
}

export const evaluateStrategy: StrategyEngine = (input) => {
	const longEvaluation = evaluateLongSetup(input);
	const shortEvaluation = evaluateShortSetup(input);
	let action: TradingDecisionAction = 'NO_TRADE';
	let evaluation = longEvaluation;

	if (longEvaluation.accepted && shortEvaluation.accepted) {
		evaluation = {
			...longEvaluation,
			accepted: false,
			tradePlan: null,
			explanation: 'Both directions passed the base pattern; no direction was selected.'
		};
	} else if (longEvaluation.accepted) {
		action = 'ENTER_LONG';
		evaluation = longEvaluation;
	} else if (shortEvaluation.accepted) {
		action = 'ENTER_SHORT';
		evaluation = shortEvaluation;
	} else {
		evaluation = longEvaluation.reasons.length > 0 ? longEvaluation : shortEvaluation;
	}

	const timestamp = input.candles.at(-1)?.timestamp ?? new Date(0);
	return { action, evaluation, generatedAt: timestamp };
};

export const evaluateDeterministicStrategy: StrategyEngine = evaluateStrategy;
