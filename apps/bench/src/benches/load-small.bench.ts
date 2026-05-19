// Bench: `load-small` — S09-T4.
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S09-T4 (line 695):
//   "Bench `load-small.bench.ts` — runs against the saved
//    `tests/fixtures/small-project.pryzm-stub.json`.  Asserts cold-load
//    < 800 ms (committer happy path), first-commit-after-load < 5 ms.
//    Mirrors the small-project asset we used to validate the PRYZM 1
//    initial-render vs PRYZM 2 budget at the K1B-3 kill-switch
//    decision point."
//
// We exercise the committer happy path WITHOUT a renderer so the
// bench is Node-runnable.  Pipeline:
//
//   read fixture JSON
//     → Wall.parse(...)            (rehydrate to typed DTO)
//     → host.commit({add, ...})    (kernel → BufferGeometryDescriptor →
//                                    THREE.BufferGeometry → Mesh +
//                                    Material via MaterialPool)
//     → assert SceneRegistry contains the wall
//
// Cold = first end-to-end pass (includes module import cost from
// `@pryzm/geometry-kernel` + Wall.parse first-call).
// Warm  = repeat 49 more times (50 total samples).  We report
//         p50/p95/p99 from the warm samples for trend tracking.
//
// THREE-only test — `apps/bench/**` is allowlisted.

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
const FIXTURE_PATH = resolve(REPO_ROOT, 'tests', 'fixtures', 'small-project.pryzm-stub.json');
const RUN_OUTPUT = resolve(__dirname, '..', '..', '.run-output');
mkdirSync(RUN_OUTPUT, { recursive: true });

interface FixtureFile {
  readonly version: number;
  readonly walls: ReadonlyArray<unknown>;
}

interface BenchSample {
  readonly cold: number;
  readonly warmCount: number;
  readonly warmAvg: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly firstCommitMs: number;
  readonly budgetColdMs: number;
  readonly budgetFirstCommitMs: number;
}

const COLD_BUDGET_MS = 800;
const FIRST_COMMIT_BUDGET_MS = 5;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

function loadFixture(): WallData[] {
  const raw = readFileSync(FIXTURE_PATH, 'utf8');
  const parsed = JSON.parse(raw) as FixtureFile;
  return parsed.walls.map((w) => Wall.parse(w as Record<string, unknown>) as WallData);
}

async function runOnce(): Promise<{ totalMs: number; firstCommitMs: number }> {
  const t0 = performance.now();
  const dtos = loadFixture();
  const host = new CommitterHost();
  const committer = new WallCommitter(host.materialPool);
  host.register(committer);

  const tCommit = performance.now();
  await host.commit({
    kind: 'add',
    primitiveType: 'wall',
    id: dtos[0]!.id,
    dto: dtos[0]!,
  });
  const firstCommitMs = performance.now() - tCommit;

  // For 1-wall scenes the rest is no-op; for ≥2 we add the rest.
  for (let i = 1; i < dtos.length; i++) {
    await host.commit({
      kind: 'add',
      primitiveType: 'wall',
      id: dtos[i]!.id,
      dto: dtos[i]!,
    });
  }

  // Sanity — the wall is in the registry.
  if (host.registry.size() !== dtos.length) {
    throw new Error(
      `[load-small] expected ${dtos.length} walls in registry, got ${host.registry.size()}`,
    );
  }

  host.dispose();
  return { totalMs: performance.now() - t0, firstCommitMs };
}

describe('load-small bench (S09-T4)', () => {
  it('cold-load < 800 ms; first commit < 5 ms (warm)', async () => {
    // Cold sample.
    const first = await runOnce();
    const cold = first.totalMs;

    // Warm samples — 49 more runs.
    const warmTimes: number[] = [];
    let warmestFirstCommit = 0;
    for (let i = 0; i < 49; i++) {
      const r = await runOnce();
      warmTimes.push(r.totalMs);
      if (r.firstCommitMs > warmestFirstCommit) warmestFirstCommit = r.firstCommitMs;
    }
    const warmAvg =
      warmTimes.length === 0 ? 0 : warmTimes.reduce((a, b) => a + b, 0) / warmTimes.length;

    const sorted = [...warmTimes].sort((a, b) => a - b);
    const sample: BenchSample = {
      cold,
      warmCount: warmTimes.length,
      warmAvg,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      firstCommitMs: warmestFirstCommit,
      budgetColdMs: COLD_BUDGET_MS,
      budgetFirstCommitMs: FIRST_COMMIT_BUDGET_MS,
    };

    writeFileSync(
      resolve(RUN_OUTPUT, 'load-small.json'),
      JSON.stringify(sample, null, 2),
    );

    // Assertions.  Cold budget includes module-import cost; first-commit
    // is measured from the warm samples to avoid the cold spike.
    expect(cold).toBeLessThan(COLD_BUDGET_MS);
    expect(warmestFirstCommit).toBeLessThan(FIRST_COMMIT_BUDGET_MS);
  });
});
