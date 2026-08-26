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
// beneath it). The true single-stack end state remains ADR-0251 (one store,
// derived geometry, one timeline).
//
// ⚠ CORRECTED 2026-08-23 (§UNDO-ORDERING-KEY, L-7300). This paragraph used to
// end: *"When either timestamp is missing (legacy fixtures), behaviour falls
// back to ring-buffer-first + `_lastSource` mirroring."* That sentence read as a
// benign compatibility affordance and was in fact the LIVE MIS-ROUTE — and it
// was not confined to fixtures: SIX of the EIGHT production ring-buffer push
// sites minted entries with no timestamp (`initBusHandlers.ts` :825, :1596,
// :1647, :1703, :1798 and `commitAnnotationSet.ts`; only `CommandBus.ts:591` and
// `initBusHandlers.ts:1335` stamped one). "Missing ⇒ ring-buffer first" is not a
// fallback when the key is missing most of the time; it is the routing rule.
// The founder's three wall edits (rake, rake, profile — all commandManager-ONLY)
// were jumped over by an older `slab` entry for exactly this reason.
// `RingBufferUndoStack.push()` now stamps commit time when the pusher did not,
// so the key is present by construction; `_reportUnorderable` names the residue
// instead of deciding silently.
//
// SAME-GESTURE IDENTITY (§UNDO-GESTURE-ID — C03 §4.6 U-10). Chronological
// ordering must NOT re-route a DUAL-DISPATCH TWIN: one gesture recorded on both
// stacks, which U-8 undoes once via the ring buffer + shadow-drop. Telling a twin
// from two separate actions used to be a wall-clock guess (`|Δtimestamp| ≤
// 250 ms`), i.e. a property of the machine rather than of the user's intent — see
// `_isSameGestureTwin` for the two failures that pinned. Both stacks now carry the
// id of the interaction that produced them (`PatchPair.gestureId`, stamped by
// `CommandBus.executeCommand`; `CommandMetadata.gestureId`, stamped by
// `initBusHandlers._cmExec` from that dispatch's ambient scope), and the predicate
// is an equality with no time fallback. An entry carrying no id is never a twin.
//
// CONTRACT: C03 §4 (undo architecture), C10 §2 / P8 (OTel span per exported fn).

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { applyRingBufferSide, fromJsonPointer, type ApplyRingBufferOutcome } from '@pryzm/command-bus';
import type { PatchPair, PatchSide } from '@pryzm/runtime-undo-stack';
import { adaptElementStoreMap, type PatchApplicableAdapter } from './elementUndoStoreAdapter.js';
import { boundaryLineUndoAdapter, resolveBoundaryLineStoreFromWindow } from './pluginStoreUndoAdapter.js';
import { liftCompoundUndoAdapter, liftPartUndoAdapter, resolveLiftStoresFromWindow } from './liftUndoAdapter.js';
// §POOL95 (L-11350) — the ADR-0124 pool assembly's two own stores. Same lazy
// runtime-resolution shape as the two adapters above; see poolUndoAdapter.ts.
import { poolUndoAdapter, waterUndoAdapter, resolvePoolStoresFromWindow } from './poolUndoAdapter.js';
// §BATH102 (L-11480) — the C109 bathroom pod. Same lazy runtime-resolution shape as
// the three above; the render half is the store's own `subscribeDirty`, not a sink.
import { bathroomPodUndoAdapter, resolveBathroomPodStoreFromWindow } from './bathroomPodUndoAdapter.js';

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
  /** §UNDO-GESTURE-ID — the gesture that produced the top undo entry, or null. */
  peekUndoGestureId?(): string | null;
  /** §L-4101 — raise/lower `isReverting()` around the RING-BUFFER leg, which
   *  `CommandManager.undo()`/`redo()` cannot reach. See `_withPausedObservers`. */
  beginExternalRevert?(): void;
  endExternalRevert?(): void;
}

/**
 * §UNDO-RESULT (C03 §4.6 U-4) — what one `performUndo()` / `performRedo()` did.
 *
 * THE DEFECT THIS CLOSES. Both functions returned `void`, so "the stacks are
 * empty", "I reverted a wall" and "an entry is pending but I could not apply it"
 * were THE SAME VALUE to every caller — the HUD button, the initUI keydown
 * handler, `BimService`. That is the failure≠emptiness rule this repo has closed
 * a dozen times elsewhere (see the memory note "Context-data honesty family"),
 * sitting in the undo path: a Ctrl+Z that silently achieves nothing is
 * indistinguishable from a Ctrl+Z that had nothing to do, and neither can be
 * surfaced to the user or asserted by a test.
 *
 * `stranded` is the one that matters most: the ring buffer HAS a pending entry
 * whose stores have no adapter (a `door`/`window`/`level`/`dimension` key — C03
 * §4.8), the legacy stack has nothing to fall back to, and the keypress does
 * nothing. That state is currently unobservable; naming it makes it reportable.
 */
export type UndoOutcome =
  | { readonly status: 'undone'; readonly path: 'ring-buffer' | 'commandManager'; readonly stores: readonly string[]; readonly ids: readonly string[] }
  | { readonly status: 'nothing-to-undo' }
  | { readonly status: 'stranded'; readonly reason: string; readonly stores: readonly string[] }
  | { readonly status: 'error'; readonly reason: string };

/** Mirror of {@link UndoOutcome} for the redo direction. */
export type RedoOutcome =
  | { readonly status: 'redone'; readonly path: 'ring-buffer' | 'commandManager'; readonly stores: readonly string[] }
  | { readonly status: 'nothing-to-redo' }
  | { readonly status: 'stranded'; readonly reason: string; readonly stores: readonly string[] }
  | { readonly status: 'error'; readonly reason: string };

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
  if (typeof pairTime !== 'number') {
    // §UNDO-ORDERING-KEY (L-7300) — this early return is not a tie-break, it is
    // an UNCONDITIONAL WIN for the ring buffer, and it used to be silent. See
    // `_reportUnorderable` for the founder's repro and for why the real fix is
    // upstream in `RingBufferUndoStack.push()`.
    if (cm?.canUndo?.()) _reportUnorderable('Undo', pair);
    return false;
  }
  if (!cm?.canUndo?.()) return false;
  const cmTime = cm.peekUndoTimestamp?.();
  if (typeof cmTime !== 'number' || cmTime <= pairTime) return false;
  if (_isSameGestureTwin(pair, cm.peekUndoTargetIds?.() ?? [], cm.peekUndoGestureId?.() ?? null)) return false;
  return true;
}

