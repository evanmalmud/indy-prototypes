import { describe, expect, it } from 'vitest';
import {
  ahaInteractions,
  coverage,
  enumerateInteractions,
  interacts,
  interactionsForTool,
  resolve,
  TOOLS,
  TOOL_DEFS,
} from './tools.ts';
import type { EntityKind } from './grid.ts';
import { LevelParseError, parseLevel, ray, vec } from './grid.ts';

// ---------------------------------------------------------------------------
// The six seeded "aha" interactions.
//
// These assertions are the contract between DESIGN-BRIEF.md and the code. If
// one of them fails, a prototype has silently changed what a tool means, and
// the three-pillar comparison is no longer isolating the pillar.
// ---------------------------------------------------------------------------

describe('the seeded aha set', () => {
  it('WHIP + BOULDER pulls one tile toward the player (the flagship)', () => {
    const i = resolve('WHIP', 'BOULDER');
    expect(i).not.toBeNull();
    expect(i!.effect.kind).toBe('PULL');
    expect(i!.effect.amount).toBe(1);
    expect(i!.aha).toBe(true);
    // The whole point: pulling inverts the push-only constraint.
    expect(i!.note).toMatch(/never pull/i);
  });

  it('SATCHEL + PRESSURE_PLATE substitutes weight (the Raiders idol swap)', () => {
    const i = resolve('SATCHEL', 'PRESSURE_PLATE');
    expect(i).not.toBeNull();
    expect(i!.effect.kind).toBe('SUBSTITUTE_WEIGHT');
    expect(i!.effect.becomes).toBe('SAND_PILE');
    expect(i!.aha).toBe(true);
  });

  it('TORCH + OIL_TRAIL propagates fire one tile per turn along the trail', () => {
    const i = resolve('TORCH', 'OIL_TRAIL');
    expect(i).not.toBeNull();
    expect(i!.effect.kind).toBe('PROPAGATE_FIRE');
    expect(i!.effect.spreadPerTurn).toBe(1);
    expect(i!.effect.spreadsAlong).toBe('OIL_TRAIL');
    expect(i!.aha).toBe(true);
  });

  it('REVOLVER + ROPE severs at range, dropping what it suspends', () => {
    const i = resolve('REVOLVER', 'ROPE');
    expect(i).not.toBeNull();
    expect(i!.effect.kind).toBe('SEVER');
    expect(i!.effect.becomes).toBeNull();
    expect(i!.range).toBe(TOOL_DEFS.REVOLVER.range);
    expect(i!.range).toBeGreaterThan(1); // "at range" is the mechanic
    expect(i!.aha).toBe(true);
  });

  it('WHIP + TORCH_ITEM flings a lit torch for remote ignition', () => {
    const i = resolve('WHIP', 'TORCH_ITEM');
    expect(i).not.toBeNull();
    expect(i!.effect.kind).toBe('FLING');
    expect(i!.effect.amount).toBe(TOOL_DEFS.WHIP.range);
    expect(i!.aha).toBe(true);
  });

  it('REVOLVER + GAS_VENT explodes — the safe tool is the wrong tool', () => {
    const i = resolve('REVOLVER', 'GAS_VENT');
    expect(i).not.toBeNull();
    expect(i!.effect.kind).toBe('EXPLODE');
    expect(i!.effect.hazardous).toBe(true);
    expect(i!.aha).toBe(true);
  });

  it('contains exactly the six designed aha interactions and no others', () => {
    const pairs = ahaInteractions()
      .map((i) => `${i.tool}+${i.target}`)
      .sort();
    expect(pairs).toEqual(
      [
        'WHIP+BOULDER',
        'SATCHEL+PRESSURE_PLATE',
        'TORCH+OIL_TRAIL',
        'REVOLVER+ROPE',
        'WHIP+TORCH_ITEM',
        'REVOLVER+GAS_VENT',
      ].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// Table integrity — the properties the architecture depends on.
// ---------------------------------------------------------------------------

describe('the interaction table', () => {
  it('has no duplicate (tool, target) rows', () => {
    const keys = enumerateInteractions().map((i) => `${i.tool}:${i.target}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every tool at least one interaction', () => {
    for (const tool of TOOLS) {
      expect(interactionsForTool(tool).length).toBeGreaterThan(0);
    }
  });

  it('returns null for undefined pairings rather than throwing', () => {
    expect(resolve('SATCHEL', 'METAL_PLATE')).toBeNull();
    expect(interacts('SATCHEL', 'METAL_PLATE')).toBe(false);
  });

  it('gives every interaction a positive range and a designer note', () => {
    for (const i of enumerateInteractions()) {
      expect(i.range).toBeGreaterThan(0);
      expect(i.note.length).toBeGreaterThan(10);
    }
  });

  // TOOL-MATRIX.md's coverage summary quotes these numbers. Asserting them
  // here means the doc cannot silently drift away from the table.
  it('matches the counts published in TOOL-MATRIX.md', () => {
    const all = enumerateInteractions();
    const toolOnTool = all.filter((i) => i.target === 'TORCH_ITEM');
    expect(all.length).toBe(20);
    expect(all.filter((i) => i.aha).length).toBe(6);
    expect(toolOnTool.length).toBe(1);
    expect(all.length - toolOnTool.length).toBe(19);
    // 14 environment targets, plus TORCH_ITEM which is a tool-on-tool target.
    expect(new Set(all.map((i) => i.target)).size).toBe(15);
  });

  it('marks both gas-vent ignitions hazardous', () => {
    expect(resolve('TORCH', 'GAS_VENT')!.effect.hazardous).toBe(true);
    expect(resolve('REVOLVER', 'GAS_VENT')!.effect.hazardous).toBe(true);
  });
});

describe('coverage tooling', () => {
  it('reports a level that uses nothing as missing every aha', () => {
    const c = coverage([]);
    expect(c.used).toEqual([]);
    expect(c.ratio).toBe(0);
    expect(c.ahaMissed.length).toBe(6);
  });

  it('scores a level that uses the flagship interaction', () => {
    const c = coverage([['WHIP', 'BOULDER'] as [typeof TOOLS[number], EntityKind]]);
    expect(c.used.length).toBe(1);
    expect(c.ahaUsed.length).toBe(1);
    expect(c.ahaMissed.length).toBe(5);
    expect(c.ratio).toBeGreaterThan(0);
  });

  it('reports full coverage when every row is used', () => {
    const all = enumerateInteractions().map(
      (i) => [i.tool, i.target] as [typeof TOOLS[number], EntityKind],
    );
    const c = coverage(all);
    expect(c.unused).toEqual([]);
    expect(c.ratio).toBe(1);
    expect(c.ahaMissed).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseLevel — every level in this repo is ASCII, so this is load-bearing.
// ---------------------------------------------------------------------------

describe('parseLevel', () => {
  it('parses terrain and reports dimensions', () => {
    const lvl = parseLevel(['#####', '#...#', '#####']);
    expect(lvl.map.width).toBe(5);
    expect(lvl.map.height).toBe(3);
    expect(lvl.map.at(vec(0, 0))).toBe('WALL');
    expect(lvl.map.at(vec(1, 1))).toBe('FLOOR');
  });

  it('extracts entities and stamps FLOOR beneath them', () => {
    const lvl = parseLevel(['#####', '#@O.#', '#####']);
    expect(lvl.entities.map((e) => e.kind)).toEqual(['PLAYER', 'BOULDER']);
    expect(lvl.map.at(vec(1, 1))).toBe('FLOOR');
    expect(lvl.map.at(vec(2, 1))).toBe('FLOOR');
    expect(lvl.spawn).toEqual(vec(1, 1));
  });

  it('gives entities stable unique ids', () => {
    const lvl = parseLevel(['#####', '#OOO#', '#####']);
    expect(lvl.entities.map((e) => e.id)).toEqual([
      'boulder-1',
      'boulder-2',
      'boulder-3',
    ]);
  });

  it('right-pads ragged rows with VOID so trailing whitespace is harmless', () => {
    const a = parseLevel(['####', '#@']);
    expect(a.map.width).toBe(4);
    expect(a.map.at(vec(3, 1))).toBe('VOID');

    const b = parseLevel(['####', '#@  ']);
    expect(b.map.toAscii()).toEqual(a.map.toAscii());
  });

  it('parses every documented terrain and entity glyph', () => {
    const lvl = parseLevel(['#.:X,=>', '@O_~rv/', 'sGcMBtV', '$n#####']);
    expect(lvl.map.at(vec(2, 0))).toBe('GAP');
    expect(lvl.map.at(vec(3, 0))).toBe('PIT');
    expect(lvl.map.at(vec(4, 0))).toBe('RUBBLE');
    expect(lvl.map.at(vec(5, 0))).toBe('WATER');
    expect(lvl.map.at(vec(6, 0))).toBe('EXIT');
    const kinds = new Set(lvl.entities.map((e) => e.kind));
    for (const k of [
      'PLAYER',
      'BOULDER',
      'PRESSURE_PLATE',
      'OIL_TRAIL',
      'ROPE',
      'GAS_VENT',
      'LEVER',
      'SNAKE',
      'GUARDIAN',
      'CRACKED_STONE',
      'METAL_PLATE',
      'BRAZIER',
      'TORCH_ITEM',
      'VINE',
      'TREASURE',
      'SAND_PILE',
    ] as EntityKind[]) {
      expect(kinds.has(k)).toBe(true);
    }
  });

  it('round-trips terrain through toAscii', () => {
    const rows = ['#####', '#.:.#', '#X,=#', '#####'];
    expect(parseLevel(rows).map.toAscii()).toEqual(rows);
  });

  it('rejects unknown characters with a located message', () => {
    expect(() => parseLevel(['##', '#?'])).toThrow(LevelParseError);
    expect(() => parseLevel(['##', '#?'])).toThrow(/'\?'/);
  });

  it('rejects two player spawns', () => {
    expect(() => parseLevel(['@@'])).toThrow(/more than one player/i);
  });

  it('rejects an empty level', () => {
    expect(() => parseLevel([])).toThrow(LevelParseError);
  });

  it('treats walkability as terrain-only', () => {
    const lvl = parseLevel(['#.:X>']);
    expect(lvl.map.isWalkable(vec(1, 0))).toBe(true); // FLOOR
    expect(lvl.map.isWalkable(vec(0, 0))).toBe(false); // WALL
    expect(lvl.map.isWalkable(vec(2, 0))).toBe(false); // GAP
    expect(lvl.map.isWalkable(vec(3, 0))).toBe(false); // PIT
    expect(lvl.map.isWalkable(vec(4, 0))).toBe(true); // EXIT
  });
});

describe('ray', () => {
  it('stops at walls and respects range', () => {
    const lvl = parseLevel(['#......#']);
    expect(ray(lvl.map, vec(1, 0), 'E', 3)).toEqual([vec(2, 0), vec(3, 0), vec(4, 0)]);
    expect(ray(lvl.map, vec(1, 0), 'W', 3)).toEqual([]); // wall immediately
  });

  it('stops at the map edge', () => {
    const lvl = parseLevel(['...']);
    expect(ray(lvl.map, vec(1, 0), 'E', 5)).toEqual([vec(2, 0)]);
  });
});
