/**
 * loop.ts — the turn driver.
 *
 * This is the SHELL, not the simulation. It owns input wiring, history, and
 * "please repaint". It never decides what a turn means.
 *
 * The split is deliberate and load-bearing: everything in this file is
 * unverifiable on a headless server, so everything that decides game outcomes
 * lives outside it, in pure `step(state, intent) => newState` functions that
 * unit tests can prove. See README.md.
 */

import type { Intent } from './input.ts';
import { History, HISTORY_CAP } from './undo.ts';

/** The one signature every prototype's simulation must satisfy. */
export type StepFn<S> = (state: S, intent: Intent) => S;

export interface LoopOptions<S> {
  readonly initial: S;
  readonly step: StepFn<S>;
  readonly render: (state: S) => void;
  /** Stop accepting input once the level is won or lost. */
  readonly isTerminal?: (state: S) => boolean;
  readonly historyCap?: number;
}

/**
 * A turn loop with no timer in it.
 *
 * Turns advance only when `submit` is called, so the loop is driven by
 * player intent rather than by wall-clock time. Pillar B ("the tomb is
 * alive") escalates on turn count, not on elapsed seconds — the board
 * changing under you is still fully deterministic and fully turn-based.
 */
export class TurnLoop<S> {
  private state: S;
  private readonly history: History<S>;
  private readonly stepFn: StepFn<S>;
  private readonly renderFn: (state: S) => void;
  private readonly isTerminal: (state: S) => boolean;
  private turnCount = 0;

  constructor(opts: LoopOptions<S>) {
    this.state = opts.initial;
    this.stepFn = opts.step;
    this.renderFn = opts.render;
    this.isTerminal = opts.isTerminal ?? (() => false);
    this.history = new History<S>(opts.initial, opts.historyCap ?? HISTORY_CAP);
  }

  getState(): S {
    return this.state;
  }

  get turn(): number {
    return this.turnCount;
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  /**
   * Apply one intent. UNDO and RESET are handled here because they are
   * history operations, not simulation operations — the sim stays pure and
   * has no idea history exists.
   */
  submit(intent: Intent): S {
    if (intent.kind === 'UNDO') {
      const prev = this.history.pop();
      if (prev !== null) {
        this.state = prev;
        this.turnCount = Math.max(0, this.turnCount - 1);
      }
      this.renderFn(this.state);
      return this.state;
    }

    if (intent.kind === 'RESET') {
      this.state = this.history.reset();
      this.turnCount = 0;
      this.renderFn(this.state);
      return this.state;
    }

    if (this.isTerminal(this.state)) {
      this.renderFn(this.state);
      return this.state;
    }

    const next = this.stepFn(this.state, intent);

    // A no-op turn (nothing happened) is not worth an undo slot.
    if (next !== this.state) {
      this.history.push(this.state);
      this.state = next;
      this.turnCount++;
    }

    this.renderFn(this.state);
    return this.state;
  }

  /** Paint the initial frame without advancing a turn. */
  start(): void {
    this.renderFn(this.state);
  }
}
