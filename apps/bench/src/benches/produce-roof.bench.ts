// Bench: `produce-roof` — S10-T7.
//
// Mirrors `produce-wall.bench.ts` (S08-T9).  Reports cold / warm-avg
// / p50 / p95 / p99 across three representative roof shapes.  Hard
// budgets pulled from the wall bench's published thresholds (the
// PHASE-1B spec does not pin a roof-specific budget at the S10
// "begin" stage — these are sanity guards, not contractual SLOs).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { produceRoof } from '../../../../packages/geometry-kernel/src/producers/roof.js';
import { getRoofFixture } from '../../../../packages/geometry-kernel/__tests__/__configs__/roof-index.js';
import type { JoinData } from '../../../../packages/geometry-kernel/src/types/JoinData.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = resolve(__dirname, '..', '..', '.run-output');
const REPORTS = resolve(__dirname, '..', '..', 'reports');
mkdirSync(RUN_OUTPUT, { recursive: true });
mkdirSync(REPORTS, { recursive: true });

const NO_JOIN: JoinData = { start: null, end: null };

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

function runScenario(name: string, fixId: string, budgetMs: number): BenchSample {
  const f = getRoofFixture(fixId);
  const t0 = performance.now();
  produceRoof(f.roof, NO_JOIN, f.worldY);
  const cold = performance.now() - t0;

  // Warm-up: 99 more iterations (100 warm total inc. cold).
  const warmTimes: number[] = [];
  for (let i = 0; i < 99; i++) {
    const s = performance.now();
    produceRoof(f.roof, NO_JOIN, f.worldY);
    warmTimes.push(performance.now() - s);
  }
  const warmAvg = warmTimes.reduce((a, b) => a + b, 0) / warmTimes.length;

  // Measured: 1000 samples.
  const samples = new Array<number>(1000);
  for (let i = 0; i < samples.length; i++) {
    const s = performance.now();
    produceRoof(f.roof, NO_JOIN, f.worldY);
    samples[i] = performance.now() - s;
  }
  samples.sort((a, b) => a - b);
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

describe('produce-roof bench', () => {
  const results: BenchSample[] = [];

  it('flat roof p95 < 50 ms', () => {
    const r = runScenario('flat', 'flat-square-no-overhang', 50);
    results.push(r);
    expect(r.p95).toBeLessThan(r.budgetMs);
  });

  it('gable roof p95 < 80 ms', () => {
    const r = runScenario('gable', 'gable-rect-low-pitch', 80);
    results.push(r);
    expect(r.p95).toBeLessThan(r.budgetMs);
  });

  it('mansard roof p95 < 120 ms', () => {
    const r = runScenario('mansard', 'mansard-square-mid-pitch', 120);
    results.push(r);
    expect(r.p95).toBeLessThan(r.budgetMs);
  });

  it('writes baseline report', () => {
    writeFileSync(
      resolve(RUN_OUTPUT, 'produce-roof.json'),
      JSON.stringify({ at: new Date().toISOString(), results }, null, 2),
    );
    const md = [
      '# `produce-roof` bench baseline',
      '',
      `_Captured ${new Date().toISOString()}_`,
      '',
      'Per S10-T7 (`PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S10 Track B):',
      '',
      '- 100-iteration warm-up.',
      '- 1000-iteration measured run.',
      '- Reported: cold (first sample) / warm-avg / p50 / p95 / p99 in ms.',
      '- Sanity budgets (not contractual SLOs at S10 "begin" stage):',
      '  flat < 50 ms, gable < 80 ms, mansard < 120 ms.',
      '',
      '| scenario | cold ms | warm-avg ms | p50 ms | p95 ms | p99 ms | budget ms |',
      '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
      ...results.map((r) =>
        `| \`${r.scenario}\` | ${r.cold.toFixed(3)} | ${r.warmAvg.toFixed(3)} | ${r.p50.toFixed(3)} | ${r.p95.toFixed(3)} | ${r.p99.toFixed(3)} | ${r.budgetMs} |`,
      ),
      '',
      '## Methodology',
      '',
      'Bench source: `apps/bench/src/benches/produce-roof.bench.ts`.',
      'Fixtures source: `packages/geometry-kernel/__tests__/__configs__/roof-index.ts`.',
      'Engine: `produceRoof` (in-process, no worker round-trip).',
      '',
    ].join('\n');
    writeFileSync(resolve(REPORTS, 'produce-roof-baseline.md'), md);
    expect(results).toHaveLength(3);
  });
});