/**
 * §UNDO-ORDERING-KEY (L-7300, C03 §4.6 U-10) — NAME an entry the cross-stack
 * arbiter cannot order, instead of silently deciding in the ring buffer's favour.
 *
 * ── THE DEFECT THIS BELONGS TO, MEASURED ────────────────────────────────────
 * The founder made three wall edits — rake 80°, rake 70°, then a profile edit —
 * and pressed Ctrl+Z. All three are `element.updateParameters`, whose bus handler
 * declares `stores: [] as const` and bridges to `_cmExec`, so all three live on
 * the commandManager stack ONLY. His console:
 *
 *     [CommandManager] snapshot commandType="UPDATE_ELEMENT_PARAMETER (ad)" scope=[wall]
 *     [Undo] ring-buffer applied — stores: slab  ids: slab_01M0NJ79M2…  shadow-dropped cm entries: 0
 *     [Redo] ring-buffer applied — stores: slab
 *
 * Reproduced byte-for-byte (`L7300RakeProfileUndoCrossStack.test.ts`, ARM A): a
 * `slab` ring entry carrying NO `timestamp` beats a legacy rake entry stamped a
 * full second later, because `_cmEntryIsNewer` opened with
 * `if (typeof pairTime !== 'number') return false`. Absence was answering a
 * question it was never asked — the exact rule `_isSameGestureTwin`'s doc states
 * for `gestureId` ("absence must never mean membership"), inverted and unnoticed
 * one function above it.
 *
 * ── WHERE THE FIX IS, AND WHY NOT HERE ──────────────────────────────────────
 * Upstream, at `RingBufferUndoStack.push()`, which now stamps commit time on any
 * pair that arrives without one. Six of the eight production push sites minted
 * unstamped entries; patching this comparator instead would leave the stack full
 * of unorderable entries and merely pick a different loser for them. There is no
 * verdict this function can honestly return for an unorderable pair — it can only
 * stop being the place where the gap is invisible.
 *
 * So this is a DIAGNOSTIC, not a decision: behaviour is unchanged (ring-buffer
 * first, which is what the fixtures that predate the ordering key expect), and
 * the condition is now reportable. It should be unreachable in production — the
 * only remaining producers of an unstamped entry are stand-in stacks in tests.
 * Throttled to one line per (direction, store-set) so a scripted replay cannot
 * flood the console.
 */
const _unorderableReported = new Set<string>();
function _reportUnorderable(direction: 'Undo' | 'Redo', pair: PatchPair | null): void {
  const stores = (pair?.affectedStores ?? []).join(',') || '(none declared)';
  const key = `${direction}:${stores}`;
  if (_unorderableReported.has(key)) return;
  _unorderableReported.add(key);
  console.warn(
    `[${direction}] §UNDO-ORDERING-KEY — the ring-buffer entry for store(s) [${stores}] carries no ` +
    'commit timestamp, so it cannot be ordered against the legacy stack (C03 §4.6 U-10). ' +
    'Falling back to ring-buffer-first, which can jump over a NEWER commandManager-only edit ' +
    '(a wall rake, a wall profile, a hosted door/window). Every entry pushed through ' +
    'RingBufferUndoStack.push() is stamped — this entry did not come through it.',
  );
}

/** Test seam: `_reportUnorderable` is throttled per (direction, stores) for the
 *  life of the module, which would make a second test observe nothing. */
