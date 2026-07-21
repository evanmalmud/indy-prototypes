import { describe, expect, it } from 'vitest';
import { renderAscii } from '../kernel/render.ts';
import { USE_TOOL, WAIT } from '../kernel/input.ts';
import type { Intent } from '../kernel/input.ts';
import { LEVELS } from './levels.ts';
import { AUTHORED } from './routes.ts';
import { createState, step } from './sim.ts';

const T = USE_TOOL;

function trace(id: string, script: readonly Intent[], limit = 200) {
  const def = LEVELS.find((l) => l.id === id)!;
  let s = createState(def);
  const lines: string[] = [`--- ${id} start`, ...renderAscii({ map: s.map, entities: [...s.entities, { id: 'p', kind: 'PLAYER', at: s.player }] })];
  script.slice(0, limit).forEach((i, n) => {
    const before = s;
    s = step(s, i);
    lines.push(
      `t${n + 1} ${JSON.stringify(i)} -> turn=${s.turn} player=${s.player.x},${s.player.y} status=${s.status} ${before === s ? 'NOOP' : ''} | ${s.message}`,
    );
  });
  lines.push(...renderAscii({ map: s.map, entities: [...s.entities, { id: 'p', kind: 'PLAYER', at: s.player }] }));
  return { s, log: lines.join('\n') };
}

describe('scratch', () => {
  it('row widths', () => {
    const report = LEVELS.map((l) => `${l.id}: ${l.rows.map((r) => r.length).join(',')}`).join('\n');
    console.log(report);
    for (const l of LEVELS) {
      const w = new Set(l.rows.map((r) => r.length));
      expect(w.size, `${l.id} ragged: ${[...w]}`).toBe(1);
    }
  });

  it('b1', () => {
    const { s, log } = trace('b1', AUTHORED.b1);
    console.log(log);
    expect(s.status).toBe('WON');
  });

  it('b2', () => {
    const { s, log } = trace('b2', AUTHORED.b2);
    console.log(log);
    expect(s.status).toBe('WON');
  });

  it('b3', () => {
    const { s, log } = trace('b3', AUTHORED.b3);
    console.log(log);
    expect(s.status).toBe('WON');
  });

  it('b4', () => {
    const { s, log } = trace('b4', AUTHORED.b4);
    console.log(log);
    expect(s.status).toBe('WON');
  });

  it('b5', () => {
    const { s, log } = trace('b5', AUTHORED.b5);
    console.log(log);
    expect(s.status).toBe('WON');
  });

  it('b6 fire timing', () => {
    const def = LEVELS.find((l) => l.id === 'b6')!;
    let s = createState(def);
    const log: string[] = [];
    // light on turn 2
    const script: Intent[] = [WAIT, T('TORCH', 'E'), ...Array(30).fill(WAIT)];
    script.forEach((i, n) => {
      s = step(s, i);
      const fire = s.entities.filter((e) => e.kind === 'OIL_TRAIL' && e.flags?.burning === true).map((e) => `${e.at.x},${e.at.y}`);
      const rope = s.entities.some((e) => e.kind === 'ROPE');
      const b = s.entities.filter((e) => e.kind === 'BOULDER').map((e) => `${e.at.x},${e.at.y} float=${e.flags?.floating}`);
      log.push(`t${n + 1} fire=[${fire}] rope=${rope} boulders=[${b}] status=${s.status}`);
    });
    console.log(log.join('\n'));
    console.log(renderAscii({ map: s.map, entities: s.entities }).join('\n'));
  });
});
