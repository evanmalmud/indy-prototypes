/**
 * sim.ts — Pillar C: "Greed is the real enemy".
 *
 * PURE. `step(state, intent) => newState`. No DOM, no canvas, no timers, no
 * randomness, no Date.now(). Every outcome is reachable from a unit test,
 * which is the only verification available on a headless server.
 *
 * ---------------------------------------------------------------------------
 * THE PILLAR
 * ---------------------------------------------------------------------------
 * The room is not a lock. The room is a PRICE LIST.
 *
 * Every level here is trivially escapable — there is always a route to the
 * exit that costs nothing you cannot afford, and `sim.test.ts` proves that
 * for all six by replaying it. What is *not* free is the treasure, which sits
 * off that route and has to be paid for out of the same four pools the exit
 * route draws on:
 *
 *   fuel     torch fuel, burned every turn the torch is LIT
 *   bullets  one per shot; the scarcest thing in the game
 *   sand     one per placement — and the ONLY pool you can refill, by
 *            scooping a pile back up
 *   whip     durability; the whip frays a little every time it is used
 *
 * So the question stops being "what is the answer" and becomes "what can I
 * afford", and the win screen reports a SCORE rather than a checkmark.
 *
 * ---------------------------------------------------------------------------
 * WHY THE INTERACTION TABLE HAD TO BE SUBSTITUTABLE
 * ---------------------------------------------------------------------------
 * The design target is a player who escapes with two of five treasures, feels
 * fine about it, and then realises a DIFFERENT combination of the same tools
 * would have cost half as much and paid twice as much. That only exists if a
 * given obstacle has several priced answers, so the rooms are built on
 * deliberate substitution. The canonical one, used in four of the six rooms:
 *
 *   ONE PRESSURE PLATE, THREE PRICES
 *     SATCHEL + PRESSURE_PLATE   1 sand    — cheap, but sand is what gets you
 *                                            across the pit to the idol later
 *     WHIP    + BOULDER (pull)   1 whip    — preserves sand, frays the whip
 *     REVOLVER+ ROPE   (sever)   1 bullet  — instant, and bullets are the
 *                                            scarcest pool in the game
 *
 * None of the three is *correct*. Which one is right depends entirely on what
 * else in the room you have decided you want, which is the whole pillar in one
 * mechanic.
 *
 * Costs come from `costOfUse()` in the SHARED kernel table, not from a copy
 * living here. The point values below are Pillar C's own economy — a price
 * list is not a property of a whip.
 *
 * ---------------------------------------------------------------------------
 * DETERMINISTIC RESOLUTION ORDER
 * ---------------------------------------------------------------------------
 *   1. TERMINAL CHECK   — status not PLAYING: return unchanged.
 *   2. HISTORY INTENTS  — UNDO / RESET belong to the shell's TurnLoop.
 *   3. AFFORDABILITY    — a tool use whose pool is empty is an informative
 *                         no-op. It does NOT consume a turn and cannot lose
 *                         the game. You are never punished for asking a price.
 *   4. ACTION           — MOVE / USE_TOOL / WAIT, exactly one.
 *   5. PICKUP           — a player standing on treasure carries it away.
 *   6. WORLD DERIVATION — plates, levers, braziers -> portcullises. Derived
 *                         from scratch each step, never mutated.
 *   7. TORCH BURN       — if the torch is still lit at the END of an acted
 *                         turn, one fuel is gone. Burn is charged for turns
 *                         you FINISH holding a flame, so shuttering it is
 *                         never punished.
 *   8. WIN              — standing on EXIT sets WON. The score is the result.
 *
 * ---------------------------------------------------------------------------
 * DARKNESS, AND THE TREASURE THAT COSTS MORE THAN IT SAYS
 * ---------------------------------------------------------------------------
 * `%` tiles are DARK. You may always retreat OUT of the dark, but you may only
 * step deeper INTO it carrying a lit torch — and a lit torch is burning fuel
 * every turn. That gives the pillar its nastiest shape: a treasure down a dark
 * side passage whose true cost is only legible once you are standing in front
 * of it, four fuel poorer, doing the arithmetic on the walk back.
 *
 * Note what does NOT happen there: nothing kills you. Greed is punished by the
 * ledger, not by a trap. The worst the dark can do is make you pay.
 */

