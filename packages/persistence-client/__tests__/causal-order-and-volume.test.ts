// Causal-order + 10K-event volume tests (S04-T5).
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` line 439:
//   "Causal-order tests; events with same wall-clock timestamp are
//    ordered by `seq`. Large-volume tests (10K events). Per-event size:
//    < 200 bytes typical (CI report)."

import { describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import type { EventRecord } from '@pryzm/command-bus';
import {
  EventLog,
  IndexedDbBackend,
  InMemoryBackend,
  MsgpackAliasedCodec,
} from '../src/index.js';

let projectCounter = 0;
function freshProject(): string {
  return `s04-causal-${Date.now()}-${projectCounter++}`;
}

function makeRecord(i: number, frozenTimestamp: string): EventRecord<{ n: number }> {
  return {
    id: `01HZ${i.toString().padStart(22, '0')}`,
    type: 'test.tick',
    payload: { n: i },
    affectedStores: ['t'],
    patches: [
      {
        storeKey: 't',
        forwardPatches: [{ op: 'add', path: ['n'], value: i }],
        inversePatches: [{ op: 'remove', path: ['n'] }],
        capturedAt: frozenTimestamp,
      },
    ],
    audit: {
      actorId: 'system',
      projectId: 'p',
      clientId: 'c',
      timestamp: frozenTimestamp,
    },
    forward: [{ op: 'add', path: ['n'], value: i }],
    inverse: [{ op: 'remove', path: ['n'] }],
  };
}

describe('S04-T5 — causal order & volume', () => {
  it('orders same-timestamp events by seq on replay (in-memory)', async () => {
    const log = new EventLog(new InMemoryBackend());
    // Hammer 200 appends with identical persistedAt — the only ordering
    // signal MUST be `seq`.
    const fixed = '2026-04-26T12:00:00.000Z';
    for (let i = 0; i < 200; i++) {
      const r = makeRecord(i, fixed);
      await log.append(r);
    }
    const seqs: number[] = [];
    const ts: string[] = [];
    for await (const ev of log.replay()) {
      seqs.push(ev.seq);
      ts.push(ev.persistedAt);
    }
    expect(seqs).toEqual(Array.from({ length: 200 }, (_, i) => i + 1));
    // persistedAt is the wall-clock at append time — irrelevant; seq is the
    // canonical order.  We don't assert on its contents (it's "now"), only
    // on causal ordering by seq.
    expect(ts).toHaveLength(200);
    await log.close();
  });

  it('preserves arrival order across IDB cursor on same-timestamp events', async () => {
    const backend = new IndexedDbBackend({ projectId: freshProject() });
    const log = new EventLog(backend);
    const fixed = '2026-04-26T12:00:00.000Z';
    // Concurrent fire — single-writer queue must still preserve arrival
    // order even when persistedAt collides.
    const promises = Array.from({ length: 100 }, (_, i) =>
      log.append(makeRecord(i, fixed)),
    );
    const persisted = await Promise.all(promises);
    expect(persisted.map((p) => p.seq)).toEqual(
      Array.from({ length: 100 }, (_, i) => i + 1),
    );
    const seqs: number[] = [];
    for await (const ev of log.replay()) seqs.push(ev.seq);
    expect(seqs).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
    await log.close();
  });

  it('round-trips 10K events through the in-memory backend', async () => {
    const log = new EventLog(new InMemoryBackend());
    const N = 10_000;
    const ts = '2026-04-26T13:00:00.000Z';
    const t0 = Date.now();
    for (let i = 0; i < N; i++) await log.append(makeRecord(i, ts));
    const elapsedMs = Date.now() - t0;
    expect(await log.highestSeq()).toBe(N);
    let count = 0;
    let lastSeq = 0;
    for await (const ev of log.replay()) {
      count++;
      expect(ev.seq).toBeGreaterThan(lastSeq);
      lastSeq = ev.seq;
    }
    expect(count).toBe(N);
    // The volume test is causal-order primarily; we just want to make
    // sure 10K is feasible — generous ceiling so flaky CI hosts pass.
    expect(elapsedMs).toBeLessThan(15_000);
    await log.close();
  });

  it('per-event v2 wire size is < 200 bytes on a typical envelope', () => {
    const sample = makeRecord(1, '2026-04-26T13:00:00.000Z');
    const bytes = MsgpackAliasedCodec.encode({
      seq: 1,
      version: 2,
      persistedAt: '2026-04-26T13:00:00.000Z',
      event: sample,
    });
    // ADR-004 target — proven by the codec spike bench too, this is the
    // per-event closure check.
    expect(bytes.byteLength).toBeLessThan(200);
  });
});
