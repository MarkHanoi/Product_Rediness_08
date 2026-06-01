// PRYZM 2 — Chunked persistence manifest (S19 D5 interface lock).
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S19 D5 (line 393)  — "interface lock — A presents final
//                          ManifestSchema and ChunkEntry shape ...
//                          this is the critical interface that S21
//                          and S23 depend on."
//   • S19 D7 (line 395)  — `manifest.ts` — Zod schema + CRUD operations.
//   • S19 exit (line 410) — "ManifestSchema + ChunkEntry interface
//                            frozen and committed."
//
// Strategic ADR-013 (`adrs/ADR-013-persistence-operational.md`) and
// SPEC-02-PERSISTENCE.md §6 frame the operational contract; this file
// is the in-code projection.  Once merged, both shapes are FROZEN for
// the v1 chunked format — any breaking change requires bumping
// `schemaVersion` and adding a migration to
// `packages/file-format/migrations/` (S20 D4).
//
// Conflict-resolution note (PHASE-1D vs SPEC-02 §6.3):
//   * SPEC-02 keys chunks by element + analyticHash + LOD
//     (`chunks/<projectId>/<elementId>/<analyticHash>/<lod>.glb`).
//   * PHASE-1D §S19 (line 332) supersedes with chunk-level addressing
//     (`r2://chunks/<projectId>/<hash>.glb`) — multiple elements per
//     chunk, one chunk per (level, version).  This file follows the
//     PHASE-1D §S19 design (more specific implementation).  The
//     per-element `analyticHash` lives inside the chunk's gltf-transform
//     `extras` (see `chunks/ChunkWriter.ts`).

import { z } from 'zod';

// --------------------------------------------------------------------
// ChunkEntry — one row in the manifest.  Every baked chunk produced by
// either the editor (S19) or the bake worker (S21) is described by one
// of these.  The S23 tier-streamed loader walks `chunks` in priority
// order during cold-load.
// --------------------------------------------------------------------

export const ChunkEntrySchema = z.object({
  /** The level this chunk covers.  One chunk per (level, version). */
  levelId: z.string().min(1),
  /**
   * Monotonic version per level.  Bumped each time the bake worker
   * produces a new chunk for that level.  The S23 loader uses the
   * `latestChunkHash` field on the level (below), not the version,
   * to find the current chunk — this field is for diagnostics + the
   * `chunk-history` tools (Phase 2).
   */
  version: z.number().int().nonnegative(),
  /**
   * SHA-256 hex of the chunk's `.glb` bytes (lower-case, 64 chars).
   * Content-addressing: two chunks with identical bytes (e.g. two
   * floors of a hotel with identical wall layouts) share one hash
   * and therefore share one R2 / IndexedDB entry.
   */
  hash: z.string().regex(/^[0-9a-f]{64}$/, 'hash must be 64-char lower-case SHA-256 hex'),
  /** Length of the `.glb` bytes (decompressed at the .glb level — the
   *  Draco / Meshopt compression is INSIDE the .glb).  Used by the
   *  loader to decide eviction order (LRU + size-aware). */
  byteLength: z.number().int().positive(),
  /**
   * Element IDs covered by this chunk.  One entry per element that
   * the chunk's `.glb` carries a primitive for.  The `ChunkReader`
   * uses this to construct the `elementId → THREE.Object3D` map
   * without scanning every primitive's `extras`.
   */
  elementIds: z.array(z.string().min(1)).min(0),
  /**
   * ISO-8601 timestamp of chunk creation.  Used by SPEC-02 §8.2
   * garbage-collection (chunks older than 7 days unreferenced are
   * deletion candidates).
   */
  createdAt: z.string().datetime(),
});
export type ChunkEntry = z.infer<typeof ChunkEntrySchema>;

// --------------------------------------------------------------------
// LevelEntry — per-level metadata.  `latestChunkHash` is the index
// into the chunk store; it is the only field the S23 loader needs to
// fetch the current geometry for that level.
// --------------------------------------------------------------------

