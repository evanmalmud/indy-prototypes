/**
 * levels.ts — Pillar B's six rooms.
 *
 * The sequence is a teaching argument, not a difficulty curve, and the
 * argument it makes is a specific one:
 *
 *   1-2  the tomb moves, and you can count it
 *   3-5  the thing trying to kill you is the only tool that can open the room
 *   6    all of it at once, on a timer you set yourself
 *
 * Levels 1 and 2 install a reflex — *get away from the hazard* — by making
 * flight the correct answer twice. Levels 3, 4 and 5 break it. That inversion
 * is this pillar's equivalent of Pillar A spending three rooms teaching that
 * boulders can only be pushed so that level 4 can take it away.
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
 * fed straight to `coverage()`. The rest are listed here so the parser has a
 * complete legend. The first three are Pillar A's and mean the same thing;
 * the last four are this pillar's world systems, which are not tools and so
 * cannot be registry rows — the tomb is the one using them.
 *
 *   PUSH+BOULDER      movement physics: you can only ever shove, never draw
 *   WHIP+GAP          a traversal verb, declared on TOOL_DEFS, not the registry
 *   SATCHEL+PIT       likewise
 *   FLOOD+FLOOR       the water rising a ring on its own clock
 *   FLOOD+BOULDER     rising water floating a stone you could never shift
 *   FIRE+VINE         the flame front burning through what blocks you, unattended
 *   FIRE+ROPE         the flame front cutting a rope, unattended — a delayed
 *                     REVOLVER+ROPE, which is the whole point of the finale
 *   COLLAPSE+BOULDER  a brittle floor swallowing a stone that stands on it
 *
 * `sim.test.ts` asserts these comment blocks match the exported data, so the
 * comments cannot rot into decoration.
 */

import type { LevelDef } from './sim.ts';

/**
 * LEVEL 1 — The Cistern
 * teaches: FLOOD+FLOOR
 * requires: FLOOD+FLOOR, SATCHEL+PIT
 * aha: The room has a clock now, and the turn you spend on the satchel is a tile of floor you will never stand on again.
 *
 * One system, introduced alone: water climbs one tile every turn, from behind.
 * The corridor is a straight line and the exit is visible from the start, so
 * there is no route to work out — the only decision in the room is whether to
 * spend the turn the pit costs, and the answer is that you have exactly two
 * turns of slack and the pit takes one of them.
 *
 * The point is not the puzzle. The point is that the player finishes this
 * room having internalised, physically, that a turn is a distance.
 */
const L1: LevelDef = {
  id: 'b1',
  name: 'The Cistern',
  rows: [
    '#################',
    '#=..@....X.....>#',
    '#################',
  ],
  tools: ['SATCHEL'],
  sand: 1,
  floodEvery: 1,
  teaches: 'FLOOD+FLOOR',
  requires: ['FLOOD+FLOOR', 'SATCHEL+PIT'],
  aha:
    'The room has a clock now, and the turn you spend on the satchel is a ' +
    'tile of floor you will never stand on again.',
  hint:
    'The water takes one tile every single turn, and it has already taken the ' +
    'one behind you. Count how many turns you can afford to lose. It is two.',
};

/**
 * LEVEL 2 — The Oil Gallery
 * teaches: TORCH+OIL_TRAIL
 * requires: TORCH+OIL_TRAIL, FIRE+VINE
 * aha: You do not have to light it where you are standing — you get to choose where the clock starts, and the far end is a much better place to start it.
 *
 * The seeded aha, taught as a hazard the player commands rather than one that
 * commands them. The vine sealing the exit can only be burned by fire, and the
 * only fire is the trail running the length of the room.
 *
 * The naive read is to light the trail at your feet and then spend eighteen
 * turns walking behind a flame you started for no reason — and the branch of
 * oil dropping into the lower corridor at x5 is there to punish exactly that
 * player, because it turns their escape route into a wall of fire at the worst
 * moment. The room is *safe* if you walk the lower corridor first and light
 * the trail from underneath its far end, where the fuse only needs to be three
 * tiles long. Same tool, same table row, ten turns cheaper.
 *
 * The satchel is carried and never needed. It is there so that a player who
 * has walked into the burning branch can discover SATCHEL+OIL_TRAIL as a
 * firebreak on their own, which is a better way to learn it than a room that
 * forces it.
 */
const L2: LevelDef = {
  id: 'b2',
  name: 'The Oil Gallery',
  rows: [
    '###############',
    '#@~~~~~~~~~~V>#',
    '#....~.....####',
    '###############',
  ],
  tools: ['TORCH', 'SATCHEL'],
  sand: 1,
  floodEvery: 0,
  teaches: 'TORCH+OIL_TRAIL',
  requires: ['TORCH+OIL_TRAIL', 'FIRE+VINE'],
  aha:
    'You do not have to light it where you are standing — you get to choose ' +
    'where the clock starts, and the far end is a much better place to start it.',
  hint:
    'Fire runs one tile a turn and eats the oil behind it. You are standing at ' +
    'the wrong end of a very long fuse. The lower corridor touches the trail ' +
    'everywhere along its length.',
};

