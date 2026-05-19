// Bench: `orbit-fps.walls.100` — S09-T9 / S09-T10.
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S09-T9 (line 733):
//   "Bench `orbit-fps` re-run with 100 walls — target > 55 fps p95."
// And §S09-T10 (line 734) — the tune step:
//   "If 100-wall fps fails, profile + tune.  Likely culprits:
//    `MaterialPool` not reusing across walls (each wall gets its own
//    material instance), or scene-committer batching not coalescing
//    per-tick updates."
//
// Why a Node-runnable surrogate, not a real GPU FPS measurement:
// `apps/bench/**` runs in headless Node — no GL context, no real
// frame paint.  The on-the-paper FPS gate (>55 p95) decomposes into
// two CPU-side asks that DO gate FPS in production:
//
//   1.  The committer's per-tick HOT PATH must finish under one
//       60-Hz frame budget.  We pick 18 ms (matching the >55 fps
//       target — `1000 / 55 = 18.18 ms`) as the hard-fail.
//   2.  The MaterialPool must DEDUPE 100 walls of the same colour
//       to a single material instance — `MaterialPool.size() === 1`.
//       This is the dedupe gate called out in S09-T10 row 1.
//
// Pipeline measured (one sample = one full frame's committer batch):
//
//   load 100 walls (cold add — not measured, baked into setup)
//     → simulate orbit: nudge ONE wall's colour (material-only path)
//       OR ONE wall's baseLine (geometry-rebuild path)
//     → host.commit(update)        ← MEASURED
//     → assert WallCommitter.stats() shows the right path was taken
//     → assert MaterialPool dedupes at the end
//
// Two measurements per frame run (50 frames × 2 = 100 samples):
//   - "frame.material-only"  : all 100 walls share a material; 1 wall
//                              rebinds to a new colour each tick.
//                              Hard-fail: p95 < 18 ms.
//   - "frame.geometry-only"  : 1 wall's baseLine moves each tick.
//                              Hard-fail: p95 < 18 ms.
//
// THREE-only test — `apps/bench/**` is allowlisted.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Wall, createId } from '@pryzm/schemas';
import { CommitterHost } from '@pryzm/scene-committer';
import { WallCommitter } from '@pryzm/plugin-wall';
import type { WallData } from '@pryzm/plugin-wall/store';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = resolve(__dirname, '..', '..', '.run-output');
mkdirSync(RUN_OUTPUT, { recursive: true });

const WALL_COUNT = 100;
const FRAMES = 50;
const FRAME_BUDGET_MS = 18;            // 1000 / 55 fps
const MATERIAL_DEDUPE_TARGET = 1;      // 100 same-colour walls → 1 mat

