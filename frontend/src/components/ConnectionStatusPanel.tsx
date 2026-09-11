'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from './Badge';

export function useConnectionStatus() {
  const [backendStatus, setBackendStatus] = useState<'online' | 'offline'>('online');
  const [topstepXStatus, setTopstepXStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [practiceAccount, setPracticeAccount] = useState<boolean | null>(null);
  const [marketDataStatus, setMarketDataStatus] = useState<'disconnected' | 'connected'>('disconnected');
  const [lastMarketTimestamp, setLastMarketTimestamp] = useState<Date | null>(null);
  const router = useRouter();

  // Simulate status updates for local development
  useEffect(() => {
    const interval = setInterval(() => {
      // In production, this would connect to the actual backend/WebSocket
      setBackendStatus('online');
      setTopstepXStatus('connected');
      setPracticeAccount(true);
      setMarketDataStatus('connected');
      setLastMarketTimestamp(new Date());
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const disconnect = useCallback(() => {
    setTopstepXStatus('disconnected');
    setMarketDataStatus('disconnected');
    setLastMarketTimestamp(null);
    router.push('/');
  }, [router]);

  return {
    backendStatus,
    topstepXStatus,
    practiceAccount,
    marketDataStatus,
    lastMarketTimestamp,
    disconnect
  };
}

export function ConnectionStatusPanel({ showDisconnect = false }: { showDisconnect?: boolean } = {}) {
  const {
    backendStatus,
    topstepXStatus,
    practiceAccount,
    marketDataStatus,
    lastMarketTimestamp,
    disconnect
  } = useConnectionStatus();

  return (
    <div className="connection-panel">
      <div className="connection-row">
        <span className="connection-label">Backend</span>
        <Badge tone={backendStatus === 'online' ? 'green' : 'red'}>
          {backendStatus.toUpperCase()}
        </Badge>
      </div>
      <div className="connection-row">
        <span className="connection-label">TopstepX</span>
        <Badge tone={
          topstepXStatus === 'connected' ? 'green' :
          topstepXStatus === 'connecting' ? 'orange' : 'red'
        }>
          {topstepXStatus.toUpperCase()}
        </Badge>
      </div>
      <div className="connection-row">
        <span className="connection-label">Practice Account</span>
        <Badge tone={practiceAccount === true ? 'green' : practiceAccount === false ? 'red' : 'muted'}>
          {practiceAccount !== null ? 'Enabled' : 'Disabled'}
        </Badge>
      </div>
      <div className="connection-row">
        <span className="connection-label">Market Data</span>
        <Badge tone={marketDataStatus === 'connected' ? 'green' : 'red'}>
          {marketDataStatus.toUpperCase()}
        </Badge>
      </div>
      {showDisconnect && lastMarketTimestamp && (
        <div className="connection-row">
          <span className="connection-label">Last Market Data</span>
          <span className="mono">{lastMarketTimestamp.toLocaleTimeString()}</span>
        </div>
      )}
      {showDisconnect && (
        <button className="button button-small" onClick={disconnect}>
          Disconnect
        </button>
      )}
    </div>
  );
}