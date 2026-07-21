/**
 * levels.ts — Pillar A's six rooms.
 *
 * The sequence is a teaching argument, not a difficulty curve. Levels 1-3
 * each isolate one interaction and, just as importantly, spend three rooms
 * quietly installing a false law: **boulders can only be pushed.** Level 4
 * breaks it. Levels 5 and 6 make the player combine what breaking it bought.
 *
 * The whip is deliberately absent from levels 1-2 and boulder-free in level 3.
 * That is not tidiness — it is the whole trick. If the player has a whip and a
 * boulder in the same room before the law is installed, a curious player
 * discovers the pull as a *feature of a new toy* rather than as a *rule of the
 * world breaking*, and the flagship aha is spent for nothing.
 *
 * ---------------------------------------------------------------------------
 * STRUCTURED COMMENTS
 * ---------------------------------------------------------------------------
 * Every level carries a comment block with exactly these three fields:
 *
 *   teaches:  the one interaction the room isolates (or `-` if it only combines)
 *   requires: comma-separated TOOL+TARGET tokens the solution actually needs
 *   aha:      one line on the intended insight
 *
 * `requires:` is parsed by tooling, so the token vocabulary is fixed. Most
 * tokens are rows of the shared registry in `src/kernel/tools.ts` and can be
 * fed straight to `coverage()`. Three are not, and are listed here so the
 * parser has a complete legend:
 *
 *   PUSH+BOULDER   movement physics, not a tool — the law levels 1-3 install
 *   WHIP+GAP       a traversal verb, declared on TOOL_DEFS, not in the registry
 *   SATCHEL+PIT    likewise
 *
 * `sim.test.ts` asserts these comment blocks match the exported data, so the
 * comments cannot rot into decoration.
 */

import type { LevelDef } from './sim.ts';

/**
 * LEVEL 1 — The Antechamber
 * teaches: SATCHEL+PIT
 * requires: PUSH+BOULDER, SATCHEL+PIT
 * aha: Sand is not a resource you spend, it is terrain you author — and a boulder only ever goes the way you are facing.
 */
const L1: LevelDef = {
  id: 'a1',
  name: 'The Antechamber',
  rows: [
    '###########',
    '#@..O.._..#',
    '#.#########',
    '#+#########',
    '#.X.>######',
    '###########',
  ],
  tools: ['SATCHEL'],
  sand: 1,
  teaches: 'SATCHEL+PIT',
  requires: ['PUSH+BOULDER', 'SATCHEL+PIT'],
  aha:
    'Sand is not a resource you spend, it is terrain you author — and a ' +
    'boulder only ever goes the way you are facing.',
  hint:
    'The plate wants weight and the stone is the only weight in the room. ' +
    'Get behind it. Then look at what is between you and the way out.',
};

/**
 * LEVEL 2 — The Weighing Room
 * teaches: SATCHEL+PRESSURE_PLATE
 * requires: SATCHEL+SAND_PILE, SATCHEL+PRESSURE_PLATE
 * aha: The plate is not measuring you, it is measuring weight — so leave something behind that weighs the same and walk away.
 */
const L2: LevelDef = {
  id: 'a2',
  name: 'The Weighing Room',
  rows: [
    '##########',
    '#@n._....#',
    '########+#',
    '########>#',
    '##########',
  ],
  tools: ['SATCHEL'],
  sand: 0,
  teaches: 'SATCHEL+PRESSURE_PLATE',
  requires: ['SATCHEL+SAND_PILE', 'SATCHEL+PRESSURE_PLATE'],
  aha:
    'The plate is not measuring you, it is measuring weight — so leave ' +
    'something behind that weighs the same and walk away.',
  hint:
    'Standing on it works, right up until you have to stop standing on it. ' +
    'The satchel starts empty; there is a pile at your elbow.',
};

/**
 * LEVEL 3 — The Cracked Gallery
 * teaches: REVOLVER+CRACKED_STONE
 * requires: REVOLVER+CRACKED_STONE, WHIP+GAP
 * aha: The whip needs somewhere to land, so the shot has to come first — the tools have an order.
 */
const L3: LevelDef = {
  id: 'a3',
  name: 'The Cracked Gallery',
  rows: [
    '#############',
    '#@::c...c..>#',
    '#############',
  ],
  tools: ['WHIP', 'REVOLVER'],
  sand: 0,
  teaches: 'REVOLVER+CRACKED_STONE',
  requires: ['REVOLVER+CRACKED_STONE', 'WHIP+GAP'],
  aha:
    'The whip needs somewhere to land, so the shot has to come first — the ' +
    'tools have an order.',
  hint:
    'The whip is for chasms. Ask yourself what is standing on the far lip of ' +
    'this one, and whether it has to be.',
};

