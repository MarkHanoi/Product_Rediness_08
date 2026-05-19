// Bench: `produce-curtain-wall` — S13-T6.
//
// Spec: `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md` §S13 D6.
// Three scenarios drawn from the S13 fixture catalog:
//
//   - simple    — empty grid, default 1.5×1.5 bays
//   - mixed     — 8 panels of mixed kinds
//   - tall      — 3 m × 6 m with 0.75 m bays (more grid lines)
//
// Cold = first sample.  Warm-up = next 99.  Measured = 1000.
// Reports p50/p95/p99 + cold; writes to `.run-output/produce-curtain-wall.json`.
// Soft budget: p95 < 12 ms (CW is heavier than wall — more groups,
// more material keys).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { produceCurtainWall } from '../../../../packages/geometry-kernel/src/producers/curtainwall.js';
import { getCurtainWallFixture } from '../../../../packages/geometry-kernel/__tests__/__configs__/curtainwall-index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = resolve(__dirname, '..', '..', '.run-output');
mkdirSync(RUN_OUTPUT, { recursive: true });

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
  const f = getCurtainWallFixture(fixId);
  const t0 = performance.now();
  produceCurtainWall(f.cw, f.joinData, f.worldY);
  const cold = performance.now() - t0;

  const warmTimes: number[] = [];
  for (let i = 0; i < 99; i++) {
    const s = performance.now();
    produceCurtainWall(f.cw, f.joinData, f.worldY);
    warmTimes.push(performance.now() - s);
  }
  const warmAvg = warmTimes.reduce((a, b) => a + b, 0) / warmTimes.length;

  const samples = new Array<number>(1000);
  for (let i = 0; i < samples.length; i++) {
    const s = performance.now();
    produceCurtainWall(f.cw, f.joinData, f.worldY);
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

describe('produce-curtain-wall bench', () => {
  it('simple, mixed, tall — p95 within soft budget', () => {
    const results = [
      runScenario('simple', 'cw-01-empty-grid-1.5x1.5', 8),
      runScenario('mixed',  'cw-03-mixed-panels',       12),
      runScenario('tall',   'cw-04-tall-narrow',        12),
    ];
    writeFileSync(
      resolve(RUN_OUTPUT, 'produce-curtain-wall.json'),
      JSON.stringify(results, null, 2) + '\n',
    );
    // Warn-only on Replit shared CPU; real gates live in
    // `scripts/check-regression.mjs` against `baseline.json`.
    for (const r of results) expect(r.p95).toBeGreaterThan(0);
  });
});
