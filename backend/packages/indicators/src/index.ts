import type { Candle, CandleColor, Instrument, TradingSide } from '@es-trading/shared';
import { ES_SYMBOL, MES_SYMBOL } from '@es-trading/shared';

export const EMA_FAST_PERIOD = 9;
export const EMA_SLOW_PERIOD = 21;

export type IndicatorInput = readonly Candle[];

/**
 * EMA initialization is deterministic: the first `period` completed closes
 * are averaged as an SMA. Later closes use EMA_t = close_t * alpha + EMA_(t-1)
 * * (1 - alpha), where alpha = 2 / (period + 1).
 */
export interface EmaSnapshot {
	readonly period: number;
	readonly samples: number;
	readonly value: number | null;
	readonly isReady: boolean;
}

function assertPeriod(period: number): void {
	if (!Number.isInteger(period) || period <= 0) {
		throw new RangeError(`EMA period must be a positive integer; received ${period}.`);
	}
}

function assertCompletedCandle(candle: Candle): void {
	if (candle.symbol !== ES_SYMBOL && candle.symbol !== MES_SYMBOL) {
		throw new Error(`Indicators only accept /ES or /MES candles; received ${candle.symbol}.`);
	}
	if (!candle.isClosed) {
		throw new Error('Indicators only accept completed candles.');
	}
}

export function getCandleColor(candle: Pick<Candle, 'open' | 'close'>): CandleColor {
	if (candle.close > candle.open) return 'GREEN';
	if (candle.close < candle.open) return 'RED';
	return 'NEUTRAL';
}

export function candleColor(candle: Pick<Candle, 'open' | 'close'>): CandleColor {
	return getCandleColor(candle);
}

export class StreamingEma {
	readonly period: number;
	private readonly alpha: number;
	private seedCloses: number[] = [];
	private currentValue: number | null = null;

	constructor(period: number) {
		assertPeriod(period);
		this.period = period;
		this.alpha = 2 / (period + 1);
	}

	get value(): number | null {
		return this.currentValue;
	}

	get isReady(): boolean {
		return this.currentValue !== null;
	}

	get samples(): number {
		return this.seedCloses.length + (this.currentValue === null ? 0 : 1);
	}

	updateClose(close: number): number | null {
		if (!Number.isFinite(close)) {
			throw new TypeError(`EMA close must be finite; received ${close}.`);
		}

		if (this.currentValue === null) {
			this.seedCloses.push(close);
			if (this.seedCloses.length < this.period) return null;

			this.currentValue = this.seedCloses.reduce((sum, value) => sum + value, 0) / this.period;
			this.seedCloses = [];
			return this.currentValue;
		}

		this.currentValue = close * this.alpha + this.currentValue * (1 - this.alpha);
		return this.currentValue;
	}

	update(candle: Candle): number | null {
		assertCompletedCandle(candle);
		return this.updateClose(candle.close);
	}

	snapshot(): EmaSnapshot {
		return {
			period: this.period,
			samples: this.samples,
			value: this.value,
			isReady: this.isReady
		};
	}
}

export function calculateEmaSeries(
	candles: IndicatorInput,
	period: number
): readonly (number | null)[] {
	const ema = new StreamingEma(period);
	return candles.map((candle) => ema.update(candle));
}

export function calculateEma(candles: IndicatorInput, period: number): number | null {
	const series = calculateEmaSeries(candles, period);
	return series.at(-1) ?? null;
}

export function calculateStandardEma9(candles: IndicatorInput): number | null {
	return calculateEma(candles, EMA_FAST_PERIOD);
}

export function calculateStandardEma21(candles: IndicatorInput): number | null {
	return calculateEma(candles, EMA_SLOW_PERIOD);
}

export function isEmaAligned(side: TradingSide, emaFast: number | null, emaSlow: number | null): boolean {
	if (emaFast === null || emaSlow === null) return false;
	return side === 'LONG' ? emaFast >= emaSlow : emaFast <= emaSlow;
}

export type IndicatorEngine = (candles: IndicatorInput) => EmaSnapshot;
