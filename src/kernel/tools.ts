/**
 * tools.ts — THE CENTERPIECE.
 *
 * All three prototypes read this one table. Interactions are DATA, not
 * control flow: a registry keyed by (tool, targetKind) that returns an
 * Effect descriptor. The simulation's job is to *apply* effects, never to
 * decide what a tool does to a thing.
 *
 * Three reasons this is a table and not a switch statement in the sim:
 *
 *   1. ENUMERABLE. `enumerateInteractions()` lists the entire design space,
 *      so tooling can measure which combinations a level actually exercises
 *      and which cells of TOOL-MATRIX.md are still empty.
 *   2. CHEAP TO EXTEND. Adding a fifth tool is a data change — new rows here
 *      plus an EntityKind in grid.ts. No prototype's sim is rewritten.
 *   3. CONSISTENT BY CONSTRUCTION. Pillars A, B and C cannot disagree about
 *      what WHIP does to a BOULDER, because there is exactly one answer and
 *      it lives here. That is what makes the three-way comparison isolate
 *      the pillar instead of confounding it with different verbs.
 *
 * No DOM, no canvas, no timers. Pure data + pure lookups.
 */

import type { EntityKind } from './grid.ts';

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export type ToolId = 'WHIP' | 'TORCH' | 'REVOLVER' | 'SATCHEL';

export const TOOLS: readonly ToolId[] = ['WHIP', 'TORCH', 'REVOLVER', 'SATCHEL'];

export interface ToolDef {
  readonly id: ToolId;
  readonly name: string;
  /** Max tiles away the tool can act, along a cardinal ray. */
  readonly range: number;
  /** One line: what this tool means as a traversal verb. */
  readonly traversal: string;
  /** One line: what this tool means as a puzzle key. */
  readonly puzzle: string;
}

export const TOOL_DEFS: Readonly<Record<ToolId, ToolDef>> = Object.freeze({
  WHIP: {
    id: 'WHIP',
    name: 'Whip',
    range: 3,
    traversal: 'Swing across a marked gap.',
    puzzle: 'Pull things toward you, and trigger levers you cannot reach.',
  },
  TORCH: {
    id: 'TORCH',
    name: 'Torch',
    range: 1,
    traversal: 'Light the way; snakes will not cross the flame.',
    puzzle: 'Ignite what burns, and burn through what blocks.',
  },
  REVOLVER: {
    id: 'REVOLVER',
    name: 'Revolver',
    range: 5,
    traversal: 'Shatter cracked stone into walkable rubble.',
    puzzle: 'Reach out and break one specific thing — or spark one you should not.',
  },
  SATCHEL: {
    id: 'SATCHEL',
    name: 'Sand Satchel',
    range: 1,
    traversal: 'Partially fill a pit to cross it.',
    puzzle: 'Move weight around. Weight is what the tomb is measuring.',
  },
});

/** The light radius a lit torch projects (Chebyshev). */
export const TORCH_LIGHT_RADIUS = 2;

// ---------------------------------------------------------------------------
// Effects — the vocabulary the simulation knows how to apply
// ---------------------------------------------------------------------------

export type EffectKind =
  | 'PULL' // move target N tiles toward the actor
  | 'SWING' // actor traverses across the target
  | 'TRIGGER' // toggle the target's activated state
  | 'IGNITE' // set target alight
  | 'PROPAGATE_FIRE' // set alight AND spread along a medium over time
  | 'REPEL' // push target away / deny it entry
  | 'BURN_THROUGH' // destroy target by fire; whatever it held is released
  | 'SHATTER' // destroy target, leaving rubble
  | 'STUN' // target skips N turns
  | 'RICOCHET' // shot deflects and continues from the target
  | 'PLACE_WEIGHT' // deposit sand as a weighted object
  | 'REMOVE_WEIGHT' // scoop sand back up
  | 'SUBSTITUTE_WEIGHT' // swap sand in as the thing holding a plate down
  | 'FILL' // partially fill a hole, making it crossable
  | 'SEVER' // cut at range; whatever hung from it falls
  | 'FLING' // hurl a carried tool to a distant tile
  | 'EXPLODE'; // spark meets gas — area damage, usually fatal

export interface Effect {
  readonly kind: EffectKind;
  /** Tiles moved, turns stunned, tiles filled — meaning depends on kind. */
  readonly amount?: number;
  /** Fire/flood spread rate in tiles per turn. */
  readonly spreadPerTurn?: number;
  /** The medium fire spreads along, if any. */
  readonly spreadsAlong?: EntityKind;
  /** What the target becomes after the effect resolves. */
  readonly becomes?: EntityKind | null;
  /** True if this effect can kill the player who triggered it. */
  readonly hazardous?: boolean;
}

