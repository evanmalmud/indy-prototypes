/**
 * audit.ts — the instrument that answers the actual question.
 *
 * The question is not "does this level work". Every level already replays a
 * hardcoded winning script, so every level "works". The question is whether
 * players get an aha from TOOLS INTERACTING, and that needs numbers:
 *
 *   SHORTEST SOLUTION     is the room more than a corridor?
 *   INTERACTION COVERAGE  which pairings does the optimal route actually fire?
 *   FORCED-INTERACTION    delete the claimed aha. Is the room still solvable?
 *   SOLUTION SPACE        how many ways, and how much dead space?
 *   COST GRADIENT (C)     is the cheapest route also the best-scoring one?
 *
 * The forced-interaction test is the one that matters. A level can declare
 * `requires: WHIP+BOULDER` and be perfectly solvable without ever touching a
 * whip — the declaration is a designer's intention, not a property of the
 * puzzle. Deleting the interaction and re-solving is the only way to tell the
 * difference between a designed insight and a suggested one.
 *
 * HONESTY: every search reports whether it was exhaustive. A level whose state
 * space exceeds the node budget is printed as UNKNOWN for the metrics that
 * search could not establish. Partial numbers are never dressed up as complete
 * ones — an admitted gap is worth more than a confident wrong number.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Intent } from '../src/kernel/input.ts';
import * as instrument from '../src/kernel/instrument.ts';
import { enumerateInteractions } from '../src/kernel/tools.ts';
import type { SearchLimits, SearchSpec, SolveResult } from './solver.ts';
import { intentAlphabet, optimise, reachable, solve, winStatesWithin } from './solver.ts';

import * as A from '../src/pillar-a/sim.ts';
import * as B from '../src/pillar-b/sim.ts';
import * as C from '../src/pillar-c/sim.ts';
import { LEVELS as A_LEVELS } from '../src/pillar-a/levels.ts';
import { LEVELS as B_LEVELS } from '../src/pillar-b/levels.ts';
import { LEVELS as C_LEVELS } from '../src/pillar-c/levels.ts';
import { AUTHORED as A_ROUTES } from '../src/pillar-a/routes.ts';
import { AUTHORED as B_ROUTES } from '../src/pillar-b/routes.ts';
import { AUTHORED as C_ROUTES } from '../src/pillar-c/routes.ts';

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

/**
 * Deliberately generous for the shortest-path search (which terminates as soon
 * as it finds a win) and tighter for the whole-space walks (which never
 * terminate early). Tuned so the whole audit runs in a couple of minutes.
 */
const SOLVE_LIMITS: SearchLimits = { nodeBudget: 600_000, maxDepth: 250 };

/**
 * The forced-interaction test needs a DEPTH bound, not just a node bound, and
 * the reason is structural rather than a matter of tuning.
 *
 * Pillar B's canonical state includes the turn counter, because water rises and
 * floors fall on a clock — two boards with identical entities at different
 * turns really are different rooms. A consequence is that the state graph is
 * infinite: the player can stand still forever, and every WAIT manufactures a
 * state never seen before. So "no winning state exists" is not a provable
 * claim there. A search for it simply runs until its budget dies, and reports
 * an inconclusive result that reads like a defect in the level when it is
 * really a property of time being part of the state.
 *
 * Bounding the retry at twice the level's own optimum turns an unprovable
 * claim into a precise and honest one: "with this interaction deleted, the
 * level has no solution within N moves." For a pillar whose hazards only ever
 * get worse with time, that is the operative question anyway — a route that
 * needs more than double the intended moves has drowned long before it ends.
 */
const forcedLimits = (optimal: number): SearchLimits => ({
  nodeBudget: 600_000,
  maxDepth: Math.max(optimal * 2, optimal + 10),
});
const SPACE_LIMITS: SearchLimits = { nodeBudget: 150_000, maxDepth: 250 };

// ---------------------------------------------------------------------------
// A uniform view over three different simulations
// ---------------------------------------------------------------------------

