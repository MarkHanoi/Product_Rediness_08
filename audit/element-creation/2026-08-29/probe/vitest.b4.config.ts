import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

const EDITOR = resolve(__dirname, '../../../../apps/editor');
const PROBE = resolve(__dirname, 'b4Dispatch.probe.test.ts').split('\\').join('/');

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
    environment: 'node',
    include: [PROBE],
    testTimeout: 120000,
  },
});