export function __resetUnorderableReports(): void {
  _unorderableReported.clear();
}

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
 *   (b) SAME GESTURE — the two entries carry the SAME `gestureId`
 *       (§UNDO-GESTURE-ID, C03 §4.6 U-10). Closes shape 1, which (a) alone
 *       cannot: a whole-element create and a later single-element edit of that
 *       element have identical id sets.
 *
 * §UNDO-GESTURE-ID — WHAT CONDITION (b) USED TO BE, AND WHY IT CHANGED.
 * It used to read `|cmTime − pairTime| ≤ 250 ms`: the two stacks carried no
 * shared identity, so "same gesture" was inferred from wall-clock proximity.
 * That is a measurement of the MACHINE, not of the user's intent, and
 * `apps/editor/__tests__/undoGestureOrdering.test.ts` pinned what it cost — the
 * same three-verb sequence replayed 80 ms apart undid the WRONG mutation first,
 * and a 2 ms change in the inter-gesture gap flipped the outcome. No threshold is
 * correct for both a fast double-click and a slow drag, so the constant was not
 * mis-tuned; it was answering a question a clock cannot answer.
 *
 * Now both stacks carry the id of the interaction that produced them:
 * `PatchPair.gestureId` (stamped by `CommandBus.executeCommand`) and
 * `CommandMetadata.gestureId` (stamped by `initBusHandlers._cmExec` from the
 * dispatch's ambient scope, or declared by a tool that dual-dispatches). The
 * predicate is now an equality, and there is NO time fallback: an entry with no
 * id, or with a different id, is NOT a twin. Absence must never mean membership —
 * "no id ⇒ join the previous gesture" is the original bug wearing a new name, and
 * it is the direction that silently DESTROYS an element (shape 1 above). The
 * conservative direction costs at most one phantom no-op keypress, which is the
 * asymmetry the old constant's own doc-comment argued for.
 *
 * Both conditions only ever NARROW the twin class, i.e. hand more cases to the
 * chronological rule U-10 already mandates. Neither can newly classify an
 * unrelated pair AS a twin.
 *
 * An entry with no declared `targetIds` is not treated as a twin — matching
 * `dropEntriesForTargets`, which never drops such an entry either.
 */
function _isSameGestureTwin(
  pair: PatchPair | null,
  cmTargets: readonly string[],
  cmGestureId: string | null,
): boolean {
  if (cmTargets.length === 0) return false;
  const pairGestureId = pair?.gestureId ?? null;
  // Absence is not membership (see above): an unstamped entry on either stack is
  // never another entry's twin.
  if (pairGestureId === null || cmGestureId === null) return false;
  if (pairGestureId !== cmGestureId) return false;
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
      // NOTE (L-980): there is deliberately NO `stairLanding` key. `window.
      // stairLandingStore` is never assigned — `initBuilders.ts:937` builds the
      // instance and threads it through parameters only, while its sibling two
      // lines below (`:942`) DOES get a global — so the entry was permanently
      // `undefined`. Removing it costs nothing: no bus handler anywhere declares
      // `affectedStores: ['stairLanding']` (measured 2026-08-18 by sweeping every
      // declaration under `plugins/**/handlers/**` + `initBusHandlers.ts`), and
      // nothing in production ever calls `StairLandingStore.add()` — landings live
      // as `StairData.landings` INSIDE the stair record, and
      // `CreateStairCommand.createdLandingIds` is declared `= []` and never
      // pushed to (`CreateStairCommand.ts:141,559`). Wiring the global would have
      // manufactured coverage for a family with no traffic; this is the honest
      // half of that pair. If landings ever become their own elements, add the
      // global at `initBuilders.ts:937` AND the key back here, together.
      handrail:       w.handrailStore,    handrails:    w.handrailStore,
      roof:           w.roofStore,        roofs:        w.roofStore,
      floor:          w.floorStore,       floors:       w.floorStore,
      ceiling:        w.ceilingStore,     ceilings:     w.ceilingStore,
      plumbing:       w.plumbingStore,
      lighting:       w.lightingStore,
      grid:           w.gridStore,        grids:        w.gridStore,
      annotation:     w.annotationStore,  annotations:  w.annotationStore,
      // §FEAT-SWIMMING-POOL-ELEMENT (L-292 / ADR-0124) — `pool` / `pools` /
      // `water` / `waters` USED TO BE HERE, reading `w.poolStore` / `w.waterStore`.
      //
      // ⚠ CORRECTED 2026-08-18 (L-980). NOTHING EVER ASSIGNED THOSE GLOBALS. The
      // four entries were `undefined` from the day they were added, so the comment
      // they carried — "omit either of these two and a pool undo silently falls
      // through to commandManager" — described the state the code was already in.
      // A key that resolves to `undefined` is not coverage; it is the same
      // `_covered()` miss as an absent key, wearing the costume of a fix.
      //
      // They are now DECLARED in UNMAPPED_BUS_STORE_KEYS instead, which is where
      // `_reportStranded` looks, so the gap can reach the user rather than only
      // the console. See that table for the full reachability measurement.
    }),
    // NOTE: door / window / level are intentionally ABSENT — and so are TEN
    // other keys, for a DIFFERENT reason. Both sets are enumerated, with their
    // reason, in UNMAPPED_BUS_STORE_KEYS below. Read it before adding a key here.

    // §FIX-BOUNDARY-LINE-UNDO-STRANDED (L-11160) — the FIRST twin-less plugin store
    // on the undo path. Not a legacy global: the adapter resolves
    // `runtime.stores.boundaryLine` at APPLY time and re-emits the family's bus
    // events so the 3-D/plan bridge does the rendering half. See
    // pluginStoreUndoAdapter.ts for why this is not the sheet/schedule shape
    // problem, and why lazy resolution is the honest form of "present".
    boundaryLine: boundaryLineUndoAdapter(resolveBoundaryLineStoreFromWindow),

    // §LIFT94 (L-11340, 2026-08-25) — CLOSES L-7311 + L-7312. The two rows below
    // this map used to describe as "REACHABLE AND STRANDED" now have real adapters,
    // so the six-store `lift.create` PatchPair is COVERED end to end and Ctrl+Z is
    // no longer a total no-op. Same lazy-resolution shape as boundaryLine above.
    //
    // ⛔ NEITHER ROW POINTS AT `window.liftStore`. That global holds the LOD-200
    // MASSING lift (C104 §1) — a different store — and the ban on aliasing it is
    // still in force and still stated in UNMAPPED_BUS_STORE_KEYS' preamble below.
    // These resolve `runtime.stores.lift` / `.liftPart`, the stores PluginRegistry
    // actually builds for the C104 compound. See liftUndoAdapter.ts for why the
    // render half is a registered sink rather than a re-emitted bus event.
    lift:     liftCompoundUndoAdapter(resolveLiftStoresFromWindow),
    liftPart: liftPartUndoAdapter(resolveLiftStoresFromWindow),

    // ⭐ §POOL95 (L-11350, 2026-08-25) — CLOSES THE POOL HALF OF L-980, and it is the
    // THIRD family to need exactly this shape in three days (boundaryLine → lift →
    // pool). `pool.create` declares FOUR stores; `wall` and `slab` were already
    // adapted, `pool` and `water` were not, and `_covered()` is all-or-nothing — so
    // the whole entry was declined and Ctrl+Z after drawing a pool was a TOTAL no-op
    // that left the void punched through the floor plate.
    //
    // ⚠ THE ROWS BELOW USED TO SAY THIS COULD NOT HAPPEN, and they were honest when
    // written: L-980 measured the family UNREACHABLE on four axes in August. THREE of
    // those four have since been closed by other lanes (PoolStore IS constructed, the
    // storeKeys ARE declared, `PoolPlanToolHandler` DOES dispatch `pool.create`), so
    // the pool moved into the "REACHABLE AND THEREFORE STRANDED" state the lift rows
    // described — without anything updating its rows. See poolUndoAdapter.ts's header
    // for the axis-by-axis re-measurement.
    pool:  poolUndoAdapter(resolvePoolStoresFromWindow),
    water: waterUndoAdapter(resolvePoolStoresFromWindow),

    // ⭐ §BATH102 (L-11480, 2026-08-26) — the C109 BATHROOM POD, and the FOURTH family
    // to need this exact shape in three days (boundaryLine → lift → pool → bathroomPod).
    // `bathroomPod.create` declares ONE store and `_covered()` is all-or-nothing, so
    // without this row every pod PatchPair would be declined and Ctrl+Z would fall
    // through to `commandManager`, which has never heard of the verb.
    //
    // ⛔ IT DOES NOT POINT AT `window.plumbingStore`. That is the LEGACY FIXTURE store —
    // a different store holding different records — and applying a pod inverse to it
    // would be C03 §4.6 U-2b's corrupting case, the same aliasing the `lift` rows above
    // refuse for `window.liftStore`. The pod family has EXACTLY ONE store on purpose
    // (C84 EI-1 by construction), and this resolves it off the composed runtime.
    //
    // ⭐ THE RENDER HALF IS NOT HERE AND NEEDS NO SINK. `Store.applyPatch()` notifies
    // `subscribeDirty` on EXECUTE, UNDO and REDO alike, and `bathroomPodMemberMirror`
    // is subscribed to it — so one road serves all four directions. See that module.
    bathroomPod: bathroomPodUndoAdapter(resolveBathroomPodStoreFromWindow),
  };
}

