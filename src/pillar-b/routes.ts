/**
 * routes.ts — the hand-authored intent scripts for the Pillar B levels.
 *
 * Moved verbatim out of scratch.test.ts so tooling can import them without
 * booting vitest. scratch.test.ts imports them back and replays them.
 *
 * NOTE: b6 has no entry. The only b6 script in scratch.test.ts is a
 * fire-timing probe (WAIT, light the torch, then thirty WAITs) that the test
 * never asserts a win for, so there is no authored winning route for b6 to
 * move here. Nothing has been invented to fill the gap.
 */

import type { Intent } from '../kernel/input.ts';
import { MOVE, USE_TOOL, WAIT } from '../kernel/input.ts';

const M = MOVE;
const T = USE_TOOL;

export const AUTHORED: Readonly<Record<string, readonly Intent[]>> = {
  b1: [
    ...Array(4).fill(M('E')),
    T('SATCHEL', 'E'),
    ...Array(7).fill(M('E')),
  ],

  b2: [
    M('S'),
    ...Array(9).fill(M('E')),
    T('TORCH', 'N'),
    WAIT,
    M('N'),
    M('E'),
    M('E'),
    M('E'),
  ],

  b3: [
    M('E'),
    T('WHIP', 'E'),
    T('WHIP', 'E'),
    WAIT,
    ...Array(8).fill(M('E')),
  ],

  b4: [
    M('E'), M('E'), M('E'), WAIT, WAIT,
    T('WHIP', 'E'), T('WHIP', 'E'),
    M('W'),
    T('WHIP', 'E'),
    M('W'),
    T('WHIP', 'E'),
    M('W'), M('S'), M('S'),
  ],

  b5: [
    WAIT, WAIT, WAIT, WAIT,
    T('REVOLVER', 'E'),
    M('S'), M('S'),
  ],
};
