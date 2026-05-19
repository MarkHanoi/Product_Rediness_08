// Bench: `pdf-to-bim-openings` — S52 §4.2.
//
// Spec source:
//   • `phases/PHASE-3A-Q1-M25-M27-VI-AI-ELEMENT-CREATOR.md` §4.2
//     (lines 1296-1483) + §4 exit criteria lines 1489-1490.
//
// Synthetic page: 5 doors (arcs + panel lines) + 8 windows (parallel
// glazing pairs) along three host walls. Per-call budget: 8 ms p95.
//
// 200 measured samples + 50 warm. Reports p50/p95/p99 + cold per
// scenario. Writes JSON + markdown baseline.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  matchOpeningSymbols,
  type PageDecomposition,
  type VectorElement,
  type WallCandidate,
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
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx]!;
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function measure(scenario: string, fn: () => unknown, budgetMs: number): BenchSample {
  const t0 = nowMs();
  fn();
  const cold = nowMs() - t0;
  for (let i = 0; i < 50; i++) fn();
  const samples: number[] = [];
  for (let i = 0; i < 200; i++) {
    const t = nowMs();
    fn();
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

const SCALE = 10;

function makeArcVector(
  centerPt: [number, number],
  radiusPt: number,
  startAngle: number,
  endAngle: number,
): VectorElement {
  return {
    kind: 'arc',
    points: [
      centerPt,
      [centerPt[0] + radiusPt * Math.cos(startAngle), centerPt[1] + radiusPt * Math.sin(startAngle)],
      [centerPt[0] + radiusPt * Math.cos(endAngle), centerPt[1] + radiusPt * Math.sin(endAngle)],
    ],
  };
}

function buildSyntheticPage(): { page: PageDecomposition; walls: WallCandidate[] } {
  const vectors: VectorElement[] = [];
  // 5 doors along wall 1 (y=1000 mm) — pt center y = 100.
  for (let i = 0; i < 5; i++) {
    const cx = 100 + i * 200;
    vectors.push(makeArcVector([cx, 100], 80, 0, Math.PI / 2));
    vectors.push({ kind: 'line', points: [[cx, 100], [cx + 80, 100]] });
  }
  // 8 windows along wall 2 (y=2000 mm) — pt y between 195 and 205.
  for (let i = 0; i < 8; i++) {
    const x0 = 100 + i * 150;
    vectors.push({ kind: 'line', points: [[x0, 195], [x0 + 100, 195]] });
    vectors.push({ kind: 'line', points: [[x0, 205], [x0 + 100, 205]] });
  }
  const page: PageDecomposition = {
    pageId: 'synth-1',
    pageWidthPt: 1500,
    pageHeightPt: 600,
    vectors,
  };
  const walls: WallCandidate[] = [
    makeWall([[0, 1000], [15000, 1000]], 200),
    makeWall([[0, 2000], [15000, 2000]], 200),
    makeWall([[0, 4000], [15000, 4000]], 200),
  ];
  return { page, walls };
}

function makeWall(
  centerLine: ReadonlyArray<readonly [number, number]>,
  thickness = 200,
  confidence = 0.85,
): WallCandidate {
  return {
    centerLine,
    thickness,
    confidence,
    pairLine1: { p1: [0, 0], p2: [0, 0], angle: 0, length: 0 },
    pairLine2: { p1: [0, 0], p2: [0, 0], angle: 0, length: 0 },
  };
}

describe('Bench — pdf-to-bim-openings (S52 §4.2)', () => {
  it('synthetic 5-door + 8-window page p95 < 8 ms', () => {
    const { page, walls } = buildSyntheticPage();
    const sample = measure('matchOpeningSymbols', () => {
      matchOpeningSymbols(page, walls, SCALE);
    }, 8);
    const summary = {
      sprint: 'S52',
      bench: 'pdf-to-bim-openings',
      scenarios: [sample],
      timestampUtc: new Date().toISOString(),
    };
    writeFileSync(resolve(RUN_OUTPUT, 'pdf-to-bim-openings.bench.json'), JSON.stringify(summary, null, 2));
    writeFileSync(
      resolve(REPORTS, 'pdf-to-bim-openings.md'),
      [
        '# pdf-to-bim-openings bench (S52 §4.2)',
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
