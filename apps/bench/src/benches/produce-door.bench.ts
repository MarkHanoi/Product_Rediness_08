// Bench: `produce-door` — S11-T1.
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S11 test catalog:
//   "apps/bench/produce-{door,window,roof}.bench.ts — each p95 < 50 ms"
//
// Three representative door scenarios:
//   - standard   — default 0.9×2.1 m interior door
//   - double     — 1.8×2.4 m double door
//   - thick-wall — 0.9×2.1 m in a 0.4 m thick wall (affects frame extrusion)

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  produceDoor,
  type DoorWorldPlacement,
} from '../../../../packages/geometry-kernel/src/index.js';
import { Door, createId } from '@pryzm/schemas';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = resolve(__dirname, '..', '..', '.run-output');
const REPORTS    = resolve(__dirname, '..', '..', 'reports');
mkdirSync(RUN_OUTPUT, { recursive: true });
mkdirSync(REPORTS, { recursive: true });

interface BenchSample {
  scenario:  string;
  cold:      number;
  warmAvg:   number;
  p50:       number;
  p95:       number;
  p99:       number;
  budgetMs:  number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

const STD_PLACEMENT: DoorWorldPlacement = {
  axis:          { x: 1, y: 0, z: 0 },
  normal:        { x: 0, y: 0, z: 1 },
  origin:        { x: 0, y: 0, z: 0 },
  wallThickness: 0.1,
};

function runScenario(
  name:         string,
  overrides:    Partial<import('@pryzm/schemas').Door>,
  placement:    DoorWorldPlacement,
  budgetMs:     number,
): BenchSample {
  const door = Door.parse({
    id: createId('door'),
    wallId: createId('wall'),
    openingId: 'op_bench',
    offset: 0,
    ...overrides,
  });

  // Cold
  const t0 = performance.now();
  produceDoor(door, placement);
  const cold = performance.now() - t0;

  // Warm-up: 99 iterations
  const warmTimes: number[] = [];
  for (let i = 0; i < 99; i++) {
    const s = performance.now();
    produceDoor(door, placement);
    warmTimes.push(performance.now() - s);
  }
  const warmAvg = warmTimes.reduce((a, b) => a + b, 0) / warmTimes.length;

  // Measured: 1 000 samples
  const samples = new Array<number>(1000);
  for (let i = 0; i < samples.length; i++) {
    const s = performance.now();
    produceDoor(door, placement);
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

describe('bench: produce-door', () => {
  const results: BenchSample[] = [];

  it('standard interior door p95 < 50 ms', () => {
    const r = runScenario('standard', {}, STD_PLACEMENT, 50);
    results.push(r);
    expect(r.p95).toBeLessThan(r.budgetMs);
  });

  it('double door p95 < 50 ms', () => {
    const r = runScenario(
      'double',
      { width: 1.8, height: 2.4, doorType: 'double' as never },
      STD_PLACEMENT,
      50,
    );
    results.push(r);
    expect(r.p95).toBeLessThan(r.budgetMs);
  });

  it('thick-wall door p95 < 50 ms', () => {
    const r = runScenario(
      'thick-wall',
      {},
      { ...STD_PLACEMENT, wallThickness: 0.4 },
      50,
    );
    results.push(r);
    expect(r.p95).toBeLessThan(r.budgetMs);
  });

  it('writes bench report', () => {
    if (results.length === 0) return;
    const json = JSON.stringify({ runs: results }, null, 2);
    writeFileSync(resolve(RUN_OUTPUT, 'produce-door.json'), json + '\n');

    const md = [
      '# produce-door bench',
      '',
      '| Scenario | cold (ms) | warm-avg (ms) | p50 (ms) | p95 (ms) | p99 (ms) | budget (ms) |',
      '|---|---|---|---|---|---|---|',
      ...results.map(
        (r) =>
          `| ${r.scenario} | ${r.cold.toFixed(2)} | ${r.warmAvg.toFixed(2)} | ${r.p50.toFixed(2)} | ${r.p95.toFixed(2)} | ${r.p99.toFixed(2)} | ${r.budgetMs} |`,
      ),
    ].join('\n');
    writeFileSync(resolve(REPORTS, 'produce-door-baseline.md'), md + '\n');
    expect(results.length).toBeGreaterThan(0);
  });
});
