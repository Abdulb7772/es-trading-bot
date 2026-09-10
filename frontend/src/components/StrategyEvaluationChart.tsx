'use client';

import type { ReactNode } from 'react';
import type { DiagnosticCandle, EvaluationResult, WickCheck } from '../domain/evaluations';

export interface StrategyEvaluationChartLevel {
  label: string;
  price: number;
  kind: 'support' | 'resistance' | 'other';
}

export interface StrategyEvaluationChartProps {
  candles: readonly [DiagnosticCandle, DiagnosticCandle, DiagnosticCandle];
  levels: readonly StrategyEvaluationChartLevel[];
  playedLevel: number | null;
  nextLevel: number | null;
  entry: number | null;
  stop: number | null;
  target: number | null;
  decision: EvaluationResult;
  wickDiagnostics: readonly [WickCheck, WickCheck, WickCheck];
}

const width = 660;
const height = 300;
const plot = { left: 68, right: 18, top: 24, bottom: 42 };

function formatPrice(value: number) {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2 });
}

function LegendItem({ className, children }: { className: string; children: ReactNode }) {
  return <span className="chart-legend-item"><i className={className} />{children}</span>;
}

export function StrategyEvaluationChart({ candles, levels, playedLevel, nextLevel, entry, stop, target, decision, wickDiagnostics }: StrategyEvaluationChartProps) {
  const values = [
    ...candles.flatMap((candle) => [candle.high, candle.low]),
    ...levels.map((level) => level.price),
    ...[playedLevel, nextLevel, entry, stop, target].filter((value): value is number => value !== null)
  ];
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const padding = Math.max((maximum - minimum) * 0.14, 1);
  const low = minimum - padding;
  const high = maximum + padding;
  const xFor = (index: number) => plot.left + ((index + 0.5) * (width - plot.left - plot.right)) / candles.length;
  const yFor = (value: number) => plot.top + ((high - value) / (high - low)) * (height - plot.top - plot.bottom);
  const candleWidth = 48;

  return <section className="strategy-chart" aria-label="Three-candle strategy evaluation chart">
    <div className="strategy-chart-heading"><div><h3>Three-candle debug chart</h3><p>Rendered from the returned evaluation payload</p></div><span className={`chart-decision ${decision.toLowerCase()}`}>{decision}</span></div>
    <div className="chart-scroll"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Candles, supplied levels, and trade plan markers"><rect x="0" y="0" width={width} height={height} fill="#fbfcfb" rx="5" />
      {[0, 1, 2, 3].map((tick) => { const value = low + ((high - low) * tick) / 3; return <g key={tick}><line className="chart-grid-line" x1={plot.left} x2={width - plot.right} y1={yFor(value)} y2={yFor(value)} /><text className="chart-axis-label" x={plot.left - 9} y={yFor(value) + 3} textAnchor="end">{formatPrice(value)}</text></g>; })}
      {levels.map((level) => <g key={`${level.label}-${level.price}`}><line className={`chart-level-line ${level.kind}`} x1={plot.left} x2={width - plot.right} y1={yFor(level.price)} y2={yFor(level.price)} /><text className={`chart-level-label ${level.kind}`} x={width - plot.right - 2} y={yFor(level.price) - 4} textAnchor="end">{level.label} {formatPrice(level.price)}</text></g>)}
      {playedLevel !== null && <g><line className="chart-marker-line played" x1={plot.left} x2={width - plot.right} y1={yFor(playedLevel)} y2={yFor(playedLevel)} /><text className="chart-marker-label played" x={plot.left + 5} y={yFor(playedLevel) - 5}>PLAYED {formatPrice(playedLevel)}</text></g>}
      {nextLevel !== null && <g><line className="chart-marker-line next" x1={plot.left} x2={width - plot.right} y1={yFor(nextLevel)} y2={yFor(nextLevel)} /><text className="chart-marker-label next" x={plot.left + 5} y={yFor(nextLevel) + 14}>NEXT / FORBIDDEN {formatPrice(nextLevel)}</text></g>}
      {entry !== null && <g><line className="chart-trade-line entry" x1={plot.left} x2={width - plot.right} y1={yFor(entry)} y2={yFor(entry)} /><text className="chart-trade-label" x={width - plot.right - 2} y={yFor(entry) - 4} textAnchor="end">ENTRY</text></g>}
      {stop !== null && <g><line className="chart-trade-line stop" x1={plot.left} x2={width - plot.right} y1={yFor(stop)} y2={yFor(stop)} /><text className="chart-trade-label" x={width - plot.right - 2} y={yFor(stop) - 4} textAnchor="end">STOP</text></g>}
      {target !== null && <g><line className="chart-trade-line target" x1={plot.left} x2={width - plot.right} y1={yFor(target)} y2={yFor(target)} /><text className="chart-trade-label" x={width - plot.right - 2} y={yFor(target) - 4} textAnchor="end">TARGET</text></g>}
      {candles.map((candle, index) => { const x = xFor(index); const bodyTop = yFor(Math.max(candle.open, candle.close)); const bodyBottom = yFor(Math.min(candle.open, candle.close)); const bodyHeight = Math.max(bodyBottom - bodyTop, 3); return <g key={candle.timestamp}><line className={`chart-wick ${candle.color.toLowerCase()}`} x1={x} x2={x} y1={yFor(candle.high)} y2={yFor(candle.low)} /><rect className={`chart-body ${candle.color.toLowerCase()}`} x={x - candleWidth / 2} y={bodyTop} width={candleWidth} height={bodyHeight} rx="2" /><text className="chart-candle-label" x={x} y={height - 18} textAnchor="middle">CANDLE {index + 1}</text>{wickDiagnostics[index].touchedNextLevel && <circle className="chart-wick-warning" cx={x} cy={yFor(wickDiagnostics[index].nextLevelPrice ?? candle.high)} r="6" />}</g>; })}
    </svg></div>
    <div className="chart-legend"><LegendItem className="legend-body-green">Body / bullish</LegendItem><LegendItem className="legend-body-red">Body / bearish</LegendItem><LegendItem className="legend-wick">Upper and lower wicks</LegendItem><LegendItem className="legend-level-support">Supplied support</LegendItem><LegendItem className="legend-level-resistance">Supplied resistance</LegendItem><LegendItem className="legend-played">Played level</LegendItem><LegendItem className="legend-next">Forbidden next level</LegendItem><LegendItem className="legend-trade">Entry / stop / target</LegendItem></div>
  </section>;
}
