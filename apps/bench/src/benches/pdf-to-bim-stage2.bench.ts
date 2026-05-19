// Bench: `pdf-to-bim-stage2` — S51 D8.
//
// Spec source: `phases/PHASE-3A-Q1-M25-M27-VI-AI-ELEMENT-CREATOR.md`
// §3.2 + §3 S51 exit criteria line 1102 (`pryzm.pdf.stage2.*` spans
// must be visible — they're emitted by the production handler at
// S52, this bench validates the underlying classifier is fast
// enough to live inside that span budget).
//
// Synthetic page: 50 line primitives arranged as 10 horizontal +
// 10 vertical wall pairs, plus 5 column rectangles. That stresses
// the O(n²) angle-group + parallel-pair scan in `detectWallPairs`,
// which is the hot loop. Per-call budget: 5 ms. Real PDFs are
// 200-400 line primitives per page — at p95 ~5 ms on this fixture
// the production pages land inside SPEC-45 §3's 30 ms per-page CV
// window with room to spare.
//
// 200 measured samples + 50 warm. Reports p50/p95/p99 + cold per
// stage (extractLines, detectWallPairs, detectColumns, classifyPage
// end-to-end). Writes JSON + markdown baseline.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  classifyPageStage2,
  detectColumns,
  detectWallPairs,
  extractLines,
} from '../../../../apps/ai-worker/src/pdf-to-bim/index.js';
import type {
  PageDecomposition,
  VectorElement,
} from '../../../../apps/ai-worker/src/pdf-to-bim/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = resolve(__dirname, '..', '..', '.run-output');
const REPORTS = resolve(__dirname, '..', '..', 'reports');
mkdirSync(RUN_OUTPUT, { recursive: true });
mkdirSync(REPORTS, { recursive: true });

interface BenchSample {
  scenario: string;
  cold: number;
  warmAvg: number;
  p50: number;
  p95: number;
  p99: number;
  budgetMs: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

function makeFixture(): PageDecomposition {
  const vectors: VectorElement[] = [];
  // 10 horizontal wall pairs at y = 0..9000, spacing 200 mm
  for (let i = 0; i < 10; i++) {
    const y = i * 1000;
    vectors.push({ kind: 'line', points: [[0, y], [3000, y]] });
    vectors.push({ kind: 'line', points: [[0, y + 200], [3000, y + 200]] });
  }
  // 10 vertical wall pairs at x = 4000..13000, spacing 200 mm
  for (let i = 0; i < 10; i++) {
    const x = 4000 + i * 1000;
    vectors.push({ kind: 'line', points: [[x, 0], [x, 3000]] });
    vectors.push({ kind: 'line', points: [[x + 200, 0], [x + 200, 3000]] });
  }
  // 5 column rectangles
  for (let i = 0; i < 5; i++) {
    const cx = 5000 + i * 800;
    const cy = 5000;
    vectors.push({
      kind: 'polygon',
      closed: true,
      points: [[cx, cy], [cx + 300, cy], [cx + 300, cy + 300], [cx, cy + 300]],
    });
  }
  return {
    pageId: 'bench-pg',
    pageWidthPt: 17000,
    pageHeightPt: 11000,
    vectors,
  };
}

async function runScenario(
  name: string,
  iter: () => void,
  budgetMs: number,
): Promise<BenchSample> {
  const t0 = performance.now();
  iter();
  const cold = performance.now() - t0;

  for (let i = 0; i < 49; i++) iter();

  const samples: number[] = [];
  for (let i = 0; i < 200; i++) {
    const s = performance.now();
    iter();
    samples.push(performance.now() - s);
  }
  samples.sort((a, b) => a - b);
  const warmAvg = samples.reduce((acc, x) => acc + x, 0) / samples.length;
  return {
    scenario: name,
    cold,
    warmAvg,
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    p99: percentile(samples, 99),
    budgetMs,
  };
}

describe('bench: pdf-to-bim-stage2 (S51 D8)', () => {
  it('measures Stage 2 sub-stages + end-to-end under per-call budgets', async () => {
    const page = makeFixture();
    const lines = extractLines(page.vectors, 1.0);

    const stages: BenchSample[] = [];
    stages.push(await runScenario(
      'extractLines(50-line page)',
      () => { extractLines(page.vectors, 1.0); },
      1.0,
    ));
    stages.push(await runScenario(
      'detectWallPairs(40 wall lines)',
      () => { detectWallPairs(lines); },
      3.0,
    ));
    stages.push(await runScenario(
      'detectColumns(5 rect candidates)',
      () => { detectColumns(page.vectors, 1.0); },
      1.0,
    ));
    stages.push(await runScenario(
      'classifyPageStage2(end-to-end)',
      () => { classifyPageStage2(page, 1.0); },
      5.0,
    ));

    const ts = new Date().toISOString();

    const json = {
      bench: 'pdf-to-bim-stage2',
      sprint: 'S51',
      timestamp: ts,
      pageVectors: page.vectors.length,
      lineCount: lines.length,
      samples: stages,
    };
    writeFileSync(
      resolve(RUN_OUTPUT, 'pdf-to-bim-stage2.json'),
      JSON.stringify(json, null, 2),
    );

    const md = [
      '# Bench baseline — `pdf-to-bim-stage2` (S51 D8)',
      '',
      `Captured ${ts} on a synthetic 50-line page (10 horizontal + 10 vertical wall pairs + 5 columns).`,
      '',
      '| Scenario | cold (ms) | warm avg (ms) | p50 (ms) | p95 (ms) | p99 (ms) | budget (ms) |',
      '|---|---:|---:|---:|---:|---:|---:|',
      ...stages.map(
        (s) =>
          `| ${s.scenario} | ${s.cold.toFixed(3)} | ${s.warmAvg.toFixed(3)} | ${s.p50.toFixed(3)} | ${s.p95.toFixed(3)} | ${s.p99.toFixed(3)} | ${s.budgetMs.toFixed(2)} |`,
      ),
      '',
      'Real PDF pages run 200–400 vector primitives. The end-to-end p95 budget of 5 ms gives ~10× headroom for the production handler at S52 to fit inside SPEC-45 §3\'s 30 ms per-page CV window.',
      '',
    ].join('\n');
    writeFileSync(resolve(REPORTS, 'pdf-to-bim-stage2-baseline.md'), md);

    for (const s of stages) {
      expect(
        s.p95,
        `${s.scenario} p95 (${s.p95.toFixed(3)} ms) exceeds budget (${s.budgetMs} ms)`,
      ).toBeLessThan(s.budgetMs);
    }
  });
});
