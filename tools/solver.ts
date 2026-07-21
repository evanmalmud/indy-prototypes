/**
 * solver.ts — one brute-force solver for all three pillars.
 *
 * WHY THIS IS POSSIBLE AT ALL: every pillar obeys the same rule — a pure
 * `step(state, intent) => state` with no DOM, no clock and no randomness. A
 * pure step function is a graph edge, so a level is just a directed graph and
 * "is this solvable" is just reachability. Nothing in here knows what a whip
 * is, or which pillar it is searching; it is handed a `SearchSpec` and it walks
 * the graph.
 *
 * WHY IT MATTERS: every level in this repo is currently "proven" by replaying
 * one hardcoded winning script. That proves the level is solvable ONE way. It
 * says nothing about whether the level is short, ambiguous, trivially
 * shortcut-able, or whether its designed insight is actually forced. Only an
 * exhaustive search over the state space can answer those, and only a search
 * can run on a headless server where nobody can play.
 *
 * HONESTY RULE, enforced by the types: every result carries `exhaustive`.
 * `UNSOLVABLE` from a search that ran out of budget is not unsolvable — it is
 * unknown, and the audit is required to print it as unknown. A confident wrong
 * number is worse than an admitted gap.
 */

import type { Intent } from '../src/kernel/input.ts';
import { MOVE, USE_TOOL, WAIT } from '../src/kernel/input.ts';
import type { ToolId } from '../src/kernel/tools.ts';
import type { Dir } from '../src/kernel/grid.ts';
import { ALL_DIRS } from '../src/kernel/grid.ts';

// ---------------------------------------------------------------------------
// The contract a pillar must satisfy to be searchable
// ---------------------------------------------------------------------------

export interface SearchSpec<S> {
  readonly start: S;
  readonly step: (state: S, intent: Intent) => S;
  /**
   * CANONICAL identity. Two states with the same key are interchangeable for
   * every future decision. This is the single most correctness-critical
   * function here: a key that omits something the sim reads (pillar B's turn
   * counter, pillar C's resource pools) makes the solver silently wrong by
   * merging states that are not the same. All three pillars export one.
   */
  readonly key: (state: S) => string;
  readonly isWin: (state: S) => boolean;
  /** Terminal and not a win — a dead end to prune rather than expand. */
  readonly isDead: (state: S) => boolean;
  /** The full move alphabet available in this level. */
  readonly intents: readonly Intent[];
}

export interface SearchLimits {
  /** Hard ceiling on states dequeued. The runaway guard. */
  readonly nodeBudget: number;
  /** Hard ceiling on solution length. */
  readonly maxDepth: number;
}

export const DEFAULT_LIMITS: SearchLimits = { nodeBudget: 400_000, maxDepth: 40 };

export type Outcome =
  | 'SOLVED'
  /** Search completed. The level genuinely has no winning state. */
  | 'UNSOLVABLE'
  /** Ran out of nodes. Says NOTHING about solvability. */
  | 'BUDGET_EXHAUSTED'
  /** Hit maxDepth with frontier still live. Says NOTHING about solvability. */
  | 'DEPTH_EXHAUSTED';

export interface SolveResult {
  readonly outcome: Outcome;
  /** Shortest winning intent sequence, or null. */
  readonly path: readonly Intent[] | null;
  readonly length: number | null;
  readonly nodesExpanded: number;
  readonly statesSeen: number;
  readonly depthReached: number;
  /**
   * True only if the search terminated of its own accord. When false, every
   * negative claim ("unsolvable", "no shorter route") is unproven.
   */
  readonly exhaustive: boolean;
}

// ---------------------------------------------------------------------------
// Move alphabet
// ---------------------------------------------------------------------------

/**
 * Every intent a player could submit in a level carrying `tools`.
 *
 * WAIT is included deliberately. In pillar A it is a proven no-op, so it only
 * costs the solver a little time; in pillar B, where the world advances on its
 * own, waiting is a real and sometimes necessary move — letting the fire run
 * one more tile is a legitimate play. Excluding it would make pillar B's
 * shortest solutions wrong.
 */
