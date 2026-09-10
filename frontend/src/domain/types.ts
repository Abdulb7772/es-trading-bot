import type { CurrentMarket, IndicatorState, LevelSet, SystemStatus, Trade as SharedTrade } from '@es-trading/shared';

export type ConnectionStatus = 'connected' | 'degraded' | 'offline';
export type ServiceStatus = SystemStatus['engine'];
export type TradeSide = SharedTrade['side'];
export type TradeStatus = SharedTrade['status'];

export type MarketSnapshot = CurrentMarket & IndicatorState & { marketConnection: ConnectionStatus };

export type { SystemStatus } from '@es-trading/shared';

export type Level = LevelSet['levels'][number] & { label: string; kind: 'resistance' | 'support' | 'pivot'; distance: string };

export type Trade = SharedTrade;

export interface DashboardData {
  market: MarketSnapshot;
  system: SystemStatus;
  levels: Level[];
  trades: Trade[];
}