import type { Dir, Entity, EntityKind, Vec2 } from '../kernel/grid.ts';
import {
  DIRS,
  TileMap,
  add,
  chebyshev,
  entitiesAt,
  eq,
  key,
  parseLevel,
  ray,
  scale,
  vec,
} from '../kernel/grid.ts';
import type { Intent } from '../kernel/input.ts';
import type { Interaction, ResourceId, ToolId } from '../kernel/tools.ts';
import { RESOURCES, TOOL_DEFS, TORCH_LIGHT_RADIUS, costOfUse, resolve } from '../kernel/tools.ts';

// ---------------------------------------------------------------------------
// Authoring characters that are NOT part of the shared ASCII legend
// ---------------------------------------------------------------------------

/** Portcullis: substituted to `#` before parseLevel; opened by the room's locks. */
export const PORTCULLIS = '+';

/** Dark floor: substituted to `.`; enterable only with a lit torch. */
export const DARK = '%';

/**
 * An idol sitting ON a pressure plate — the literal Raiders tableau.
 *
 * It needs two entities in one cell, which one ASCII character cannot express,
 * so `I` is substituted to `$` before `parseLevel` sees it and a
 * PRESSURE_PLATE is stitched in underneath afterwards. Same trick, and same
 * justification, as Pillar A's PORTCULLIS: the kernel's shared legend stays
 * untouched and the prototype pays for its own authoring convenience.
 *
 * This one character is the pillar's sharpest room. Walk in and take the idol
 * and the plate lifts behind you — no dart, no boulder, just a door somewhere
 * else quietly closing and a much longer walk home.
 */
export const IDOL_ON_PLATE = 'I';

// ---------------------------------------------------------------------------
// The economy
// ---------------------------------------------------------------------------

export type Resources = Readonly<Record<ResourceId, number>>;

/**
 * What one unit of each pool is worth, in score.
 *
 * These numbers ARE the game. They are set so that no pool is dominant and
 * every substitution in a room is a genuine trade rather than an obvious
 * choice: sand is the cheapest because you can scoop it back, the whip is
 * dearer because fraying is permanent, and a bullet costs more than any
 * single treasure is worth on its own — so shooting your way to an idol only
 * pays if the shot does double duty.
 */
export const COST_POINTS: Readonly<Record<ResourceId, number>> = Object.freeze({
  sand: 5,
  fuel: 4,
  whip: 8,
  bullets: 15,
});

