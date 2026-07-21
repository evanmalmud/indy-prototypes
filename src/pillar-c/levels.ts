/**
 * levels.ts — Pillar C's six rooms.
 *
 * The sequence is an argument about PRICE, not about difficulty. Every room
 * here can be walked out of; `sim.test.ts` proves that for all six by replaying
 * a zero-treasure escape. What the rooms escalate is the number of ways to
 * spend, and the number of ways to spend badly.
 *
 *   1  one plate, three prices, and the cheapest tool is the wrong one
 *   2  fuel burns per TURN, so light can be rented or bought outright
 *   3  the scarcest resource is the right one to spend, if it frees two others
 *   4  the idol is holding the door open. That is what it is for.
 *   5  durability: the whip is a ticket, and every crossing punches it
 *   6  all of it at once, on a budget that cannot cover all of it at once
 *
 * ---------------------------------------------------------------------------
 * THE COST GRADIENT IS THE CONTENT
 * ---------------------------------------------------------------------------
 * A Pillar A room has a solution. A Pillar C room has a solution SPACE with a
 * price attached to each point in it, and the design work is making sure the
 * obvious route and the good route are different routes. Every room below has
 * at least three winning lines with materially different scores, and
 * `sim.test.ts` replays two of them for rooms 1, 3 and 4 to prove the gradient
 * is real rather than asserted here in a comment.
 *
 * The recurring shape, stated once:
 *
 *   ONE PRESSURE PLATE, THREE PRICES
 *     SATCHEL + PRESSURE_PLATE    1 sand     5   cheapest — and sand is the
 *                                                only thing that fills a pit
 *     WHIP    + BOULDER           1 whip     8   dearer, and spends the tool
 *                                                that crosses chasms
 *     REVOLVER+ ROPE              1 bullet  15   dearest, and the only one
 *                                                that works from across a room
 *
 * The trap is that the plate is not the expensive part of the room. Sand is
 * five points on a plate and five points on a pit, but only ONE of those two
 * jobs also has a forty-point idol behind it.
 *
 * ---------------------------------------------------------------------------
 * STRUCTURED COMMENTS
 * ---------------------------------------------------------------------------
 * Every level carries a comment block with exactly these four fields:
 *
 *   teaches:  the one interaction or economic rule the room isolates
 *   requires: comma-separated TOOL+TARGET tokens the PAR route actually needs
 *   aha:      one line on the intended insight
 *   par:      the score a good run is expected to reach
 *
 * `requires:` is parsed by tooling, so the vocabulary is fixed. Most tokens are
 * rows of the shared registry in `src/kernel/tools.ts` and can be fed straight
 * to `coverage()`. Five are not, and are listed here so the parser has a
 * complete legend:
 *
 *   PUSH+BOULDER    movement physics, not a tool
 *   WHIP+GAP        a traversal verb, declared on TOOL_DEFS, not the registry
 *   SATCHEL+PIT     likewise
 *   TORCH+DARK      carrying lit fire into a dark tile — Pillar C's own verb
 *   WALK+TREASURE   picking an idol up by standing on it
 *
 * Note that `requires:` names the PAR route specifically. In a pillar built on
 * substitution, "what the level requires" is not well defined — that is the
 * point of the pillar — so the token list documents the intended line and
 * `sim.test.ts` asserts the comment blocks match the exported data.
 *
 * ---------------------------------------------------------------------------
 * PRICES, for reading the rooms below
 * ---------------------------------------------------------------------------
 *   sand 5   ·   fuel 4/turn lit   ·   whip 8   ·   bullet 15
 */

import type { LevelDef } from './sim.ts';
import { res } from './sim.ts';

/**
 * LEVEL 1 — The Toll Gate
 * teaches: SATCHEL+PRESSURE_PLATE
 * requires: WHIP+BOULDER, SATCHEL+PIT, WALK+TREASURE
 * aha: Sand is the cheapest way to hold the plate and the ONLY way to cross the pit — so the plate has to be paid for with the dearer tool.
 * par: 25
 *
 * The whole pillar in one room, and deliberately the smallest one.
 *
 * The plate at (5,3) has three prices: sand (5), a whip-pull on the walled-in
 * boulder (8), or a bullet through the rope at (3,3), whose boulder drops in
 * the corridor and can then be shoved onto the plate for free (15).
 *
 * The boulder at (6,3) is bricked on three sides on purpose. Pushing is the
 * one genuinely free way to move weight in this game, so every room that wants
 * its priced routes to matter has to make pushing unavailable *at that plate*
 * — otherwise the price list is decoration and the answer is always "shove it".
 *
 * The player carries one of everything. The obvious line — sand the plate, it
 * is cheapest — spends the only thing that can fill the pit at (8,4), and the
 * idol behind it stops being purchasable at any price. Score -5.
 * The good line spends 8 on the plate to keep 5 for the pit. Score 27.
 * Same three tools, same one use each, 32 points apart.
 */
