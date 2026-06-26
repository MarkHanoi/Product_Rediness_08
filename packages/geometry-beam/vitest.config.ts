import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // node env: THREE works under node vitest (see core-app-model's
    // ElementInstanceBridge.test.ts + scene-committer/InstancedMeshCoalescer.test.ts).
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
});