interface LevelView {
  readonly id: string;
  readonly name: string;
  readonly declared: readonly string[];
  readonly teaches: string;
  /** Fresh search space. Rebuilt per experiment so disables take effect. */
  readonly spec: () => SearchSpec<unknown>;
  /** Replay a route, returning the interaction tokens that actually fired. */
  readonly observe: (route: readonly Intent[]) => Observation;
  readonly authored: readonly Intent[] | null;
  /** Pillar C only: the ledger at a winning state. */
  readonly score: ((state: unknown) => number) | null;
  readonly cost: ((state: unknown) => number) | null;
  readonly par: number | null;
}

interface Observation {
  readonly tokens: readonly string[];
  readonly won: boolean;
  /** Steps that changed nothing — the route is stale or wasteful. */
  readonly wasted: number;
}

/**
 * Replay a route through a sim, recording which interactions fired.
 *
 * THE COUNTING RULE, and the reason it is not naive: `resolve()` records a hit
 * whenever a pairing is FOUND, and `findTarget` probes candidates along the
 * ray. A tool aimed at something out of range, or refused for want of a
 * resource, resolves the row without the effect ever landing. So a token is
 * only credited when the step also changed the canonical state key. Pseudo
 * -interactions are recorded at their true occurrence points and pass this
 * filter trivially.
 */
function replay<S>(
  start: S,
  step: (s: S, i: Intent) => S,
  key: (s: S) => string,
  isWin: (s: S) => boolean,
  route: readonly Intent[],
): Observation {
  const tokens = new Set<string>();
  let state = start;
  let wasted = 0;

  for (const intent of route) {
    const before = key(state);
    const seen = instrument.arm();
    const next = step(state, intent);
    instrument.disarm();
    const after = key(next);
    if (after === before) { wasted++; continue; }
    for (const t of seen) tokens.add(t);
    state = next;
    if (isWin(state)) break;
  }

  return { tokens: [...tokens].sort(), won: isWin(state), wasted };
}

function viewA(def: A.LevelDef): LevelView {
  const build = (): SearchSpec<A.SimState> => ({
    start: A.createState(def),
    step: A.step,
    key: A.stateKey,
    isWin: (s) => s.status === 'WON',
    isDead: (s) => s.status === 'LOST',
    intents: intentAlphabet(def.tools),
  });
  return {
    id: def.id, name: def.name, declared: def.requires, teaches: def.teaches,
    spec: build as () => SearchSpec<unknown>,
    observe: (route) => replay(A.createState(def), A.step, A.stateKey, (s) => s.status === 'WON', route),
    authored: A_ROUTES[def.id] ?? null,
    score: null, cost: null, par: null,
  };
}

function viewB(def: B.LevelDef): LevelView {
  const build = (): SearchSpec<B.SimState> => ({
    start: B.createState(def),
    step: B.step,
    key: B.stateKey,
    isWin: (s) => s.status === 'WON',
    isDead: (s) => s.status === 'LOST',
    intents: intentAlphabet(def.tools),
  });
  return {
    id: def.id, name: def.name, declared: def.requires, teaches: def.teaches,
    spec: build as () => SearchSpec<unknown>,
    observe: (route) => replay(B.createState(def), B.step, B.stateKey, (s) => s.status === 'WON', route),
    authored: B_ROUTES[def.id] ?? null,
    score: null, cost: null, par: null,
  };
}

function viewC(def: C.LevelDef): LevelView {
  const build = (): SearchSpec<C.SimState> => ({
    start: C.createState(def),
    step: C.step,
    key: C.stateKey,
    isWin: (s) => s.status === 'WON',
    isDead: (s) => s.status === 'LOST',
    intents: intentAlphabet(def.tools),
  });
  return {
    id: def.id, name: def.name, declared: def.requires, teaches: def.teaches,
    spec: build as () => SearchSpec<unknown>,
    observe: (route) => replay(C.createState(def), C.step, C.stateKey, (s) => s.status === 'WON', route),
    authored: C_ROUTES[def.id] ?? null,
    score: (s) => C.score(s as C.SimState),
    cost: (s) => C.spentPoints(s as C.SimState),
    par: def.par,
  };
}

// ---------------------------------------------------------------------------
// Per-level measurement
// ---------------------------------------------------------------------------

type Verdict = 'TOO EASY' | 'GOOD' | 'AHA NOT FORCED' | 'SUSPECT SHORTCUT' | 'NO COST GRADIENT' | 'UNKNOWN';

