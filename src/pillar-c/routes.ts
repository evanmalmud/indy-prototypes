/**
 * routes.ts — the hand-authored routes for the Pillar C rooms.
 *
 * Every route below was found by exhaustive search over the reachable state
 * space during authoring, then pasted here as a literal sequence. They used to
 * live inside sim.test.ts; they now live in a plain module so tooling can
 * import them without booting vitest. sim.test.ts imports them back and
 * replays every one of them, so they are still regression tests on the
 * economy: change a price in COST_POINTS or a row in the shared table and the
 * numbers here move, loudly.
 */

import type { Dir } from '../kernel/grid.ts';
import type { Intent } from '../kernel/input.ts';
import { MOVE, USE_TOOL } from '../kernel/input.ts';
import type { ToolId } from '../kernel/tools.ts';

const M = (dir: Dir): Intent => MOVE(dir);
const T = (tool: ToolId, dir: Dir): Intent => USE_TOOL(tool, dir);

// ---------------------------------------------------------------------------
// THE ROUTES
// ---------------------------------------------------------------------------

export interface Route {
  readonly what: string;
  readonly moves: readonly Intent[];
  readonly score: number;
  readonly treasures: number;
}

export interface RoomProof {
  /** Always possible, always affordable, always worth zero treasure. */
  readonly escape: Route;
  /** Meets or beats `par:`. */
  readonly best: Route;
  /** A second winning line at a materially different price. */
  readonly alt?: Route;
}

