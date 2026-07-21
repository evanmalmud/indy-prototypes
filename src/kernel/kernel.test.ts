import { describe, expect, it } from 'vitest';
import { HISTORY_CAP, History } from './undo.ts';
import { MOVE, USE_TOOL, describeIntent, mapKey, toolForSlot } from './input.ts';
import { TileMap, parseLevel, vec } from './grid.ts';
import { renderAscii } from './render.ts';

describe('input', () => {
  it('maps direction keys to move intents', () => {
    expect(mapKey('ArrowUp', null)).toEqual({ intent: MOVE('N'), pending: null });
    expect(mapKey('d', null)).toEqual({ intent: MOVE('E'), pending: null });
  });

  it('binds slots 1..4 to the shared toolset in a fixed order', () => {
    expect(toolForSlot(1)).toBe('WHIP');
    expect(toolForSlot(2)).toBe('TORCH');
    expect(toolForSlot(3)).toBe('REVOLVER');
    expect(toolForSlot(4)).toBe('SATCHEL');
    expect(toolForSlot(5)).toBeNull();
  });

  it('arms a tool, then the next direction fires it', () => {
    const armed = mapKey('1', null);
    expect(armed.intent).toBeNull();
    expect(armed.pending).toBe('WHIP');

    const fired = mapKey('ArrowLeft', armed.pending);
    expect(fired.intent).toEqual(USE_TOOL('WHIP', 'W'));
    expect(fired.pending).toBeNull();
  });

  it('cancels a pending tool on the same slot or Escape', () => {
    expect(mapKey('1', 'WHIP').pending).toBeNull();
    expect(mapKey('Escape', 'TORCH')).toEqual({ intent: null, pending: null });
  });

  it('switches directly between armed tools', () => {
    expect(mapKey('3', 'WHIP').pending).toBe('REVOLVER');
  });

  it('maps undo, reset and wait', () => {
    expect(mapKey('u', null).intent).toEqual({ kind: 'UNDO' });
    expect(mapKey('r', null).intent).toEqual({ kind: 'RESET' });
    expect(mapKey(' ', null).intent).toEqual({ kind: 'WAIT' });
  });

  it('ignores unknown keys without dropping a pending tool', () => {
    expect(mapKey('q', 'TORCH')).toEqual({ intent: null, pending: 'TORCH' });
  });

  it('describes every intent shape', () => {
    expect(describeIntent(MOVE('N'))).toBe('move N');
    expect(describeIntent(USE_TOOL('WHIP', 'E'))).toBe('whip E');
    expect(describeIntent({ kind: 'WAIT' })).toBe('wait');
  });
});

describe('undo history', () => {
  it('starts empty and reports depth', () => {
    const h = new History<number>(0);
    expect(h.canUndo).toBe(false);
    expect(h.pop()).toBeNull();
    h.push(1);
    expect(h.depth).toBe(1);
    expect(h.canUndo).toBe(true);
  });

  it('pops states in reverse order', () => {
    const h = new History<number>(0);
    h.push(1);
    h.push(2);
    expect(h.pop()).toBe(2);
    expect(h.pop()).toBe(1);
    expect(h.pop()).toBeNull();
  });

  it('caps at 200 entries, dropping the oldest', () => {
    const h = new History<number>(-1);
    for (let i = 0; i < HISTORY_CAP + 50; i++) h.push(i);
    expect(h.depth).toBe(HISTORY_CAP);
    expect(h.pop()).toBe(HISTORY_CAP + 49); // newest survives
  });

  it('reset returns the initial state and clears history', () => {
    const h = new History<string>('start');
    h.push('a');
    expect(h.reset()).toBe('start');
    expect(h.canUndo).toBe(false);
  });

  it('rejects a cap below 1', () => {
    expect(() => new History<number>(0, 0)).toThrow();
  });
});

describe('TileMap', () => {
  it('rejects a size/tile-count mismatch', () => {
    expect(() => new TileMap(2, 2, ['FLOOR', 'FLOOR'])).toThrow(/size mismatch/);
  });

  it('treats out-of-bounds as VOID rather than throwing', () => {
    const { map } = parseLevel(['..', '..']);
    expect(map.at(vec(-1, 0))).toBe('VOID');
    expect(map.at(vec(9, 9))).toBe('VOID');
    expect(map.inBounds(vec(9, 9))).toBe(false);
  });

  it('is immutable — with() returns a new map', () => {
    const { map } = parseLevel(['..']);
    const next = map.with(vec(0, 0), 'WALL');
    expect(map.at(vec(0, 0))).toBe('FLOOR'); // original untouched
    expect(next.at(vec(0, 0))).toBe('WALL');
    expect(next).not.toBe(map);
  });

  it('finds all tiles of a kind', () => {
    const { map } = parseLevel(['#.#', '.#.']);
    expect(map.find('WALL')).toEqual([vec(0, 0), vec(2, 0), vec(1, 1)]);
  });
});

describe('renderAscii (headless fallback)', () => {
  it('round-trips a level back to the text it was authored as', () => {
    const rows = ['#####', '#@.O#', '#.._#', '#####'];
    const lvl = parseLevel(rows);
    expect(renderAscii({ map: lvl.map, entities: lvl.entities })).toEqual(rows);
  });
});
