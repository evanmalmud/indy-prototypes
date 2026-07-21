/**
 * grid.ts — genre-agnostic grid primitives.
 *
 * Nothing in this file touches the DOM, canvas, or timers. Levels are
 * hand-authored ASCII so Evan can edit them in a text editor.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const vec = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => vec(a.x + b.x, a.y + b.y);
export const sub = (a: Vec2, b: Vec2): Vec2 => vec(a.x - b.x, a.y - b.y);
export const scale = (a: Vec2, k: number): Vec2 => vec(a.x * k, a.y * k);
export const eq = (a: Vec2, b: Vec2): boolean => a.x === b.x && a.y === b.y;
export const key = (a: Vec2): string => `${a.x},${a.y}`;

/** Manhattan distance — the only metric that matters on a 4-way grid. */
export const manhattan = (a: Vec2, b: Vec2): number =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** Chebyshev distance — used for light radius, which spills diagonally. */
export const chebyshev = (a: Vec2, b: Vec2): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export type Dir = 'N' | 'S' | 'E' | 'W';

export const DIRS: Readonly<Record<Dir, Vec2>> = Object.freeze({
  N: vec(0, -1),
  S: vec(0, 1),
  E: vec(1, 0),
  W: vec(-1, 0),
});

export const ALL_DIRS: readonly Dir[] = ['N', 'E', 'S', 'W'];

/** Unit step from `from` toward `to`, or null if they are not axis-aligned. */
export function dirToward(from: Vec2, to: Vec2): Dir | null {
  const d = sub(to, from);
  if (d.x === 0 && d.y === 0) return null;
  if (d.x !== 0 && d.y !== 0) return null;
  if (d.x > 0) return 'E';
  if (d.x < 0) return 'W';
  if (d.y > 0) return 'S';
  return 'N';
}

/**
 * Tiles are terrain — the immovable substrate of a room.
 * Anything that can move, burn, be pulled, or be destroyed is an Entity.
 */
export type TileKind =
  | 'VOID' // off-map padding; never walkable
  | 'FLOOR'
  | 'WALL'
  | 'GAP' // a marked chasm — whip-swingable
  | 'PIT' // a hole — fillable with sand
  | 'RUBBLE' // what CRACKED_STONE leaves behind; walkable
  | 'WATER'
  | 'EXIT';

export const WALKABLE: ReadonlySet<TileKind> = new Set<TileKind>([
  'FLOOR',
  'RUBBLE',
  'EXIT',
]);

/**
 * Entity kinds double as the `targetKind` axis of the interaction table in
 * tools.ts. Adding an entity kind here and a row there is the whole cost of
 * adding a new interaction — no simulation code changes.
 */
export type EntityKind =
  | 'PLAYER'
  | 'BOULDER'
  | 'PRESSURE_PLATE'
  | 'OIL_TRAIL'
  | 'ROPE'
  | 'GAS_VENT'
  | 'LEVER'
  | 'SNAKE'
  | 'GUARDIAN'
  | 'CRACKED_STONE'
  | 'METAL_PLATE'
  | 'BRAZIER'
  | 'TORCH_ITEM'
  | 'VINE'
  | 'TREASURE'
  | 'SAND_PILE';

export interface Entity {
  readonly id: string;
  readonly kind: EntityKind;
  readonly at: Vec2;
  /** Free-form per-kind state (lit, burning, stunned, suspending, ...). */
  readonly flags?: Readonly<Record<string, number | boolean | string>>;
}

// ---------------------------------------------------------------------------
// TileMap
// ---------------------------------------------------------------------------

export class TileMap {
  readonly width: number;
  readonly height: number;
  private readonly tiles: readonly TileKind[];

  constructor(width: number, height: number, tiles: readonly TileKind[]) {
    if (tiles.length !== width * height) {
      throw new Error(
        `TileMap size mismatch: ${width}x${height} needs ${width * height} tiles, got ${tiles.length}`,
      );
    }
    this.width = width;
    this.height = height;
    this.tiles = tiles;
  }

  inBounds(p: Vec2): boolean {
    return p.x >= 0 && p.y >= 0 && p.x < this.width && p.y < this.height;
  }

  at(p: Vec2): TileKind {
    return this.inBounds(p) ? this.tiles[p.y * this.width + p.x] : 'VOID';
  }

  isWalkable(p: Vec2): boolean {
    return WALKABLE.has(this.at(p));
  }

  /** Returns a new TileMap — TileMap is immutable so undo stays cheap. */
  with(p: Vec2, kind: TileKind): TileMap {
    if (!this.inBounds(p)) return this;
    const next = this.tiles.slice();
    next[p.y * this.width + p.x] = kind;
    return new TileMap(this.width, this.height, next);
  }

