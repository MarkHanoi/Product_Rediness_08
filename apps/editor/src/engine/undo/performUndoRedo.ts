// performUndoRedo — THE single undo/redo entry point (C03 §4.6 U-5).
//
// WHY THIS EXISTS (OI-054 — the live "undo doesn't work in plan view" bug)
// ----------------------------------------------------------------------------
// Before this module there were FOUR divergent undo triggers that did NOT agree
// on which stack to consult:
//
//   • SaveUndoRedoHUD button → `commandManager.undo()` ONLY (runtime is null,
//     so it fell to the global commandManager) — it NEVER consulted the
//     CommandBus ring buffer.
//   • initUI keyboard Ctrl+Z → ring-buffer-first, commandManager-fallback.
//   • BimService.undo()      → ring-buffer-first, commandManager-fallback.
//   • ContextualEditBar      → delegates to BimService.undo().
//
// Plan-view element creation is **bus-only** (every PlanToolHandler dispatches
// `runtime.bus.executeCommand(...)`), so a plan-created wall lives ONLY in the
// ring buffer — never in commandManager.history. The 3D tools (WallTool, Slab,
// Roof, Furniture, Plumbing, Stair, Handrail, Beam) **dual-dispatch**: bus AND
// `commandManager.execute(CreateXCommand)`, so a 3D element lives in BOTH stacks.
//
// Net effect of the divergence:
//   • Undo BUTTON on a plan wall  → commandManager.undo() → "history empty"
//     (the live bug the user reported: 18× "UNDO: history empty").
//   • Undo BUTTON on a 3D wall    → commandManager.undo() → worked (it's there).
//
// THE UNIFICATION (C03 §4.6 U-5 — "exactly ONE undo path")
// ----------------------------------------------------------------------------
// Every trigger now calls performUndo()/performRedo(). The single algorithm:
//
//   1. RING-BUFFER FIRST. If the ring buffer has an undoable entry whose
//      affectedStores are ALL covered by the live store map (so the inverse
//      patch can actually apply → drives the 3D mesh + plan projection), apply
//      the inverse patch via the elementUndoStoreAdapter. This is the
//      authoritative path for every bus-created element (plan AND 3D).
//
//   2. SHADOW-DROP. A 3D element is in BOTH stacks (dual-dispatch). After the
//      ring-buffer undo removes it, the orphaned commandManager CreateXCommand
//      would cause a PHANTOM second Ctrl+Z (its undo() finds the element already
//      gone → a no-op that still consumes a keypress). So after a successful
//      ring-buffer undo we drop the matching commandManager history entries by
//      target id (commandManager.dropEntriesForTargets). One action ⇒ one undo.
//
//   3. COMMANDMANAGER FALLBACK. If the ring buffer is empty, the top entry has
//      no real patches (OI-034), or its stores are not covered by the map (we
//      do NOT step the cursor in that case — no desync), fall back to
//      commandManager.undo() — the path for legacy-only operations (levels,
//      hosted door/window openings, auto room-tag annotations).
//
// CROSS-STACK ORDERING (known limitation → ADR-051): the two stacks have
// independent cursors, so a redo after a *mixed* undo sequence can mis-route.
// `_lastSource` mirrors the last undo's stack on the next redo, which covers the
// dominant "undo N then redo N (same stack)" case. The true single-stack end
// state is ADR-051 (one store, derived geometry, one timeline).
//
// CONTRACT: C03 §4 (undo architecture), C10 §2 / P8 (OTel span per exported fn).

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { applyRingBufferSide, fromJsonPointer, type ApplyRingBufferOutcome } from '@pryzm/command-bus';
import type { PatchPair, PatchSide } from '@pryzm/runtime-undo-stack';
import { adaptElementStoreMap, type PatchApplicableAdapter } from './elementUndoStoreAdapter.js';

const _tracer = trace.getTracer('pryzm-engine');

/** The slice of RingBufferUndoStack performUndo/Redo needs. */
interface RingBufferLike {
  canUndo?(): boolean;
  canRedo?(): boolean;
  current?(): PatchPair | null;
  peek?(): PatchPair | null;
  undoPatch?(): PatchSide | null;
  redoPatch?(): PatchSide | null;
}
/** The slice of the legacy CommandManager performUndo/Redo needs. */
interface CommandManagerLike {
  canUndo?(): boolean;
  canRedo?(): boolean;
  undo?(): unknown;
  redo?(): unknown;
  dropEntriesForTargets?(ids: readonly string[]): number;
}

function _rb(): RingBufferLike | undefined {
  return window.runtime?.bus?.ringBuffer as unknown as RingBufferLike | undefined;
}
function _cm(): CommandManagerLike | undefined {
  return (globalThis as { commandManager?: CommandManagerLike }).commandManager;
}

/** Tracks which stack the last undo came from so redo mirrors it (best-effort
 *  cross-stack ordering — see header). */
let _lastSource: 'ring-buffer' | 'commandManager' | null = null;