interface ForcedResult {
  readonly token: string;
  /**
   * Did the level survive having this interaction deleted? For pillars A and B
   * "survive" means "still reach WON"; for pillar C it means "still meet par",
   * because every C room is winnable at score 0 no matter what you delete.
   */
  readonly stillSolvable: boolean | null;
  readonly lengthWithout: number | null;
  readonly conclusive: boolean;
  /** Pillar C: the best score still achievable without this interaction. */
  readonly bestWithout: number | null;
}

interface LevelReport {
  readonly id: string;
  readonly name: string;
  readonly pillar: string;
  readonly optimal: number | null;
  readonly solveOutcome: string;
  readonly solveExhaustive: boolean;
  readonly authoredLength: number | null;
  readonly authoredWins: boolean | null;
  readonly waste: number | null;
  readonly declared: readonly string[];
  readonly observed: readonly string[];
  readonly distinct: number;
  readonly absent: readonly string[];
  readonly forced: readonly ForcedResult[];
  readonly forcedCount: number;
  readonly routes: number;
  readonly routesCapped: boolean;
  readonly reachableStates: number;
  readonly reachableExhaustive: boolean;
  readonly cheapest: { score: number; cost: number; length: number } | null;
  readonly best: { score: number; cost: number; length: number } | null;
  readonly gradient: boolean | null;
  readonly par: number | null;
  readonly primaryKind: string;
  readonly primaryLength: number | null;
  /** The measured route, written out for any level the audit flags. */
  readonly primaryRoute: string | null;
  readonly verdict: Verdict;
  readonly reasoning: string;
}

