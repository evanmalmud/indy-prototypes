/**
 * sim.ts — Pillar A: "Clever, not strong".
 *
 * PURE. `step(state, intent) => newState`. No DOM, no canvas, no timers, no
 * randomness, no Date.now(). Every outcome in this file is reachable from a
 * unit test, which is the only verification available on a headless server.
 *
 * THE PILLAR: the tomb is inert stone. Nothing in this simulation advances on
 * its own — there is no per-turn tick, no escalation, no clock. A `WAIT`
 * intent is a genuine no-op, and a player may stand still forever. Every
 * change to the board is the direct consequence of an intent the player
 * submitted. That is the whole experimental condition: if the tool
 * interactions are not interesting here, no amount of pressure elsewhere
 * will save them.
 *
 * One consequence worth stating up front: `PROPAGATE_FIRE` (TORCH+OIL_TRAIL)
 * is deliberately NOT implemented here. It is the one seeded aha that
 * requires the board to advance on turn count, which is exactly the thing
 * Pillar A exists to exclude. See NOTES.md.
 *
 * ---------------------------------------------------------------------------
 * DETERMINISTIC RESOLUTION ORDER
 * ---------------------------------------------------------------------------
 * Every `step` resolves in exactly this order, always:
 *
 *   1. TERMINAL CHECK   — if status is not PLAYING, return the state unchanged.
 *   2. HISTORY INTENTS  — UNDO / RESET are history operations, not simulation
 *                         operations. The sim returns the state unchanged and
 *                         lets the shell's TurnLoop own them.
 *   3. ACTION           — exactly one of:
 *                           MOVE     : walk, or push a boulder ahead of you
 *                           USE_TOOL : traversal verb, else interaction table
 *                           WAIT     : nothing
 *                         An action that cannot happen produces either the
 *                         same state object (silent blocks, e.g. walls) or a
 *                         state carrying a message with `turn` unchanged
 *                         (informative failures, e.g. "out of range").
 *   4. WORLD DERIVATION — recompute which pressure plates are weighted, which
 *                         levers are thrown, which braziers are lit; open or
 *                         close every portcullis accordingly. This is derived
 *                         state, recomputed from scratch each step rather than
 *                         mutated, so it can never drift out of sync.
 *   5. HAZARDS          — a hazardous effect that reached the player's tile
 *                         sets LOST. (No shipped level uses one; the branch
 *                         exists so the table's hazardous rows are honest.)
 *   6. WIN              — player standing on an EXIT tile sets WON.
 *   7. TURN             — incremented only if step 3 actually did something.
 *
 * Steps 4-6 run after *every* successful action, so there is exactly one code
 * path that can decide a level is over.
 */

import type { Dir, Entity, EntityKind, Vec2 } from '../kernel/grid.ts';
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
 * The portcullis character. It is NOT part of the shared ASCII legend in
 * grid.ts — it is a Pillar A authoring convenience that is substituted for
 * `#` before `parseLevel` ever sees the rows, and its coordinates are kept
 * aside as gate positions. The kernel parser stays untouched.
 */
export const PORTCULLIS = '+';

export interface LevelDef {
  readonly id: string;
  readonly name: string;
  readonly rows: readonly string[];
  /** Which of the four shared tools the player carries in this room. */
  readonly tools: readonly ToolId[];
  /** Satchel loads carried at the start. See SAND, below. */
  readonly sand: number;
  /** Mirrors the `teaches:` line of the level's structured comment. */
  readonly teaches: string;
  /** Mirrors the `requires:` line. Parsed by tooling; see levels.ts. */
  readonly requires: readonly string[];
  /** Mirrors the `aha:` line. */
  readonly aha: string;
  /** Shown on H. Nudges toward the insight; never states the move order. */
  readonly hint: string;
  /**
   * Per-entity flags, keyed by the id `parseLevel` assigns (`rope-1`,
   * `boulder-2`, ...). The only flag any shipped level uses is
   * `suspends`, which names the EntityKind a ROPE drops when severed.
   */
  readonly entityFlags?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

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
  /**
   * SAND. The satchel holds a fixed number of loads, authored per level and
   * normally 1. This is NOT scarcity — that is Pillar C's variable, and
   * introducing an economy here would confound the comparison. Nothing is
   * ever consumed irrecoverably except a filled pit: SUBSTITUTE_WEIGHT and
   * REMOVE_WEIGHT are exact inverses, so a load spent on a plate can always
   * be scooped back. What the limit buys is a *lock*: with one load you can
   * hold exactly one plate down at a time, so a second plate must find its
   * weight somewhere else — which is what forces the boulder into the puzzle.
   */
  readonly sand: number;
  /** Portcullis tiles: WALL when the room's locks are unsatisfied. */
  readonly gates: readonly Vec2[];
  readonly gatesOpen: boolean;
  readonly turn: number;
  readonly status: Status;
  /** Last thing that happened, for the HUD. Never decides an outcome. */
  readonly message: string;
  /** Monotonic id source for entities spawned mid-level (severed payloads). */
  readonly nextId: number;
}

