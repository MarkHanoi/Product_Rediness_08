import { defineConfig } from 'vitest/config';

// Per-package Vitest config for @pryzm/geometry-space-envelope —
// §FEAT-SPACE-ENVELOPE (L-12900) · C114 · ADR-0380.
//
// Environment: `node`. This package is PURE, and the purity is the test strategy rather
// than a side effect of it: the face-move PLANNER is a total function of
// (envelope, face, delta), so the verdict a test asserts is byte-for-byte the verdict
// production computes. A planner that needed a browser could only ever be exercised
// through a fake — and [[fake-more-capable-than-real]] records what that produces: a
// fake built from the header cannot falsify the header.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
});
