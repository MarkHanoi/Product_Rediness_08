// @vitest-environment node
//
// family-editor-bundle-budget — §13 quality gate (S52 D1).
//
// Per the rewrite plan §13:
//   • The first-paint chunk of `apps/component-editor` must be
//     ≤ 180 KB gzip.
//   • The THREE-using chunk must NOT be in the first-paint set —
//     it lazy-loads only after the user clicks the 3D view tab.
//
// This test runs a real `vite build` into `dist-gate/` (separate from
// the user's `dist/`), inspects the generated `index.html`, sums the
// gzip sizes of every eagerly-imported chunk (entry script + every
// `modulepreload` link), and asserts:
//
//   1. `total_eager_gzip ≤ 180 * 1024`
//   2. No eagerly-imported chunk's filename matches /three/i
//
// Build cost: ~1-2 s on the current source tree.  Acceptable as a CI
// gate — it doesn't run on every developer save (the workflow is the
// blocking gate; local watch-mode runs only the cheap structural
// gates).

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { promisify } from 'node:util';
import { build } from 'vite';
import { PKG_ROOT } from './_walk.js';

const gzip = promisify(zlib.gzip);
const FIRST_PAINT_BUDGET_BYTES = 180 * 1024;

describe('family-editor-bundle-budget — §13 quality gate (S52 D1)', () => {
  it('first-paint chunk ≤ 180 KB gzip and excludes the THREE chunk', async () => {
    // Build into a per-run tmpdir so the test leaves no repo artefacts and
    // never collides with the developer's own `npm run build` in `dist/`.
    const dist = await fs.mkdtemp(path.join(os.tmpdir(), 'pryzm-fce-bundle-'));
    try {
      await build({
        root: PKG_ROOT,
        logLevel: 'silent',
        build: { write: true, outDir: dist, emptyOutDir: true },
      });

      const indexHtml = await fs.readFile(path.join(dist, 'index.html'), 'utf8');

      const eager = new Set<string>();
      for (const m of indexHtml.matchAll(
        /<link[^>]+rel=["']modulepreload["'][^>]+href=["']([^"']+)["']/g,
      )) {
        eager.add(m[1]!.replace(/^\/+/, ''));
      }
      for (const m of indexHtml.matchAll(
        /<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/g,
      )) {
        eager.add(m[1]!.replace(/^\/+/, ''));
      }

      const eagerJs: Array<{ rel: string; gzipBytes: number }> = [];
      let totalGz = 0;
      for (const rel of eager) {
        if (!rel.endsWith('.js')) continue;
        const buf = await fs.readFile(path.join(dist, rel));
        const gz = await gzip(buf);
        eagerJs.push({ rel, gzipBytes: gz.length });
        totalGz += gz.length;
      }

      const summary = eagerJs.map((j) => `${j.rel}=${j.gzipBytes}B`).join(', ');
      expect(
        totalGz,
        `Eager JS gzip total ${totalGz}B exceeds budget ${FIRST_PAINT_BUDGET_BYTES}B. Chunks: ${summary}`,
      ).toBeLessThanOrEqual(FIRST_PAINT_BUDGET_BYTES);

      const eagerThree = eagerJs.filter((j) => /\bthree[-.]/i.test(j.rel));
      expect(
        eagerThree.map((j) => j.rel),
        `THREE chunk eagerly loaded: ${eagerThree.map((j) => j.rel).join(', ') || '(none)'}`,
      ).toEqual([]);
    } finally {
      await fs.rm(dist, { recursive: true, force: true });
    }
  }, 30_000);
});