/**
 * LEVEL 4 — The Sealed Vault
 * teaches: WHIP+BOULDER
 * requires: WHIP+BOULDER
 * aha: You cannot push it. You were never able to push it. The whip can PULL — and every room you already walked through just re-opened.
 *
 * THE FLAGSHIP ROOM. The target boulder must travel one tile WEST onto the
 * plate. Pushing it west requires standing east of it, and east of it is solid
 * wall. The water channel means the player can never stand on that side of the
 * room at all — which also denies the satchel, since SATCHEL+PRESSURE_PLATE
 * needs adjacency and the plate is unreachable on foot forever.
 *
 * The second boulder, in the middle of the west chamber, is the point of the
 * room and not decoration. It is freely pushable in every direction, so the
 * player spends real turns doing the thing they know how to do, wedges it in a
 * corner, resets, and only then starts looking for a different verb. A room
 * where pushing is *visibly* unavailable teaches nothing; this one has to let
 * them exhaust it. It is also rescuable by pulling, so a player who wedges it
 * after the reveal gets the lesson twice.
 *
 * The firing tile (8,1) is deliberately reachable only from the south, and the
 * tile south of THAT is wall — so no boulder can ever be pushed onto the one
 * spot the whip must be used from, and the room cannot be bricked shut.
 *
 * So the room is not merely hard by pushing, it is *closed* by pushing, and
 * `sim.test.ts` proves it by exhausting the entire push-only state space and
 * asserting no winning state exists in it. It then proves the same search
 * WITH the whip does find a win. Necessary and sufficient.
 */
const L4: LevelDef = {
  id: 'a4',
  name: 'The Sealed Vault',
  rows: [
    '#############',
    '#@.....#.=_O#',
    '#....O...####',
    '#.......#####',
    '#.......#####',
    '###+#########',
    '###>#########',
    '#############',
  ],
  tools: ['WHIP', 'SATCHEL', 'REVOLVER'],
  sand: 1,
  teaches: 'WHIP+BOULDER',
  requires: ['WHIP+BOULDER'],
  aha:
    'You cannot push it. You were never able to push it. The whip can PULL — ' +
    'and every room you already walked through just re-opened.',
  hint:
    'The stone has to move one tile toward you, and there is no floor on the ' +
    'far side to shove from. You have been carrying the answer since the gallery.',
};

/**
 * LEVEL 5 — The Two Scales
 * teaches: -
 * requires: SATCHEL+PRESSURE_PLATE, WHIP+BOULDER
 * aha: One satchel holds one plate. The second plate needs weight you cannot carry, from a side of the room you cannot reach.
 */
const L5: LevelDef = {
  id: 'a5',
  name: 'The Two Scales',
  rows: [
    '############',
    '#@..._..=_O#',
    '#.......####',
    '#.......####',
    '#+##########',
    '#>##########',
    '############',
  ],
  tools: ['WHIP', 'SATCHEL', 'REVOLVER'],
  sand: 1,
  teaches: '-',
  requires: ['SATCHEL+PRESSURE_PLATE', 'WHIP+BOULDER'],
  aha:
    'One satchel holds one plate. The second plate needs weight you cannot ' +
    'carry, from a side of the room you cannot reach.',
  hint:
    'Two plates, one satchel. Sand the one you can touch, and find something ' +
    'heavier for the one you cannot — the water is no obstacle to a whip.',
};

/**
 * LEVEL 6 — The Architect's Last Joke
 * teaches: REVOLVER+ROPE
 * requires: REVOLVER+ROPE, WHIP+BOULDER, SATCHEL+PRESSURE_PLATE
 * aha: Cutting the rope walls off your own exit — and the single pull that clears the doorway is the same move that opens it.
 *
 * The three-link chain, with the middle link disguised as a blunder:
 *
 *   1. SEVER the rope and the suspended boulder drops into (9,1) — the only
 *      tile connecting the corridor to the portcullis. The player has, as far
 *      as they can see, just bricked up their own way out.
 *   2. PULL it south from the lower passage onto the second plate. That one
 *      move simultaneously clears the doorway and arms the lock.
 *   3. SUBSTITUTE_WEIGHT holds the first plate, because one satchel cannot
 *      hold two plates and there is no other weight in the room.
 *
 * The mistake only stops looking like a mistake on the move that ends the game.
 */
const L6: LevelDef = {
  id: 'a6',
  name: "The Architect's Last Joke",
  rows: [
    '#############',
    '#@_......r+>#',
    '#.#######_###',
    '#.........###',
    '#############',
  ],
  tools: ['WHIP', 'TORCH', 'REVOLVER', 'SATCHEL'],
  sand: 1,
  entityFlags: { 'rope-1': { suspends: 'BOULDER' } },
  teaches: 'REVOLVER+ROPE',
  requires: ['REVOLVER+ROPE', 'WHIP+BOULDER', 'SATCHEL+PRESSURE_PLATE'],
  aha:
    'Cutting the rope walls off your own exit — and the single pull that ' +
    'clears the doorway is the same move that opens it.',
  hint:
    'Two plates and one satchel again, and nothing heavy on the floor. Look ' +
    'up. Then work out where the heavy thing lands, and which way you want it to go.',
};

export const LEVELS: readonly LevelDef[] = Object.freeze([L1, L2, L3, L4, L5, L6]);

export function levelById(id: string): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}
