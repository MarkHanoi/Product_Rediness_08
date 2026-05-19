// Bench: `produce-column` — S12-T2.
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S12 test catalog:
//   "apps/bench/produce-{slab,grid,column,beam}.bench.ts — each p95 < 50 ms"
//
// Three representative column scenarios:
//   - rectangular-default  — 0.4×0.4 m × 3 m rectangular column
//   - circular-wide        — 0.5 m diameter × 4 m circular column
//   - i-section-tall       — 0.3×0.6 m I-section × 5 m

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { produceColumn } from '../../../../packages/geometry-kernel/src/index.js';
import { Column, createId } from '@pryzm/schemas';
import type { JoinData } from '../../../../packages/geometry-kernel/src/types/JoinData.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = resolve(__dirname, '..', '..', '.run-output');
const REPORTS    = resolve(__dirname, '..', '..', 'reports');
mkdirSync(RUN_OUTPUT, { recursive: true });
mkdirSync(REPORTS, { recursive: true });

const NO_JOIN: JoinData = { start: null, end: null };

interface BenchSample {
  scenario: string;
  cold:     number;
  warmAvg:  number;
  p50:      number;
  p95:      number;
  p99:      number;
  budgetMs: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

const SCENARIOS: Array<{ name: string; col: ReturnType<typeof Column.parse> }> = [
  {
    name: 'rectangular-default',
    col: Column.parse({
      id: createId('column'),
      levelId: 'level:0',
      origin: { x: 0, y: 0, z: 0 },
      shape: 'rectangular',
      width: 0.4,
      depth: 0.4,
      height: 3,
    }),
  },
  {
    name: 'circular-wide',
    col: Column.parse({
      id: createId('column'),
      levelId: 'level:0',
      origin: { x: 5, y: 0, z: 5 },
      shape: 'circular',
      width: 0.5,
      depth: 0.5,
      height: 4,
    }),
  },
  {
    name: 'i-section-tall',
    col: Column.parse({
      id: createId('column'),
      levelId: 'level:0',
      origin: { x: 10, y: 0, z: 0 },
      shape: 'i-section',
      width: 0.3,
      depth: 0.6,
      height: 5,
    }),
  },
];

function runScenario(name: string, col: ReturnType<typeof Column.parse>, budgetMs: number): BenchSample {
  const t0 = performance.now();
  produceColumn(col, NO_JOIN, 0);
  const cold = performance.now() - t0;

  const warmTimes: number[] = [];
  for (let i = 0; i < 99; i++) {
    const s = performance.now();
    produceColumn(col, NO_JOIN, 0);
    warmTimes.push(performance.now() - s);
  }
  const warmAvg = warmTimes.reduce((a, b) => a + b, 0) / warmTimes.length;

  const samples = new Array<number>(1000);
  for (let i = 0; i < samples.length; i++) {
    const s = performance.now();
    produceColumn(col, NO_JOIN, 0);
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

describe('bench: produce-column', () => {
  const results: BenchSample[] = [];

  for (const { name, col } of SCENARIOS) {
    it(`${name} p95 < 50 ms`, () => {
      const r = runScenario(name, col, 50);
      results.push(r);
      expect(r.p95).toBeLessThan(r.budgetMs);
    });
  }

  it('writes bench report', () => {
    if (results.length === 0) return;
    writeFileSync(
      resolve(RUN_OUTPUT, 'produce-column.json'),
      JSON.stringify({ runs: results }, null, 2) + '\n',
    );
    const md = [
      '# produce-column bench',
      '',
      '| Scenario | cold (ms) | warm-avg (ms) | p50 (ms) | p95 (ms) | p99 (ms) | budget (ms) |',
      '|---|---|---|---|---|---|---|',
      ...results.map(
        (r) =>
          `| ${r.scenario} | ${r.cold.toFixed(2)} | ${r.warmAvg.toFixed(2)} | ${r.p50.toFixed(2)} | ${r.p95.toFixed(2)} | ${r.p99.toFixed(2)} | ${r.budgetMs} |`,
      ),
    ].join('\n');
    writeFileSync(resolve(REPORTS, 'produce-column-baseline.md'), md + '\n');
    expect(results.length).toBeGreaterThan(0);
  });
});
