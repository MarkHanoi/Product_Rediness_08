// Bench: `produce-window` — S11-T2.
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S11 test catalog:
//   "apps/bench/produce-{door,window,roof}.bench.ts — each p95 < 50 ms"
//
// Three representative window scenarios:
//   - standard    — default 1×1 m fixed window
//   - picture     — 2.4×1.5 m large picture window
//   - grid-3x2    — 1.8×1.2 m window with 3-column × 2-row mullion grid

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  produceWindow,
  type WindowWorldPlacement,
} from '../../../../packages/geometry-kernel/src/index.js';
import { Window, createId } from '@pryzm/schemas';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = resolve(__dirname, '..', '..', '.run-output');
const REPORTS    = resolve(__dirname, '..', '..', 'reports');
mkdirSync(RUN_OUTPUT, { recursive: true });
mkdirSync(REPORTS, { recursive: true });

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

const STD_PLACEMENT: WindowWorldPlacement = {
  axis:          { x: 1, y: 0, z: 0 },
  normal:        { x: 0, y: 0, z: 1 },
  origin:        { x: 0, y: 0, z: 0 },
  wallThickness: 0.1,
};

function runScenario(
  name:      string,
  overrides: Partial<import('@pryzm/schemas').Window>,
  placement: WindowWorldPlacement,
  budgetMs:  number,
): BenchSample {
  const win = Window.parse({
    id: createId('window'),
    wallId: createId('wall'),
    openingId: 'op_bench',
    offset: 0,
    ...overrides,
  });

  const t0 = performance.now();
  produceWindow(win, placement);
  const cold = performance.now() - t0;

  const warmTimes: number[] = [];
  for (let i = 0; i < 99; i++) {
    const s = performance.now();
    produceWindow(win, placement);
    warmTimes.push(performance.now() - s);
  }
  const warmAvg = warmTimes.reduce((a, b) => a + b, 0) / warmTimes.length;

  const samples = new Array<number>(1000);
  for (let i = 0; i < samples.length; i++) {
    const s = performance.now();
    produceWindow(win, placement);
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

describe('bench: produce-window', () => {
  const results: BenchSample[] = [];

  it('standard 1×1 m window p95 < 50 ms', () => {
    const r = runScenario('standard', {}, STD_PLACEMENT, 50);
    results.push(r);
    expect(r.p95).toBeLessThan(r.budgetMs);
  });

  it('picture 2.4×1.5 m window p95 < 50 ms', () => {
    const r = runScenario(
      'picture',
      { width: 2.4, height: 1.5, sillHeight: 0.6, frameWidth: 0.06 },
      STD_PLACEMENT,
      50,
    );
    results.push(r);
    expect(r.p95).toBeLessThan(r.budgetMs);
  });

  it('grid-3x2 mullion window p95 < 50 ms', () => {
    const r = runScenario(
      'grid-3x2',
      { width: 1.8, height: 1.2 },
      {
        ...STD_PLACEMENT,
        grid: { columns: 3, rows: 2, mullionThickness: 0.04 },
      },
      50,
    );
    results.push(r);
    expect(r.p95).toBeLessThan(r.budgetMs);
  });

  it('writes bench report', () => {
    if (results.length === 0) return;
    writeFileSync(
      resolve(RUN_OUTPUT, 'produce-window.json'),
      JSON.stringify({ runs: results }, null, 2) + '\n',
    );
    const md = [
      '# produce-window bench',
      '',
      '| Scenario | cold (ms) | warm-avg (ms) | p50 (ms) | p95 (ms) | p99 (ms) | budget (ms) |',
      '|---|---|---|---|---|---|---|',
      ...results.map(
        (r) =>
          `| ${r.scenario} | ${r.cold.toFixed(2)} | ${r.warmAvg.toFixed(2)} | ${r.p50.toFixed(2)} | ${r.p95.toFixed(2)} | ${r.p99.toFixed(2)} | ${r.budgetMs} |`,
      ),
    ].join('\n');
    writeFileSync(resolve(REPORTS, 'produce-window-baseline.md'), md + '\n');
    expect(results.length).toBeGreaterThan(0);
  });
});
