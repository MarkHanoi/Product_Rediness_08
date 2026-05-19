// Bench: `produce-grid` — S12-T2.
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S12 test catalog:
//   "apps/bench/produce-{slab,grid,column,beam}.bench.ts — each p95 < 50 ms"
//
// Three representative grid scenarios:
//   - 5x4-orthogonal  — 5 vertical + 4 horizontal linear axes
//   - 3x3-with-arcs   — 3 linear + 3 arc grid lines
//   - empty           — grid with no lines (degenerate triangle gate)

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { produceGrid } from '../../../../packages/geometry-kernel/src/index.js';
import { Grid, createId } from '@pryzm/schemas';
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

const SCENARIOS: Array<{ name: string; grid: ReturnType<typeof Grid.parse> }> = [
  {
    name: '5x4-orthogonal',
    grid: Grid.parse({
      id: createId('grid'),
      levelId: 'level:0',
      lines: [
        // 5 vertical
        ...([0, 2.5, 5, 7.5, 10] as number[]).map((x, i) => ({
          id: `v${i}`, label: String.fromCharCode(65 + i),
          kind: 'linear' as const,
          start: { x, y: 0, z: 0 }, end: { x, y: 0, z: 8 },
        })),
        // 4 horizontal
        ...([0, 2, 4, 6] as number[]).map((z, i) => ({
          id: `h${i}`, label: `${i + 1}`,
          kind: 'linear' as const,
          start: { x: 0, y: 0, z }, end: { x: 10, y: 0, z },
        })),
      ],
    }),
  },
  {
    name: '3x3-with-arcs',
    grid: Grid.parse({
      id: createId('grid'),
      levelId: 'level:0',
      lines: [
        { id: 'l1', label: 'A', kind: 'linear' as const, start: { x: 0, y: 0, z: 0 }, end: { x: 6, y: 0, z: 0 } },
        { id: 'l2', label: 'B', kind: 'linear' as const, start: { x: 0, y: 0, z: 3 }, end: { x: 6, y: 0, z: 3 } },
        { id: 'l3', label: 'C', kind: 'linear' as const, start: { x: 0, y: 0, z: 6 }, end: { x: 6, y: 0, z: 6 } },
        { id: 'a1', label: '1', kind: 'arc' as const, start: { x: 0, y: 0, z: 0 }, end: { x: 6, y: 0, z: 0 }, radius: 6 },
        { id: 'a2', label: '2', kind: 'arc' as const, start: { x: 0, y: 0, z: 3 }, end: { x: 6, y: 0, z: 3 }, radius: 4 },
        { id: 'a3', label: '3', kind: 'arc' as const, start: { x: 0, y: 0, z: 6 }, end: { x: 6, y: 0, z: 6 }, radius: 8 },
      ],
    }),
  },
  {
    name: 'empty',
    grid: Grid.parse({ id: createId('grid'), levelId: 'level:0', lines: [] }),
  },
];

function runScenario(name: string, grid: ReturnType<typeof Grid.parse>, budgetMs: number): BenchSample {
  const t0 = performance.now();
  produceGrid(grid, NO_JOIN, 0);
  const cold = performance.now() - t0;

  const warmTimes: number[] = [];
  for (let i = 0; i < 99; i++) {
    const s = performance.now();
    produceGrid(grid, NO_JOIN, 0);
    warmTimes.push(performance.now() - s);
  }
  const warmAvg = warmTimes.reduce((a, b) => a + b, 0) / warmTimes.length;

  const samples = new Array<number>(1000);
  for (let i = 0; i < samples.length; i++) {
    const s = performance.now();
    produceGrid(grid, NO_JOIN, 0);
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

describe('bench: produce-grid', () => {
  const results: BenchSample[] = [];

  for (const { name, grid } of SCENARIOS) {
    it(`${name} p95 < 50 ms`, () => {
      const r = runScenario(name, grid, 50);
      results.push(r);
      expect(r.p95).toBeLessThan(r.budgetMs);
    });
  }

  it('writes bench report', () => {
    if (results.length === 0) return;
    writeFileSync(
      resolve(RUN_OUTPUT, 'produce-grid.json'),
      JSON.stringify({ runs: results }, null, 2) + '\n',
    );
    const md = [
      '# produce-grid bench',
      '',
      '| Scenario | cold (ms) | warm-avg (ms) | p50 (ms) | p95 (ms) | p99 (ms) | budget (ms) |',
      '|---|---|---|---|---|---|---|',
      ...results.map(
        (r) =>
          `| ${r.scenario} | ${r.cold.toFixed(2)} | ${r.warmAvg.toFixed(2)} | ${r.p50.toFixed(2)} | ${r.p95.toFixed(2)} | ${r.p99.toFixed(2)} | ${r.budgetMs} |`,
      ),
    ].join('\n');
    writeFileSync(resolve(REPORTS, 'produce-grid-baseline.md'), md + '\n');
    expect(results.length).toBeGreaterThan(0);
  });
});
