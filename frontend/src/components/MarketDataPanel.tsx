'use client';
import { useEffect, useState } from 'react';
import { Badge } from './Badge';
import { getMarket, getLevels, getConfig } from '../domain/api-client';

export function useMarketData() {
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [currentCandle, setCurrentCandle] = useState<{ open: number; high: number; low: number; close: number; timestamp: Date } | null>(null);
  const [ema9, setEma9] = useState<number | null>(null);
  const [ema21, setEma21] = useState<number | null>(null);
  const [levelCount, setLevelCount] = useState<number>(0);
  const [symbol, setSymbol] = useState<string>('/ES');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [market, levelSet, config] = await Promise.all([getMarket(), getLevels(), getConfig()]);
        setCurrentPrice(market.price);
        setCurrentCandle({
          open: market.price,
          high: market.price + 5,
          low: market.price - 5,
          close: market.price + (market.change ?? 0),
          timestamp: new Date(market.lastCandle)
        });
        setLevelCount(levelSet.levels.length);
        setSymbol(config.symbol);
        setEma9(market.ema9);
        setEma21(market.ema21);
      } catch {
        // Backend unavailable
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  return { currentPrice, currentCandle, ema9, ema21, levelCount, symbol };
}

export function MarketDataPanel() {
  const { currentPrice, currentCandle, ema9, ema21, levelCount, symbol } = useMarketData();

  return (
    <div className="market-panel">
      <div className="market-row">
        <span className="market-label">Current {symbol} Price</span>
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