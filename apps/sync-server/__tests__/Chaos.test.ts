// Chaos test harness — N concurrent virtual clients (S43 D5-D6 fixture per
// ADR-0033 §2.5 + spec §S43 line 190-208 + line 802 K2D-A kill-switch).
//
// HOW THIS LANDS IN STAGES:
//   • S43 D5 (this file): JSON-protocol chaos against the existing S22
//     sync-server.  Asserts the broadcast invariant + the linearisation
//     invariant + the latency budget.  This is what arms K2D-A today.
//   • S43 D6 (next): the same suite is PROMOTED — each virtual client
//     also instantiates a `SyncClient` from `@pryzm/sync-client` and the
//     test asserts Y.Doc convergence in addition to JSON broadcast.  The
//     JSON-only assertions remain green throughout.  No rewrite, just an
//     extension.
//
// The fixture in this file is the safety net that lets us add the Yjs
// path without breaking the JSON path.  Per ADR-0033 §2.4, both wire
// formats coexist on the same WebSocket; this test exercises the JSON
// frame today and is the precursor to also exercising the Yjs frame.
//
// The K2D-A kill-switch (spec line 802) fires if convergence fails after
// 100 random edits in < 5 s.  This file ARMS that kill-switch by encoding
// the contract as a hard-fail test.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ulid } from 'ulid';
import WebSocket from 'ws';
import { performance } from 'node:perf_hooks';
import { createSyncServer, type SyncServerInstance } from '../src/index.js';

// ─── Wire types (mirror apps/sync-server/src/protocol/messages.ts) ─────────

interface CommandEvent {
  readonly id: string;
  readonly type: string;
  readonly actorId: string;
  readonly payload: unknown;
}
interface LinearisedEvent extends CommandEvent {
  readonly projectId: string;
  readonly sequenceNumber: number;
  readonly persistedAt: string;
}

// ─── Buffered WS client (lifted from sync-roundtrip.bench.ts) ──────────────

interface Buffered {
  readonly ws: WebSocket;
  readonly id: string;
  /** Every event.push received, in arrival order — the per-tab inbox. */
  readonly inbox: LinearisedEvent[];
  /** Latency observation for each event we sent: t_local_send → t_local_ack. */
  readonly latencies: number[];
  waitFor(pred: (m: unknown) => boolean, timeoutMs?: number): Promise<unknown>;
  send(message: unknown): void;
  close(): void;
}

const isType = (t: string) => (m: unknown): boolean =>
  typeof m === 'object' && m !== null && (m as { type?: unknown }).type === t;

