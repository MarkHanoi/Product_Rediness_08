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
// CROSS-STACK ORDERING (§UNDO-CROSS-STACK-ORDER — C03 §4.7 follow-up 2): the two
// stacks have independent cursors. Both now carry commit timestamps
// (`PatchPair.timestamp` stamped by CommandBus at push; `command.timestamp` at
// construction), and performUndo/performRedo order across the stacks
// chronologically — undo reverts the NEWEST pending entry, redo replays the
// OLDEST. This is what a single timeline would do, and it fixes the
// founder-reported "Ctrl+Z jumps over a just-created door/window" bug (a 3D
// door is commandManager-ONLY, so ring-buffer-first undid the older wall
// beneath it). When either timestamp is missing (legacy fixtures), behaviour
// falls back to ring-buffer-first + `_lastSource` mirroring. The true
// single-stack end state remains ADR-0251 (one store, derived geometry, one
// timeline).
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
  /** §UNDO-CROSS-STACK-ORDER — read-only peeks at the top entry (no cursor moves). */
  peekUndoTimestamp?(): number | null;
  peekRedoTimestamp?(): number | null;
  peekUndoTargetIds?(): readonly string[];
}

function _rb(): RingBufferLike | undefined {
  return window.runtime?.bus?.ringBuffer as unknown as RingBufferLike | undefined;
}
function _cm(): CommandManagerLike | undefined {
  return (globalThis as { commandManager?: CommandManagerLike }).commandManager;
}

/** Tracks which stack the last undo came from so redo mirrors it (best-effort
 *  cross-stack ordering fallback when timestamps are unavailable — see header). */
let _lastSource: 'ring-buffer' | 'commandManager' | null = null;

/**
 * §UNDO-CROSS-STACK-ORDER (C03 §4.5, closes the undo half of §4.7 follow-up 2).
 *
 * THE BUG THIS FIXES (founder-reported, hosted openings — C15): a 3D-placed
 * door/window is commandManager-ONLY (`DoorTool`/`WindowTool` →
 * `cm.execute(new CreateWallOpeningCommand(...))`, no bus dispatch), while the
 * wall it sits in is a ring-buffer entry. Ring-buffer-FIRST routing then made
 * Ctrl+Z undo the OLDER wall entry and "jump over" the newer door — and the
 * shadow-drop pass destroyed the door's ADD_OPENING entry as a false twin.
 *
 * FIX: when BOTH stacks have an undoable entry and BOTH carry a commit
 * timestamp (`PatchPair.timestamp`, stamped by CommandBus at push;
 * `command.timestamp`, stamped at construction — the same Date.now() clock),
 * undo the NEWER one first: reverse chronological order across stacks, exactly
 * what a single-timeline stack (ADR-0251 end-state) would do. When either
 * timestamp is missing (legacy fixtures, pre-existing sessions) behaviour is
 * unchanged: ring-buffer first.
 *
 * SAME-GESTURE GUARD (load-bearing). The 8+ DUAL-DISPATCH tools (WallTool, Slab,
 * Roof, Furniture, Plumbing, Stair, Handrail, Beam, Room, annotations) put ONE
 * gesture in BOTH stacks, and the two halves are stamped milliseconds apart in
 * either order. Routing such a pair by timestamp would undo the legacy twin
 * first and leave the ring-buffer entry behind as a phantom keypress — the very
 * bug U-8 exists to kill. So the chronological rule applies ONLY when the two
 * top entries are NOT the same gesture; see {@link _isSameGestureTwin}.
 */
function _cmEntryIsNewer(
  pair: PatchPair | null,
  cm: CommandManagerLike | undefined,
): boolean {
  const pairTime = pair?.timestamp;
  if (typeof pairTime !== 'number') return false;
  if (!cm?.canUndo?.()) return false;
  const cmTime = cm.peekUndoTimestamp?.();
  if (typeof cmTime !== 'number' || cmTime <= pairTime) return false;
  if (_isSameGestureTwin(pair, cm.peekUndoTargetIds?.() ?? [], pairTime, cmTime)) return false;
  return true;
}

