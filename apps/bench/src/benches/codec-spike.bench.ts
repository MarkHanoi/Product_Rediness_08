// Bench: `persistence.codec-spike` — JSON vs MessagePack on 1K events.
//
// Spec source: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md`
//   • S03-T8 (line 376) — "encode 1K sample events with `@msgpack/msgpack`,
//     `msgpack-lite`, `notepack.io`.  Measure: bytes-per-event avg, encoding
//     speed, decoding speed, bundle size of the codec.  Output to ADR-004
//     draft.  Target: avg < 200 bytes per command event."
//
// Methodology:
//   1. Build a deterministic 1K-event sample mirroring the wire shape the
//      L0 EventLog actually persists (`PersistedEvent<EventRecord>`).  No
//      randomness — bench reproducibility is more valuable than realism
//      here, and the median wall.create command is well-modelled by the
//      fixture below.
//   2. Encode the entire batch in one timed run.  We report:
//        • avg-bytes-per-event   (simulator for IDB row size)
//        • encode-1k-batch p95   (CPU cost of writing a snapshot)
//        • decode-1k-batch p95   (CPU cost of replay/cold-load)
//   3. The numbers feed `docs/02-decisions/adrs/0004-msgpack-codec.md`
//      (drafted in S03, ratified in S04).  S03 ships `@msgpack/msgpack`
//      because the package is already a transitive dep of the L0 client;
//      `msgpack-lite` and `notepack.io` are evaluated separately at S04
//      with bundle-size measurements (see ADR-004 §4 "Open questions").
//
// Result-export contract:
//   We write the encode/decode percentile samples through the standard
//   `apps/bench/.run-output/<name>.json` channel so `check-regression.mjs`
//   gates them with the same `hardFail` flag as every other bench.  The
//   `avg-bytes-per-event` figure is informational (not a CI gate at S03)
//   and gets emitted to `apps/bench/.run-output/codec-spike-bytes.json`
//   for the ADR draft.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  JsonCodec,
  MsgpackAliasedCodec,
  MsgpackCodec,
  PERSISTED_EVENT_VERSION,
  type Codec,
  type PersistedEvent,
} from '@pryzm/persistence-client';
import { measure } from '../timing.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = join(__dirname, '..', '..', '.run-output');
mkdirSync(RUN_OUTPUT, { recursive: true });

/**
 * Build a deterministic 1K batch of `wall.create` events.  Each event has
 * the median wire shape produced by the L2 command-bus PatchEmitter:
 *   • 1 affected store (`wall`).
 *   • 1 forward + 1 inverse JSON-Patch each (the "add wall" pair).
 *   • Audit metadata + ULID + ISO timestamp.
 * No randomness — the bench is reproducible across machines.
 */
function buildSampleBatch(n: number): PersistedEvent[] {
  const out: PersistedEvent[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const wallId = `wall-${i.toString(36)}`;
    const fwd = {
      op: 'add' as const,
      path: ['walls', wallId],
      value: { id: wallId, length: 3.5, height: 2.4, points: [0, 0, 3.5, 0] },
    };
    const inv = { op: 'remove' as const, path: ['walls', wallId] };
    out[i] = {
      seq: i + 1,
      version: PERSISTED_EVENT_VERSION,
      persistedAt: '2026-04-26T10:00:00.000Z',
      event: {
        id: `01HZ${i.toString().padStart(22, '0')}`,
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
      },
    };
  }
  return out;
}

const BATCH_SIZE = 1_000;
const batch = buildSampleBatch(BATCH_SIZE);

interface CodecSize {
  codec: string;
  totalBytes: number;
  avgBytesPerEvent: number;
}

function measureSize(codec: Codec): CodecSize {
  let total = 0;
  for (const ev of batch) total += codec.encode(ev).byteLength;
  return {
    codec: codec.name,
    totalBytes: total,
    avgBytesPerEvent: Number((total / BATCH_SIZE).toFixed(2)),
  };
}