export interface LevelDef {
  readonly id: string;
  readonly name: string;
  readonly rows: readonly string[];
  readonly tools: readonly ToolId[];
  /** Starting pools. Anything omitted is zero. */
  readonly start: Resources;
  /** Treasure values by the entity id parseLevel assigns (`treasure-1`, ...). */
  readonly treasures: Readonly<Record<string, number>>;
  /** Mirrors the `teaches:` line of the level's structured comment. */
  readonly teaches: string;
  /** Mirrors the `requires:` line. Parsed by tooling; see levels.ts. */
  readonly requires: readonly string[];
  /** Mirrors the `aha:` line. */
  readonly aha: string;
  /** Mirrors the `par:` line — the score a good run is expected to beat. */
  readonly par: number;
  /** Shown on H. Points at the economy, never at the move order. */
  readonly hint: string;
  /** Per-entity flags by id. `suspends` names what a ROPE drops when severed. */
  readonly entityFlags?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export const noResources: Resources = Object.freeze({
  fuel: 0,
  bullets: 0,
  sand: 0,
  whip: 0,
});

export const res = (r: Partial<Record<ResourceId, number>>): Resources =>
  Object.freeze({ ...noResources, ...r });

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type Status = 'PLAYING' | 'WON' | 'LOST';

export interface SimState {
  readonly def: LevelDef;
  readonly map: TileMap;
  readonly entities: readonly Entity[];
  readonly player: Vec2;
  readonly tools: readonly ToolId[];
  /** What is left in each pool, right now. */
  readonly pools: Resources;
  /** Treasure entity ids the player is carrying out. */
  readonly carried: readonly string[];
  /** Dark tiles, by `key(v)`. Enterable only with a lit torch. */
  readonly dark: ReadonlySet<string>;
  readonly torchLit: boolean;
  readonly gates: readonly Vec2[];
  readonly gatesOpen: boolean;
  readonly turn: number;
  readonly status: Status;
  readonly message: string;
  readonly nextId: number;
}

// ---------------------------------------------------------------------------
// World rules (identical to Pillar A's — the pillar is the economy, not physics)
// ---------------------------------------------------------------------------

const BLOCKING: ReadonlySet<EntityKind> = new Set<EntityKind>([
  'BOULDER',
  'CRACKED_STONE',
  'GUARDIAN',
  'BRAZIER',
  'VINE',
]);

const WEIGHTY: ReadonlySet<EntityKind> = new Set<EntityKind>([
  'BOULDER',
  'SAND_PILE',
  'TREASURE',
]);

const BOULDER_GOES: ReadonlySet<string> = new Set(['FLOOR', 'RUBBLE', 'EXIT']);

function blockedByEntity(entities: readonly Entity[], p: Vec2): boolean {
  return entitiesAt(entities, p).some((e) => BLOCKING.has(e.kind));
}

// ---------------------------------------------------------------------------
// Scoring — the actual result of a level
// ---------------------------------------------------------------------------

/**
 * How much of each pool has been burned through.
 *
 * Clamped at zero per pool: scooping up more sand than you started with is a
 * fine thing to do, but it is not a way to mint points.
 */
export function spent(state: SimState): Readonly<Record<ResourceId, number>> {
  const out = {} as Record<ResourceId, number>;
  for (const r of RESOURCES) out[r] = Math.max(0, state.def.start[r] - state.pools[r]);
  return out;
}

export function spentPoints(state: SimState): number {
  const s = spent(state);
  return RESOURCES.reduce((n, r) => n + s[r] * COST_POINTS[r], 0);
}

export function carriedValue(state: SimState): number {
  return state.carried.reduce((n, id) => n + (state.def.treasures[id] ?? 0), 0);
}

/** THE RESULT. Treasure carried out, minus everything it took to get it. */
export function score(state: SimState): number {
  return carriedValue(state) - spentPoints(state);
}

/** Treasure ids still sitting in the room. The sting, itemised. */
export function treasuresLeft(state: SimState): readonly string[] {
  return Object.keys(state.def.treasures).filter((id) => !state.carried.includes(id));
}

export function totalTreasureValue(def: LevelDef): number {
  return Object.values(def.treasures).reduce((n, v) => n + v, 0);
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export function createState(def: LevelDef): SimState {
  const gates: Vec2[] = [];
  const dark = new Set<string>();
  const platesUnder: Vec2[] = [];

  const rows = def.rows.map((row, y) => {
    let out = '';
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === PORTCULLIS) {
        gates.push(vec(x, y));
        out += '#';
      } else if (ch === DARK) {
        dark.add(key(vec(x, y)));
        out += '.';
      } else if (ch === IDOL_ON_PLATE) {
        platesUnder.push(vec(x, y));
        out += '$';
      } else {
        out += ch;
      }
    }
    return out;
  });

  const level = parseLevel(rows);
  if (level.spawn === null) throw new Error(`level ${def.id} has no player spawn (@)`);

  const flags = def.entityFlags ?? {};
  const entities = level.entities
    .filter((e) => e.kind !== 'PLAYER')
    .map((e) => (flags[e.id] !== undefined ? { ...e, flags: flags[e.id] } : e));

  // Stitched in AFTER the parsed entities, so a tool aimed at the tile finds
  // the idol first and the plate second — which is what makes SATCHEL reach
  // past the treasure to the plate underneath it.
  platesUnder.forEach((at, i) => {
    entities.push({ id: `plate-under-${i + 1}`, kind: 'PRESSURE_PLATE', at });
  });