export function intentAlphabet(tools: readonly ToolId[]): readonly Intent[] {
  const out: Intent[] = [];
  for (const dir of ALL_DIRS as readonly Dir[]) out.push(MOVE(dir));
  for (const tool of tools) {
    for (const dir of ALL_DIRS as readonly Dir[]) out.push(USE_TOOL(tool, dir));
  }
  out.push(WAIT);
  return out;
}

// ---------------------------------------------------------------------------
// Breadth-first search — shortest solution
// ---------------------------------------------------------------------------

/**
 * BFS for the SHORTEST winning sequence.
 *
 * Breadth-first rather than iterative deepening because the state graph is
 * small enough to hold and revisiting is the dominant cost: IDDFS would
 * re-expand the same states once per depth. The visited set is keyed by
 * `spec.key`, so a state reached two ways is expanded once.
 *
 * Parents are stored rather than paths, so memory is O(states) not
 * O(states x depth).
 */
export function solve<S>(spec: SearchSpec<S>, limits: SearchLimits = DEFAULT_LIMITS): SolveResult {
  const startKey = spec.key(spec.start);

  if (spec.isWin(spec.start)) {
    return {
      outcome: 'SOLVED', path: [], length: 0,
      nodesExpanded: 0, statesSeen: 1, depthReached: 0, exhaustive: true,
    };
  }

  interface Node { readonly state: S; readonly parent: number; readonly via: Intent | null; readonly depth: number; }
  const nodes: Node[] = [{ state: spec.start, parent: -1, via: null, depth: 0 }];
  const seen = new Map<string, number>([[startKey, 0]]);

  let head = 0;
  let expanded = 0;
  let depthReached = 0;
  let truncatedByDepth = false;

  while (head < nodes.length) {
    if (expanded >= limits.nodeBudget) {
      return {
        outcome: 'BUDGET_EXHAUSTED', path: null, length: null,
        nodesExpanded: expanded, statesSeen: seen.size, depthReached, exhaustive: false,
      };
    }

    const index = head++;
    const node = nodes[index];
    expanded++;
    depthReached = Math.max(depthReached, node.depth);

    if (node.depth >= limits.maxDepth) { truncatedByDepth = true; continue; }

    for (const intent of spec.intents) {
      const next = spec.step(node.state, intent);
      // A step that changed nothing is not an edge. Identity is by key, not by
      // object: an informative failure returns a NEW object carrying only a
      // message, and treating that as an edge would let the solver "solve"
      // levels by walking into walls.
      const nextKey = spec.key(next);
      if (nextKey === spec.key(node.state)) continue;
      if (seen.has(nextKey)) continue;

      if (spec.isWin(next)) {
        const path: Intent[] = [intent];
        for (let i = index; i >= 0 && nodes[i].via !== null; i = nodes[i].parent) {
          path.unshift(nodes[i].via as Intent);
        }
        return {
          outcome: 'SOLVED', path, length: path.length,
          nodesExpanded: expanded, statesSeen: seen.size + 1,
          depthReached: node.depth + 1, exhaustive: true,
        };
      }

      seen.set(nextKey, nodes.length);
      // Dead states are recorded as seen (so we never revisit) but never
      // expanded — a drowned player has no future.
      if (spec.isDead(next)) continue;
      nodes.push({ state: next, parent: index, via: intent, depth: node.depth + 1 });
    }
  }

  return {
    outcome: truncatedByDepth ? 'DEPTH_EXHAUSTED' : 'UNSOLVABLE',
    path: null, length: null,
    nodesExpanded: expanded, statesSeen: seen.size, depthReached,
    exhaustive: !truncatedByDepth,
  };
}

// ---------------------------------------------------------------------------
// Reachability — the dead-space proxy
// ---------------------------------------------------------------------------

export interface ReachResult {
  readonly statesSeen: number;
  readonly winStates: number;
  readonly deadStates: number;
  readonly exhaustive: boolean;
}

