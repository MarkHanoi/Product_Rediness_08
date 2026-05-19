// Bench: `persistence.save-edit.append.{memory,idb}` — single-event append p95.
//
// Spec source: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md`
//   • S04-T4 (line 438): "apps/bench/save-edit.ts (D6, Agent A): measure
//     single-event append p95.  Target < 10 ms.  CI hard-fails > 12 ms."
//
// Methodology:
//   1. Build the same canonical wall.create event as codec-spike.bench.ts
//      so the two benches are comparable apples-to-apples.
//   2. Per backend, time `EventLog.append(record)` `samples` times — each
//      iteration appends a fresh event with a fresh seq and full audit
//      payload, mirroring the steady-state command-bus pipeline.
//   3. Report p50/p95/p99 to `.run-output/persistence.save-edit.append.*.json`
//      so `check-regression.mjs` gates the p95 against the baseline.
//
// Per-event size report:
//   The bench also writes `persistence.event-size.json` — average +
//   max bytes-per-event across all four codec/backend combinations,
//   so reviewers see at a glance whether the v2 wire format stays
//   under the ADR-004 < 200 B / event ceiling.

import 'fake-indexeddb/auto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import type { EventRecord } from '@pryzm/command-bus';
import {
  EventLog,
  IndexedDbBackend,
  InMemoryBackend,
  MsgpackAliasedCodec,
  MsgpackCodec,
  JsonCodec,
} from '@pryzm/persistence-client';
import { measure } from '../timing.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = join(__dirname, '..', '..', '.run-output');
mkdirSync(RUN_OUTPUT, { recursive: true });

function buildWallCreate(seq: number): EventRecord {
  const wallId = `wall-${seq.toString(36)}`;
  const fwd = {
    op: 'add' as const,
    path: ['walls', wallId],
    value: { id: wallId, length: 3.5, height: 2.4, points: [0, 0, 3.5, 0] },
  };
  const inv = { op: 'remove' as const, path: ['walls', wallId] };
  return {
    id: `01HZ${seq.toString().padStart(22, '0')}`,
    type: 'wall.create',
    payload: { length: 3.5, height: 2.4, points: [0, 0, 3.5, 0] },
    affectedStores: ['wall'],
    patches: [
      {
        storeKey: 'wall',
        forwardPatches: [fwd],
        inversePatches: [inv],
        capturedAt: '2026-04-26T10:00:00.000Z',
      },
    ],
    audit: {
      actorId: 'user-1',
      projectId: 'p-7',
      clientId: 'tab-3',
      timestamp: '2026-04-26T10:00:00.000Z',
    },
    forward: [fwd],
    inverse: [inv],
  };
}

const SAMPLES = 200;
const WARMUP = 20;
// Per S04-T4: target < 10 ms p95; CI hard-fails > 12 ms.  Warn budget
// gives 6 ms of headroom under the target.
const WARN_MS = 8;
const BUDGET_MS = 12;

let projectCounter = 0;
function freshProject(): string {
  return `bench-${Date.now()}-${projectCounter++}`;
}

describe('persistence.save-edit (S04-T4)', () => {
  it('append p95 < 12 ms — InMemoryBackend', async () => {
    const log = new EventLog(new InMemoryBackend());
    let seq = 0;
    const sample = await measure(
      'persistence.save-edit.append.memory',
      async () => {
        await log.append(buildWallCreate(++seq));
      },
      { samples: SAMPLES, warmup: WARMUP, warnMs: WARN_MS, budgetMs: BUDGET_MS },
    );
    writeFileSync(
      join(RUN_OUTPUT, `${sample.name}.json`),
      JSON.stringify(sample, null, 2),
    );
    expect(sample.p95).toBeLessThan(BUDGET_MS);
    await log.close();
  });

  it('append p95 < 12 ms — IndexedDbBackend', async () => {
    const log = new EventLog(new IndexedDbBackend({ projectId: freshProject() }));
    let seq = 0;
    const sample = await measure(
      'persistence.save-edit.append.idb',
      async () => {
        await log.append(buildWallCreate(++seq));
      },
      { samples: SAMPLES, warmup: WARMUP, warnMs: WARN_MS, budgetMs: BUDGET_MS },
    );
    writeFileSync(
      join(RUN_OUTPUT, `${sample.name}.json`),
      JSON.stringify(sample, null, 2),
    );
    expect(sample.p95).toBeLessThan(BUDGET_MS);
    await log.close();
  });

  // Per-event-size CI report (S04-T5 closure — line 439 "Per-event size:
  // < 200 bytes typical (CI report)").
  it('per-event size report — every codec on the canonical wall.create event', () => {
    const events = Array.from({ length: 1_000 }, (_, i) => ({
      seq: i + 1,
      version: 2 as const,
      persistedAt: '2026-04-26T10:00:00.000Z',
      event: buildWallCreate(i + 1),
    }));
    const codecs = [JsonCodec, MsgpackCodec, MsgpackAliasedCodec];
    const rows = codecs.map((codec) => {
      let total = 0;
      let max = 0;
      for (const ev of events) {
        // v1 codecs see version=2 envelope but encode it transparently
        // (they don't validate); for v2 the version matches.
        const bytes =
          codec.name === 'msgpack-v2'
            ? codec.encode(ev)
            : codec.encode({ ...ev, version: 1 });
        total += bytes.byteLength;
        if (bytes.byteLength > max) max = bytes.byteLength;
      }
      return {
        codec: codec.name,
        avgBytesPerEvent: Number((total / events.length).toFixed(2)),
        maxBytesPerEvent: max,
      };
    });
    const v2 = rows.find((r) => r.codec === 'msgpack-v2')!;
    const report = {
      generatedAt: new Date().toISOString(),
      batchSize: events.length,
      results: rows,
      target: { avgBytesPerEventLessThan: 200, scope: 'ADR-004 byte-budget closure (S04)' },
      v2WithinBudget: v2.avgBytesPerEvent < 200,
    };
    writeFileSync(
      join(RUN_OUTPUT, 'persistence.event-size.json'),
      JSON.stringify(report, null, 2),
    );
    expect(report.v2WithinBudget).toBe(true);
    // eslint-disable-next-line no-console
    console.log(
      `[bench] save-edit per-event-size — json=${rows[0]!.avgBytesPerEvent} ` +
        `msgpack-v1=${rows[1]!.avgBytesPerEvent} ` +
        `msgpack-v2=${rows[2]!.avgBytesPerEvent} (target < 200).`,
    );
  });

  afterAll(() => {
    /* per-bench EventLog instances are closed inline */
  });
});
