import { describe, expect, it } from 'vitest';
import {
  LevelValidationError,
  distanceInPoints,
  findLevelAtOrAbove,
  findLevelAtOrBelow,
  findLevelsBetween,
  findLevelsCrossedDownward,
  findLevelsCrossedUpward,
  findNearestHigherLevel,
  findNearestLowerLevel,
  findNextLevelAbove,
  findNextLevelBelow,
  normalizeLevels,
  parseLevelsFromCsv,
  parseLevelsFromJson,
  parseLevelsFromText,
  validateLevelCount
} from '@es-trading/levels';

const levels = [4990, 5000, 5010, 5020, 5030];

describe('levels', () => {
  it('normalizes unsorted duplicate levels', () => {
    expect(normalizeLevels([5020, '5000', 5010, 5000, 4990])).toEqual([4990, 5000, 5010, 5020]);
  });

  it('parses JSON arrays, objects, and plain text', () => {
    expect(parseLevelsFromJson('[5020, 5000, 5000.25]')).toEqual([5000, 5000.25, 5020]);
    expect(parseLevelsFromJson('{"levels":[5010,5000]}')).toEqual([5000, 5010]);
    expect(parseLevelsFromJson('[{"price":5020},{"price":5000}]')).toEqual([5000, 5020]);
    expect(parseLevelsFromText('5020\n5000\n5010\n')).toEqual([5000, 5010, 5020]);
  });

  it('parses a CSV price column without assigning permanent support/resistance labels', () => {
    expect(parseLevelsFromCsv('label,price\nupper,5020\nlower,5000')).toEqual([5000, 5020]);
  });

  it('rejects malformed values, malformed JSON, missing CSV price columns, and invalid ticks', () => {
    expect(() => normalizeLevels([5000.1])).toThrow(LevelValidationError);
    expect(() => normalizeLevels(['not-a-number'])).toThrow(/numeric/);
    expect(() => parseLevelsFromJson('{')).toThrow(/Invalid JSON/);
    expect(() => parseLevelsFromCsv('level\n5000')).toThrow(/price column/);
    expect(() => parseLevelsFromCsv('price\n5000.1')).toThrow(/tick size/);
  });

  it('supports explicit approximate count validation', () => {
    expect(() => validateLevelCount(Array.from({ length: 80 }, (_, index) => index * 0.25))).not.toThrow();
    expect(() => validateLevelCount([5000])).toThrow(/between 80 and 200/);
    expect(() => validateLevelCount(Array.from({ length: 201 }, (_, index) => index * 0.25))).toThrow(/between 80 and 200/);
  });

  it('handles equality and prices between levels', () => {
    expect(findLevelAtOrBelow(levels, 5010)).toBe(5010);
    expect(findLevelAtOrAbove(levels, 5010)).toBe(5010);
    expect(findNearestLowerLevel(levels, 5010)).toBe(5000);
    expect(findNearestHigherLevel(levels, 5010)).toBe(5020);
    expect(findLevelAtOrBelow(levels, 5015)).toBe(5010);
    expect(findLevelAtOrAbove(levels, 5015)).toBe(5020);
    expect(findNextLevelAbove(levels, 5010)).toBe(5020);
    expect(findNextLevelBelow(levels, 5010)).toBe(5000);
  });

  it('finds levels between prices with explicit boundary behavior', () => {
    expect(findLevelsBetween(levels, 5000, 5030)).toEqual([5010, 5020]);
    expect(findLevelsBetween(levels, 5000, 5030, true)).toEqual([5000, 5010, 5020, 5030]);
  });

  it('finds multiple upward and downward crossed levels', () => {
    expect(findLevelsCrossedUpward(levels, 4990, 5020)).toEqual([5000, 5010, 5020]);
    expect(findLevelsCrossedDownward(levels, 5030, 5000)).toEqual([5020, 5010, 5000]);
    expect(findLevelsCrossedUpward(levels, 5020, 5010)).toEqual([]);
    expect(findLevelsCrossedDownward(levels, 5010, 5020)).toEqual([]);
  });

  it('returns undefined when no lower or higher level exists', () => {
    expect(findLevelAtOrBelow(levels, 4980)).toBeUndefined();
    expect(findLevelAtOrAbove(levels, 5040)).toBeUndefined();
    expect(findNearestLowerLevel(levels, 4990)).toBeUndefined();
    expect(findNearestHigherLevel(levels, 5030)).toBeUndefined();
  });

  it('calculates absolute distance in /ES points', () => {
    expect(distanceInPoints(5000, 5003)).toBe(3);
    expect(distanceInPoints(5003, 5000)).toBe(3);
    expect(() => distanceInPoints(Number.NaN, 5000)).toThrow(LevelValidationError);
  });
});
