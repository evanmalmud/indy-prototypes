import './style.css';
import { enumerateInteractions, TOOLS, TOOL_DEFS } from './kernel/tools.ts';

/**
 * Shared placeholder shell for the three pillar pages.
 *
 * Its real job right now is to prove the wiring: each page imports the same
 * interaction table, so if the toolset ever diverged between prototypes, all
 * three of these pages would show it immediately.
 */
export function mountPlaceholder(mount: HTMLElement): void {
  const rows = enumerateInteractions();
  const aha = rows.filter((i) => i.aha);

  const toolList = TOOLS.map((t) => {
    const d = TOOL_DEFS[t];
    return `<tr>
      <th>${d.name}</th>
      <td>range ${d.range}</td>
      <td>${d.traversal}</td>
      <td>${d.puzzle}</td>
    </tr>`;
  }).join('');

  const ahaList = aha
    .map((i) => `<li class="aha">${i.tool} + ${i.target}</li>`)
    .join('');

  mount.innerHTML = `
    <div class="status">
      Prototype not built yet — this page is a placeholder. The shared kernel
      is wired up and reporting <strong>${rows.length}</strong> interactions,
      <strong>${aha.length}</strong> of them flagged as designed “aha”
      moments.
    </div>

    <h2>The shared toolset</h2>
    <table class="tools">
      <thead>
        <tr><th>Tool</th><th>Range</th><th>As traversal</th><th>As puzzle key</th></tr>
      </thead>
      <tbody>${toolList}</tbody>
    </table>

    <h2>Designed “aha” interactions</h2>
    <ul>${ahaList}</ul>
  `;
}
