import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    // happy-dom: the room command handlers are now legacy bridges (L-75 / L-79
    // §FIX-ROOM-SIBLING-HANDLERS-STORE) that read window.commandManager /
    // window.roomStore and import @pryzm/command-registry, whose barrel
    // transitively instantiates a core-app-model singleton touching `window` at
    // module load. A DOM-like global is therefore required to even collect the
    // suite (under 'node' it threw "window is not defined" at import time).
    environment: 'happy-dom',
  },
});
