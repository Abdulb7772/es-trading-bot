'use client';

import { useEffect, useState } from 'react';
import { getSimulationFixtures, runBackendSimulation, type SimulationFixture, type SimulationRunResult } from '../../domain/simulator';
import { getConfig } from '../../domain/api-client';
import { Badge } from '../../components/Badge';
import { DataLine } from '../../components/DataLine';
import { Nav } from '../../components/Nav';

function price(value: number | null) { return value === null ? '—' : value.toLocaleString('en-US', { minimumFractionDigits: 2 }); }

function Comparison({ fixture, result }: { fixture: SimulationFixture; result: SimulationRunResult | null }) {
  return <section className="comparison-grid">
    <article className="comparison-card expected">
      <div className="comparison-header"><span>FIXTURE</span><Badge tone="muted">BACKEND</Badge></div>
      <strong>BACKEND FIXTURE</strong><p>{fixture.description}</p>
    </article>
    <article className={`comparison-card ${result?.comparison === 'PASS' ? 'actual-pass' : 'actual-fail'}`}>
      <div className="comparison-header"><span>ACTUAL</span>
        {result ? <Badge tone={result.comparison === 'PASS' ? 'green' : 'orange'}>{result.comparison}</Badge> : <Badge>Not run</Badge>}
      </div>
      {result ? <><strong>{result.actual.result} · {result.actual.direction}</strong><p>{result.actual.reason}</p></> : <p>Run the fixture to receive the backend result.</p>}
    </article>
  </section>;
}

function RunDetails({ result }: { result: SimulationRunResult }) {
  const evaluation = result.actual;
  return <div className="simulator-results">
    <section className="card">
      <div className="card-header"><div><h2 className="card-title">Decision explanation</h2><p className="card-caption">Returned by the backend strategy evaluation</p></div><Badge tone={evaluation.result === 'ACCEPTED' ? 'green' : 'orange'}>{evaluation.result}</Badge></div>
      <div className="panel-body"><p className="sim-explanation">{evaluation.reason}</p><div className="reason-code">{evaluation.reasonCode}</div></div>
    </section>
    <section className="card">
      <div className="card-header"><div><h2 className="card-title">Wick diagnostics</h2><p className="card-caption">No client-side wick decisions are made</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>Candle</th><th>High / low</th><th>Next-level price</th><th>Touched</th><th>Closed beyond</th></tr></thead><tbody>
        {evaluation.wickChecks.map((check) => <tr key={check.candle}><td>{check.candle}</td><td className="mono">{price(check.high)} / {price(check.low)}</td><td className="mono">{price(check.nextLevelPrice)}</td><td><Badge tone={check.touchedNextLevel ? 'orange' : 'green'}>{check.touchedNextLevel ? 'Yes' : 'No'}</Badge></td><td>{check.closedBeyondNextLevel ? 'Yes' : 'No'}</td></tr>)}
      </tbody></table></div>
      <p className="decision-note">{evaluation.finalWickDecision}</p>
    </section>
    {evaluation.result === 'ACCEPTED' && <section className="card">
      <div className="card-header"><div><h2 className="card-title">Trade plan</h2><p className="card-caption">Returned plan for an accepted setup</p></div><Badge tone="green">Accepted</Badge></div>
      <div className="panel-body inspector-grid">
        <DataLine label="Entry" value={price(evaluation.risk.entry)} /><DataLine label="Stop" value={price(evaluation.risk.stop)} /><DataLine label="Normal target" value={price(evaluation.risk.normalTarget)} /><DataLine label="Next-level target" value={price(evaluation.risk.nextLevelTarget)} /><DataLine label="Final target" value={price(evaluation.risk.finalTarget)} /><DataLine label="Breathing room" value={price(evaluation.breathingRoom)} />
      </div>
    </section>}
  </div>;
}

export default function SimulatorPage() {
  const [fixtures, setFixtures] = useState<SimulationFixture[]>([]);
  const [fixture, setFixture] = useState<SimulationFixture | null>(null);
  const [config, setConfig] = useState<import('@es-trading/shared').StrategyConfig | null>(null);
  const [result, setResult] = useState<SimulationRunResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => { Promise.all([getSimulationFixtures(), getConfig()]).then(([nextFixtures, nextConfig]) => { setFixtures(nextFixtures); setFixture(nextFixtures[0] ?? null); setConfig(nextConfig); }).catch(() => setError(true)).finally(() => setLoading(false)); }, []);
  function selectFixture(next: SimulationFixture) { setFixture(next); setResult(null); setError(false); }
  async function run() { if (!fixture || !config) return; setRunning(true); setError(false); try { setResult(await runBackendSimulation(fixture.id, config)); } catch { setError(true); } finally { setRunning(false); } }

  return (
    <div className="dashboard-shell">
      <Nav activeLabel="Simulator" />
      <div className="main-area">
        <header className="topbar">
          <span className="topbar-title">OPERATIONS / SIMULATOR</span>
          <div className="topbar-status">
            <span className="status-chip"><span className="status-dot" /> Offline engine</span>
            <span>Practice boundary</span>
            <span className="mono">/ES</span>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div><div className="eyebrow">Historical strategy workspace</div><h1>Simulator</h1><p className="page-subtitle">Run deterministic fixtures against the local backend without live connectivity.</p></div>
            <button className="button button-primary" onClick={run} disabled={loading || running}>{running ? 'Running fixture...' : 'Run simulation'}</button>
          </div>
          {error && <div className="card error-state">The local backend simulation service could not return a result.</div>}
          {loading ? <div className="card loading-state">Loading simulation fixtures...</div>
            : !fixture || !config ? <div className="card empty-state">No simulator fixtures are available.</div> : <div className="simulator-layout">
                <aside className="card fixture-list">
                  <div className="card-header"><div><h2 className="card-title">Fixtures</h2><p className="card-caption">{fixtures.length} backend examples</p></div></div>
                  <div className="fixture-items">
                    {fixtures.map((item) => <button className={`fixture-item ${item.id === fixture.id ? 'selected' : ''}`} key={item.id} onClick={() => selectFixture(item)}><strong>{item.name}</strong><span>{item.description}</span></button>)}
                  </div>
                </aside>
                <div className="simulator-workspace">
                  <section className="card fixture-summary">
                    <div className="card-header"><div><div className="eyebrow">Selected fixture</div><h2 className="card-title">{fixture.name}</h2><p className="card-caption">{fixture.description}</p></div><Badge tone="muted">{fixture.id}</Badge></div>
                    <div className="panel-body">
                      <div className="preview-row"><div><h3>Fixture source</h3><div className="preview-values"><span className="mono">Local backend replay</span></div></div><div><h3>Configuration</h3><div className="preview-values"><span className="mono">{config.symbol} · {config.timeframe}</span></div></div></div>
                    </div>
                  </section>
                  <Comparison fixture={fixture} result={result} />
                  {result && <RunDetails result={result} />}
                </div>
              </div>}
        </main>
      </div>
    </div>
  );
}