export const LevelEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  /** World Y of the level's slab top, metres above site datum. */
  worldY: z.number().finite(),
  /** Elevation above sea level — metres; informational only. */
  elevation: z.number().finite(),
  /** Hash of the level's current chunk; null if the level is empty. */
  latestChunkHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/, 'latestChunkHash must be 64-char lower-case SHA-256 hex')
    .nullable(),
});
export type LevelEntry = z.infer<typeof LevelEntrySchema>;

// --------------------------------------------------------------------
// Manifest — the project-level descriptor.  `schemaVersion` is
// FROZEN at 1 for the alpha; bumping requires a migration in
// `packages/file-format/migrations/` (S20).
// --------------------------------------------------------------------

export const ManifestSchema = z.object({
  /** Bumped on breaking change; today the only legal value is 1. */
  schemaVersion: z.literal(1),
  projectId: z.string().min(1),
  /** Format identifier — string literal so the loader can reject
   *  any non-pryzm file before parsing the rest. */
  formatVersion: z.literal('pryzm-v1'),
  /** All baked chunks, indexed by level + version.  Append-only;
   *  garbage collection runs out-of-band (SPEC-02 §8.2). */
  chunks: z.array(ChunkEntrySchema),
  /** Levels in stack order (lowest worldY first).  The S23 loader
   *  uses positional distance from the visible level to schedule
   *  Tier-3 background loads. */
  levels: z.array(LevelEntrySchema),
  /** Number of events in the project's L0 event log.  Used by the
   *  S23 loader to decide whether to fetch history events on
   *  demand (`eventLogLength === 0` ⇒ skip). */
  eventLogLength: z.number().int().nonnegative(),
  /** ULID of the most recent event the loader expects to see.  null
   *  on a brand-new project before the first command. */
  lastEventId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  /** SHA-256 of the project thumbnail PNG; null until a thumbnail
   *  has been baked (S20 D2 packs it into the .pryzm ZIP). */
  thumbnailHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/, 'thumbnailHash must be 64-char lower-case SHA-256 hex')
    .nullable(),
  /**
   * Per-project feature flags (S31 / Phase 2B).
   *
   * Operational from S31 D1 per
   * `docs/00_NEW_ARCHITECTURE/phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md` §S31 D8:
   * any field defaults to its conservative value so OLDER manifests that
   * pre-date the flag (`schemaVersion === 1` without `featureFlags`) parse
   * unchanged.  The plan-view promotion (S29 skeleton → S31 full impl) is
   * gated by `plan_view_v2`; flipping it `false` falls back to the PRYZM 1
   * plan view without code changes (risk-register R2B-06 mitigation).
   *
   * Adding a new flag here is a NON-breaking change at `schemaVersion: 1`
   * because every flag has a default — it only requires a doc update in
   * `docs/02-decisions/adrs/0023-plan-view-canvas2d-renderer.md` §5.
   */
  featureFlags: z
    .object({
      /**
       * S31 plan-view canvas (full impl).  When `true`, the editor mounts
       * `@pryzm/plugin-plan-view#PlanViewCanvasHost` on the plan-view
       * surface; when `false`, the editor falls back to the PRYZM 1
       * plan-view legacy renderer.  Defaults to `true` for new projects
       * AND for older manifests that omit the field (the new renderer is
       * the supported surface from S31 onward — code-level
       * ADR-0023 §5).
       */
      plan_view_v2: z.boolean().default(true),
      /**
       * S53 D8 Visibility-Intent legacy fallback (Risk-register R3A-04).
       *
       * When `true`, the visibility chain is restricted to waves 1-5 only
       * (the "always-on" PRYZM 1 primitives — level scope, category
       * visibility, view-template inheritance, wall-end joins, opening
       * culling).  Waves 6-11 (filter overrides, phase filter, temporary
       * isolation, element hide, design options, ghost layer) are
       * skipped.
       *
       * Defaults to `false` for ALL projects — new and existing — per
       * S53 D8 ("legacy_vi_fallback flipped to opt-in only").  The flag
       * exists so that if a project hits a regression in one of the
       * waves 6-11, the user can flip it `true` at the manifest level
       * and revert to PRYZM 1 always-on-only behaviour without code
       * changes.
       *
       * Consumed by:
       *   - `apps/editor/src/visibility/runVisibility.ts` — selects
       *     `LEGACY_WAVE_CHAIN` instead of `DEFAULT_WAVE_CHAIN`.
       *   - `packages/visibility/src/waves/index.ts` — exports both
       *     chains; the editor decides which to run.
       */
      legacy_vi_fallback: z.boolean().default(false),
    })
    // NOTE: Zod v4's `.default(value)` does NOT re-parse the value through
    // the inner schema; it returns the value literally.  We therefore pass
    // the FULL default shape so older manifests that omit `featureFlags`
    // round-trip identically through `manifestToJson` → `parseManifest`.
    .default({ plan_view_v2: true, legacy_vi_fallback: false }),
});
export type Manifest = z.infer<typeof ManifestSchema>;

