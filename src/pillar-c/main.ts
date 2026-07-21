/**
 * main.ts — Pillar C's shell.
 *
 * SHELL, not simulation. Canvas, keys, repaint. Nothing here decides a game
 * outcome: every turn is `step(state, intent)` from sim.ts, undo and reset are
 * `TurnLoop`'s, and the score shown is `score(state)` computed by the sim. If a
 * price appears to be set in this file, it is a bug.
 *
 * The HUD is doing more work in this pillar than in the others, because the
 * thing the player is optimising is invisible on the board. Four pools, what
 * each one is worth, what is in the pack, the running score and the par all
 * have to be legible at a glance, or "find the cheapest solution" degenerates
 * into guesswork.
 *
 * And the win screen leads with what was LEFT BEHIND. That is deliberate: the
 * sting of a missed idol is this pillar's entire retention mechanic, and a
 * screen that just says "solved" throws it away.
 *
 * Keys: WASD / arrows move · 1-4 pick a tool then a direction · Z undo ·
 *       R reset · N next room · H hint · Space wait.
 */

import '../style.css';
import type { Entity, TileMap } from '../kernel/grid.ts';
import { key } from '../kernel/grid.ts';
import type { PendingTool } from '../kernel/input.ts';
import { TOOL_SLOTS, mapKey } from '../kernel/input.ts';
import { TurnLoop } from '../kernel/loop.ts';
import { Renderer } from '../kernel/render.ts';
import type { ResourceId } from '../kernel/tools.ts';
import { RESOURCES, TOOL_DEFS, TOOL_USE_COST, TORCH_LIGHT_RADIUS } from '../kernel/tools.ts';
import { LEVELS } from './levels.ts';
import type { SimState } from './sim.ts';
import {
  COST_POINTS,
  carriedValue,
  createState,
  isTerminal,
  score,
  spent,
  spentPoints,
  step,
  totalTreasureValue,
  treasuresLeft,
} from './sim.ts';

const TILE = 34;

const POOL_LABEL: Readonly<Record<ResourceId, string>> = {
  fuel: 'torch fuel',
  bullets: 'bullets',
  sand: 'sand loads',
  whip: 'whip',
};

