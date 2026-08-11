// Bench: `undo-stack-memory` — NFT 18.
//
// TARGET SOURCE: `@pryzm/perf-budgets` → C10 §1 row 18.  No number is stated
// in this file.
//
// ── W5-1 FIX, 2026-08-11 ────────────────────────────────────────────────────
// This file used `bench()` from vitest.  `bench()` only exists under
// `vitest bench`; the harness runs `vitest run`.  The suite therefore raised
//
//     Error: `bench()` is only available in benchmark mode.
//         at src/benches/undo-stack-memory.bench.ts:18:3
//
// at collection time and NOT ONE LINE of NFT 18's body had ever executed since
// it was added in Wave A16.  Worse, a `bench()` body's throws are recorded as
// benchmark errors rather than test failures, so even under `vitest bench` the
// hand-rolled `throw new Error('NFT 18 FAIL: …')` assertions would not have
// gated a merge.  Converted to `it()` + `expect()`.

import { describe, expect, it } from 'vitest';
import { RingBufferUndoStack } from '@pryzm/runtime-undo-stack';
import { nft, nftLimit } from '@pryzm/perf-budgets';

const NFT = nft(18);
const MEMORY_LIMIT_MB = nftLimit(18); // 50, from C10 §1.

/** C10 §1 names 1000 commands. */
const COMMAND_COUNT = 1_000;
/** The production ring-buffer cap — the mechanism that makes growth bounded. */
const RING_CAP = 200;

describe('undo-stack-memory — NFT 18', () => {
  it(`${COMMAND_COUNT} pushes stay under the C10 §1 budget (${NFT.c10Target})`, () => {
    // Settle the heap before sampling so unrelated module-init allocations do
    // not land inside the delta.
    globalThis.gc?.();
    const baseline = process.memoryUsage().rss;

    const stack = new RingBufferUndoStack({ maxSize: RING_CAP });
    for (let i = 0; i < COMMAND_COUNT; i++) {
      stack.push({
        forward: { ops: [{ path: `/walls/${i}/height`, value: i }] },
        inverse: { ops: [{ path: `/walls/${i}/height`, value: i - 1 }] },
      });
    }

    const deltaMb = (process.memoryUsage().rss - baseline) / 1024 / 1024;

    expect(stack.size, 'ring buffer exceeded its cap').toBeLessThanOrEqual(RING_CAP);
    expect(
      deltaMb,
      `NFT 18 MISS — ${COMMAND_COUNT} pushes cost ${deltaMb.toFixed(1)} MB rss delta ` +
        `(C10 §1 budget: ${MEMORY_LIMIT_MB} MB)`,
    ).toBeLessThan(MEMORY_LIMIT_MB);
  });

  it('ring-buffer cap invariant: size never exceeds maxSize', () => {
    const maxSize = 50;
    const stack = new RingBufferUndoStack({ maxSize });
    for (let i = 0; i < 500; i++) {
      stack.push({
        forward: { ops: [{ path: `/el/${i}`, value: i }] },
        inverse: { ops: [{ path: `/el/${i}`, value: i - 1 }] },
      });
      expect(stack.size, `overflowed at push ${i}`).toBeLessThanOrEqual(maxSize);
    }
  });

  it('undo/redo cursor stays correct under overflow', () => {
    const stack = new RingBufferUndoStack({ maxSize: 10 });
    for (let i = 0; i < 20; i++) {
      stack.push({
        forward: { ops: [{ path: '/x', value: i }] },
        inverse: { ops: [{ path: '/x', value: i - 1 }] },
      });
    }

    expect(stack.size).toBe(10);
    expect(stack.canUndo()).toBe(true);
    expect(stack.canRedo()).toBe(false);

    stack.undo();
    expect(stack.canRedo()).toBe(true);
  });
});
