import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    // §AGGREGATOR-FLAKE — this suite generates procedural textures pixel by pixel, so
    // several cases legitimately run 5–9 s and vitest's DEFAULT `testTimeout` is 5 s.
    //
    // ⭐ THE TELL THAT IT IS A TIMEOUT AND NOT A DEFECT: two consecutive runs failed
    // DIFFERENT tests — `is memoised per (id, resolution)` at 5549 ms, then `every tile
    // preset actually draws grout` at 5876 ms — while 185 of 186 passed each time. A real
    // defect does not move between cases run to run; a threshold sitting inside the
    // distribution does. Measured slowest case on this machine: 8516 ms.
    //
    // 30 s is ~3.5x the measured worst, which leaves room for a CI runner slower than a
    // dev laptop, and it is inside the range this repo already uses (10 s api-gateway …
    // 60 s bench). It is deliberately NOT tuned to just clear 8516 ms: a timeout exists to
    // catch a HANG, which is unbounded, so buying margin costs nothing and tuning to the
    // observed maximum reproduces the flake on the first slower runner.
    testTimeout: 30_000,
  },
});
