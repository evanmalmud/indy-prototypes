/**
 * undo.ts — history stack.
 *
 * Because the simulation is a pure function `step(state, intent) => newState`
 * and states are immutable, undo is just "keep the old pointer". No command
 * objects, no inverse operations, no replay.
 *
 * The 200-entry cap exists because these are deliberation puzzles: a player
 * who needs to rewind more than 200 turns wants RESET, not UNDO.
 */

export const HISTORY_CAP = 200;

export class History<S> {
  private stack: S[] = [];
  private readonly initial: S;
  readonly cap: number;

  constructor(initial: S, cap: number = HISTORY_CAP) {
    if (cap < 1) throw new Error(`history cap must be >= 1, got ${cap}`);
    this.initial = initial;
    this.cap = cap;
  }

  /** How many undos are available. */
  get depth(): number {
    return this.stack.length;
  }

  get canUndo(): boolean {
    return this.stack.length > 0;
  }

  /**
   * Record the state we are leaving, *before* applying a step.
   * Oldest entries are dropped once the cap is reached.
   */
  push(previous: S): void {
    this.stack.push(previous);
    if (this.stack.length > this.cap) {
      this.stack.splice(0, this.stack.length - this.cap);
    }
  }

  /** Returns the previous state, or null if there is nothing to undo. */
  pop(): S | null {
    return this.stack.pop() ?? null;
  }

  /** The state the level started in. RESET returns here. */
  reset(): S {
    this.stack = [];
    return this.initial;
  }

  clear(): void {
    this.stack = [];
  }
}
