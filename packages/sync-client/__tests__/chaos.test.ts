// packages/sync-client/__tests__/chaos.test.ts — W-04 / ADR-0033 §2.5.
//
// Phase 2-close chaos test:
//   • 4 peers, each issuing 25 random edits = 100 total edits
//   • shared Hub forwards every Yjs update to every other peer
//   • assert: all 4 peers converge in < 5 s wall-clock
//   • assert: every peer ends with the same `events` Y.Map contents
//   • assert: no peer's CommandBus.applyPatchOnly was called for events
//             that originated locally (EventBridge invariant I1: no echo loop)
//
// Reproducibility:
//   The harness is seeded by a single integer.  CI failures should reproduce
//   locally with `SEED=<n> pnpm --filter @pryzm/sync-client test chaos`.

import { afterEach, describe, expect, it } from 'vitest';
import { mulberry32 } from './_chaos/prng.js';
import { createPeerHarness, type PeerHarness } from './_chaos/PeerHarness.js';
import { awaitConvergence } from './_chaos/convergence.js';
import { snapshotEventsMap } from './_chaos/RandomEditGenerator.js';

const SEED = Number.parseInt(process.env.SEED ?? '1337', 10);

let activeHarness: PeerHarness | null = null;
afterEach(() => {
  if (activeHarness) { activeHarness.dispose(); activeHarness = null; }
});

describe('Chaos harness — sync-client convergence (W-04 / ADR-0033 §2.5)', () => {
  it('4 peers, 100 random edits, converge in < 5 s', async () => {
    const harness = createPeerHarness({ peerCount: 4, seed: SEED }, mulberry32);
    activeHarness = harness;

    // Drive 25 commits per peer in a round-robin so the hub interleaves
    // updates from every peer rather than processing them in batches.
    const COMMITS_PER_PEER = 25;
    for (let round = 0; round < COMMITS_PER_PEER; round++) {
      for (const peer of harness.peers) {
        const ev = peer.generator.next(peer.doc);
        peer.commit(ev);
      }
      // Yield to the event loop so hub fan-out runs interleaved with commits.
      await new Promise<void>(r => setImmediate(r));
    }

    const result = await awaitConvergence(harness.peers, { timeoutMs: 5_000 });
    expect(result.converged).toBe(true);
    expect(result.elapsedMs).toBeLessThan(5_000);
    // 100 commits — but `wall.modify` / `wall.delete` payloads are
    // independent events on the events map (they all become unique
    // Y.Map keys keyed by their own ULID).  So we expect exactly 100.
    expect(result.entryCount).toBe(4 * COMMITS_PER_PEER);
  });

  it('every peer has identical events map contents after convergence', async () => {
    const harness = createPeerHarness({ peerCount: 4, seed: SEED + 1 }, mulberry32);
    activeHarness = harness;

    for (let round = 0; round < 25; round++) {
      for (const peer of harness.peers) peer.commit(peer.generator.next(peer.doc));
      await new Promise<void>(r => setImmediate(r));
    }
    await awaitConvergence(harness.peers, { timeoutMs: 5_000 });

    const ref = snapshotEventsMap(harness.peers[0]!.doc);
    for (const peer of harness.peers.slice(1)) {
      const snap = snapshotEventsMap(peer.doc);
      expect(snap.size).toBe(ref.size);
      for (const [k, v] of ref) expect(JSON.stringify(snap.get(k))).toBe(JSON.stringify(v));
    }
  });

  it('no echo: applyPatchOnly is never called for locally-originated event ids', async () => {
    const harness = createPeerHarness({ peerCount: 3, seed: SEED + 2 }, mulberry32);
    activeHarness = harness;

    const localIds: Map<string, Set<string>> = new Map();
    for (const p of harness.peers) localIds.set(p.id, new Set());

    for (let round = 0; round < 20; round++) {
      for (const peer of harness.peers) {
        const ev = peer.generator.next(peer.doc);
        localIds.get(peer.id)!.add(ev.id);
        peer.commit(ev);
      }
      await new Promise<void>(r => setImmediate(r));
    }
    await awaitConvergence(harness.peers, { timeoutMs: 5_000 });

    for (const peer of harness.peers) {
      const myIds = localIds.get(peer.id)!;
      // EventBridge invariant I2: dedup against EventLog before applyPatchOnly.
      // Locally-committed event ids are inserted into the local EventLog
      // by `peer.commit(...)`, so the inbound observer must skip them.
      for (const call of peer.commandBus.applyPatchOnlyCalls) {
        const env = call as { id: string };
        expect(myIds.has(env.id)).toBe(false);
      }
    }
  });

  it('survives 10% drop + 30% delay (jitter ≤ 50 ms)', async () => {
    const harness = createPeerHarness(
      {
        peerCount: 4,
        seed: SEED + 3,
        hub: { dropP: 0.10, delayP: 0.30, delayJitterMs: 50 },
      },
      mulberry32,
    );
    activeHarness = harness;

    for (let round = 0; round < 25; round++) {
      for (const peer of harness.peers) peer.commit(peer.generator.next(peer.doc));
      await new Promise<void>(r => setImmediate(r));
    }
    // Wait for any in-flight delayed frames to settle (max jitter = 50 ms
    // → 100 ms guard).
    await new Promise<void>(r => setTimeout(r, 100));
    // Mimic the y-websocket reconnect-and-resync that real clients run
    // when the WS drops + reconnects.  Without this, dropped frames are
    // gone forever — y-websocket recovers via sync step 2 after reconnect,
    // and the hub's flushState() exposes the same recovery primitive.
    harness.flushState();

    const result = await awaitConvergence(harness.peers, { timeoutMs: 5_000 });
    expect(result.converged).toBe(true);

    const stats = harness.hubStats();
    expect(stats.framesSent).toBeGreaterThan(100);
    expect(stats.framesDropped).toBeGreaterThan(0);
    expect(stats.framesDelayed).toBeGreaterThan(0);
  });
});