/**
 * LEVEL 3 — The Undermined Gallery
 * teaches: COLLAPSE+BOULDER
 * requires: WHIP+GAP, WHIP+BOULDER, COLLAPSE+BOULDER
 * aha: The floor that is trying to swallow you is the only thing in this tomb strong enough to take the stone off your hands.
 *
 * FIRST HAZARD-AS-TOOL. The corridor east of the chasm is one tile wide, and
 * the boulder is in it. Every instinct says push: the tiles east are clear and
 * the exit is that way. Pushing works, right up to the far wall, where the
 * stone comes to rest on the exit and the room is over — the Pillar A wedged-
 * boulder death, reproduced deliberately so the player recognises it.
 *
 * The answer is to pull the stone the other way, onto the one tile in the room
 * that cannot hold it. The brittle floor is introduced in this level as the
 * thing that eats *you* if you loiter, and the room's whole argument is that
 * it will just as happily eat something else.
 */
const L3: LevelDef = {
  id: 'b3',
  name: 'The Undermined Gallery',
  rows: [
    '################',
    '#@.::.%O.....>##',
    '################',
  ],
  tools: ['WHIP'],
  sand: 0,
  floodEvery: 0,
  collapseDelay: 2,
  teaches: 'COLLAPSE+BOULDER',
  requires: ['WHIP+GAP', 'WHIP+BOULDER', 'COLLAPSE+BOULDER'],
  aha:
    'The floor that is trying to swallow you is the only thing in this tomb ' +
    'strong enough to take the stone off your hands.',
  hint:
    'Push it east and you will wall up your own exit, exactly the way you ' +
    'always have. One tile on this side of the stone is not going to hold ' +
    'anything for long. Put something on it.',
};

/**
 * LEVEL 4 — The Drowned Vault
 * teaches: FLOOD+BOULDER
 * requires: WHIP+BOULDER, FLOOD+BOULDER
 * aha: The whip cannot drag a stone into water. It can drag one that is already floating — so the flood you have been running from is the only thing that will open this door.
 *
 * THE PILLAR'S FLAGSHIP ROOM. The plate needs the boulder and the boulder is
 * across a channel. Try the whip on turn one and the sim says, truthfully,
 * that it will not budge any closer: a grounded stone cannot be dragged onto
 * water, and every tile between here and there is water.
 *
 * So the player waits. Not because waiting is a stall, but because the water
 * climbing toward them is *also* climbing toward the boulder, and the turn it
 * reaches the far bank the stone comes off the bottom and the whip starts
 * working. Two rooms of running from the flood, and then the flood is the key.
 *
 * The room is a window, not a race: the water takes the plate itself on its
 * third rise, so the stone has to be home before then. `sim.test.ts` asserts
 * both halves — that the pull fails before the flood and succeeds after it —
 * because "the flood is required" is the entire claim this level makes.
 */
const L4: LevelDef = {
  id: 'b4',
  name: 'The Drowned Vault',
  rows: [
    '##############',
    '#@._..=O.....#',
    '#+############',
    '#>############',
    '##############',
  ],
  tools: ['WHIP', 'SATCHEL'],
  sand: 0,
  floodEvery: 5,
  teaches: 'FLOOD+BOULDER',
  requires: ['WHIP+BOULDER', 'FLOOD+BOULDER'],
  aha:
    'The whip cannot drag a stone into water. It can drag one that is already ' +
    'floating — so the flood you have been running from is the only thing ' +
    'that will open this door.',
  hint:
    'Try the whip now and the tomb will tell you exactly what is wrong with ' +
    'the idea. Then read what the water is doing, and notice which bank it ' +
    'reaches first.',
};

/**
 * LEVEL 5 — The Watchmen
 * teaches: REVOLVER+GUARDIAN
 * requires: REVOLVER+GUARDIAN, FLOOD+FLOOR
 * aha: The shot does not kill it and does not move it. It buys one turn — and one turn is exactly the gap between the thing that reaches you and the thing that opens the door.
 *
 * Two guardians, both walking straight at you down two parallel corridors,
 * arriving on the same turn. The northern one's last step lands it on the
 * pressure plate that opens the gate at your back. The southern one's last
 * step lands it on you.
 *
 * The gate therefore opens on the exact turn you die, which is one turn too
 * late — and the revolver's stun, which the shared table is careful to call
 * "never a solution on its own", is worth precisely the one turn the room is
 * short. It is also the only use of the revolver in this prototype that is
 * genuinely forced, and `sim.test.ts` proves it by exhausting the room's whole
 * reachable state space with the revolver taken away and finding no win.
 *
 * The northern guardian holding the plate down is the mandated beat, and it is
 * honest here: nothing else in the room weighs anything, there is no sand, and
 * standing on the plate yourself puts you three tiles from a door that shuts
 * the moment you step off it.
 */