  for (const id of Object.keys(def.treasures)) {
    if (!entities.some((e) => e.id === id)) {
      throw new Error(`level ${def.id} prices treasure '${id}', which is not in the room`);
    }
  }

  return deriveWorld({
    def,
    map: level.map,
    entities,
    player: level.spawn,
    tools: def.tools,
    pools: def.start,
    carried: [],
    dark,
    torchLit: false,
    gates,
    gatesOpen: false,
    turn: 0,
    status: 'PLAYING',
    message: '',
    nextId: 1,
  });
}

// ---------------------------------------------------------------------------
// step
// ---------------------------------------------------------------------------

function noop(state: SimState, message: string): SimState {
  return { ...state, message };
}

export function isDark(state: SimState, p: Vec2): boolean {
  return state.dark.has(key(p));
}

/**
 * Can the player see well enough to set foot on `p`?
 *
 * Two light sources, and the difference between them is the most important
 * conversion in the economy:
 *
 *   the carried torch  — works everywhere, and bills you EVERY TURN it burns
 *   a lit brazier      — costs fuel ONCE, then lights its neighbourhood forever
 *
 * So a room full of braziers is a room where fuel can be turned into permanent
 * infrastructure, and the question "walk it lit, or pay once and light the
 * room" is a real one with a crossover point the player can compute.
 */
export function illuminated(state: SimState, p: Vec2): boolean {
  if (!isDark(state, p)) return true;
  if (state.torchLit) return true;
  return state.entities.some(
    (e) => e.kind === 'BRAZIER' && e.flags?.lit === true && chebyshev(e.at, p) <= TORCH_LIGHT_RADIUS,
  );
}

export function step(state: SimState, intent: Intent): SimState {
  if (state.status !== 'PLAYING') return state;
  if (intent.kind === 'UNDO' || intent.kind === 'RESET') return state;

  let next: SimState;
  switch (intent.kind) {
    case 'MOVE':
      next = doMove(state, intent.dir);
      break;
    case 'USE_TOOL':
      next = doUseTool(state, intent.tool, intent.dir);
      break;
    case 'WAIT':
      // Waiting is not free here: a lit torch keeps burning. That is the only
      // clock in this pillar, and the player holds the match.
      next = { ...state, message: 'You wait. The torch does not.' };
      break;
  }

  if (next === state) return state;

  const acted =
    !eq(next.player, state.player) ||
    next.entities !== state.entities ||
    next.map !== state.map ||
    next.pools !== state.pools ||
    next.torchLit !== state.torchLit ||
    (intent.kind === 'WAIT' && state.torchLit);

  if (!acted) return deriveWorld(next);

  const collected = collect(next);
  const burned = burnTorch(collected);
  return { ...deriveWorld(burned), turn: state.turn + 1 };
}

/** 5. Standing on treasure means carrying it. */
function collect(state: SimState): SimState {
  const here = entitiesAt(state.entities, state.player).filter((e) => e.kind === 'TREASURE');
  if (here.length === 0) return state;
  const ids = here.map((e) => e.id);
  const worth = ids.reduce((n, id) => n + (state.def.treasures[id] ?? 0), 0);
  return {
    ...state,
    entities: state.entities.filter((e) => !ids.includes(e.id)),
    carried: [...state.carried, ...ids],
    message: `You pocket the idol. ${worth} in gold, and the room notices.`,
  };
}

/** 7. Fuel is charged for turns you FINISH holding a lit torch. */
function burnTorch(state: SimState): SimState {
  if (!state.torchLit) return state;
  const fuel = state.pools.fuel - 1;
  if (fuel > 0) return { ...state, pools: { ...state.pools, fuel } };
  return {
    ...state,
    pools: { ...state.pools, fuel: 0 },
    torchLit: false,
    message: 'The torch gutters out. Whatever is left down here stays unseen.',
  };
}

// ---------------------------------------------------------------------------
// 4a. movement
// ---------------------------------------------------------------------------

