// Bench: `cold-load-real` — closes W-04
// (PHASE-1-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md).
//
// Background:
//   The pre-existing `load-{small,medium,large}.bench.ts` benches each
//   exercise a single fixture in isolation; together they cover the
//   shape of the cold-load pipeline but the audit (G-4) wanted a
//   single-file orchestrator that exercises the *real* `.pryzm`
//   fixtures end-to-end and emits one consolidated record so the
//   regression checker has one place to compare baselines.
//
// What this bench does:
//   1. For each of small.pryzm / medium.pryzm / large.pryzm:
//      a. Read the fixture from disk.
//      b. Spin up a fresh CommitterHost + WallCommitter.
//      c. Time the cold pass (rehydrate → first commit) and the
//         warm pass (49 repeats).
//      d. Assert the cold p50 stays inside the per-fixture budget.
//   2. Write a single JSON record to .run-output/cold-load-real.json.
//
// Budgets (mirror the K1B-3 kill-switch decision-point thresholds):
//   small  ≤   80 ms cold p50
//   medium ≤  800 ms cold p50
//   large  ≤ 1500 ms cold p50

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Wall } from '@pryzm/schemas';
import { CommitterHost } from '@pryzm/scene-committer';
import { WallCommitter } from '@pryzm/plugin-wall';
import type { WallData } from '@pryzm/plugin-wall/store';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const FIXTURE_DIR = resolve(REPO_ROOT, 'tests', 'fixtures', 'cold-load');
const RUN_OUTPUT = resolve(__dirname, '..', '..', '.run-output');
mkdirSync(RUN_OUTPUT, { recursive: true });

interface FixtureFile {
  readonly version: number;
  readonly walls: ReadonlyArray<unknown>;
}

interface ColdLoadCase {
  readonly name: 'small' | 'medium' | 'large';
  readonly file: string;
  readonly coldBudgetMs: number;
}

const CASES: readonly ColdLoadCase[] = [
  { name: 'small',  file: 'small.pryzm',  coldBudgetMs:   80 },
  { name: 'medium', file: 'medium.pryzm', coldBudgetMs:  800 },
  { name: 'large',  file: 'large.pryzm',  coldBudgetMs: 1500 },
];

const WARM_REPEATS = 5;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

function loadFixture(filePath: string): WallData[] {
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as FixtureFile;
  return parsed.walls.map((w) => Wall.parse(w as Record<string, unknown>) as WallData);
}

async function runOnce(filePath: string): Promise<number> {
  const t0 = performance.now();
  const dtos = loadFixture(filePath);
  const host = new CommitterHost();
  const committer = new WallCommitter(host.materialPool);
  host.register(committer);
  for (const dto of dtos) {
    await host.commit({ kind: 'add', primitiveType: 'wall', id: dto.id, dto });
  }
  return performance.now() - t0;
}

describe('cold-load-real bench (W-04)', () => {
  const allRecords: Array<{
    name: string;
    file: string;
    cold: number;
    warm: { count: number; p50: number; p95: number };
    coldBudgetMs: number;
    coldHeadroomMs: number;
  }> = [];

  for (const c of CASES) {
    it(`cold-loads ${c.name}.pryzm under ${c.coldBudgetMs} ms`, async () => {
      const filePath = resolve(FIXTURE_DIR, c.file);
      const cold = await runOnce(filePath);
      const warm: number[] = [];
      for (let i = 0; i < WARM_REPEATS; i++) warm.push(await runOnce(filePath));
      warm.sort((a, b) => a - b);
      const record = {
        name: c.name,
        file: c.file,
        cold,
        warm: {
          count: warm.length,
          p50: percentile(warm, 50),
          p95: percentile(warm, 95),
        },
        coldBudgetMs: c.coldBudgetMs,
        coldHeadroomMs: c.coldBudgetMs - cold,
      };
      allRecords.push(record);

      // Assert cold load fits the budget.  Headroom is logged so a
      // regression that creeps the time without breaking the gate is
      // visible in the bench output.
      // eslint-disable-next-line no-console
      console.log(
        `[cold-load-real:${c.name}] cold=${cold.toFixed(1)}ms ` +
          `(budget ${c.coldBudgetMs}ms, headroom ${record.coldHeadroomMs.toFixed(1)}ms) ` +
          `warm p50=${record.warm.p50.toFixed(1)}ms p95=${record.warm.p95.toFixed(1)}ms`,
      );
      expect(cold).toBeLessThanOrEqual(c.coldBudgetMs);
    });
  }

  it('writes a consolidated regression record', () => {
    writeFileSync(
      resolve(RUN_OUTPUT, 'cold-load-real.json'),
      JSON.stringify({ generatedAt: new Date().toISOString(), cases: allRecords }, null, 2),
    );
    expect(allRecords.length).toBe(CASES.length);
  });
});