/**
 * Build the `{ storeKey → applyPatch-adapter }` map the ring-buffer applicator
 * routes inverse/forward patches through. Every legacy element store is adapted
 * so `applyPatch` drives the 3D mesh + plan projection via its own
 * add/remove/update mutators (C03 §4.5; ADR-051). Keys mirror the `affectedStores`
 * a handler may declare (both singular and plural aliases are mapped because
 * different handlers use different conventions). Stores absent on `window`
 * become `undefined` → that store is "not covered" → performUndo falls back to
 * commandManager WITHOUT stepping the ring-buffer cursor.
 *
 * This is the SINGLE source of the undo store map — initUI and BimService both
 * delegate here so the four former trigger paths can never drift again.
 */
export function buildUndoStoreMap(): Record<string, PatchApplicableAdapter | undefined> {
  const w = window as unknown as Record<string, unknown>;
  return {
    ...adaptElementStoreMap({
      wall:           w.wallStore,        walls:        w.wallStore,
      slab:           w.slabStore,        slabs:        w.slabStore,
      room:           w.roomStore,        rooms:        w.roomStore,
      'curtain-wall': w.curtainWallStore, curtainWall:  w.curtainWallStore, curtainWalls: w.curtainWallStore,
      furniture:      w.furnitureStore,
      column:         w.columnStore,      columns:      w.columnStore,
      beam:           w.beamStore,        beams:        w.beamStore,
      stair:          w.stairStore,       stairs:       w.stairStore,
      stairRailing:   w.stairRailingStore,
      stairLanding:   w.stairLandingStore,
      handrail:       w.handrailStore,    handrails:    w.handrailStore,
      roof:           w.roofStore,        roofs:        w.roofStore,
      floor:          w.floorStore,       floors:       w.floorStore,
      ceiling:        w.ceilingStore,     ceilings:     w.ceilingStore,
      plumbing:       w.plumbingStore,
      lighting:       w.lightingStore,
      grid:           w.gridStore,        grids:        w.gridStore,
      annotation:     w.annotationStore,  annotations:  w.annotationStore,
    }),
    // NOTE: door / window / level are intentionally ABSENT. With the `_covered`
    // pre-check, a store key missing from this map is "not covered" → performUndo
    // does NOT step the ring-buffer cursor and falls straight through to
    // commandManager.undo(). That is exactly the desired routing:
    //   • door/window are HOSTED (the opening must also be removed from the host
    //     wall) — the two-part undo lives in the legacy command (ADR-051 follow-up);
    //   • level is spatial authority (Path-A AddLevelCommand / commandManager).
  };
}

/** True when EVERY affected store has a working `applyPatch` adapter in the map.
 *  We require full coverage before stepping the ring-buffer cursor so a partial
 *  apply can never desync the cursor from the visible state (OI-034 hardening). */
function _covered(
  affectedStores: readonly string[],
  map: Readonly<Record<string, PatchApplicableAdapter | undefined>>,
): boolean {
  if (affectedStores.length === 0) return false;
  return affectedStores.every(s => typeof map[s]?.applyPatch === 'function');
}

/** Element ids touched by a PatchPair — `path[0]` of every op (whole-element ops
 *  and field updates both carry the id first). Used to shadow-drop the matching
 *  commandManager entries after a ring-buffer undo. */
function _idsOf(pair: PatchPair | null | undefined): string[] {
  if (!pair) return [];
  const ids = new Set<string>();
  const collect = (side: PatchSide | undefined): void => {
    for (const op of side?.ops ?? []) {
      try {
        const seg = fromJsonPointer(op.path)[0];
        if (seg != null && String(seg).length > 0) ids.add(String(seg));
      } catch { /* malformed pointer — skip */ }
    }
  };
  collect(pair.forward);
  collect(pair.inverse);
  return [...ids];
}

/**
 * §56 observer-pause scaffold — coalesces the RoomTopologyObserver re-detect +
 * WallRebuildCoordinator storm fired by the intermediate store events during a
 * patch apply into ONE re-detect + ONE rebuild on resume. Best-effort (absent
 * globals in headless/test just skip the optimisation). Mirrors
 * CommandManagerImpl._withPausedObservers so the invariant is identical on both
 * the ring-buffer and commandManager paths.
 */
function _withPausedObservers(label: 'UNDO' | 'REDO', body: () => void): void {
  type WallControl = { pause?: () => void; resumeAndFlush?: () => void };
  type TopologyControl = { pause?: () => void; resume?: () => void };
  const wallControl = (window as { __wallRebuildControl?: WallControl }).__wallRebuildControl;
  const topology    = (window as { roomTopologyObserver?: TopologyControl }).roomTopologyObserver;
  try { wallControl?.pause?.(); } catch (err) { console.warn(`[Undo] §56 ${label}: wallControl.pause() failed`, err); }
  try { topology?.pause?.(); }    catch (err) { console.warn(`[Undo] §56 ${label}: topology.pause() failed`, err); }
  try {
    body();
  } finally {
    try { wallControl?.resumeAndFlush?.(); } catch (err) { console.warn(`[Undo] §56 ${label}: wallControl.resumeAndFlush() failed`, err); }
    try { topology?.resume?.(); }            catch (err) { console.warn(`[Undo] §56 ${label}: topology.resume() failed`, err); }
  }
}