/**
 * §EI-7c (C84 §3) — EVERY BUS STORE KEY THAT IS NOT IN `buildUndoStoreMap()`,
 * NAMED, WITH ITS REASON AND ITS CONSEQUENCE.
 *
 * THE DEFECT THIS CLOSES. `_covered()` treats a key with no adapter as "not
 * covered", so `performUndo` does not step the ring-buffer cursor and falls
 * through to `commandManager`. For `door`/`window`/`level` that is the DESIRED
 * routing — the legacy stack genuinely owns those mutations, so the fallback
 * reverts them and the user sees their Ctrl+Z work.
 *
 * For TEN other keys there is nothing on the legacy stack either. Their
 * handlers ARE registered in production (`engineLauncher.ts:550,588,606,619,622`
 * and the `sheets`/`schedules`/`selection` registrations), and for eight of the
 * ten the ring buffer holds a real entry and Ctrl+Z is a TOTAL NO-OP. `pool` and
 * `water` (added by L-980) are the exception WITHIN this group and the difference
 * is stated rather than smoothed over: their handlers are registered but cannot
 * execute at all — `CommandBus.buildContext` throws on the missing store before
 * any mutation — so no ring entry is ever minted and nothing strands. They are
 * declared here because the map used to claim them, not because a keypress
 * currently fails. `performUndo` diagnosed the other eight
 * correctly as `{status:'stranded'}` from the day it was written — and every
 * caller but the AI chat bridge threw the value away, so the diagnosis reached
 * nobody. A correctly-diagnosed failure that is invisible is still a silent
 * failure (C03 §4.6 U-4).
 *
 * THIS TABLE IS NOT A PERMISSION SLIP. It does not make a stranded family
 * undoable; it makes the gap DECLARED, and `_reportStranded` below makes the
 * keypress's failure visible to the user instead of silent. Wiring an adapter
 * for these is the real fix and is NOT done here: their handlers write a plugin
 * DTO store whose record shape is not the legacy record's (the §OI-054
 * REDO-SHAPE-FIX hazard in `elementUndoStoreAdapter`), and four of the eight —
 * `structural`, `dimension`, `section`, `selection` — have NO legacy store to
 * adapt at all (measured: no `window.*Store` assignment site exists for any of
 * them). Adding a map entry pointing at nothing would report coverage that does
 * not exist, which is the one outcome worse than the current gap.
 *
 * MEASURED 2026-08-18 by sweeping every `affectedStores` declaration under
 * `plugins/**‍/handlers/**` (27 distinct keys) against `buildUndoStoreMap()`'s
 * key set. C84 §3 EI-7c names seven; the sweep found **eight** — `active-view`
 * is the one the contract missed.
 *
 * ⚠ AMENDED 2026-08-18 (L-980) — THE SWEEP ABOVE COMPARED AGAINST THE MAP'S KEY
 * SET, AND A KEY SET CANNOT SEE A DEAD ADAPTER. `pool` and `water` WERE in
 * `buildUndoStoreMap()`, so the sweep scored them covered — while
 * `adaptElementStoreMap` had stored `undefined` for both because nothing assigns
 * `window.poolStore` / `window.waterStore`. Presence of a key and existence of an
 * adapter are different questions, and only the second one is coverage. The
 * companion gate now asks the second (`undoStoreMapDeadKeys.test.ts`, which
 * installs exactly the globals the init sources really assign and then requires
 * every remaining entry to expose a working `applyPatch`). Measured after that
 * change: ZERO dead keys among the eighteen remaining store globals.
 */
