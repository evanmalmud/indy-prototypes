/**
 * instrument.ts — the measurement tap.
 *
 * The audit needs to answer two questions the shipped sims were never built to
 * answer:
 *
 *   1. WHICH interactions fired during this step?  (interaction coverage)
 *   2. What happens if a given interaction DOES NOT EXIST?  (forced-interaction)
 *
 * Both are answered here, in one place, because all three pillars funnel every
 * table-driven interaction through `resolve()` in tools.ts. Hooking that single
 * chokepoint instruments A, B and C at once — the same property that lets one
 * solver serve all three.
 *
 * NOT everything a level's `requires:` line names is a table row. Three kinds
 * of pseudo-interaction exist:
 *
 *   traversal verbs   WHIP+GAP, SATCHEL+PIT   declared on TOOL_DEFS
 *   movement physics  PUSH+BOULDER, WALK+TREASURE
 *   world events      FLOOD+FLOOR, FIRE+VINE, COLLAPSE+BOULDER, TORCH+DARK, ...
 *
 * Those have no `resolve()` call to hook, so each sim calls `fired()` at the
 * exact line where the event occurs. Those call sites are the only edits this
 * task makes to the three simulations, and they are pure observation: `fired()`
 * returns void and `blocked()` is consulted only where a disable must take
 * effect.
 *
 * DISCIPLINE: this module is INERT unless armed. `record()` is off by default,
 * so the shipped prototypes, the browser shells and the existing test suite all
 * behave exactly as they did before. Only the audit arms it.
 *
 * No DOM, no timers, no state beyond two module-level registers.
 */

/**
 * A `TOOL+TARGET` token, e.g. `WHIP+BOULDER` or `FLOOD+FLOOR`. Deliberately a
 * bare string rather than `ToolId`-typed: pseudo-interactions use verbs
 * (`PUSH`, `FLOOD`, `FIRE`, `COLLAPSE`, `WALK`) that are not tools, and this
 * module must not import the tool vocabulary it is measuring.
 */
export type InteractionToken = string;

export const token = (tool: string, target: string): InteractionToken => `${tool}+${target}`;

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

let recording: Set<InteractionToken> | null = null;

/**
 * Begin recording into a fresh set. Returns the set, which the caller reads
 * after the step it wraps. Passing the same set back in is not supported —
 * one arm, one step, so a step that fires nothing is distinguishable from a
 * step that was never observed.
 */
export function arm(): Set<InteractionToken> {
  recording = new Set();
  return recording;
}

/** Stop recording. Anything fired after this is ignored. */
export function disarm(): void {
  recording = null;
}

/**
 * Report that an interaction actually fired.
 *
 * Call this at the point of OCCURRENCE, never at the point of consideration —
 * a whip that finds a boulder but cannot budge it has not fired WHIP+BOULDER,
 * and recording it there would inflate every coverage number in the audit.
 */
export function fired(tool: string, target: string): void {
  recording?.add(token(tool, target));
}

// ---------------------------------------------------------------------------
// Disabling — the forced-interaction test
// ---------------------------------------------------------------------------

let disabled: ReadonlySet<InteractionToken> = new Set();

/**
 * Make the named interactions cease to exist, then run `body`, then restore.
 *
 * For table rows this makes `resolve()` return null, which every sim already
 * treats as "this pairing does nothing and the ray passes through" — exactly
 * the semantics of deleting the row. For pseudo-interactions the sims consult
 * `blocked()` at the same line that calls `fired()`.
 *
 * The question this exists to ask: if the level is STILL solvable with the
 * interaction deleted, then the level never required it, and whatever aha it
 * claims to teach is a suggestion rather than a constraint.
 */
export function withDisabled<T>(tokens: readonly InteractionToken[], body: () => T): T {
  const previous = disabled;
  disabled = new Set(tokens);
  try {
    return body();
  } finally {
    disabled = previous;
  }
}

/** True if this pairing has been deleted for the current experiment. */
export function blocked(tool: string, target: string): boolean {
  return disabled.has(token(tool, target));
}

/** Reset both registers. Used between audit runs so nothing leaks across levels. */
export function reset(): void {
  recording = null;
  disabled = new Set();
}