const L1: LevelDef = {
  id: 'c1',
  name: 'The Toll Gate',
  rows: [
    '##########',
    '#@.......#',
    '#.######.#',
    '#..r._O#.#',
    '#.######X#',
    '#+>#####$#',
    '##########',
  ],
  tools: ['WHIP', 'REVOLVER', 'SATCHEL'],
  start: res({ sand: 1, whip: 1, bullets: 1 }),
  treasures: { 'treasure-1': 40 },
  entityFlags: { 'rope-1': { suspends: 'BOULDER' } },
  teaches: 'SATCHEL+PRESSURE_PLATE',
  requires: ['WHIP+BOULDER', 'SATCHEL+PIT', 'WALK+TREASURE'],
  aha:
    'Sand is the cheapest way to hold the plate and the ONLY way to cross the ' +
    'pit — so the plate has to be paid for with the dearer tool.',
  par: 25,
  hint:
    'There are three ways to hold that plate down and only one way across the ' +
    'pit. Work out which job each thing in your pack is the only answer to.',
};

/**
 * LEVEL 2 — The Long Dark
 * teaches: TORCH+BRAZIER
 * requires: TORCH+DARK, TORCH+BRAZIER, WALK+TREASURE
 * aha: A carried torch is rent, charged every turn; a lit brazier is a purchase. Round trips are what make buying cheaper than renting.
 * par: 18
 *
 * The only pool that bills you for TIME rather than for actions, which makes
 * it the only one where standing still is a decision.
 *
 * The hall is eight tiles of dark and the exit is at the far end, so the safe
 * escape is real but expensive: eight fuel, thirty-two points, and you leave
 * with nothing. The idol hangs off a side alcove halfway down, and the
 * arithmetic that matters is that fetching it is a ROUND TRIP — four extra lit
 * turns, which is what makes the brazier worth buying.
 *
 * The brazier at (5,2) is the room's actual lesson. Lighting it costs two fuel
 * and illuminates the alcove and the middle of the hall permanently, which is
 * worse than walking if you only pass through once and better the moment you
 * have to double back. Fuel spent on infrastructure beats fuel spent on
 * transit exactly when you retrace your steps — and the idol is what makes you
 * retrace your steps.
 */
const L2: LevelDef = {
  id: 'c2',
  name: 'The Long Dark',
  rows: [
    '############',
    '#@%%%%%%%>##',
    '#####B%#####',
    '######$#####',
    '############',
  ],
  tools: ['TORCH', 'WHIP'],
  start: res({ fuel: 14 }),
  treasures: { 'treasure-1': 60 },
  teaches: 'TORCH+BRAZIER',
  requires: ['TORCH+DARK', 'TORCH+BRAZIER', 'WALK+TREASURE'],
  aha:
    'A carried torch is rent, charged every turn; a lit brazier is a purchase. ' +
    'Round trips are what make buying cheaper than renting.',
  par: 18,
  hint:
    'The torch bills you per turn, and the idol is down a dead end you have to ' +
    'walk back out of. Is there something in this hall that stays lit for free?',
};

/**
 * LEVEL 3 — Three Prices
 * teaches: REVOLVER+ROPE
 * requires: REVOLVER+ROPE, PUSH+BOULDER, WHIP+GAP, SATCHEL+PIT, WALK+TREASURE
 * aha: The bullet costs three times what the sand costs, and spending it is correct — because it is the only payment that frees BOTH other tools.
 * par: 50
 *
 * The room that inverts "spend the cheap thing".
 *
 * One plate, the same three prices as room 1, and now two idols that each
 * demand a specific tool: the pit at (9,3) can only be crossed with sand, and
 * the ledge at (11,1) can only be reached across the chasm with the whip —
 * twice, because it is a dead end and you have to swing back.
 *
 * So the plate is a choice about which idol to give up:
 *
 *   sand on the plate    5   — the pit idol is now unreachable    +25
 *   whip on the plate    8   — one swing left, not the two a      +32
 *                              round trip needs, so the ledge is out
 *   bullet on the plate 15   — both idols still purchasable       +54
 *
 * The dearest payment wins by more than twice, because it is the only one that
 * does not cannibalise a tool with a second job. A bullet's real price is 15
 * points; sand's real price on this plate is 15 points AND an idol.
 */
