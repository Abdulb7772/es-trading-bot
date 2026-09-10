import { calculateStandardEma21, calculateStandardEma9 } from '@es-trading/indicators';
import { calendarTradingDayResolver, MemoryRiskStateStore, TradingRiskState } from '@es-trading/risk';
import { evaluateDeterministicStrategy } from '@es-trading/strategy';
import type {
  Candle,
  StrategyConfig,
  StrategyEligibility,
  SupportResistanceLevel,
  TradingDecision,
  TradePlan,
  TradingSide
} from '@es-trading/shared';

export interface SimulationInitialState {
  readonly startingBalance: number;
  readonly dailyLossLimit: number;
  readonly pointValue?: number;
  readonly tradingWindowOpen?: boolean;
}

export interface SimulationMarketDataProvider {
  readonly candles: () => AsyncIterable<Candle>;
}

export interface SimulationExecutionProvider {
  readonly open: (plan: TradePlan, candle: Candle) => SimulationPosition;
  readonly settle: (position: SimulationPosition, candle: Candle) => SimulationExit | null;
}

export interface SimulationClock {
  readonly now: () => Date;
  readonly advanceTo: (timestamp: Date) => void;
}

export interface SimulationPosition {
  readonly id: string;
  readonly side: TradingSide;
  readonly quantity: number;
  readonly entryPrice: number;
  readonly stopPrice: number;
  readonly targetPrice: number;
  readonly openedAt: Date;
}

export interface SimulationExit {
  readonly positionId: string;
  readonly price: number;
  readonly reason: 'STOP' | 'TARGET' | 'END_OF_REPLAY';
  readonly exitedAt: Date;
  readonly points: number;
  readonly pnl: number;
}

export interface SimulationEvaluation {
  readonly timestamp: Date;
  readonly decision: TradingDecision;
  readonly skippedBecause?: 'POSITION_OPEN' | 'LOCKED_OUT';
}

export interface SimulationTrade extends SimulationPosition {
  readonly exit: SimulationExit;
}

export interface SimulationDiagnostics {
  readonly candlesProcessed: number;
  readonly evaluations: number;
  readonly acceptedSetups: number;
  readonly rejectedSetups: number;
  readonly exits: number;
  readonly finalBalance: number;
  readonly totalPnl: number;
}

export interface SimulationResult {
  readonly evaluations: readonly SimulationEvaluation[];
  readonly acceptedSetups: readonly TradingDecision[];
  readonly rejectedSetups: readonly TradingDecision[];
  readonly trades: readonly SimulationTrade[];
  readonly exits: readonly SimulationExit[];
  readonly totalPnl: number;
  readonly finalBalance: number;
  readonly lockedOut: boolean;
  readonly diagnostics: SimulationDiagnostics;
}

export interface SimulationInput {
  readonly market: SimulationMarketDataProvider;
  readonly levels: readonly SupportResistanceLevel[];
  readonly config: StrategyConfig;
  readonly initialState: SimulationInitialState;
  readonly clock?: SimulationClock;
  readonly execution?: SimulationExecutionProvider;
  readonly riskState?: TradingRiskState;
}

export class ReplayMarketDataProvider implements SimulationMarketDataProvider {
  constructor(private readonly replayCandles: readonly Candle[]) {}

  async *candles(): AsyncIterable<Candle> {
    for (const candle of this.replayCandles) yield candle;
  }
}

export class DeterministicSimulationClock implements SimulationClock {
  private current: Date;

  constructor(start = new Date(0)) {
    this.current = new Date(start);
  }

  now(): Date {
    return new Date(this.current);
  }

  advanceTo(timestamp: Date): void {
    if (timestamp < this.current) throw new Error('Simulation clock cannot move backwards.');
    this.current = new Date(timestamp);
  }
}

export class DeterministicSimulationExecutionProvider implements SimulationExecutionProvider {
  constructor(private readonly pointValue = 50) {}

  open(plan: TradePlan, candle: Candle): SimulationPosition {
    return {
      id: `sim-trade-${candle.timestamp.getTime()}`,
      side: plan.side,
      quantity: 1,
      entryPrice: plan.entryPrice,
      stopPrice: plan.stopPrice,
      targetPrice: plan.targetPrice,
      openedAt: candle.timestamp
    };
  }