export const PROOFS: Readonly<Record<string, RoomProof>> = {
  c1: {
    escape: {
      what: 'sand the plate and walk out — the idol stays behind the pit forever',
      score: -5,
      treasures: 0,
      moves: [M('S'), M('S'), M('E'), M('E'), M('E'), T('SATCHEL', 'E'), M('W'), M('W'), M('W'), M('S'), M('S'), M('E')],
    },
    best: {
      what: 'sand the PIT, pay the dearer whip for the plate — 13 spent, idol out',
      score: 27,
      treasures: 1,
      moves: [
        M('E'), M('E'), M('E'), M('E'), M('E'), M('E'), M('E'), M('S'), M('S'), T('SATCHEL', 'S'),
        M('S'), M('S'), M('N'), M('N'), M('N'), M('N'), M('W'), M('W'), M('W'), M('W'), M('W'),
        M('W'), M('W'), M('S'), M('S'), M('E'), M('E'), T('WHIP', 'E'), M('W'), M('W'), M('S'),
        M('S'), M('E'),
      ],
    },
    alt: {
      what: 'same idol, but the plate paid with a bullet through the rope — 20 spent',
      score: 20,
      treasures: 1,
      moves: [
        M('E'), M('E'), M('E'), M('E'), M('E'), M('E'), M('E'), M('S'), M('S'), T('SATCHEL', 'S'),
        M('S'), M('S'), M('N'), M('N'), M('N'), M('N'), M('W'), M('W'), M('W'), M('W'), M('W'),
        M('W'), M('W'), M('S'), M('S'), M('E'), T('REVOLVER', 'E'), M('E'), M('E'), M('W'), M('W'),
        M('W'), M('S'), M('S'), M('E'),
      ],
    },
  },

  c2: {
    escape: {
      what: 'rent light for the whole hall and leave empty-handed — 8 fuel',
      score: -32,
      treasures: 0,
      moves: [T('TORCH', 'N'), M('E'), M('E'), M('E'), M('E'), M('E'), M('E'), M('E'), T('TORCH', 'N'), M('E')],
    },
    best: {
      what: 'buy the brazier, fetch the idol through free light, relight only for the last stretch',
      score: 24,
      treasures: 1,
      moves: [
        T('TORCH', 'N'), M('E'), M('E'), M('E'), M('E'), T('TORCH', 'S'), T('TORCH', 'N'), M('E'),
        M('S'), M('S'), M('N'), M('N'), M('E'), T('TORCH', 'N'), M('E'), T('TORCH', 'N'), M('E'),
      ],
    },
    alt: {
      what: 'same idol, torch left burning one turn longer than it had to be',
      score: 12,
      treasures: 1,
      moves: [
        T('TORCH', 'N'), M('E'), M('E'), M('E'), M('E'), M('E'), M('S'), M('S'), M('N'), M('N'),
        M('E'), M('E'), T('TORCH', 'N'), M('E'),
      ],
    },
  },

  c3: {
    escape: {
      what: 'sand the plate, take neither idol',
      score: -5,
      treasures: 0,
      moves: [M('E'), M('E'), M('E'), T('SATCHEL', 'E'), M('W'), M('W'), M('W'), M('S'), M('S'), M('S'), M('S')],
    },
    best: {
      what: 'BULLET on the plate — the dearest payment, and the only one that frees both other tools',
      score: 54,
      treasures: 2,
      moves: [
        M('E'), T('REVOLVER', 'E'), M('E'), M('E'), M('W'), M('W'), M('W'), M('S'), M('S'), M('E'),
        M('E'), M('E'), M('E'), M('E'), M('E'), M('E'), M('N'), M('N'), T('WHIP', 'E'), T('WHIP', 'W'),
        M('S'), M('S'), T('SATCHEL', 'E'), M('E'), M('E'), M('W'), M('W'), M('W'), M('W'), M('W'),
        M('W'), M('W'), M('W'), M('W'), M('S'), M('S'),
      ],
    },
    alt: {
      what: 'whip on the plate instead — cheaper by 7, and it costs the whole ledge idol',
      score: 32,
      treasures: 1,
      moves: [
        M('E'), M('E'), T('WHIP', 'E'), M('W'), M('W'), M('S'), M('S'), M('E'), M('E'), M('E'),
        M('E'), M('E'), M('E'), M('E'), T('SATCHEL', 'E'), M('E'), M('E'), M('W'), M('W'), M('W'),
        M('W'), M('W'), M('W'), M('W'), M('W'), M('W'), M('S'), M('S'),
      ],
    },
  },

  c4: {
    escape: {
      what: 'leave the idol where it is and stroll out through the shortcut it is holding open',
      score: 0,
      treasures: 0,
      moves: [
        M('E'), M('E'), M('E'), M('E'), M('E'), M('E'), M('E'), M('E'), M('E'), M('E'), M('S'),
        M('S'), M('W'), M('W'),
      ],
    },
    best: {
      what: 'take the idol, drop into the dark for the second, sand the plate on the way back past it',
      score: 56,
      treasures: 2,
      moves: [
        M('E'), M('E'), M('E'), M('E'), M('S'), T('TORCH', 'N'), M('S'), M('W'), M('S'), M('N'),
        M('E'), T('TORCH', 'N'), M('N'), M('N'), T('SATCHEL', 'S'), M('E'), M('E'), M('E'), M('E'),
        M('E'), M('E'), M('S'), M('S'), M('W'), M('W'),
      ],
    },
    alt: {
      what: 'the swap the room teaches, and it is still 6 short: sand first, one idol, straight out',
      score: 50,
      treasures: 1,
      moves: [
        M('E'), M('E'), M('E'), M('E'), M('S'), M('N'), T('SATCHEL', 'S'), M('E'), M('E'), M('E'),
        M('E'), M('E'), M('E'), M('S'), M('S'), M('W'), M('W'),
      ],
    },
  },

  c5: {
    escape: {
      what: 'the door is three steps from the spawn and costs nothing at all',
      score: 0,
      treasures: 0,
      moves: [M('S'), M('S'), M('S')],
    },
    best: {
      what: 'four swings, out and back along the top — retracing beats completing the loop',
      score: 58,
      treasures: 2,
      moves: [
        M('E'), T('WHIP', 'E'), M('E'), T('WHIP', 'E'), T('WHIP', 'W'), M('W'), T('WHIP', 'W'),
        M('W'), M('S'), M('S'), M('S'),
      ],
    },
    alt: {
      what: 'the near ledge only — half the fare, and less than half the payout',
      score: 29,
      treasures: 1,
      moves: [M('E'), T('WHIP', 'E'), T('WHIP', 'W'), M('W'), M('S'), M('S'), M('S')],
    },
  },

  c6: {
    escape: {
      what: 'sand the plate, take nothing, leave',
      score: -5,
      treasures: 0,
      moves: [
        M('E'), M('E'), M('E'), T('SATCHEL', 'E'), M('W'), M('W'), M('W'), M('S'), M('S'), M('S'),
        M('S'), M('S'),
      ],
    },
    best: {
      what: 'the bullet pays the toll, so sand buys the pit idol and the whip buys the ledge — all three out',
      score: 73,
      treasures: 3,
      moves: [
        M('E'), T('REVOLVER', 'E'), M('E'), M('E'), M('W'), M('W'), M('W'), M('S'), M('S'), M('E'),
        M('E'), M('E'), M('E'), M('E'), M('E'), T('WHIP', 'E'), M('E'), M('E'), M('E'), M('N'),
        M('N'), M('W'), T('SATCHEL', 'W'), M('W'), M('W'), M('E'), M('E'), M('E'), M('S'), M('S'),
        M('W'), M('W'), M('W'), T('WHIP', 'W'), T('TORCH', 'N'), M('S'), M('E'), M('W'),
        T('TORCH', 'N'), M('N'), M('W'), M('W'), M('W'), M('W'), M('W'), M('W'), M('S'), M('S'),
        M('S'),
      ],
    },
    alt: {
      what: 'sand the toll instead — 15 cheaper up front, and the pit idol is gone forever',
      score: 48,
      treasures: 2,
      moves: [
        M('E'), M('E'), M('E'), T('SATCHEL', 'E'), M('W'), M('W'), M('W'), M('S'), M('S'), M('E'),
        M('E'), M('E'), M('E'), M('E'), M('E'), T('WHIP', 'E'), T('WHIP', 'W'), T('TORCH', 'N'),
        M('S'), M('E'), M('W'), T('TORCH', 'N'), M('N'), M('W'), M('W'), M('W'), M('W'), M('W'),
        M('W'), M('S'), M('S'), M('S'),
      ],
    },
  },
};

/**
 * The winning route for each room: the `best` line, which is the one that
 * meets or beats par. Same shape as Pillar A's and Pillar B's AUTHORED, so the
 * audit script can treat all three pillars alike.
 */
export const AUTHORED: Readonly<Record<string, readonly Intent[]>> = {
  c1: PROOFS.c1.best.moves,
  c2: PROOFS.c2.best.moves,
  c3: PROOFS.c3.best.moves,
  c4: PROOFS.c4.best.moves,
  c5: PROOFS.c5.best.moves,
  c6: PROOFS.c6.best.moves,
};