const L3: LevelDef = {
  id: 'c3',
  name: 'Three Prices',
  rows: [
    '#############',
    '#@.r._O#.::$#',
    '#.######.####',
    '#........X$##',
    '#+###########',
    '#>###########',
    '#############',
  ],
  tools: ['WHIP', 'REVOLVER', 'SATCHEL'],
  start: res({ sand: 1, whip: 2, bullets: 1 }),
  treasures: { 'treasure-1': 45, 'treasure-2': 45 },
  entityFlags: { 'rope-1': { suspends: 'BOULDER' } },
  teaches: 'REVOLVER+ROPE',
  requires: [
    'REVOLVER+ROPE',
    'PUSH+BOULDER',
    'WHIP+GAP',
    'SATCHEL+PIT',
    'WALK+TREASURE',
  ],
  aha:
    'The bullet costs three times what the sand costs, and spending it is ' +
    'correct — because it is the only payment that frees BOTH other tools.',
  par: 50,
  hint:
    'Price each tool by what ELSE it is the only answer to, not by what it ' +
    'costs. One of the three has no second job in this room.',
};

/**
 * LEVEL 4 — The Idol and the Shortcut
 * teaches: SATCHEL+PRESSURE_PLATE
 * requires: SATCHEL+PRESSURE_PLATE, WALK+TREASURE
 * aha: The idol was holding the door open. Taking it does not spring a trap — it just adds nine turns of torchlight to your walk home.
 * par: 48
 *
 * THE SIGNATURE ROOM, and the one the pillar lives or dies on.
 *
 * The idol at (5,2) sits on a plate that holds the portcullis at (11,2) open —
 * the short, free, dry way out. Everything about the room is legible from turn
 * one EXCEPT the connection between those two facts, which is legible only
 * after you pick the idol up and hear a door shut somewhere behind you.
 *
 * Then the bill arrives, and it is only a bill:
 *
 *   leave it                    0   — walk out the shortcut, empty-handed
 *   take it, walk home dark    40   — ten lit turns down the long corridor  +15
 *   sand the plate first        5   — the Raiders swap; the shortcut stays  +50
 *
 * Nothing here kills the player. That is the entire design position of this
 * pillar in one room: greed is punished by the LEDGER, never by a dart. A
 * player who grabs the idol has not failed, they have paid 40 for something
 * that was available at 5, and the difference is the lesson.
 *
 * And then there is 56, which is the room's real answer and which no first-time
 * player will find. The idol's alcove opens DOWNWARD into the dark corridor, so
 * the second idol at (4,4) is a three-turn detour from the plate rather than a
 * separate expedition — and the plate does not have to be sanded before the
 * idol is lifted, only before you leave. Take the idol, drop into the dark, buy
 * the second one for six fuel, climb back, sand the plate on the way past, and
 * walk out the shortcut: 29 spent against 85 carried.
 *
 * The measured ladder is 0 / 45 / 50 / 56, and the gap between the last two is
 * the whole pillar: the 50 run is CORRECT, it is the swap the room teaches, and
 * it is still six points short of what the same tools would have paid.
 */
const L4: LevelDef = {
  id: 'c4',
  name: 'The Idol and the Shortcut',
  rows: [
    '#############',
    '#@..........#',
    '#.###I#####+#',
    '#%%%%%%%%>..#',
    '####$########',
    '#############',
  ],
  tools: ['TORCH', 'SATCHEL', 'WHIP'],
  start: res({ fuel: 12, sand: 1 }),
  treasures: { 'treasure-1': 55, 'treasure-2': 30 },
  teaches: 'SATCHEL+PRESSURE_PLATE',
  requires: ['SATCHEL+PRESSURE_PLATE', 'WALK+TREASURE'],
  aha:
    'The idol was holding the door open. Taking it does not spring a trap — it ' +
    'just adds nine turns of torchlight to your walk home.',
  par: 48,
  hint:
    'Before you lift it, ask what it is currently doing. Then ask what else in ' +
    'your pack weighs about the same.',
};

