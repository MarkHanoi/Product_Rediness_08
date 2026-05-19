// Bench: `plan-view-redraw` — NFT-5 verifier (headless proxy).
//
// Spec source: `01-VISION.md §5` row 5 — NFT 5: "Plan-view re-render after edit
//   | < 100 ms p95 | apps/bench/src/benches/plan-view-redraw.bench.ts".
//
// What this file CAN measure (headless Node):
//   * Store mutation → subscribeDirty notification propagation latency.
//     The plan-view redraws when the element store emits a dirty diff;
//     this bench measures the applyPatch + subscribeDirty callback chain
//     from `WallStore.applyPatch()` through to all registered listeners.
//   * This is the dominant cost for small edits (1–10 elements) where
//     the store notification is the critical path, not the canvas draw.
//
// What this file CANNOT measure (out of scope for headless proxy):
//   * Canvas 2D drawing time (requires DOM / OffscreenCanvas).
//   * Hidden-line removal computation for large scenes.
//
// NFT-5 production target: < 100 ms p95 (edit → plan-view repaint).

import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Wall, createId } from '@pryzm/schemas';
import { WallStore, type WallData } from '@pryzm/plugin-wall';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = join(__dirname, '..', '..', '.run-output');

const SAMPLES = 500;
const WARMUP = 50;

describe('plan-view-redraw', () => {
  it('WallStore applyPatch → subscribeDirty notification is the NFT-5 headless proxy', () => {
    const store = new WallStore();

    // Seed a wall for edits.
    const wallId = createId('wall');
    const seedWall = Wall.parse({ id: wallId, levelId: 'lvl_bench' }) as WallData;
    store.applyPatch([{ op: 'add', path: [wallId], value: seedWall }]);

    // Register a subscribeDirty listener simulating the plan-view signal.
    let notifyCount = 0;
    const dispose = store.subscribeDirty(() => { notifyCount++; });

    // Warmup
    for (let i = 0; i < WARMUP; i++) {
      store.applyPatch([{
        op: 'replace',
        path: [wallId, 'height'],
        value: 2.5 + (i % 10) * 0.1,
      }]);
    }

    const samples: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const t0 = performance.now();
      store.applyPatch([{
        op: 'replace',
        path: [wallId, 'height'],
        value: 2.5 + (i % 10) * 0.1,
      }]);
      samples.push(performance.now() - t0);
    }

    dispose();

    samples.sort((a, b) => a - b);
    const p = (q: number): number => samples[Math.floor(samples.length * q)] ?? 0;
    const p50 = p(0.50);
    const p95 = p(0.95);

    mkdirSync(RUN_OUTPUT, { recursive: true });
    writeFileSync(
      join(RUN_OUTPUT, 'plan-view-redraw.json'),
      JSON.stringify({
        name: 'plan-view-redraw',
        p50,
        p95,
        samples: samples.length,
        unit: 'ms',
        nftTarget: 100,
        notes:
          'NFT-5 headless proxy per 01-VISION.md §5. Measures WallStore ' +
          'applyPatch() → subscribeDirty() notification latency (store ' +
          'pipeline only). Full plan-view redraw including canvas 2D ' +
          'drawing is in apps/editor-bench/ (Wave 13 browser harness).',
      }, null, 2),
    );

    // Store notification must be well under the 100 ms plan-view budget.
    expect(p95).toBeGreaterThan(0);
    expect(notifyCount).toBeGreaterThan(0);
    expect(p95).toBeLessThan(100);
  });
});