export interface Interaction {
  readonly tool: ToolId;
  readonly target: EntityKind;
  readonly effect: Effect;
  /** Max distance this specific pairing works at (defaults to the tool range). */
  readonly range: number;
  /**
   * True for the six seeded "aha" interactions — the discoveries the whole
   * project exists to test. Prototype levels are graded on whether they
   * teach or combine one of these.
   */
  readonly aha: boolean;
  /** Designer-facing note. Mirrored into TOOL-MATRIX.md. */
  readonly note: string;
}

// ---------------------------------------------------------------------------
// THE TABLE
// ---------------------------------------------------------------------------

const R = (t: ToolId) => TOOL_DEFS[t].range;

/**
 * The six `aha: true` rows are the designed aha set. Everything else is
 * connective tissue that makes those six legible.
 */
const INTERACTIONS: readonly Interaction[] = Object.freeze([
  // --- WHIP -------------------------------------------------------------
  {
    tool: 'WHIP',
    target: 'BOULDER',
    effect: { kind: 'PULL', amount: 1 },
    range: R('WHIP'),
    aha: true,
    note:
      'FLAGSHIP. Block-pushing puzzles are defined by the constraint that you ' +
      'can only push, never pull. The whip inverts that constraint, which ' +
      'retroactively re-opens every earlier room.',
  },
  {
    tool: 'WHIP',
    target: 'LEVER',
    effect: { kind: 'TRIGGER' },
    range: R('WHIP'),
    aha: false,
    note: 'Throw a lever from across the room, without standing in the trap it arms.',
  },
  {
    tool: 'WHIP',
    target: 'TORCH_ITEM',
    effect: { kind: 'FLING', amount: R('WHIP') },
    range: 1,
    aha: true,
    note:
      'Fling a lit torch across a gap to light a distant brazier. Remote ' +
      'ignition: the torch reaches where the player cannot.',
  },
  {
    tool: 'WHIP',
    target: 'TREASURE',
    effect: { kind: 'PULL', amount: R('WHIP') },
    range: R('WHIP'),
    aha: false,
    note: 'Snatch the idol from the pedestal without stepping on the floor around it.',
  },
  {
    tool: 'WHIP',
    target: 'VINE',
    effect: { kind: 'SWING', amount: R('WHIP') },
    range: R('WHIP'),
    aha: false,
    note: 'Anchor to a vine and swing — the traversal half of the whip.',
  },

  // --- TORCH ------------------------------------------------------------
  {
    tool: 'TORCH',
    target: 'OIL_TRAIL',
    effect: {
      kind: 'PROPAGATE_FIRE',
      spreadPerTurn: 1,
      spreadsAlong: 'OIL_TRAIL',
      becomes: null,
    },
    range: R('TORCH'),
    aha: true,
    note:
      'Fire PROPAGATES one tile per turn along the trail. This turns time ' +
      'into a puzzle element rather than just a resource: the player must ' +
      'reason about where the fire will be in four turns, not merely light it.',
  },
  {
    tool: 'TORCH',
    target: 'BRAZIER',
    effect: { kind: 'IGNITE' },
    range: R('TORCH'),
    aha: false,
    note: 'Braziers are the win condition of light puzzles; lighting them is the goal state.',
  },
  {
    tool: 'TORCH',
    target: 'SNAKE',
    effect: { kind: 'REPEL', amount: 1 },
    range: R('TORCH'),
    aha: false,
    note: 'Snakes will not enter a lit tile. Fire is a wall you carry.',
  },
  {
    tool: 'TORCH',
    target: 'VINE',
    effect: { kind: 'BURN_THROUGH', becomes: null },
    range: R('TORCH'),
    aha: false,
    note: 'Burn vines away to open a path — but you have destroyed a whip anchor.',
  },
  {
    tool: 'TORCH',
    target: 'ROPE',
    effect: { kind: 'BURN_THROUGH', becomes: null },
    range: R('TORCH'),
    aha: false,
    note: 'The melee answer to a rope. The revolver is the ranged one.',
  },
  {
    tool: 'TORCH',
    target: 'GAS_VENT',
    effect: { kind: 'EXPLODE', amount: 1, hazardous: true },
    range: R('TORCH'),
    aha: false,
    note: 'Obvious enough to read as a warning — it teaches the rule the revolver later breaks.',
  },

  // --- REVOLVER ---------------------------------------------------------
  {
    tool: 'REVOLVER',
    target: 'CRACKED_STONE',
    effect: { kind: 'SHATTER', becomes: null },
    range: R('REVOLVER'),
    aha: false,
    note: 'Turn cracked stone into walkable rubble from a safe distance.',
  },
  {
    tool: 'REVOLVER',
    target: 'GUARDIAN',
    effect: { kind: 'STUN', amount: 1 },
    range: R('REVOLVER'),
    aha: false,
    note: 'Buy exactly one turn. Never a solution on its own — always a setup.',
  },
  {
    tool: 'REVOLVER',
    target: 'METAL_PLATE',
    effect: { kind: 'RICOCHET' },
    range: R('REVOLVER'),
    aha: false,
    note: 'Bank a shot around a corner to hit what line-of-sight forbids.',
  },
  {
    tool: 'REVOLVER',
    target: 'ROPE',
    effect: { kind: 'SEVER', becomes: null },
    range: R('REVOLVER'),
    aha: true,
    note:
      'Sever at range, dropping whatever the rope suspends. The aha is that ' +
      'the falling thing is the real tool — you are aiming the payload, not the rope.',
  },
  {
    tool: 'REVOLVER',
    target: 'GAS_VENT',
    effect: { kind: 'EXPLODE', amount: 2, hazardous: true },
    range: R('REVOLVER'),
    aha: true,
    note:
      'Spark -> explosion. A trap for careless players: the revolver is the ' +
      'safe, ranged, no-consequences tool everywhere else, so reaching for it ' +
      'here is the habit. The aha is realizing the safe tool is the wrong tool.',
  },

  // --- SAND SATCHEL -----------------------------------------------------
  {
    tool: 'SATCHEL',
    target: 'PRESSURE_PLATE',
    effect: { kind: 'SUBSTITUTE_WEIGHT', becomes: 'SAND_PILE' },
    range: R('SATCHEL'),
    aha: true,
    note:
      'Weight substitution — the literal Raiders idol swap. Sand holds the ' +
      'plate down so the player (or the treasure) can leave it.',
  },
  {
    tool: 'SATCHEL',
    target: 'SAND_PILE',
    effect: { kind: 'REMOVE_WEIGHT', becomes: null },
    range: R('SATCHEL'),
    aha: false,
    note: 'Scoop it back. Sand is the only reversible resource, which is why it is scarce.',
  },
  {
    tool: 'SATCHEL',
    target: 'SNAKE',
    effect: { kind: 'PLACE_WEIGHT', amount: 1 },
    range: R('SATCHEL'),
    aha: false,
    note: 'Bury a snake. Cheap, and it costs sand you will want for a plate later.',
  },
  {
    tool: 'SATCHEL',
    target: 'OIL_TRAIL',
    effect: { kind: 'PLACE_WEIGHT', becomes: 'SAND_PILE' },
    range: R('SATCHEL'),
    aha: false,
    note: 'Smother a tile of oil to build a firebreak — sand as a defensive answer to fire.',
  },
]);