/**
 * LEVEL 5 — The Toll of the Chasm
 * teaches: WHIP+GAP
 * requires: WHIP+GAP, WALK+TREASURE
 * aha: The whip is a ticket, not a bridge — and the cheapest tour of this room is the one that never buys a ticket it does not use.
 * par: 55
 *
 * Durability, which is the only pool that meters TRAVERSAL rather than tricks.
 *
 * Two idols on two ledges, four swings' worth of whip, and a lower corridor
 * that connects the far end back to the start — but only through a cracked
 * stone (a bullet) and a pit (sand). So the room is a loop with two priced
 * halves, and it can be walked in either direction:
 *
 *   out and back along the top, four swings          32   both idols   +58
 *   in along the top, home along the bottom          36   both idols   +54
 *   one ledge only, out and back, two swings         16   one idol     +29
 *   straight out the door beside you                  0   nothing        0
 *
 * The four-swing route wins, which is the counter-intuitive half: retracing
 * your steps is cheaper than completing the loop, because the loop's return
 * leg charges a bullet for a door you have already been through the other side
 * of. Rooms usually reward the tour. This one charges for it.
 */
const L5: LevelDef = {
  id: 'c5',
  name: 'The Toll of the Chasm',
  rows: [
    '############',
    '#@.::$.::$.#',
    '#.########.#',
    '#.cX.......#',
    '#>##########',
    '############',
  ],
  tools: ['WHIP', 'REVOLVER', 'SATCHEL'],
  start: res({ whip: 4, sand: 1, bullets: 1 }),
  treasures: { 'treasure-1': 45, 'treasure-2': 45 },
  teaches: 'WHIP+GAP',
  requires: ['WHIP+GAP', 'WALK+TREASURE'],
  aha:
    'The whip is a ticket, not a bridge — and the cheapest tour of this room is ' +
    'the one that never buys a ticket it does not use.',
  par: 55,
  hint:
    'The way back round is not free either. Count what the loop costs before ' +
    'you assume it beats turning around.',
};

/**
 * LEVEL 6 — The Architect's Ledger
 * teaches: -
 * requires: REVOLVER+ROPE, PUSH+BOULDER, WHIP+GAP, SATCHEL+PIT, TORCH+DARK, WALK+TREASURE
 * aha: Three idols, four pools, and a budget that covers all of it exactly once — provided every payment is made with the tool that has no other job.
 * par: 65
 *
 * The capstone. Every priced route in the prototype, in one room, on a budget
 * that fits only if each payment is made with the tool that is not needed
 * anywhere else.
 *
 *   the exit plate  sand 5 / whip 8 / bullet 15
 *   the pit idol    sand only
 *   the ledge idol  two whip swings — it is a dead end, so there is a return fare
 *   the dark idol   four lit turns, and nothing else will do
 *
 * The whip budget is exactly two, which is exactly the round trip to the ledge,
 * so a whip spent on the plate is an idol given up. Sand is likewise the sole
 * answer to the pit. The bullet is the only pool in the room with no second
 * job — so the bullet pays for the door, and every other assignment loses an
 * idol outright on a decision made before the player has seen the far end.
 *
 *   bullet on the plate  52 spent, all three idols   +73
 *   sand on the plate    37 spent, two idols         +48
 *   sand on the plate, walk out                       -5
 *
 * Twenty-five points and a whole idol hang on which pool pays the toll, and the
 * toll is the first thing in the room.
 */
const L6: LevelDef = {
  id: 'c6',
  name: "The Architect's Ledger",
  rows: [
    '###############',
    '#@.r._O###$X..#',
    '#.###########.#',
    '#.......::$...#',
    '#.####%%$######',
    '#+#############',
    '#>#############',
    '###############',
  ],
  tools: ['WHIP', 'TORCH', 'REVOLVER', 'SATCHEL'],
  start: res({ sand: 1, whip: 2, bullets: 1, fuel: 10 }),
  treasures: { 'treasure-1': 40, 'treasure-2': 40, 'treasure-3': 45 },
  entityFlags: { 'rope-1': { suspends: 'BOULDER' } },
  teaches: '-',
  requires: [
    'REVOLVER+ROPE',
    'PUSH+BOULDER',
    'WHIP+GAP',
    'SATCHEL+PIT',
    'TORCH+DARK',
    'WALK+TREASURE',
  ],
  aha:
    'Three idols, four pools, and a budget that covers all of it exactly once — ' +
    'provided every payment is made with the tool that has no other job.',
  par: 65,
  hint:
    'One of your four pools is the only answer to nothing. Spend that one on ' +
    'the door, and let the other three buy idols.',
};

export const LEVELS: readonly LevelDef[] = Object.freeze([L1, L2, L3, L4, L5, L6]);

export function levelById(id: string): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}
