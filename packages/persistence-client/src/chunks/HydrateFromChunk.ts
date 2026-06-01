// chunks/HydrateFromChunk.ts — chunk bytes → element-state hydration (S21 D5).
//
// Spec source: `docs/00_NEW_ARCHITECTURE/phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S21 line 805 — "session.persistence.loadFromChunk"
//   • S21 line 842 — "this method does not exist yet — it needs to be added
//      to @pryzm/headless in S21 alongside processRebakeJob.  It reads a
//      .glb chunk, decodes element geometry descriptors from extras, and
//      hydrates the element stores (Wall, Slab, Door, etc.) with the state
//      at the time the chunk was produced."
//
// SCOPE NOTE — S21 v0:
// ====================
// Full element-store hydration (Wall, Slab, Door, Window, …) lives with
// the tier-streamed loader (S23) which already has to deserialise chunks
// into THREE.BufferGeometry on the editor side.  S23 ships a single
// hydration codepath consumed by BOTH:
//   1. the editor cold-load path (chunks → THREE meshes)
//   2. the bake worker incremental path (chunks → re-bake input)
//
// In the meantime, this S21 v0 surface returns the descriptor list with
// the chunk hash + optional extras snapshot.  The bake worker uses it
// for diagnostics and cost accounting; the K1D-2 5K-wall production-
// scale check is documented as deferred to S23 D1 (see
// `docs/04-reference/architecture-detail/bake-worker.md` §"Known limitations").
//
// The signature below is FROZEN — when S23 lands the full hydration,
// callers gain new fields on `HydratedChunk` without breaking shape.

import { ChunkReader, type ChunkReadDescriptor } from './ChunkReader.js';

export interface HydrateFromChunkInput {
  readonly bytes: Uint8Array;
  readonly projectId: string;
  readonly levelId: string;
  /** When provided, asserts the bytes hash to this value.  Pass null to skip. */
  readonly expectedHash?: string | null;
}

/**
 * Diagnostic-grade hydration result.  Element-store population (Wall,
 * Slab, …) is deferred to S23; v0 callers receive the descriptor list
 * verbatim from the reader.
 */
export interface HydratedChunk {
  /** SHA-256 hex of the chunk bytes.  Equal to `expectedHash` when verified. */
  readonly hash: string;
  /** Element-keyed geometry descriptors (one per element baked into the chunk). */
  readonly descriptors: readonly ChunkReadDescriptor[];
  /** Element ids the chunk encodes — useful for the bake worker's
   *  delta computation (which walls were already baked vs new). */
  readonly elementIds: readonly string[];
  /** Round-trip diagnostics — the chunk's projectId / levelId echoed
   *  back so callers can sanity-check they got the chunk they asked for. */
  readonly projectId: string;
  readonly levelId: string;
}

/**
 * Read a chunk's bytes back into a hydration result.  Cheap (O(elements))
 * — the ChunkReader does the heavy lifting.  Used by:
 *   • apps/bake-worker/jobs/RebakeChunkJob.ts (S21) — for the incremental
 *     path's "did this element change?" delta check.
 *   • apps/editor/persistence/cold-load.ts (S23) — for the cold-load path,
 *     which augments the result with full store hydration.
 */
export async function hydrateFromChunk(input: HydrateFromChunkInput): Promise<HydratedChunk> {
  const reader = new ChunkReader();
  const result = await reader.read({
    bytes: input.bytes,
    projectId: input.projectId,
    levelId: input.levelId,
    expectedHash: input.expectedHash ?? null,
  });

  return {
    hash: result.hash,
    descriptors: result.descriptors,
    elementIds: result.descriptors.map((d) => d.sourceId),
    projectId: input.projectId,
    levelId: input.levelId,
  };
}
