import type { LevelImportPreview, ParsedLevelRow, UserLevel } from './levels';

function parsePrice(value: string): { price?: number; error?: string } {
  const normalized = value.trim().replace(/[$,]/g, '');
  if (!normalized) return { error: 'Empty value' };
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return { error: 'Not a number' };
  const price = Number(normalized);
  if (!Number.isFinite(price)) return { error: 'Invalid number' };
  if (Math.round(price * 4) / 4 !== price) return { error: 'Must use 0.25 tick increments' };
  return { price };
}

export function parseLevelText(text: string): LevelImportPreview {
  const rows: ParsedLevelRow[] = [];
  const seen = new Set<number>();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  lines.forEach((line, index) => {
    const rawValue = line.split(',')[0].trim();
    const parsed = parsePrice(rawValue);
    const duplicate = parsed.price !== undefined && seen.has(parsed.price);
    if (parsed.price !== undefined) seen.add(parsed.price);
    rows.push({ id: `preview-${index + 1}`, rowNumber: index + 1, rawValue, price: parsed.price, error: parsed.error, duplicate });
  });

  const validLevels = rows.filter((row) => row.price !== undefined && !row.error).map((row, index) => ({ id: `imported-${index + 1}`, price: row.price as number }));
  return { rows, validLevels, invalidCount: rows.filter((row) => row.error).length, duplicateCount: rows.filter((row) => row.duplicate).length };
}

export function levelsToText(levels: UserLevel[]): string {
  return levels.map((level) => level.price.toFixed(2)).join('\n');
}

export function parseJsonLevels(text: string): LevelImportPreview {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return parseLevelText('JSON must contain an array of prices');
    return parseLevelText(parsed.map((entry) => typeof entry === 'number' ? String(entry) : typeof entry === 'string' ? entry : '').join('\n'));
  } catch {
    return parseLevelText('Invalid JSON format');
  }
}
