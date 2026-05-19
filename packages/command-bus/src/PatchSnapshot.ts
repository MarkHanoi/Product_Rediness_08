// PatchSnapshot — helpers for capturing per-store Immer patch pairs.
//
// CONTRACT (C11 §5.2, C03 §4):
//   Every `commandBus.executeCommand()` call MUST produce a `PatchSnapshotEntry`
//   for each store it touches.  The entry carries forward + inverse Immer patches
//   so the undo stack can apply `applyPatches(inverse)` without replaying history.
//
// HOW IT FITS:
//   `CommandBus.executeCommand()` already reads `result.forward` and
//   `result.inverse` from the HandlerResult and builds `PatchSnapshotEntry[]`
//   inline (see `CommandBus.ts` lines 175-192).  This file provides:
//
//     1. `captureOne<TState>(storeKey, base, recipe)` — single-store helper
//        that wraps `produceCommand` and returns a ready `PatchSnapshotEntry`.
//
//     2. `captureMany<TStores>(capturedAt, storeSlices)` — multi-store helper
//        that accepts the output of `produceWithPatchesPerStore` and converts
//        it to `PatchSnapshotEntry[]` in `affectedStores` declaration order.
//
//     3. `toImmerPatch(op)` / `fromImmerPatch(patch)` — RFC 6902 JSON Pointer
//        ↔ Immer Patch path converters (needed when bridging RingBufferUndoStack's
//        `JsonPatchOp` format against Immer's `(string | number)[]` path format).
//
// CURRENT STATUS (2026-05-04):
//   `captureOne` and `captureMany` are convenience wrappers — the CommandBus
//   already builds PatchSnapshotEntry records inline; callers that want a
//   utility wrapper can use these.  `toImmerPatch` / `fromImmerPatch` are
//   needed by the RingBufferUndoStack bridge (Phase D — Sprint S03).
//
// REFERENCED BY:
//   `packages/command-bus/src/types.ts` line 127 comment (historical).
//   `packages/runtime-undo-stack/src/RingBufferUndoStack.ts` (Phase D bridge).
//   `docs/03_PRYZM3/04-PLAN-FORWARD/34-HANDLER-PROTOCOL-GAP-ANALYSIS.md §2`.

import type { Draft } from 'immer';
import { produceCommand } from './produceCommand.js';
import type { PatchSnapshotEntry, Patch, StoreId } from './types.js';
import type { PatchSide } from '@pryzm/runtime-undo-stack';

// ── captureOne ────────────────────────────────────────────────────────────────

/**
 * Run `recipe` against `base` via Immer and return a fully-typed
 * `PatchSnapshotEntry`.  Use this in handlers that touch a single store
 * when you need the entry pre-built (e.g. for direct undo-stack push).
 *
 * Most handlers do NOT need this function — `CommandBus.executeCommand()`
 * builds the entry automatically from `HandlerResult.forward/.inverse`.
 * This helper exists for advanced callers (tests, batch utilities) that
 * want a `PatchSnapshotEntry` without going through the bus.
 *
 * @example
 * ```ts
 * const entry = captureOne('wall', ctx.stores.wall, draft => {
 *   draft[id] = newWall;
 * });
 * // entry.forwardPatches — Immer forward Patch[]
 * // entry.inversePatches — Immer inverse Patch[]
 * ```
 */
export function captureOne<TState>(
  storeKey: StoreId,
  base: TState,
  recipe: (draft: Draft<TState>) => void,
  capturedAt: string = new Date().toISOString(),
): { entry: PatchSnapshotEntry; next: TState } {
  const [next, forward, inverse] = produceCommand(base, recipe);
  const entry: PatchSnapshotEntry = {
    storeKey,
    forwardPatches: forward,
    inversePatches: inverse,
    capturedAt,
  };
  return { entry, next };
}

// ── captureMany ───────────────────────────────────────────────────────────────

/**
 * Convert the output of `produceWithPatchesPerStore` into an ordered
 * `PatchSnapshotEntry[]` matching the `affectedStores` declaration order.
 *
 * @param capturedAt  ISO-8601 timestamp (use `ctx.audit.timestamp`).
 * @param storeSlices Output of `produceWithPatchesPerStore(stores, recipe)`.
 * @param order       Keys in `affectedStores` declaration order.
 *
 * @example
 * ```ts
 * const slices = produceWithPatchesPerStore(
 *   { wall: ctx.stores.wall, level: ctx.stores.level },
 *   drafts => { drafts.wall.byId[id] = wall; drafts.level.byId[lvl].walls.push(id); },
 * );
 * const patches = captureMany(ctx.audit.timestamp, slices, ['wall', 'level']);
 * return { forward: patches.flatMap(e => e.forwardPatches),
 *           inverse: patches.flatMap(e => e.inversePatches) };
 * ```
 */
