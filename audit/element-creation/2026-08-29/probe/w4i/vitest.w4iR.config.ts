import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

const EDITOR = resolve(__dirname, '../../../../../apps/editor');
const BACKSLASH = String.fromCharCode(92);
const PROBE = resolve(__dirname, 'w4iR.probe.test.ts').split(BACKSLASH).join('/');

export default defineConfig({
  root: EDITOR,
  resolve: {
    alias: {
      '@app/ui': resolve(EDITOR, './src/ui'),
      '@app/engine': resolve(EDITOR, './src/engine'),
      '@app/rendering': resolve(EDITOR, './src/rendering'),
      '@thatopen/ui': resolve(EDITOR, './__mocks__/thatopen-ui.node-stub.ts'),
    },
  },
  test: {
    environment: 'happy-dom',
    include: [PROBE],
    testTimeout: 600000,
    hookTimeout: 600000,
  },
});
