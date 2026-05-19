// Server-side Vitest config — covers server/__tests__/**/*.test.ts
// Node environment (no DOM APIs needed for Express/permission unit tests).
// Added for Task 0.4 (C08 §2.1 permission enforcement audit).
//
// Run: pnpm vitest run --config vitest.server.config.ts
//   or: pnpm test:server
//
// These tests verify server-side permission enforcement functions (hasPermission,
// canUserAccessProject) and the C08 §2.1 write-route coverage audit matrix.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: [
      'server/__tests__/**/*.test.ts',
    ],
    testTimeout: 10_000,
  },
});
