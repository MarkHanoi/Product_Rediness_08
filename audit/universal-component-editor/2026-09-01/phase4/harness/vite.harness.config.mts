// lane 4E harness build config — §COMPONENT-RENDER (audit §12 Phase 4E).
//
// NOT part of any product build. It exists so the rendered-instance proof is
// REPRODUCIBLE rather than asserted. From the repo root:
//
//   npx vite build --config audit/universal-component-editor/2026-09-01/phase4/harness/vite.harness.config.mts
//   node audit/universal-component-editor/2026-09-01/phase4/harness/serve.mjs "$PWD/lane4e-dist" 5211 &
//   node audit/universal-component-editor/2026-09-01/phase4/harness/drive.mjs render.html out.json shot.png
//
// The repo's own vite DEV server was tried first and abandoned: the SECOND request
// to any URL hung past 120 s on this tree, which is the standing
// [[localhost-dev-unusable-test-on-prod]] observation. A one-off production bundle
// plus a 20-line static server is deterministic and takes ~15 min.
import { defineConfig } from 'vite';
import { resolve, join } from 'node:path';
import { realpathSync } from 'node:fs';

const zodV4Path = realpathSync(join(process.cwd(), 'node_modules', 'zod'));

export default defineConfig({
  root: resolve('./audit/universal-component-editor/2026-09-01/phase4/harness'),
  logLevel: 'info',
  build: {
    target: 'esnext',
    minify: false,
    sourcemap: false,
    reportCompressedSize: false,
    outDir: resolve(process.cwd(), './lane4e-dist'),
    rollupOptions: {
      input: {
        index: resolve('./audit/universal-component-editor/2026-09-01/phase4/harness/index.html'),
        render: resolve('./audit/universal-component-editor/2026-09-01/phase4/harness/render.html'),
      },
    },
    emptyOutDir: true,
    chunkSizeWarningLimit: 100000,
  },
  resolve: {
    alias: {
      zod: zodV4Path,
      '@pryzm/renderer-three/three': 'three',
      // The harness lives under audit/ and resolves @pryzm/* by walking up to the
      // repo root node_modules. `@pryzm/plugin-component` is linked into
      // apps/editor/node_modules (lane 4C declared it there), not the root, so the
      // two subpaths this harness imports are pointed at their source. Harness-only
      // wiring: nothing in the product resolves this way.
      // 2026-09-05 §L7-COMMITTER-HOME: the committer moved to L7; the harness keeps
      // its import specifier and follows the file.
      '@pryzm/plugin-component/committer': resolve('./apps/editor/src/engine/component/index.ts'),
      '@pryzm/plugin-component': resolve('./plugins/component/src/index.ts'),
      '@app/ui': resolve('./apps/editor/src/ui'),
      '@app/engine': resolve('./apps/editor/src/engine'),
      '@app/rendering': resolve('./apps/editor/src/rendering'),
    },
    dedupe: ['zod'],
  },
});