/**
 * THE undo entry point. Ring-buffer-first (covers every bus-created element in
 * both plan and 3D), shadow-dropping the matching commandManager entries to
 * prevent phantom double-undo, then commandManager fallback for legacy-only ops.
 * See module header for the full rationale (C03 §4.6 U-5).
 */
export function performUndo(): void {
  _tracer.startActiveSpan('pryzm.undo', (span) => {
    try {
      const rb = _rb();
      const cm = _cm();

      if (rb?.canUndo?.()) {
        const pair = rb.current?.() ?? null;
        const stores = pair?.affectedStores ?? [];
        const map = buildUndoStoreMap();
        if (_covered(stores, map)) {
          const ids = _idsOf(pair);               // capture BEFORE the cursor moves
          const inverseSide = rb.undoPatch?.();    // step cursor back + return inverse
          if (inverseSide) {
            let outcome: ApplyRingBufferOutcome = { applied: [], failed: [] };
            _withPausedObservers('UNDO', () => {
              outcome = applyRingBufferSide(inverseSide, stores, map);
            });
            span.setAttribute('pryzm.undo.path', 'ring-buffer');
            span.setAttribute('pryzm.undo.stores', stores.join(','));
            if (outcome.applied.length > 0) {
              // Shadow-drop the dual-dispatch twin so the user doesn't get a
              // phantom no-op Ctrl+Z for 3D-created elements.
              const dropped = cm?.dropEntriesForTargets?.(ids) ?? 0;
              _lastSource = 'ring-buffer';
              console.log('[Undo] ring-buffer applied — stores:', stores.join(','),
                'ids:', ids.join(','), 'shadow-dropped cm entries:', dropped);
              span.end();
              return;
            }
            // Total failure (no store applied) — safe to fall through: a failed
            // applyRingBufferSide mutated nothing, so commandManager won't double-undo.
            console.warn('[Undo] ring-buffer apply failed (stores:', outcome.failed.join(','),
              ') — falling back to commandManager');
          }
        }
        // Uncovered / empty-patch entry: do NOT consume the cursor — fall through.
      }

      if (cm?.canUndo?.()) {
        cm.undo?.();
        _lastSource = 'commandManager';
        span.setAttribute('pryzm.undo.path', 'commandManager');
        console.log('[Undo] commandManager undo');
      } else {
        span.setAttribute('pryzm.undo.path', 'none');
        console.log('[Undo] nothing to undo (ring buffer + commandManager empty)');
      }
      span.end();
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.end();
    }
  });
}

/**
 * THE redo entry point — mirror of {@link performUndo}. Prefers the stack the
 * last undo came from (`_lastSource`) so "undo N then redo N" round-trips on the
 * same stack; otherwise ring-buffer-first then commandManager.
 */
export function performRedo(): void {
  _tracer.startActiveSpan('pryzm.redo', (span) => {
    try {
      const rb = _rb();
      const cm = _cm();

      const tryRingBuffer = (): boolean => {
        if (!rb?.canRedo?.()) return false;
        const pair = rb.peek?.() ?? null;
        const stores = pair?.affectedStores ?? [];
        const map = buildUndoStoreMap();
        if (!_covered(stores, map)) return false;
        const forwardSide = rb.redoPatch?.();   // step cursor forward + return forward
        if (!forwardSide) return false;
        let outcome: ApplyRingBufferOutcome = { applied: [], failed: [] };
        _withPausedObservers('REDO', () => {
          outcome = applyRingBufferSide(forwardSide, stores, map);
        });
        span.setAttribute('pryzm.redo.path', 'ring-buffer');
        span.setAttribute('pryzm.redo.stores', stores.join(','));
        if (outcome.applied.length > 0) {
          _lastSource = 'ring-buffer';
          console.log('[Redo] ring-buffer applied — stores:', stores.join(','));
          return true;
        }
        console.warn('[Redo] ring-buffer apply failed (stores:', outcome.failed.join(','), ')');
        return false;
      };

      const tryCommandManager = (): boolean => {
        if (!cm?.canRedo?.()) return false;
        cm.redo?.();
        _lastSource = 'commandManager';
        span.setAttribute('pryzm.redo.path', 'commandManager');
        console.log('[Redo] commandManager redo');
        return true;
      };

      // Mirror the last undo's stack first; otherwise ring-buffer-first.
      const order = _lastSource === 'commandManager'
        ? [tryCommandManager, tryRingBuffer]
        : [tryRingBuffer, tryCommandManager];
      if (!order[0]!() && !order[1]!()) {
        span.setAttribute('pryzm.redo.path', 'none');
        console.log('[Redo] nothing to redo (ring buffer + commandManager empty)');
      }
      span.end();
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.end();
    }
  });
}
