'use client';

import { useEffect, useState } from 'react';
import { apiErrorMessage, getDashboardData } from '../domain/api-client';
import type { DashboardData, Level, Trade } from '../domain/types';
import { Badge } from '../components/Badge';
import { Nav } from '../components/Nav';

function MetricCard({ label, value, detail, tone = '' }: { label: string; value: string; detail: string; tone?: string }) {
  return <article className="card metric-card"><span className="card-label">{label}</span><strong className={`metric-value ${tone}`}>{value}</strong><span className="metric-detail">{detail}</span></article>;
}

function LevelsTable({ levels }: { levels: Level[] }) {
  if (!levels.length) return <div className="empty-state">No levels loaded for this session.</div>;
  return <div className="table-wrap"><table><thead><tr><th>Level</th><th>Price</th><th>Type</th><th>Distance</th></tr></thead><tbody>{levels.map((level) => <tr key={level.id}><td><strong>{level.label}</strong></td><td className="mono">{level.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td><Badge tone={level.kind === 'resistance' ? 'orange' : level.kind === 'support' ? 'green' : 'muted'}>{level.kind}</Badge></td><td className="mono">{level.distance}</td></tr>)}</tbody></table></div>;
}

function TradesTable({ trades }: { trades: Trade[] }) {
  if (!trades.length) return <div className="empty-state">No trades recorded in this session.</div>;
  return <div className="table-wrap"><table><thead><tr><th>Time</th><th>Side</th><th>Entry / exit</th><th>P&amp;L</th></tr></thead><tbody>{trades.map((trade) => <tr key={trade.id}><td className="mono">{trade.time}</td><td><span className={`side-label ${trade.side === 'short' ? 'short' : ''}`}>{trade.side}</span></td><td className="mono">{trade.entry.toLocaleString('en-US')} {trade.exit ? `/ ${trade.exit.toLocaleString('en-US')}` : ''}</td><td className={`mono ${trade.pnl >= 0 ? 'positive' : 'negative'}`}>{trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}</td></tr>)}</tbody></table></div>;
}

function formatIndicator(value: number | null) {
  return value === null ? 'Unavailable' : value.toLocaleString('en-US', { minimumFractionDigits: 2 });
}

export default function HomePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tradingEnabled, setTradingEnabled] = useState(false);

  useEffect(() => { getDashboardData().then((result) => { setData(result); setTradingEnabled(result.system.tradingEnabled); }).catch((reason: unknown) => setError(apiErrorMessage(reason))); }, []);

  return (
    <div className="dashboard-shell">
      <Nav activeLabel="Dashboard" />
      <div className="main-area">
        <header className="topbar">
          <span className="topbar-title">OPERATIONS / DASHBOARD</span>
          <div className="topbar-status">
            <span className="status-chip"><span className="status-dot" /> Engine online</span>
            <span>Practice account</span>
            <span className="mono">10 Sep 2026 · 10:42 CT</span>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div><div className="eyebrow">Local trading operations</div><h1>Dashboard</h1><p className="page-subtitle">A clear view of the /ES practice engine and its current boundaries.</p></div>
            <button className={`button ${tradingEnabled ? 'button-secondary' : 'button-primary'}`} disabled={!data} onClick={() => setTradingEnabled(!tradingEnabled)}>
              {tradingEnabled ? 'Disable trading' : 'Enable practice trading'}
            </button>
          </div>
          {error ? <div className="card error-state">{error}</div>
            : !data ? <div className="card loading-state">Loading practice workspace...</div>
            : <div>
                <div className="metric-grid grid">
                  <MetricCard label="Symbol" value={data.market.symbol} detail="Practice mode" />
                  <MetricCard label="Price" value={data.market.price.toLocaleString('en-US', { minimumFractionDigits: 2 })} detail={`${data.market.change >= 0 ? '+' : ''}${data.market.change.toFixed(2)} (${data.market.changePercent >= 0 ? '+' : ''}${data.market.changePercent.toFixed(2)}%)`} tone={data.market.change >= 0 ? 'positive' : 'negative'} />
                  <MetricCard label="EMA 9" value={formatIndicator(data.market.ema9)} detail="Fast exponential moving average" />
                  <MetricCard label="EMA 21" value={formatIndicator(data.market.ema21)} detail="Slow exponential moving average" />
                </div>
                <div className="middle-grid grid">
                  <div className="card">
                    <div className="card-header"><div><h2 className="card-title">Quote</h2><p className="card-caption">Current /ES practice market quote</p></div></div>
                    <div className="panel-body">
                      <div className="quote-row"><span className="quote">{data.market.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span><span className={`quote-change mono ${data.market.change >= 0 ? 'positive' : 'negative'}`}>{data.market.change >= 0 ? '+' : ''}{data.market.change.toFixed(2)} ({data.market.changePercent >= 0 ? '+' : ''}{data.market.changePercent.toFixed(2)}%)</span></div>
                      <div className="indicator-grid">
                        <div className="indicator"><small>EMA 9</small><strong>{formatIndicator(data.market.ema9)}</strong></div>
                        <div className="indicator"><small>EMA 21</small><strong>{formatIndicator(data.market.ema21)}</strong></div>
                        <div className="indicator"><small>Spread</small><strong>{data.market.ema9 !== null && data.market.ema21 !== null ? `${data.market.ema9 - data.market.ema21 >= 0 ? '+' : ''}${(data.market.ema9 - data.market.ema21).toFixed(2)}` : 'Unavailable'}</strong></div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="card">
                      <div className="card-header"><div><h2 className="card-title">System status</h2><p className="card-caption">Engine boundaries and safety locks</p></div></div>
                      <div className="panel-body">
                        <div className="status-stack">
                          <div className="status-row"><span>Engine</span><span className="status-value"><Badge tone="green">{data.system.engine}</Badge></span></div>
                          <div className="status-row"><span>Trading</span><span className="status-value"><Badge tone={data.system.tradingEnabled ? 'green' : 'muted'}>{data.system.tradingEnabled ? 'Enabled' : 'Disabled'}</Badge></span></div>
                          <div className="status-row"><span>Daily loss lock</span><span className="status-value"><Badge tone={data.system.dailyLossLocked ? 'orange' : 'green'}>{data.system.dailyLossLocked ? 'Locked' : 'Open'}</Badge></span></div>
                          <div className="status-row"><span>Daily loss used</span><span className="status-value mono">{data.system.dailyLossUsed.toFixed(2)} / {data.system.dailyLossLimit.toFixed(2)}</span></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="lower-grid grid">
                  <div className="card">
                    <div className="card-header"><div><h2 className="card-title">Levels</h2><p className="card-caption">Active /ES levels</p></div></div>
                    <div className="panel-body"><LevelsTable levels={data.levels} /></div>
                  </div>
                  <div className="card">
                    <div className="card-header"><div><h2 className="card-title">Recent trades</h2><p className="card-caption">Executed trades in this session</p></div></div>
                    <div className="panel-body"><TradesTable trades={data.trades} /></div>
                  </div>
                </div>
              </div>}
        </main>
      </div>
    </div>
  );
}
