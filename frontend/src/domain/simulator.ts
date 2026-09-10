import type { SimulationResult, StrategyConfig } from '@es-trading/shared';
import { getFixtures, runSimulation, type SimulationFixture } from './api-client';

export type { SimulationFixture, SimulationResult as SimulationRunResult };

export async function getSimulationFixtures(): Promise<SimulationFixture[]> {
  return getFixtures();
}

export async function runBackendSimulation(fixtureId: string, config: StrategyConfig): Promise<SimulationResult> {
  return runSimulation({ fixtureId, config });
}