export const UNMAPPED_BUS_STORE_KEYS: Readonly<Record<string, { readonly owner: 'legacy-stack' | 'nothing'; readonly reason: string }>> = {
  // ── Deliberate: the commandManager fallback genuinely reverts these. ────────
  door:   { owner: 'legacy-stack', reason: 'HOSTED — undo must also close the host wall opening; the two-part inverse lives in CreateWallOpeningCommand (ADR-051 follow-up).' },
  window: { owner: 'legacy-stack', reason: 'HOSTED — as door: undo must also close the host wall opening, and the two-part inverse lives in the legacy command.' },
  level:  { owner: 'legacy-stack', reason: 'Spatial authority — Path-A AddLevelCommand owns the inverse.' },
  // ── Stranded: nothing reverts these. Ctrl+Z is a no-op; the user is told. ───
  structural: { owner: 'nothing', reason: 'No legacy structural store exists (no window.structuralStore assignment site). Registered at engineLauncher.ts:588.' },
  dimension:  { owner: 'nothing', reason: 'No legacy dimension store exists. Registered at engineLauncher.ts:606.' },
  section:    { owner: 'nothing', reason: 'No legacy section store exists. Registered at engineLauncher.ts:619.' },
  selection:  { owner: 'nothing', reason: 'No legacy selection store on the undo path.' },
  sheet:      { owner: 'nothing', reason: 'window.sheetStore exists (initUI.ts:439) but holds the SHEET record, not the plugin DTO the patch was minted against — adapting it needs a shape bridge first.' },
  schedule:   { owner: 'nothing', reason: 'window.scheduleStore exists (initUI.ts:460); same shape mismatch as sheet.' },
  view:       { owner: 'nothing', reason: 'window.viewDefinitionStore exists (initUI.ts:675); same shape mismatch as sheet. Registered at engineLauncher.ts:622.' },
  'active-view': { owner: 'nothing', reason: 'view.switch — the active-view pointer has no store record at all; NOT named in C84 §3 EI-7c, found by the 2026-08-18 sweep.' },
  // §L-980 (2026-08-18) — pool + water ARRIVE here from buildUndoStoreMap(), where
  // they had been `undefined` since L-292. The family is UNREACHABLE, measured on
  // four independent axes, not inferred: (1) `new PoolStore()` / `new WaterStore()`
  // appear ZERO times repo-wide — the classes in `plugins/pool/src/store.ts` are
  // never constructed, not even by the plugin's own tests; (2) `PluginRegistry.ts`
  // declares no `pool`/`water` `storeKey`, so `CommandBus.buildContext`
  // (`CommandBus.ts:284-292`) THROWS `required store 'pool' is missing from
  // HandlerContext.stores` before `pool.create` mutates anything — the handlers are
  // registered (`engineLauncher.ts:550`) but not dispatchable; (3) no tool, toolbar
  // entry or plan handler dispatches `pool.create` — the only call sites are
  // `plugins/pool/__tests__/`; (4) the AI chat classifies `pool.create` as class B
  // (`ChatCommandClassification.ts:66`, blockedBy "per-family placement grammar"),
  // so that route refuses it too. Ctrl+Z after a pool is therefore not a live
  // defect — but the map claiming to cover it WAS one, because a permanently
  // `undefined` adapter and an absent key are the same value to `_covered()`, and
  // only one of the two is visible to a reader.
  // ⭐ §POOL95 (L-11350, 2026-08-25) — `pool` and `water` ARE NO LONGER HERE. Both
  // now carry real adapters in `buildUndoStoreMap()` above (`poolUndoAdapter` /
  // `waterUndoAdapter`), resolving `runtime.stores.pool` / `.water` lazily at apply
  // time. The pool half of L-980 is CLOSED.
  //
  // ⚠ THE PARAGRAPH ABOVE IS KEPT AS WRITTEN HISTORY, NOT DELETED, AND IT MUST BE
  // READ AS DATED. Its four-axis measurement was correct on 2026-08-18 and THREE of
  // its four axes were closed by later lanes:
  //   (1) "`new PoolStore()` appears ZERO times repo-wide" → FALSE: `PluginRegistry`
  //       builds `new PoolStore()` and `new WaterStore()`.
  //   (2) "PluginRegistry declares no `pool`/`water` storeKey, so buildContext
  //       THROWS" → FALSE: both descriptors exist and the bus resolves them.
  //   (3) "no tool, toolbar entry or plan handler dispatches `pool.create`" → FALSE:
  //       `PoolPlanToolHandler._commit()` dispatches it and the create panel's
  //       LANDSCAPE section has a live "Swimming Pool" button.
  //   (4) AI chat class B — STILL TRUE (L-5206), and untouched by this lane.
  // So its conclusion — "Ctrl+Z after a pool is therefore not a live defect" —
  // INVERTED the day axis 3 closed, and nothing re-read it. ⭐ That is the durable
  // lesson worth more than the fix: a measurement is true as of a DATE, and a row
  // asserting unreachability must be re-measured whenever the family becomes
  // reachable — the two halves belong in one commit, which is why this one moves
  // the rows and the adapters together.
  // ── §L-7310..L-7312 (2026-08-23) — the two COMPOUND families, and they are the
  //    OPPOSITE of pool/water: fully REACHABLE, and therefore actually stranded.
  //
  // Measured on the same four axes L-980 used, so the difference is stated rather
  // than smoothed over:
  //   (1) STORE CONSTRUCTED — yes. `apps/editor/src/PluginRegistry.ts:436` builds
  //       `new BalconyStore()`, :484 `new LiftCompoundStore()`, :489
  //       `new LiftPartStore()`.
  //   (2) storeKey DECLARED — yes, all three (`balcony`, `lift`, `liftPart`), so
  //       `CommandBus.buildContext` resolves and the handlers dispatch.
  //   (3) DISPATCHED FROM THE UI — yes. `BalconyPlanToolHandler.ts:271` and
  //       `LiftPlanToolHandler.ts:218` both call `bus.executeCommand`.
  //   (4) So a real PatchPair IS minted, `_covered()` declines it (balcony declares
  //       `['balcony','slab','floor','handrail']` — the last three ARE covered, the
  //       first is not, and coverage is all-or-nothing), and the legacy stack holds
  //       nothing. Ctrl+Z is a TOTAL NO-OP. Declared here so `_reportStranded` names
  //       the dead store to the user instead of the keypress failing silently.
  //
  // ⛔ DO NOT "FIX" `lift` BY POINTING IT AT `window.liftStore`. That global IS
  // assigned (`initBuilders.ts:983`) — and it is a DIFFERENT STORE: the LOD-200
  // MASSING lift, not the C104 compound the plugin handler writes (PluginRegistry.ts
  // :461 states this explicitly). Mapping it would satisfy `_covered()` and then
  // apply an inverse patch to a store that never received the forward — C03 §4.6
  // U-2b verbatim, which is not a failed undo but a corruption of authoritative
  // state. An adapter here needs the COMPOUND store on the window (or, better, U-7's
  // single store), not the nearest global with a matching name.
  balcony:  { owner: 'nothing', reason: 'REACHABLE AND STRANDED (L-7310) — BalconyStore is built and `balcony.create` dispatches from BalconyPlanToolHandler, but there is no `window.balconyStore`, so the ring entry is never covered and nothing on the legacy stack reverts it.' },
  // ⭐ §LIFT94 (L-11340, 2026-08-25) — `lift` and `liftPart` ARE NO LONGER HERE.
  // Both now carry real adapters in `buildUndoStoreMap()` above
  // (`liftCompoundUndoAdapter` / `liftPartUndoAdapter`), resolving
  // `runtime.stores.lift` / `.liftPart` lazily at apply time. L-7311 and L-7312 are
  // CLOSED. The ⛔ ban in the preamble above — do not alias `window.liftStore`, it is
  // the LOD-200 massing lift — is kept verbatim because it is what the fix obeyed,
  // not something the fix made obsolete: the adapters deliberately do NOT read it.
  //
  // `balcony` below is the SAME SHAPE and is deliberately still open (L-7310): its
  // `affectedStores` names `slab` / `floor` / `handrail` alongside `balcony`, and the
  // lane that closed the lift did not measure the balcony's render seam, so claiming
  // it by symmetry would be exactly the unmeasured assertion C84 §9 warns about.
  // ── §UNDO93 (L-11321, 2026-08-25) — the two keys ARM 1 COULD NOT SEE. ────────
  //
  // Neither of these is new, and neither was hidden by anything subtle: ARM 1's
  // sweep selected its input by DIRECTORY NAME (`plugins/**/handlers/**`), so a
  // bus handler that lives anywhere else was outside the question the gate asked.
  // A gate that classifies by name is satisfied by relocating — the roadmap §7B.5
  // shape, here costing two real families. ARM 1 now sweeps a STRUCTURAL predicate
  // (`implements CommandHandler<` / `bus.register(`) UNIONED with the old directory
  // scope, so neither a move nor a rename can hide the next one.
  //
  // ⛔ The sweep deliberately does NOT extend to `packages/command-registry/src`.
  // Those are legacy `Command` CLASSES, whose `affectedStores` is a DIFFERENT
  // vocabulary read by `CommandManagerImpl`'s scoped snapshot, not by `_covered()`
  // — 18 keys (`opening`, `template`, `visibility-rule`, `hierarchy`, …) live there
  // and demanding adapters for them would manufacture 18 false gaps. Measured
  // 2026-08-25; the distinction is the point, not an omission.
  cube: {
    owner: 'nothing',
    reason: 'REACHABLE AND STRANDED, dev demo — `MoveCubeCommand` (plugins/toy-cube/src/MoveCubeCommand.ts:48) is a real bus CommandHandler minting real produceCommand patches, and PluginRegistry.ts:1061 registers the toy-cube tool. It sits OUTSIDE any `handlers/` directory, which is the only reason ARM 1 never saw it. No `window.cubeStore` exists, so a ring entry is minted, `_covered()` declines it, and Ctrl+Z is a total no-op. Not worth an adapter (dev demo), but it must be DECLARED rather than invisible (L-11321).',
  },
  projectOrigin: {
    owner: 'nothing',
    reason: 'REACHABLE AND STRANDED — `projectOrigin.setPosition` / `.setVisible` are registered on the bus at initBusHandlers.ts:519-536 with `affectedStores: [projectOrigin]`, and they mutate `projectOriginStore` directly while returning `patches: []`. Empty patches mint NO ring entry, and the handler never calls `_cmExec`, so there is nothing on the legacy stack either: moving the project origin is not undoable by any path. ARM 1 could not see it because it is registered in apps/editor, outside the swept directory (L-11321). The real fix is a patch-producing handler over a patchable store (the L-11160 boundaryLine shape), NOT a map entry pointing at a global that does not exist.',
  },
};

