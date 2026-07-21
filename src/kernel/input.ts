/**
 * input.ts — discrete intents.
 *
 * Everything here is turn-based. There is no analog axis, no held key, no
 * frame-rate dependence anywhere in this repo. An intent is one discrete
 * decision, and the simulation consumes exactly one per step.
 */

import type { Dir } from './grid.ts';
import type { ToolId } from './tools.ts';
import { TOOLS } from './tools.ts';

export type Intent =
  | { readonly kind: 'MOVE'; readonly dir: Dir }
  | { readonly kind: 'USE_TOOL'; readonly tool: ToolId; readonly dir: Dir }
  | { readonly kind: 'UNDO' }
  | { readonly kind: 'RESET' }
  | { readonly kind: 'WAIT' };

export const MOVE = (dir: Dir): Intent => ({ kind: 'MOVE', dir });
export const USE_TOOL = (tool: ToolId, dir: Dir): Intent => ({
  kind: 'USE_TOOL',
  tool,
  dir,
});
export const UNDO: Intent = { kind: 'UNDO' };
export const RESET: Intent = { kind: 'RESET' };
export const WAIT: Intent = { kind: 'WAIT' };

/**
 * Tool slots 1..4 map to the shared toolset in a fixed order. All three
 * prototypes use the same binding so muscle memory transfers between them —
 * part of isolating the pillar from incidental differences.
 */
export const TOOL_SLOTS: readonly ToolId[] = TOOLS;

export function toolForSlot(slot: number): ToolId | null {
  return TOOL_SLOTS[slot - 1] ?? null;
}

/**
 * A pending tool use needs a direction. The shell holds the tool, waits for
 * the next direction key, then emits one USE_TOOL intent.
 */
export type PendingTool = ToolId | null;

const DIR_KEYS: Readonly<Record<string, Dir>> = Object.freeze({
  ArrowUp: 'N',
  ArrowDown: 'S',
  ArrowLeft: 'W',
  ArrowRight: 'E',
  w: 'N',
  s: 'S',
  a: 'W',
  d: 'E',
  W: 'N',
  S: 'S',
  A: 'W',
  D: 'E',
});

export interface KeyResult {
  readonly intent: Intent | null;
  readonly pending: PendingTool;
}

/**
 * Pure key -> intent mapping. Takes the current pending-tool state and
 * returns the next one, so this is testable without a browser.
 *
 *   press "1"     -> pending = WHIP, no intent yet
 *   press "Right" -> intent = USE_TOOL(WHIP, E), pending cleared
 */
export function mapKey(key: string, pending: PendingTool): KeyResult {
  if (key === 'Escape') return { intent: null, pending: null };

  const slot = Number.parseInt(key, 10);
  if (Number.isInteger(slot) && slot >= 1 && slot <= TOOL_SLOTS.length) {
    const tool = toolForSlot(slot);
    // Pressing the same slot twice cancels it.
    return { intent: null, pending: pending === tool ? null : tool };
  }

  const dir = DIR_KEYS[key];
  if (dir !== undefined) {
    if (pending !== null) return { intent: USE_TOOL(pending, dir), pending: null };
    return { intent: MOVE(dir), pending: null };
  }

  if (key === 'u' || key === 'z') return { intent: UNDO, pending: null };
  if (key === 'r') return { intent: RESET, pending: null };
  if (key === ' ' || key === '.') return { intent: WAIT, pending: null };

  return { intent: null, pending };
}

/** Human-readable label, for the on-screen prompt. */
export function describeIntent(intent: Intent): string {
  switch (intent.kind) {
    case 'MOVE':
      return `move ${intent.dir}`;
    case 'USE_TOOL':
      return `${intent.tool.toLowerCase()} ${intent.dir}`;
    case 'UNDO':
      return 'undo';
    case 'RESET':
      return 'reset';
    case 'WAIT':
      return 'wait';
  }
}