/**
 * Walk the WHOLE reachable graph without stopping at a win.
 *
 * Two numbers come out of this. `statesSeen` is a dead-space proxy: a level
 * with a huge reachable space and one short solution is mostly rooms the
 * player can wander through pointlessly. `winStates` counts distinct winning
 * configurations, not distinct routes.
 */
export function reachable<S>(
  spec: SearchSpec<S>,
  limits: SearchLimits = DEFAULT_LIMITS,
): ReachResult {
  const seen = new Set<string>([spec.key(spec.start)]);
  const queue: { state: S; depth: number }[] = [{ state: spec.start, depth: 0 }];
  let head = 0;
  let winStates = 0;
  let deadStates = 0;

  while (head < queue.length) {
    if (seen.size >= limits.nodeBudget) {
      return { statesSeen: seen.size, winStates, deadStates, exhaustive: false };
    }
    const node = queue[head++];
    if (node.depth >= limits.maxDepth) continue;
    const nodeKey = spec.key(node.state);

    for (const intent of spec.intents) {
      const next = spec.step(node.state, intent);
      const nextKey = spec.key(next);
      if (nextKey === nodeKey || seen.has(nextKey)) continue;
      seen.add(nextKey);
      if (spec.isWin(next)) { winStates++; continue; }
      if (spec.isDead(next)) { deadStates++; continue; }
      queue.push({ state: next, depth: node.depth + 1 });
    }
  }

  return { statesSeen: seen.size, winStates, deadStates, exhaustive: true };
}

// ---------------------------------------------------------------------------
// Solution-space size — the ambiguity proxy
// ---------------------------------------------------------------------------

export interface CountResult {
  readonly count: number;
  /** True if the cap stopped the count, so `count` is a floor not a total. */
  readonly capped: boolean;
  readonly exhaustive: boolean;
}

/**
 * Count DISTINCT WINNING STATES reachable within `maxLen` moves.
 *
 * This replaces a naive count of distinct winning intent SEQUENCES, which is
 * the metric one reaches for first and which does not survive contact with
 * these levels: with a branching factor around 13 and a 20-move optimum, the
 * path count is 13^22 and a depth-first walk aborts having found nothing,
 * reporting a confident and completely wrong `0`.
 *
 * Distinct winning states is the same question asked in a form that can
 * actually be answered: how many materially different configurations count as
 * winning this room. A room with one winning state has exactly one way to be
 * finished; a room with hundreds ends in hundreds of distinguishable ways, and
 * is correspondingly loose about what it accepts.
 */
export function winStatesWithin<S>(
  spec: SearchSpec<S>,
  maxLen: number,
  limits: SearchLimits,
): CountResult {
  const seen = new Set<string>([spec.key(spec.start)]);
  const queue: { state: S; depth: number }[] = [{ state: spec.start, depth: 0 }];
  let head = 0;
  let wins = 0;

  while (head < queue.length) {
    if (seen.size >= limits.nodeBudget) return { count: wins, capped: true, exhaustive: false };
    const node = queue[head++];
    if (node.depth >= maxLen) continue;
    const nodeKey = spec.key(node.state);

    for (const intent of spec.intents) {
      const next = spec.step(node.state, intent);
      const nextKey = spec.key(next);
      if (nextKey === nodeKey || seen.has(nextKey)) continue;
      seen.add(nextKey);
      if (spec.isWin(next)) { wins++; continue; }
      if (spec.isDead(next)) continue;
      queue.push({ state: next, depth: node.depth + 1 });
    }
  }
  return { count: wins, capped: false, exhaustive: true };
}

/**
 * Count DISTINCT winning intent sequences no longer than `maxLen`.
 *
 * RETAINED FOR REFERENCE, NOT USED BY THE AUDIT. See `winStatesWithin` above
 * for why: on any level with a double-digit optimum this aborts on its node
 * budget and returns a count that looks like a measurement and is not one.
 *
 * This counts routes, not destinations, and it is a deliberately loose proxy:
 * two routes that differ only in the order of two irrelevant steps count
 * twice. That inflation is uniform across levels, so the number is meaningful
 * COMPARATIVELY — a level with 4 routes at optimal+2 is tighter than one with
 * 4000 — but it should never be read as "the designer's alternate solutions".
 *
 * Depth-first with an explicit cap, because the count can be astronomically
 * large and the audit only needs to know "few, many, or too many to count".
 */