// ---------------------------------------------------------------------------
// World rules
// ---------------------------------------------------------------------------

/** Entities you cannot walk through. Everything else is scenery underfoot. */
const BLOCKING: ReadonlySet<EntityKind> = new Set<EntityKind>([
  'BOULDER',
  'CRACKED_STONE',
  'GUARDIAN',
  'BRAZIER',
  'VINE',
]);

/** Entities heavy enough to hold a pressure plate down. */
const WEIGHTY: ReadonlySet<EntityKind> = new Set<EntityKind>([
  'BOULDER',
  'SAND_PILE',
  'TREASURE',
]);

/** Tiles a boulder may be pushed or pulled onto. */
const BOULDER_GOES: ReadonlySet<string> = new Set(['FLOOR', 'RUBBLE', 'EXIT']);

function blockedByEntity(entities: readonly Entity[], p: Vec2): boolean {
  return entitiesAt(entities, p).some((e) => BLOCKING.has(e.kind));
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/**
 * Build the starting state for a level.
 *
 * Portcullis characters are swapped for walls before parsing, so the kernel's
 * ASCII legend never has to know about them, and their coordinates become the
 * gate list. Gates start closed and are opened by rule in `deriveWorld`.
 */
export function createState(def: LevelDef): SimState {
  const gates: Vec2[] = [];
  const rows = def.rows.map((row, y) => {
    let out = '';
    for (let x = 0; x < row.length; x++) {
      if (row[x] === PORTCULLIS) {
        gates.push(vec(x, y));
        out += '#';
      } else {
        out += row[x];
      }
    }
    return out;
  });

  const level = parseLevel(rows);
  if (level.spawn === null) {
    throw new Error(`level ${def.id} has no player spawn (@)`);
  }

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
    turn: 0,
    status: 'PLAYING',
    message: '',
    nextId: 1,
  };

  return deriveWorld(base);
}

// ---------------------------------------------------------------------------
// step
// ---------------------------------------------------------------------------

/** Informative failure: keeps the turn counter still, carries a message. */
function noop(state: SimState, message: string): SimState {
  return { ...state, message };
}

export function step(state: SimState, intent: Intent): SimState {
  // 1. terminal
  if (state.status !== 'PLAYING') return state;

  // 2. history intents belong to the shell
  if (intent.kind === 'UNDO' || intent.kind === 'RESET') return state;

  // 3. action
  let next: SimState;
  switch (intent.kind) {
    case 'MOVE':
      next = doMove(state, intent.dir);
      break;
    case 'USE_TOOL':
      next = doUseTool(state, intent.tool, intent.dir);
      break;
    case 'WAIT':
      // The pillar in one line: waiting changes nothing, and that is allowed.
      next = noop(state, 'You wait. The tomb waits longer.');
      break;
  }

  if (next === state) return state;

  // 4-6. derived world, hazards, win
  const acted = next.turn !== state.turn || !eq(next.player, state.player) ||
    next.entities !== state.entities || next.map !== state.map ||
    next.sand !== state.sand;
  const derived = deriveWorld(next);

  // 7. turn
  return acted ? { ...derived, turn: state.turn + 1 } : derived;
}

// ---------------------------------------------------------------------------
// 3a. movement (and the push-only law it establishes)
// ---------------------------------------------------------------------------

/**
 * Walk one tile, pushing a boulder ahead of you if one is in the way.
 *
 * This is the constraint the whole prototype is built to break: a boulder can
 * only ever be moved AWAY from the player, because the player has to occupy
 * the tile behind it to move it at all. Nothing here can pull. The whip can
 * (see PULL in `applyEffect`), and levels 1-3 exist to make that feel
 * impossible first.
 */
