import { defineConfig } from 'vitest/config';

// Per-package Vitest config for @pryzm/geometry-siteworks — C116 · ADR-0384.
//
// Environment: `node`. This package is PURE, and the purity is the test strategy
// rather than a side effect of it: the sweep is a total function of
// (centreline, widthM), so the ring a test asserts is byte-for-byte the ring
// production computes. Geometry that needed a browser could only be exercised
// through a fake, and [[fake-more-capable-than-real]] records what that produces.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
});
