import type { EngineStatus, LogEntry, MarketStatus, SystemStatus, TradingDayState } from '@es-trading/shared';
import { getLogs, getStatus } from './api-client';

export type LogSeverity = LogEntry['severity'];
export type LogComponent = LogEntry['component'];
export type { LogEntry } from '@es-trading/shared';

export type ConnectionHealth = { marketData: MarketStatus['connection']; execution: EngineStatus['state']; backend: SystemStatus['engine'] };
export type SafetyState = Pick<SystemStatus, 'tradingEnabled' | 'dailyLossLocked'> & Pick<TradingDayState, 'hasLosingTrade' | 'canOpenNewTrade'>;

export interface SystemOperationsSnapshot {
  connections: ConnectionHealth;
  engineState: EngineStatus['state'];
  uptime: string;
  lastHeartbeat: string;
  practiceAccountStatus: 'READY' | 'ATTENTION' | 'OFFLINE';
  accountConnectionStatus: 'CONNECTED' | 'DISCONNECTED';
  safety: SafetyState;
  practiceMode: boolean;
  liveModeEnabled: false;
  apiCredentialConfigured: boolean;
  lastReconciliation: string;
  recoveryState: 'NORMAL' | 'RECOVERING' | 'REQUIRES_ATTENTION';
  lastDisconnect: string | null;
}

export async function getSystemSnapshot(): Promise<SystemOperationsSnapshot> {
  const status = await getStatus();
  return {
    connections: { marketData: 'connected', execution: status.engine === 'operational' ? 'running' : 'degraded', backend: status.engine },
    engineState: status.engine === 'operational' ? 'running' : status.engine === 'offline' ? 'stopped' : 'paused',
    uptime: 'Unavailable', lastHeartbeat: status.lastHeartbeat, practiceAccountStatus: status.engine === 'operational' ? 'READY' : 'ATTENTION',
    accountConnectionStatus: 'CONNECTED', safety: { tradingEnabled: status.tradingEnabled, dailyLossLocked: status.dailyLossLocked, hasLosingTrade: status.dailyLossLocked, canOpenNewTrade: !status.dailyLossLocked }, practiceMode: true, liveModeEnabled: false, apiCredentialConfigured: false,
    lastReconciliation: 'Unavailable', recoveryState: 'NORMAL', lastDisconnect: null
  };
}

export { getLogs };
