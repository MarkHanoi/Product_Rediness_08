import { defineConfig } from 'vitest/config';

// Per-package Vitest config for @pryzm/facade-reconstruction — C108 §6.
//
// Environment: `node`, and that is load-bearing rather than incidental. C108 §5.3
// requires the reconstruction engine to be THREE-free, DOM-free and I/O-free, and a
// `node` environment is the guard: if a stage ever reaches for `document`, an
// `Image`, a `<canvas>` or `fetch`, this suite fails rather than passing quietly in
// a browser-shaped harness.
//
// ⛔ C108 §6.2: every test in this suite compares a COMPUTED NUMBER to a KNOWN
// GROUND TRUTH. "No error thrown", "the array is non-empty" and "a facade was
// produced" are NOT assertions and may not be added here.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
});
