'use client';

import { useEffect, useState } from 'react';
import { Nav } from '../../components/Nav';
import { apiErrorMessage, getTrades } from '../../domain/api-client';
import type { Trade } from '../../domain/types';

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => getTrades().then((data) => { if (active) setTrades(data); }).catch((requestError: unknown) => { if (active) setError(apiErrorMessage(requestError)); });
    load();
    const interval = setInterval(load, 10_000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  return (
    <div className="dashboard-shell">
      <Nav activeLabel="Trades" />
      <div className="main-area">
        <header className="topbar">
          <span className="topbar-title">OPERATIONS / TRADES</span>
          <div className="topbar-status">
            <span className="status-chip"><span className="status-dot" /> Engine online</span>
            <span>Practice account</span>
            <span className="mono">/ES</span>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div><div className="eyebrow">Execution history</div><h1>Trades</h1><p className="page-subtitle">Review trades recorded by the current engine session.</p></div>
          </div>
          <section className="card">
            <div className="card-header"><div><h2 className="card-title">Recorded trades</h2><p className="card-caption">Latest execution activity</p></div></div>
            <div className="panel-body trades-panel-body">
              {error ? <div className="empty-state">{error}</div> : trades.length === 0 ? <div className="empty-state">No trades recorded in this session.</div> : (
                <div className="table-wrap trades-table-wrap"><table className="trades-table"><thead><tr><th>Time</th><th>Side</th><th>Entry / exit</th><th>Contracts</th><th>P&amp;L</th><th>Status</th></tr></thead><tbody>{trades.map((trade) => <tr key={trade.id}><td className="mono">{trade.time}</td><td><span className={`side-label ${trade.side === 'short' ? 'short' : ''}`}>{trade.side}</span></td><td className="mono">{trade.entry.toLocaleString('en-US')} {trade.exit ? `/ ${trade.exit.toLocaleString('en-US')}` : ''}</td><td className="mono">{trade.contracts}</td><td className={`mono ${trade.pnl >= 0 ? 'positive' : 'negative'}`}>{trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}</td><td><span className={`trade-status ${trade.status}`}>{trade.status}</span></td></tr>)}</tbody></table></div>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}