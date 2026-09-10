import type { PriceLevel } from '@es-trading/shared';

export type LevelStore = {
  readonly list: () => readonly PriceLevel[];
};
export const ES_TICK_SIZE = 0.25;
export const DEFAULT_MIN_LEVEL_COUNT = 80;
export const DEFAULT_MAX_LEVEL_COUNT = 200;

export type RawLevelValue = number | string;

export interface NormalizeLevelsOptions {
  readonly tickSize?: number;
  readonly requirePositive?: boolean;
}

export interface LevelCountOptions {
  readonly minimum?: number;
  readonly maximum?: number;
}

export class LevelValidationError extends Error {
  readonly value: unknown;
  readonly index?: number;

  constructor(message: string, value: unknown, index?: number) {
    super(message);
    this.name = 'LevelValidationError';
    this.value = value;
    this.index = index;
  }
}

function assertTickSize(tickSize: number): void {
  if (!Number.isFinite(tickSize) || tickSize <= 0) {
    throw new LevelValidationError(`Tick size must be a positive finite number; received ${String(tickSize)}.`, tickSize);
  }
}

function parseNumericValue(value: unknown, index?: number): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new LevelValidationError(`Level must be finite; received ${String(value)}.`, value, index);
    }
    return value;
  }

  if (typeof value !== 'string' || value.trim() === '') {
    throw new LevelValidationError(`Level must be a numeric value; received ${String(value)}.`, value, index);
  }

  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) {
    throw new LevelValidationError(`Level must be numeric and finite; received "${value}".`, value, index);
  }
  return parsed;
}

function assertValidPrice(price: number, index: number | undefined, options: NormalizeLevelsOptions): void {
  const tickSize = options.tickSize ?? ES_TICK_SIZE;
  assertTickSize(tickSize);

  if (options.requirePositive && price <= 0) {
    throw new LevelValidationError(`Level must be greater than zero; received ${price}.`, price, index);
  }

  const tickRatio = price / tickSize;
  const nearestTick = Math.round(tickRatio);
  if (Math.abs(tickRatio - nearestTick) > 1e-9) {
    throw new LevelValidationError(
      `Level ${price} does not conform to the /ES tick size of ${tickSize} points.`,
      price,
      index
    );
  }
}

export function normalizeLevels(
  values: readonly unknown[],
  options: NormalizeLevelsOptions = {}
): readonly number[] {
  const normalized = values.map((value, index) => {
    const price = parseNumericValue(value, index);
    assertValidPrice(price, index, options);
    return price;
  });

  return [...new Set(normalized)].sort((left, right) => left - right);
}

export function validateLevelCount(
  levels: readonly number[],
  options: LevelCountOptions = {}
): void {
  const minimum = options.minimum ?? DEFAULT_MIN_LEVEL_COUNT;
  const maximum = options.maximum ?? DEFAULT_MAX_LEVEL_COUNT;

  if (!Number.isInteger(minimum) || minimum < 0 || !Number.isInteger(maximum) || maximum < minimum) {
    throw new LevelValidationError(`Invalid level count range ${minimum}-${maximum}.`, { minimum, maximum });
  }
  if (levels.length < minimum || levels.length > maximum) {
    throw new LevelValidationError(
      `Expected between ${minimum} and ${maximum} levels; received ${levels.length}.`,
      levels.length
    );
  }
}

function extractJsonValues(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) {
    return value.map((entry) => {
      if (entry !== null && typeof entry === 'object' && 'price' in entry) {
        return (entry as { price: unknown }).price;
      }
      return entry;
    });
  }

  if (value !== null && typeof value === 'object' && 'levels' in value) {
    return extractJsonValues((value as { levels: unknown }).levels);
  }

  if (value !== null && typeof value === 'object' && 'price' in value) {
    return [(value as { price: unknown }).price];
  }

  throw new LevelValidationError('JSON levels must be an array or an object containing levels.', value);
}

export function parseLevelsFromJson(
  input: string | unknown,
  options: NormalizeLevelsOptions = {}
): readonly number[] {
  let parsed: unknown;
  try {
    parsed = typeof input === 'string' ? JSON.parse(input) : input;
  } catch (error) {
    throw new LevelValidationError(`Invalid JSON levels: ${error instanceof Error ? error.message : String(error)}.`, input);
  }
  return normalizeLevels(extractJsonValues(parsed), options);
}

export function parseLevelsFromText(
  input: string,
  options: NormalizeLevelsOptions = {}
): readonly number[] {
  if (typeof input !== 'string') {
    throw new LevelValidationError('Plain-text levels must be a string.', input);
  }

  const values = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return normalizeLevels(values, options);
}

export function parseLevelsFromCsv(
  input: string,
  options: NormalizeLevelsOptions = {}
): readonly number[] {
  if (typeof input !== 'string') {
    throw new LevelValidationError('CSV levels must be a string.', input);
  }

  const rows = input.split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
  if (rows.length === 0) {
    throw new LevelValidationError('CSV levels cannot be empty.', input);
  }

  const headers = rows[0].split(',').map((header) => header.trim().toLowerCase());
  const priceColumn = headers.indexOf('price');
  if (priceColumn < 0) {
    throw new LevelValidationError('CSV levels must contain a price column.', headers);
  }

  const values = rows.slice(1).map((row, rowIndex) => {
    const columns = row.split(',');
    if (columns.length <= priceColumn || columns[priceColumn].trim() === '') {
      throw new LevelValidationError(`CSV row ${rowIndex + 2} has no price value.`, row, rowIndex + 2);
    }
    return columns[priceColumn].trim();
  });
  return normalizeLevels(values, options);
}

export function findLevelAtOrBelow(levels: readonly number[], price: number): number | undefined {
  return levels.filter((level) => level <= price).at(-1);
}

export function findLevelAtOrAbove(levels: readonly number[], price: number): number | undefined {
  return levels.find((level) => level >= price);
}

export function findNearestLowerLevel(levels: readonly number[], price: number): number | undefined {
  return levels.filter((level) => level < price).at(-1);
}

export function findNearestHigherLevel(levels: readonly number[], price: number): number | undefined {
  return levels.find((level) => level > price);
}

export function findLevelsBetween(
  levels: readonly number[],
  lowerPrice: number,
  upperPrice: number,
  inclusive = false
): readonly number[] {
  const lower = Math.min(lowerPrice, upperPrice);
  const upper = Math.max(lowerPrice, upperPrice);
  return levels.filter((level) => inclusive ? level >= lower && level <= upper : level > lower && level < upper);
}

export function findLevelsCrossedUpward(
  levels: readonly number[],
  startPrice: number,
  endPrice: number
): readonly number[] {
  if (endPrice <= startPrice) return [];
  return levels.filter((level) => level > startPrice && level <= endPrice);
}

export function findLevelsCrossedDownward(
  levels: readonly number[],
  startPrice: number,
  endPrice: number
): readonly number[] {
  if (endPrice >= startPrice) return [];
  return levels.filter((level) => level < startPrice && level >= endPrice).reverse();
}

export function findNextLevelAbove(levels: readonly number[], price: number): number | undefined {
  return findNearestHigherLevel(levels, price);
}

export function findNextLevelBelow(levels: readonly number[], price: number): number | undefined {
  return findNearestLowerLevel(levels, price);
}

export function distanceInPoints(firstPrice: number, secondPrice: number): number {
  if (!Number.isFinite(firstPrice) || !Number.isFinite(secondPrice)) {
    throw new LevelValidationError('Distance prices must be finite numbers.', { firstPrice, secondPrice });
  }
  return Math.abs(firstPrice - secondPrice);
}
