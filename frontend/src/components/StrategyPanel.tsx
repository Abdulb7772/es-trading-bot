'use client';
import { useEffect, useState } from 'react';
import { Badge } from './Badge';

export function useStrategyState() {
  const [enabled, setEnabled] = useState<boolean>(false);
  const [dryRun, setDryRun] = useState<boolean>(true);
  const [showConfirmation, setShowConfirmation] = useState<boolean>(false);
  const [signalState, setSignalState] = useState<'none' | 'long' | 'short'>('none');
  const [lastEvaluated, setLastEvaluated] = useState<{ direction: string; accepted: boolean; timestamp: Date; entry: number; brokenLevel: number | null; nextLevel: number | null; ema9: number; ema21: number; breathingRoom: number | null; rejectionReason?: string } | null>(null);
  const [lastAccepted, setLastAccepted] = useState<{ direction: string; timestamp: Date; entry: number; brokenLevel: number; nextLevel: number; reasoning: string } | null>(null);
  const [lastRejected, setLastRejected] = useState<{ direction: string; timestamp: Date; entry: number; brokenLevel: number; nextLevel: number; reason: string } | null>(null);

  return {
    enabled,
    setEnabled,
    dryRun,
    setDryRun,
    showConfirmation,
    setShowConfirmation,
    signalState,
    setSignalState,
    lastEvaluated,
    setLastEvaluated,
    lastAccepted,
    setLastAccepted,
    lastRejected,
    setLastRejected
  };
}

export function StrategyPanel() {
  const {
    enabled,
    setEnabled,
    dryRun,
    setDryRun,
    signalState,
    lastEvaluated,
    lastAccepted,
    lastRejected,
    showConfirmation,
    setShowConfirmation
  } = useStrategyState();

  return (
    <div className="strategy-panel">
      <div className="strategy-row">
        <span className="strategy-label">Strategy Enabled</span>
        <Badge tone={enabled ? 'green' : 'red'}>
          {enabled ? 'Active' : 'Inactive'}
        </Badge>
      </div>
      <div className="strategy-row">
        <span className="strategy-label">Mode</span>
        <Badge tone={dryRun ? 'orange' : 'green'}>
          {dryRun ? 'DRY_RUN' : 'Practice'}
        </Badge>
      </div>
      {showConfirmation && (
        <div className="confirmation-modal">
          <div className="modal-backdrop" role="presentation" onKeyDown={(event) => { if (event.key === 'Escape') setShowConfirmation(false); }} />
          <div className="modal">
            <div className="eyebrow">Confirm Practice Execution</div>
            <h2>Enable Practice Trading?</h2>
            <p>Switching to Practice mode will allow the bot to submit real orders to your TopstepX Practice account. This requires API credentials and carries risk. Confirm to proceed?</p>
            <div className="modal-actions">
              <button className="button button-secondary" onClick={() => setShowConfirmation(false)}>Cancel</button>
              <button className="button button-primary" onClick={() => { setDryRun(false); setShowConfirmation(false); }}>Enable Practice</button>
            </div>
          </div>
        </div>
      )}
      {showConfirmation === false && (
        <button className="button button-small" onClick={() => setShowConfirmation(true)}>
          {dryRun ? 'Enable Practice Mode' : 'Switch to DRY_RUN'}
        </button>
      )}
      <div className="strategy-row">
        <span className="strategy-label">Current Signal</span>
        <Badge tone={signalState === 'long' ? 'green' : signalState === 'short' ? 'orange' : 'muted'}>
          {signalState === 'none' ? 'None' : signalState.toUpperCase()}
        </Badge>
      </div>
      <div className="strategy-row">
        <span className="strategy-label">Last Evaluated Setup</span>
        {lastEvaluated ? (
          <div>
            <span>Direction: {lastEvaluated.direction}</span>
            <span>Accepted: {lastEvaluated.accepted ? 'Yes' : 'No'}</span>
            <span>Entry: {lastEvaluated.entry.toFixed(2)}</span>
            <span>Broken Level: {lastEvaluated.brokenLevel?.toFixed(2) ?? '—'}</span>
            <span>Next Level: {lastEvaluated.nextLevel?.toFixed(2) ?? '—'}</span>
            <span>EMA9: {lastEvaluated.ema9.toFixed(2)}</span>
            <span>EMA21: {lastEvaluated.ema21.toFixed(2)}</span>
            <span>Breathing Room: {lastEvaluated.breathingRoom?.toFixed(2) ?? '—'}</span>
            {lastEvaluated.rejectionReason && <span>Reason: {lastEvaluated.rejectionReason}</span>}
          </div>
        ) : (
          <span>No setups evaluated yet</span>
        )}
      </div>
      <div className="strategy-row">
        <span className="strategy-label">Last Accepted Setup</span>
        {lastAccepted ? (
          <div>
            <span>Direction: {lastAccepted.direction}</span>
            <span>Entry: {lastAccepted.entry.toFixed(2)}</span>
            <span>Broken Level: {lastAccepted.brokenLevel.toFixed(2)}</span>
            <span>Next Level: {lastAccepted.nextLevel.toFixed(2)}</span>
            <span>Reasoning: {lastAccepted.reasoning}</span>
          </div>
        ) : (
          <span>No accepted setups yet</span>
        )}
      </div>
      <div className="strategy-row">
        <span className="strategy-label">Last Rejected Setup</span>
        {lastRejected ? (
          <div>
            <span>Direction: {lastRejected.direction}</span>
            <span>Entry: {lastRejected.entry.toFixed(2)}</span>
            <span>Broken Level: {lastRejected.brokenLevel.toFixed(2)}</span>
            <span>Next Level: {lastRejected.nextLevel?.toFixed(2) ?? '—'}</span>
            <span>Reason: {lastRejected.reason}</span>
          </div>
        ) : (
          <span>No rejected setups yet</span>
        )}
      </div>
    </div>
  );
}