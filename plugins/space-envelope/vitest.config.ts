import { defineConfig } from 'vitest/config';

// Per-package Vitest config for @pryzm/plugin-space-envelope —
// §FEAT-SPACE-ENVELOPE (L-12900) · C114 §13.
//
// Environment: `node`. The suite drives a REAL CommandBus with a REAL UndoStack and a
// REAL store, because C114 §11 item 4 asks for a proof of undo-stack DEPTH — and a
// depth assertion against a fake stack would prove only that the fake counts. See
// [[fake-more-capable-than-real]].
export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
});