// --------------------------------------------------------------------
// Construction + CRUD helpers (S19 D7).
// --------------------------------------------------------------------

/**
 * Build a fresh manifest for a brand-new project.  `levels` MAY be
 * empty (empty project); `latestChunkHash` is `null` everywhere.
 */
export function createManifest(input: {
  projectId: string;
  levels: ReadonlyArray<Omit<LevelEntry, 'latestChunkHash'>>;
}): Manifest {
  const now = new Date().toISOString();
  return ManifestSchema.parse({
    schemaVersion: 1,
    projectId: input.projectId,
    formatVersion: 'pryzm-v1',
    chunks: [],
    levels: input.levels.map((l) => ({ ...l, latestChunkHash: null })),
    eventLogLength: 0,
    lastEventId: null,
    createdAt: now,
    updatedAt: now,
    thumbnailHash: null,
  });
}

/**
 * Append a freshly-baked chunk to the manifest and update the level's
 * `latestChunkHash` pointer.  Returns a NEW manifest (immutable).
 */
export function addChunk(manifest: Manifest, entry: ChunkEntry): Manifest {
  const next: Manifest = {
    ...manifest,
    chunks: [...manifest.chunks, entry],
    levels: manifest.levels.map((l) =>
      l.id === entry.levelId ? { ...l, latestChunkHash: entry.hash } : l,
    ),
    updatedAt: new Date().toISOString(),
  };
  return ManifestSchema.parse(next);
}

/**
 * Update the event-log pointer.  Called by `EventLog.checkpoint()` (or
 * the bake worker on linearisation) so the loader knows where the
 * tail of the event log is for resync.
 */
export function setLastEvent(
  manifest: Manifest,
  ulid: string | null,
  length: number,
): Manifest {
  return ManifestSchema.parse({
    ...manifest,
    eventLogLength: length,
    lastEventId: ulid,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Find the chunk a loader should fetch for a given level (the latest
 * version).  `null` when the level is empty or its chunk is missing
 * (e.g. been garbage-collected — the loader falls back to client-side
 * baking per SPEC-02 §5.2).
 */
export function chunkForLevel(
  manifest: Manifest,
  levelId: string,
): ChunkEntry | null {
  const level = manifest.levels.find((l) => l.id === levelId);
  if (!level || !level.latestChunkHash) return null;
  // The chunk list is append-only; `findLast` returns the most
  // recently-appended entry for this level (since `latestChunkHash`
  // is updated by `addChunk` only when the entry is new, this is
  // the canonical entry for the current pointer).
  return (
    manifest.chunks
      .filter((c) => c.levelId === levelId && c.hash === level.latestChunkHash)
      .at(-1) ?? null
  );
}

/**
 * Serialise to the JSON form that ships in `.pryzm` ZIPs (S20) and
 * round-trips through `parseManifest`.  Stable key order (object spread
 * on a parsed object preserves Zod's order); no trailing whitespace.
 */
export function manifestToJson(manifest: Manifest): string {
  return JSON.stringify(ManifestSchema.parse(manifest));
}

/** Parse + validate.  Throws `ZodError` on schema mismatch. */
export function parseManifest(raw: string | unknown): Manifest {
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return ManifestSchema.parse(value);
}

/** The frozen interface lock — kept as a runtime constant so the
 *  bake worker can assert it against its own copy (S21 startup). */
export const MANIFEST_SCHEMA_VERSION = 1 as const;
export const MANIFEST_FORMAT_VERSION = 'pryzm-v1' as const;