// ---------------------------------------------------------------------------
// Lookup + enumeration
// ---------------------------------------------------------------------------

const pairKey = (tool: ToolId, target: EntityKind): string => `${tool}:${target}`;

const TABLE: ReadonlyMap<string, Interaction> = new Map(
  INTERACTIONS.map((i) => [pairKey(i.tool, i.target), i]),
);

/**
 * The single question the simulation is allowed to ask:
 * "what does this tool do to this thing?"
 *
 * Returns null when the pairing is undefined — an empty cell in
 * TOOL-MATRIX.md. Callers should treat null as "nothing happens, and the
 * turn is not consumed".
 */
export function resolve(tool: ToolId, target: EntityKind): Interaction | null {
  return TABLE.get(pairKey(tool, target)) ?? null;
}

/** True if the pairing does anything at all. */
export function interacts(tool: ToolId, target: EntityKind): boolean {
  return TABLE.has(pairKey(tool, target));
}

/** The whole design space, for tooling and docs. */
export function enumerateInteractions(): readonly Interaction[] {
  return INTERACTIONS;
}

/** The six seeded discoveries the prototypes exist to test. */
export function ahaInteractions(): readonly Interaction[] {
  return INTERACTIONS.filter((i) => i.aha);
}

export function interactionsForTool(tool: ToolId): readonly Interaction[] {
  return INTERACTIONS.filter((i) => i.tool === tool);
}

export function interactionsForTarget(target: EntityKind): readonly Interaction[] {
  return INTERACTIONS.filter((i) => i.target === target);
}

export interface Coverage {
  readonly used: readonly Interaction[];
  readonly unused: readonly Interaction[];
  readonly ahaUsed: readonly Interaction[];
  readonly ahaMissed: readonly Interaction[];
  /** Fraction of the whole table a level exercises, 0..1. */
  readonly ratio: number;
}

/**
 * Measure which interactions a level (or a whole prototype) actually uses.
 *
 * This is why the table is enumerable: DESIGN-BRIEF.md says every level must
 * teach or combine an interaction, and a level that scores `ahaUsed: []` is
 * by that standard just a maze — which the brief calls a failure.
 */
export function coverage(
  usedPairs: readonly (readonly [ToolId, EntityKind])[],
): Coverage {
  const usedKeys = new Set(usedPairs.map(([t, k]) => pairKey(t, k)));
  const used = INTERACTIONS.filter((i) => usedKeys.has(pairKey(i.tool, i.target)));
  const unused = INTERACTIONS.filter((i) => !usedKeys.has(pairKey(i.tool, i.target)));
  return {
    used,
    unused,
    ahaUsed: used.filter((i) => i.aha),
    ahaMissed: unused.filter((i) => i.aha),
    ratio: INTERACTIONS.length === 0 ? 0 : used.length / INTERACTIONS.length,
  };
}
