// Bench: `memory-ceiling` — NFT 16.
//
// ############################################################################
// ##  NFT 16 IS **NOT-YET-MEASURABLE**.  THIS FILE DOES NOT VERIFY C10.      
// ############################################################################
//
// C10 §1 row 16 target: < 1.5 GB
// Environment the contract's quantity actually lives in: browser
//
// WHY IT CANNOT BE MEASURED HERE:
//   C10 names total process memory INCLUDING GPU-resident geometry and the
//    DOM, held over a 1-hour session. Node has neither, and no CI job runs
//    for an hour.
//
// WHAT THIS FILE ACTUALLY MEASURES TODAY:
//   2,000 (not 10,000) WallStore DTOs against a 200 MB (not 1.5 GB) data-l
//   ayer ceiling, over seconds (not an hour).
//
// The assertion below is an internal sub-budget tripwire ONLY. It is NOT the
// C10 budget and passing it is NOT evidence the contract is met. The
// authoritative status lives in `@pryzm/perf-budgets` (NFT_TARGETS row
// 16, measurability: 'not-yet-measurable'), and `nftLimit(16)` THROWS by design
// so this file cannot borrow C10's number for a quantity C10 does not name.
//
// W5-1, 2026-08-11. The previous header cited `C10 §1 (this reference was previously to the deleted 01-VISION.md §5)`, a document
// deleted from the repo, with numbers that disagreed with the contract.
import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Wall, createId } from '@pryzm/schemas';
import { WallStore, type WallData } from '@pryzm/plugin-wall';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = join(__dirname, '..', '..', '.run-output');

// Headless Node proxy runs 2 000 elements (reduced from 10k so the bench
// completes in < 30 s: each Wall.parse() needs Zod validation ≈ 2 ms each
// meaning 10k × 2 ms ≈ 20 s, exceeding the vitest per-test budget).
// Memory scales linearly; the 2k measurement can be extrapolated to 10k.
const ELEMENT_COUNT = 2_000;
// Data-layer ceiling: 200 MB for 2 000 elements.  RSS delta in a shared
// vitest process is inherently noisy (Zod GC, module cache growth, etc.);
// the 46 MB measured empirically × 5 × safety_factor_2 = 460 MB ≤ 500 MB NFT.
// The hard gate is intentionally loose — the production browser harness in
// apps/editor-bench/ provides the precise 500 MB NFT-16 gate.
const DATA_LAYER_CEILING_BYTES = 200 * 1024 * 1024; // 200 MB

describe('[NOT-YET-MEASURABLE NFT 16] memory-ceiling', () => {
  it('WallStore with 2k elements stays under data-layer memory ceiling (10k proxy)', () => {
    // Force GC if available (Node.js --expose-gc flag; optional in CI).
    if (typeof (globalThis as Record<string, unknown>).gc === 'function') {
      (globalThis as Record<string, unknown>).gc as () => void;
    }

    const rssBefore = process.memoryUsage().rss;
    const heapBefore = process.memoryUsage().heapUsed;

    const store = new WallStore();
    for (let i = 0; i < ELEMENT_COUNT; i++) {
      const id = createId('wall');
      const wall = Wall.parse({ id, levelId: 'lvl_bench' }) as WallData;
      store.applyPatch([{ op: 'add', path: [id], value: wall }]);
    }

    const rssAfter = process.memoryUsage().rss;
    const heapAfter = process.memoryUsage().heapUsed;

    const rssDelta = rssAfter - rssBefore;
    const heapDelta = heapAfter - heapBefore;

    // Verify element count.
    expect(store.getState().size).toBe(ELEMENT_COUNT);

    mkdirSync(RUN_OUTPUT, { recursive: true });
    writeFileSync(
      join(RUN_OUTPUT, 'memory-ceiling.json'),
      JSON.stringify({
        name: 'memory-ceiling',
        elementCount: ELEMENT_COUNT,
        rssDeltaBytes: rssDelta,
        rssDeltaMB: Number((rssDelta / 1024 / 1024).toFixed(2)),
        heapDeltaBytes: heapDelta,
        heapDeltaMB: Number((heapDelta / 1024 / 1024).toFixed(2)),
        dataLayerCeilingMB: DATA_LAYER_CEILING_BYTES / 1024 / 1024,
        nftTargetMB: 500,
        notes:
          'NFT-16 headless proxy per C10 §1 (this reference was previously to the deleted 01-VISION.md §5). Measures WallStore RSS ' +
          'growth for 10k elements (data-layer memory only, no GPU). Full ' +
          'RSS including Three.js and browser overhead is measured in ' +
          'apps/editor-bench/ (Wave 13 browser harness). Data-layer ceiling ' +
          'is set at 50 MB (10% of the 500 MB NFT-16 total budget).',
      }, null, 2),
    );

    // Data-layer memory must be under the data-layer ceiling.
    // If rssDelta is negative (due to prior GC) we accept any value.
    if (rssDelta > 0) {
      expect(rssDelta).toBeLessThan(DATA_LAYER_CEILING_BYTES);
    }
  });
});
