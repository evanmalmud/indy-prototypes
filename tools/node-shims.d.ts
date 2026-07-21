/**
 * node-shims.d.ts — the four Node surfaces the audit touches.
 *
 * `@types/node` is not a dependency of this repo and adding one for a dev
 * instrument would be a poor trade: the prototypes themselves are browser-only
 * and pull no Node types at all. Declaring exactly what `tools/` uses keeps the
 * audit under `tsc` (so it is typechecked like everything else) without
 * dragging a full platform typing into the build.
 *
 * If `tools/` ever needs more of Node than this, that is the signal to add the
 * real dependency rather than to grow this file.
 */

declare module 'node:fs' {
  export function writeFileSync(path: string, data: string, encoding: string): void;
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
}

declare const process: {
  readonly stderr: { write(chunk: string): boolean };
  cwd(): string;
  exit(code?: number): never;
};
