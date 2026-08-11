// Bench: `plan-view-redraw` — NFT 5.
//
// ############################################################################
// ##  NFT 5 IS **NOT-YET-MEASURABLE**.  THIS FILE DOES NOT VERIFY C10.      
// ############################################################################
//
// C10 §1 row 5 target: < 100 ms p95
// Environment the contract's quantity actually lives in: browser
//
// WHY IT CANNOT BE MEASURED HERE:
//   The plan view repaints onto a 2D canvas. There is no canvas in Node.
//
// WHAT THIS FILE ACTUALLY MEASURES TODAY:
//   WallStore.applyPatch -> subscribeDirty notification propagation only.
//
// The assertion below is an internal sub-budget tripwire ONLY. It is NOT the
// C10 budget and passing it is NOT evidence the contract is met. The
// authoritative status lives in `@pryzm/perf-budgets` (NFT_TARGETS row
// 5, measurability: 'not-yet-measurable'), and `nftLimit(5)` THROWS by design
// so this file cannot borrow C10's number for a quantity C10 does not name.
//
// W5-1, 2026-08-11. The previous header cited `C10 §1 (this reference was previously to the deleted 01-VISION.md §5)`, a document
// deleted from the repo, with numbers that disagreed with the contract.
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

describe('[NOT-YET-MEASURABLE NFT 5] plan-view-redraw', () => {
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
          'NFT-5 headless proxy per C10 §1 (this reference was previously to the deleted 01-VISION.md §5). Measures WallStore ' +
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