describe('persistence.codec-spike (S03-T8 + S04 byte-budget closure)', () => {
  // S04 D7 byte-budget closure — the v2 aliased codec joins the spike
  // so reviewers can compare json / msgpack-v1 / msgpack-v2 in one
  // report.  v1 stays for back-compat reads (ADR-004 §2 migration path).
  const codecs: Codec[] = [JsonCodec, MsgpackCodec, MsgpackAliasedCodec];
  const sizes: CodecSize[] = codecs.map(measureSize);

  // Emit the bytes-per-event report — this is the headline number the
  // ADR-004 draft cites.  S04 promotes the < 200 B / event check to a
  // hard assertion (the v2 codec MUST land under the target).
  it('emits bytes-per-event report for ADR-004 (v2 closure)', () => {
    const v1Row = sizes.find((s) => s.codec === 'msgpack')!;
    const v2Row = sizes.find((s) => s.codec === 'msgpack-v2')!;
    const jsonRow = sizes.find((s) => s.codec === 'json')!;
    const report = {
      generatedAt: new Date().toISOString(),
      batchSize: BATCH_SIZE,
      results: sizes,
      target: {
        avgBytesPerEventLessThan: 200,
        scope:
          'ADR-004 byte-budget closure — v2 (aliased) codec is the ' +
          'production wire format; v1 retained as legacy reader.',
      },
      gapToTarget: {
        msgpackV1: Number((v1Row.avgBytesPerEvent - 200).toFixed(2)),
        msgpackV2: Number((v2Row.avgBytesPerEvent - 200).toFixed(2)),
        v2ImprovementVsV1: Number(
          (1 - v2Row.avgBytesPerEvent / v1Row.avgBytesPerEvent).toFixed(3),
        ),
        v2VsJsonRatio: Number(
          (v2Row.avgBytesPerEvent / jsonRow.avgBytesPerEvent).toFixed(3),
        ),
      },
    };
    writeFileSync(
      join(RUN_OUTPUT, 'codec-spike-bytes.json'),
      JSON.stringify(report, null, 2),
    );
    for (const s of sizes) {
      expect(s.totalBytes).toBeGreaterThan(0);
      expect(Number.isFinite(s.avgBytesPerEvent)).toBe(true);
    }
    // S04 invariant: the v2 codec MUST close the < 200 B / event budget.
    expect(v2Row.avgBytesPerEvent).toBeLessThan(200);
    // S03 invariant: msgpack-v1 still out-compresses JSON.
    expect(v1Row.avgBytesPerEvent).toBeLessThan(jsonRow.avgBytesPerEvent);
    // S04 invariant: v2 strictly improves on v1 (the optimisations work).
    expect(v2Row.avgBytesPerEvent).toBeLessThan(v1Row.avgBytesPerEvent);
    // eslint-disable-next-line no-console
    console.log(
      `[bench] codec-spike bytes/event — json=${jsonRow.avgBytesPerEvent} ` +
        `msgpack-v1=${v1Row.avgBytesPerEvent} ` +
        `msgpack-v2=${v2Row.avgBytesPerEvent} (target < 200 — v2 closure).`,
    );
  });

  // Per-codec encode + decode percentile benches — these go through the
  // standard `.run-output/<name>.json` channel and are gated by the
  // baseline.  At S03 the warn/budget numbers are loose (~5×–10× headroom
  // over what we observe locally) — S04 ratifies tight numbers in ADR-004.
  for (const codec of codecs) {
    it(`encode-1k-batch — ${codec.name}`, async () => {
      const sample = await measure(
        `persistence.codec-spike.encode.${codec.name}`,
        () => {
          for (const ev of batch) codec.encode(ev);
        },
        // Tight budgets: 50 ms warn / 100 ms budget for an entire 1K batch
        // is generous on Replit's shared CPU; tightens in S04.
        { samples: 30, warmup: 5, warnMs: 50, budgetMs: 100 },
      );
      writeFileSync(
        join(RUN_OUTPUT, `${sample.name}.json`),
        JSON.stringify(sample, null, 2),
      );
      expect(sample.p95).toBeLessThan(sample.budgetMs);
    });

    it(`decode-1k-batch — ${codec.name}`, async () => {
      const encoded = batch.map((ev) => codec.encode(ev));
      const sample = await measure(
        `persistence.codec-spike.decode.${codec.name}`,
        () => {
          for (const bytes of encoded) codec.decode(bytes);
        },
        { samples: 30, warmup: 5, warnMs: 50, budgetMs: 100 },
      );
      writeFileSync(
        join(RUN_OUTPUT, `${sample.name}.json`),
        JSON.stringify(sample, null, 2),
      );
      expect(sample.p95).toBeLessThan(sample.budgetMs);
    });
  }
});
