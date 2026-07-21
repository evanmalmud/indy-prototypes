/**
 * sim.test.ts — the only evidence these levels work.
 *
 * There is no display on this machine. Nobody has seen a single frame of this
 * prototype. So every claim it makes is made here or not at all:
 *
 *   1. REPLAYS. Every level has a hardcoded winning intent sequence, run
 *      through the pure sim, asserted to reach WON. If a level is broken, a
 *      replay fails; there is no other way to find out.
 *   2. THE PROOF. Level 4 is exhaustively searched over its ENTIRE push-only
 *      state space, and asserted to contain no winning state — then searched
 *      again with the whip, and asserted to contain one. That pair is what
 *      turns "the intended solution is to pull" into "pulling is the only
 *      solution", which is the difference between a designed aha and a
 *      suggested one.
 */

import { describe, expect, it } from 'vitest';

// The level file as text, so the structured comments can be checked against
// the data they describe. `?raw` keeps this dependency-free — no @types/node.
import levelsSource from './levels.ts?raw';
import type { Dir, EntityKind } from '../kernel/grid.ts';
import { ALL_DIRS, DIRS, eq, vec } from '../kernel/grid.ts';
import type { Intent } from '../kernel/input.ts';
import { MOVE, USE_TOOL } from '../kernel/input.ts';
import { renderAscii } from '../kernel/render.ts';
import type { ToolId } from '../kernel/tools.ts';
import { coverage, resolve } from '../kernel/tools.ts';
import { LEVELS } from './levels.ts';
import type { LevelDef, SimState } from './sim.ts';
import { createState, stateKey, step } from './sim.ts';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const M = (dir: Dir): Intent => MOVE(dir);
const T = (tool: ToolId, dir: Dir): Intent => USE_TOOL(tool, dir);
const rep = (n: number, intent: Intent): Intent[] => Array.from({ length: n }, () => intent);

/** Run a replay, and on failure show the board and the step it died on. */
function play(def: LevelDef, script: readonly Intent[]): SimState {
  let state = createState(def);
  script.forEach((intent, i) => {
    const before = state;
    state = step(state, intent);
    if (state === before && intent.kind !== 'WAIT') {
      throw new Error(
        `${def.id} step ${i} (${JSON.stringify(intent)}) did nothing\n` +
          `player at ${state.player.x},${state.player.y}\n` +
          renderAscii(state).join('\n'),
      );
    }
  });
  return state;
}

function expectWin(def: LevelDef, script: readonly Intent[]): SimState {
  const state = play(def, script);
  expect(
    state.status,
    `${def.id} "${def.name}" did not end in a win\n` +
      `player at ${state.player.x},${state.player.y}, msg: ${state.message}\n` +
      renderAscii(state).join('\n'),
  ).toBe('WON');
  return state;
}

// ---------------------------------------------------------------------------
// The exhaustive solver used for the level-4 proof
// ---------------------------------------------------------------------------

export interface SearchResult {
  readonly win: boolean;
  readonly explored: number;
  /** False if the cap was hit — a "no win" result would then be meaningless. */
  readonly exhausted: boolean;
  readonly winScript: readonly Intent[];
}

/**
 * Breadth-first over the WHOLE reachable state space, restricted to a set of
 * allowed tools.
 *
 * `allowed: []` is a player who can do nothing but walk — which, because
 * walking into a boulder pushes it, is exactly "movement and pushing only".
 * The search is complete: it terminates when the frontier empties, and the
 * `exhausted` flag reports whether that actually happened or whether the cap
 * cut it short. A `win: false` from a non-exhausted search proves nothing, so
 * the tests assert both.
 */