function doMove(state: SimState, dir: Dir): SimState {
  const target = add(state.player, DIRS[dir]);
  if (!state.map.isWalkable(target)) return state;

  // You may always back OUT of the dark. You may only go deeper carrying fire.
  if (!illuminated(state, target)) {
    return noop(state, 'Pitch dark that way. You would be feeling for the walls.');
  }

  const boulder = entitiesAt(state.entities, target).find((e) => e.kind === 'BOULDER');
  if (boulder !== undefined) {
    const beyond = add(target, DIRS[dir]);
    if (!BOULDER_GOES.has(state.map.at(beyond))) return state;
    if (blockedByEntity(state.entities, beyond)) return state;
    // Pushing is free. It is also the only free way to move weight, which is
    // exactly why every priced route has to beat it on something else.
    return {
      ...state,
      player: target,
      entities: state.entities.map((e) => (e.id === boulder.id ? { ...e, at: beyond } : e)),
      message: 'You put your shoulder into it. Free, if you can get behind it.',
    };
  }

  if (blockedByEntity(state.entities, target)) return state;
  return { ...state, player: target, message: '' };
}

// ---------------------------------------------------------------------------
// 4b. tool use — dispatched through the shared table, priced by costOfUse()
// ---------------------------------------------------------------------------

export interface ToolTarget {
  readonly entity: Entity;
  readonly interaction: Interaction;
  readonly dist: number;
}

/**
 * Find what a tool used in `dir` would act on.
 *
 * The ray passes THROUGH any entity the table has no row for, which is what
 * lets the whip reach across a pressure plate to the boulder behind it.
 *
 * Where Pillar C differs from Pillar A: when several entities share a tile,
 * the LAST one placed wins. Things stack physically — a sand pile sits on top
 * of the plate it is holding down, an idol sits on top of the plate it is
 * holding down — and you interact with the top of the stack, not the bottom.
 *
 * That rule is load-bearing for the economy rather than for physics. Without
 * it, a satchel aimed at a sanded plate finds the PLATE, which is already
 * satisfied, and the sand can never be scooped back — which would silently
 * delete the only refund in the game and make sand behave like a bullet.
 */
export function findTarget(state: SimState, tool: ToolId, dir: Dir): ToolTarget | null {
  const tiles = ray(state.map, state.player, dir, TOOL_DEFS[tool].range);
  for (let i = 0; i < tiles.length; i++) {
    const here = entitiesAt(state.entities, tiles[i]);
    for (let j = here.length - 1; j >= 0; j--) {
      const interaction = resolve(tool, here[j].kind);
      if (interaction !== null) return { entity: here[j], interaction, dist: i + 1 };
    }
  }
  return null;
}

function affords(state: SimState, resource: ResourceId, amount: number): boolean {
  return amount <= 0 || state.pools[resource] >= amount;
}

function debit(state: SimState, resource: ResourceId, amount: number): Resources {
  return { ...state.pools, [resource]: state.pools[resource] - amount };
}

const EMPTY: Readonly<Record<ResourceId, string>> = Object.freeze({
  fuel: 'The torch is spent — there is nothing left to burn.',
  bullets: 'The cylinder is empty.',
  sand: 'The satchel is empty.',
  whip: 'The whip is frayed through. It would not hold your weight, or anything else.',
});

