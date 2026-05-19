// Bench: `cv-pipeline` — S50 D8.
//
// Spec source: `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md`
// §S50 line 306 ("D8: lint + perf bench"). Companion to SPEC-45 §3
// (per-page cost ceiling) and §8 (telemetry).
//
// Measures the two CV stages that together compose every page of
// the floorplan-segmentation pipeline:
//   • classifyPage(page, runtime)
//   • runSegmentationModel(page, runtime)
//
// Mock runtime — segmentation is the hot loop (it allocates and
// fills a `width × height` Uint8Array). The bench uses a smaller
// 600 × 800 fixture page so the run completes in seconds even on a
// modest CI runner; the real model on a real page will be 2-3 ms
// per inference per SPEC-45 §3.
//
// Cold time = first sample. Warm = next 49. Measured = 200.
// Reports p50/p95/p99 + cold for each stage; writes JSON to
// `apps/bench/.run-output/cv-pipeline.json` and a markdown baseline
// to `apps/bench/reports/cv-pipeline-baseline.md`.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  classifyPage,
  MOCK_RUNTIME,
  runSegmentationModel,
} from '../../../../apps/ai-worker/src/cv/index.js';
import type { PdfPage } from '../../../../apps/ai-worker/src/cv/index.js';

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

function makePage(): PdfPage {
  return {
    id: 'bench-page',
    projectId: 'P-bench',
    pageNumber: 1,
    width: 600,
    height: 800,
    meta: { title: 'Floor Plan — Level 02', drawingType: 'plan' },
  };
}

async function runScenario(
  name: string,
  iter: () => Promise<void> | void,
  budgetMs: number,
): Promise<BenchSample> {
  // Cold sample.
  const t0 = performance.now();
  await iter();
  const cold = performance.now() - t0;

  // Warmup.
  for (let i = 0; i < 49; i++) await iter();

  // Measured.
  const samples: number[] = [];
  for (let i = 0; i < 200; i++) {
    const s = performance.now();
    await iter();
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

describe('bench: cv-pipeline (S50 D8)', () => {
  it('measures classifyPage + runSegmentationModel under their per-call budgets', async () => {
    const page = makePage();

    const classify = await runScenario(
      'classifyPage(mock)',
      async () => {
        await classifyPage(page, MOCK_RUNTIME);
      },
      // Mock classifier is regex-only — well under 1 ms; budget is
      // 10× the typical observed p95 to absorb CI noise.
      1.0,
    );

    const segment = await runScenario(
      'runSegmentationModel(mock, 600×800)',
      async () => {
        await runSegmentationModel(page, MOCK_RUNTIME);
      },
      // Mock segmentation allocates + fills a 480 000-byte mask;
      // budget is 50 ms (10× typical p95) to absorb GC / CI noise.
      50.0,
    );

    const samples = [classify, segment];
    const ts = new Date().toISOString();

    const json = {
      bench: 'cv-pipeline',
      sprint: 'S50',
      timestamp: ts,
      runtimeKind: MOCK_RUNTIME.kind,
      runtimeMock: MOCK_RUNTIME.mock,
      pageWidth: page.width,
      pageHeight: page.height,
      samples,
    };
    writeFileSync(
      resolve(RUN_OUTPUT, 'cv-pipeline.json'),
      JSON.stringify(json, null, 2),
    );

    const md = [
      '# Bench baseline — `cv-pipeline` (S50 D8)',
      '',
      `Captured ${ts} on the mock CV runtime (${MOCK_RUNTIME.kind}, ${MOCK_RUNTIME.version}).`,
      '',
      `Page fixture: ${page.width} × ${page.height} (${page.width * page.height} bytes / mask).`,
      '',
      '| Scenario | cold (ms) | warm avg (ms) | p50 (ms) | p95 (ms) | p99 (ms) | budget (ms) |',
      '|---|---:|---:|---:|---:|---:|---:|',
      ...samples.map(
        (s) =>
          `| ${s.scenario} | ${s.cold.toFixed(3)} | ${s.warmAvg.toFixed(3)} | ${s.p50.toFixed(3)} | ${s.p95.toFixed(3)} | ${s.p99.toFixed(3)} | ${s.budgetMs.toFixed(2)} |`,
      ),
      '',
      `Real ONNX adapter lands at S52 per SPEC-45 §4; this baseline measures the mock runtime so regressions in the handler / storage / cost-meter glue surface immediately.`,
      '',
    ].join('\n');
    writeFileSync(resolve(REPORTS, 'cv-pipeline-baseline.md'), md);

    // Soft-assert under the per-call budgets so CI surfaces a regression.
    for (const s of samples) {
      expect(s.p95, `${s.scenario} p95 (${s.p95.toFixed(3)} ms) exceeds budget (${s.budgetMs} ms)`).toBeLessThan(
        s.budgetMs,
      );
    }
  });
});