async function buffered(port: number, clientId: string): Promise<Buffered> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/sync?clientId=${clientId}&userId=u-${clientId}`);
  const queue: unknown[] = [];
  const inbox: LinearisedEvent[] = [];
  const latencies: number[] = [];
  const sentAt = new Map<string, number>();
  const watchers: Array<{ pred: (m: unknown) => boolean; resolve: (m: unknown) => void; timer?: NodeJS.Timeout }> = [];

  ws.on('message', (data: Buffer | string) => {
    const m = JSON.parse(typeof data === 'string' ? data : data.toString('utf-8'));

    if (isType('event.push')(m)) {
      const ev = (m as { event: LinearisedEvent }).event;
      inbox.push(ev);
      const t = sentAt.get(ev.id);
      if (t !== undefined) {
        latencies.push(performance.now() - t);
        sentAt.delete(ev.id);
      }
    }
    if (isType('event.ack')(m)) {
      const id = (m as { id: string }).id;
      const t = sentAt.get(id);
      if (t !== undefined) {
        // Locally-originated ack — record but DON'T pop the sentAt map
        // entry yet because we also want the event.push round-trip
        // measurement when (if) the server echoes it back to ourselves.
      }
    }

    queue.push(m);
    for (let i = watchers.length - 1; i >= 0; i--) {
      const w = watchers[i]!;
      if (w.pred(m)) {
        if (w.timer) clearTimeout(w.timer);
        w.resolve(m);
        watchers.splice(i, 1);
      }
    }
  });

  return new Promise((res, rej) => {
    ws.once('open', () => {
      res({
        ws,
        id: clientId,
        inbox,
        latencies,
        waitFor(pred, timeoutMs = 5_000) {
          const hit = queue.find(pred);
          if (hit) return Promise.resolve(hit);
          return new Promise((r, rejInner) => {
            const w = { pred, resolve: r, timer: undefined as NodeJS.Timeout | undefined };
            w.timer = setTimeout(() => {
              const idx = watchers.indexOf(w);
              if (idx >= 0) watchers.splice(idx, 1);
              rejInner(new Error(`waitFor timeout after ${timeoutMs}ms (client ${clientId})`));
            }, timeoutMs);
            watchers.push(w);
          });
        },
        send(message) {
          // If this is an event.append, record the send time so we can
          // measure round-trip latency when the event.push echoes back.
          if (typeof message === 'object' && message !== null && (message as { type?: string }).type === 'event.append') {
            const ev = (message as { payload: { event: { id: string } } }).payload.event;
            sentAt.set(ev.id, performance.now());
          }
          ws.send(JSON.stringify(message));
        },
        close() { ws.close(); },
      });
    });
    ws.once('error', rej);
  });
}

// ─── Seeded RNG (deterministic edit generator) ─────────────────────────────
//
// mulberry32 — small, fast, deterministic; perfect for chaos seeds.

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COMMAND_TYPES = ['wall.create', 'door.create', 'window.create', 'wall.move', 'door.setWidth'] as const;

interface RandomEdit { readonly type: string; readonly payload: { seed: number; n: number } }
function makeEditGenerator(seed: number): () => RandomEdit {
  const rng = mulberry32(seed);
  let n = 0;
  return () => {
    const type = COMMAND_TYPES[Math.floor(rng() * COMMAND_TYPES.length)] ?? 'wall.create';
    return { type, payload: { seed, n: n++ } };
  };
}

// ─── Convergence helpers ───────────────────────────────────────────────────

async function waitForConvergence(
  tabs: readonly Buffered[],
  expectedEventCount: number,
  timeoutMs: number,
): Promise<void> {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    if (tabs.every((t) => t.inbox.length >= expectedEventCount)) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  const counts = tabs.map((t) => `${t.id}=${t.inbox.length}`).join(', ');
  throw new Error(
    `Convergence timeout after ${timeoutMs}ms.  Expected ${expectedEventCount} events per tab; got: ${counts}.  ` +
      `K2D-A kill-switch armed: spec §S43 line 802.`,
  );
}

function snapshotsEqual(tabs: readonly Buffered[]): boolean {
  if (tabs.length === 0) return true;
  const ref = tabs[0]!.inbox.map((e) => `${e.sequenceNumber}:${e.id}`).sort();
  for (let i = 1; i < tabs.length; i++) {
    const tab = tabs[i]!.inbox.map((e) => `${e.sequenceNumber}:${e.id}`).sort();
    if (tab.length !== ref.length) return false;
    for (let j = 0; j < ref.length; j++) if (tab[j] !== ref[j]) return false;
  }
  return true;
}

function sortedSeqs(tab: Buffered): number[] {
  return tab.inbox.map((e) => e.sequenceNumber).slice().sort((a, b) => a - b);
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Chaos harness — JSON-protocol convergence (S43 D5; ADR-0033 §2.5)', () => {
  let server: SyncServerInstance;
  let port: number;
  let tabs: Buffered[] = [];

  beforeAll(async () => {
    server = await createSyncServer({});
    port = await server.listen(0);
  }, 30_000);

  afterAll(async () => {
    await server.shutdown('chaos-cleanup');
  });

  beforeEach(async () => { tabs = []; });

  afterEach(async () => {
    for (const t of tabs) t.close();
    // Give the server a tick to clean up sessions before the next test.
    await new Promise((r) => setTimeout(r, 50));
  });

  async function spawnTabs(n: number, projectId: string): Promise<Buffered[]> {
    const out: Buffered[] = [];
    for (let i = 0; i < n; i++) {
      const t = await buffered(port, `chaos-${projectId}-${i}`);
      await t.waitFor(isType('session.opened'));
      t.send({ type: 'project.subscribe', projectId });
      await t.waitFor(isType('project.subscribed'));
      out.push(t);
      tabs.push(t);
    }
    return out;
  }

  // ─── K2D-A kill-switch contract ──────────────────────────────────────────

  it('K2D-A: 4 tabs, 100 random edits converge in < 5 s (broadcast invariant)', async () => {
    const TABS = 4;
    const EDITS = 100;
    const TIMEOUT_MS = 5_000;
    const projectId = `chaos-${ulid()}`;
    const tabs = await spawnTabs(TABS, projectId);
    const generators = Array.from({ length: TABS }, (_, i) => makeEditGenerator(0xC0FFEE + i));

    const start = performance.now();
    for (let i = 0; i < EDITS; i++) {
      const tab = tabs[i % TABS]!;
      const edit = generators[i % TABS]!();
      tab.send({
        type: 'event.append',
        payload: {
          projectId,
          clientId: tab.id,
          event: { id: ulid(), type: edit.type, actorId: `u-${tab.id}`, payload: edit.payload },
        },
      });
    }

    // Convergence: every tab must receive every event.
    await waitForConvergence(tabs, EDITS, TIMEOUT_MS);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(TIMEOUT_MS);
    expect(snapshotsEqual(tabs)).toBe(true);
  }, 30_000);

  // ─── Linearisation invariant per ADR-019 §2.2 ────────────────────────────

  it('every tab observes the SAME sequence-number ordering (linearisation)', async () => {
    const TABS = 3;
    const EDITS = 60;
    const projectId = `chaos-${ulid()}`;
    const tabs = await spawnTabs(TABS, projectId);
    const gens = Array.from({ length: TABS }, (_, i) => makeEditGenerator(0xBEEF + i));

    for (let i = 0; i < EDITS; i++) {
      const tab = tabs[i % TABS]!;
      const edit = gens[i % TABS]!();
      tab.send({
        type: 'event.append',
        payload: {
          projectId,
          clientId: tab.id,
          event: { id: ulid(), type: edit.type, actorId: `u-${tab.id}`, payload: edit.payload },
        },
      });
    }

    await waitForConvergence(tabs, EDITS, 5_000);

    // All tabs should see sequence numbers 1..EDITS, gap-free, sorted identically.
    for (const tab of tabs) {
      const seqs = sortedSeqs(tab);
      expect(seqs.length).toBe(EDITS);
      for (let i = 0; i < seqs.length; i++) expect(seqs[i]).toBe(i + 1);
    }
    // And the inbox order itself (not just the sorted view) is identical
    // across all tabs — the server linearises once and all peers see the
    // same canonical order.
    const refOrder = tabs[0]!.inbox.map((e) => e.sequenceNumber);
    for (let i = 1; i < tabs.length; i++) {
      expect(tabs[i]!.inbox.map((e) => e.sequenceNumber)).toEqual(refOrder);
    }
  }, 30_000);

  // ─── S22 protocol contract: sender ALSO receives its own event.push ────
  //
  // The existing S22 SessionManager broadcasts event.push to ALL subscribers
  // of the project, INCLUDING the originating client.  The sender ALSO
  // receives event.ack to confirm linearisation (sequence number assignment).
  // This is the contract the chaos convergence assertion implicitly relies
  // on — every tab's inbox.length grows to EDITS (not EDITS - own).
  //
  // Per ADR-0033 §2.3 the client-side EventBridge handles dedup against the
  // local durable log via `eventLog.has(id)` so the sender's local stores
  // don't get patched twice (once by CommandBus.execute, once by the
  // bridge's reverse path).  The dedup is a CLIENT-side invariant, not a
  // server-side broadcast filter — keeping it client-side simplifies the
  // server (one fan-out path, no per-recipient filtering) and is robust
  // against multi-tab same-user scenarios.

  it('S22 protocol: sender receives BOTH event.ack AND event.push for its own appends (chaos convergence relies on this)', async () => {
    const projectId = `chaos-${ulid()}`;
    const [a, b] = await spawnTabs(2, projectId);
    const eid = ulid();
    a!.send({
      type: 'event.append',
      payload: {
        projectId,
        clientId: a!.id,
        event: { id: eid, type: 'wall.create', actorId: `u-${a!.id}`, payload: {} },
      },
    });
    await a!.waitFor((m) => isType('event.ack')(m) && (m as { id: string }).id === eid);
    await a!.waitFor((m) => isType('event.push')(m) && (m as { event: { id: string } }).event.id === eid);
    await b!.waitFor((m) => isType('event.push')(m) && (m as { event: { id: string } }).event.id === eid);

    // Both a AND b receive the event.push (protocol contract).
    const aGotIt = a!.inbox.find((e) => e.id === eid);
    const bGotIt = b!.inbox.find((e) => e.id === eid);
    expect(aGotIt).toBeDefined();
    expect(bGotIt).toBeDefined();
    // Server linearises: same sequence number for both observers.
    expect(aGotIt!.sequenceNumber).toBe(bGotIt!.sequenceNumber);
  }, 15_000);

  // ─── Latency budget per S43 exit gate (spec line 264) ────────────────────

  it('round-trip latency p95 < 250 ms for single-edit propagation across two tabs', async () => {
    const SAMPLES = 50;
    const projectId = `chaos-${ulid()}`;
    const [a, b] = await spawnTabs(2, projectId);

    const observations: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const eid = ulid();
      const t0 = performance.now();
      const recv = b!.waitFor((m) => isType('event.push')(m) && (m as { event: { id: string } }).event.id === eid, 2_000);
      a!.send({
        type: 'event.append',
        payload: {
          projectId,
          clientId: a!.id,
          event: { id: eid, type: 'wall.create', actorId: `u-${a!.id}`, payload: { i } },
        },
      });
      await recv;
      observations.push(performance.now() - t0);
    }
    observations.sort((a, b) => a - b);
    const p95Idx = Math.floor(0.95 * observations.length);
    const p95 = observations[p95Idx] ?? 0;
    expect(p95).toBeLessThan(250);
  }, 30_000);

  // ─── Promotion hook for S43 D6 (Y.Doc convergence) ─────────────────────
  //
  // When the Yjs transport lands at S43 D6, this test is extended to ALSO
  // instantiate `SyncClient` from `@pryzm/sync-client` per tab, write the
  // same edits through `commandBus.fireLocalCommit` (which the bridge
  // forwards to Y.Map.set), and assert that every tab's `bridge.snapshot()`
  // contains the same set of events.  The JSON assertions above remain
  // green; the Yjs assertions land alongside.
  //
  // The hook is intentionally `it.todo` so the test surface signals that
  // the work is bound to a named future task per ADR-0033 §5 verification
  // matrix.

  it.todo('Y.Doc convergence (S43 D6 — promotion of this fixture to also assert Yjs CRDT state)');
});
