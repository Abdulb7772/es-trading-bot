import type { StrategyEvaluation } from '@es-trading/shared';

export type EvaluationDirection = StrategyEvaluation['direction'];
export type EvaluationResult = StrategyEvaluation['result'];
export type CandleColor = StrategyEvaluation['candles'][number]['color'];
export type EmaRelationship = StrategyEvaluation['emaRelationship'];
export type DiagnosticCandle = StrategyEvaluation['candles'][number];
export type WickCheck = StrategyEvaluation['wickChecks'][number];

export type EvaluationDiagnostics = StrategyEvaluation;

