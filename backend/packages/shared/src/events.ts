import type { EngineEvent } from './index';

export interface EventBus {
  readonly publish: (event: EngineEvent) => void;
  readonly subscribe: (handler: (event: EngineEvent) => void) => () => void;
}
