export interface UserLevel {
  id: string;
  price: number;
}

export interface ParsedLevelRow {
  id: string;
  rowNumber: number;
  rawValue: string;
  price?: number;
  error?: string;
  duplicate?: boolean;
}

export interface LevelImportPreview {
  rows: ParsedLevelRow[];
  validLevels: UserLevel[];
  invalidCount: number;
  duplicateCount: number;
}

