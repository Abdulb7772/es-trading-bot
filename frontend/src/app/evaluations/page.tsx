'use client';

import { useEffect, useMemo, useState } from 'react';
import { getEvaluations } from '../../domain/api-client';
import type { EvaluationDiagnostics, EvaluationDirection, EvaluationResult } from '../../domain/evaluations';
import { StrategyEvaluationChart } from '../../components/StrategyEvaluationChart';
import { Badge } from '../../components/Badge';
import { DataLine } from '../../components/DataLine';
import { Nav } from '../../components/Nav';

const reasonOptions = ['All reasons', 'CANDLE_3_DID_NOT_BREAK_LEVEL', 'EMA_ALIGNMENT_INVALID', 'INSUFFICIENT_BREATHING_ROOM', 'WICK_TOUCHED_FORBIDDEN_NEXT_LEVEL'];

function price(value: number | null) { return value === null ? '—' : value.toLocaleString('en-US', { minimumFractionDigits: 2 }); }
function dateTime(value: string) { return new Date(value).toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }

function CandleCard({ number, candle }: { number: number; candle: EvaluationDiagnostics['candles'][number] }) {
  return <article className="candle-card"><div className="candle-heading"><strong>Candle {number}</strong><Badge tone={candle.color === 'GREEN' ? 'green' : candle.color === 'RED' ? 'orange' : 'muted'}>{candle.color}</Badge></div><span className="mono candle-time">{candle.timestamp}</span><div className="ohlc-grid"><DataLine label="Open" value={price(candle.open)} /><DataLine label="High" value={price(candle.high)} /><DataLine label="Low" value={price(candle.low)} /><DataLine label="Close" value={price(candle.close)} /></div></article>;
}

