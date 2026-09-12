'use client';
import { useEffect, useState } from 'react';
import { Badge } from './Badge';
import { getTrades } from '../domain/api-client';

export function usePositionState() {
  const [positionSide, setPositionSide] = useState<'flat' | 'long' | 'short'>('flat');
  const [quantity, setQuantity] = useState<number>(1);
  const [entry, setEntry] = useState<number>(0);
  const [stop, setStop] = useState<number>(0);
  const [target, setTarget] = useState<number>(0);
  const [nextLevel, setNextLevel] = useState<number | null>(null);
  const [realizedPnL, setRealizedPnL] = useState<number>(0);
  const [unrealizedPnL, setUnrealizedPnL] = useState<number>(0);

  useEffect(() => {
    const fetchTrades = async () => {
      try {
        const trades = await getTrades();
        const openTrade = trades.find(t => t.status === 'open');
        if (openTrade) {
          setPositionSide(openTrade.side as 'long' | 'short');
          setEntry(openTrade.entry);
          setQuantity(openTrade.contracts);
        } else {
          setPositionSide('flat');
          setEntry(0);
        }
        
        const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
        setRealizedPnL(totalPnl);
      } catch {
        // Backend unavailable
      }
    };

    fetchTrades();
    const interval = setInterval(fetchTrades, 10000);
    return () => clearInterval(interval);
  }, []);

  return {
    positionSide,
    setPositionSide,
    quantity,
    setQuantity,
    entry,
    setEntry,
    stop,
    setStop,
    target,
    setTarget,
    nextLevel,
    setNextLevel,
    realizedPnL,
    setRealizedPnL,
    unrealizedPnL,
    setUnrealizedPnL
  };
}

export function PositionPanel() {
  const {
    positionSide,
    setPositionSide,
    quantity,
    setQuantity,
    entry,
    setEntry,
    stop,
    setStop,
    target,
    setTarget,
    nextLevel,
    setNextLevel,
    realizedPnL,
    setRealizedPnL,
    unrealizedPnL,
    setUnrealizedPnL
  } = usePositionState();

  return (
    <div className="position-panel">
      <div className="position-row">
        <span className="position-label">Position</span>
        <Badge tone={positionSide === 'long' ? 'green' : positionSide === 'short' ? 'orange' : 'muted'}>
          {positionSide.toUpperCase()}
        </Badge>
      </div>
      <div className="position-row">
        <span className="position-label">Quantity</span>
        <span className="mono">{quantity}</span>
      </div>
      <div className="position-row">
        <span className="position-label">Entry</span>
        <span className="mono">{entry.toFixed(2)}</span>
      </div>
      <div className="position-row">
        <span className="position-label">Stop</span>
        <span className="mono">{stop.toFixed(2)}</span>
      </div>
      <div className="position-row">
        <span className="position-label">Target</span>
        <span className="mono">{target.toFixed(2)}</span>
      </div>
      <div className="position-row">
        <span className="position-label">Next Level</span>
        <span className="mono">{nextLevel ? nextLevel.toFixed(2) : '—'}</span>
      </div>
      <div className="position-row">
        <span className="position-label">Realized P&L</span>
        <Badge tone={realizedPnL >= 0 ? 'green' : 'red'}>
          {realizedPnL.toFixed(2)}
        </Badge>
      </div>
      <div className="position-row">
        <span className="position-label">Unrealized P&L</span>
        <Badge tone={unrealizedPnL >= 0 ? 'green' : 'red'}>
          {unrealizedPnL.toFixed(2)}
        </Badge>
      </div>
    </div>
  );
}