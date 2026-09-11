'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Nav } from '../../components/Nav';
import { Badge } from '../../components/Badge';
import { ConnectionStatusPanel } from '../../components/ConnectionStatusPanel';
import { MarketDataPanel } from '../../components/MarketDataPanel';
import { StrategyPanel } from '../../components/StrategyPanel';
import { RiskPanel } from '../../components/RiskPanel';
import { PositionPanel } from '../../components/PositionPanel';

export default function DashboardPage() {
  const router = useRouter();
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [mode, setMode] = useState<'dry_run' | 'practice'>('dry_run');

  useEffect(() => {
    // Connection status monitoring
    const interval = setInterval(() => {
      // Status is managed internally by panels
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="dashboard-shell">
      <Nav activeLabel="Dashboard" />
      <div className="main-area">
        <header className="topbar">
          <span className="topbar-title">Bot Control Center</span>
          <div className="topbar-status">
            <span className="status-dot" /> Backend online
            <span>Practice account</span>
            <span className="mono">/ES</span>
          </div>
        </header>
        <main className="main-content">
          <div className="panel-grid">
            <ConnectionStatusPanel showDisconnect={showDisconnect} />
            <MarketDataPanel />
            <StrategyPanel />
            <RiskPanel />
            <PositionPanel />
          </div>
          {mode === 'dry_run' && (
            <div className="mode-banner">
              <span>Mode: DRY_RUN - Simulation only, no orders submitted</span>
            </div>
          )}
          {showConfirmation && (
            <div className="confirmation-modal">
              <div className="modal-backdrop" role="presentation" onKeyDown={(event) => { if (event.key === 'Escape') setShowConfirmation(false); }} />
              <div className="modal">
                <div className="eyebrow">Confirm Practice Execution</div>
                <h2>Enable Practice Trading?</h2>
                <p>Switching to Practice mode will allow the bot to submit real orders to your TopstepX Practice account. This requires API credentials and carries risk. Confirm to proceed?</p>
                <div className="modal-actions">
                  <button className="button button-secondary" onClick={() => setShowConfirmation(false)}>Cancel</button>
                  <button className="button button-primary" onClick={() => { setMode('practice'); setShowConfirmation(false); }}>Enable Practice</button>
                </div>
              </div>
            </div>
          )}
          {showConfirmation === false && mode === 'dry_run' && (
            <button className="button button-small" onClick={() => setShowConfirmation(true)}>
              Enable Practice Mode
            </button>
          )}
        </main>
      </div>
    </div>
  );
}