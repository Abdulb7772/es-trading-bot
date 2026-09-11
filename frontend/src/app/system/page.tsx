'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { getSystemSnapshot, type SystemOperationsSnapshot } from '../../domain/operations';
import { Badge } from '../../components/Badge';
import { Nav } from '../../components/Nav';

function StatusRow({ label, value, tone = 'green' }: { label: string; value: ReactNode; tone?: 'green' | 'orange' | 'muted' }) { return <div className="system-row"><span>{label}</span><strong><Badge tone={tone}>{value}</Badge></strong></div>; }
function Panel({ title, caption, children }: { title: string; caption: string; children: ReactNode }) { return <article className="card system-panel"><div className="card-header"><div><h2 className="card-title">{title}</h2><p className="card-caption">{caption}</p></div></div><div className="panel-body system-stack">{children}</div></article>; }

export default function SystemPage() {
  const [snapshot, setSnapshot] = useState<SystemOperationsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => { getSystemSnapshot().then(setSnapshot).catch(() => setError(true)).finally(() => setLoading(false)); }, []);

  return (
    <div className="dashboard-shell">
      <Nav activeLabel="System" />
      <div className="main-area">
        <header className="topbar">
          <span className="topbar-title">OPERATIONS / SYSTEM</span>
          <div className="topbar-status">
            <span className="status-chip"><span className="status-dot" /> Local system</span>
            <span>Practice boundary</span>
            <span className="mono">/ES</span>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div><div className="eyebrow">Runtime health and safety</div><h1>System</h1><p className="page-subtitle">Connection, engine, account, safety, and recovery state. Secrets are never displayed.</p></div>
            <Badge tone="green">Mock status</Badge>
          </div>
          {error ? <div className="card error-state">System status could not be loaded from the local mock service.</div>
            : loading ? <div className="card loading-state">Loading system status...</div>
            : snapshot && <section className="system-grid">
                <Panel title="Connection" caption="Service reachability">
                  <StatusRow label="Market data connection" value={snapshot.connections.marketData} />
                  <StatusRow label="Execution connection" value={snapshot.connections.execution} />
                  <StatusRow label="Backend connection" value={snapshot.connections.backend} />
                </Panel>
                <Panel title="Engine" caption="Runtime process">
                  <StatusRow label="Current state" value={snapshot.engineState} />
                  <div className="system-row"><span>Uptime</span><strong className="mono">{snapshot.uptime}</strong></div>
                  <div className="system-row"><span>Last heartbeat</span><strong className="mono">{snapshot.lastHeartbeat}</strong></div>
                </Panel>
                <Panel title="Account" caption="Practice account boundary">
                  <StatusRow label="Practice account status" value={snapshot.practiceAccountStatus} />
                  <StatusRow label="Account connection status" value={snapshot.accountConnectionStatus} />
                </Panel>
                <Panel title="Safety" caption="Credential and execution guardrails">
                  <StatusRow label="Practice mode" value={snapshot.practiceMode ? 'Enabled' : 'Disabled'} />
                  <StatusRow label="Live mode" value={snapshot.liveModeEnabled ? 'Enabled' : 'Disabled'} tone="orange" />
                  <StatusRow label="API credential" value={snapshot.apiCredentialConfigured ? 'Configured' : 'Not configured'} tone={snapshot.apiCredentialConfigured ? 'green' : 'muted'} />
                  <p className="safety-note">Credential values and tokens are intentionally never displayed in this dashboard.</p>
                </Panel>
                <Panel title="Daily-loss protection" caption="Bot-level first-loss lock">
                  <StatusRow label="Trading day" value={snapshot.dailyRisk.tradingDay} tone="muted" />
                  <StatusRow label="Lock status" value={snapshot.dailyRisk.dailyLossLocked ? 'LOCKED' : 'UNLOCKED'} tone={snapshot.dailyRisk.dailyLossLocked ? 'orange' : 'green'} />
                  <div className="system-row"><span>Lock reason</span><strong>{snapshot.dailyRisk.lockReason ?? 'None'}</strong></div>
                  <div className="system-row"><span>Lock triggered</span><strong className="mono">{snapshot.dailyRisk.lockTriggeredAt ?? 'Not triggered'}</strong></div>
                  <div className="system-row"><span>Realized P&amp;L</span><strong className="mono">${snapshot.dailyRisk.realizedPnl.toFixed(2)}</strong></div>
                </Panel>
                <Panel title="Recovery" caption="Reconciliation and disconnect history">
                  <div className="system-row"><span>Last reconciliation</span><strong className="mono">{snapshot.lastReconciliation}</strong></div>
                  <StatusRow label="Current recovery state" value={snapshot.recoveryState} />
                  <div className="system-row"><span>Last disconnect</span><strong className="mono">{snapshot.lastDisconnect ?? 'None recorded'}</strong></div>
                </Panel>
              </section>}
        </main>
      </div>
    </div>
  );
}
