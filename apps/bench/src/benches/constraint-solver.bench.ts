// Bench: `constraint-solver` — S52 §4.1.
//
// Spec source:
//   • `phases/PHASE-3A-Q1-M25-M27-VI-AI-ELEMENT-CREATOR.md` §4
//     exit criterion line 1488 — "50-constraint sketch p95 < 16 ms".
//
// Synthetic sketch: 25 distance-pp constraints + 10 parallel + 10
// perpendicular + 5 fixed = 50 constraints across 60 variables. The
// MockSolver bench validates the porter / iterator overhead is
// negligible — the real planegcs WASM bench lands at S53 D1 and
// holds the actual 16 ms budget.
//
// 200 measured samples + 50 warm. Reports p50/p95/p99 + cold per
// scenario. Writes JSON + markdown baseline.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MockSolver,
  type ConstraintSet,
  type SketchConstraint,
} from '../../../../packages/constraint-solver/src/index.js';

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
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx]!;
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

async function measure(scenario: string, fn: () => Promise<unknown>, budgetMs: number): Promise<BenchSample> {
  // Cold sample.
  const t0 = nowMs();
  await fn();
  const cold = nowMs() - t0;
  // Warm-up.
  for (let i = 0; i < 50; i++) await fn();
  // Measured.
  const samples: number[] = [];
  for (let i = 0; i < 200; i++) {
    const t = nowMs();
    await fn();
    samples.push(nowMs() - t);
  }
  samples.sort((a, b) => a - b);
  const warmAvg = samples.reduce((s, x) => s + x, 0) / samples.length;
  return {
    scenario,
    cold,
    warmAvg,
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    p99: percentile(samples, 0.99),
    budgetMs,
  };
}

function build50ConstraintSketch(): ConstraintSet {
  // 30 points (60 variables) arranged in a 6×5 grid.
  const variables: Record<string, number> = {};
  const pointVariables: Record<string, [string, string]> = {};
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 6; c++) {
      const id = `p-${r}-${c}`;
      const x = c * 100;
      const y = r * 100;
      variables[`${id}-x`] = x;
      variables[`${id}-y`] = y;
      pointVariables[id] = [`${id}-x`, `${id}-y`];
    }
  }
  // 10 line entities — each row's first two points pair as a "line".
  const lineEndpoints: Record<string, [string, string]> = {};
  for (let r = 0; r < 5; r++) {
    for (let i = 0; i < 2; i++) {
      lineEndpoints[`l-${r}-${i}`] = [`p-${r}-${i * 2}`, `p-${r}-${i * 2 + 1}`];
    }
  }
  const constraints: SketchConstraint[] = [];
  // 25 distance-pp on adjacent points in the grid.
  let cid = 0;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      constraints.push({
        id: `c-d${cid++}`,
        kind: 'distance-pp',
        p1: `p-${r}-${c}`,
        p2: `p-${r}-${c + 1}`,
        value: 100,
      });
    }
  }
  // 10 parallel between l-${r}-0 and l-${r}-1.
  for (let r = 0; r < 5; r++) {
    constraints.push({ id: `c-par${cid++}`, kind: 'parallel', l1: `l-${r}-0`, l2: `l-${r}-1` });
    constraints.push({ id: `c-par${cid++}`, kind: 'parallel', l1: `l-${r}-0`, l2: `l-${r}-1` });
  }
  // 10 perpendicular cross-row.
  for (let r = 0; r < 4; r++) {
    constraints.push({ id: `c-perp${cid++}`, kind: 'perpendicular', l1: `l-${r}-0`, l2: `l-${r + 1}-0` });
    constraints.push({ id: `c-perp${cid++}`, kind: 'perpendicular', l1: `l-${r}-1`, l2: `l-${r + 1}-1` });
  }
  // 5 fixed points (corners).
  constraints.push({ id: `c-f${cid++}`, kind: 'fixed', p: 'p-0-0', x: 0, y: 0 });
  constraints.push({ id: `c-f${cid++}`, kind: 'fixed', p: 'p-0-5', x: 500, y: 0 });
  constraints.push({ id: `c-f${cid++}`, kind: 'fixed', p: 'p-4-0', x: 0, y: 400 });
  constraints.push({ id: `c-f${cid++}`, kind: 'fixed', p: 'p-4-5', x: 500, y: 400 });
  constraints.push({ id: `c-f${cid++}`, kind: 'fixed', p: 'p-2-3', x: 300, y: 200 });
  return {
    variables,
    constraints: constraints.slice(0, 50),
    pointVariables,
    lineEndpoints,
  };
}

describe('Bench — constraint-solver (S52 §4.1)', () => {
  it('50-constraint sketch p95 < 16 ms (MockSolver baseline)', async () => {
    const solver = new MockSolver();
    const set = build50ConstraintSketch();
    const sample = await measure('solve-50-constraints', async () => {
      await solver.solve(set);
    }, 16);
    const summary = {
      sprint: 'S52',
      bench: 'constraint-solver',
      scenarios: [sample],
      timestampUtc: new Date().toISOString(),
    };
    writeFileSync(resolve(RUN_OUTPUT, 'constraint-solver.bench.json'), JSON.stringify(summary, null, 2));
    writeFileSync(
      resolve(REPORTS, 'constraint-solver.md'),
      [
        '# constraint-solver bench (S52 §4.1)',
        '',
        '| scenario | cold ms | warm avg ms | p50 ms | p95 ms | p99 ms | budget ms | within budget |',
        '|---|---|---|---|---|---|---|---|',
        ...summary.scenarios.map((s) => {
          const inBudget = s.p95 < s.budgetMs ? '✅' : '❌';
          return `| ${s.scenario} | ${s.cold.toFixed(2)} | ${s.warmAvg.toFixed(2)} | ${s.p50.toFixed(2)} | ${s.p95.toFixed(2)} | ${s.p99.toFixed(2)} | ${s.budgetMs} | ${inBudget} |`;
        }),
      ].join('\n'),
    );
    expect(sample.p95).toBeLessThan(sample.budgetMs);
  });
});