interface BenchSample {
  readonly path: 'material-only' | 'geometry-only';
  readonly samples: number;
  readonly avgMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
  readonly budgetMs: number;
  readonly materialPoolSizeAtEnd: number;
  readonly geometryRebuildsAtEnd: number;
  readonly materialRebindsAtEnd: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

function makeWall(i: number, colour: string): WallData {
  return Wall.parse({
    id: createId('wall'),
    levelId: '',
    baseLine: [
      { x: i * 1.0, y: 0, z: 0 },
      { x: i * 1.0 + 4, y: 0, z: 0 },
    ],
    height: 2.7,
    thickness: 0.2,
    materialColor: colour,
  }) as WallData;
}

async function setup(): Promise<{
  host: CommitterHost;
  committer: WallCommitter;
  walls: WallData[];
}> {
  const host = new CommitterHost();
  const committer = new WallCommitter(host.materialPool);
  host.register(committer);

  const walls: WallData[] = [];
  // 100 walls, ALL the same colour — the MaterialPool dedupe gate
  // (S09-T10 row 1) demands this collapses to one material instance.
  for (let i = 0; i < WALL_COUNT; i++) {
    const w = makeWall(i, '#d4c5b0');
    walls.push(w);
    await host.commit({ kind: 'add', primitiveType: 'wall', id: w.id, dto: w });
  }
  return { host, committer, walls };
}

describe('orbit-fps.walls.100 (S09-T9)', () => {
  it('material-only frame: 1-wall rebind per tick — p95 < 18 ms (=1000/55fps)', async () => {
    const { host, committer, walls } = await setup();

    // Warm-up — JIT, V8 inline caches.  Excluded from samples.
    for (let f = 0; f < 5; f++) {
      const w = walls[f % walls.length]!;
      const updated: WallData = { ...w, materialColor: f % 2 === 0 ? '#aabbcc' : '#d4c5b0' };
      await host.commit({ kind: 'update', primitiveType: 'wall', id: w.id, dto: updated });
      walls[f % walls.length] = updated;
    }
    const baselineRebuilds = committer.stats().geometryRebuilds;
    const baselineRebinds = committer.stats().materialRebinds;

    const samples: number[] = [];
    for (let f = 0; f < FRAMES; f++) {
      const idx = f % walls.length;
      const w = walls[idx]!;
      // Alternating colour so MaterialPool either grows by 1 or the
      // dedupe re-uses the cached entry.  Either way: zero geometry rebuilds.
      const updated: WallData = {
        ...w,
        materialColor: f % 3 === 0 ? '#aabbcc' : f % 3 === 1 ? '#d4c5b0' : '#112233',
      };
      const t = performance.now();
      await host.commit({ kind: 'update', primitiveType: 'wall', id: w.id, dto: updated });
      samples.push(performance.now() - t);
      walls[idx] = updated;
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const finalStats = committer.stats();

    const sample: BenchSample = {
      path: 'material-only',
      samples: samples.length,
      avgMs: samples.reduce((a, b) => a + b, 0) / samples.length,
      p50Ms: percentile(sorted, 50),
      p95Ms: percentile(sorted, 95),
      p99Ms: percentile(sorted, 99),
      maxMs: sorted[sorted.length - 1]!,
      budgetMs: FRAME_BUDGET_MS,
      materialPoolSizeAtEnd: host.materialPool.size(),
      geometryRebuildsAtEnd: finalStats.geometryRebuilds,
      materialRebindsAtEnd: finalStats.materialRebinds,
    };
    writeFileSync(
      resolve(RUN_OUTPUT, 'orbit-fps-walls-material.json'),
      JSON.stringify(sample, null, 2),
    );

    // Hard-fail: per-frame p95 budget.
    expect(sample.p95Ms).toBeLessThan(FRAME_BUDGET_MS);
    // Material-only path → ZERO geometry rebuilds across all FRAMES samples.
    expect(finalStats.geometryRebuilds).toBe(baselineRebuilds);
    // Material rebinds DID happen (this proves we exercised the path).
    expect(finalStats.materialRebinds).toBeGreaterThan(baselineRebinds);

    host.dispose();
  });

  it('geometry-only frame: 1-wall baseLine move per tick — p95 < 18 ms', async () => {
    const { host, committer, walls } = await setup();

    for (let f = 0; f < 5; f++) {
      const idx = f % walls.length;
      const w = walls[idx]!;
      const updated: WallData = {
        ...w,
        baseLine: [
          { ...w.baseLine[0], x: w.baseLine[0]!.x + 0.01 * (f + 1) },
          w.baseLine[1]!,
        ],
      };
      await host.commit({ kind: 'update', primitiveType: 'wall', id: w.id, dto: updated });
      walls[idx] = updated;
    }
    const baselineRebuilds = committer.stats().geometryRebuilds;

    const samples: number[] = [];
    for (let f = 0; f < FRAMES; f++) {
      const idx = f % walls.length;
      const w = walls[idx]!;
      const updated: WallData = {
        ...w,
        baseLine: [
          { ...w.baseLine[0], x: w.baseLine[0]!.x + 0.01 * (f + 1) },
          w.baseLine[1]!,
        ],
      };
      const t = performance.now();
      await host.commit({ kind: 'update', primitiveType: 'wall', id: w.id, dto: updated });
      samples.push(performance.now() - t);
      walls[idx] = updated;
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const finalStats = committer.stats();

    const sample: BenchSample = {
      path: 'geometry-only',
      samples: samples.length,
      avgMs: samples.reduce((a, b) => a + b, 0) / samples.length,
      p50Ms: percentile(sorted, 50),
      p95Ms: percentile(sorted, 95),
      p99Ms: percentile(sorted, 99),
      maxMs: sorted[sorted.length - 1]!,
      budgetMs: FRAME_BUDGET_MS,
      materialPoolSizeAtEnd: host.materialPool.size(),
      geometryRebuildsAtEnd: finalStats.geometryRebuilds,
      materialRebindsAtEnd: finalStats.materialRebinds,
    };
    writeFileSync(
      resolve(RUN_OUTPUT, 'orbit-fps-walls-geometry.json'),
      JSON.stringify(sample, null, 2),
    );

    expect(sample.p95Ms).toBeLessThan(FRAME_BUDGET_MS);
    expect(finalStats.geometryRebuilds).toBeGreaterThan(baselineRebuilds);

    host.dispose();
  });

  it('MaterialPool dedupes 100 walls of the same colour into a single material', async () => {
    // Spec gate (S09 exit criterion):
    //   "MaterialPool deduplicates materials across 100 walls of same
    //    system type to 1 material instance."
    const { host } = await setup();
    expect(host.materialPool.size()).toBe(MATERIAL_DEDUPE_TARGET);
    host.dispose();
  });
});
