import { defineConfig } from 'vite';

/**
 * Family Creator SPA — Vite config.
 *
 * Hard rules baked into this build (per the rewrite plan §3.2):
 *  - No React, Vue, or Svelte runtime. Vanilla TS only.
 *  - THREE.js may be imported only by `*Committer.ts` files (enforced by ESLint
 *    boundary rule + the `family-editor-no-three-leak` CI gate, S52 D2).
 *  - First-paint chunk budget: ≤ 180 KB gzip (`family-editor-bundle-budget`
 *    gate, S52 D1). The 3D preview chunk that imports THREE only loads when
 *    the user clicks the 3D view tab.
 *
 * Dev server allows all hosts so the Replit preview proxy can iframe it.
 */
export default defineConfig({
  server: {
    host: true,
    port: 5174,
    strictPort: false,
  },
  preview: {
    host: true,
    port: 4174,
  },
  build: {
    target: 'esnext',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('packages/geometry-kernel')) return 'kernel';
          if (id.includes('packages/constraint-solver')) return 'solver';
          return undefined;
        },
      },
    },
  },
});
