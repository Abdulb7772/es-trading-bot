'use client';

import { useEffect, useMemo, useState } from 'react';
import { getLogs } from '../../domain/api-client';
import type { LogComponent, LogEntry, LogSeverity } from '../../domain/operations';
import { Badge } from '../../components/Badge';
import { Nav } from '../../components/Nav';

function dateTime(value: string) { return new Date(value).toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
const severityTone = (value: LogSeverity) => value === 'ERROR' ? 'orange' : value === 'WARN' ? 'muted' : 'green';

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [severity, setSeverity] = useState<'ALL' | LogSeverity>('ALL');
  const [component, setComponent] = useState<'ALL' | LogComponent>('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => { getLogs().then(setLogs).catch(() => setError(true)).finally(() => setLoading(false)); }, []);
  const filtered = useMemo(() => logs.filter((log) => { const haystack = `${log.event} ${log.message} ${log.evaluationId ?? ''} ${log.tradeId ?? ''} ${log.correlationId}`.toLowerCase(); return (severity === 'ALL' || log.severity === severity) && (component === 'ALL' || log.component === component) && (!search || haystack.includes(search.toLowerCase())); }), [logs, severity, component, search]);

  return (
    <div className="dashboard-shell">
      <Nav activeLabel="Logs" />
      <div className="main-area">
        <header className="topbar">
          <span className="topbar-title">OPERATIONS / LOGS</span>
          <div className="topbar-status">
            <span className="status-chip"><span className="status-dot" /> Engine online</span>
            <span>Local event stream</span>
            <span className="mono">/ES</span>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div><div className="eyebrow">Operational event stream</div><h1>Logs</h1><p className="page-subtitle">Searchable mock events with evaluation, trade, and correlation references.</p></div>
            <Badge tone="muted">{filtered.length} / {logs.length} events</Badge>
          </div>
          <section className="card filter-card">
            <div className="filter-row logs-filter-row">
              <label className="filter-search"><span>Search</span><input className="form-input" placeholder="Event, message, ID..." value={search} onChange={(event) => setSearch(event.target.value)} /></label>
              <label className="filter-field"><span>Severity</span><select className="form-input" value={severity} onChange={(event) => setSeverity(event.target.value as typeof severity)}><option value="ALL">All severities</option><option value="INFO">INFO</option><option value="WARN">WARN</option><option value="ERROR">ERROR</option></select></label>
              <label className="filter-field"><span>Component</span><select className="form-input" value={component} onChange={(event) => setComponent(event.target.value as typeof component)}><option value="ALL">All components</option><option value="strategy">strategy</option><option value="market">market</option><option value="execution">execution</option><option value="system">system</option></select></label>
            </div>
          </section>
          {error ? <div className="card error-state">Logs could not be loaded from the local mock service.</div>
            : loading ? <div className="card loading-state">Loading operational events...</div>
            : <section className="card log-table-card">
                {filtered.length === 0 ? <div className="empty-state">No logs match the current filters.</div>
                  : <div className="table-wrap"><table className="log-table">
                    <thead><tr><th>Timestamp</th><th>Severity</th><th>Component</th><th>Event</th><th>Message</th><th>Evaluation ID</th><th>Trade ID</th><th>Correlation ID</th></tr></thead>
                    <tbody>{filtered.map((log) => <tr key={log.id}>
                      <td className="mono">{dateTime(log.timestamp)}</td>
                      <td><Badge tone={severityTone(log.severity)}>{log.severity}</Badge></td>
                      <td><span className="component-label">{log.component}</span></td>
                      <td className="mono">{log.event}</td>
                      <td>{log.message}</td>
                      <td className="mono">{log.evaluationId ?? '—'}</td>
                      <td className="mono">{log.tradeId ?? '—'}</td>
                      <td className="mono">{log.correlationId}</td>
                    </tr>)}</tbody>
                  </table></div>}
              </section>}
        </main>
      </div>
    </div>
  );
}