/**
 * §UNDO-SAME-GESTURE (L-690) — the widest same-gesture window a DUAL-DISPATCH
 * pair can straddle, in ms.
 *
 * A twin's two halves are produced inside ONE synchronous dispatch (WallTool
 * pushes `wall.create` to the bus and then constructs `CreateWallCommand` ten
 * lines later; the `initBusHandlers` gizmo bridges compute their `undoPatch` and
 * run `_cmExec` in the same handler call). Both stamps come from the same
 * `Date.now()` clock, so their delta is bounded by the gesture's own synchronous
 * duration — single-digit ms in practice. Two DELIBERATE user actions are
 * separated by at least a selection plus a click or keystroke.
 *
 * 250 ms sits an order of magnitude above the first and well below the second.
 * The failure modes are deliberately asymmetric: too small only ever costs a
 * phantom no-op keypress (annoying, recoverable), while too large restores the
 * silent element-destruction this constant exists to prevent.
 *
 * This is the one heuristic left in the routing, and it exists only because the
 * two stacks carry no shared GESTURE identity. The principled replacement is a
 * gesture/commit id stamped on both `PatchPair` and `Command` — see the C03
 * §4.6 U-10 amendment proposed with this change, and ADR-0251, which removes the
 * question entirely by collapsing to one stack.
 */
const _SAME_GESTURE_WINDOW_MS = 250;

/**
 * §UNDO-SAME-GESTURE (L-690) — is the legacy stack's top entry the SAME GESTURE
 * as the ring buffer's top entry (a dual-dispatch twin), rather than a distinct
 * later action that merely touches the same elements?
 *
 * THE BUG THIS FIXES (found by audit, two live shapes). The guard previously
 * asked only "do the legacy entry's `targetIds` INTERSECT the ids in the ring
 * buffer's top patch?" — and answered "intersect ⇒ twin". That inference is
 * unsound: an intersection is not a twin relation. EVERY later
 * commandManager-only edit of an element that was CREATED on the ring buffer
 * intersects it too, and there are ~70 such bridges in `initBusHandlers`
 * (`stores: []` → no PatchPair): `wall.updateColor`, `slab.updateDimensions`,
 * `element.changeType`, `door.setOffset`, `level.*`, `view.*`, `grid.*`, …
 *
 *   Shape 1 — parameter edit. Draw a wall in PLAN (ring buffer ONLY), then
 *   change its colour from the property panel (commandManager ONLY). Ctrl+Z read
 *   the colour edit as the wall-create's twin, ran ring-buffer-first, and
 *   **deleted the wall**; the shadow-drop then found the colour entry fully
 *   orphaned and removed it from `history` AND `redoStack`. One keypress, the
 *   wrong element destroyed, and a user step erased from the timeline.
 *
 *   Shape 2 — hosted opening (the `bffa20df` family). A door placed in a
 *   PLAN-drawn wall is a commandManager-only `CreateWallOpeningCommand` whose
 *   post-U-9 `targetIds` are `[wallId, doorId]`. Those intersect the wall's ring
 *   entry, so U-10's ordering never engaged and Ctrl+Z still jumped over the
 *   door to undo the wall beneath it. U-9's widening stopped the door's entry
 *   being DESTROYED, but did not fix the ORDER.
 *
 * THE PREDICATE. Two independent conditions, both necessary:
 *
 *   (a) SUBSET, not intersection — `cmTargets ⊆ rbIds`. This is exactly the
 *       predicate `CommandManagerImpl.dropEntriesForTargets` uses to identify
 *       the twin it drops, so the ordering decision and the drop decision now
 *       agree by construction (they disagreed before, which is what let shape 2
 *       through). An entry naming an element the ring patch never touched cannot
 *       be that patch's twin. Closes shape 2.
 *
 *   (b) SAME GESTURE IN TIME — the two commits are within
 *       {@link _SAME_GESTURE_WINDOW_MS}. A twin is produced inside one
 *       synchronous dispatch; a later edit is a separate user action. Closes
 *       shape 1, which (a) alone cannot: a whole-element create and a later
 *       single-element edit have identical id sets.
 *
 * Both conditions only ever NARROW the twin class, i.e. hand more cases to the
 * chronological rule U-10 already mandates. Neither can newly classify an
 * unrelated pair AS a twin, so no case that routed correctly before can regress.
 *
 * An entry with no declared `targetIds` is not treated as a twin — matching
 * `dropEntriesForTargets`, which never drops such an entry either.
 */
function _isSameGestureTwin(
  pair: PatchPair | null,
  cmTargets: readonly string[],
  pairTime: number,
  cmTime: number,
): boolean {
  if (cmTargets.length === 0) return false;
  if (Math.abs(cmTime - pairTime) > _SAME_GESTURE_WINDOW_MS) return false;
  const rbIds = new Set(_idsOf(pair));
  return cmTargets.every(id => rbIds.has(id));
}