function Inspector({ evaluation, onClose }: { evaluation: EvaluationDiagnostics; onClose: () => void }) {
  const chartLevels = [
    evaluation.relevantSupport !== null ? { label: 'SUPPLIED SUPPORT', price: evaluation.relevantSupport, kind: 'support' as const } : null,
    evaluation.relevantResistance !== null ? { label: 'SUPPLIED RESISTANCE', price: evaluation.relevantResistance, kind: 'resistance' as const } : null,
    ...evaluation.allCrossedLevels.filter((level) => level !== evaluation.playedLevel && level !== evaluation.nextLevel).map((level) => ({ label: 'CROSSED LEVEL', price: level, kind: 'other' as const }))
  ].filter((level): level is { label: string; price: number; kind: 'support' | 'resistance' | 'other' } => level !== null);
  return (
    <div className="modal-backdrop" role="presentation" onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}>
      <aside className="inspector" role="dialog" aria-modal="true" aria-labelledby="inspector-title" tabIndex={-1}>
        <div className="inspector-header">
          <div><div className="eyebrow">Backend diagnostic payload</div><h2 id="inspector-title">Evaluation inspector</h2><p className="card-caption">{dateTime(evaluation.timestamp)} · {evaluation.id}</p></div>
          <button className="button button-secondary" onClick={onClose} aria-label="Close inspector">Close</button>
        </div>
        <div className="inspector-summary">
          <Badge tone={evaluation.result === 'ACCEPTED' ? 'green' : 'orange'}>{evaluation.result}</Badge>
          <span className="direction-chip">{evaluation.direction}</span>
          <strong>{evaluation.reasonCode}</strong>
        </div>
        <StrategyEvaluationChart candles={evaluation.candles} levels={chartLevels} playedLevel={evaluation.playedLevel} nextLevel={evaluation.nextLevel} entry={evaluation.risk.entry} stop={evaluation.risk.stop} target={evaluation.risk.finalTarget} decision={evaluation.result} wickDiagnostics={evaluation.wickChecks} />
        <section className="inspector-section"><h3>Three-candle setup</h3><div className="candle-grid">{evaluation.candles.map((candle, index) => <CandleCard key={candle.timestamp} number={index + 1} candle={candle} />)}</div></section>
        <section className="inspector-section"><h3>Indicators</h3><div className="inspector-grid">
          <DataLine label="EMA9" value={price(evaluation.ema9)} /><DataLine label="EMA21" value={price(evaluation.ema21)} /><DataLine label="EMA relationship" value={evaluation.emaRelationship} />
        </div></section>
        <section className="inspector-section"><h3>Levels</h3><div className="inspector-grid">
          <DataLine label="Relevant support" value={price(evaluation.relevantSupport)} /><DataLine label="Relevant resistance" value={price(evaluation.relevantResistance)} /><DataLine label="All crossed levels" value={evaluation.allCrossedLevels.map(price).join(', ') || 'None'} /><DataLine label="Played level" value={price(evaluation.playedLevel)} /><DataLine label="Next level" value={price(evaluation.nextLevel)} />
        </div></section>
        <section className="inspector-section"><h3>Wick validation</h3><div className="wick-table">
          <div className="wick-row wick-header"><span>Candle</span><span>High / low</span><span>Next price</span><span>Touched</span><span>Closed beyond</span></div>
          {evaluation.wickChecks.map((check) => <div className="wick-row" key={check.candle}>
            <span>{check.candle}</span>
            <span className="mono">{price(check.high)} / {price(check.low)}</span>
            <span className="mono">{price(check.nextLevelPrice)}</span>
            <span>{check.touchedNextLevel ? <Badge tone="orange">Yes</Badge> : <Badge tone="green">No</Badge>}</span>
            <span>{check.closedBeyondNextLevel ? 'Yes' : 'No'}</span>
          </div>)}
        </div><p className="decision-note">{evaluation.finalWickDecision}</p></section>
        <section className="inspector-section"><h3>Risk</h3><div className="inspector-grid">
          <DataLine label="Entry" value={price(evaluation.risk.entry)} /><DataLine label="Stop" value={price(evaluation.risk.stop)} /><DataLine label="Normal target" value={price(evaluation.risk.normalTarget)} /><DataLine label="Next-level target" value={price(evaluation.risk.nextLevelTarget)} /><DataLine label="Final target" value={price(evaluation.risk.finalTarget)} /><DataLine label="Breathing room" value={price(evaluation.breathingRoom)} />
        </div></section>
        <section className="inspector-section decision-section"><h3>Decision</h3><div className="decision-banner">
          <Badge tone={evaluation.result === 'ACCEPTED' ? 'green' : 'orange'}>{evaluation.result}</Badge>
          <strong>{evaluation.reasonCode}</strong><p>{evaluation.reason}</p>
        </div></section>
      </aside>
    </div>
  );
}

