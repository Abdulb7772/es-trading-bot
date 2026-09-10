import type { DashboardData } from './types';

export const dashboardData: DashboardData = {
  market: {
    symbol: '/ES',
    mode: 'Practice',
    price: 5_642.25,
    change: 18.75,
    changePercent: 0.33,
    marketConnection: 'connected',
    lastCandle: '10:42:00 CT',
    ema9: 5_639.84,
    ema21: 5_632.17
  },
  system: {
    engine: 'operational',
    tradingEnabled: false,
    dailyLossLocked: false,
    dailyLossUsed: 0,
    dailyLossLimit: 1_000,
    lastHeartbeat: '10:42:12 CT'
  },
  levels: [
    { id: 'r1', label: 'R1', price: 5_655.5, kind: 'resistance', distance: '+13.25 pts' },
    { id: 'prev-high', label: 'Previous high', price: 5_649.75, kind: 'resistance', distance: '+7.50 pts' },
    { id: 'pivot', label: 'Daily pivot', price: 5_638.25, kind: 'pivot', distance: '-4.00 pts' },
    { id: 's1', label: 'S1', price: 5_624.0, kind: 'support', distance: '-18.25 pts' }
  ],
  trades: [
    { id: 'T-1042', time: '10:18:04', side: 'long', entry: 5_630.5, exit: 5_638.25, contracts: 1, pnl: 387.5, status: 'closed' },
    { id: 'T-1041', time: '09:47:22', side: 'short', entry: 5_641.75, exit: 5_635.5, contracts: 1, pnl: 312.5, status: 'closed' },
    { id: 'T-1040', time: '09:12:58', side: 'long', entry: 5_618.0, exit: 5_614.25, contracts: 1, pnl: -187.5, status: 'closed' }
  ]
};