function doUseTool(state: SimState, tool: ToolId, dir: Dir): SimState {
  if (!state.tools.includes(tool)) {
    return noop(state, `You are not carrying the ${TOOL_DEFS[tool].name.toLowerCase()}.`);
  }

  const ahead = add(state.player, DIRS[dir]);

  // Traversal verbs act on TERRAIN, which the registry has no rows for. They
  // are priced at the tool default via costOfUse(tool) with no target.
  if (tool === 'WHIP' && state.map.at(ahead) === 'GAP') return swingGap(state, dir);
  if (tool === 'SATCHEL' && state.map.at(ahead) === 'PIT') {
    const c = costOfUse('SATCHEL');
    if (!affords(state, c.resource, c.amount)) return noop(state, EMPTY.sand);
    return {
      ...state,
      map: state.map.with(ahead, 'RUBBLE'),
      pools: debit(state, c.resource, c.amount),
      message: 'Sand hisses into the pit until it is just floor again. That sand is gone.',
    };
  }

  const found = findTarget(state, tool, dir);

  // A torch aimed at nothing is the lamp switch. Striking it is free; what
  // costs is every turn you then finish with it still burning.
  if (tool === 'TORCH' && found === null) return toggleTorch(state);

  if (found === null) {
    return noop(state, `The ${TOOL_DEFS[tool].name.toLowerCase()} finds nothing that way.`);
  }
  if (found.dist > found.interaction.range) {
    return noop(state, `${found.entity.kind.toLowerCase().replace('_', ' ')} is out of reach.`);
  }
  if (tool === 'TORCH' && !state.torchLit) {
    return noop(state, 'The torch is not lit. Strike it first — aim it at open air.');
  }
  // Remote ignition is only remote ignition if the thing you throw is burning.
  if (found.interaction.effect.kind === 'FLING' && !state.torchLit) {
    return noop(state, 'Flinging an unlit stick lights nothing. Strike your own torch first.');
  }

  const cost = costOfUse(tool, found.entity.kind);
  if (!affords(state, cost.resource, cost.amount)) return noop(state, EMPTY[cost.resource]);

  const applied = applyEffect(state, found, dir);
  if (applied === state) return state; // the effect refused; charge nothing
  return { ...applied, pools: debit(applied, cost.resource, cost.amount) };
}

function toggleTorch(state: SimState): SimState {
  if (state.torchLit) {
    return { ...state, torchLit: false, message: 'You shutter the torch. The dark comes back in.' };
  }
  if (state.pools.fuel <= 0) return noop(state, EMPTY.fuel);
  return {
    ...state,
    torchLit: true,
    message: 'The torch catches. It burns one measure of fuel for every turn you hold it.',
  };
}

function swingGap(state: SimState, dir: Dir): SimState {
  const c = costOfUse('WHIP');
  if (!affords(state, c.resource, c.amount)) return noop(state, EMPTY.whip);
  const range = TOOL_DEFS.WHIP.range;
  for (let i = 1; i <= range; i++) {
    const p = add(state.player, scale(DIRS[dir], i));
    if (state.map.at(p) === 'GAP') continue;
    if (!state.map.isWalkable(p) || blockedByEntity(state.entities, p)) {
      return noop(state, 'Nothing on the far side to land on.');
    }
    if (!illuminated(state, p)) return noop(state, 'You are not swinging blind into that.');
    return {
      ...state,
      player: p,
      pools: debit(state, c.resource, c.amount),
      message: 'You swing across the chasm. The leather complains.',
    };
  }
  return noop(state, 'The chasm is too wide to swing.');
}

// ---------------------------------------------------------------------------
// 4c. effects — the sim APPLIES effects, it never decides what a tool does
// ---------------------------------------------------------------------------

function withoutEntity(state: SimState, id: string): Entity[] {
  return state.entities.filter((e) => e.id !== id);
}

function spawn(state: SimState, kind: EntityKind, at: Vec2): Entity {
  return { id: `${kind.toLowerCase()}-spawn-${state.nextId}`, kind, at };
}

/**
 * Returning `state` unchanged means "the effect refused" and is how a use
 * avoids being billed. Every other return is a successful, chargeable use.
 *
 * PROPAGATE_FIRE and RICOCHET are not simulated here for the same reason as
 * Pillar A: fire that spreads on turn count is Pillar B's premise, and no
 * Pillar C room asks for a ricochet. Both say so rather than silently failing.
 */