function search(def: LevelDef, allowed: readonly ToolId[], cap = 400_000): SearchResult {
  const start: SimState = { ...createState(def), tools: allowed };

  const intents: Intent[] = [];
  for (const d of ALL_DIRS) intents.push(M(d));
  for (const tool of allowed) for (const d of ALL_DIRS) intents.push(T(tool, d));

  const seen = new Set<string>([stateKey(start)]);
  let frontier: { state: SimState; path: Intent[] }[] = [{ state: start, path: [] }];
  let explored = 0;

  while (frontier.length > 0) {
    const nextFrontier: { state: SimState; path: Intent[] }[] = [];
    for (const node of frontier) {
      explored++;
      if (explored > cap) {
        return { win: false, explored, exhausted: false, winScript: [] };
      }
      for (const intent of intents) {
        const next = step(node.state, intent);
        if (next === node.state) continue;
        const k = stateKey(next);
        if (seen.has(k)) continue;
        seen.add(k);
        const path = [...node.path, intent];
        if (next.status === 'WON') {
          return { win: true, explored, exhausted: true, winScript: path };
        }
        if (next.status === 'PLAYING') nextFrontier.push({ state: next, path });
      }
    }
    frontier = nextFrontier;
  }

  return { win: false, explored, exhausted: true, winScript: [] };
}

// ---------------------------------------------------------------------------
// 1. Every level parses and is well-formed
// ---------------------------------------------------------------------------