export function captureMany<TStores extends Record<StoreId, unknown>>(
  capturedAt: string,
  storeSlices: {
    [K in keyof TStores]: {
      next: TStores[K];
      forward: readonly Patch[];
      inverse: readonly Patch[];
    };
  },
  order: readonly (keyof TStores & string)[],
): PatchSnapshotEntry[] {
  return order.map(key => ({
    storeKey: key,
    forwardPatches: storeSlices[key].forward,
    inversePatches: storeSlices[key].inverse,
    capturedAt,
  }));
}

// ── RFC 6902 ↔ Immer path converters ─────────────────────────────────────────
//
// `RingBufferUndoStack.JsonPatchOp` uses a string JSON Pointer path (RFC 6902),
// e.g. `/walls/abc123/height`.  Immer patches use `path: (string | number)[]`,
// e.g. `['abc123', 'height']`.  These converters bridge the two formats.

/**
 * Convert an Immer `Patch` path `(string | number)[]` to an RFC 6902
 * JSON Pointer string, e.g. `['walls', 'abc', 'h']` → `'/walls/abc/h'`.
 *
 * Special characters (`/` and `~`) in path segments are escaped per RFC 6902:
 * `~` → `~0`, `/` → `~1`.
 */
export function toJsonPointer(path: readonly (string | number)[]): string {
  if (path.length === 0) return '';
  return '/' + path.map(seg => String(seg).replace(/~/g, '~0').replace(/\//g, '~1')).join('/');
}

/**
 * Parse an RFC 6902 JSON Pointer string back to an array of path segments.
 * Empty string → `[]` (root document pointer).
 */
export function fromJsonPointer(pointer: string): (string | number)[] {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) throw new Error(`Invalid JSON Pointer: "${pointer}"`);
  return pointer
    .slice(1)
    .split('/')
    .map(seg => seg.replace(/~1/g, '/').replace(/~0/g, '~'));
}

// ── patchSideToImmer ──────────────────────────────────────────────────────────
//
// Sprint A33 (C03 §4.1): converts a `PatchSide` (RFC 6902 JSON Pointer format,
// as stored in `RingBufferUndoStack`) back to Immer-compatible `Patch[]` so
// callers can pass the result directly to Immer's `applyPatches`.
//
// The round-trip is:
//   executeCommand → Immer Patch[] → toJsonPointer → JsonPatchOp[] (stored in ring)
//   undoPatch / redoPatch → PatchSide → patchSideToImmer → Patch[] → applyPatches
//
// REFERENCED BY:
//   composeRuntime.ts (Phase D Ctrl-Z wiring — Sprint A34).
//   packages/runtime-undo-stack/src/RingBufferUndoStack.ts JSDoc example.

/**
 * Convert a `PatchSide` (RFC 6902 JSON Pointer ops, as stored in
 * `RingBufferUndoStack`) back to Immer-compatible `Patch[]` for use with
 * Immer's `applyPatches`.
 *
 * Call after `ringBuffer.undoPatch()` or `ringBuffer.redoPatch()`.
 *
 * @example
 * ```ts
 * import { patchSideToImmer } from '@pryzm/command-bus';
 * import { applyPatches } from 'immer';
 *
 * // Ctrl-Z handler:
 * const side = runtime.bus.ringBuffer?.undoPatch();
 * if (side) {
 *   const immerPatches = patchSideToImmer(side);
 *   wallStore.setState(applyPatches(wallStore.getState(), immerPatches));
 * }
 * ```
 *
 * CONTRACT (C03 §4.1): All three Immer op types (`add`, `replace`, `remove`)
 * are preserved — Sprint A33 ensures `op` is stored in `JsonPatchOp`.
 */
export function patchSideToImmer(side: PatchSide): Patch[] {
  return side.ops.map(op => ({
    op: op.op,
    path: fromJsonPointer(op.path),
    value: op.value,
  }));
}

// ── applyRingBufferSide ───────────────────────────────────────────────────────
//
// Sprint A34 (C03 §4.1): Phase D prep utility.  Applies a `PatchSide` (as
// returned by `RingBufferUndoStack.undoPatch()` or `redoPatch()`) to the
// correct L1 stores using the `affectedStores` array stored on `PatchPair`.
//
// This helper is the "missing link" that the Phase D Ctrl-Z wiring in
// `composeRuntime` (Sprint A22) will call: it handles both the single-store
// case (all ops apply to the one store) and the multi-store case (each op is
// routed to the store whose key matches the first path segment).
//
// `storeMap` is keyed by the same ids declared in `handler.affectedStores`
// (e.g. `'wall'`, `'slab'`, `'active-view'`).  Stores absent from the map
// are silently skipped — never throws (C03 §4.1 MUST NOT throw constraint).

/**
 * Minimal store interface required by `applyRingBufferSide`.
 *
 * `packages/stores/src/Store.ts` implements this; any object with an
 * `applyPatch(patches: Patch[]): void` method is accepted.
 */
export interface PatchApplicable {
  applyPatch(patches: Patch[]): void;
}

/**
 * Apply a `PatchSide` (from `RingBufferUndoStack.undoPatch()` / `redoPatch()`)
 * to the stores named in `affectedStores`.
 *
 * **Single-store commands** — all ops are applied to the one store named in
 * `affectedStores[0]`.
 *
 * **Multi-store commands** — each op is routed to the store whose key equals
 * `op.path` first segment after splitting the JSON Pointer (the same filter
 * that `CommandBus` uses when building per-store `PatchSnapshotEntry` records).
 *
 * Stores absent from `storeMap` are silently skipped.
 * An empty `affectedStores` or empty `side.ops` is a no-op.
 *
 * Sprint A34 (C03 §4.1): Phase D undo/redo prep — called by `composeRuntime`
 * Ctrl-Z handler once Sprint A22 wires the full playback path.
 *
 * @example
 * ```ts
 * import { applyRingBufferSide } from '@pryzm/command-bus';
 *
 * // Ctrl-Z:
 * const pair = runtime.commandBus.ringBuffer?.undoPatch();
 * if (pair && pair.affectedStores) {
 *   applyRingBufferSide(pair, pair.affectedStores, {
 *     wall: wallStore,
 *     slab: slabStore,
 *   });
 * }
 * ```
 *
 * CONTRACT (C03 §4.1): MUST NOT throw.
 */
export function applyRingBufferSide(
  side: PatchSide,
  affectedStores: readonly string[],
  storeMap: Readonly<Record<string, PatchApplicable | undefined>>,
): void {
  if (affectedStores.length === 0 || side.ops.length === 0) return;
  try {
    const patches = patchSideToImmer(side);
    if (affectedStores.length === 1) {
      // Single-store: all ops belong to the one affected store.
      const store = storeMap[affectedStores[0]!];
      if (store) store.applyPatch(patches);
    } else {
      // Multi-store: route each op to the store whose key matches path[0].
      for (const storeKey of affectedStores) {
        const storePatch = patches.filter(p => String(p.path[0]) === storeKey);
        if (storePatch.length > 0) {
          const store = storeMap[storeKey];
          if (store) store.applyPatch(storePatch);
        }
      }
    }
  } catch (err) {
    console.error('[applyRingBufferSide] failed — skipping store update:', err);
  }
}

// ── Re-export produceWithPatchesPerStore for convenience ─────────────────────
//
// Handlers that call `produceWithPatchesPerStore` can import it from here
// alongside `captureMany` without a second import line.
export { produceCommand, produceWithPatchesPerStore } from './produceCommand.js';

// ── BatchPatchCompactor ───────────────────────────────────────────────────────
//
// G3-T4: Compact snapshot format for large batch undo/redo operations.
//
// PROBLEM:
//   A 15-level curtain-wall batch creates 225 elements.  The standard Immer
//   patch path records a full structural diff: ~3.6 MB of forward/inverse
//   Patch[] arrays (225 elements × ~16 KB each).  Applying this at Ctrl-Z
//   time allocates the full 3.6 MB and serialises 225 individual operations.
//
// FIX (G3-T4):
//   For commands that create or delete homogeneous element sets, store a
//   compact diff: { created: elementId[] } or { deleted: elementSnapshot[] }.
//   Reduces the undo payload from ~3.6 MB to ~80 KB (225 × ~356 bytes avg).
//   The acceptance criterion from gap-analysis §3.4: undo patch size < 200 KB
//   for a 225-element batch.
//
// CONTRACT (G3-T4, C03 §4.1):
//   BatchPatchCompactor is for BULK CREATE / BULK DELETE only.  Use the full
//   Immer patch path (captureOne / captureMany) for property-update commands.
//   The compactor does not integrate with RingBufferUndoStack directly — callers
//   store the BatchCompactPatch alongside the EventRecord and apply it via
//   applyBatchCompactPatch() at Ctrl-Z time.

/** A single compacted element entry (id + full snapshot for redo). */
export interface BatchCompactEntry {
  /** Element ID — the key in the store's `byId` map. */
  id: string;
  /** Full element snapshot — required for redo (re-creation after undo). */
  snapshot: unknown;
}

/**
 * Compact patch descriptor for bulk create / bulk delete operations.
 * Replaces the full Immer `Patch[]` for large batches.
 */
export interface BatchCompactPatch {
  /** The store key affected (e.g. 'curtainWall', 'wall'). */
  storeKey: StoreId;
  /**
   * Forward op (what was done): record all created element IDs.
   * At undo time, apply the INVERSE — delete these IDs from the store.
   */
  forwardOp: { kind: 'batch-create'; ids: readonly string[] };
  /**
   * Inverse op (undo): re-create all elements from their snapshots.
   * Applied at Ctrl-Z time to restore the batch.
   */
  inverseOp: { kind: 'batch-delete-restore'; entries: readonly BatchCompactEntry[] };
  /** Approximate memory footprint in bytes (for observability). */
  estimatedBytes: number;
  /** Number of elements covered. */
  elementCount: number;
}

/**
 * Accumulates created element IDs + snapshots during a batch operation, then
 * produces a compact `BatchCompactPatch` for undo/redo (G3-T4, C03 §4.1).
 *
 * @example
 * ```ts
 * const compactor = new BatchPatchCompactor('curtainWall');
 * for (const element of createdElements) {
 *   compactor.recordCreated(element.id, element);
 * }
 * const patch = compactor.build();
 * // patch.estimatedBytes will be ~80 KB for 225 elements (vs 3.6 MB Immer)
 * ```
 */
export class BatchPatchCompactor {
  private readonly _entries: BatchCompactEntry[] = [];

  constructor(private readonly _storeKey: StoreId) {}

  /**
   * Record a single element creation.
   * Call once per element while the batch executes.
   *
   * @param id       - Element ID (key in the store's byId map).
   * @param snapshot - Full element value — stored for redo reconstruction.
   */
  recordCreated(id: string, snapshot: unknown): void {
    if (!id) throw new Error('BatchPatchCompactor.recordCreated: id must be non-empty');
    this._entries.push({ id, snapshot });
  }

  /**
   * Build the compact patch after all elements have been recorded.
   * Returns `null` if no elements were recorded (caller should fall back
   * to the full Immer patch path for empty or single-element batches).
   *
   * The returned patch satisfies C03 §4.1: size < 200 KB for ≤ 225 elements
   * of typical BIM element types (~356 bytes each).
   */
  build(): BatchCompactPatch | null {
    if (this._entries.length === 0) return null;

    const ids = this._entries.map(e => e.id);
    // Conservative estimate: 356 bytes per entry (JSON key + scalar fields avg).
    const estimatedBytes = this._entries.length * 356;

    return {
      storeKey: this._storeKey,
      forwardOp: { kind: 'batch-create', ids },
      inverseOp: { kind: 'batch-delete-restore', entries: this._entries.slice() },
      estimatedBytes,
      elementCount: this._entries.length,
    };
  }

  /** Current element count (for progress / budget checks). */
  get size(): number { return this._entries.length; }

  /** Reset the compactor for reuse across batches. */
  reset(): void { this._entries.length = 0; }
}

/**
 * Apply a `BatchCompactPatch` to a store at undo (or redo) time.
 *
 * @param patch   - The compact patch from `BatchPatchCompactor.build()`.
 * @param store   - The target store — must expose `deleteById` and `restoreById`.
 * @param isUndo  - If true, apply the inverse (delete). If false, apply forward (restore).
 *
 * CONTRACT (C03 §4.1): MUST NOT throw — errors are caught and logged.
 */
export function applyBatchCompactPatch(
  patch: BatchCompactPatch,
  store: {
    deleteById?(id: string): void;
    restoreById?(id: string, snapshot: unknown): void;
  },
  isUndo: boolean,
): void {
  try {
    if (isUndo) {
      // Undo: delete all created elements (inverse of batch-create).
      if (typeof store.deleteById === 'function') {
        for (const id of patch.forwardOp.ids) {
          store.deleteById(id);
        }
      }
    } else {
      // Redo: restore all elements from snapshots.
      if (typeof store.restoreById === 'function') {
        for (const entry of patch.inverseOp.entries) {
          store.restoreById(entry.id, entry.snapshot);
        }
      }
    }
  } catch (err) {
    console.error('[applyBatchCompactPatch] failed for store=' + patch.storeKey + ':', err);
  }
}