function auditLevel(pillar: string, view: LevelView): LevelReport {
  process.stderr.write(`  ${view.id} ${view.name} ... `);

  // 1. shortest solution
  const shortest: SolveResult = solve(view.spec(), SOLVE_LIMITS);
  const optimal = shortest.length;

  // 2. THE ROUTE COVERAGE IS MEASURED ON.
  //
  // For pillars A and B that is the shortest winning route: the room is a lock,
  // so the fastest way through it is the honest description of what it asks.
  //
  // For pillar C it is emphatically NOT. Reaching the exit empty-handed always
  // wins at score 0, so C's shortest route is a sprint past every treasure in
  // the room and fires almost nothing. Measuring C that way says only "you may
  // decline to play", which is the pillar's premise rather than a defect in it.
  // The route that describes a priced room is the BEST-SCORING one.
  const economy = view.score !== null && view.cost !== null;
  const byScore = economy ? optimise(view.spec(), view.score as (s: unknown) => number, SPACE_LIMITS) : null;
  const primaryPath = economy
    ? (byScore?.best?.path ?? null)
    : shortest.path;
  const primaryKind = economy ? 'best-scoring' : 'shortest';

  const observation = primaryPath !== null
    ? view.observe(primaryPath)
    : { tokens: [], won: false, wasted: 0 };

  const declared = view.declared;
  const observed = observation.tokens;
  const absent = declared.filter((d) => !observed.includes(d));

  // 3. the authored route, for waste
  const authoredObs = view.authored !== null ? view.observe(view.authored) : null;
  const authoredLength = view.authored?.length ?? null;

  // 4. FORCED-INTERACTION TEST — delete each claimed interaction, re-measure.
  //
  // "Still solvable" is the wrong question for pillar C, where every room is
  // always solvable at score 0. There the question is whether the room can
  // still MEET ITS OWN PAR with the interaction deleted. A level whose par is
  // still reachable without the interaction did not require it.
  const par = view.par;
  const forced: ForcedResult[] = declared.map((token) =>
    instrument.withDisabled([token], () => {
      if (economy && par !== null) {
        const without = optimise(view.spec(), view.score as (s: unknown) => number, SPACE_LIMITS);
        const reachableScore = without.best === null ? null : (view.score as (s: unknown) => number)(without.best.state);
        if (!without.exhaustive) {
          return { token, stillSolvable: null, lengthWithout: null, conclusive: false, bestWithout: reachableScore };
        }
        const meetsPar = reachableScore !== null && reachableScore >= par;
        return {
          token, stillSolvable: meetsPar, conclusive: true,
          lengthWithout: meetsPar ? (without.best?.path.length ?? null) : null,
          bestWithout: reachableScore,
        };
      }
      const result = solve(view.spec(), forcedLimits(optimal ?? 20));
      if (result.outcome === 'SOLVED') {
        return { token, stillSolvable: true, lengthWithout: result.length, conclusive: true, bestWithout: null };
      }
      // Both a closed search and one stopped by the depth bound answer the
      // question we are actually asking. Only running out of NODES is a
      // genuine gap, because that leaves part of the bounded space unlooked-at.
      if (result.outcome === 'UNSOLVABLE' || result.outcome === 'DEPTH_EXHAUSTED') {
        return { token, stillSolvable: false, lengthWithout: null, conclusive: true, bestWithout: null };
      }
      return { token, stillSolvable: null, lengthWithout: null, conclusive: false, bestWithout: null };
    }),
  );
  const forcedCount = forced.filter((f) => f.stillSolvable === false).length;

  // 5. solution space + dead space
  const counted = optimal !== null
    ? winStatesWithin(view.spec(), optimal + 2, SPACE_LIMITS)
    : { count: 0, capped: false, exhaustive: false };
  const space = reachable(view.spec(), SPACE_LIMITS);

  // 6. pillar C's cost gradient
  let cheapest: LevelReport['cheapest'] = null;
  let best: LevelReport['best'] = null;
  let gradient: boolean | null = null;
  if (economy) {
    const scoreOf = view.score as (s: unknown) => number;
    const costOf = view.cost as (s: unknown) => number;
    const byCheap = optimise(view.spec(), (s) => -costOf(s), SPACE_LIMITS);
    if (byScore?.best != null) {
      best = { score: scoreOf(byScore.best.state), cost: costOf(byScore.best.state), length: byScore.best.path.length };
    }
    if (byCheap.best !== null) {
      cheapest = { score: scoreOf(byCheap.best.state), cost: costOf(byCheap.best.state), length: byCheap.best.path.length };
    }
    // A real gradient means paying more buys more. If the cheapest route
    // already scores what the best route scores, there is no trade to make.
    gradient = best !== null && cheapest !== null ? best.score > cheapest.score : null;
  }

  const report = verdictFor({
    pillar, view, shortest, optimal, observed, absent, forced, forcedCount,
    counted, space, authoredLength, authoredObs, cheapest, best, gradient,
    primaryKind, primaryLength: primaryPath?.length ?? null, par,
    primaryRoute: primaryPath === null ? null : writeRoute(primaryPath),
  });

  process.stderr.write(`${report.verdict}\n`);
  return report;
}

/**
 * A route as a readable move string: `E E SE W` — bare compass letters for
 * steps, `<initial><dir>` for a tool use, `.` for a wait. Written into the
 * report for every flagged level, because "the aha is bypassable" is a claim
 * the reader should be able to check by hand rather than take on trust.
 */
function writeRoute(route: readonly Intent[]): string {
  return route
    .map((i) => {
      if (i.kind === 'MOVE') return i.dir;
      if (i.kind === 'USE_TOOL') return `${i.tool[0]}${i.dir}`;
      return '.'; // WAIT; the solver never emits UNDO or RESET
    })
    .join(' ');
}

// ---------------------------------------------------------------------------
// Verdicts
// ---------------------------------------------------------------------------

interface VerdictInput {
  pillar: string; view: LevelView; shortest: SolveResult; optimal: number | null;
  observed: readonly string[]; absent: readonly string[];
  forced: readonly ForcedResult[]; forcedCount: number;
  counted: { count: number; capped: boolean; exhaustive: boolean };
  space: { statesSeen: number; exhaustive: boolean };
  authoredLength: number | null; authoredObs: Observation | null;
  cheapest: LevelReport['cheapest']; best: LevelReport['best']; gradient: boolean | null;
  primaryKind: string; primaryLength: number | null; par: number | null;
  primaryRoute: string | null;
}

/**
 * Rank the failure modes, worst first, and report the FIRST that applies.
 *
 * Order matters and is a design judgement: a level whose claimed aha is not
 * forced is broken in a way that matters more than being short, because the
 * shortness is at least honest. UNKNOWN outranks everything — a level we could
 * not search is a level we cannot grade.
 */
