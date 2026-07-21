/**
 * routes.ts — the hand-authored winning intent sequence for each Pillar A level.
 *
 * These used to live as literals inside sim.test.ts. They are the same data,
 * moved into a plain module so that tooling (the audit script) can import them
 * without booting vitest. sim.test.ts imports them back and replays them, so
 * this file is still proven by the same assertions it always was.
 */

import type { Dir } from '../kernel/grid.ts';
import type { Intent } from '../kernel/input.ts';
import { MOVE, USE_TOOL } from '../kernel/input.ts';
import type { ToolId } from '../kernel/tools.ts';

const M = (dir: Dir): Intent => MOVE(dir);
const T = (tool: ToolId, dir: Dir): Intent => USE_TOOL(tool, dir);
const rep = (n: number, intent: Intent): Intent[] => Array.from({ length: n }, () => intent);

export const AUTHORED: Readonly<Record<string, readonly Intent[]>> = {
  // a1 The Antechamber — push the boulder onto the plate, sand the pit
  a1: [
    ...rep(2, M('E')), // walk up behind the stone
    ...rep(3, M('E')), // three pushes: the law being installed
    ...rep(5, M('W')),
    ...rep(3, M('S')), // down through the opened portcullis
    T('SATCHEL', 'E'), // the pit becomes floor
    ...rep(3, M('E')),
  ],

  // a2 The Weighing Room — scoop the pile, sand the plate, walk away from it
  a2: [
    T('SATCHEL', 'E'), // scoop: satchel starts empty
    ...rep(2, M('E')),
    T('SATCHEL', 'E'), // substitute weight onto the plate
    ...rep(5, M('E')),
    ...rep(2, M('S')),
  ],

  // a3 The Cracked Gallery — shoot the landing spot, then swing to it
  a3: [
    T('REVOLVER', 'E'), // shatter the stone on the far lip
    T('WHIP', 'E'), // now there is somewhere to land
    T('REVOLVER', 'E'), // second stone, building the revolver habit
    ...rep(7, M('E')),
  ],

  // a4 The Sealed Vault — the pull
  a4: [
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
  ],

  // a5 The Two Scales — sand the near plate, pull for the far one
  a5: [
    ...rep(3, M('E')),
    T('SATCHEL', 'E'), // near plate: the satchel's one load
    ...rep(3, M('E')),
    T('WHIP', 'E'), // far plate: weight from across the water
    ...rep(6, M('W')),
    ...rep(4, M('S')),
  ],

  // a6 The Architect's Last Joke — sever, then the pull that undoes the mistake
  a6: [
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
  ],
};
