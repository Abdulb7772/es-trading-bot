'use client';
import { useEffect, useState } from 'react';
import { Badge } from './Badge';

export function useRiskState() {
  const [quantity, setQuantity] = useState<number>(1);
  const [riskPoints, setRiskPoints] = useState<number>(10);
  const [targetPoints, setTargetPoints] = useState<number>(10);
  const [minimumBreathingRoom, setMinimumBreathingRoom] = useState<number>(3);
  const [dailyLossLocked, setDailyLossLocked] = useState<boolean>(false);
  const [currentTradingDay, setCurrentTradingDay] = useState<string>(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    const updateTradingDay = () => {
      setCurrentTradingDay(new Date().toISOString().split('T')[0]);
    };
    updateTradingDay();
    const interval = setInterval(updateTradingDay, 24 * 60 * 60 * 1000);
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
    setCurrentTradingDay
  };
}

export function RiskPanel() {
  const {
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
    currentTradingDay
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
      <div className="risk-row">
        <span className="risk-label">Trading Day</span>
        <span className="mono">{currentTradingDay}</span>
      </div>
    </div>
  );
}