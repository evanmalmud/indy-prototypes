import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

const here = import.meta.dirname;

/**
 * Multi-page build: one page per pillar plus a landing page. Each prototype
 * is a separate entry point so they can be opened, compared, and played
 * side by side without any shared runtime state leaking between them.
 */
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(here, 'index.html'),
        pillarA: resolve(here, 'pillar-a/index.html'),
        pillarB: resolve(here, 'pillar-b/index.html'),
        pillarC: resolve(here, 'pillar-c/index.html'),
      },
    },
  },
  test: {
    // The simulation is pure, so tests need no DOM. See README.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