describe('levels', () => {
  it('all six parse, spawn a player, and expose an exit', () => {
    expect(LEVELS).toHaveLength(6);
    for (const def of LEVELS) {
      const state = createState(def);
      expect(state.status, def.id).toBe('PLAYING');
      expect(state.map.find('EXIT').length, `${def.id} has no exit`).toBeGreaterThan(0);
      expect(state.turn).toBe(0);
    }
  });

  it('every level rectangle is uniform width', () => {
    for (const def of LEVELS) {
      const widths = new Set(def.rows.map((r) => r.length));
      expect(widths.size, `${def.id} has ragged rows: ${[...widths].join(',')}`).toBe(1);
    }
  });

  it('every `requires:` token names a real registry row or a declared traversal verb', () => {
    // The three non-registry tokens are legended at the top of levels.ts.
    const nonRegistry = new Set(['PUSH+BOULDER', 'WHIP+GAP', 'SATCHEL+PIT']);
    for (const def of LEVELS) {
      expect(def.requires.length, `${def.id} requires nothing`).toBeGreaterThan(0);
      for (const token of def.requires) {
        if (nonRegistry.has(token)) continue;
        const [tool, target] = token.split('+');
        expect(
          resolve(tool as ToolId, target as never),
          `${def.id} requires ${token}, which is not a row of the shared table`,
        ).not.toBeNull();
      }
    }
  });

  it('the structured comments match the exported data', () => {
    // The comments are the authored artefact and tooling parses them, so they
    // are not allowed to drift away from the objects they describe.
    const blocks: string[][] = [...levelsSource.matchAll(/\/\*\*\s*\n([\s\S]*?)\*\//g)]
      .map((m: RegExpMatchArray) =>
        m[1].split('\n').map((line: string) => line.replace(/^\s*\*\s?/, '')),
      )
      .filter((lines: string[]) => lines.some((l: string) => l.startsWith('LEVEL ')));

    expect(blocks, 'expected one structured comment per level').toHaveLength(6);

    const field = (lines: string[], name: string): string => {
      const line = lines.find((l) => l.startsWith(`${name}:`));
      if (line === undefined) throw new Error(`comment block is missing ${name}:`);
      return line.slice(name.length + 1).trim();
    };

    blocks.forEach((lines, i) => {
      const def = LEVELS[i];
      expect(lines[0], `block ${i}`).toContain(def.name);
      expect(field(lines, 'teaches'), `${def.id} teaches`).toBe(def.teaches);
      expect(field(lines, 'requires'), `${def.id} requires`).toBe(def.requires.join(', '));
      expect(field(lines, 'aha'), `${def.id} aha`).toBe(def.aha);
    });
  });

  it('exercises three of the six seeded aha interactions, and admits which three it misses', () => {
    const pairs: (readonly [ToolId, EntityKind])[] = LEVELS.flatMap((l) =>
      l.requires
        .map((r) => r.split('+') as [ToolId, EntityKind])
        .filter(([tool]) => tool !== ('PUSH' as ToolId))
        .filter(([, target]) => target !== ('GAP' as EntityKind) && target !== ('PIT' as EntityKind)),
    );

    const cov = coverage(pairs);

    expect(cov.ahaUsed.map((i) => `${i.tool}+${i.target}`).sort()).toEqual([
      'REVOLVER+ROPE',
      'SATCHEL+PRESSURE_PLATE',
      'WHIP+BOULDER',
    ]);

    // The three misses are deliberate, and two of them are findings rather
    // than gaps. TORCH+OIL_TRAIL needs the board to advance on turn count,
    // which is the one thing this pillar forbids. REVOLVER+GAS_VENT is a
    // lethal trap, and lethality is pressure. See NOTES.md.
    expect(cov.ahaMissed.map((i) => `${i.tool}+${i.target}`).sort()).toEqual([
      'REVOLVER+GAS_VENT',
      'TORCH+OIL_TRAIL',
      'WHIP+TORCH_ITEM',
    ]);
  });

  it('keeps the whip and a boulder out of the same room until level 4', () => {
    // This is what protects the flagship reveal. If a boulder and a whip ever
    // co-exist before the sealed vault, a curious player finds the pull early,
    // as a feature of a new toy rather than as a law of the world breaking.
    for (const def of LEVELS.slice(0, 3)) {
      const hasBoulder = createState(def).entities.some((e) => e.kind === 'BOULDER');
      expect(
        def.tools.includes('WHIP') && hasBoulder,
        `${def.id} shows a whip and a boulder together before the reveal`,
      ).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Replays — one hardcoded winning sequence per level
// ---------------------------------------------------------------------------

describe('replays', () => {
  it('a1 The Antechamber — push the boulder onto the plate, sand the pit', () => {
    const state = expectWin(LEVELS[0], [
      ...rep(2, M('E')), // walk up behind the stone
      ...rep(3, M('E')), // three pushes: the law being installed
      ...rep(5, M('W')),
      ...rep(3, M('S')), // down through the opened portcullis
      T('SATCHEL', 'E'), // the pit becomes floor
      ...rep(3, M('E')),
    ]);
    expect(state.sand).toBe(0);
  });

  it('a2 The Weighing Room — scoop the pile, sand the plate, walk away from it', () => {
    const state = expectWin(LEVELS[1], [
      T('SATCHEL', 'E'), // scoop: satchel starts empty
      ...rep(2, M('E')),
      T('SATCHEL', 'E'), // substitute weight onto the plate
      ...rep(5, M('E')),
      ...rep(2, M('S')),
    ]);
    expect(state.sand).toBe(0);
  });

  it('a3 The Cracked Gallery — shoot the landing spot, then swing to it', () => {
    expectWin(LEVELS[2], [
      T('REVOLVER', 'E'), // shatter the stone on the far lip
      T('WHIP', 'E'), // now there is somewhere to land
      T('REVOLVER', 'E'), // second stone, building the revolver habit
      ...rep(7, M('E')),
    ]);
  });

  it('a4 The Sealed Vault — the pull', () => {
    const state = expectWin(LEVELS[3], [
      ...rep(5, M('E')), // east along the top of the chamber
      M('S'),
      ...rep(2, M('E')),
      M('N'), // onto the firing tile at the water's edge
      T('WHIP', 'E'), // PULL the boulder one tile WEST onto the plate
      M('S'),
      ...rep(2, M('W')),
      M('S'),
      ...rep(3, M('W')),
      ...rep(3, M('S')),
    ]);
    expect(state.gatesOpen).toBe(true);
  });

  it('a5 The Two Scales — sand the near plate, pull for the far one', () => {
    const state = expectWin(LEVELS[4], [
      ...rep(3, M('E')),
      T('SATCHEL', 'E'), // near plate: the satchel's one load
      ...rep(3, M('E')),
      T('WHIP', 'E'), // far plate: weight from across the water
      ...rep(6, M('W')),
      ...rep(4, M('S')),
    ]);
    expect(state.sand).toBe(0);
    expect(state.gatesOpen).toBe(true);
  });

  it("a6 The Architect's Last Joke — sever, then the pull that undoes the mistake", () => {
    const state = expectWin(LEVELS[5], [
      T('SATCHEL', 'E'), // plate one, held by sand
      ...rep(3, M('E')),
      T('REVOLVER', 'E'), // sever: the boulder drops and seals the doorway
      ...rep(3, M('W')),
      ...rep(2, M('S')),
      ...rep(8, M('E')), // the long way round to under the blockage
      T('WHIP', 'N'), // one move: clears the doorway AND arms plate two
      ...rep(8, M('W')),
      ...rep(2, M('N')),
      ...rep(10, M('E')),
    ]);
    expect(state.gatesOpen).toBe(true);
  });

  it('the severed boulder really does seal the doorway first', () => {
    // The middle link has to LOOK like a blunder or the finale has no joke.
    let state = createState(LEVELS[5]);
    for (const intent of [...rep(3, M('E')), T('REVOLVER', 'E')]) {
      state = step(state, intent);
    }
    const fallen = state.entities.find((e) => e.kind === 'BOULDER');
    expect(fallen, 'severing should drop a boulder').toBeDefined();
    expect(eq(fallen!.at, vec(9, 1))).toBe(true);

    // With the doorway plugged, the only route east is gone.
    const blocked = step(state, M('E'));
    for (let i = 0; i < 5; i++) state = step(state, M('E'));
    expect(state.player.x, 'the player cannot walk past the fallen stone').toBeLessThan(9);
    expect(blocked.status).toBe('PLAYING');
  });
});

// ---------------------------------------------------------------------------
// 3. THE PROOF — level 4 is closed to pushing
// ---------------------------------------------------------------------------

describe('a4 is unsolvable by pushing — the flagship proof', () => {
  const L4 = LEVELS[3];

  it('CONTROL: the searcher does find push-only wins when they exist', () => {
    // A negative result from a broken searcher looks exactly like a proof, so
    // the searcher has to be shown finding a win first. This room is the
    // sealed vault with the geometry inverted: the plate is WEST of the
    // boulder and there is floor to shove from, so pushing solves it.
    const control: LevelDef = {
      ...L4,
      id: 'control',
      rows: [
        '##########',
        '#@.._.O..#',
        '#........#',
        '#####+####',
        '#####>####',
        '##########',
      ],
    };
    const result = search(control, []);
    expect(result.win, 'the push-only searcher cannot find a win it should find').toBe(true);
    expect(result.winScript.every((i) => i.kind === 'MOVE')).toBe(true);
  });

  it('exhausts the entire movement-and-pushing state space and finds no win', () => {
    const result = search(L4, []);
    expect(result.exhausted, 'search hit its cap, so a null result proves nothing').toBe(true);
    expect(
      result.explored,
      'the push-only space is too small for the player to have genuinely tried pushing',
    ).toBeGreaterThan(100);
    expect(
      result.win,
      'a push-only player solved the sealed vault — the flagship aha is optional, not forced',
    ).toBe(false);
  });

  it('is still closed to a player with the satchel and the revolver but no whip', () => {
    // The level hands the player all three of those tools, so "no push-only
    // win" is not enough on its own: the sand could have substituted onto the
    // plate. It cannot — the plate is unreachable on foot, forever.
    const result = search(L4, ['SATCHEL', 'REVOLVER']);
    expect(result.exhausted).toBe(true);
    expect(result.win, 'the satchel or the revolver solved the vault without the whip').toBe(false);
  });

  it('opens the moment the whip is allowed, and the whip alone is enough', () => {
    const result = search(L4, ['WHIP']);
    expect(result.win, 'the vault is not solvable even with the whip').toBe(true);
    expect(result.winScript.some((i) => i.kind === 'USE_TOOL' && i.tool === 'WHIP')).toBe(true);
  });

  it('never lets the player reach the boulder or the plate on foot', () => {
    // The structural reason the proof holds: the water channel means there is
    // no tile east of the boulder to push from, and none adjacent to the plate
    // to sand from.
    const start = createState(L4);
    const reachable = new Set<string>();
    const stack = [start.player];
    while (stack.length > 0) {
      const p = stack.pop()!;
      const k = `${p.x},${p.y}`;
      if (reachable.has(k)) continue;
      reachable.add(k);
      for (const d of ALL_DIRS) {
        const q = { x: p.x + (d === 'E' ? 1 : d === 'W' ? -1 : 0), y: p.y + (d === 'S' ? 1 : d === 'N' ? -1 : 0) };
        if (start.map.isWalkable(q)) stack.push(q);
      }
    }
    expect(reachable.has('11,1'), 'the target boulder tile must be unreachable').toBe(false);
    expect(reachable.has('10,1'), 'the plate tile must be unreachable').toBe(false);
    expect(reachable.has('12,1'), 'the tile you would push from must not exist').toBe(false);

    // ...while the decoy boulder is very much reachable. The room has to let
    // the player spend turns pushing before it can teach them that pushing
    // is not the answer.
    expect(reachable.has('5,2'), 'the decoy boulder must be reachable').toBe(true);
    expect(reachable.has('8,1'), 'the firing tile must be reachable').toBe(true);
  });

  it('no boulder can ever be pushed onto the tile the whip must be fired from', () => {
    // (8,1) is enterable only from the south, and (8,3) is wall — so there is
    // no tile to stand on to shove anything into it. Without this the player
    // could brick the room shut with the decoy.
    const start = createState(L4);
    const firing = vec(8, 1);
    for (const d of ALL_DIRS) {
      const behind = vec(firing.x - DIRS[d].x * 1, firing.y - DIRS[d].y * 1);
      const from = vec(behind.x - DIRS[d].x, behind.y - DIRS[d].y);
      const pushable = start.map.isWalkable(behind) && start.map.isWalkable(from);
      expect(pushable, `a boulder could be pushed into the firing tile from ${d}`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Pillar invariants — the experimental condition itself
// ---------------------------------------------------------------------------

describe('the pillar', () => {
  it('nothing moves unless the player moves it', () => {
    // The load-bearing property of Pillar A: WAIT, forever, changes nothing.
    for (const def of LEVELS) {
      let state = createState(def);
      const before = stateKey(state);
      for (let i = 0; i < 50; i++) state = step(state, { kind: 'WAIT' });
      expect(stateKey(state), `${def.id} advanced on its own`).toBe(before);
      expect(state.status).toBe('PLAYING');
      expect(state.turn, `${def.id} charged a turn for waiting`).toBe(0);
    }
  });

  it('is deterministic — same state, same intent, same result', () => {
    for (const def of LEVELS) {
      const a = step(createState(def), M('E'));
      const b = step(createState(def), M('E'));
      expect(stateKey(a)).toBe(stateKey(b));
    }
  });

  it('has no unrecoverable failure state in any shipped level', () => {
    // Zero pressure means the tomb never kills you. LOST exists in the sim
    // only because the table has hazardous rows; no level here uses one.
    for (const def of LEVELS) {
      const state = createState(def);
      expect(state.entities.some((e) => e.kind === 'GAS_VENT'), def.id).toBe(false);
    }
  });

  it('treats entities with no table row as transparent to a tool ray', () => {
    // This is what lets the whip reach past a pressure plate to the boulder
    // behind it, and it is the single most load-bearing dispatch rule here.
    let s = createState(LEVELS[3]);
    for (const intent of [...rep(5, M('E')), M('S'), ...rep(2, M('E')), M('N')]) {
      s = step(s, intent);
    }
    expect(eq(s.player, vec(8, 1)), 'should be standing on the firing tile').toBe(true);
    expect(resolve('WHIP', 'PRESSURE_PLATE')).toBeNull();

    const after = step(s, T('WHIP', 'E'));
    const pulled = after.entities.find((e) => eq(e.at, vec(10, 1)) && e.kind === 'BOULDER');
    expect(pulled, 'the whip should have reached past the plate to the boulder').toBeDefined();
  });
});
