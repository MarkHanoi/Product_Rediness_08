// NFT 18 — Undo stack memory ceiling.
//
// CONTRACT (C10 §1 NFT 18, Wave A16 A16-T10):
//   "Undo stack memory (4h session, 1000 commands) < 50 MB rss delta."
//
// RingBufferUndoStack enforces a 200-command cap, so 1000 pushes should
// stabilise at ~200 entries — memory growth is bounded, not linear.
//
// Run: pnpm --filter '@pryzm/bench' run bench -- --reporter=verbose 2>&1 | grep undo

import { describe, bench } from 'vitest';
import { RingBufferUndoStack } from '@pryzm/runtime-undo-stack';

const COMMAND_COUNT = 1_000;
const MEMORY_LIMIT_MB = 50;

describe('NFT 18 — undo stack memory ceiling (Wave A16 A16-T10)', () => {
  bench(`${COMMAND_COUNT} pushes: rss delta < ${MEMORY_LIMIT_MB} MB (ring buffer cap = 200)`, () => {
    const baseline = process.memoryUsage().rss;
    const stack = new RingBufferUndoStack({ maxSize: 200 });

    for (let i = 0; i < COMMAND_COUNT; i++) {
      stack.push({
        forward: { ops: [{ path: `/walls/${i}/height`, value: i }] },
        inverse: { ops: [{ path: `/walls/${i}/height`, value: i - 1 }] },
      });
    }

    const deltaMb = (process.memoryUsage().rss - baseline) / 1024 / 1024;

    // The ring buffer caps at 200 entries regardless of how many were pushed.
    if (stack.size > 200) {
      throw new Error(`NFT 18 FAIL: ring buffer exceeded cap — size=${stack.size} (max=200)`);
    }

    if (deltaMb > MEMORY_LIMIT_MB) {
      throw new Error(
        `NFT 18 FAIL: undo stack used ${deltaMb.toFixed(1)} MB rss delta (limit: ${MEMORY_LIMIT_MB} MB)`,
      );
    }
  });

  bench('ring buffer cap invariant: size never exceeds maxSize', () => {
    const maxSize = 50;
    const stack = new RingBufferUndoStack({ maxSize });

    for (let i = 0; i < 500; i++) {
      stack.push({
        forward: { ops: [{ path: `/el/${i}`, value: i }] },
        inverse: { ops: [{ path: `/el/${i}`, value: i - 1 }] },
      });

      if (stack.size > maxSize) {
        throw new Error(`NFT 18 FAIL: size=${stack.size} exceeded maxSize=${maxSize} at push ${i}`);
      }
    }
  });

  bench('undo/redo cursor correctness under overflow', () => {
    const stack = new RingBufferUndoStack({ maxSize: 10 });

    for (let i = 0; i < 20; i++) {
      stack.push({
        forward: { ops: [{ path: `/x`, value: i }] },
        inverse: { ops: [{ path: `/x`, value: i - 1 }] },
      });
    }

    // After 20 pushes into a cap-10 buffer: size=10, cursor=9, undoCount=10, redoCount=0
    if (stack.size !== 10) throw new Error(`size mismatch: ${stack.size}`);
    if (!stack.canUndo()) throw new Error('should canUndo');
    if (stack.canRedo())  throw new Error('should not canRedo at top');

    stack.undo();
    if (!stack.canRedo()) throw new Error('should canRedo after undo');
  });
});