export default function EvaluationsPage() {
  const [evaluations, setEvaluations] = useState<EvaluationDiagnostics[]>([]);
  const [selected, setSelected] = useState<EvaluationDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [resultFilter, setResultFilter] = useState<'ALL' | EvaluationResult>('ALL');
  const [directionFilter, setDirectionFilter] = useState<'ALL' | EvaluationDirection>('ALL');
  const [reasonFilter, setReasonFilter] = useState('All reasons');
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  useEffect(() => { getEvaluations().then(setEvaluations).catch(() => setError(true)).finally(() => setLoading(false)); }, []);

  const filtered = useMemo(() => evaluations.filter((evaluation) => { const haystack = `${evaluation.id} ${evaluation.reason} ${evaluation.reasonCode} ${evaluation.direction} ${evaluation.result}`.toLowerCase(); return (resultFilter === 'ALL' || evaluation.result === resultFilter) && (directionFilter === 'ALL' || evaluation.direction === directionFilter) && (reasonFilter === 'All reasons' || evaluation.reasonCode === reasonFilter) && (!dateFilter || evaluation.timestamp.startsWith(dateFilter)) && (!search || haystack.includes(search.toLowerCase())); }), [evaluations, resultFilter, directionFilter, reasonFilter, dateFilter, search]);

  return (
    <div className="dashboard-shell">
      <Nav activeLabel="Evaluations" />
      <div className="main-area">
        <header className="topbar">
          <span className="topbar-title">OPERATIONS / EVALUATIONS</span>
          <div className="topbar-status">
            <span className="status-chip"><span className="status-dot" /> Engine online</span>
            <span>Practice account</span>
            <span className="mono">/ES</span>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div><div className="eyebrow">Decision diagnostics</div><h1>Strategy evaluations</h1><p className="page-subtitle">Every accepted and rejected three-candle setup, exactly as returned by the strategy engine.</p></div>
            <Badge tone="muted">{filtered.length} / {evaluations.length} shown</Badge>
          </div>
          <section className="card filter-card">
            <div className="filter-row">
              <label className="filter-search"><span>Search</span><input className="form-input" placeholder="ID, reason, direction..." value={search} onChange={(event) => setSearch(event.target.value)} /></label>
              <label className="filter-field"><span>Result</span><select className="form-input" value={resultFilter} onChange={(event) => setResultFilter(event.target.value as typeof resultFilter)}><option value="ALL">All results</option><option value="ACCEPTED">Accepted</option><option value="REJECTED">Rejected</option></select></label>
              <label className="filter-field"><span>Direction</span><select className="form-input" value={directionFilter} onChange={(event) => setDirectionFilter(event.target.value as typeof directionFilter)}><option value="ALL">All directions</option><option value="LONG">Long</option><option value="SHORT">Short</option></select></label>
              <label className="filter-field"><span>Date</span><input className="form-input" type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} /></label>
              <label className="filter-field"><span>Reason code</span><select className="form-input" value={reasonFilter} onChange={(event) => setReasonFilter(event.target.value)}>{reasonOptions.map((reason) => <option key={reason}>{reason}</option>)}</select></label>
            </div>
          </section>
          {error ? <div className="card error-state">Evaluation diagnostics could not be loaded from the local mock service.</div>
            : loading ? <div className="card loading-state">Loading strategy evaluations...</div>
            : <>
                <section className="card evaluation-table-card">
                  <div className="card-header"><div><h2 className="card-title">Three-candle evaluations</h2><p className="card-caption">Select a row to inspect the complete diagnostic payload.</p></div></div>
                  {filtered.length === 0 ? <div className="empty-state">No evaluations match the current filters.</div>
                    : <div className="table-wrap"><table className="evaluation-table">
                      <thead><tr><th>Time</th><th>Direction</th><th>Result</th><th>Candle 1</th><th>Candle 2</th><th>Candle 3</th><th>EMA state</th><th>Played level</th><th>Next level</th><th>Breathing room</th><th>Reason</th></tr></thead>
                      <tbody>{filtered.map((evaluation) =>
                        <tr key={evaluation.id} className="evaluation-row" tabIndex={0} onClick={() => setSelected(evaluation)} onKeyDown={(event) => { if (event.key === 'Enter') setSelected(evaluation); }}>
                          <td className="mono">{dateTime(evaluation.timestamp)}</td>
                          <td><span className="direction-chip">{evaluation.direction}</span></td>
                          <td><Badge tone={evaluation.result === 'ACCEPTED' ? 'green' : 'orange'}>{evaluation.result}</Badge></td>
                          {evaluation.candles.map((candle) => <td key={candle.timestamp}><span className={`candle-pill ${candle.color.toLowerCase()}`}>{candle.color}</span><small className="mono">{price(candle.close)}</small></td>)}
                          <td className="mono">{evaluation.emaRelationship.replaceAll('_', ' ')}</td>
                          <td className="mono">{price(evaluation.playedLevel)}</td>
                          <td className="mono">{price(evaluation.nextLevel)}</td>
                          <td className="mono">{price(evaluation.breathingRoom)}</td>
                          <td><span className="reason-cell">{evaluation.reasonCode}</span><small>{evaluation.reason}</small></td>
                        </tr>
                      )}</tbody>
                    </table></div>}
                </section>
                {selected && <Inspector evaluation={selected} onClose={() => setSelected(null)} />}
              </>}
        </main>
      </div>
    </div>
  );
}