/**
 * §UNDO-NO-PHANTOM (L-691) — did a legacy `undo()` / `redo()` actually do
 * something?
 *
 * `CommandManager.undo()` returns `null` when its history is empty and a
 * `CommandResult` with `success: false` when the command's own inverse refused
 * (a `canExecute` rejection on redo, a store that no longer holds the element).
 * Both are "this keypress achieved nothing". Treating them as success consumed
 * the user's Ctrl+Z and — worse — suppressed the ring-buffer entry underneath
 * that COULD have been reverted (C03 §4.6 U-4: a swallowed failure must be
 * reported to the caller, never logged as success).
 *
 * `undefined` reads as success: the duck-typed `CommandManagerLike` seam allows
 * implementations that return nothing, and inventing a failure for them would
 * double-undo.
 */
function _cmDidWork(result: unknown): boolean {
  if (result === null) return false;
  if (typeof result === 'object' && result !== null && 'success' in result) {
    return (result as { success?: unknown }).success !== false;
  }
  return true;
}

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
      // Curtain wall: the bus handler declares affectedStores=['curtainwall'] (one
      // word, lowercase) — that EXACT key MUST be present or curtain-wall undo falls
      // to commandManager ("history empty"), the identical bug walls had (OI-054
      // all-elements audit). The hyphen/camel spellings are kept for legacy callers.
      curtainwall:    w.curtainWallStore,
      'curtain-wall': w.curtainWallStore, curtainWall:  w.curtainWallStore, curtainWalls: w.curtainWallStore,
      curtainPanel:   w.curtainPanelStore,
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
      // §FEAT-SWIMMING-POOL-ELEMENT (L-292 / ADR-0124). `pool.create` declares FOUR
      // affectedStores — ['pool','wall','slab','water'] — and `_covered()` requires
      // EVERY one to have an adapter before the ring-buffer cursor is stepped. Omit
      // either of these two and a pool undo silently falls through to commandManager
      // ("history empty") — the identical bug walls and curtain walls each shipped
      // once (OI-054). `wall` and `slab` are already above; these complete the set.
      pool:           w.poolStore,        pools:        w.poolStore,
      water:          w.waterStore,       waters:       w.waterStore,
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
        // §UNDO-CROSS-STACK-ORDER — if the legacy stack's top entry is NEWER than
        // the ring buffer's top entry, undo it first (reverse chronological order
        // across both stacks). This is what routes a commandManager-only hosted
        // door/window (ADD_OPENING) to its own undo instead of being jumped over
        // by the older ring-buffer entry beneath it. Cursor untouched — safe.
        if (_cmEntryIsNewer(pair, cm)) {
          // §UNDO-NO-PHANTOM (L-691) — only consume the keypress if the legacy
          // undo actually reverted something; a refusal must fall through to the
          // ring-buffer entry underneath rather than no-op the user's Ctrl+Z.
          if (_cmDidWork(cm?.undo?.())) {
            _lastSource = 'commandManager';
            span.setAttribute('pryzm.undo.path', 'commandManager-newer');
            console.log('[Undo] commandManager undo (newer than ring-buffer top — cross-stack order)');
            span.end();
            return;
          }
          console.warn('[Undo] commandManager undo reported no work — falling through to the ring buffer');
        }
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
        console.warn('[Redo] ring-buffer apply failed (stores:', outcome.failed.join(','), ') — applied nothing');
        return false;
      };

      const tryCommandManager = (): boolean => {
        if (!cm?.canRedo?.()) return false;
        // §UNDO-NO-PHANTOM (L-691) — mirror of performUndo. A legacy redo whose
        // command refuses (canExecute rejection, element gone) must NOT report
        // success: doing so both ate the keypress and suppressed the ring-buffer
        // redo that was still pending (C03 §4.6 U-4).
        if (!_cmDidWork(cm.redo?.())) {
          console.warn('[Redo] commandManager redo reported no work — trying the ring buffer');
          return false;
        }
        _lastSource = 'commandManager';
        span.setAttribute('pryzm.redo.path', 'commandManager');
        console.log('[Redo] commandManager redo');
        return true;
      };

      // §UNDO-CROSS-STACK-ORDER — redo replays FORWARD chronological order: when
      // both stacks have a pending redo and both carry commit timestamps, the
      // OLDER entry replays first (the mirror of undo-newest-first). Without
      // timestamps, fall back to mirroring the last undo's stack (_lastSource).
      const rbNextTime = rb?.canRedo?.() ? (rb.peek?.() ?? null)?.timestamp : undefined;
      const cmNextTime = cm?.canRedo?.() ? cm.peekRedoTimestamp?.() : null;
      const haveBothTimes = typeof rbNextTime === 'number' && typeof cmNextTime === 'number';
      const cmFirst = haveBothTimes
        ? (cmNextTime as number) < (rbNextTime as number)
        : _lastSource === 'commandManager';
      const order = cmFirst
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
