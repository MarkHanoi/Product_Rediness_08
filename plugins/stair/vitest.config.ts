import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    // §FIX-STAIR-MOVE-DETACHED-STORE — this suite imports `src/handlers/index.ts`,
    // whose F-1.3 commandManager bridges (UpdateStairParameters, MoveStair) import
    // `@pryzm/command-registry`. That barrel transitively pulls `@pryzm/geometry-slab`
    // → `SlabTool` → `@thatopen/ui`, which touches `document` AT IMPORT TIME, so the
    // whole suite died with `ReferenceError: document is not defined` before any test
    // ran. happy-dom (the environment the editor suites already use) makes the import
    // graph loadable; no test here depends on a real DOM.
    environment: 'happy-dom',
  },
});