function doMove(state: SimState, dir: Dir): SimState {
  const target = add(state.player, DIRS[dir]);
  if (!state.map.isWalkable(target)) return state;

  const boulder = entitiesAt(state.entities, target).find((e) => e.kind === 'BOULDER');
  if (boulder !== undefined) {
    const beyond = add(target, DIRS[dir]);
    if (!BOULDER_GOES.has(state.map.at(beyond))) return state;
    if (blockedByEntity(state.entities, beyond)) return state;
    if (blocked('PUSH', 'BOULDER')) return state;
    fired('PUSH', 'BOULDER');
    return {
      ...state,
      player: target,
      entities: state.entities.map((e) => (e.id === boulder.id ? { ...e, at: beyond } : e)),
      message: 'You put your shoulder into it. The stone grinds forward.',
    };
  }

  if (blockedByEntity(state.entities, target)) return state;
  return { ...state, player: target, message: '' };
}

// ---------------------------------------------------------------------------
// 3b. tool use — everything dispatches through the shared interaction table
// ---------------------------------------------------------------------------

export interface ToolTarget {
  readonly entity: Entity;
  readonly interaction: Interaction;
  /** Tiles from the player, 1-based. */
  readonly dist: number;
}

/**
 * Find what a tool used in `dir` would act on.
 *
 * The ray stops at walls (per `ray`) but passes over water, gaps and pits,
 * and — importantly — passes THROUGH any entity the interaction table has no
 * row for. That transparency is load-bearing: it is what lets the whip reach
 * across a pressure plate to the boulder standing behind it. An entity is a
 * target only if `resolve(tool, kind)` says the pairing exists.
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

function doUseTool(state: SimState, tool: ToolId, dir: Dir): SimState {
  if (!state.tools.includes(tool)) {
    return noop(state, `You are not carrying the ${TOOL_DEFS[tool].name.toLowerCase()}.`);
  }

  // Traversal verbs act on TERRAIN, which the (tool, targetKind) registry has
  // no rows for — they are declared on TOOL_DEFS instead. They are checked
  // first, so a whip aimed at a chasm swings rather than searching past it.
  if (tool === 'WHIP' && state.map.at(add(state.player, DIRS[dir])) === 'GAP') {
    return swingGap(state, dir);
  }
  if (tool === 'SATCHEL' && state.map.at(add(state.player, DIRS[dir])) === 'PIT') {
    if (state.sand <= 0) return noop(state, 'The satchel is empty.');
    if (blocked('SATCHEL', 'PIT')) return noop(state, 'The sand will not settle.');
    fired('SATCHEL', 'PIT');
    return {
      ...state,
      map: state.map.with(add(state.player, DIRS[dir]), 'RUBBLE'),
      sand: state.sand - 1,
      message: 'Sand hisses into the pit until it is just floor again.',
    };
  }

  const found = findTarget(state, tool, dir);
  if (found === null) return noop(state, `The ${TOOL_DEFS[tool].name.toLowerCase()} finds nothing that way.`);
  if (found.dist > found.interaction.range) {
    return noop(state, `${found.entity.kind.toLowerCase().replace('_', ' ')} is out of reach.`);
  }

  return applyEffect(state, found, dir);
}

/** Whip across a contiguous run of GAP onto the first solid tile beyond it. */
function swingGap(state: SimState, dir: Dir): SimState {
  const range = TOOL_DEFS.WHIP.range;
  for (let i = 1; i <= range; i++) {
    const p = add(state.player, scale(DIRS[dir], i));
    if (state.map.at(p) === 'GAP') continue;
    if (!state.map.isWalkable(p) || blockedByEntity(state.entities, p)) {
      return noop(state, 'Nothing on the far side to land on.');
    }
    if (blocked('WHIP', 'GAP')) return noop(state, 'There is nothing to anchor to.');
    fired('WHIP', 'GAP');
    return { ...state, player: p, message: 'You swing across the chasm.' };
  }
  return noop(state, 'The chasm is too wide to swing.');
}

// ---------------------------------------------------------------------------
// 3c. effects — the sim APPLIES effects, it never decides what a tool does
// ---------------------------------------------------------------------------

function withoutEntity(state: SimState, id: string): Entity[] {
  return state.entities.filter((e) => e.id !== id);
}

function spawn(state: SimState, kind: EntityKind, at: Vec2): Entity {
  return { id: `${kind.toLowerCase()}-spawn-${state.nextId}`, kind, at };
}

