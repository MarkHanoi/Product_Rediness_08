// Bench: `awareness.throughput` — < 5 KB/s/peer cap (S44 D6).
//
// Spec: `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` §S44 D6
//   "Throttle + perf measurement (5 KB/s/peer cap)."
// + spec line 374 (exit criterion E2):
//   "Awareness traffic < 5 KB/s per peer measured at 4 concurrent users."
//
// Method:
//   • Spin up a PryzmAwareness with the production cursor coalesce
//     window (50 ms).
//   • Simulate a realistic 1-second activity profile:
//       - 60 cursor-move events (60 Hz mouse) — coalesced
//       - 1 selection change
//       - 1 active-tool change
//       - 1 active-view change
//   • Read getThroughputStats().bytesWritten and assert < 5000 bytes.
//
// Note this bench measures BYTES the local peer writes to its provider,
// which the provider then broadcasts to N peers.  At N peers each peer's
// inbound is the sum of every other peer's outbound — but the per-peer
// outbound cap is what governs the 5 KB/s budget.

import { describe, expect, it } from 'vitest';
import { writeBenchSample } from '../save-baseline.js';
import {
  PryzmAwareness,
  AWARENESS_BYTES_PER_SEC_BUDGET,
  type ProviderLike,
} from '@pryzm/sync-client';

function makeMockProvider(clientID = 1): ProviderLike {
  const stored = new Map<number, Record<string, unknown>>();
  return {
    awareness: {
      clientID,
      setLocalState: (s) => { if (s) stored.set(clientID, s); else stored.delete(clientID); },
      getStates: () => stored,
      on: () => {},
      off: () => {},
    },
    on: () => {},
    off: () => {},
    destroy: () => {},
  };
}

describe('awareness.throughput', () => {
  it('per-peer outbound bytes-per-second stays under the 5 KB/s budget', async () => {
    // Use real timers for the bench so the 50 ms coalesce window is
    // genuinely measured (not vi.advanceTimersByTime).
    const provider = makeMockProvider(1);
    const aw = new PryzmAwareness(provider, { id: 'u-1', displayName: 'User 1' }, {
      cursorCoalesceMs: 50,
    });

    const startBytes = aw.getThroughputStats().bytesWritten;
    const t0 = performance.now();

    // 60 cursor-move events spread across 1 second; 1 selection + 1 tool +
    // 1 view change in the middle.
    for (let i = 0; i < 60; i++) {
      aw.setCursor({ x: i, y: i, viewId: 'main-3d' });
      if (i === 30) {
        aw.setSelection(['w1', 'w2']);
        aw.setActiveTool('wall.draw');
      }
      if (i === 45) aw.setActiveView('plan-L1');
      // Pace at ~60 Hz so the coalesce window flushes naturally.
      await new Promise((r) => setTimeout(r, 16));
    }
    aw.flush();

    const elapsedMs = performance.now() - t0;
    const stats = aw.getThroughputStats();
    const bytesInWindow = stats.bytesWritten - startBytes;
    const bytesPerSec = (bytesInWindow / elapsedMs) * 1000;

    aw.dispose();

    const sample = {
      name: 'awareness.throughput',
      samples: 1,
      p50: Number(bytesPerSec.toFixed(2)),
      p95: Number(bytesPerSec.toFixed(2)),
      p99: Number(bytesPerSec.toFixed(2)),
      budgetMs: AWARENESS_BYTES_PER_SEC_BUDGET,  // overloaded — bytes/sec cap
      warnMs: AWARENESS_BYTES_PER_SEC_BUDGET * 0.6,
      recordedAt: new Date().toISOString(),
    };
    writeBenchSample(sample);

    expect(bytesPerSec).toBeLessThan(AWARENESS_BYTES_PER_SEC_BUDGET);
    // Cursor coalescing should have collapsed many sets into far fewer flushes.
    expect(stats.cursorFlushes).toBeLessThan(stats.cursorSetsReceived);
  }, 30_000);
});
