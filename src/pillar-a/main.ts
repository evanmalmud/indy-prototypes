/**
 * main.ts — Pillar A's shell.
 *
 * SHELL, not simulation. Canvas, keys, and repaint only. Nothing in this file
 * decides a game outcome: every turn is `step(state, intent)` from sim.ts, and
 * undo/reset are `TurnLoop`'s. If a rule appears to live here, it is a bug.
 *
 * Keys: WASD / arrows move · 1-4 pick a tool then a direction · Z undo ·
 *       R reset · N next room · H hint · Space wait.
 */

import '../style.css';
import type { Entity, TileMap } from '../kernel/grid.ts';
import type { PendingTool } from '../kernel/input.ts';
import { TOOL_SLOTS, mapKey } from '../kernel/input.ts';
import { TurnLoop } from '../kernel/loop.ts';
import { Renderer } from '../kernel/render.ts';
import { TOOL_DEFS, TORCH_LIGHT_RADIUS } from '../kernel/tools.ts';
import { LEVELS } from './levels.ts';
import type { SimState } from './sim.ts';
import { createState, isTerminal, step } from './sim.ts';

const TILE = 34;

export function mountPillarA(mount: HTMLElement): void {
  mount.innerHTML = `
    <style>
      #app { display: grid; gap: 1.25rem; grid-template-columns: minmax(0, auto) minmax(18rem, 22rem); align-items: start; }
      #app canvas { border: 1px solid var(--stone); background: var(--shadow); }
      .hud { border: 1px solid var(--stone); border-left: 3px solid var(--ochre); padding: 0.9rem 1rem; font-size: 0.85rem; }
      .hud h3 { color: var(--torchlight); margin: 0 0 0.15rem; font-size: 1rem; letter-spacing: 0.05em; }
      .hud .sub { color: var(--ochre); margin: 0 0 0.9rem; }
      .slots { display: grid; gap: 0.3rem; margin: 0 0 0.9rem; }
      .slot { display: flex; gap: 0.5rem; align-items: baseline; padding: 0.25rem 0.4rem; border: 1px solid transparent; }
      .slot.has { border-color: var(--stone); color: var(--bone); }
      .slot.lacks { color: #5b5040; }
      .slot.armed { border-color: var(--torchlight); background: rgba(255,179,71,0.12); }
      .slot .n { color: var(--sandstone); }
      .slot .what { color: #9a8a6a; font-size: 0.78rem; }
      .stats { display: flex; gap: 1rem; color: #9a8a6a; margin: 0 0 0.6rem; }
      .msg { min-height: 2.6rem; color: var(--bone); }
      .msg.win { color: var(--torchlight); font-weight: bold; }
      .msg.lose { color: var(--ember); }
      .hint { margin: 0.6rem 0 0; padding: 0.5rem 0.6rem; border-left: 2px solid var(--sandstone); color: var(--sandstone); font-size: 0.8rem; }
      .keys { margin: 0.9rem 0 0; color: #6b6050; font-size: 0.75rem; line-height: 1.5; }
    </style>
    <canvas id="board"></canvas>
    <div class="hud">
      <h3 id="lvl-name"></h3>
      <p class="sub" id="lvl-sub"></p>
      <div class="slots" id="slots"></div>
      <div class="stats"><span id="stat-turn"></span><span id="stat-sand"></span><span id="stat-gate"></span></div>
      <p class="msg" id="msg"></p>
      <div id="hint-box"></div>
      <p class="keys">
        WASD / arrows move &middot; 1&ndash;4 then a direction uses a tool<br />
        Z undo &middot; R reset &middot; N next room &middot; H hint &middot; Space wait
      </p>
    </div>
  `;

  const canvas = mount.querySelector<HTMLCanvasElement>('#board')!;
  const renderer = new Renderer(canvas, TILE);
  const el = (id: string): HTMLElement => mount.querySelector<HTMLElement>(`#${id}`)!;

  let index = 0;
  let pending: PendingTool = null;
  let showHint = false;
  let loop: TurnLoop<SimState>;

  /** The player is tracked as a bare position, so lend it a body to draw. */
  const scene = (s: SimState): { map: TileMap; entities: Entity[] } => ({
    map: s.map,
    entities: [...s.entities, { id: 'player', kind: 'PLAYER', at: s.player }],
  });

  function draw(s: SimState): void {
    const carriesTorch = s.tools.includes('TORCH');
    renderer.draw(scene(s), {
      lights: carriesTorch ? [{ at: s.player, radius: TORCH_LIGHT_RADIUS }] : [],
    });

    // Overlay the portcullises. To the sim they are ordinary WALL/FLOOR tiles,
    // so without this the player cannot tell a door from a wall.
    const ctx = canvas.getContext('2d');
    if (ctx !== null) {
      ctx.font = `${Math.floor(TILE * 0.72)}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const g of s.gates) {
        ctx.fillStyle = s.gatesOpen ? 'rgba(255, 179, 71, 0.45)' : '#b5651d';
        ctx.fillText(s.gatesOpen ? '·' : '=', g.x * TILE + TILE / 2, g.y * TILE + TILE / 2);
      }
    }

    const def = s.def;
    el('lvl-name').textContent = `${index + 1}/${LEVELS.length} — ${def.name}`;
    el('lvl-sub').textContent =
      def.teaches === '-' ? 'combines what you already know' : `teaches ${def.teaches}`;

    el('slots').innerHTML = TOOL_SLOTS.map((tool, i) => {
      const has = s.tools.includes(tool);
      const cls = `slot ${has ? 'has' : 'lacks'}${pending === tool ? ' armed' : ''}`;
      return `<div class="${cls}">
        <span class="n">${i + 1}</span>
        <span>${TOOL_DEFS[tool].name}</span>
        <span class="what">${has ? TOOL_DEFS[tool].traversal : '— not carried —'}</span>
      </div>`;
    }).join('');

    el('stat-turn').textContent = `turn ${s.turn}`;
    el('stat-sand').textContent = s.tools.includes('SATCHEL') ? `sand ${s.sand}` : '';
    el('stat-gate').textContent =
      s.gates.length === 0 ? '' : s.gatesOpen ? 'gate OPEN' : 'gate shut';

    const msg = el('msg');
    if (s.status === 'WON') {
      msg.className = 'msg win';
      msg.textContent = `Solved in ${s.turn} turns. Press N for the next room.`;
    } else if (s.status === 'LOST') {
      msg.className = 'msg lose';
      msg.textContent = `${s.message} Press Z to take it back.`;
    } else {
      msg.className = 'msg';
      msg.textContent = pending !== null ? `${TOOL_DEFS[pending].name} — which way?` : s.message;
    }

    el('hint-box').innerHTML = showHint ? `<p class="hint">${def.hint}</p>` : '';
  }

  function load(i: number): void {
    index = ((i % LEVELS.length) + LEVELS.length) % LEVELS.length;
    pending = null;
    showHint = false;
    const initial = createState(LEVELS[index]);
    renderer.fit(initial.map);
    loop = new TurnLoop<SimState>({ initial, step, render: draw, isTerminal });
    loop.start();
  }

  window.addEventListener('keydown', (ev) => {
    const k = ev.key;

    if (k === 'n' || k === 'N') {
      load(index + 1);
      ev.preventDefault();
      return;
    }
    if (k === 'h' || k === 'H') {
      showHint = !showHint;
      draw(loop.getState());
      ev.preventDefault();
      return;
    }

    // input.ts binds the lowercase forms; accept the shifted ones too.
    const normalized = k === 'Z' ? 'z' : k === 'R' ? 'r' : k;
    const result = mapKey(normalized, pending);
    pending = result.pending;

    if (result.intent !== null) {
      loop.submit(result.intent);
    } else {
      draw(loop.getState()); // repaint so the armed-tool prompt shows
    }

    if (k.startsWith('Arrow') || k === ' ') ev.preventDefault();
  });

  load(0);
}

const mountPoint = document.querySelector<HTMLDivElement>('#app');
if (mountPoint !== null) mountPillarA(mountPoint);
