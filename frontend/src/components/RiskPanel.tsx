'use client';
import { useEffect, useState } from 'react';
import { Badge } from './Badge';
import { getDailyState, getConfig, getStatus } from '../domain/api-client';

export function useRiskState() {
  const [quantity, setQuantity] = useState<number>(1);
  const [riskPoints, setRiskPoints] = useState<number>(10);
  const [targetPoints, setTargetPoints] = useState<number>(10);
  const [minimumBreathingRoom, setMinimumBreathingRoom] = useState<number>(3);
  const [dailyLossLocked, setDailyLossLocked] = useState<boolean>(false);
  const [currentTradingDay, setCurrentTradingDay] = useState<string>(new Date().toISOString().split('T')[0]);
  const [realizedPnl, setRealizedPnl] = useState<number>(0);
  const [dailyLossLimit, setDailyLossLimit] = useState<number>(1000);
  const [lockReason, setLockReason] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [dailyState, config] = await Promise.all([getDailyState(), getConfig()]);
        setQuantity(config.quantity);
        setRiskPoints(config.stopPoints);
        setTargetPoints(config.targetPoints);
        setMinimumBreathingRoom(config.minimumBreathingRoomPoints);
        setDailyLossLocked(dailyState.dailyLossLocked);
        setCurrentTradingDay(dailyState.tradingDay);
        setRealizedPnl(dailyState.realizedPnl);
        setLockReason(dailyState.lockReason);
        setDailyLossLimit(1000);
      } catch {
        // Backend unavailable
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  return {
    quantity,
    setQuantity,
    riskPoints,
    setRiskPoints,
    targetPoints,
    setTargetPoints,
    minimumBreathingRoom,
    setMinimumBreathingRoom,
    dailyLossLocked,
    setDailyLossLocked,
    currentTradingDay,
    setCurrentTradingDay,
    realizedPnl,
    dailyLossLimit,
    lockReason
  };
}

export function RiskPanel() {
  const {
    quantity,
    riskPoints,
    targetPoints,
    minimumBreathingRoom,
    dailyLossLocked,
    currentTradingDay,
    realizedPnl,
    dailyLossLimit,
    lockReason
  } = useRiskState();

  return (
    <div className="risk-panel">
      <div className="risk-row">
        <span className="risk-label">Quantity</span>
        <span className="mono">{quantity}</span>
      </div>
      <div className="risk-row">
        <span className="risk-label">Risk Points</span>
        <span className="mono">{riskPoints}</span>
      </div>
      <div className="risk-row">
        <span className="risk-label">Target Points</span>
        <span className="mono">{targetPoints}</span>
      </div>
      <div className="risk-row">
        <span className="risk-label">Min Breathing Room</span>
        <span className="mono">{minimumBreathingRoom} pts</span>
      </div>
      <div className="risk-row">
        <span className="risk-label">Daily Loss Lock</span>
        <Badge tone={dailyLossLocked ? 'red' : 'green'}>
          {dailyLossLocked ? 'LOCKED' : 'OPEN'}
        </Badge>
      </div>
      {lockReason && (
        <div className="risk-row">
          <span className="risk-label">Lock Reason</span>
          <span className="mono text-sm">{lockReason}</span>
        </div>
      )}
      <div className="risk-row">
        <span className="risk-label">Realized P&L</span>
        <Badge tone={realizedPnl >= 0 ? 'green' : 'red'}>
          ${realizedPnl.toFixed(2)}
        </Badge>
      </div>
      <div className="risk-row">
        <span className="risk-label">Daily Loss Limit</span>
        <span className="mono">${dailyLossLimit}</span>
      </div>
      <div className="risk-row">
        <span className="risk-label">Trading Day</span>
        <span className="mono">{currentTradingDay}</span>
      </div>
    </div>
  );
}