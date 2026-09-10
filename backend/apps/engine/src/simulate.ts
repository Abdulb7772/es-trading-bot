import { simulationFixture } from '@es-trading/simulation/fixture';
import { runSimulation } from '@es-trading/simulation';

async function main(): Promise<void> {
  const result = await runSimulation(simulationFixture);
  globalThis.console.log(JSON.stringify({
    ...result.diagnostics,
    lockedOut: result.lockedOut,
    trades: result.trades,
    rejectedReasons: result.rejectedSetups.map(({ evaluation }) => evaluation.reasons.map(({ code }) => code))
  }, null, 2));
}

void main();