const L5: LevelDef = {
  id: 'b5',
  name: 'The Watchmen',
  rows: [
    '#########',
    '#_....G.#',
    '#.####..#',
    '#@....G.#',
    '#+#######',
    '#>#######',
    '#########',
  ],
  tools: ['WHIP', 'REVOLVER'],
  sand: 0,
  floodEvery: 0,
  teaches: 'REVOLVER+GUARDIAN',
  requires: ['REVOLVER+GUARDIAN'],
  aha:
    'The shot does not kill it and does not move it. It buys one turn — and ' +
    'one turn is exactly the gap between the thing that reaches you and the ' +
    'thing that opens the door.',
  hint:
    'Both of them arrive at once. Work out which one is walking onto something ' +
    'useful and which one is walking onto you, then work out how to be wrong ' +
    'about the second one by a single turn.',
};

/**
 * LEVEL 6 — The Architect's Fuse
 * teaches: FIRE+ROPE
 * requires: TORCH+OIL_TRAIL, FIRE+ROPE, FLOOD+BOULDER, SATCHEL+PIT, WHIP+BOULDER
 * aha: The match is the only thing in the room you control the timing of, and there is exactly one turn on which striking it is right.
 *
 * THE FINALE. Four systems, chained, with a one-turn window — and the window
 * is one turn because two of the systems close it from opposite sides.
 *
 * The chain:
 *
 *   1. A rope over the eastern ledge holds a boulder. Nothing can reach it:
 *      it is across the water and the whip is three tiles short.
 *   2. An oil trail runs the length of the room and down onto that ledge. Fire
 *      takes twelve turns to cross it. The player chooses the turn it starts,
 *      and that is the ONLY clock in the room they own.
 *   3. The fire cuts the rope. The boulder falls onto the ledge.
 *   4. Sand the pit, whip the floating stone home across it, land it on the
 *      plate, and walk out.
 *
 * Why the window is exactly one turn — the two failures are different failures:
 *
 *   ONE TURN EARLY: the boulder lands on the ledge while the ledge is still
 *   dry floor. It is brittle, this room's `collapseDelay` is 1, and the ledge
 *   gives way under the stone in the same tick it lands. The boulder plugs a
 *   shaft on the wrong side of a channel and the room is dead. The player has
 *   watched a floor eat a boulder before — in level 3, where they asked it to.
 *
 *   ONE TURN LATE: the water reaches the last oil tile before the fire does,
 *   and a flooded stretch of oil does not carry flame. The fuse is cut in the
 *   middle and the rope is never touched at all.
 *
 *   ON TIME: within a single tick, FIRE resolves before WATER — so the flame
 *   makes the last jump, the rope parts, the boulder drops onto dry stone, and
 *   *then* the water arrives, floats it, and voids the fuse under it. The room
 *   is solvable because of the documented resolution order and for no other
 *   reason, which is either the best or the worst thing about this pillar.
 *
 * `sim.test.ts` runs the same replay shifted one turn each way and asserts
 * both fail, so the window is a fact about the simulation rather than a claim
 * in a comment.
 */
const L6: LevelDef = {
  id: 'b6',
  name: "The Architect's Fuse",
  rows: [
    '###############',
    '#@~~~~~~~~~~~##',
    '#.##########~=#',
    '#...._..X...r=#',
    '#+#############',
    '#>#############',
    '###############',
  ],
  tools: ['WHIP', 'TORCH', 'SATCHEL'],
  sand: 1,
  floodEvery: 14,
  collapseDelay: 1,
  // The ledge the rope hangs over. It cannot be authored with `%` because the
  // cell's glyph is already spent on the rope itself.
  brittleAt: [[12, 3]],
  entityFlags: { 'rope-1': { suspends: 'BOULDER' } },
  teaches: 'FIRE+ROPE',
  requires: [
    'TORCH+OIL_TRAIL',
    'FIRE+ROPE',
    'FLOOD+BOULDER',
    'SATCHEL+PIT',
    'WHIP+BOULDER',
  ],
  aha:
    'The match is the only thing in the room you control the timing of, and ' +
    'there is exactly one turn on which striking it is right.',
  hint:
    'Everything else in this room is on a clock you cannot touch. The match is ' +
    'not. Count how long the fire takes to reach the rope, count when the water ' +
    'reaches the ledge, and make those two numbers the same.',
};

export const LEVELS: readonly LevelDef[] = Object.freeze([L1, L2, L3, L4, L5, L6]);

export function levelById(id: string): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}
