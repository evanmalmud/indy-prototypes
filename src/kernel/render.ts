/**
 * render.ts — flat programmer art on a 2D canvas.
 *
 * Warm temple palette: sandstone, ochre, torchlight, deep shadow. Flat fills
 * and one-character glyphs — legibility over looks. Nothing here is verified
 * by tests (there is no display on the build server), so nothing here may
 * decide a game outcome. Render reads state; it never writes it.
 */

import type { Entity, TileKind, Vec2 } from './grid.ts';
import { TileMap, chebyshev, vec } from './grid.ts';

export const PALETTE = Object.freeze({
  shadow: '#140f0a', // deep shadow — the unlit tomb
  stone: '#3b3025', // wall
  sandstone: '#c9a227', // lit floor
  sandstoneDim: '#6b5a35', // unlit floor
  ochre: '#b5651d', // interactive scenery
  torchlight: '#ffb347', // flame + lit radius
  ember: '#e8541f', // fire, explosions
  bone: '#efe6d2', // player, text
  verdigris: '#4a7c68', // water, snakes
  blood: '#8c2f1f', // hazard markers
});

export const TILE_COLORS: Readonly<Record<TileKind, string>> = Object.freeze({
  VOID: PALETTE.shadow,
  FLOOR: PALETTE.sandstoneDim,
  WALL: PALETTE.stone,
  GAP: '#0d0a07',
  PIT: '#1e1710',
  RUBBLE: '#7a6a4a',
  WATER: PALETTE.verdigris,
  EXIT: PALETTE.torchlight,
});

export const ENTITY_GLYPHS: Readonly<Record<string, string>> = Object.freeze({
  PLAYER: '@',
  BOULDER: 'O',
  PRESSURE_PLATE: '_',
  OIL_TRAIL: '~',
  ROPE: 'r',
  GAS_VENT: 'v',
  LEVER: '/',
  SNAKE: 's',
  GUARDIAN: 'G',
  CRACKED_STONE: 'c',
  METAL_PLATE: 'M',
  BRAZIER: 'B',
  TORCH_ITEM: 't',
  VINE: 'V',
  TREASURE: '$',
  SAND_PILE: 'n',
});

export const ENTITY_COLORS: Readonly<Record<string, string>> = Object.freeze({
  PLAYER: PALETTE.bone,
  BOULDER: '#8a7a5c',
  PRESSURE_PLATE: PALETTE.ochre,
  OIL_TRAIL: '#2a2118',
  ROPE: '#a8894f',
  GAS_VENT: '#7fa87f',
  LEVER: PALETTE.ochre,
  SNAKE: PALETTE.verdigris,
  GUARDIAN: '#9c3b2a',
  CRACKED_STONE: '#5c5142',
  METAL_PLATE: '#9aa3ab',
  BRAZIER: PALETTE.torchlight,
  TORCH_ITEM: PALETTE.torchlight,
  VINE: '#5d7a3a',
  TREASURE: '#ffd75e',
  SAND_PILE: PALETTE.sandstone,
});

export interface RenderOptions {
  readonly tileSize?: number;
  /** Tiles within this many steps of a light source render at full warmth. */
  readonly lights?: readonly { at: Vec2; radius: number }[];
}

export interface Scene {
  readonly map: TileMap;
  readonly entities: readonly Entity[];
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;
  readonly tileSize: number;

  constructor(canvas: HTMLCanvasElement, tileSize = 32) {
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('2d canvas context unavailable');
    this.canvas = canvas;
    this.ctx = ctx;
    this.tileSize = tileSize;
  }

  /** Size the canvas to the level. Call once per level load. */
  fit(map: TileMap): void {
    this.canvas.width = map.width * this.tileSize;
    this.canvas.height = map.height * this.tileSize;
  }

  draw(scene: Scene, opts: RenderOptions = {}): void {
    const ts = opts.tileSize ?? this.tileSize;
    const lights = opts.lights ?? [];
    const { ctx, canvas } = this;

    ctx.fillStyle = PALETTE.shadow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < scene.map.height; y++) {
      for (let x = 0; x < scene.map.width; x++) {
        const p = vec(x, y);
        const kind = scene.map.at(p);
        if (kind === 'VOID') continue;

        ctx.fillStyle = TILE_COLORS[kind];
        ctx.fillRect(x * ts, y * ts, ts, ts);

        if (isLit(p, lights)) {
          ctx.fillStyle = 'rgba(255, 179, 71, 0.18)';
          ctx.fillRect(x * ts, y * ts, ts, ts);
        }

        ctx.strokeStyle = 'rgba(20, 15, 10, 0.55)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x * ts + 0.5, y * ts + 0.5, ts - 1, ts - 1);
      }
    }

    ctx.font = `${Math.floor(ts * 0.72)}px ui-monospace, "SF Mono", Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const e of scene.entities) {
      const glyph = ENTITY_GLYPHS[e.kind] ?? '?';
      ctx.fillStyle = ENTITY_COLORS[e.kind] ?? PALETTE.bone;
      if (e.flags?.burning === true || e.flags?.lit === true) {
        ctx.fillStyle = PALETTE.ember;
      }
      ctx.fillText(glyph, e.at.x * ts + ts / 2, e.at.y * ts + ts / 2);
    }
  }
}

function isLit(p: Vec2, lights: readonly { at: Vec2; radius: number }[]): boolean {
  return lights.some((l) => chebyshev(p, l.at) <= l.radius);
}

/**
 * Headless fallback: render a scene as ASCII. Used by tests and by the
 * build server, where there is no canvas at all.
 */
export function renderAscii(scene: Scene): string[] {
  const rows = scene.map.toAscii();
  const grid = rows.map((r) => r.split(''));
  for (const e of scene.entities) {
    const { x, y } = e.at;
    if (grid[y]?.[x] !== undefined) grid[y][x] = ENTITY_GLYPHS[e.kind] ?? '?';
  }
  return grid.map((r) => r.join(''));
}