function verdictFor(v: VerdictInput): LevelReport {
  const { view, shortest, optimal, observed, absent, forced, forcedCount } = v;
  let verdict: Verdict;
  let reasoning: string;

  const inconclusive = forced.filter((f) => !f.conclusive).map((f) => f.token);
  const notForced = forced.filter((f) => f.stillSolvable === true).map((f) => f.token);
  const economy = v.par !== null;
  const survives = economy ? 'still meets par' : 'leaves the level solvable';

  if (optimal === null) {
    verdict = 'UNKNOWN';
    reasoning =
      `The shortest-path search ended as ${shortest.outcome} after ${shortest.nodesExpanded.toLocaleString()} ` +
      `nodes, so nothing about this level's difficulty or coverage is established.`;
  } else if (absent.length > 0) {
    verdict = 'AHA NOT FORCED';
    reasoning =
      `The ${v.primaryKind} winning route (${v.primaryLength} moves) never fires ${absent.join(', ')}, which the level ` +
      `declares it requires — so the designed insight is bypassable and the room teaches something other than what it claims.`;
  } else if (notForced.length > 0) {
    verdict = 'AHA NOT FORCED';
    reasoning =
      `Deleting ${notForced.join(', ')} ${survives}, so ${notForced.length === 1 ? 'that interaction is' : 'those interactions are'} ` +
      `optional decoration rather than a constraint the puzzle enforces.`;
  } else if (v.gradient === false) {
    verdict = 'NO COST GRADIENT';
    reasoning =
      `The cheapest winning route already scores ${v.cheapest?.score}, matching the best route found, so there is ` +
      `no greed to punish here and the pillar's premise is not exercised.`;
  } else if ((v.primaryLength ?? optimal) <= 4) {
    verdict = 'TOO EASY';
    reasoning =
      `The ${v.primaryKind} route is ${v.primaryLength ?? optimal} moves. That is too short for the player to form a ` +
      `hypothesis, let alone have it overturned.`;
  } else if (observed.length === 0) {
    verdict = 'SUSPECT SHORTCUT';
    reasoning =
      `The ${v.primaryKind} winning route fires no interactions at all — the room is completed by walking through it.`;
  } else if (forced.length === 0) {
    verdict = 'SUSPECT SHORTCUT';
    reasoning =
      `The level declares no required interactions, so there is nothing it commits to teaching and nothing to force.`;
  } else if (forcedCount === 0) {
    verdict = 'UNKNOWN';
    reasoning =
      `No declared interaction could be shown load-bearing: the forced-interaction test was inconclusive for ` +
      `${inconclusive.join(', ')} because the search budget ran out. Whether this room forces its aha is unmeasured, not disproven.`;
  } else {
    verdict = 'GOOD';
    const solo = observed.length === 1
      ? ` It is a single-interaction room, which is a design choice rather than a defect when that one interaction is mandatory.`
      : '';
    reasoning =
      `The ${v.primaryKind} route is ${v.primaryLength} moves firing ${observed.length} distinct interaction(s), and ${forcedCount} of ` +
      `${forced.length} declared interaction(s) are genuinely load-bearing — deleting them makes the room ` +
      `${economy ? 'unable to reach par' : 'unsolvable'}.${solo}`;
  }

  if (inconclusive.length > 0 && verdict !== 'UNKNOWN') {
    reasoning += ` (Forced-test inconclusive for ${inconclusive.join(', ')} — search budget exhausted.)`;
  }

  return {
    id: view.id, name: view.name, pillar: v.pillar,
    optimal, solveOutcome: shortest.outcome, solveExhaustive: shortest.exhaustive,
    authoredLength: v.authoredLength,
    authoredWins: v.authoredObs?.won ?? null,
    waste: v.authoredLength !== null && v.primaryLength !== null ? v.authoredLength - v.primaryLength : null,
    declared: view.declared, observed, distinct: observed.length, absent,
    forced, forcedCount,
    routes: v.counted.count, routesCapped: v.counted.capped,
    reachableStates: v.space.statesSeen, reachableExhaustive: v.space.exhaustive,
    cheapest: v.cheapest, best: v.best, gradient: v.gradient, par: view.par,
    primaryKind: v.primaryKind, primaryLength: v.primaryLength, primaryRoute: v.primaryRoute,
    verdict, reasoning,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const TOTAL_ROWS = enumerateInteractions().length;

const yn = (b: boolean | null): string => (b === null ? '?' : b ? 'yes' : 'no');
const num = (n: number | null): string => (n === null ? '—' : String(n));

function levelTable(rows: readonly LevelReport[], withEconomy: boolean): string {
  const cols = [
    'Level', 'Shortest', 'Measured route', 'Authored', 'Waste',
    'Distinct interactions', 'Declared but absent', 'Forced / declared',
    'Win states \u2264 opt+2', 'Reachable states',
  ];
  if (withEconomy) cols.push('Cheapest score', 'Best score', 'Par', 'Gradient');

  const body = rows.map((r) => {
    const cells = [
      `${r.id} ${r.name}`,
      `${num(r.optimal)}${r.solveExhaustive ? '' : '?'}`,
      r.primaryLength === null ? '\u2014' : `${r.primaryLength} (${r.primaryKind})`,
      num(r.authoredLength),
      num(r.waste),
      `${r.distinct} (${r.observed.join(', ') || 'none'})`,
      r.absent.length === 0 ? '\u2014' : `**${r.absent.join(', ')}**`,
      `${r.forcedCount}/${r.forced.length}`,
      `${r.routes.toLocaleString()}${r.routesCapped ? '+' : ''}`,
      `${r.reachableStates.toLocaleString()}${r.reachableExhaustive ? '' : '+'}`,
    ];
    if (withEconomy) {
      cells.push(
        r.cheapest === null ? '\u2014' : String(r.cheapest.score),
        r.best === null ? '\u2014' : String(r.best.score),
        num(r.par),
        yn(r.gradient),
      );
    }
    return `| ${cells.join(' | ')} |`;
  });

  return [`| ${cols.join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`, ...body].join('\n');
}

function rollup(rows: readonly LevelReport[]): string {
  const exercised = new Set<string>();
  for (const r of rows) for (const t of r.observed) exercised.add(t);

  const registry = new Set(enumerateInteractions().map((i) => `${i.tool}+${i.target}`));
  const registryHit = [...exercised].filter((t) => registry.has(t));
  const pseudo = [...exercised].filter((t) => !registry.has(t));

  const graded = rows.filter((r) => r.optimal !== null);
  const avgForced = graded.length === 0
    ? 0
    : graded.reduce((n, r) => n + r.forcedCount, 0) / graded.length;
  const avgOptimal = graded.length === 0
    ? 0
    : graded.reduce((n, r) => n + (r.optimal ?? 0), 0) / graded.length;

  return [
    `| metric | value |`,
    `|---|---|`,
    `| Levels audited | ${rows.length} (${graded.length} conclusively searched) |`,
    `| Total distinct interactions exercised | **${exercised.size}** (${registryHit.length} registry rows + ${pseudo.length} pseudo) |`,
    `| TOOL-MATRIX.md coverage | **${registryHit.length}/${TOTAL_ROWS}** = ${Math.round((registryHit.length / TOTAL_ROWS) * 100)}% of the shared table |`,
    `| Average forced interactions per level | **${avgForced.toFixed(2)}** |`,
    `| Average shortest-route length | ${avgOptimal.toFixed(1)} moves |`,
    `| Levels rated GOOD | ${rows.filter((r) => r.verdict === 'GOOD').length}/${rows.length} |`,
    `| Levels with an unforced aha | ${rows.filter((r) => r.verdict === 'AHA NOT FORCED').length} |`,
    ``,
    `Registry rows exercised: ${registryHit.length === 0 ? '_none_' : registryHit.sort().join(', ')}`,
    ``,
    `Pseudo-interactions exercised (traversal verbs, movement physics, world events): ${pseudo.length === 0 ? '_none_' : pseudo.sort().join(', ')}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const pillars: { id: string; title: string; premise: string; views: LevelView[]; economy: boolean }[] = [
    { id: 'A', title: 'Pillar A — "Clever, not strong"', premise: 'The tomb is inert stone; nothing advances on its own.', views: A_LEVELS.map(viewA), economy: false },
    { id: 'B', title: 'Pillar B — "The tomb is collapsing"', premise: 'The world advances on a clock whether or not the player acts.', views: B_LEVELS.map(viewB), economy: false },
    { id: 'C', title: 'Pillar C — "Greed is the real enemy"', premise: 'The room is not a lock, it is a price list.', views: C_LEVELS.map(viewC), economy: true },
  ];

  const out: string[] = [];
  out.push('# AUDIT.md — measured, not asserted');
  out.push('');
  out.push('Generated by `npm run audit` (`tools/audit.ts`). Every number here comes from an');
  out.push('exhaustive search over a pure `step(state, intent)` simulation — no level was');
  out.push('played, and no number was typed by hand.');
  out.push('');
  out.push('**This document measures. It does not fix.** Levels flagged below are left exactly');
  out.push('as they are; repairing them is a separate piece of work.');
  out.push('');
  out.push(methodology());

  const all: LevelReport[] = [];

  for (const p of pillars) {
    process.stderr.write(`\n${p.title}\n`);
    const rows = p.views.map((v) => auditLevel(p.id, v));
    all.push(...rows);

    out.push('');
    out.push(`## ${p.title}`);
    out.push('');
    out.push(`_${p.premise}_`);
    out.push('');
    out.push(levelTable(rows, p.economy));
    out.push('');
    out.push('### Verdicts');
    out.push('');
    for (const r of rows) {
      out.push(`- **${r.id} ${r.name} — ${r.verdict}.** ${r.reasoning}`);
      const flagged = r.verdict === 'AHA NOT FORCED' || r.verdict === 'SUSPECT SHORTCUT' || r.verdict === 'TOO EASY';
      if (flagged && r.primaryRoute !== null) {
        out.push(`  - Route that does it: \`${r.primaryRoute}\``);
      }
    }
    out.push('');
    out.push(`### Pillar ${p.id} rollup`);
    out.push('');
    out.push(rollup(rows));
  }

  out.push('');
  out.push('## Cross-pillar comparison');
  out.push('');
  out.push('Which pillar actually delivers tool-interaction ahas, by the numbers above.');
  out.push('');
  out.push(comparison(pillars.map((p) => ({ id: p.id, rows: all.filter((r) => r.pillar === p.id) }))));

  const path = join(process.cwd(), 'AUDIT.md');
  writeFileSync(path, out.join('\n') + '\n', 'utf8');
  process.stderr.write(`\nwrote ${path}\n`);
}

function comparison(pillars: readonly { id: string; rows: readonly LevelReport[] }[]): string {
  const registry = new Set(enumerateInteractions().map((i) => `${i.tool}+${i.target}`));
  const lines = [
    '| Pillar | Distinct interactions | TOOL-MATRIX coverage | Avg forced/level | GOOD | AHA NOT FORCED | Unsearchable |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const p of pillars) {
    const ex = new Set<string>();
    for (const r of p.rows) for (const t of r.observed) ex.add(t);
    const hits = [...ex].filter((t) => registry.has(t)).length;
    const graded = p.rows.filter((r) => r.optimal !== null);
    const avg = graded.length === 0 ? 0 : graded.reduce((n, r) => n + r.forcedCount, 0) / graded.length;
    lines.push(
      `| ${p.id} | ${ex.size} | ${hits}/${TOTAL_ROWS} (${Math.round((hits / TOTAL_ROWS) * 100)}%) | ${avg.toFixed(2)} | ` +
      `${p.rows.filter((r) => r.verdict === 'GOOD').length}/${p.rows.length} | ` +
      `${p.rows.filter((r) => r.verdict === 'AHA NOT FORCED').length} | ` +
      `${p.rows.filter((r) => r.verdict === 'UNKNOWN').length} |`,
    );
  }
  return lines.join('\n');
}

function methodology(): string {
  return [
    '## How to read this',
    '',
    '- **Shortest** — fewest moves to reach a winning state, by breadth-first search over',
    '  canonical states. A trailing `?` means the search hit its budget and the number is a bound.',
    '- **Measured route** — the route interaction coverage is measured on, and which route that is',
    '  differs by pillar on purpose. For A and B it is the shortest winning route: those rooms are',
    '  locks, so the fastest way through is the honest account of what the room asks. For C it is the',
    '  HIGHEST-SCORING route, because reaching a pillar-C exit empty-handed always wins at score 0 —',
    '  measuring C on its shortest route would only ever rediscover that a player may decline to play.',
    '- **Authored / Waste** — length of the hand-authored route the test suite replays, and how many',
    '  moves longer it is than the measured route. Waste is not automatically bad: an authored route',
    '  is a demonstration of the intended line, and the intended line is often deliberately scenic.',
    '- **Distinct interactions** — `(tool, target)` pairs that actually fired along the measured route.',
    '  A pair is credited only when the step also changed the canonical state, so a tool aimed at',
    '  something out of range or unaffordable is not counted as having interacted with it.',
    '- **Declared but absent** — interactions the level\'s `requires:` line claims, which the measured',
    '  route never fires. This is the level lying about what it teaches.',
    '- **Forced / declared** — the headline. Each declared interaction is DELETED from the shared',
    '  table and the level re-measured. The count is how many deletions genuinely broke the room.',
    '  "Broke" means unsolvable in pillars A and B; in pillar C it means *unable to reach its own',
    '  `par:`*, since a C room is always winnable at score 0 no matter what you delete.',
    '  **A designed insight the puzzle does not force is a suggestion.**',
    '- **Win states ≤ opt+2** — distinct winning STATES reachable within two moves of optimal, an',
    '  ambiguity proxy: how many materially different configurations count as finishing this room.',
    '  (Counting distinct winning move SEQUENCES was tried first and abandoned — with a branching',
    '  factor near 13 and 20-move optima that count is astronomical, and the walk aborts having found',
    '  nothing, reporting a confident and completely wrong `0`.)',
    '- **Reachable states** — size of the reachable state graph, a dead-space proxy. A trailing `+`',
    '  means the walk hit its node budget and the true figure is larger.',
    '- **Cheapest / Best / Gradient** (pillar C only) — the score of the least-spending winning route',
    '  against the highest-scoring one. `Gradient: no` would mean the cheapest route already scores',
    '  what the best route scores, so there is no trade to make and the greed pillar is not exercised.',
    '',
    '### Caveats that limit these numbers',
    '',
    '1. **Deletion semantics.** Deleting a registry row makes `resolve()` return null, which every sim',
    '   already treats as "no such pairing" — the ray passes through. Pseudo-interactions (traversal',
    '   verbs, movement physics, world events) have no `resolve()` call, so each sim consults the same',
    '   disable flag at the point of occurrence. Two deletions carry a judgement call: `COLLAPSE+BOULDER`',
    '   makes the floor hold under a stone rather than dropping it, and `TORCH+DARK` stops carried fire',
    '   answering darkness while leaving brazier light intact.',
    '2. **Pillar B\'s state includes the turn counter**, so its state graph is infinite — a player can',
    '   wait forever and every WAIT manufactures a new state. "No solution exists" is therefore not',
    '   provable there. The forced test bounds each retry at twice the level\'s own optimum and reports',
    '   the precise claim it can support: *no solution within N moves*. For a pillar whose hazards only',
    '   worsen with time, a route needing more than double the intended moves has drowned anyway.',
    '3. **Pillar C\'s `requires:` is documented as describing the PAR ROUTE**, not the set of necessary',
    '   interactions (`src/pillar-c/levels.ts`). Pillar C is built on substitution, so a cheaper route',
    '   being a subset of the par route is the design working, not failing.',
    '4. **Budget-limited rows are marked, never rounded off.** Where a search did not complete, the',
    '   verdict is `UNKNOWN` rather than a guess, and bounded figures carry `?` or `+`.',
    '5. **This audit measures the sim, not the felt experience.** It can prove an interaction is',
    '   mechanically unavoidable. It cannot prove a player will *notice* the moment it becomes',
    '   necessary, which is what an aha actually is. A GOOD verdict here is a necessary condition for',
    '   the designed insight to land, not a sufficient one.',
  ].join('\n');
}

main();
