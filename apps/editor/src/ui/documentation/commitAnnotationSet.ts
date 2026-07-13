// §FEAT-AUTO-DIMENSION-ELEVATION-VIEWS (L-263) — the SHARED commit chokepoint for
// any auto-generated annotation SET (plan dims, elevation dims, and — L-265 — tags).
//
// Extracted verbatim from `applyAutoDimensions` (L-138/L-145/L-162, ADR-0119) so
// the elevation strategy and the auto-tag executor REUSE the proven commit path
// rather than each growing their own. This is the whole point of L-263 §1 ("do not
// fork auto-dimension"): the rule engine differs per view, the COMMIT does not.
//
// WHAT THE COMMIT PATH ACTUALLY IS, AND WHY IT LOOKS LIKE THIS
// ─────────────────────────────────────────────────────────────────────────────
// The canonical RENDER SINK is the SUBSYSTEM `annotationStore` (ADR-0119) — the
// store the singleton `PlanViewAnnotationRenderer` reads. Its mutation + undo are
// owned by the legacy CommandManager protocol. The bus verb `annotation.create` is
// a TEXT-NOTE handler: it writes a FLAT `AnnotationData` (id/viewId/kind) into the
// CQRS `AnnotationsState` and DROPS `geometry2D` + `references`, so routing a
// dimension through it loses the geometry and nothing renders. (See the L-256
// conformance findings: the governed `dimension.*` verbs + `DimensionStore` exist
// and are C16-shaped, but NOTHING renders from them — the rendered dimension is an
// AnnotationElement. That fork is the real defect, and it is recorded as an ADR
// rather than papered over here.)
//
// So a set is committed as:
//   1. ONE composite `CreateManyAnnotationsCommand` (P6 — a command, never a direct
//      store write) inside ONE `batchCoordinator.runBatch` → the whole SET lands on
//      the CommandManager history as a single unit (C11, C24.1 §1.2).
//   2. ONE ring-buffer PatchPair on the `annotation` store, because the UNIFIED undo
//      path (`performUndoRedo.ts`, C03 §4.6 U-5) consults the bus RING FIRST and only
//      falls back to the CommandManager when the ring's top entry is uncovered. After
//      a bus-generated building the ring is full of wall/slab entries, so without this
//      Ctrl-Z would undo those and never reach the annotation set (§FIX-AUTODIM-
//      UNDO-ONE-UNIT, L-162 — the founder's "it undoes the walls but the dimensions
//      remain"). The ring entry's INVERSE removes the set and its FORWARD re-adds it.
// Together: exactly ONE undoable unit, and redo restores it.

import { batchCoordinator } from '@pryzm/core-app-model';
import { CreateManyAnnotationsCommand, type AnnotationElement } from '@pryzm/plugin-annotations';

/** A single RFC-6902 JSON-Patch op as stored in the bus ring buffer. */
interface RingJsonPatchOp { readonly op: 'add' | 'remove'; readonly path: string; readonly value: unknown }
/** Forward/inverse patch pair pushed onto the ring buffer (mirrors PatchPair). */
export interface RingPatchPair {
  readonly forward: { readonly ops: readonly RingJsonPatchOp[] };
  readonly inverse: { readonly ops: readonly RingJsonPatchOp[] };
  readonly affectedStores: readonly string[];
}
/** Minimal ring-buffer surface (avoids importing CommandBus internals). */
interface RingBufferLike { push(pair: RingPatchPair): void }

/** Legacy CommandManager surface — assigned at `window.commandManager` in initTools. */
interface CommandManagerLike { execute(cmd: unknown): unknown }

/**
 * PURE builder for the ring-buffer PatchPair that makes an annotation SET undoable
 * via the unified ring-first undo path.
 *
 * The `annotation` store is a whole-element `Record<id, element>` from the
 * `elementUndoStoreAdapter`'s perspective, so each op is a single-segment pointer:
 *   • FORWARD (redo) → `{ op:'add',    path:'/<id>', value: element }`
 *   • INVERSE (undo) → `{ op:'remove', path:'/<id>' }` (reverse insertion order)
 * `affectedStores: ['annotation']` routes both sides to the SAME subsystem store
 * the plan renderer reads, via `buildUndoStoreMap`.
 *
 * Exported pure so the undo round-trip is unit-testable without a live runtime.
 */
export function buildAnnotationRingUndoPair(
  annotations: readonly { id: string }[],
): RingPatchPair {
  const forwardOps: RingJsonPatchOp[] = annotations.map((el) => ({ op: 'add', path: `/${el.id}`, value: el }));
  // Remove in reverse insertion order so the store returns to its prior state.
  const inverseOps: RingJsonPatchOp[] = [...annotations]
    .reverse()
    .map((el) => ({ op: 'remove', path: `/${el.id}`, value: undefined }));
  return { forward: { ops: forwardOps }, inverse: { ops: inverseOps }, affectedStores: ['annotation'] };
}

/**
 * Push the set's undo entry onto the bus ring buffer. Typed via a narrow local
 * shape — no `(window as any)` (P4). Best-effort: absent in headless/test (no
 * runtime) → silent no-op, and the CommandManager twin remains the fallback owner.
 */
function registerAnnotationRingUndo(annotations: readonly { id: string }[]): void {
  if (annotations.length === 0) return;
  const rb = (window as unknown as { runtime?: { bus?: { ringBuffer?: RingBufferLike } } })
    .runtime?.bus?.ringBuffer;
  if (!rb || typeof rb.push !== 'function') {
    console.warn('[annotation-set] ring buffer unavailable; undo falls to CommandManager only');
    return;
  }
  try { rb.push(buildAnnotationRingUndoPair(annotations)); }
  catch (err) { console.warn('[annotation-set] ring push failed:', err); }
}

/** The live legacy CommandManager (`window.commandManager`, set in initTools). */
function resolveCommandManager(): CommandManagerLike | undefined {
  return (window as unknown as { commandManager?: CommandManagerLike }).commandManager ?? undefined;
}

/**
 * Commit an auto-generated annotation SET as exactly ONE undoable unit.
 *
 * @param annotations  The fully-built AnnotationElements (already view-owned).
 * @param levelIds     Levels the batch touches — drives the batch coordinator's
 *                     invalidation scope. Annotations do not bound rooms, so room
 *                     re-detection is always skipped.
 * @returns `true` when the set was committed; `false` when the command system is
 *          not ready (the caller should tell the user, not fail silently).
 */
export function commitAnnotationSet(
  // §L-268/L-263 — TYPED, NOT STRUCTURAL. This parameter was `readonly { id: string }[]`,
  // which compiles at the call site and then hands `CreateManyAnnotationsCommand` an
  // object that is NOT an AnnotationElement. The command's undo() removes `_added`, so a
  // structurally-typed impostor would commit and then fail to undo cleanly — exactly the
  // class of defect C16 exists to prevent. The command's own signature is the contract:
  // take AnnotationElement, or do not take it at all.
  annotations: readonly AnnotationElement[],
  levelIds: readonly string[],
): boolean {
  if (annotations.length === 0) return false;
  const commandManager = resolveCommandManager();
  if (!commandManager) return false;

  batchCoordinator.runBatch(
    () => { commandManager.execute(new CreateManyAnnotationsCommand(annotations)); },
    { levelIds: [...levelIds], totalElementCount: annotations.length, skipRedetectRooms: true },
  );
  registerAnnotationRingUndo(annotations);
  return true;
}