export function countSolutions<S>(
  spec: SearchSpec<S>,
  maxLen: number,
  cap: number,
  nodeBudget: number,
): CountResult {
  let count = 0;
  let visits = 0;
  let capped = false;
  let budgetBlown = false;

  const walk = (state: S, depth: number): void => {
    if (capped || budgetBlown) return;
    if (++visits > nodeBudget) { budgetBlown = true; return; }
    if (depth >= maxLen) return;

    const here = spec.key(state);
    for (const intent of spec.intents) {
      if (capped || budgetBlown) return;
      const next = spec.step(state, intent);
      const nextKey = spec.key(next);
      if (nextKey === here) continue;
      if (spec.isWin(next)) {
        if (++count >= cap) { capped = true; return; }
        continue; // a won game does not continue
      }
      if (spec.isDead(next)) continue;
      walk(next, depth + 1);
    }
  };

  walk(spec.start, 0);
  return { count, capped, exhaustive: !capped && !budgetBlown };
}

// ---------------------------------------------------------------------------
// Optimising search — pillar C's cost gradient
// ---------------------------------------------------------------------------

export interface BestRoute<S> {
  readonly value: number;
  readonly path: readonly Intent[];
  readonly state: S;
}

export interface OptimiseResult<S> {
  readonly best: BestRoute<S> | null;
  readonly worst: BestRoute<S> | null;
  readonly winsFound: number;
  readonly exhaustive: boolean;
}

/**
 * Find the highest- and lowest-`value` winning routes within `maxLen`.
 *
 * Pillar C's whole claim is that a room has a solution SPACE with a price
 * attached, not a solution. That claim is falsifiable exactly here: if the
 * cheapest winning route and the highest-scoring winning route are the SAME
 * route, then there is no trade-off to make, no greed to punish, and the
 * pillar is not being exercised in that room at all.
 *
 * Explores by BFS over canonical states, evaluating `value` at every win.
 */
export function optimise<S>(
  spec: SearchSpec<S>,
  value: (state: S) => number,
  limits: SearchLimits = DEFAULT_LIMITS,
): OptimiseResult<S> {
  interface Node { readonly state: S; readonly parent: number; readonly via: Intent | null; readonly depth: number; }
  const nodes: Node[] = [{ state: spec.start, parent: -1, via: null, depth: 0 }];
  const seen = new Set<string>([spec.key(spec.start)]);

  let head = 0;
  let winsFound = 0;
  let best: BestRoute<S> | null = null;
  let worst: BestRoute<S> | null = null;
  let exhaustive = true;

  const pathTo = (index: number, last: Intent): Intent[] => {
    const path: Intent[] = [last];
    for (let i = index; i >= 0 && nodes[i].via !== null; i = nodes[i].parent) {
      path.unshift(nodes[i].via as Intent);
    }
    return path;
  };

  while (head < nodes.length) {
    if (seen.size >= limits.nodeBudget) { exhaustive = false; break; }
    const index = head++;
    const node = nodes[index];
    if (node.depth >= limits.maxDepth) { exhaustive = false; continue; }
    const nodeKey = spec.key(node.state);

    for (const intent of spec.intents) {
      const next = spec.step(node.state, intent);
      const nextKey = spec.key(next);
      if (nextKey === nodeKey || seen.has(nextKey)) continue;
      seen.add(nextKey);

      if (spec.isWin(next)) {
        winsFound++;
        const v = value(next);
        const route: BestRoute<S> = { value: v, path: pathTo(index, intent), state: next };
        if (best === null || v > best.value) best = route;
        if (worst === null || v < worst.value) worst = route;
        continue;
      }
      if (spec.isDead(next)) continue;
      nodes.push({ state: next, parent: index, via: intent, depth: node.depth + 1 });
    }
  }

  return { best, worst, winsFound, exhaustive };
}
