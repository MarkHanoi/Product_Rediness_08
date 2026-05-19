// Bench: `sync.roundtrip.append-to-push` — S22 exit gate #4.
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md` §S22
//   • Exit criterion #4 (line 1075):  "Round-trip latency (client A
//      append → client B receives) < 250 ms p95 on localhost."
//
// What we measure (one sample = one append-to-broadcast):
//   • Two `ws` clients connected to a `createSyncServer({})` instance
//     listening on an ephemeral port.  Both subscribe to the same
//     project.  Client A sends `event.append`; the timer stops when
//     client B receives the matching `event.push`.
//
// Methodology:
//   • The server uses the default in-memory event log + noop bake
//     enqueuer (no Postgres, no HTTP bake hop).  This isolates the
//     sync-server's own linearisation cost — Postgres latency is
//     covered separately by the persistence-stress bench in S04.
//   • 200 samples + 20 warmup iterations.  Both clients stay open
//     across samples; we just send a fresh append each time.
//   • We pre-stage a per-sample promise that resolves on the matching
//     `event.push` BEFORE calling `ws.send` so we can't lose the race
//     against fast localhost delivery.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { ulid } from 'ulid';

import { createSyncServer, type SyncServerInstance } from '@pryzm/sync-server';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = join(__dirname, '..', '..', '.run-output');
mkdirSync(RUN_OUTPUT, { recursive: true });

interface Buffered {
  ws: WebSocket;
  /** Most-recently received message of the requested type, or a
   *  promise that will resolve when one arrives. */
  waitFor(pred: (m: unknown) => boolean): Promise<unknown>;
}

function buffered(port: number, clientId: string): Promise<Buffered> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/sync?clientId=${clientId}&userId=u-${clientId}`);
  const queue: unknown[] = [];
  const watchers: Array<{ pred: (m: unknown) => boolean; resolve: (m: unknown) => void }> = [];
  ws.on('message', (data: Buffer | string) => {
    const m = JSON.parse(typeof data === 'string' ? data : data.toString('utf-8'));
    queue.push(m);
    for (let i = watchers.length - 1; i >= 0; i--) {
      const w = watchers[i]!;
      if (w.pred(m)) {
        w.resolve(m);
        watchers.splice(i, 1);
      }
    }
  });
  return new Promise((res, rej) => {
    ws.once('open', () => {
      res({
        ws,
        waitFor(pred) {
          const hit = queue.find(pred);
          if (hit) return Promise.resolve(hit);
          return new Promise((r) => watchers.push({ pred, resolve: r }));
        },
      });
    });
    ws.once('error', rej);
  });
}

const isType = (t: string) => (m: unknown): boolean =>
  typeof m === 'object' && m !== null && (m as { type?: unknown }).type === t;

describe('sync.roundtrip.append-to-push (S22 exit gate #4)', () => {
  let server: SyncServerInstance;
  let port: number;
  let A: Buffered;
  let B: Buffered;

  beforeAll(async () => {
    server = await createSyncServer({});
    port = await server.listen(0); // ephemeral
    A = await buffered(port, 'A');
    B = await buffered(port, 'B');
    await A.waitFor(isType('session.opened'));
    await B.waitFor(isType('session.opened'));
    A.ws.send(JSON.stringify({ type: 'project.subscribe', projectId: 'bench-rt' }));
    B.ws.send(JSON.stringify({ type: 'project.subscribe', projectId: 'bench-rt' }));
    await A.waitFor(isType('project.subscribed'));
    await B.waitFor(isType('project.subscribed'));
  }, 30_000);

  afterAll(async () => {
    A.ws.close();
    B.ws.close();
    await server.shutdown('bench-cleanup');
  });

  it('client A append → client B event.push — p95 < 250 ms', async () => {
    const SAMPLES = 200;
    const WARMUP = 20;

    // We measure manually here (not via `measure()`) because we need
    // per-sample state — a fresh ulid + a pre-staged waitFor on B
    // BEFORE we send on A.
    async function once(): Promise<number> {
      const eid = ulid();
      const pushP = B.waitFor((m) => isType('event.push')(m) && (m as { event: { id: string } }).event.id === eid);
      const t0 = performance.now();
      A.ws.send(JSON.stringify({
        type: 'event.append',
        payload: {
          projectId: 'bench-rt',
          clientId: 'A',
          event: { id: eid, type: 'wall.create', actorId: 'u-A', payload: {} },
        },
      }));
      await pushP;
      return performance.now() - t0;
    }

    for (let i = 0; i < WARMUP; i++) await once();

    const observations: number[] = new Array(SAMPLES);
    for (let i = 0; i < SAMPLES; i++) observations[i] = await once();
    observations.sort((a, b) => a - b);

    const pct = (q: number): number => {
      const idx = Math.min(observations.length - 1, Math.max(0, Math.floor(q * observations.length)));
      return Number((observations[idx] ?? 0).toFixed(3));
    };

    const sample = {
      name: 'sync.roundtrip.append-to-push',
      samples: SAMPLES,
      p50: pct(0.5),
      p95: pct(0.95),
      p99: pct(0.99),
      budgetMs: 250,
      warnMs: 100,
      recordedAt: new Date().toISOString(),
    };
    writeFileSync(
      join(RUN_OUTPUT, `${sample.name}.json`),
      JSON.stringify(sample, null, 2) + '\n',
    );
    // eslint-disable-next-line no-console
    console.log(
      `[bench] sync.roundtrip.append-to-push — p50=${sample.p50}ms ` +
        `p95=${sample.p95}ms p99=${sample.p99}ms (budget=${sample.budgetMs}ms).`,
    );
    expect(sample.p95).toBeLessThan(sample.budgetMs);
  }, 60_000);
});
