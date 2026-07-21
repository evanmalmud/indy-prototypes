/**
 * sim.ts — Pillar B: "The tomb is alive".
 *
 * PURE. `step(state, intent) => newState`. No DOM, no canvas, no timers, no
 * randomness, no Date.now(). Same contract as Pillar A, same shared
 * interaction table in `src/kernel/tools.ts`, same four tools. The ONLY
 * variable is the pillar.
 *
 * THE PILLAR: the tomb answers. Every turn the player spends, the board
 * advances one step — fire creeps a tile along the oil, water climbs another
 * ring, a boulder already in motion keeps going, a fuse burns down under a
 * cracked floor, a guardian takes a step. It never advances back.
 *
 * What that must NOT become is an action game. The escalation here is
 * *positional*, never temporal:
 *
 *   - Nothing moves unless the player submits an intent. There is no clock.
 *   - The next state is a pure function of the current one, so it can be
 *     computed and SHOWN before the player commits (see `telegraph`).
 *   - Undo is unrestricted, so a misread costs one keystroke.
 *
 * A player who takes ten minutes per turn can play this perfectly. A death is
 * always a misread of a state that was fully visible, never a surprise.
 *
 * ---------------------------------------------------------------------------
 * THE RESOLUTION ORDER
 * ---------------------------------------------------------------------------
 * This is the single most important paragraph in the file. Pillar A had one
 * system; this has six, and six systems ticking in an undocumented order is a
 * random number generator wearing a trench coat. Every `step` resolves in
 * exactly this sequence, always, with no exceptions and no interleaving:
 *
 *    0. TERMINAL     — status is not PLAYING: return unchanged.
 *    1. HISTORY      — UNDO / RESET belong to the shell's TurnLoop, not here.
 *    2. PLAYER ACTS  — exactly one of MOVE / USE_TOOL / WAIT. The action and
 *                      the effect it triggers resolve completely and
 *                      atomically before any world system runs.
 *    3. NO-OP GATE   — if the action could not happen (wall, empty satchel,
 *                      out of range) the state carries a message and returns
 *                      HERE. The tomb does not get a turn for a keystroke
 *                      that did nothing. This is what makes the pressure fair.
 *    4. WIN          — player standing on EXIT ends the level immediately.
 *                      Out is out; the tomb does not get to flood the doorway
 *                      behind a player who already left.
 *
 *    Then THE WORLD TICK, in this order:
 *
 *    5. FIRE         — every burning oil tile ignites its orthogonal
 *                      neighbours (oil, rope, vine) and is itself consumed.
 *                      Exactly one tile per turn, so the flame front is always
 *                      one tile wide and always predictable.
 *    6. WATER        — on every `floodEvery`-th turn, every floor, rubble or
 *                      pit tile orthogonally touching water becomes water.
 *                      Boulders caught by it start FLOATING.
 *    7. BOULDERS     — anything already rolling advances one tile, in entity
 *                      order, each seeing the results of the one before it.
 *    8. FLOORS       — brittle tiles bearing weight arm a fuse; every armed
 *                      fuse counts down one; fuses at zero collapse.
 *    9. GUARDIANS    — each takes one greedy step toward the player, in entity
 *                      order. Stunned guardians burn their stun instead.
 *   10. PLATES       — every lock in the room is re-derived FROM SCRATCH:
 *                      plates weighted, levers thrown, braziers lit, gates
 *                      opened or shut accordingly.
 *   11. DEATH        — one check, one place, at the end: is the player
 *                      standing in water, in a hole, in fire, or sharing a
 *                      tile with a guardian or a boulder?
 *   12. TURN         — the counter increments.
 *
 * WHY THIS ORDER, in one sentence a player can hold in their head:
 *
 *   > The player always moves first, and then the tomb answers — fastest
 *   > system to slowest. Fire, then water, then momentum, then structure,
 *   > then the thing that is thinking about you.
 *
 * Three consequences are load-bearing and worth stating explicitly:
 *
 *   - PLATES ARE EVALUATED LAST, so every object that could be standing on a
 *     plate has finished moving before the lock is asked its question. A
 *     guardian stunned onto a plate holds it for exactly the turn you bought.
 *   - DEATH IS EVALUATED ONCE, at the end, so there is exactly one code path
 *     that can end a level and it cannot disagree with itself.
 *   - THE TICK IS A PURE FUNCTION OF THE BOARD, which is why `telegraph`
 *     below can show the player its result before they commit. The telegraph
 *     is not a parallel prediction that could drift out of sync with the
 *     rules — it literally runs the same `worldTick` and diffs it.
 */

import type { Dir, Entity, EntityKind, TileKind, Vec2 } from '../kernel/grid.ts';
import {
  DIRS,
  TileMap,
  add,
  entitiesAt,
  eq,
  key,
  parseLevel,
  ray,
  scale,
  vec,
} from '../kernel/grid.ts';
import type { Intent } from '../kernel/input.ts';
import { blocked, fired } from '../kernel/instrument.ts';
import type { Interaction, ToolId } from '../kernel/tools.ts';
import { TOOL_DEFS, resolve } from '../kernel/tools.ts';

// ---------------------------------------------------------------------------
// Level definitions
// ---------------------------------------------------------------------------

/**
 * Two authoring characters that are NOT part of the shared ASCII legend in
 * grid.ts. Both are substituted before `parseLevel` ever sees the rows, and
 * their coordinates are kept aside — exactly the trick Pillar A uses for its
 * portcullis, so the kernel parser stays untouched and identical for all
 * three prototypes.
 *
 *   `+`  PORTCULLIS — becomes WALL; opens when the room's locks are satisfied.
 *   `%`  BRITTLE    — becomes FLOOR; collapses into a PIT some turns after
 *                     something stands on it.
 */
export const PORTCULLIS = '+';
export const BRITTLE = '%';

