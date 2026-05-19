// Bench: `produce-wall` — S08-T9.
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S08 line 686-687:
//   "Bench: 100 warm + 1000 measured.  Simple p95 < 50 ms.
//    Layered + openings p95 < 80 ms."
//
// We run three scenarios drawn from the kernel fixture catalog:
//   - simple          — straight-single-no-op
//   - layered         — straight-3layer
//   - layered+holes   — layered-open-window-door
//
// Cold time = first sample.  Warm = next 99.  Measured = 1000.
// Reports p50/p95/p99 + cold for each scenario; writes JSON to
// `apps/bench/.run-output/produce-wall.json` and a markdown
// baseline to `apps/bench/reports/produce-wall-baseline.md`.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { produceWall } from '../../../../packages/geometry-kernel/src/producers/wall.js';
import { getFixture } from '../../../../packages/geometry-kernel/__tests__/__configs__/index.js';

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

function runScenario(name: string, fixId: string, budgetMs: number): BenchSample {
  const f = getFixture(fixId);
  const t0 = performance.now();
  produceWall(f.wall, f.joinData, f.worldY);
  const cold = performance.now() - t0;

  // Warm-up: 99 more iterations (100 warm total inc. cold).
  const warmTimes: number[] = [];
  for (let i = 0; i < 99; i++) {
    const s = performance.now();
    produceWall(f.wall, f.joinData, f.worldY);
    warmTimes.push(performance.now() - s);
  }
  const warmAvg = warmTimes.reduce((a, b) => a + b, 0) / warmTimes.length;

  // Measured: 1000 samples.
  const samples = new Array<number>(1000);
  for (let i = 0; i < samples.length; i++) {
    const s = performance.now();
    produceWall(f.wall, f.joinData, f.worldY);
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

describe('produce-wall bench', () => {
  const results: BenchSample[] = [];

  it('simple wall p95 < 50 ms', () => {
    const r = runScenario('simple', 'straight-single-no-op', 50);
    results.push(r);
    expect(r.p95).toBeLessThan(r.budgetMs);
  });

  it('layered wall p95 < 80 ms', () => {
    const r = runScenario('layered-3layer', 'straight-3layer', 80);
    results.push(r);
    expect(r.p95).toBeLessThan(r.budgetMs);
  });

  it('layered + openings p95 < 80 ms', () => {
    const r = runScenario('layered-openings', 'layered-open-window-door', 80);
    results.push(r);
    expect(r.p95).toBeLessThan(r.budgetMs);
  });

  it('writes baseline report', () => {
    writeFileSync(
      resolve(RUN_OUTPUT, 'produce-wall.json'),
      JSON.stringify({ at: new Date().toISOString(), results }, null, 2),
    );
    const md = [
      '# `produce-wall` bench baseline',
      '',
      `_Captured ${new Date().toISOString()}_`,
      '',
      'Per S08 spec (`PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` line 686-687):',
      '',
      '- 100-iteration warm-up.',
      '- 1000-iteration measured run.',
      '- Reported: cold (first sample) / warm-avg / p50 / p95 / p99 in ms.',
      '- Hard budgets: simple < 50 ms p95; layered+openings < 80 ms p95.',
      '',
      '| scenario | cold ms | warm-avg ms | p50 ms | p95 ms | p99 ms | budget ms |',
      '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
      ...results.map((r) =>
        `| \`${r.scenario}\` | ${r.cold.toFixed(3)} | ${r.warmAvg.toFixed(3)} | ${r.p50.toFixed(3)} | ${r.p95.toFixed(3)} | ${r.p99.toFixed(3)} | ${r.budgetMs} |`,
      ),
      '',
      '## Methodology',
      '',
      'Bench source: `apps/bench/src/benches/produce-wall.bench.ts`.',
      'Fixtures source: `packages/geometry-kernel/__tests__/__configs__/index.ts`.',
      'Engine: `produceWall` (in-process, no worker round-trip).  The',
      'Node-worker variant is gated by',
      '`tests/parity/wall/wall-headless-node.test.ts` for byte equality;',
      'we do not double-bench it here.',
      '',
    ].join('\n');
    writeFileSync(resolve(REPORTS, 'produce-wall-baseline.md'), md);
    expect(results).toHaveLength(3);
  });
});
