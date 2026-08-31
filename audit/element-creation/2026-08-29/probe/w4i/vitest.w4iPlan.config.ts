import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

const CAM = resolve(__dirname, '../../../../../packages/core-app-model');
const BACKSLASH = String.fromCharCode(92);
const PROBE = resolve(__dirname, 'w4iPlan.probe.test.ts').split(BACKSLASH).join('/');

export default defineConfig({
  root: CAM,
  test: {
    environment: 'happy-dom',
    include: [PROBE],
    testTimeout: 300000,
    hookTimeout: 300000,
  },
});