/**
 * Apply one Effect descriptor.
 *
 * Two effect kinds are deliberately unimplemented in this pillar:
 *
 *   PROPAGATE_FIRE — needs the board to advance on turn count. That is
 *                    Pillar B's premise and the negation of Pillar A's.
 *   RICOCHET       — needs a shot to continue past its target; no Pillar A
 *                    level asks for it.
 *
 * Both fall through to the default branch and say so, rather than silently
 * doing nothing.
 */
function applyEffect(state: SimState, found: ToolTarget, dir: Dir): SimState {
  const { entity, interaction } = found;
  const effect = interaction.effect;
  /** From the target back toward the player. */
  const toward = scale(DIRS[dir], -1);

  switch (effect.kind) {
    case 'PULL': {
      // Drag the target toward the actor, one tile at a time, stopping at the
      // first tile it cannot occupy — including the actor's own.
      let at = entity.at;
      const steps = effect.amount ?? 1;
      for (let i = 0; i < steps; i++) {
        const dest = add(at, toward);
        if (eq(dest, state.player)) break;
        if (!BOULDER_GOES.has(state.map.at(dest))) break;
        if (blockedByEntity(state.entities, dest)) break;
        at = dest;
      }
      if (eq(at, entity.at)) return noop(state, 'It will not budge any closer.');
      return {
        ...state,
        entities: state.entities.map((e) => (e.id === entity.id ? { ...e, at } : e)),
        message: 'The whip bites, and the stone comes TOWARD you.',
      };
    }

    case 'SWING': {
      // Anchored on a vine rather than thrown across a chasm: land on the
      // far side of the anchor.
      const dest = add(entity.at, DIRS[dir]);
      if (!state.map.isWalkable(dest) || blockedByEntity(state.entities, dest)) {
        return noop(state, 'Nowhere to swing to.');
      }
      return { ...state, player: dest, message: 'You swing past on the vine.' };
    }

    case 'TRIGGER': {
      const thrown = entity.flags?.thrown !== true;
      return {
        ...state,
        entities: state.entities.map((e) =>
          e.id === entity.id ? { ...e, flags: { ...e.flags, thrown } } : e,
        ),
        message: thrown ? 'The lever throws with a crack.' : 'The lever falls back.',
      };
    }

    case 'SUBSTITUTE_WEIGHT': {
      if (state.sand <= 0) return noop(state, 'The satchel is empty.');
      if (entitiesAt(state.entities, entity.at).some((e) => e.kind === 'SAND_PILE')) {
        return noop(state, 'That plate is already sanded.');
      }
      return {
        ...state,
        entities: [...state.entities, spawn(state, effect.becomes ?? 'SAND_PILE', entity.at)],
        sand: state.sand - 1,
        nextId: state.nextId + 1,
        message: 'Sand pours out, and the plate never notices you leave.',
      };
    }

    case 'REMOVE_WEIGHT':
      return {
        ...state,
        entities: withoutEntity(state, entity.id),
        sand: state.sand + 1,
        message: 'You scoop the sand back into the satchel.',
      };

    case 'PLACE_WEIGHT': {
      if (state.sand <= 0) return noop(state, 'The satchel is empty.');
      return {
        ...state,
        entities: [
          ...withoutEntity(state, entity.id),
          spawn(state, effect.becomes ?? 'SAND_PILE', entity.at),
        ],
        sand: state.sand - 1,
        nextId: state.nextId + 1,
        message: 'You bury it under a satchel of sand.',
      };
    }

    case 'SHATTER':
      return {
        ...state,
        entities: withoutEntity(state, entity.id),
        map: state.map.with(entity.at, 'RUBBLE'),
        message: 'The shot cracks the stone into rubble.',
      };

    case 'BURN_THROUGH':
      return {
        ...state,
        entities: withoutEntity(state, entity.id),
        message: 'It burns away to nothing.',
      };

    case 'SEVER': {
      // The aha is that the rope is not the target — the payload is.
      const payload = entity.flags?.suspends;
      const rest = withoutEntity(state, entity.id);
      if (typeof payload !== 'string') {
        return { ...state, entities: rest, message: 'The rope parts and falls slack.' };
      }
      return {
        ...state,
        entities: [...rest, spawn(state, payload as EntityKind, entity.at)],
        nextId: state.nextId + 1,
        message: 'The rope parts. Whatever it was holding comes down HARD.',
      };
    }

    case 'IGNITE':
      return {
        ...state,
        entities: state.entities.map((e) =>
          e.id === entity.id ? { ...e, flags: { ...e.flags, lit: true } } : e,
        ),
        message: 'The brazier catches.',
      };

    case 'REPEL': {
      const dest = add(entity.at, DIRS[dir]);
      if (!state.map.isWalkable(dest) || blockedByEntity(state.entities, dest)) {
        return noop(state, 'It recoils from the flame but has nowhere to go.');
      }
      return {
        ...state,
        entities: state.entities.map((e) => (e.id === entity.id ? { ...e, at: dest } : e)),
        message: 'It will not cross the flame.',
      };
    }

    case 'STUN':
      // Nothing in Pillar A acts on its own, so there is no turn to buy.
      return noop(state, 'It reels — but nothing in this tomb was going to move anyway.');

    case 'FLING': {
      // Hurl the carried torch down the ray; light a brazier if it lands on one.
      const reach = ray(state.map, entity.at, dir, effect.amount ?? 1);
      const dest = reach.length > 0 ? reach[reach.length - 1] : entity.at;
      const brazier = entitiesAt(state.entities, dest).find((e) => e.kind === 'BRAZIER');
      return {
        ...state,
        entities: state.entities.map((e) => {
          if (e.id === entity.id) return { ...e, at: dest, flags: { ...e.flags, lit: true } };
          if (brazier !== undefined && e.id === brazier.id) {
            return { ...e, flags: { ...e.flags, lit: true } };
          }
          return e;
        }),
        message:
          brazier !== undefined
            ? 'The torch arcs across and the brazier roars up.'
            : 'The torch tumbles away down the corridor.',
      };
    }

    case 'EXPLODE': {
      const radius = effect.amount ?? 1;
      const caught =
        effect.hazardous === true &&
        Math.abs(state.player.x - entity.at.x) + Math.abs(state.player.y - entity.at.y) <= radius;
      return {
        ...state,
        entities: withoutEntity(state, entity.id),
        status: caught ? 'LOST' : state.status,
        message: caught
          ? 'The gas goes up. So do you.'
          : 'The vent blows itself out, well clear of you.',
      };
    }

    default:
      return noop(
        state,
        `${effect.kind} is not simulated in Pillar A — the room never advances on its own.`,
      );
  }
}

