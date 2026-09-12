'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Nav } from '../../components/Nav';
import { Badge } from '../../components/Badge';
import { ConnectionStatusPanel } from '../../components/ConnectionStatusPanel';
import { MarketDataPanel } from '../../components/MarketDataPanel';
import { StrategyPanel } from '../../components/StrategyPanel';
import { RiskPanel } from '../../components/RiskPanel';
import { PositionPanel } from '../../components/PositionPanel';
import { getStatus } from '../../domain/api-client';

export default function DashboardPage() {
  const router = useRouter();
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [mode, setMode] = useState<'dry_run' | 'practice'>('dry_run');
  const [instrument, setInstrument] = useState<string>('/ES');
  const [dailyLossLimit, setDailyLossLimit] = useState<number>(1000);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const status = await getStatus();
        setMode(status.tradingEnabled ? 'practice' : 'dry_run');
      } catch {
        // Backend unavailable
      }
    };
    fetchStatus();
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
            <span className="mono">{instrument}</span>
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
          
          <div className="config-section">
            <h3>Configuration</h3>
            <div className="config-row">
              <label>Instrument</label>
              <select 
                value={instrument} 
                onChange={(e) => setInstrument(e.target.value)}
                className="config-select"
              >
                <option value="/ES">/ES (E-mini S&P 500)</option>
                <option value="/MES">/MES (Micro E-mini S&P 500)</option>
              </select>
            </div>
            <div className="config-row">
              <label>Daily Loss Limit ($)</label>
              <input 
                type="number" 
                value={dailyLossLimit} 
                onChange={(e) => setDailyLossLimit(Number(e.target.value))}
                min="0"
                step="100"
                className="config-input"
              />
            </div>
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