function applyEffect(state: SimState, found: ToolTarget, dir: Dir): SimState {
  const { entity, interaction } = found;
  const effect = interaction.effect;
  const toward = scale(DIRS[dir], -1);

  switch (effect.kind) {
    case 'PULL': {
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
        message:
          entity.kind === 'TREASURE'
            ? 'The whip snakes out and the idol comes to you — no walking, no torch.'
            : 'The whip bites, and the stone comes TOWARD you.',
      };
    }

    case 'SWING': {
      const dest = add(entity.at, DIRS[dir]);
      if (!state.map.isWalkable(dest) || blockedByEntity(state.entities, dest)) {
        return noop(state, 'Nowhere to swing to.');
      }
      if (!illuminated(state, dest)) return noop(state, 'You are not swinging blind.');
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
      if (entitiesAt(state.entities, entity.at).some((e) => e.kind === 'SAND_PILE')) {
        return noop(state, 'That plate is already sanded.');
      }
      return {
        ...state,
        entities: [...state.entities, spawn(state, effect.becomes ?? 'SAND_PILE', entity.at)],
        nextId: state.nextId + 1,
        message: 'Sand pours out, and the plate never notices you leave. One measure gone.',
      };
    }

    case 'REMOVE_WEIGHT':
      // The only refund in the game — and the reason sand is the pool players
      // are willing to experiment with.
      return {
        ...state,
        entities: withoutEntity(state, entity.id),
        message: 'You scoop the sand back into the satchel. Nothing wasted.',
      };

    case 'PLACE_WEIGHT':
      return {
        ...state,
        entities: [
          ...withoutEntity(state, entity.id),
          spawn(state, effect.becomes ?? 'SAND_PILE', entity.at),
        ],
        nextId: state.nextId + 1,
        message: 'You bury it under a satchel of sand.',
      };

    case 'SHATTER':
      return {
        ...state,
        entities: withoutEntity(state, entity.id),
        map: state.map.with(entity.at, 'RUBBLE'),
        message: 'The shot cracks the stone into rubble. That was a bullet.',
      };

    case 'BURN_THROUGH':
      return {
        ...state,
        entities: withoutEntity(state, entity.id),
        message: 'It burns away to nothing.',
      };

    case 'SEVER': {
      const payload = entity.flags?.suspends;
      const rest = withoutEntity(state, entity.id);
      if (typeof payload !== 'string') {
        return { ...state, entities: rest, message: 'The rope parts and falls slack.' };
      }
      return {
        ...state,
        entities: [...rest, spawn(state, payload as EntityKind, entity.at)],
        nextId: state.nextId + 1,
        message: 'The rope parts. Whatever it held comes down HARD — and instantly.',
      };
    }

    case 'IGNITE':
      return {
        ...state,
        entities: state.entities.map((e) =>
          e.id === entity.id ? { ...e, flags: { ...e.flags, lit: true } } : e,
        ),
        message: 'The brazier catches, and stays lit without costing you another measure.',
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
      return noop(state, 'It reels — but nothing in this room was moving anyway.');

    case 'FLING': {
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
        message: caught ? 'The gas goes up. So do you.' : 'The vent blows itself out, well clear of you.',
      };
    }

    default:
      return noop(state, `${effect.kind} is not simulated in Pillar C.`);
  }
}

// ---------------------------------------------------------------------------
// 6 + 8. derived world, win
// ---------------------------------------------------------------------------

export function plateWeighted(state: SimState, at: Vec2): boolean {
  if (eq(state.player, at)) return true;
  return entitiesAt(state.entities, at).some((e) => WEIGHTY.has(e.kind));
}

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
  if (!open && state.gates.some((g) => eq(g, state.player))) open = true;

  let map = state.map;
  for (const g of state.gates) map = map.with(g, open ? 'FLOOR' : 'WALL');

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

export function stateKey(state: SimState): string {
  const ents = state.entities
    .map(
      (e) =>
        `${e.kind}@${key(e.at)}${e.flags?.thrown === true ? '!' : ''}${e.flags?.lit === true ? '*' : ''}`,
    )
    .sort()
    .join('|');
  const pools = RESOURCES.map((r) => state.pools[r]).join(',');
  return `${key(state.player)}/${pools}/${state.torchLit ? 'L' : 'd'}/${[...state.carried].sort().join('+')}/${ents}`;
}

export function isTerminal(state: SimState): boolean {
  return state.status !== 'PLAYING';
}

export function requiredPairs(def: LevelDef): readonly (readonly [string, string])[] {
  return def.requires.map((r) => {
    const [tool, target] = r.split('+');
    return [tool, target] as const;
  });
}