// ---------------------------------------------------------------------------
// 4-6. derived world, hazards, win
// ---------------------------------------------------------------------------

/** True if something is standing on the plate: the player, or dead weight. */
export function plateWeighted(state: SimState, at: Vec2): boolean {
  if (eq(state.player, at)) return true;
  return entitiesAt(state.entities, at).some((e) => WEIGHTY.has(e.kind));
}

/**
 * The tomb's one lock rule, stated once so every room reads the same way:
 * a portcullis is open when every pressure plate is weighted, every lever is
 * thrown, and every brazier is lit.
 */
export function locksSatisfied(state: SimState): boolean {
  for (const e of state.entities) {
    if (e.kind === 'PRESSURE_PLATE' && !plateWeighted(state, e.at)) return false;
    if (e.kind === 'LEVER' && e.flags?.thrown !== true) return false;
    if (e.kind === 'BRAZIER' && e.flags?.lit !== true) return false;
  }
  return true;
}

function deriveWorld(state: SimState): SimState {
  let open = locksSatisfied(state);

  // A portcullis never closes on the player standing in the doorway. Without
  // this the player could scoop their own sand back and end up inside a wall.
  if (!open && state.gates.some((g) => eq(g, state.player))) open = true;

  let map = state.map;
  for (const g of state.gates) {
    map = map.with(g, open ? 'FLOOR' : 'WALL');
  }

  const status: Status =
    state.status !== 'PLAYING'
      ? state.status
      : map.at(state.player) === 'EXIT'
        ? 'WON'
        : 'PLAYING';

  if (map === state.map && open === state.gatesOpen && status === state.status) return state;
  return { ...state, map, gatesOpen: open, status };
}

// ---------------------------------------------------------------------------
// Inspection helpers (tests + HUD)
// ---------------------------------------------------------------------------

/** Canonical, order-independent identity of a state. Used by the solver. */
export function stateKey(state: SimState): string {
  const ents = state.entities
    .map((e) => `${e.kind}@${key(e.at)}${e.flags?.thrown === true ? '!' : ''}${e.flags?.lit === true ? '*' : ''}`)
    .sort()
    .join('|');
  return `${key(state.player)}/${state.sand}/${ents}`;
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
