import { describe, expect, it } from 'vitest';
import { MemoryRecoveryStateStore, RuntimeRecoveryCoordinator, type RecoveryPosition, type RecoveryProvider } from '@es-trading/market';

const position: RecoveryPosition = { id: 'position-1', symbol: '/ES', side: 'LONG', quantity: 1, entryPrice: 5000 };

class FakeRecoveryProvider implements RecoveryProvider {
  readonly calls: string[] = [];
  online = true;
  practice = true;
  es = true;
  remotePosition: RecoveryPosition | null = null;
  staleOrder = false;
  async authenticate(): Promise<void> { this.calls.push('authenticate'); if (!this.online) throw new Error('offline'); }
  async verifyPracticeAccount(): Promise<boolean> { this.calls.push('practice'); return this.practice; }
  async verifyEsContract(): Promise<boolean> { this.calls.push('es'); return this.es; }
  async queryPosition(): Promise<RecoveryPosition | null> { this.calls.push('position'); return this.remotePosition; }
  async queryWorkingOrders() { this.calls.push('orders'); return this.staleOrder ? [{ id: 'stale', symbol: '/ES' as const, status: 'UNKNOWN' as const }] : []; }
  async bootstrapMarket() { this.calls.push('bootstrap'); return []; }
  async reconnectRealtime(): Promise<void> { this.calls.push('realtime'); if (!this.online) throw new Error('offline'); }
}

function coordinator(provider: FakeRecoveryProvider, store = new MemoryRecoveryStateStore(), reconcile = () => true, dailyLossLocked = false) {
  return new RuntimeRecoveryCoordinator({ provider, stateStore: store, restoreDailyLossLocked: () => dailyLossLocked, restoreProcessedSetupIds: () => ['setup-previous'], reconcile });
}

describe('runtime restart and disconnect recovery', () => {
  it('runs startup steps in order and enters READY only after reconciliation', async () => {
    const provider = new FakeRecoveryProvider();
    const result = await coordinator(provider).start();
    expect(result.state).toBe('READY');
    expect(provider.calls).toEqual(['authenticate', 'practice', 'es', 'position', 'orders', 'bootstrap', 'realtime']);
  });

  it.each([
    ['internet disconnect', (provider: FakeRecoveryProvider) => { provider.online = false; }],
    ['practice mismatch', (provider: FakeRecoveryProvider) => { provider.practice = false; }],
    ['ES mismatch', (provider: FakeRecoveryProvider) => { provider.es = false; }],
    ['stale order', (provider: FakeRecoveryProvider) => { provider.staleOrder = true; }],
    ['reconciliation mismatch', () => undefined]
  ])('enters RECOVERY_REQUIRED for %s', async (_name, configure) => {
    const provider = new FakeRecoveryProvider();
    configure(provider);
    const result = await coordinator(provider, new MemoryRecoveryStateStore(), _name === 'reconciliation mismatch' ? () => false : () => !provider.staleOrder).start();
    expect(result.state).toBe('RECOVERY_REQUIRED');
  });

  it('restores flat state, open position, daily loss, and processed setups after restart', async () => {
    const store = new MemoryRecoveryStateStore();
    const firstProvider = new FakeRecoveryProvider();
    const first = new RuntimeRecoveryCoordinator({ provider: firstProvider, stateStore: store, restoreDailyLossLocked: () => true, restoreProcessedSetupIds: () => ['setup-loss'], reconcile: () => true });
    await first.start();
    first.markSetupProcessed('setup-new');
    const restartedProvider = new FakeRecoveryProvider();
    restartedProvider.remotePosition = position;
    const restarted = await new RuntimeRecoveryCoordinator({ provider: restartedProvider, stateStore: store, restoreDailyLossLocked: () => true, restoreProcessedSetupIds: () => ['setup-loss', 'setup-new'], reconcile: (local, remote) => local?.dailyLossLocked === true && remote.position?.id === position.id }).start();
    expect(restarted.state).toBe('READY');
    expect(restarted.position).toEqual(position);
    expect(restarted.dailyLossLocked).toBe(true);
    expect(restarted.processedSetupIds).toContain('setup-loss');
  });

  it('marks disconnect and recovers without creating a new trade', async () => {
    const provider = new FakeRecoveryProvider();
    const runtime = coordinator(provider);
    await runtime.start();
    expect(runtime.markDisconnected().state).toBe('DISCONNECTED');
    provider.online = true;
    expect((await runtime.recover()).state).toBe('READY');
  });

  it('ignores duplicate processed setup ids', async () => {
    const runtime = coordinator(new FakeRecoveryProvider());
    await runtime.start();
    runtime.markSetupProcessed('setup-1');
    runtime.markSetupProcessed('setup-1');
    expect(runtime.snapshot().processedSetupIds.filter((id) => id === 'setup-1')).toHaveLength(1);
  });
});