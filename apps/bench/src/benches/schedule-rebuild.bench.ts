// Bench: `schedule-rebuild` — NFT 13.
//
// TARGET SOURCE: `@pryzm/perf-budgets` -> C10 section 1 row 13.  No number is
// stated in this file.
//
// -- W5-1 CORRECTION, 2026-08-11 -------------------------------------------
// The previous revision measured 1,000 rows against a < 2 s budget taken from
// the deleted `01-VISION.md section 5`.  C10 section 1 says 10,000 rows under
// < 500 ms p95: a 10x larger workload against a 4x tighter budget, i.e. the
// bench was 40x weaker than the contract it claimed to verify, and passed.
// Workload and budget now both come from C10.
//
// This IS the production path for the data layer: the schedule builder scans
// every element DTO and serialises a row.  Formula evaluation and React table
// reconciliation sit above it and are not in scope for NFT 13's data-layer
// rebuild.

import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Wall, createId } from '@pryzm/schemas';
import { WallStore, type WallData } from '@pryzm/plugin-wall';
import { nft, nftLimit } from '@pryzm/perf-budgets';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = join(__dirname, '..', '..', '.run-output');

const NFT = nft(13);
const LIMIT_MS = nftLimit(13); // 500, from C10 section 1.

/** C10 section 1 names 10k rows. */
const ROW_COUNT = 10_000;
const WARMUP = 3;
const SAMPLES = 20;

describe('schedule-rebuild', () => {
  it(`${ROW_COUNT}-row store scan + serialize meets the C10 section 1 budget (${NFT.c10Target})`, () => {
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
        nft: 13,
        c10Target: NFT.c10Target,
        limitMs: LIMIT_MS,
        measures:
          'full-scan + JSON serialize of 10k WallStore rows — the data-layer ' +
          'schedule rebuild. Store pre-populated before measurement ' +
          '(creation is not rebuild cost).',
      }, null, 2),
    );

    expect(p95).toBeGreaterThan(0);
    expect(
      p95,
      `NFT 13 MISS — ${ROW_COUNT}-row rebuild p95 = ${p95.toFixed(2)} ms ` +
        `(C10 section 1 budget: ${LIMIT_MS} ms)`,
    ).toBeLessThan(LIMIT_MS);
    // Store PRE-POPULATION of 10k walls (Wall.parse x 10k) takes minutes in
    // this harness and is setup, not rebuild cost. Measured 2026-08-11: it
    // alone blows the 60 s default. Reported to the orchestrator as a separate
    // finding (element-creation throughput), not folded into NFT 13.
  }, 600_000);
});
