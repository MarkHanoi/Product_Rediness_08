// Bench: `bundle-size` — NFT 15.
//
// TARGET SOURCE: `@pryzm/perf-budgets` → C10 §1 row 15.  This file states no
// number of its own; see packages/perf-budgets/src/nft-targets.ts.
//
// ── W5-1 REWRITE, 2026-08-11 ────────────────────────────────────────────────
// The previous revision gzipped a JSON list of `@pryzm/schemas` EXPORT NAMES
// and asserted only `byteLength > 0`.  That is not a bundle size under any
// reading: it measured a few hundred identifier strings, could not fail, and
// carried a header target ("< 250 KB", from the deleted `01-VISION.md §5`)
// that disagreed with C10's "< 4 MB gzipped" by a factor of 16.  It is the
// clearest case in the repo of a green bench manufacturing false confidence.
//
// This revision measures the real quantity: the gzipped byte total of every
// JS/MJS asset emitted by the production `vite build` into `dist/`.
//
// It SKIPS — never passes — when no build is present.  A missing build must
// not read as a met budget.
//
// KNOWN AMBIGUITY, reported not resolved: C10 §1 says "Bundle size (editor
// app) < 4 MB gzipped" while C10 §3 describes ten lazily-loaded vendor chunks
// (cesium, web-ifc, thatopen, pathtracer, pdfjs, dxf, rhino3dm…) that are by
// design NOT in the initial load.  "Total emitted JS" and "eager startup
// graph" are very different numbers.  This bench measures the TOTAL, the
// stricter and less arguable reading, and additionally reports the largest
// chunks so the split is visible.  If C10 means the eager graph, C10 must say
// so — the bench must not pick the interpretation that makes it pass.

import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { nft, nftLimit } from '@pryzm/perf-budgets';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = join(__dirname, '..', '..', '.run-output');
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const DIST = resolve(REPO_ROOT, 'dist');

const NFT = nft(15);
const LIMIT_MB = nftLimit(15); // 4, from C10 §1 — never restated here.

interface Asset {
  readonly file: string;
  readonly gzipBytes: number;
}

function collectJsAssets(dir: string): Asset[] {
  const out: Asset[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectJsAssets(full));
    } else if (/\.(js|mjs)$/.test(entry.name)) {
      out.push({ file: entry.name, gzipBytes: gzipSync(readFileSync(full)).length });
    }
  }
  return out;
}

describe('bundle-size — NFT 15', () => {
  it.skipIf(!existsSync(DIST))(
    `total gzipped JS emitted by \`pnpm build\` is under the C10 §1 budget (${NFT.c10Target})`,
    () => {
      const assets = collectJsAssets(DIST);

      // A build directory with no JS in it is a broken build, not a small one.
      expect(assets.length, 'dist/ exists but emitted no JS — build is broken').toBeGreaterThan(0);

      const totalBytes = assets.reduce((sum, a) => sum + a.gzipBytes, 0);
      const totalMb = totalBytes / 1024 / 1024;

      const largest = [...assets].sort((a, b) => b.gzipBytes - a.gzipBytes).slice(0, 15);

      mkdirSync(RUN_OUTPUT, { recursive: true });
      writeFileSync(
        join(RUN_OUTPUT, 'bundle-size.json'),
        JSON.stringify(
          {
            name: 'bundle-size',
            nft: 15,
            c10Target: NFT.c10Target,
            limitMb: LIMIT_MB,
            totalGzipBytes: totalBytes,
            totalGzipMb: Number(totalMb.toFixed(3)),
            assetCount: assets.length,
            unit: 'MB',
            measures: 'gzip of every .js/.mjs emitted into dist/ by the production vite build',
            largestChunksKB: largest.map((a) => ({
              file: a.file,
              gzipKB: Number((a.gzipBytes / 1024).toFixed(1)),
            })),
          },
          null,
          2,
        ),
      );

      expect(
        totalMb,
        `NFT 15 MISS — dist/ ships ${totalMb.toFixed(2)} MB gzipped across ${assets.length} ` +
          `JS assets; C10 §1 budget is ${LIMIT_MB} MB. Largest: ` +
          largest
            .slice(0, 5)
            .map((a) => `${a.file} ${(a.gzipBytes / 1024).toFixed(0)}KB`)
            .join(', '),
      ).toBeLessThan(LIMIT_MB);
    },
  );

  it('records that a missing build is NOT a met budget', () => {
    // Guard against the skip above being mistaken for a pass.
    if (!existsSync(DIST)) {
      console.warn(
        '[bundle-size] NFT 15 NOT MEASURED — no dist/. Run `pnpm build` first. ' +
          'Skipped ≠ passed.',
      );
    }
    expect(LIMIT_MB).toBe(4);
  });
});
