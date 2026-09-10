export interface TopstepXAdapter {
  readonly connect: () => Promise<void>;
  readonly disconnect: () => Promise<void>;
}

// No undocumented endpoints or connection logic belong in the initial scaffold.