/**
 * §EI-7c — make a stranded keypress VISIBLE.
 *
 * `{status:'stranded'}` means the user pressed Ctrl+Z, an entry was sitting
 * there, and nothing happened. Until now that reached the console and the
 * function's return value — which `initUI`'s keydown handler, `BimService.undo`
 * and the HUD button all discard. Best-effort and never throws: a headless or
 * pre-DOM caller just keeps the console line (C03 §4.6 U-4).
 */
function _reportStranded(direction: 'Undo' | 'Redo', reason: string, stores: readonly string[]): void {
  const dead = stores.filter(s => UNMAPPED_BUS_STORE_KEYS[s]?.owner === 'nothing');
  const msg = dead.length > 0
    ? `${direction} can't revert this yet — ${dead.join(', ')} ${dead.length === 1 ? 'is' : 'are'} not on the undo path. Your change is still there.`
    : `${direction} found a pending change it could not revert (${reason}).`;
  try {
    void import('@app/ui/platform/PlatformToastSystem')
      .then(m => { try { m.showToast(msg, 'error', 6000); } catch { /* no DOM */ } })
      .catch(() => { /* headless / bundle-split miss — the console line stands */ });
  } catch { /* import() unavailable */ }
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
/**
 * §L-4101 — ⭐ AND IT RAISES THE REVERT LATCH, which is the half L-874 missed.
 *
 * ── THE DEFECT, MEASURED BEFORE IT WAS FIXED ─────────────────────────────────
 * `CommandManagerImpl._reverting` is incremented ONLY inside its own
 * `undo()`/`redo()`. The RING-BUFFER leg — the one this algorithm tries FIRST —
 * never enters those, so `commandManager.isReverting()` reads **false** while an
 * inverse patch lands in the stores. `elementUndoStoreAdapter` applies a
 * `['wallId','baseLine']` inverse op as a plain `store.update(id, { baseLine })`,
 * which is byte-indistinguishable from a fresh user drag to every subscriber.
 * `WallMoveReweldService.onWallUpdated` and `SlabWallConnectivityService` both
 * gate on exactly that flag — so both treated the undo as a MOVE and dispatched
 * a **new FORWARD cascade**, minting history entries *while the undo was still
 * running* and wiping the redo stack.
 *
 * MEASURED (`packages/command-registry/__tests__/WA1MoveTransactionAtomicity.measure.test.ts`,
 * L-1110 §C/§D — re-run 2026-08-21, 6/6 green while DOCUMENTING the break):
 *
 *     [WA-1 C] isReverting() during a ring-buffer undo = false;
 *              cm history: 1 -> 3 (+2 entry/entries minted BY the undo write); canRedo = false
 *     [WA-1 D] pose after Ctrl+Z #1 === pre-move pose ? true
 *     [WA-1 D] pose after Ctrl+Z #2 === pre-move pose ? false
 *
 * ⭐ AND THE HISTORY-DROPDOWN JUMP IS THE AMPLIFIER, not a separate bug.
 * `undoThrough(n)` is `n+1` sequential `performUndo()` calls. Step 1 (ring
 * buffer) minted a fresh cascade; step 2 then undid THAT cascade — whose
 * captured "before" is the partner's DISPLACED pose — so the partners were put
 * back where the move had left them and the ORIGINAL cascade entry was never
 * reached. Both steps reported success; the HUD printed `requested 2,
 * completed 2`. Founder, 2026-08-21: *"I used the new undo dropdown, clicked two
 * steps back, and the adjacent walls did NOT move."*
 *
 * ⚠ WHY SILENCING THE SERVICES HERE IS CORRECT AND NOT A DROPPED CONSEQUENCE:
 * the forward cascade is ALREADY on the commandManager stack as its own entry
 * (or as a `structuralChild` of the mover's entry — §L-874-ONE-UNDO). Reverting
 * it is that entry's job. A cascade recomputed during a revert is a SECOND
 * answer to a question the history already answered, and it answers it against a
 * half-reverted world. This is verbatim the argument `CommandManagerImpl`'s
 * `_reverting` doc makes for the leg it already covers.
 *
 * Best-effort and depth-counted: an absent `commandManager` (headless/test) just
 * skips it, and the `finally` below is what guarantees a throw inside the patch
 * apply cannot strand the latch raised.
 */
function _withPausedObservers(label: 'UNDO' | 'REDO', body: () => void): void {
  type WallControl = { pause?: () => void; resumeAndFlush?: () => void };
  type TopologyControl = { pause?: () => void; resume?: () => void };
  const wallControl = (window as { __wallRebuildControl?: WallControl }).__wallRebuildControl;
  const topology    = (window as { roomTopologyObserver?: TopologyControl }).roomTopologyObserver;
  const cm          = _cm();
  // Recorded so the `finally` lowers the latch ONLY if this call raised it —
  // otherwise an absent method on one side and a present one on the other could
  // drive the counter negative (it floors at 0 there, but the asymmetry would be
  // silent, and a silently-disarmed latch is the defect this closes).
  let latched = false;
  try { cm?.beginExternalRevert?.(); latched = typeof cm?.beginExternalRevert === 'function'; }
  catch (err) { console.warn(`[Undo] §L-4101 ${label}: beginExternalRevert() failed — structural services are NOT latched for this replay`, err); }
  try { wallControl?.pause?.(); } catch (err) { console.warn(`[Undo] §56 ${label}: wallControl.pause() failed`, err); }
  try { topology?.pause?.(); }    catch (err) { console.warn(`[Undo] §56 ${label}: topology.pause() failed`, err); }
  try {
    body();
  } finally {
    try { wallControl?.resumeAndFlush?.(); } catch (err) { console.warn(`[Undo] §56 ${label}: wallControl.resumeAndFlush() failed`, err); }
    try { topology?.resume?.(); }            catch (err) { console.warn(`[Undo] §56 ${label}: topology.resume() failed`, err); }
    // LAST, and after the observer flush: the rebuild flush is a RENDER pass, not
    // a model mutation, so it must not be the thing that re-arms the services.
    if (latched) {
      try { cm?.endExternalRevert?.(); }
      catch (err) { console.error(`[Undo] §L-4101 ${label}: endExternalRevert() threw — the revert latch may be STUCK RAISED, which silences structural cascades for the rest of the session`, err); }
    }
  }
}

/**
 * THE undo entry point. Ring-buffer-first (covers every bus-created element in
 * both plan and 3D), shadow-dropping the matching commandManager entries to
 * prevent phantom double-undo, then commandManager fallback for legacy-only ops.
 * See module header for the full rationale (C03 §4.6 U-5).
 *
 * Returns an {@link UndoOutcome} — C03 §4.6 U-4. Callers that ignore it behave
 * exactly as before (this used to return `void`), but "nothing to undo", "I
 * reverted something" and "an entry is pending and I could NOT revert it" are no
 * longer the same value.
 */
export function performUndo(): UndoOutcome {
  return _tracer.startActiveSpan('pryzm.undo', (span): UndoOutcome => {
    try {
      const rb = _rb();
      const cm = _cm();
      // Set when the ring buffer holds a pending entry this call could not
      // consume (uncovered stores, empty patch, or a failed apply). If the legacy
      // fallback then also finds nothing, the keypress achieved NOTHING while work
      // was still pending — which is `stranded`, not `nothing-to-undo`.
      let stranded: { reason: string; stores: readonly string[] } | null = null;

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
          // Captured BEFORE undo() pops the entry — afterwards this peek names the
          // NEXT entry, not the one that was reverted.
          const cmIds = cm?.peekUndoTargetIds?.() ?? [];
          // §UNDO-NO-PHANTOM (L-691) — only consume the keypress if the legacy
          // undo actually reverted something; a refusal must fall through to the
          // ring-buffer entry underneath rather than no-op the user's Ctrl+Z.
          if (_cmDidWork(cm?.undo?.())) {
            _lastSource = 'commandManager';
            span.setAttribute('pryzm.undo.path', 'commandManager-newer');
            console.log('[Undo] commandManager undo (newer than ring-buffer top — cross-stack order)');
            span.end();
            return { status: 'undone', path: 'commandManager', stores: [], ids: cmIds };
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
              return { status: 'undone', path: 'ring-buffer', stores, ids };
            }
            // Total failure (no store applied) — safe to fall through: a failed
            // applyRingBufferSide mutated nothing, so commandManager won't double-undo.
            console.warn('[Undo] ring-buffer apply failed (stores:', outcome.failed.join(','),
              ') — falling back to commandManager');
            stranded = { reason: 'ring-buffer apply failed for every affected store', stores };
          } else {
            stranded = { reason: 'ring-buffer entry yielded no inverse patch', stores };
          }
        } else {
          // Uncovered / empty-patch entry: do NOT consume the cursor — fall through.
          stranded = {
            reason: stores.length === 0
              ? 'ring-buffer entry declares no affectedStores (C03 §4.6 U-2)'
              : `no applyPatch adapter for store(s) [${stores.join(',')}] (C03 §4.8)`,
            stores,
          };
        }
      }

      if (cm?.canUndo?.()) {
        cm.undo?.();
        _lastSource = 'commandManager';
        span.setAttribute('pryzm.undo.path', 'commandManager');
        console.log('[Undo] commandManager undo');
        span.end();
        return { status: 'undone', path: 'commandManager', stores: [], ids: [] };
      }

      // §UNDO-RESULT (C03 §4.6 U-4) — the two shapes of "the keypress did nothing"
      // are NOT the same value. `stranded` means work was pending and could not be
      // applied (the user pressed Ctrl+Z, an entry sat there, nothing happened);
      // `nothing-to-undo` means there was nothing to do in the first place.
      if (stranded) {
        span.setAttribute('pryzm.undo.path', 'stranded');
        span.setAttribute('pryzm.undo.stranded_reason', stranded.reason);
        console.warn('[Undo] STRANDED — a ring-buffer entry is pending but could not be reverted:',
          stranded.reason);
        _reportStranded('Undo', stranded.reason, stranded.stores);   // §EI-7c — not just the console
        span.end();
        return { status: 'stranded', reason: stranded.reason, stores: stranded.stores };
      }
      span.setAttribute('pryzm.undo.path', 'none');
      console.log('[Undo] nothing to undo (ring buffer + commandManager empty)');
      span.end();
      return { status: 'nothing-to-undo' };
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.end();
      // U-4: a swallowed failure MUST be reported to the caller, never logged as
      // success. It used to be swallowed into `void`.
      return { status: 'error', reason: err instanceof Error ? err.message : String(err) };
    }
  });
}

