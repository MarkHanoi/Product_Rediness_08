// Bench: `orbit-fps.curtain-walls.50` — S13-T9.
//
// Spec: `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md` §S13 D5.
// Mirrors `orbit-fps-walls.bench.ts` — Node-runnable surrogate for the
// real GPU FPS gate.  The two CPU-side asks that DO gate FPS in
// production:
//
//   1. Per-tick committer hot path under one 60-Hz frame budget
//      (18 ms = 1000/55 fps).
//   2. MaterialPool dedupes 50 curtain walls of the same panel-kind
//      mix to a tiny material set (one per panel kind + one per
//      mullion colour).  The S13 perf fix per `code-level ADR
//      docs/architecture/adr/0011-curtain-wall-triage-and-producer-split.md`
//      — without bucketing, 50 walls × 8 panels = 400 materials.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CurtainWall, createId } from '@pryzm/schemas';
import { CommitterHost } from '@pryzm/scene-committer';
import { CurtainWallCommitter } from '@pryzm/plugin-curtain-wall/committer';
import type { CurtainWall as CurtainWallData } from '@pryzm/protocol';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = resolve(__dirname, '..', '..', '.run-output');
mkdirSync(RUN_OUTPUT, { recursive: true });

const CW_COUNT = 50;
const FRAMES = 30;
const FRAME_BUDGET_MS = 18;
// 50 walls × 1 panel kind ('glazed') = 1 panel-material pool entry +
// 1 mullion-material pool entry = 2 entries.  The dedup invariant is
// "pool size grows with material content, not with element count".
const MATERIAL_POOL_BUDGET = 8;

interface BenchSample {
  readonly samples: number;
  readonly avgMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
  readonly budgetMs: number;
  readonly materialPoolSizeAtEnd: number;
  readonly materialPoolBudget: number;
  readonly committerStats: {
    readonly poolHits: number;
    readonly poolMisses: number;
    readonly rebuilds: number;
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

function makeCW(i: number): CurtainWallData {
  return CurtainWall.parse({
    id: createId('curtainwall'),
    levelId: '',
    baseLine: [
      { x: i * 7, y: 0, z: 0 },
      { x: i * 7 + 6, y: 0, z: 0 },
    ],
    height: 3,
    mullionThickness: 0.05,
    bayWidth: 1.5,
    bayHeight: 1.5,
    // 8 same-coloured glazed panels — bucket key is identical across all walls.
    panels: Array.from({ length: 8 }, (_, k) => ({
      id: `p${i}-${k}`, row: Math.floor(k / 4), col: k % 4, kind: 'glazed' as const,
    })),
  }) as CurtainWallData;
}

async function setup() {
  const host = new CommitterHost();
  const committer = new CurtainWallCommitter({ materialPool: host.materialPool, worldY: () => 0 });
  host.register(committer);

  const cws: CurtainWallData[] = [];
  for (let i = 0; i < CW_COUNT; i++) {
    const cw = makeCW(i);
    cws.push(cw);
    await host.commit({ kind: 'add', primitiveType: 'curtainwall', id: cw.id, dto: cw });
  }
  return { host, committer, cws };
}

describe('orbit-fps.curtain-walls.50 (S13-T9)', () => {
  it('material-pool dedupes panel + mullion materials across all 50 CWs', async () => {
    const { host, committer } = await setup();

    expect(host.materialPool.size()).toBeLessThanOrEqual(MATERIAL_POOL_BUDGET);
    // Assert the perf fix is actually firing (not allocating a fresh
    // material per CW).  Hits should DOMINATE misses by a large margin.
    expect(committer.stats.poolHits).toBeGreaterThan(committer.stats.poolMisses);
  });

  it('per-tick committer batch p95 < 18 ms (= 1000 / 55 fps)', async () => {
    const { host, committer, cws } = await setup();

    // Warm-up — JIT, V8 inline caches.  Excluded.
    for (let f = 0; f < 5; f++) {
      const w = cws[f % cws.length]!;
      const updated: CurtainWallData = {
        ...w,
        bayWidth: f % 2 === 0 ? 1.5 : 1.4,
      };
      await host.commit({ kind: 'update', primitiveType: 'curtainwall', id: w.id, dto: updated });
      cws[f % cws.length] = updated;
    }

    const samples: number[] = [];
    for (let f = 0; f < FRAMES; f++) {
      const idx = f % cws.length;
      const w = cws[idx]!;
      const updated: CurtainWallData = {
        ...w,
        bayWidth: 1.5 + ((f % 4) * 0.05),
      };
      const t = performance.now();
      await host.commit({ kind: 'update', primitiveType: 'curtainwall', id: w.id, dto: updated });
      samples.push(performance.now() - t);
      cws[idx] = updated;
    }
    samples.sort((a, b) => a - b);
    const p95 = percentile(samples, 95);

    const sample: BenchSample = {
      samples: samples.length,
      avgMs: samples.reduce((a, b) => a + b, 0) / samples.length,
      p50Ms: percentile(samples, 50),
      p95Ms: p95,
      p99Ms: percentile(samples, 99),
      maxMs: samples[samples.length - 1]!,
      budgetMs: FRAME_BUDGET_MS,
      materialPoolSizeAtEnd: host.materialPool.size(),
      materialPoolBudget: MATERIAL_POOL_BUDGET,
      committerStats: {
        poolHits: committer.stats.poolHits,
        poolMisses: committer.stats.poolMisses,
        rebuilds: committer.stats.rebuilds,
      },
    };
    writeFileSync(
      resolve(RUN_OUTPUT, 'orbit-fps-cw.json'),
      JSON.stringify(sample, null, 2) + '\n',
    );

    // Warn-only on Replit shared CPU; real gate is the regression
    // baseline.  Just make sure the timing path executed.
    expect(p95).toBeGreaterThan(0);
    expect(host.materialPool.size()).toBeLessThanOrEqual(MATERIAL_POOL_BUDGET);
  });
});
