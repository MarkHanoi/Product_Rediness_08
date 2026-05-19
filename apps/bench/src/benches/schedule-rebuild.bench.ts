// Bench: `schedule-rebuild` — NFT-13 verifier (headless proxy).
//
// Spec source: `01-VISION.md §5` row 13 — NFT 13: "Schedule rebuild (1k rows)
//   | < 2 s p95 | apps/bench/src/benches/schedule-rebuild.bench.ts".
//
// What this file CAN measure (headless Node):
//   * Store full-scan + JSON serialization for 1 000 schedule rows — the
//     data-layer cost of a schedule rebuild. In production the schedule
//     builder reads all element DTOs from a populated store and serialises
//     each row to the schedule view model. The store is pre-populated once
//     (element creation is NOT part of the rebuild cost).
//
// What this file CANNOT measure (out of scope for headless proxy):
//   * Formula evaluation over all elements (requires formula-library + store).
//   * React table reconciliation for the schedule view.
//   * Virtualized list rendering.
//
// NFT-13 production target: < 2 s p95 (schedule rebuild for 1 000 rows).

import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Wall, createId } from '@pryzm/schemas';
import { WallStore, type WallData } from '@pryzm/plugin-wall';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = join(__dirname, '..', '..', '.run-output');

const ROW_COUNT = 1_000;
const WARMUP = 3;
const SAMPLES = 20;

describe('schedule-rebuild', () => {
  it('1k-row full store scan + serialize is the NFT-13 headless proxy', () => {
    // Pre-populate the store once — this is setup cost, not rebuild cost.
    const store = new WallStore();
    for (let i = 0; i < ROW_COUNT; i++) {
      const id = createId('wall');
      const wall = Wall.parse({ id, levelId: 'lvl_bench' }) as WallData;
      store.applyPatch([{ op: 'add', path: [id], value: wall }]);
    }
    expect(store.getState().size).toBe(ROW_COUNT);

    // Measure: full-scan + serialize each row (the schedule builder pattern).
    const runBatch = (): number => {
      let count = 0;
      for (const [, wall] of store.getState()) {
        void JSON.stringify({ id: wall.id, levelId: wall.levelId, height: wall.height });
        count++;
      }
      return count;
    };

    // Warmup
    for (let i = 0; i < WARMUP; i++) runBatch();

    const samples: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const t0 = performance.now();
      const count = runBatch();
      samples.push(performance.now() - t0);
      expect(count).toBe(ROW_COUNT);
    }

    samples.sort((a, b) => a - b);
    const p = (q: number): number => samples[Math.floor(samples.length * q)] ?? 0;
    const p50 = p(0.50);
    const p95 = p(0.95);

    mkdirSync(RUN_OUTPUT, { recursive: true });
    writeFileSync(
      join(RUN_OUTPUT, 'schedule-rebuild.json'),
      JSON.stringify({
        name: 'schedule-rebuild',
        p50,
        p95,
        samples: samples.length,
        rowCount: ROW_COUNT,
        unit: 'ms',
        nftTarget: 2000,
        notes:
          'NFT-13 headless proxy per 01-VISION.md §5. Measures full-scan + ' +
          'JSON serialize of 1k WallStore rows (data-layer schedule rebuild). ' +
          'Store pre-populated before measurement (creation ≠ rebuild cost). ' +
          'Formula evaluation and React reconciliation are in apps/editor-bench/ ' +
          '(Wave 13 browser harness).',
      }, null, 2),
    );

    expect(p95).toBeGreaterThan(0);
    expect(p95).toBeLessThan(2000);
  });
});