/**
 * THE redo entry point — mirror of {@link performUndo}. Prefers the stack the
 * last undo came from (`_lastSource`) so "undo N then redo N" round-trips on the
 * same stack; otherwise ring-buffer-first then commandManager.
 *
 * Returns a {@link RedoOutcome} — the mirror of {@link performUndo}'s U-4 result.
 */
export function performRedo(): RedoOutcome {
  return _tracer.startActiveSpan('pryzm.redo', (span): RedoOutcome => {
    try {
      const rb = _rb();
      const cm = _cm();
      let done: RedoOutcome | null = null;
      // Same distinction as performUndo: a pending redo entry that could not be
      // applied is `stranded`, not `nothing-to-redo`.
      let stranded: { reason: string; stores: readonly string[] } | null = null;

      const tryRingBuffer = (): boolean => {
        if (!rb?.canRedo?.()) return false;
        const pair = rb.peek?.() ?? null;
        const stores = pair?.affectedStores ?? [];
        const map = buildUndoStoreMap();
        if (!_covered(stores, map)) {
          stranded = {
            reason: stores.length === 0
              ? 'ring-buffer entry declares no affectedStores (C03 §4.6 U-2)'
              : `no applyPatch adapter for store(s) [${stores.join(',')}] (C03 §4.8)`,
            stores,
          };
          return false;
        }
        const forwardSide = rb.redoPatch?.();   // step cursor forward + return forward
        if (!forwardSide) {
          stranded = { reason: 'ring-buffer entry yielded no forward patch', stores };
          return false;
        }
        let outcome: ApplyRingBufferOutcome = { applied: [], failed: [] };
        _withPausedObservers('REDO', () => {
          outcome = applyRingBufferSide(forwardSide, stores, map);
        });
        span.setAttribute('pryzm.redo.path', 'ring-buffer');
        span.setAttribute('pryzm.redo.stores', stores.join(','));
        if (outcome.applied.length > 0) {
          _lastSource = 'ring-buffer';
          console.log('[Redo] ring-buffer applied — stores:', stores.join(','));
          done = { status: 'redone', path: 'ring-buffer', stores };
          return true;
        }
        console.warn('[Redo] ring-buffer apply failed (stores:', outcome.failed.join(','), ') — applied nothing');
        stranded = { reason: 'ring-buffer apply failed for every affected store', stores };
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
        done = { status: 'redone', path: 'commandManager', stores: [] };
        return true;
      };

      // §UNDO-CROSS-STACK-ORDER — redo replays FORWARD chronological order: when
      // both stacks have a pending redo and both carry commit timestamps, the
      // OLDER entry replays first (the mirror of undo-newest-first). Without
      // timestamps, fall back to mirroring the last undo's stack (_lastSource).
      const rbNext = rb?.canRedo?.() ? (rb.peek?.() ?? null) : null;
      const rbNextTime = rbNext?.timestamp;
      const cmNextTime = cm?.canRedo?.() ? cm.peekRedoTimestamp?.() : null;
      const haveBothTimes = typeof rbNextTime === 'number' && typeof cmNextTime === 'number';
      // §UNDO-ORDERING-KEY (L-7300) — the redo mirror. Without both keys this
      // falls back to `_lastSource`, i.e. "whichever stack the last undo used",
      // which is a guess, not chronology. Same diagnostic, same reason.
      if (typeof rbNextTime !== 'number' && rbNext !== null && typeof cmNextTime === 'number') {
        _reportUnorderable('Redo', rbNext);
      }
      const cmFirst = haveBothTimes
        ? (cmNextTime as number) < (rbNextTime as number)
        : _lastSource === 'commandManager';
      const order = cmFirst
        ? [tryCommandManager, tryRingBuffer]
        : [tryRingBuffer, tryCommandManager];
      if (order[0]!() || order[1]!()) {
        span.end();
        return done ?? { status: 'redone', path: 'ring-buffer', stores: [] };
      }
      if (stranded) {
        span.setAttribute('pryzm.redo.path', 'stranded');
        span.setAttribute('pryzm.redo.stranded_reason', (stranded as { reason: string }).reason);
        console.warn('[Redo] STRANDED — a ring-buffer entry is pending but could not be re-applied:',
          (stranded as { reason: string }).reason);
        _reportStranded('Redo', (stranded as { reason: string }).reason,
          (stranded as { stores: readonly string[] }).stores);      // §EI-7c
        span.end();
        return {
          status: 'stranded',
          reason: (stranded as { reason: string }).reason,
          stores: (stranded as { stores: readonly string[] }).stores,
        };
      }
      span.setAttribute('pryzm.redo.path', 'none');
      console.log('[Redo] nothing to redo (ring buffer + commandManager empty)');
      span.end();
      return { status: 'nothing-to-redo' };
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.end();
      return { status: 'error', reason: err instanceof Error ? err.message : String(err) };
    }
  });
}
