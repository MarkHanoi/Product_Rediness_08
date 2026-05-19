// Bench: `bake.incremental.single-wall-edit` — S21 exit gate #1.
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md` §S21
//   • Exit criterion #1 (line 873): "Single wall-edit event → R2 chunk
//      uploaded + signed URL returned in < 1.5 s on a single bake worker
//      (CI gate).  Hard-fail in `apps/bench/scripts/check-regression.mjs`."
//
// What we measure (one sample = one full call):
//   • `bake.incremental.single-wall-edit` — single `wall.create` event
//      → headless bake session → ChunkWriter → InMemoryStorageDriver
//      put + signed URL.  Codec compression OFF (Draco / Meshopt WASM
//      load is the bake-worker cold-start cost; out of scope for the
//      "edit happened, ship a chunk" CI budget).
//
// Methodology:
//   • The ULID for the wall id is built ONCE outside the timed loop —
//     so the bench measures only the bake-pipeline cost (session
//     creation + handler replay + producer + ChunkWriter + storage
//     put + signed URL).
//   • 8 samples + 2 warmup iterations.  The pipeline runs in the low
//     tens of milliseconds locally, but the budget is 1.5 s to leave
//     CI runners 2 orders of magnitude of headroom — exit criterion #1
//     is a "completes in human-perception time" gate, not a tightness
//     test.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeAll } from 'vitest';
import { ulid } from 'ulid';

import { processRebakeJob } from '@pryzm/bake-worker/jobs';
import type { BakeJobData } from '@pryzm/bake-worker/queue';
import { InMemoryStorageDriver } from '@pryzm/storage-driver';

import { measure } from '../timing.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = join(__dirname, '..', '..', '.run-output');
mkdirSync(RUN_OUTPUT, { recursive: true });

// --------------------------------------------------------------------
// Fixture — a single `wall.create` event with a deterministic, schema-
// valid ULID id.  Mirrors `apps/bake-worker/__tests__/RebakeChunkJob.test.ts`.
// --------------------------------------------------------------------

function makeJob(eventId: string, wallId: string): BakeJobData {
  return {
    projectId: 'bench-bake',
    levelId: 'lvl-A',
    previousChunkHash: null,
    eventBatch: [
      {
        id: eventId,
        type: 'wall.create',
        payload: {
          id: wallId,
          levelId: 'lvl-A',
          baseLine: [
            { x: 0, y: 0, z: 0 },
            { x: 4, y: 0, z: 0 },
          ],
          height: 2.7,
          thickness: 0.15,
        },
      },
    ],
  };
}

describe('bake.incremental.single-wall-edit (S21 exit gate #1)', () => {
  let storage: InMemoryStorageDriver;
  let baseEventId: string;
  let baseWallId: string;

  beforeAll(() => {
    storage = new InMemoryStorageDriver();
    baseEventId = ulid();
    // Deterministic — id is `wall_<26-char base32 ULID>`.
    baseWallId = 'wall_01HQZZZZZZZZZZZZZZZZZZZZZZ';
  });

  it('single wall.create → chunk + signed URL — p95 < 1.5 s', async () => {
    let counter = 0;
    const sample = await measure(
      'bake.incremental.single-wall-edit',
      async () => {
        // Use a fresh event id each call so the bus's seq counter
        // doesn't reject duplicates; wall id stays constant since we
        // throw away the session per job.
        counter++;
        const job = makeJob(`${baseEventId.slice(0, -2)}${(counter & 0xff).toString(16).padStart(2, '0').toUpperCase()}`, baseWallId);
        const r = await processRebakeJob(job, { storage, skipCompression: true });
        if (!r.signedUrl || r.byteLength <= 0) {
          throw new Error('bake-incremental: invalid result shape');
        }
      },
      { samples: 8, warmup: 2, warnMs: 1000, budgetMs: 1500 },
    );
    writeFileSync(
      join(RUN_OUTPUT, `${sample.name}.json`),
      JSON.stringify(sample, null, 2) + '\n',
    );
    expect(sample.p95).toBeLessThan(sample.budgetMs);
    // eslint-disable-next-line no-console
    console.log(
      `[bench] bake.incremental.single-wall-edit — p50=${sample.p50}ms ` +
        `p95=${sample.p95}ms (budget=${sample.budgetMs}ms).`,
    );
  }, 30_000);
});
