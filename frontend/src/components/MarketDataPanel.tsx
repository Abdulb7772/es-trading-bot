'use client';
import { useEffect, useState } from 'react';
import { Badge } from './Badge';

export function useMarketData() {
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [currentCandle, setCurrentCandle] = useState<{ open: number; high: number; low: number; close: number; timestamp: Date } | null>(null);
  const [ema9, setEma9] = useState<number | null>(null);
  const [ema21, setEma21] = useState<number | null>(null);
  const [levelCount, setLevelCount] = useState<number>(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const basePrice = 5000 + Math.random() * 20 - 10;
      setCurrentPrice(basePrice);
      setCurrentCandle({
        open: basePrice,
        high: basePrice + 5,
        low: basePrice - 5,
        close: basePrice + (Math.random() - 0.5) * 3,
        timestamp: new Date()
      });
      setEma9(basePrice + (Math.random() - 0.5) * 2);
      setEma21(basePrice + (Math.random() - 0.5) * 3);
      setLevelCount(85 + Math.floor(Math.random() * 15));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return { currentPrice, currentCandle, ema9, ema21, levelCount };
}

export function MarketDataPanel() {
  const { currentPrice, currentCandle, ema9, ema21, levelCount } = useMarketData();

  return (
    <div className="market-panel">
      <div className="market-row">
        <span className="market-label">Current /ES Price</span>
        <span className="mono">{currentPrice.toFixed(2)}</span>
      </div>
      <div className="market-row">
        <span className="market-label">15-min Candle</span>
        <span className="mono">
          O:{currentCandle?.open.toFixed(2)} H:{currentCandle?.high.toFixed(2)} L:{currentCandle?.low.toFixed(2)} C:{currentCandle?.close.toFixed(2)}
        </span>
      </div>
      <div className="market-row">
        <span className="market-label">EMA9</span>
        <Badge tone={ema9 !== null ? (ema9 > currentPrice ? 'green' : 'orange') : 'muted'}>
          {ema9?.toFixed(2) ?? '—'}
        </Badge>
      </div>
      <div className="market-row">
        <span className="market-label">EMA21</span>
        <Badge tone={ema21 !== null ? (ema21 > currentPrice ? 'green' : 'orange') : 'muted'}>
          {ema21?.toFixed(2) ?? '—'}
        </Badge>
      </div>
      <div className="market-row">
        <span className="market-label">Loaded Levels</span>
        <span className="mono">{levelCount}</span>
      </div>
    </div>
  );
}