  /** Every in-bounds position, row-major. Used by coverage tooling. */
  *positions(): Generator<Vec2> {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) yield vec(x, y);
    }
  }

  find(kind: TileKind): Vec2[] {
    const out: Vec2[] = [];
    for (const p of this.positions()) if (this.at(p) === kind) out.push(p);
    return out;
  }

  toAscii(): string[] {
    const rows: string[] = [];
    for (let y = 0; y < this.height; y++) {
      let row = '';
      for (let x = 0; x < this.width; x++) row += TILE_TO_CHAR[this.at(vec(x, y))];
      rows.push(row);
    }
    return rows;
  }
}

// ---------------------------------------------------------------------------
// ASCII level format
// ---------------------------------------------------------------------------

/**
 * The authoring legend. Terrain chars map to a TileKind; entity chars map to
 * an EntityKind and stamp FLOOR underneath, so `O` is "a boulder on a floor"
 * rather than requiring two layers in the text file.
 */
export const TERRAIN_LEGEND: Readonly<Record<string, TileKind>> = Object.freeze({
  '#': 'WALL',
  '.': 'FLOOR',
  ':': 'GAP',
  'X': 'PIT',
  ',': 'RUBBLE',
  '=': 'WATER',
  '>': 'EXIT',
  ' ': 'VOID',
});

export const ENTITY_LEGEND: Readonly<Record<string, EntityKind>> = Object.freeze({
  '@': 'PLAYER',
  'O': 'BOULDER',
  '_': 'PRESSURE_PLATE',
  '~': 'OIL_TRAIL',
  'r': 'ROPE',
  'v': 'GAS_VENT',
  '/': 'LEVER',
  's': 'SNAKE',
  'G': 'GUARDIAN',
  'c': 'CRACKED_STONE',
  'M': 'METAL_PLATE',
  'B': 'BRAZIER',
  't': 'TORCH_ITEM',
  'V': 'VINE',
  '$': 'TREASURE',
  'n': 'SAND_PILE',
});

const TILE_TO_CHAR: Readonly<Record<TileKind, string>> = Object.freeze({
  VOID: ' ',
  FLOOR: '.',
  WALL: '#',
  GAP: ':',
  PIT: 'X',
  RUBBLE: ',',
  WATER: '=',
  EXIT: '>',
});

export interface Level {
  readonly map: TileMap;
  readonly entities: readonly Entity[];
  /** Convenience: where the single `@` was, if the level had one. */
  readonly spawn: Vec2 | null;
}

export class LevelParseError extends Error {}

/**
 * Parse hand-authored ASCII into a Level.
 *
 * Ragged rows are right-padded with VOID, so trailing whitespace in the
 * source file never changes the level — an editor that strips it is safe.
 */
export function parseLevel(rows: readonly string[]): Level {
  if (rows.length === 0) throw new LevelParseError('level has no rows');

  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));
  if (width === 0) throw new LevelParseError('level has zero width');

  const tiles: TileKind[] = [];
  const entities: Entity[] = [];
  let spawn: Vec2 | null = null;
  const counters = new Map<EntityKind, number>();

  for (let y = 0; y < height; y++) {
    const row = rows[y];
    for (let x = 0; x < width; x++) {
      const ch = x < row.length ? row[x] : ' ';
      const at = vec(x, y);

      const entityKind = ENTITY_LEGEND[ch];
      if (entityKind !== undefined) {
        const n = (counters.get(entityKind) ?? 0) + 1;
        counters.set(entityKind, n);
        entities.push({
          id: `${entityKind.toLowerCase()}-${n}`,
          kind: entityKind,
          at,
        });
        if (entityKind === 'PLAYER') {
          if (spawn !== null) {
            throw new LevelParseError(
              `level has more than one player spawn (@) — second at ${key(at)}`,
            );
          }
          spawn = at;
        }
        tiles.push('FLOOR'); // entities stand on floor
        continue;
      }

      const tileKind = TERRAIN_LEGEND[ch];
      if (tileKind === undefined) {
        throw new LevelParseError(
          `unknown level character '${ch}' at ${key(at)} (row ${y}, col ${x})`,
        );
      }
      tiles.push(tileKind);
    }
  }

  return { map: new TileMap(width, height, tiles), entities, spawn };
}

/** All entities standing on a given tile. */
export function entitiesAt(entities: readonly Entity[], p: Vec2): Entity[] {
  return entities.filter((e) => eq(e.at, p));
}

/**
 * Walk from `from` in direction `dir` up to `range` tiles, stopping at the
 * first wall. Returns the tiles traversed, nearest first — the ray that whip,
 * revolver, and torch-light all share.
 */
export function ray(
  map: TileMap,
  from: Vec2,
  dir: Dir,
  range: number,
  blocks: (t: TileKind) => boolean = (t) => t === 'WALL' || t === 'VOID',
): Vec2[] {
  const out: Vec2[] = [];
  let p = from;
  for (let i = 0; i < range; i++) {
    p = add(p, DIRS[dir]);
    if (!map.inBounds(p)) break;
    if (blocks(map.at(p))) break;
    out.push(p);
  }
  return out;
}
