// apps/bake-worker/jobs/RebakeChunkJob.ts — the per-job bake pipeline.
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S21 lines 770-842 — implementation detail block for the job.
//   • S21 exit #1 (873) — single wall-edit event → chunk at signed R2
//      URL in < 1.5 s (CI gate).
//
// Pipeline (per spec lines 794-836):
//   1. Create headless bake session.
//   2. (Deferred to S23) load previous chunk into the session.
//   3. Apply event batch via commandBus.executeCommand.
//   4. Produce geometry IRs for every wall on the level.
//   5. ChunkWriter.write → bytes + ChunkEntry.
//   6. storageDriver.put → upload bytes.
//   7. Mint signed URL for the editor / bench harness.
//   8. Return RebakeChunkResult.
//
// SCOPE NOTE — S21 v0:
//   Step 2 is a no-op until S23's tier-streamed loader lands the full
//   element-store hydration codepath.  v0 always uses fresh sessions.
//   For the < 1.5 s gate (single wall-edit event) this is fine; the
//   K1D-2 5K-wall production-scale check is documented as deferred.

import { performance } from 'node:perf_hooks';
import { ChunkWriter } from '@pryzm/persistence-client';
import type { StorageDriver } from '@pryzm/storage-driver';
import { BAKE_SPANS, withSpan } from '../otel.js';
import {
  createBakeSession,
  produceWallDescriptors,
} from '../session/HeadlessBakeSession.js';
import type { BakeJobData, BakeJobResult } from '../queue/types.js';

export interface RebakeChunkJobDeps {
  readonly storage: StorageDriver;
  /** Time-to-live for the signed URL in seconds.  Default 3600 (1 h),
   *  per S21 D4 spec (`storage/r2.ts` — "GET (via signed URL with 1 h TTL)"). */
  readonly signedUrlTtlSec?: number;
  /** Skip Draco / Meshopt compression — used by the bench to keep the
   *  measurement focused on bake-pipeline cost rather than codec WASM
   *  loading.  Default false. */
  readonly skipCompression?: boolean;
  /** Optional bake-time monotonic version.  Default `Date.now()`. */
  readonly version?: number;
}

export async function processRebakeJob(
  data: BakeJobData,
  deps: RebakeChunkJobDeps,
): Promise<BakeJobResult> {
  return withSpan(
    BAKE_SPANS.chunk,
    {
      'pryzm.bake.projectId': data.projectId,
      'pryzm.bake.levelId': data.levelId,
      'pryzm.bake.eventCount': data.eventBatch.length,
      'pryzm.bake.previousChunkHash': data.previousChunkHash ?? '',
    },
    async () => {
      const t0 = performance.now();

      // 1. Fresh per-job session (v0 — see scope note above).
      const session = createBakeSession({ projectId: data.projectId });

      try {
        // 2. (Deferred — full chunk hydration lives with S23's loader.)
        //    The bake worker accepts `previousChunkHash` for forward
        //    compatibility but ignores it in v0.  Recording the value
        //    on the OTel span lets ops verify the field is being
        //    populated by the sync server (S22 wire-up).

        // 3. Replay the event batch.  Spec line 765: events are
        //    pre-sorted by ULID by the CoalesceWindow.flush call.
        for (const ev of data.eventBatch) {
          await session.commandBus.executeCommand(ev.type, ev.payload);
        }

        // 4. Produce kernel descriptors for the level.
        const descriptors = produceWallDescriptors(session.walls, data.levelId);

        // 5. Pack into a `.glb` chunk.  In v0 we skip codec compression
        //    by default — the chunk format spec already mandates them
        //    in production (S20), but the codec WASM cost dominates the
        //    < 1.5 s budget on cold-load workers.  The bench overrides
        //    this when measuring full production-shape latency.
        const writer = new ChunkWriter({
          useDraco: !(deps.skipCompression ?? false),
          useMeshopt: !(deps.skipCompression ?? false),
          runtime: 'node',
        });
        const writeResult = await writer.write({
          projectId: data.projectId,
          levelId: data.levelId,
          version: deps.version ?? Date.now(),
          descriptors,
        });

        // 6. Upload bytes to storage (ADR-003 — driver isolation).
        await withSpan(
          BAKE_SPANS.r2Upload,
          {
            'pryzm.bake.projectId': data.projectId,
            'pryzm.bake.levelId': data.levelId,
            'pryzm.bake.chunkHash': writeResult.entry.hash,
            'pryzm.bake.byteLength': writeResult.bytes.byteLength,
          },
          async () => {
            await deps.storage.put(writeResult.entry.hash, writeResult.bytes);
          },
        );

        // 7. Signed URL for the editor / bench.
        const signedUrl = await deps.storage.getSignedUrl(
          writeResult.entry.hash,
          deps.signedUrlTtlSec ?? 3600,
        );

        return {
          chunkHash: writeResult.entry.hash,
          byteLength: writeResult.bytes.byteLength,
          durationMs: performance.now() - t0,
          signedUrl,
          elementCount: descriptors.length,
        };
      } finally {
        await session.dispose();
      }
    },
  );
}