export function mountPillarC(mount: HTMLElement): void {
  mount.innerHTML = `
    <style>
      #app { display: grid; gap: 1.25rem; grid-template-columns: minmax(0, auto) minmax(20rem, 24rem); align-items: start; }
      #app canvas { border: 1px solid var(--stone); background: var(--shadow); }
      .hud { border: 1px solid var(--stone); border-left: 3px solid var(--ochre); padding: 0.9rem 1rem; font-size: 0.85rem; }
      .hud h3 { color: var(--torchlight); margin: 0 0 0.15rem; font-size: 1rem; letter-spacing: 0.05em; }
      .hud .sub { color: var(--ochre); margin: 0 0 0.9rem; }
      .ledger { display: grid; gap: 0.2rem; margin: 0 0 0.8rem; padding: 0.5rem 0.6rem; border: 1px solid var(--stone); }
      .ledger .row { display: grid; grid-template-columns: 6.5rem 1fr auto; gap: 0.5rem; align-items: baseline; }
      .ledger .name { color: #9a8a6a; }
      .ledger .pips { color: var(--torchlight); letter-spacing: 0.12em; word-break: break-all; }
      .ledger .pips.out { color: #6b5b45; }
      .ledger .unit { color: #6b6050; font-size: 0.72rem; }
      .score { display: grid; grid-template-columns: 1fr auto; gap: 0.3rem; margin: 0 0 0.8rem; padding: 0.5rem 0.6rem; border: 1px solid var(--stone); border-left: 3px solid var(--torchlight); }
      .score .k { color: #9a8a6a; }
      .score .v { color: var(--bone); text-align: right; }
      .score .v.good { color: var(--torchlight); font-weight: bold; }
      .score .v.bad { color: var(--ember); }
      .slots { display: grid; gap: 0.3rem; margin: 0 0 0.8rem; }
      .slot { display: grid; grid-template-columns: 1rem 6rem 1fr; gap: 0.5rem; align-items: baseline; padding: 0.25rem 0.4rem; border: 1px solid transparent; }
      .slot.has { border-color: var(--stone); color: var(--bone); }
      .slot.lacks { color: #5b5040; }
      .slot.armed { border-color: var(--torchlight); background: rgba(255,179,71,0.12); }
      .slot.broke { color: var(--ember); border-color: rgba(200,80,40,0.4); }
      .slot .n { color: var(--sandstone); }
      .slot .what { color: #9a8a6a; font-size: 0.75rem; }
      .msg { min-height: 2.6rem; color: var(--bone); }
      .msg.win { color: var(--torchlight); }
      .msg.lose { color: var(--ember); }
      .tally { margin: 0.4rem 0 0; padding: 0.5rem 0.6rem; border-left: 2px solid var(--torchlight); font-size: 0.8rem; }
      .tally .left { color: var(--ember); }
      .hint { margin: 0.6rem 0 0; padding: 0.5rem 0.6rem; border-left: 2px solid var(--sandstone); color: var(--sandstone); font-size: 0.8rem; }
      .keys { margin: 0.9rem 0 0; color: #6b6050; font-size: 0.75rem; line-height: 1.5; }
    </style>
    <canvas id="board"></canvas>
    <div class="hud">
      <h3 id="lvl-name"></h3>
      <p class="sub" id="lvl-sub"></p>
      <div class="ledger" id="ledger"></div>
      <div class="score" id="score"></div>
      <div class="slots" id="slots"></div>
      <p class="msg" id="msg"></p>
      <div id="tally"></div>
      <div id="hint-box"></div>
      <p class="keys">
        WASD / arrows move &middot; 1&ndash;4 then a direction uses a tool<br />
        aim the torch at open air to strike or shutter it<br />
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

  const scene = (s: SimState): { map: TileMap; entities: Entity[] } => ({
    map: s.map,
    entities: [...s.entities, { id: 'player', kind: 'PLAYER', at: s.player }],
  });

  /** Pips, so a pool reads as a quantity rather than as a number to parse. */
  const pips = (n: number): string => (n <= 0 ? '—' : '●'.repeat(Math.min(n, 16)));

  function draw(s: SimState): void {
    // Light comes from the carried torch and from anything already burning, so
    // what the renderer warms is exactly what the sim will let you walk into.
    const lights = [
      ...(s.torchLit ? [{ at: s.player, radius: TORCH_LIGHT_RADIUS }] : []),
      ...s.entities
        .filter((e) => e.kind === 'BRAZIER' && e.flags?.lit === true)
        .map((e) => ({ at: e.at, radius: TORCH_LIGHT_RADIUS })),
    ];
    renderer.draw(scene(s), { lights });

    const ctx = canvas.getContext('2d');
    if (ctx !== null) {
      // Unlit dark tiles are painted over — the room is not hiding anything the
      // sim is not also refusing to let you enter.
      ctx.fillStyle = 'rgba(10, 8, 6, 0.82)';
      for (const p of s.map.positions()) {
        if (!s.dark.has(key(p))) continue;
        const near = lights.some(
          (l) => Math.max(Math.abs(l.at.x - p.x), Math.abs(l.at.y - p.y)) <= l.radius,
        );
        if (!near) ctx.fillRect(p.x * TILE, p.y * TILE, TILE, TILE);
      }
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

    // Every pool, always, with what a unit of it costs you.
    el('ledger').innerHTML = RESOURCES.filter((r) => def.start[r] > 0 || s.pools[r] > 0)
      .map((r) => {
        const out = s.pools[r] <= 0;
        return `<div class="row">
          <span class="name">${POOL_LABEL[r]}</span>
          <span class="pips${out ? ' out' : ''}">${pips(s.pools[r])}</span>
          <span class="unit">${s.pools[r]} left &middot; ${COST_POINTS[r]}/use</span>
        </div>`;
      })
      .join('');

    const sc = score(s);
    const held = s.carried.length;
    const all = Object.keys(def.treasures).length;
    el('score').innerHTML = `
      <span class="k">treasure held</span><span class="v">${held}/${all} &middot; ${carriedValue(s)}</span>
      <span class="k">spent</span><span class="v">${spentPoints(s)}</span>
      <span class="k">score</span><span class="v ${sc >= def.par ? 'good' : sc < 0 ? 'bad' : ''}">${sc}</span>
      <span class="k">par</span><span class="v">${def.par}</span>
    `;

    el('slots').innerHTML = TOOL_SLOTS.map((tool, i) => {
      const has = s.tools.includes(tool);
      const pool = TOOL_USE_COST[tool].resource;
      const empty = has && s.pools[pool] <= 0;
      const cls = `slot ${has ? (empty ? 'has broke' : 'has') : 'lacks'}${pending === tool ? ' armed' : ''}`;
      const note = !has
        ? '— not carried —'
        : empty
          ? `out of ${POOL_LABEL[pool]}`
          : `${s.pools[pool]} × ${POOL_LABEL[pool]}`;
      return `<div class="${cls}">
        <span class="n">${i + 1}</span>
        <span>${TOOL_DEFS[tool].name}</span>
        <span class="what">${note}</span>
      </div>`;
    }).join('');

    const msg = el('msg');
    const tally = el('tally');
    if (s.status === 'WON') {
      // Lead with the sting. This is the screen the pillar is built around.
      const left = treasuresLeft(s);
      const leftValue = left.reduce((n, id) => n + def.treasures[id], 0);
      const verdict =
        sc >= def.par
          ? `You made par. ${def.par} was the target; you got out with ${sc}.`
          : `Under par by ${def.par - sc}. Par is ${def.par}.`;
      msg.className = 'msg win';
      msg.textContent = `Out alive in ${s.turn} turns.`;
      tally.innerHTML = `<div class="tally">
        <div>${verdict}</div>
        <div>carried out <strong>${carriedValue(s)}</strong> &middot; spent <strong>${spentPoints(s)}</strong>
          (${RESOURCES.filter((r) => spent(s)[r] > 0)
            .map((r) => `${spent(s)[r]} ${POOL_LABEL[r]}`)
            .join(', ') || 'nothing'})</div>
        <div class="${left.length > 0 ? 'left' : ''}">${
          left.length === 0
            ? 'Nothing left behind. There was nothing else in there.'
            : `<strong>${left.length} treasure${left.length === 1 ? '' : 's'} left behind</strong>, worth ${leftValue}. Someone could have afforded them.`
        }</div>
        <div>Z to take it back and try it cheaper &middot; N for the next room.</div>
      </div>`;
    } else if (s.status === 'LOST') {
      msg.className = 'msg lose';
      msg.textContent = `${s.message} Press Z to take it back.`;
      tally.innerHTML = '';
    } else {
      msg.className = 'msg';
      msg.textContent = pending !== null ? `${TOOL_DEFS[pending].name} — which way?` : s.message;
      tally.innerHTML =
        held === all && all > 0
          ? `<div class="tally">Everything in this room is in your pack. Now get out with it.</div>`
          : '';
    }

    el('hint-box').innerHTML = showHint
      ? `<p class="hint">${def.hint}<br /><br /><em>total treasure in this room: ${totalTreasureValue(def)}</em></p>`
      : '';
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

    const normalized = k === 'Z' ? 'z' : k === 'R' ? 'r' : k;
    const result = mapKey(normalized, pending);
    pending = result.pending;

    if (result.intent !== null) {
      loop.submit(result.intent);
    } else {
      draw(loop.getState());
    }

    if (k.startsWith('Arrow') || k === ' ') ev.preventDefault();
  });

  load(0);
}

const mountPoint = document.querySelector<HTMLDivElement>('#app');
if (mountPoint !== null) mountPillarC(mountPoint);