  settle(position: SimulationPosition, candle: Candle): SimulationExit | null {
    const stopHit = position.side === 'LONG' ? candle.low <= position.stopPrice : candle.high >= position.stopPrice;
    const targetHit = position.side === 'LONG' ? candle.high >= position.targetPrice : candle.low <= position.targetPrice;
    if (!stopHit && !targetHit) return null;

    const reason = stopHit ? 'STOP' : 'TARGET';
    const price = reason === 'STOP' ? position.stopPrice : position.targetPrice;
    const points = position.side === 'LONG' ? price - position.entryPrice : position.entryPrice - price;
    return {
      positionId: position.id,
      price,
      reason,
      exitedAt: candle.timestamp,
      points,
      pnl: points * position.quantity * this.pointValue
    };
  }
}

export class SimulationEngine {
  constructor(
    private readonly clockFactory: () => SimulationClock = () => new DeterministicSimulationClock(),
    private readonly executionFactory: (pointValue: number) => SimulationExecutionProvider = (pointValue) => new DeterministicSimulationExecutionProvider(pointValue)
  ) {}

  async run(input: SimulationInput): Promise<SimulationResult> {
    const clock = input.clock ?? this.clockFactory();
    const execution = input.execution ?? this.executionFactory(input.initialState.pointValue ?? 50);
    const riskState = input.riskState ?? new TradingRiskState({ tradingDayResolver: calendarTradingDayResolver(), stateStore: new MemoryRiskStateStore() });
    const history: Candle[] = [];
    const evaluations: SimulationEvaluation[] = [];
    const acceptedSetups: TradingDecision[] = [];
    const rejectedSetups: TradingDecision[] = [];
    const trades: SimulationTrade[] = [];
    const exits: SimulationExit[] = [];
    let position: SimulationPosition | null = null;
    let totalPnl = 0;
    let lastCandle: Candle | null = null;

    for await (const candle of input.market.candles()) {
      clock.advanceTo(candle.timestamp);
      history.push(candle);
      lastCandle = candle;

      if (position) {
        const exit = execution.settle(position, candle);
        if (exit) {
          totalPnl += exit.pnl;
          exits.push(exit);
          trades.push({ ...position, exit });
          riskState.recordRealizedTrade({ result: exit.pnl < 0 ? 'LOSS' : exit.pnl > 0 ? 'WIN' : 'BREAKEVEN', pnl: exit.pnl, timestamp: exit.exitedAt });
          position = null;
        }
      }

      const riskEligibility = riskState.eligibility(candle.timestamp);
      const eligibility: StrategyEligibility = input.initialState.tradingWindowOpen === false
        ? { ...riskEligibility, canOpenNewTrade: false, tradingWindowOpen: false }
        : riskEligibility;
      const decision = evaluateDeterministicStrategy({
        candles: history,
        levels: input.levels,
        config: input.config,
        indicators: {
          emaFast: calculateStandardEma9(history),
          emaSlow: calculateStandardEma21(history)
        },
        eligibility
      });
      const evaluation: SimulationEvaluation = {
        timestamp: candle.timestamp,
        decision,
        ...(position ? { skippedBecause: 'POSITION_OPEN' as const } : riskEligibility.dailyLossLocked ? { skippedBecause: 'LOCKED_OUT' as const } : {})
      };
      evaluations.push(evaluation);

      if (decision.action === 'NO_TRADE') rejectedSetups.push(decision);
      else if (position === null && riskEligibility.canOpenNewTrade && decision.evaluation.tradePlan) {
        acceptedSetups.push(decision);
        position = execution.open(decision.evaluation.tradePlan, candle);
      }
    }

    if (position && lastCandle) {
      const points = position.side === 'LONG' ? lastCandle.close - position.entryPrice : position.entryPrice - lastCandle.close;
      const exit: SimulationExit = {
        positionId: position.id,
        price: lastCandle.close,
        reason: 'END_OF_REPLAY',
        exitedAt: lastCandle.timestamp,
        points,
        pnl: points * position.quantity * (input.initialState.pointValue ?? 50)
      };
      totalPnl += exit.pnl;
      exits.push(exit);
      trades.push({ ...position, exit });
    }

    const diagnostics: SimulationDiagnostics = {
      candlesProcessed: history.length,
      evaluations: evaluations.length,
      acceptedSetups: acceptedSetups.length,
      rejectedSetups: rejectedSetups.length,
      exits: exits.length,
      finalBalance: input.initialState.startingBalance + totalPnl,
      totalPnl
    };
    return { evaluations, acceptedSetups, rejectedSetups, trades, exits, totalPnl, finalBalance: diagnostics.finalBalance, lockedOut: riskState.snapshot()?.losingTradeRecorded ?? false, diagnostics };
  }
}

export const runSimulation = (input: SimulationInput) => new SimulationEngine().run(input);