export interface LevelDef {
  readonly id: string;
  readonly name: string;
  readonly rows: readonly string[];
  /** Which of the four shared tools the player carries in this room. */
  readonly tools: readonly ToolId[];
  /** Satchel loads carried at the start. Same meaning as Pillar A. */
  readonly sand: number;
  /**
   * Water climbs one ring every this-many turns. 0 disables flooding.
   * The tomb's slowest clock, and the one the player can plan around.
   */
  readonly floodEvery: number;
  /**
   * Turns between a brittle tile taking weight and giving way. Default 2,
   * which means "you get one full turn of warning after you step off".
   */
  readonly collapseDelay?: number;
  /** Mirrors the `teaches:` line of the level's structured comment. */
  readonly teaches: string;
  /** Mirrors the `requires:` line. Parsed by tooling; see levels.ts. */
  readonly requires: readonly string[];
  /** Mirrors the `aha:` line. */
  readonly aha: string;
  /** Shown on H. Nudges toward the insight; never states the move order. */
  readonly hint: string;
  /**
   * Extra brittle tiles, as `[x, y]` pairs.
   *
   * `%` covers the ordinary case, but a cell whose glyph is already spent on
   * an entity cannot also carry a terrain character. Level 6 needs exactly
   * that — a rope strung over a ledge that will not hold — so those few tiles
   * are named by coordinate instead. `sim.test.ts` asserts every coordinate
   * here is in bounds and on floor, so a typo is a failing test rather than a
   * silently inert tile.
   */
  readonly brittleAt?: readonly (readonly [number, number])[];
  /**
   * Per-entity flags, keyed by the id `parseLevel` assigns (`rope-1`,
   * `boulder-2`, ...). Shipped levels use two:
   *   `suspends`  the EntityKind a ROPE drops when it is cut or burned.
   *   `rolls`     a Dir, meaning this boulder is ALREADY in motion at spawn.
   */
  readonly entityFlags?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export const DEFAULT_COLLAPSE_DELAY = 2;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type Status = 'PLAYING' | 'WON' | 'LOST';

export interface SimState {
  readonly def: LevelDef;
  readonly map: TileMap;
  /** Everything except the player, who is tracked as a bare position. */
  readonly entities: readonly Entity[];
  readonly player: Vec2;
  readonly tools: readonly ToolId[];
  readonly sand: number;
  /** Portcullis tiles: WALL when the room's locks are unsatisfied. */
  readonly gates: readonly Vec2[];
  readonly gatesOpen: boolean;
  /** Tiles authored `%`: floor that will not hold weight for long. */
  readonly brittle: readonly Vec2[];
  /**
   * Armed collapse fuses, `key(pos) -> turns remaining`. A brittle tile with
   * no entry here has never taken weight and is, for now, ordinary floor.
   */
  readonly fuses: Readonly<Record<string, number>>;
  readonly turn: number;
  readonly status: Status;
  /** Last thing that happened, for the HUD. Never decides an outcome. */
  readonly message: string;
  /** Monotonic id source for entities spawned mid-level (dropped payloads). */
  readonly nextId: number;
}

// ---------------------------------------------------------------------------
// World rules
// ---------------------------------------------------------------------------

/** Entities you cannot walk through. Identical to Pillar A's set. */
const BLOCKING: ReadonlySet<EntityKind> = new Set<EntityKind>([
  'BOULDER',
  'CRACKED_STONE',
  'GUARDIAN',
  'BRAZIER',
  'VINE',
]);

/**
 * Entities heavy enough to hold a pressure plate down.
 *
 * GUARDIAN is here and is not in Pillar A's copy of this set, because in
 * Pillar A nothing moves on its own and so nothing could ever wander onto a
 * plate. It is the pillar, not a rule change: a guardian shot to a standstill
 * on a plate is one of this prototype's designed ahas.
 */
const WEIGHTY: ReadonlySet<EntityKind> = new Set<EntityKind>([
  'BOULDER',
  'SAND_PILE',
  'TREASURE',
  'GUARDIAN',
]);

/** Tiles a grounded boulder may be pushed, pulled or rolled onto. */
const BOULDER_GOES: ReadonlySet<TileKind> = new Set<TileKind>(['FLOOR', 'RUBBLE', 'EXIT']);

/**
 * Tiles water climbs into. PIT is included and GAP is not, which is a real
 * distinction and not an oversight: a pit is a shaft with a bottom, so it
 * fills, and a filled shaft is the thing that floats a boulder in level 6. A
 * gap is a chasm the water pours straight through.
 */
const FLOODABLE: ReadonlySet<TileKind> = new Set<TileKind>(['FLOOR', 'RUBBLE', 'PIT']);

/** Tiles a guardian will walk on. It has no tools and no interest in dying. */
const GUARDIAN_GOES: ReadonlySet<TileKind> = new Set<TileKind>(['FLOOR', 'RUBBLE', 'EXIT']);

const isFloating = (e: Entity): boolean => e.flags?.floating === true;

const isBurning = (e: Entity): boolean =>
  e.kind === 'OIL_TRAIL' && e.flags?.burning === true;

function blockedByEntity(entities: readonly Entity[], p: Vec2): boolean {
  return entitiesAt(entities, p).some((e) => BLOCKING.has(e.kind));
}

/** Where a boulder may go, given whether it is riding on the flood. */
function boulderCanEnter(state: SimState, boulder: Entity, p: Vec2): boolean {
  const tile = state.map.at(p);
  const ok = BOULDER_GOES.has(tile) || (tile === 'WATER' && isFloating(boulder));
  return ok && !blockedByEntity(state.entities, p);
}

const ORTHOGONAL: readonly Vec2[] = [DIRS.N, DIRS.E, DIRS.S, DIRS.W];

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export function createState(def: LevelDef): SimState {
  const gates: Vec2[] = [];
  const brittle: Vec2[] = [];
  const rows = def.rows.map((row, y) => {
    let out = '';
    for (let x = 0; x < row.length; x++) {
      if (row[x] === PORTCULLIS) {
        gates.push(vec(x, y));
        out += '#';
      } else if (row[x] === BRITTLE) {
        brittle.push(vec(x, y));
        out += '.';
      } else {
        out += row[x];
      }
    }
    return out;
  });

  for (const [x, y] of def.brittleAt ?? []) brittle.push(vec(x, y));

  const level = parseLevel(rows);
  if (level.spawn === null) throw new Error(`level ${def.id} has no player spawn (@)`);

  const flags = def.entityFlags ?? {};
  const entities = level.entities
    .filter((e) => e.kind !== 'PLAYER')
    .map((e) => (flags[e.id] !== undefined ? { ...e, flags: flags[e.id] } : e));

  const base: SimState = {
    def,
    map: level.map,
    entities,
    player: level.spawn,
    tools: def.tools,
    sand: def.sand,
    gates,
    gatesOpen: false,
    brittle,
    fuses: {},
    turn: 0,
    status: 'PLAYING',
    message: '',
    nextId: 1,
  };

  return deriveGates(base);
}

// ---------------------------------------------------------------------------
// step — the resolution order documented at the top of this file, in code
// ---------------------------------------------------------------------------

/** An action, plus whether it was real enough to cost the player a turn. */
interface ActionResult {
  readonly next: SimState;
  readonly consumed: boolean;
}

const did = (next: SimState): ActionResult => ({ next, consumed: true });

/**
 * Informative failure. The turn counter does NOT move and — critically for
 * this pillar — neither does the tomb. Fumbling a keystroke must never cost
 * a turn when a turn is the scarce thing.
 */
const noop = (state: SimState, message: string): ActionResult => ({
  next: { ...state, message },
  consumed: false,
});

export function step(state: SimState, intent: Intent): SimState {
  // 0. terminal
  if (state.status !== 'PLAYING') return state;

  // 1. history intents belong to the shell
  if (intent.kind === 'UNDO' || intent.kind === 'RESET') return state;

  // 2. the player acts
  let result: ActionResult;
  switch (intent.kind) {
    case 'MOVE':
      result = doMove(state, intent.dir);
      break;
    case 'USE_TOOL':
      result = doUseTool(state, intent.tool, intent.dir);
      break;
    case 'WAIT':
      // The pillar in one line: in Pillar A waiting was a no-op. Here it is a
      // move, it costs a turn, and it is sometimes the correct answer.
      result = did({ ...state, message: 'You hold still. The tomb does not.' });
      break;
  }

  // 3. no-op gate
  if (!result.consumed) return result.next;

  const acted = deriveGates(result.next);

  // 4. win — out is out, before the tomb gets its answer
  if (acted.map.at(acted.player) === 'EXIT') {
    return {
      ...acted,
      turn: state.turn + 1,
      status: 'WON',
      message: 'Daylight. The tomb keeps whatever it was going to do to itself.',
    };
  }

  // 5-11. the world tick
  const ticked = worldTick(acted, state.turn + 1);

  // 12. turn
  return { ...ticked, turn: state.turn + 1 };
}

// ---------------------------------------------------------------------------
// 2a. movement (the push-only law, unchanged from Pillar A)
// ---------------------------------------------------------------------------

function doMove(state: SimState, dir: Dir): ActionResult {
  const target = add(state.player, DIRS[dir]);
  if (!state.map.isWalkable(target)) return { next: state, consumed: false };

  const boulder = entitiesAt(state.entities, target).find((e) => e.kind === 'BOULDER');
  if (boulder !== undefined) {
    const beyond = add(target, DIRS[dir]);
    if (!boulderCanEnter(state, boulder, beyond)) return { next: state, consumed: false };
    if (blocked('PUSH', 'BOULDER')) return { next: state, consumed: false };
    fired('PUSH', 'BOULDER');
    return did({
      ...state,
      player: target,
      entities: state.entities.map((e) =>
        e.id === boulder.id ? { ...e, at: beyond, flags: groundedFlags(state, e, beyond) } : e,
      ),
      message: 'You put your shoulder into it. The stone grinds forward.',
    });
  }

  if (blockedByEntity(state.entities, target)) return { next: state, consumed: false };
  return did({ ...state, player: target, message: '' });
}

/**
 * A boulder that arrives on water is floating; one that arrives on solid
 * ground has run aground. Recomputed on every boulder move so the flag can
 * never drift away from where the stone actually is.
 */
function groundedFlags(
  state: SimState,
  boulder: Entity,
  at: Vec2,
): Record<string, number | boolean | string> {
  return { ...boulder.flags, floating: state.map.at(at) === 'WATER' };
}

// ---------------------------------------------------------------------------
// 2b. tool use — every tool dispatches through the shared interaction table
// ---------------------------------------------------------------------------

export interface ToolTarget {
  readonly entity: Entity;
  readonly interaction: Interaction;
  /** Tiles from the player, 1-based. */
  readonly dist: number;
}

/**
 * Find what a tool used in `dir` would act on. Identical rule to Pillar A:
 * the ray passes THROUGH anything the interaction table has no row for, so a
 * whip reaches across a pressure plate to the boulder behind it.
 */
export function findTarget(state: SimState, tool: ToolId, dir: Dir): ToolTarget | null {
  const tiles = ray(state.map, state.player, dir, TOOL_DEFS[tool].range);
  for (let i = 0; i < tiles.length; i++) {
    for (const entity of entitiesAt(state.entities, tiles[i])) {
      const interaction = resolve(tool, entity.kind);
      if (interaction !== null) return { entity, interaction, dist: i + 1 };
    }
  }
  return null;
}

function doUseTool(state: SimState, tool: ToolId, dir: Dir): ActionResult {
  if (!state.tools.includes(tool)) {
    return noop(state, `You are not carrying the ${TOOL_DEFS[tool].name.toLowerCase()}.`);
  }

  // Traversal verbs act on TERRAIN, which the (tool, targetKind) registry has
  // no rows for. Checked first, exactly as in Pillar A.
  const ahead = add(state.player, DIRS[dir]);
  if (tool === 'WHIP' && state.map.at(ahead) === 'GAP') return swingGap(state, dir);
  if (tool === 'SATCHEL' && state.map.at(ahead) === 'PIT') {
    if (state.sand <= 0) return noop(state, 'The satchel is empty.');
    if (blocked('SATCHEL', 'PIT')) return noop(state, 'The sand will not settle.');
    fired('SATCHEL', 'PIT');
    return did({
      ...state,
      map: state.map.with(ahead, 'RUBBLE'),
      sand: state.sand - 1,
      message: 'Sand hisses into the pit until it is just floor again.',
    });
  }

  const found = findTarget(state, tool, dir);
  if (found === null) {
    return noop(state, `The ${TOOL_DEFS[tool].name.toLowerCase()} finds nothing that way.`);
  }
  if (found.dist > found.interaction.range) {
    return noop(state, `${found.entity.kind.toLowerCase().replace('_', ' ')} is out of reach.`);
  }

  return applyEffect(state, found, dir);
}

function swingGap(state: SimState, dir: Dir): ActionResult {
  const range = TOOL_DEFS.WHIP.range;
  for (let i = 1; i <= range; i++) {
    const p = add(state.player, scale(DIRS[dir], i));
    if (state.map.at(p) === 'GAP') continue;
    if (!state.map.isWalkable(p) || blockedByEntity(state.entities, p)) {
      return noop(state, 'Nothing on the far side to land on.');
    }
    if (blocked('WHIP', 'GAP')) return noop(state, 'There is nothing to anchor to.');
    fired('WHIP', 'GAP');
    return did({ ...state, player: p, message: 'You swing across the chasm.' });
  }
  return noop(state, 'The chasm is too wide to swing.');
}

// ---------------------------------------------------------------------------
// 2c. effects — the sim APPLIES effects, it never decides what a tool does
// ---------------------------------------------------------------------------

function withoutEntity(state: SimState, id: string): Entity[] {
  return state.entities.filter((e) => e.id !== id);
}

function spawn(state: SimState, kind: EntityKind, at: Vec2): Entity {
  return { id: `${kind.toLowerCase()}-spawn-${state.nextId}`, kind, at };
}

function applyEffect(state: SimState, found: ToolTarget, dir: Dir): ActionResult {
  const { entity, interaction } = found;
  const effect = interaction.effect;
  /** From the target back toward the player. */
  const toward = scale(DIRS[dir], -1);

  switch (effect.kind) {
    case 'PULL': {
      // The flagship. Drag the target toward the actor one tile at a time,
      // stopping at the first tile it cannot occupy — including the player's.
      // Note `boulderCanEnter`: a GROUNDED boulder cannot be dragged onto
      // water, and a FLOATING one can. That single clause is the whole of
      // level 4's aha, and it lives here rather than in the level.
      let at = entity.at;
      const steps = effect.amount ?? 1;
      for (let i = 0; i < steps; i++) {
        const dest = add(at, toward);
        if (eq(dest, state.player)) break;
        if (!boulderCanEnter(state, entity, dest)) break;
        at = dest;
      }
      if (eq(at, entity.at)) return noop(state, 'It will not budge any closer.');
      return did({
        ...state,
        entities: state.entities.map((e) =>
          e.id === entity.id ? { ...e, at, flags: groundedFlags(state, e, at) } : e,
        ),
        message: 'The whip bites, and the stone comes TOWARD you.',
      });
    }

    case 'SWING': {
      const dest = add(entity.at, DIRS[dir]);
      if (!state.map.isWalkable(dest) || blockedByEntity(state.entities, dest)) {
        return noop(state, 'Nowhere to swing to.');
      }
      return did({ ...state, player: dest, message: 'You swing past on the vine.' });
    }

    case 'TRIGGER': {
      const thrown = entity.flags?.thrown !== true;
      return did({
        ...state,
        entities: state.entities.map((e) =>
          e.id === entity.id ? { ...e, flags: { ...e.flags, thrown } } : e,
        ),
        message: thrown ? 'The lever throws with a crack.' : 'The lever falls back.',
      });
    }

    case 'PROPAGATE_FIRE': {
      // THE FLAGSHIP OF THIS PILLAR. Lighting the oil does not solve anything
      // by itself — it starts a clock the player has chosen the zero of.
      //
      // `fresh` makes the arithmetic honest: the tile you light is burning at
      // the END of the turn you light it, and the flame advances one tile on
      // each turn AFTER that. So a fuse of N oil tiles between the match and
      // the rope burns through on exactly the Nth turn following the light.
      // Without this flag the fire would steal a tile on the lighting turn and
      // every timing puzzle in levels.ts would be off by one.
      if (entity.flags?.burning === true) return noop(state, 'That stretch is already alight.');
      return did({
        ...state,
        entities: state.entities.map((e) =>
          e.id === entity.id ? { ...e, flags: { ...e.flags, burning: true, fresh: true } } : e,
        ),
        message: 'The oil catches. It will run one tile a turn from here.',
      });
    }

    case 'SUBSTITUTE_WEIGHT': {
      if (state.sand <= 0) return noop(state, 'The satchel is empty.');
      if (entitiesAt(state.entities, entity.at).some((e) => e.kind === 'SAND_PILE')) {
        return noop(state, 'That plate is already sanded.');
      }
      return did({
        ...state,
        entities: [...state.entities, spawn(state, effect.becomes ?? 'SAND_PILE', entity.at)],
        sand: state.sand - 1,
        nextId: state.nextId + 1,
        message: 'Sand pours out, and the plate never notices you leave.',
      });
    }

    case 'REMOVE_WEIGHT':
      return did({
        ...state,
        entities: withoutEntity(state, entity.id),
        sand: state.sand + 1,
        message: 'You scoop the sand back into the satchel.',
      });

    case 'PLACE_WEIGHT': {
      if (state.sand <= 0) return noop(state, 'The satchel is empty.');
      return did({
        ...state,
        entities: [
          ...withoutEntity(state, entity.id),
          spawn(state, effect.becomes ?? 'SAND_PILE', entity.at),
        ],
        sand: state.sand - 1,
        nextId: state.nextId + 1,
        // Smothering a tile of oil is the firebreak: the flame front dies at
        // the gap because there is nothing left there to ignite.
        message: 'Sand smothers it. Whatever was coming stops there.',
      });
    }

    case 'SHATTER':
      return did({
        ...state,
        entities: withoutEntity(state, entity.id),
        map: state.map.with(entity.at, 'RUBBLE'),
        message: 'The shot cracks the stone into rubble.',
      });

    case 'BURN_THROUGH':
      return did(dropRope(state, entity, 'It burns away to nothing.'));

    case 'SEVER':
      return did(dropRope(state, entity, 'The rope parts and falls slack.'));

    case 'IGNITE':
      return did({
        ...state,
        entities: state.entities.map((e) =>
          e.id === entity.id ? { ...e, flags: { ...e.flags, lit: true } } : e,
        ),
        message: 'The brazier catches.',
      });

    case 'REPEL': {
      const dest = add(entity.at, DIRS[dir]);
      if (!state.map.isWalkable(dest) || blockedByEntity(state.entities, dest)) {
        return noop(state, 'It recoils from the flame but has nowhere to go.');
      }
      return did({
        ...state,
        entities: state.entities.map((e) => (e.id === entity.id ? { ...e, at: dest } : e)),
        message: 'It will not cross the flame.',
      });
    }

    case 'STUN': {
      // In Pillar A this was a shrug: nothing moved, so there was no turn to
      // buy. Here it buys exactly one, and one is enough — because a guardian
      // that does not step is a guardian still standing on the plate.
      const turns = effect.amount ?? 1;
      return did({
        ...state,
        entities: state.entities.map((e) =>
          e.id === entity.id ? { ...e, flags: { ...e.flags, stunned: turns } } : e,
        ),
        message: 'It staggers. It will not take a step this turn.',
      });
    }

    case 'FLING': {
      const reach = ray(state.map, entity.at, dir, effect.amount ?? 1);
      const dest = reach.length > 0 ? reach[reach.length - 1] : entity.at;
      const brazier = entitiesAt(state.entities, dest).find((e) => e.kind === 'BRAZIER');
      const oil = entitiesAt(state.entities, dest).find((e) => e.kind === 'OIL_TRAIL');
      return did({
        ...state,
        entities: state.entities.map((e) => {
          if (e.id === entity.id) return { ...e, at: dest, flags: { ...e.flags, lit: true } };
          if (brazier !== undefined && e.id === brazier.id) {
            return { ...e, flags: { ...e.flags, lit: true } };
          }
          // A flung torch that lands in oil starts the fire at range — the
          // same clock, started from somewhere the player cannot stand.
          if (oil !== undefined && e.id === oil.id) {
            return { ...e, flags: { ...e.flags, burning: true, fresh: true } };
          }
          return e;
        }),
        message:
          brazier !== undefined
            ? 'The torch arcs across and the brazier roars up.'
            : oil !== undefined
              ? 'The torch lands in the oil and the far end catches.'
              : 'The torch tumbles away down the corridor.',
      });
    }

    case 'EXPLODE': {
      const radius = effect.amount ?? 1;
      const caught =
        effect.hazardous === true &&
        Math.abs(state.player.x - entity.at.x) + Math.abs(state.player.y - entity.at.y) <= radius;
      return did({
        ...state,
        entities: withoutEntity(state, entity.id),
        status: caught ? 'LOST' : state.status,
        message: caught
          ? 'The gas goes up. So do you.'
          : 'The vent blows itself out, well clear of you.',
      });
    }

    default:
      return noop(state, `${effect.kind} is not simulated in Pillar B.`);
  }
}

/**
 * Cut or burn a rope, and drop what it was holding.
 *
 * Shared by SEVER (revolver, at range) and BURN_THROUGH (torch, or the fire
 * front arriving on its own) so a rope cannot behave differently depending on
 * what killed it. In this pillar the third caller is the important one: the
 * fire reaching the rope by itself, N turns after the player lit it.
 */
function dropRope(state: SimState, rope: Entity, plainMessage: string): SimState {
  const payload = rope.flags?.suspends;
  const rest = withoutEntity(state, rope.id);
  if (typeof payload !== 'string') return { ...state, entities: rest, message: plainMessage };

  const dropped: Entity = {
    ...spawn(state, payload as EntityKind, rope.at),
    flags: { floating: state.map.at(rope.at) === 'WATER' },
  };
  return {
    ...state,
    entities: [...rest, dropped],
    nextId: state.nextId + 1,
    message: 'The rope parts. Whatever it was holding comes down HARD.',
  };
}

// ---------------------------------------------------------------------------
// THE WORLD TICK — steps 5 through 11, in that order, every turn
// ---------------------------------------------------------------------------

/**
 * The tomb's answer to one player turn.
 *
 * Exported because `telegraph` runs it verbatim to show the player what is
 * coming. That is the point: there is no second implementation of these rules
 * that the preview could drift away from.
 *
 * `turnBeingResolved` is the 1-based number of the turn now completing, and is
 * the ONLY thing the water clock reads. Passing it in rather than reading
 * `state.turn` keeps the tick a pure function of its arguments.
 */
export function worldTick(state: SimState, turnBeingResolved: number): SimState {
  let s = state;
  s = tickFire(s); // 5
  s = tickWater(s, turnBeingResolved); // 6
  s = tickBoulders(s); // 7
  s = tickFloors(s); // 8
  s = tickGuardians(s); // 9
  s = deriveGates(s); // 10
  s = deathChecks(s); // 11
  return s;
}

// --- 5. FIRE ---------------------------------------------------------------

/**
 * The flame front advances exactly one tile per turn and is exactly one tile
 * deep, because every burning tile ignites its neighbours and is consumed in
 * the same tick. That gives the player a moving marker they can count on their
 * fingers, which is what makes TORCH+OIL_TRAIL usable as a programmable delay
 * instead of an unpredictable hazard.
 *
 * The front also burns ROPE and VINE it touches. A rope burned this way drops
 * its payload through the shared `dropRope`, so fire-at-a-distance and a
 * revolver shot produce byte-identical results.
 */
function tickFire(state: SimState): SimState {
  const alight = state.entities.filter(isBurning);
  if (alight.length === 0) return state;

  // Freshly-lit tiles sit out exactly one tick, then join the front. Handled
  // per tile rather than per board, so a second fire lit while a first is
  // already running does not stall the first one.
  const front = alight.filter((e) => e.flags?.fresh !== true);
  const thawed = alight.filter((e) => e.flags?.fresh === true).map((e) => e.id);

  if (front.length === 0) {
    return {
      ...state,
      entities: state.entities.map((e) =>
        thawed.includes(e.id) ? { ...e, flags: { ...e.flags, fresh: false } } : e,
      ),
    };
  }

  const ignite = new Set<string>();
  const ropes: Entity[] = [];
  const vines: Entity[] = [];

  for (const f of front) {
    for (const d of ORTHOGONAL) {
      for (const n of entitiesAt(state.entities, add(f.at, d))) {
        if (n.kind === 'OIL_TRAIL' && n.flags?.burning !== true) ignite.add(n.id);
        else if (n.kind === 'ROPE') ropes.push(n);
        else if (n.kind === 'VINE') vines.push(n);
      }
    }
  }

  const consumed = new Set(front.map((e) => e.id));
  const burntVines = blocked('FIRE', 'VINE') ? [] : vines;
  if (burntVines.length > 0) fired('FIRE', 'VINE');
  const gone = new Set([...consumed, ...burntVines.map((e) => e.id)]);

  let s: SimState = {
    ...state,
    entities: state.entities
      .filter((e) => !gone.has(e.id))
      .map((e) => {
        if (ignite.has(e.id)) return { ...e, flags: { ...e.flags, burning: true } };
        if (thawed.includes(e.id)) return { ...e, flags: { ...e.flags, fresh: false } };
        return e;
      }),
    message:
      ignite.size > 0 ? 'The fire runs on along the oil.' : 'The fire gutters out where the oil ends.',
  };

  // Ropes last, so a rope's payload lands on a board where the fire has
  // already finished moving. Deterministic order: entity order, as found.
  for (const rope of ropes) {
    if (blocked('FIRE', 'ROPE')) break;
    if (s.entities.some((e) => e.id === rope.id)) {
      fired('FIRE', 'ROPE');
      s = dropRope(s, rope, 'The rope burns through and falls slack.');
    }
  }
  return s;
}

// --- 6. WATER --------------------------------------------------------------

/**
 * Water climbs one ring every `floodEvery` turns. One ring, from every water
 * tile at once, into floor / rubble / pit — never into a gap, never into the
 * exit, never through a wall.
 *
 * Two side effects matter more than the flooding itself:
 *   - a BOULDER caught by the water starts FLOATING, which is the only way a
 *     whip will ever drag it across a channel;
 *   - a SAND_PILE caught by the water washes away, which quietly un-solves any
 *     pressure plate the player was holding with sand.
 */
function tickWater(state: SimState, turnBeingResolved: number): SimState {
  const every = state.def.floodEvery;
  if (every <= 0 || turnBeingResolved % every !== 0) return state;

  if (blocked('FLOOD', 'FLOOR')) return state;
  const rising = floodFrontier(state);
  if (rising.length === 0) return state;
  fired('FLOOD', 'FLOOR');

  let map = state.map;
  for (const p of rising) map = map.with(p, 'WATER');

  const wet = new Set(rising.map(key));
  const entities = state.entities
    .filter((e) => {
      if (!wet.has(key(e.at))) return true;
      // Sand washes out from under a plate, and a flooded stretch of oil will
      // not carry flame. The second rule is the finale's deadline: light late
      // and the water breaks your fuse before the fire gets to the end of it.
      return e.kind !== 'SAND_PILE' && e.kind !== 'OIL_TRAIL';
    })
    .map((e) => {
      if (e.kind !== 'BOULDER' || !wet.has(key(e.at))) return e;
      if (blocked('FLOOD', 'BOULDER')) return e;
      if (e.flags?.floating !== true) fired('FLOOD', 'BOULDER');
      return { ...e, flags: { ...e.flags, floating: true } };
    });

  return { ...state, map, entities, message: 'The water climbs another course of stone.' };
}

/** Every tile the water would take on its next rise. Pure; used by telegraph. */
export function floodFrontier(state: SimState): Vec2[] {
  const out: Vec2[] = [];
  const seen = new Set<string>();
  for (const p of state.map.positions()) {
    if (state.map.at(p) !== 'WATER') continue;
    for (const d of ORTHOGONAL) {
      const n = add(p, d);
      if (!state.map.inBounds(n) || seen.has(key(n))) continue;
      if (!FLOODABLE.has(state.map.at(n))) continue;
      seen.add(key(n));
      out.push(n);
    }
  }
  return out;
}

/** How many turns until the water next rises, or null if this room is dry. */
export function turnsUntilFlood(state: SimState): number | null {
  const every = state.def.floodEvery;
  if (every <= 0) return null;
  return every - (state.turn % every);
}

// --- 7. BOULDERS -----------------------------------------------------------

/**
 * Anything already in motion keeps going: one tile per turn, in the direction
 * it was rolling, until something stops it. Resolved in entity order, each
 * boulder seeing the board the previous one left behind.
 *
 * A rolling boulder that reaches a PIT falls in and plugs it — the pit becomes
 * walkable rubble. The stone is spent and the hole is a bridge, which is the
 * same bargain the collapsing floor offers in step 8.
 */
function tickBoulders(state: SimState): SimState {
  let s = state;
  let moved = false;

  for (const b of state.entities) {
    if (b.kind !== 'BOULDER' || typeof b.flags?.rolls !== 'string') continue;
    const live = s.entities.find((e) => e.id === b.id);
    if (live === undefined) continue;

    const dir = live.flags?.rolls as Dir;
    const dest = add(live.at, DIRS[dir]);
    const tile = s.map.at(dest);
    moved = true;

    if (tile === 'PIT') {
      s = {
        ...s,
        entities: withoutEntity(s, live.id),
        map: s.map.with(dest, 'RUBBLE'),
        message: 'The rolling stone drops into the shaft and wedges tight.',
      };
      continue;
    }
    if (tile === 'WATER') {
      s = {
        ...s,
        entities: s.entities.map((e) =>
          e.id === live.id ? { ...e, at: dest, flags: { ...e.flags, rolls: '', floating: true } } : e,
        ),
        message: 'The stone hits the water and slews to a stop, riding it.',
      };
      continue;
    }
    if (!BOULDER_GOES.has(tile) || blockedByEntity(s.entities, dest)) {
      s = {
        ...s,
        entities: s.entities.map((e) =>
          e.id === live.id ? { ...e, flags: { ...e.flags, rolls: '' } } : e,
        ),
        message: 'The rolling stone slams to a halt.',
      };
      continue;
    }
    s = {
      ...s,
      entities: s.entities.map((e) => (e.id === live.id ? { ...e, at: dest } : e)),
      message: 'The stone keeps rolling.',
    };
  }

  return moved ? s : state;
}

// --- 8. FLOORS -------------------------------------------------------------

/**
 * Brittle floor. A tile that takes weight arms a fuse; every armed fuse counts
 * down whether or not anything is still standing there, which is what makes
 * floors collapse BEHIND the player rather than merely under them.
 *
 * Arming and counting down happen in the same tick, so with the default delay
 * of 2 a tile stepped on during turn N gives way at the end of turn N+1: one
 * full turn of visible warning, which the HUD shows as a number.
 *
 * What the hole does to what is standing in it is the level designer's real
 * lever:
 *   - a BOULDER falls in and PLUGS it — the tile becomes walkable rubble, the
 *     stone is spent, and the player has deliberately built a bridge out of a
 *     trap. This is "collapse a floor on purpose to drop an object".
 *   - a SAND_PILE is simply lost, along with whatever plate it was holding.
 *   - the PLAYER is dealt with in step 11, with every other way to die.
 */
function tickFloors(state: SimState): SimState {
  if (state.brittle.length === 0) return state;

  const fuses: Record<string, number> = { ...state.fuses };
  const delay = state.def.collapseDelay ?? DEFAULT_COLLAPSE_DELAY;

  // Arm.
  for (const p of state.brittle) {
    const k = key(p);
    if (fuses[k] !== undefined) continue;
    if (state.map.at(p) !== 'FLOOR') continue;
    const loaded =
      eq(state.player, p) || entitiesAt(state.entities, p).some((e) => WEIGHTY.has(e.kind));
    if (loaded) fuses[k] = delay;
  }

  // Count down, and collapse whatever hits zero.
  let map = state.map;
  let entities = state.entities;
  let message = state.message;
  let collapsed = false;

  for (const p of state.brittle) {
    const k = key(p);
    if (fuses[k] === undefined) continue;

    // A tile the water got to first is no longer a floor waiting to fall, and
    // its fuse is void. This is what makes level 6's timing window real: reach
    // the ledge before the flood and it gives way under the stone; reach it
    // after and the stone is floating, not resting.
    if (map.at(p) !== 'FLOOR') {
      delete fuses[k];
      collapsed = true;
      continue;
    }

    fuses[k] -= 1;
    if (fuses[k] > 0) continue;

    delete fuses[k];
    collapsed = true;
    const boulder = entitiesAt(entities, p).find((e) => e.kind === 'BOULDER');
    if (boulder !== undefined && blocked('COLLAPSE', 'BOULDER')) continue;
    if (boulder !== undefined) {
      fired('COLLAPSE', 'BOULDER');
      entities = entities.filter((e) => e.id !== boulder.id);
      map = map.with(p, 'RUBBLE');
      message = 'The floor gives way and the stone drops into it, wedging tight.';
    } else {
      entities = entities.filter((e) => !(eq(e.at, p) && e.kind === 'SAND_PILE'));
      map = map.with(p, 'PIT');
      message = 'The floor gives way onto nothing at all.';
    }
  }

  const armedChanged = Object.keys(fuses).length !== Object.keys(state.fuses).length;
  if (!collapsed && !armedChanged && sameFuses(fuses, state.fuses)) return state;
  return { ...state, map, entities, fuses, message };
}

function sameFuses(a: Record<string, number>, b: Readonly<Record<string, number>>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

// --- 9. GUARDIANS ----------------------------------------------------------

/**
 * One greedy step toward the player, per guardian, in entity order.
 *
 * The tie-break is fixed and documented because a player has to be able to
 * predict it: **move along the axis with the larger remaining distance; on a
 * tie, move along X first.** If that step is blocked, try the other axis. If
 * both are blocked, stand still. No pathfinding, no flanking, no memory —
 * a guardian that could out-think the player would make the room unreadable.
 *
 * A stunned guardian burns its stun instead of stepping, which is the entire
 * mechanism behind REVOLVER+GUARDIAN as a pressure-plate clamp.
 */
function tickGuardians(state: SimState): SimState {
  let s = state;
  let changed = false;

  for (const g of state.entities) {
    if (g.kind !== 'GUARDIAN') continue;
    const live = s.entities.find((e) => e.id === g.id);
    if (live === undefined) continue;

    const stunned = typeof live.flags?.stunned === 'number' ? live.flags.stunned : 0;
    if (stunned > 0) {
      changed = true;
      s = {
        ...s,
        entities: s.entities.map((e) =>
          e.id === live.id ? { ...e, flags: { ...e.flags, stunned: stunned - 1 } } : e,
        ),
        message: 'It stands where it fell, swaying.',
      };
      continue;
    }

    const dx = s.player.x - live.at.x;
    const dy = s.player.y - live.at.y;
    if (dx === 0 && dy === 0) continue;

    const xFirst = Math.abs(dx) >= Math.abs(dy);
    const stepX: Vec2 | null = dx === 0 ? null : vec(Math.sign(dx), 0);
    const stepY: Vec2 | null = dy === 0 ? null : vec(0, Math.sign(dy));
    const order = xFirst ? [stepX, stepY] : [stepY, stepX];

    for (const d of order) {
      if (d === null) continue;
      const dest = add(live.at, d);
      if (!GUARDIAN_GOES.has(s.map.at(dest))) continue;
      if (blockedByEntity(s.entities, dest)) continue;
      changed = true;
      s = {
        ...s,
        entities: s.entities.map((e) => (e.id === live.id ? { ...e, at: dest } : e)),
        message: 'It comes on, one pace at a time.',
      };
      break;
    }
  }

  return changed ? s : state;
}

// --- 10. PLATES ------------------------------------------------------------

/**
 * True if something is holding the plate down: the player, or dead weight.
 *
 * A FLOATING boulder does not count. It is riding on the water, not pressing
 * on the floor, and a player who has just flooded a room needs that rule to be
 * consistent or the flood becomes a lock-picking tool by accident.
 */
export function plateWeighted(state: SimState, at: Vec2): boolean {
  if (eq(state.player, at)) return true;
  return entitiesAt(state.entities, at).some((e) => WEIGHTY.has(e.kind) && !isFloating(e));
}

/** The tomb's one lock rule, identical in wording to Pillar A's. */
export function locksSatisfied(state: SimState): boolean {
  for (const e of state.entities) {
    if (e.kind === 'PRESSURE_PLATE' && !plateWeighted(state, e.at)) return false;
    if (e.kind === 'LEVER' && e.flags?.thrown !== true) return false;
    if (e.kind === 'BRAZIER' && e.flags?.lit !== true) return false;
  }
  return true;
}

function deriveGates(state: SimState): SimState {
  let open = locksSatisfied(state);

  // A portcullis never closes on the player standing in the doorway. In
  // Pillar A this stopped a player sealing themselves inside a wall. Here it
  // does far more work: it is what lets a lock held open for a single turn —
  // by a stunned guardian, say — actually be walked through.
  if (!open && state.gates.some((g) => eq(g, state.player))) open = true;

  let map = state.map;
  for (const g of state.gates) map = map.with(g, open ? 'FLOOR' : 'WALL');

  if (map === state.map && open === state.gatesOpen) return state;
  return { ...state, map, gatesOpen: open };
}

// --- 11. DEATH -------------------------------------------------------------

/**
 * Every way to die, in one place, evaluated once, at the end of the tick.
 *
 * Nothing earlier in the tick is allowed to set LOST, so there is exactly one
 * function that can end a level badly and it cannot contradict itself. Every
 * condition here is a property of a tile the player is standing on, which is
 * precisely the set `telegraph().fatal` paints on the board before the player
 * commits — so every one of these deaths was visible one turn in advance.
 */
function deathChecks(state: SimState): SimState {
  if (state.status !== 'PLAYING') return state;
  const cause = fatalAt(state, state.player);
  if (cause === null) return state;
  return { ...state, status: 'LOST', message: cause };
}

/** Why standing at `p` would kill the player, or null if it would not. */
export function fatalAt(state: SimState, p: Vec2): string | null {
  const tile = state.map.at(p);
  if (tile === 'WATER') return 'The water closes over you.';
  if (tile === 'PIT' || tile === 'GAP' || tile === 'VOID') return 'The floor is not there any more.';
  if (tile === 'WALL') return 'The stone comes down and there is nowhere to be.';

  for (const e of entitiesAt(state.entities, p)) {
    if (isBurning(e)) return 'The fire reaches you.';
    if (e.kind === 'GUARDIAN') return 'It has you.';
    if (e.kind === 'BOULDER') return 'The stone rolls over you.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// TELEGRAPH — the thing that makes this pillar a puzzle instead of a gotcha
// ---------------------------------------------------------------------------

export interface Telegraph {
  /** Tiles that will be alight after the next tick. */
  readonly fire: readonly Vec2[];
  /** Tiles that will become WATER after the next tick. */
  readonly water: readonly Vec2[];
  /** Tiles that will collapse after the next tick. */
  readonly collapse: readonly Vec2[];
  /** Where each rolling boulder ends up. */
  readonly boulders: readonly { readonly id: string; readonly from: Vec2; readonly to: Vec2 }[];
  /** Where each guardian ends up IF THE PLAYER DOES NOT MOVE. */
  readonly guardians: readonly { readonly id: string; readonly from: Vec2; readonly to: Vec2 }[];
  /** Every tile that would kill the player after the next tick. */
  readonly fatal: readonly Vec2[];
  /** Armed collapse fuses right now, for the countdown numbers on the board. */
  readonly fuses: Readonly<Record<string, number>>;
}

/**
 * What the tomb will do next.
 *
 * This does NOT reimplement the rules. It runs the very same `worldTick` the
 * real turn will run and diffs the result, so the preview is correct by
 * construction and cannot drift out of sync with the simulation. If a
 * telegraph is ever wrong, the tick is wrong, and the same test catches both.
 *
 * The one honest caveat, which the HUD repeats to the player: guardians chase,
 * so their predicted tile assumes the player stands still. Fire, water and
 * collapsing floors do not care where the player is, so those three are exact
 * no matter what the player does. `sim.test.ts` asserts exactly that.
 */
export function telegraph(state: SimState): Telegraph {
  if (state.status !== 'PLAYING') {
    return { fire: [], water: [], collapse: [], boulders: [], guardians: [], fatal: [], fuses: {} };
  }

  const after = worldTick(state, state.turn + 1);

  const fire = after.entities.filter(isBurning).map((e) => e.at);

  const water: Vec2[] = [];
  const collapse: Vec2[] = [];
  for (const p of state.map.positions()) {
    const before = state.map.at(p);
    const now = after.map.at(p);
    if (before === now) continue;
    if (now === 'WATER') water.push(p);
    else if (now === 'PIT' || now === 'RUBBLE') collapse.push(p);
  }

  const boulders: { id: string; from: Vec2; to: Vec2 }[] = [];
  const guardians: { id: string; from: Vec2; to: Vec2 }[] = [];
  for (const before of state.entities) {
    const now = after.entities.find((e) => e.id === before.id);
    if (now === undefined || eq(now.at, before.at)) continue;
    if (before.kind === 'BOULDER') boulders.push({ id: before.id, from: before.at, to: now.at });
    if (before.kind === 'GUARDIAN') guardians.push({ id: before.id, from: before.at, to: now.at });
  }

  const fatal: Vec2[] = [];
  for (const p of after.map.positions()) {
    if (fatalAt(after, p) !== null) fatal.push(p);
  }

  return { fire, water, collapse, boulders, guardians, fatal, fuses: state.fuses };
}

// ---------------------------------------------------------------------------
// Inspection helpers (tests + HUD)
// ---------------------------------------------------------------------------

/** Canonical, order-independent identity of a state. Used by the solver. */
export function stateKey(state: SimState): string {
  const ents = state.entities
    .map((e) => {
      const f = e.flags ?? {};
      const marks =
        (f.thrown === true ? '!' : '') +
        (f.lit === true ? '*' : '') +
        (f.burning === true ? (f.fresh === true ? '^' : '&') : '') +
        (f.floating === true ? '~' : '') +
        (typeof f.rolls === 'string' && f.rolls !== '' ? `>${f.rolls}` : '') +
        (typeof f.stunned === 'number' && f.stunned > 0 ? `z${f.stunned}` : '');
      return `${e.kind}@${key(e.at)}${marks}`;
    })
    .sort()
    .join('|');
  const fuses = Object.keys(state.fuses)
    .sort()
    .map((k) => `${k}=${state.fuses[k]}`)
    .join(',');
  // The map is part of identity here: water spreads and floors collapse, so
  // two states with identical entities can still be different rooms.
  return `${key(state.player)}/${state.sand}/${state.turn}/${ents}/${fuses}/${state.map.toAscii().join('')}`;
}

export function isTerminal(state: SimState): boolean {
  return state.status !== 'PLAYING';
}

/** Which (tool, target) pairs a level's `requires:` line names. For coverage. */
export function requiredPairs(def: LevelDef): readonly (readonly [string, string])[] {
  return def.requires.map((r) => {
    const [tool, target] = r.split('+');
    return [tool, target] as const;
  });
}
