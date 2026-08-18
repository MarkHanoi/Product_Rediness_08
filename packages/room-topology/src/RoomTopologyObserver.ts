/**
 * RoomTopologyObserver — observes WallStore/CurtainWallStore events and schedules
 * room re-detection with per-level debounce.
 *
 * Sprint J extraction (2026-05-10): moved from src/engine/subsystems/rooms/ to
 * @pryzm/room-topology. Import remapping:
 *   ../walls/WallStore  → @pryzm/geometry-wall
 *   import('../commands') → import('@pryzm/command-registry')
 */

import { ReDetectRoomsCommand } from '@pryzm/command-registry';
import { BimManager } from '@pryzm/core-app-model';
import { batchCoordinator } from '@pryzm/core-app-model';
import { CurtainWallBuilder } from '../../geometry-curtain-wall/src/CurtainWallBuilder';
// §OPENED-REGION (L-880) — the pure before/after comparison and its one channel out.
import { scanForOpenedRegions, openedRegionNotifier } from './OpenedRegionDetector';
import type { RegionSnapshot, SurvivingWall } from './OpenedRegionDetector';

interface IRoomStoreLite {
  subscribe?(listener: (event: string, room: any) => void): () => void;
}

interface ICurtainWallStore {
  subscribe(listener: (event: string, cw: { levelId?: string }) => void): () => void;
}

interface IRoomBoundingLineStore {
  subscribe(listener: (event: string, line: { levelId?: string }) => void): () => void;
}

interface ISlabStore {
  subscribe(listener: (event: string, slab: { levelId?: string }) => void): () => void;
}

interface IColumnStore {
  subscribe(listener: (event: string, column: { levelId?: string }) => void): () => void;
}

const DEBOUNCE_MS = 150;
const CW_DEBOUNCE_MS = 800;
const MAX_DEADLINE_MS = 2_000;
const MAX_DEBOUNCE_RESETS = 12;
/** §WS-2.B (Plan §2.B, 2026-05-29) — interactive coalescing envelope. When the
 *  user draws multiple walls in quick succession (each fires a separate
 *  `bim-wall-mutation-committed` event) the OLD path called `_executeRedetect`
 *  immediately on EVERY commit — N walls drawn → N redetects. Now: a single
 *  300 ms idle timer per level coalesces the streak; the redetect fires ONCE
 *  after the last commit settles. 300 ms is short enough to feel instant for
 *  a one-off draw, long enough to absorb a typical multi-wall drawing burst. */
const SOFT_COALESCE_MS = 300;

// §FIX-ROOMREDETECT-NOPROGRESS-GUARD (L-63, 2026-07-03) — loop-safety net. A wall
// move that leaves a > hostSnap dangling gap (e.g. WallJoinResolver square-caps a moved
// hosted-door arm to a consensus point the room loop cannot close — §DIAG-ROOM-LOOP
// BREAK) used to re-arm a whole-level room redetect on every frame → the founder's hard
// freeze. Room re-detection is a PURE function of the level's wall/opening geometry: if
// that geometry is byte-identical to what the LAST completed redetect already saw, a new
// redetect can make NO progress — running it again only pegs the main thread. These bound
// the rescheduling so a non-closing loop cannot spin indefinitely:
//   1. committed-path no-progress gate — skip arming the soft-coalesce redetect when the
//      level's wall signature is unchanged since the last completed redetect;
//   2. execution circuit-breaker — if the SAME wall signature reaches `_executeRedetect`
//      more than NOPROGRESS_MAX times inside NOPROGRESS_WINDOW_MS (a per-frame runaway
//      from ANY re-arm source), stop firing until the geometry genuinely changes.
// A genuine wall edit changes the signature → both gates release immediately.
const NOPROGRESS_MAX = 6;
const NOPROGRESS_WINDOW_MS = 1_000;

/** §GEN-SINGLE-REDETECT (L-369, 2026-07-17) — true while a resi/office/house generation is in
 *  flight (`globalThis.__pryzmBuildingGenActive`, set by buildingGenerationLifecycle). Read
 *  without importing the L5 lifecycle module — the same globalThis-flag seam this file already
 *  uses for `window.__wallDragInProgress`. */
function __pryzmBuildingGenActive(): boolean {
  return (globalThis as unknown as { __pryzmBuildingGenActive?: boolean }).__pryzmBuildingGenActive === true;
}

export class RoomTopologyObserver {
  readonly debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  /** §WS-2.B — per-level soft-coalesce timer for the
   *  `bim-wall-mutation-committed` stream. Reset on every commit; fires
   *  `_executeRedetect` when SOFT_COALESCE_MS passes without a new commit. */
  private _commitCoalesceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  /**
   * §FIX-TOPOLOGY-RESUME-LOSES-SUPPRESSED (C72 §4, 2026-08-12) — suppression here
   * is bounded by ONE gesture: the caller's pause()…resume() window (an undo/redo
   * apply in `performUndoRedo._withPausedObservers`, or a project load in
   * `ProjectLoader`). It is NOT session-lifetime, and `resume()` now discharges
   * what it suppressed rather than destroying it.
   * @suppression-scope batch
   */
  private paused = false;
  /**
   * §FIX-TOPOLOGY-RESUME-LOSES-SUPPRESSED (C72 §4) — levels whose
   * `bim-wall-mutation-committed` arrived while paused. MEASURED, not assumed:
   * with the old bare `resume() { this.paused = false; }`, an event delivered
   * during the paused window produced **0 redetects** even after 5 s of timers,
   * while the identical event delivered unpaused produced **1** — so the paused
   * branch was destroying the notification, not deferring it. That is precisely
   * the irreversible suppression C72 §4 forbids: the reason for suppressing
   * (don't redetect mid-apply) expires at resume, but the consequence outlived it.
   *
   * The undo path is where this bites hardest. `performUndoRedo` wraps every
   * Ctrl+Z in `_withPausedObservers`, so the wall-baseline inverse patch lands,
   * fires its commit event INTO the paused window, and the rooms bounding that
   * wall were then refreshed only if some LATER unrelated edit happened to fire a
   * redetect. Rooms silently disagreed with the walls until then.
   * @suppression-scope batch
   */
  private _suppressedCommitLevels = new Set<string>();
  private _disposed = false;
  private _pendingPlacementLevels = new Set<string>();
  private _firstScheduleAt = new Map<string, number>();
  private _resetCount = new Map<string, number>();
  private _postBatchCooldownUntil = 0;
  // §FIX-ROOMREDETECT-NOPROGRESS-GUARD (L-63) — per-level signature of the wall geometry
  // the LAST completed redetect saw, plus a same-signature burst tracker for the circuit
  // breaker. Empty signature ('' — e.g. a wallStore without `getByLevel`) disables the
  // guard so it is inert in minimal/test harnesses.
  private _lastRedetectWallSig = new Map<string, string>();
  private _noProgressBurst = new Map<string, { sig: string; count: number; ts: number }>();
  /**
   * §OPENED-REGION (L-880) — levels whose NEXT completed re-derivation should be
   * compared against the room set that preceded it. Armed ONLY by
   * `_onWallMutationCommitted` (the wall-settle path), so the comparison is scoped to
   * exactly the gesture the founder described: a wall moved, and it left something
   * open. A project load, an undo/redo apply, a generation sweep and a `resume()`
   * discharge all reach `_executeRedetect` WITHOUT arming — and must, because the
   * first redetect after a load routinely disagrees with the persisted rooms, and
   * reporting that as "your move opened a region" is the cry-wolf failure.
   */
  private _openedRegionArmed = new Set<string>();
  // ── ADR-0069 (GR1/GR2) — graph-authoritative levels ─────────────────────────
  // A level whose rooms were created DIRECTLY from the engine graph (the
  // executors dispatch `BatchCreateRoomsCommand` from `option.rooms`). For such a
  // level, AUTO-redetect MUST be suppressed: re-tracing the (possibly trimmed-
  // loose) walls would `mergeWithExisting`-ADD the fragmented faces ALONGSIDE the
  // graph rooms → DOUBLE rooms (the founder's "RBedroom002 / Room00-002" overlap).
  // The graph is the source of room identity. GR2: a genuine MANUAL structural
  // wall edit (`add`/`remove`/`update` — since 2026-08-14 §PR-05-UPDATE-SURRENDER
  // a hand wall `update` surrenders too; NOT a batched mutation, NOT a
  // generation-driven write, NOT a WallJoinResolver rebuild storm) on the level
  // CLEARS the flag → detection re-asserts from then on.
  //
  // Scope is PER LEVEL and the code honours it: every read is keyed by levelId
  // (`_scheduleRedetect` / `_executeRedetect`), marking and clearing are both
  // per-level, so suppressing one level never suppresses another. RELEASE reach
  // was widened 2026-08-14 (§PR-05-UPDATE-SURRENDER) to cover hand `update`s;
  // the S1 entry in `tools/ga-gate/check-suppression-is-reversible.ts` stays
  // regardless — it counts out-of-file production callers of
  // `clearGraphAuthoritative`, which the in-branch delegation is not (see the
  // ledger annotation there for why the row must not be struck).
  // @suppression-scope level
  private _graphAuthoritativeLevels = new Set<string>();

  // ── SAFE MODE ROOM RESHAPE — the plan-covered redetect suppression ──────────
  //
  // WHY IT EXISTS. When `ConsequenceExecutionService` executes a wall move whose
  // plan carried PREDICTED room geometry, `ApplyPredictedRoomGeometryCommand` has
  // ALREADY written the exact rings the human approved. The observer's own
  // `ReDetectRoomsCommand` would then run `RoomDetectionEngine` over the same
  // level and OVERWRITE those rings with a second algorithm's answer — a
  // level-wide re-partition that welds at 0.05 m against the predictor's 1 mm.
  // That is precisely "a second room-detection algorithm silently replaced the
  // prediction", and it would defeat the whole phase. So the redetect is
  // suppressed for the levels the plan covered — and ONLY those.
  //
  // WHY IT IS SAFE (what makes this different from the ADR-0069 suppression).
  // The redetect is not being SKIPPED, it is being SUPERSEDED: the level's rooms
  // were just written from a prediction that the plan hash bound and the report's
  // read-back verifies. Suppressing a pass whose work has already been done by a
  // better-evidenced path is not information loss.
  //
  // REVERSIBILITY (C72 §4 — the binding constraint on this design). The
  // suppression is:
  //   • SCOPED TO ONE EXECUTION, not to a session — the caller opens it
  //     immediately before dispatch and closes it in a `finally`;
  //   • SCOPED PER LEVEL — only levels the plan actually covered;
  //   • DISCHARGING ON RELEASE — `releasePlanCoveredLevels()` flushes any commit
  //     that arrived while it was held, exactly as `resume()` does for `pause()`.
  //     A release that dropped them would be the §FIX-TOPOLOGY-RESUME-LOSES-
  //     SUPPRESSED defect re-introduced under a new name.
  //   • REFCOUNTED — nested/concurrent executions over the same level each hold a
  //     count, so an inner release cannot unsuppress an outer one still running.
  //
  // NOT USED FOR UNDETERMINED ROOMS. A level whose rooms came back UNDETERMINED is
  // never passed here: nothing wrote their geometry, so the observer's fallback
  // redetect is exactly what should run. That is the mechanism by which
  // "UNDETERMINED never becomes 'nothing changed'" holds at the observer layer.
  //
  // @suppression-scope batch
  private _planCoveredLevels = new Map<string, number>();
  /** Commits that arrived for a plan-covered level while it was suppressed. */
  private _planCoveredDeferred = new Set<string>();

  /** ADR-0069 — mark a level graph-authoritative: its rooms come from the engine
   *  graph, so the observer suppresses AUTO-redetect there (no fragmentation /
   *  double rooms). Cleared by a manual structural wall edit (GR2) or reset. */
  markGraphAuthoritative(levelId: string): void {
    this._graphAuthoritativeLevels.add(levelId);
  }
  /**
   * SAFE MODE ROOM RESHAPE — hold the AUTO-redetect for `levelIds` because a
   * consequence plan has just written their room geometry from the PREDICTED
   * values. Refcounted per level; MUST be paired with
   * {@link releasePlanCoveredLevels} in a `finally`.
   *
   * Pass ONLY levels whose rooms were actually written. A level with UNDETERMINED
   * rooms must NOT be passed — its fallback redetect is the correct behaviour.
   */
  markPlanCoveredLevels(levelIds: readonly string[]): void {
    for (const levelId of levelIds) {
      if (!levelId) continue;
      this._planCoveredLevels.set(levelId, (this._planCoveredLevels.get(levelId) ?? 0) + 1);
    }
  }

  /**
   * SAFE MODE ROOM RESHAPE — release the hold and DISCHARGE what it suppressed
   * (C72 §4.3: a release that drops the notifications it swallowed is irreversible
   * suppression wearing a release's name).
   *
   * A level whose refcount reaches zero AND which saw a commit while held gets one
   * redetect now. `_executeRedetect` is self-gating (paused / disposed / graph
   * authority / drag / no-progress circuit breaker), so a discharge for a level
   * whose geometry did not actually move costs one signature comparison and fires
   * nothing — it cannot double-redetect.
   */
  releasePlanCoveredLevels(levelIds: readonly string[]): void {
    const toDischarge: string[] = [];
    for (const levelId of levelIds) {
      if (!levelId) continue;
      const n = (this._planCoveredLevels.get(levelId) ?? 0) - 1;
      if (n > 0) { this._planCoveredLevels.set(levelId, n); continue; }
      this._planCoveredLevels.delete(levelId);
      if (this._planCoveredDeferred.delete(levelId)) toDischarge.push(levelId);
    }
    if (toDischarge.length === 0 || this._disposed) return;
    console.debug(
      `[RoomTopologyObserver] plan-covered release discharging ${toDischarge.length} deferred ` +
      `commit level(s): [${toDischarge.join(', ')}] — SAFE MODE ROOM RESHAPE / C72 §4`,
    );
    for (const levelId of toDischarge) this._executeRedetect(levelId);
  }

  /** Levels currently held by a consequence plan. Test/diagnostic read. */
  get planCoveredLevelCount(): number { return this._planCoveredLevels.size; }

  /**
   * Surrender graph authority for a level (manual edit / explicit re-detect).
   *
   * §PR-05-ONE-RELEASE-AUTHORITY (C72 §4.1, 2026-08-14) — this method is THE
   * single release path for `_graphAuthoritativeLevels`. The GR2 branch in
   * `attach()` used to hold an inline `this._graphAuthoritativeLevels.delete(…)`
   * twin beside it — a release wired in one place and duplicated in another is
   * how a widened release reaches only half the sites. The inline branch now
   * delegates here.
   *
   * RELEASE REACH (§PR-05-UPDATE-SURRENDER, founder decision 2026-08-14 —
   * update-surrender, NOT pre-sweep clear): a manual, unbatched, non-generation
   * wall `add`/`remove`/**`update`** gets here — a hand-dragged bounding wall on
   * a generated level now surrenders authority and re-detection re-asserts
   * (C83 §0.2.1 defect 2 closed at this seam). STILL EXCLUDED, by design: a
   * batched mutation, a generation-driven write (the lease flag spans the
   * unbatched gaps between sub-batches), the WallJoinResolver storm, and the
   * end-of-generation sweep (the founder rejected pre-sweep clearing — the
   * graph rooms must survive generation settle). The gate
   * `check-suppression-is-reversible` S1 row stays on its ledger regardless:
   * it counts production callers of this METHOD outside this file, which the
   * in-branch delegation deliberately is not.
   */
  clearGraphAuthoritative(levelId: string): void {
    this._graphAuthoritativeLevels.delete(levelId);
  }
  /** §WS-2.A (Plan §2.A) — when the WallJoinResolver is mid-flight, its per-
   *  neighbour `store.update()` storm fires `wall:update` events; each used to
   *  re-arm the 150 ms debounce and (after 12 resets) force-fire a redetect
   *  AGAINST half-trimmed walls. Setting this predicate (editor wires it to
   *  `WallRebuildCoordinator.isJoinsResolving`) makes the WallStore subscription
   *  ignore those events — the committed event (`bim-wall-mutation-committed`)
   *  fires ONE redetect after the resolver settles. */
  private _joinsResolving: (() => boolean) | null = null;

  private readonly _unsubscribers: Array<() => void> = [];

  private readonly _curtainWallStore?: ICurtainWallStore;
  private readonly _roomBoundingLineStore?: IRoomBoundingLineStore;
  private readonly _slabStore?: ISlabStore;
  private readonly _columnStore?: IColumnStore;

  constructor(
    readonly wallStore: any,
    readonly roomStore: IRoomStoreLite,
    readonly commandManager: any,
    readonly roomDetectionEngine: any,
    readonly bimManager: BimManager,
    curtainWallStore?: ICurtainWallStore,
    roomBoundingLineStore?: IRoomBoundingLineStore,
    slabStore?: ISlabStore,
    columnStore?: IColumnStore,
  ) {
    this._curtainWallStore = curtainWallStore;
    this._roomBoundingLineStore = roomBoundingLineStore;
    this._slabStore = slabStore;
    this._columnStore = columnStore;
  }

  /** §WS-2.A — editor wires `() => wallRebuildCoordinator.isJoinsResolving`.
   *  When set, WallStore `add|update|remove` events fired during join
   *  resolution are dropped (the committed event still drives ONE redetect
   *  after the resolver settles). */
  setJoinsResolvingPredicate(fn: () => boolean): void {
    this._joinsResolving = fn;
  }

  /** Attach all store subscriptions. Called from initTools after construction. */
  attach(): void {
    const wallUnsub = this.wallStore.subscribe((event: string, wall: { levelId: string }) => {
      if (this._joinsResolving?.()) {
        // §WS-2.A: WallJoinResolver storm — ignore. The committed event will fire
        // ONE redetect after the resolver finishes (see `_onWallMutationCommitted`).
        return;
      }
      if (event === 'add' || event === 'update' || event === 'remove') {
        // ADR-0069 GR2 + §PR-05-UPDATE-SURRENDER (founder decision 2026-08-14) —
        // a genuine MANUAL structural wall edit surrenders graph authority for
        // this level, so detection re-asserts from now on (the graph was a
        // generation-time seed, not a permanent lock). `update` is included
        // since 2026-08-14: a hand-DRAGGED bounding wall deletes its rooms'
        // boundedBy edges (WallRebuildCoordinator §GR12) while the corrective
        // re-detect stayed suppressed at the GR1 chokepoint FOREVER — the
        // add/remove-only arm froze every hand-moved generated level for the
        // session (C83 §0.2.1 defect 2 / gap register PR-05).
        //
        // EXCLUSIONS (C72 §4.4 — the surrender fires on USER hand-edits only):
        //   • `batchCoordinator.isBatching` — RAC runBatch / generation
        //     sub-batches: store-local wall events still fan out synchronously
        //     inside a batch (only the GLOBAL bus buffers), so the branch must
        //     check for itself;
        //   • `__pryzmBuildingGenActive()` — the generation lease spans ALL
        //     sub-batches INCLUDING the unbatched gaps between them, where the
        //     generators' rebuild `update` storms fire (L-369 measured exactly
        //     those gaps). Without this guard the generator's own wall writes
        //     would release suppression mid-generation and re-detection would
        //     fight the generator — the reason the suppression exists;
        //   • the §WS-2.A `_joinsResolving` early-return above already drops
        //     WallJoinResolver rebuild-`update` storms after a hand edit.
        if (!batchCoordinator.isBatching && !__pryzmBuildingGenActive()
            && this._graphAuthoritativeLevels.has(wall.levelId)) {
          // §PR-05-ONE-RELEASE-AUTHORITY — delegate to the ONE release method
          // instead of an inline `.delete(…)` twin (see clearGraphAuthoritative).
          this.clearGraphAuthoritative(wall.levelId);
          const cause = event === 'update' ? 'hand wall update' : `manual ${event}`;
          console.debug(`[RoomTopologyObserver] authority surrendered: ${cause} (level=${wall.levelId}) — ADR-0069 GR2 / C72 §4.4 / PR-05`);
        }
        this._scheduleRedetect(wall.levelId, DEBOUNCE_MS);
      }
    });
    this._unsubscribers.push(wallUnsub);

    if (this._curtainWallStore) {
      const cwUnsub = this._curtainWallStore.subscribe((event, cw) => {
        if ((event === 'add' || event === 'update' || event === 'remove') && cw.levelId) {
          this._scheduleRedetect(cw.levelId, CW_DEBOUNCE_MS);
        }
      });
      this._unsubscribers.push(cwUnsub);
    }

    if (this._roomBoundingLineStore) {
      const rblUnsub = this._roomBoundingLineStore.subscribe((event, line) => {
        if ((event === 'add' || event === 'update' || event === 'remove') && line.levelId) {
          this._scheduleRedetect(line.levelId, DEBOUNCE_MS);
        }
      });
      this._unsubscribers.push(rblUnsub);
    }

    if (this._slabStore) {
      const slabUnsub = this._slabStore.subscribe((event, slab) => {
        if ((event === 'add' || event === 'update' || event === 'remove') && slab.levelId) {
          this._scheduleRedetect(slab.levelId, DEBOUNCE_MS);
        }
      });
      this._unsubscribers.push(slabUnsub);
    }

    if (this._columnStore) {
      const colUnsub = this._columnStore.subscribe((event, column) => {
        if ((event === 'add' || event === 'update' || event === 'remove') && column.levelId) {
          this._scheduleRedetect(column.levelId, DEBOUNCE_MS);
        }
      });
      this._unsubscribers.push(colUnsub);
    }

    // F.events.15 — runtime.events.on replaces window.addEventListener for bim-wall-mutation-committed.
    const _unsubWallMutation = (window as any).runtime?.events?.on('bim-wall-mutation-committed', this._onWallMutationCommitted);
    if (_unsubWallMutation) this._unsubscribers.push(_unsubWallMutation);
    else window.addEventListener('bim-wall-mutation-committed', this._onWallMutationCommittedLegacy as EventListener);
    window.addEventListener('pryzm-room-bounding-pref-changed', this._onBoundingPrefChanged);
  }

  /** F.events.15 typed handler — receives `{ levelIds }` from runtime.events.
   *  §WS-2.B SOFT-COALESCE: queue the redetect via a 300 ms idle timer instead
   *  of firing it immediately. Each subsequent commit resets the timer so a
   *  draw streak of N walls produces ONE redetect when the user pauses. The
   *  immediate-fire path stays on the `_executeRedetect` direct call sites
   *  (cleanup loop, forced-fire branch) so post-load redetects are still
   *  synchronous. */
  private _onWallMutationCommitted = (payload: { levelIds?: readonly string[]; levelId?: string }): void => {
    if (this._disposed) return;
    // §FIX-TOPOLOGY-RESUME-LOSES-SUPPRESSED (C72 §4) — QUEUE, do not drop. The old
    // code returned here and the commit was gone forever (proven: 0 redetects after
    // resume vs 1 unpaused, same event). Record the levels so `resume()` can
    // discharge them; the redetect itself still does NOT run while paused, so the
    // reason for pausing (no redetect mid-apply / mid-load) is fully honoured.
    if (this.paused) {
      for (const lvl of payload?.levelIds ?? (payload?.levelId ? [payload.levelId] : [])) {
        if (lvl) this._suppressedCommitLevels.add(lvl);
      }
      return;
    }
    // §FIX-WALLMOVE-REDETECT-DEFER (ADR-0098 F3 / queue Q6, 2026-07-02) —
    // INVARIANT: a wall MOVE must NOT run room re-detection on every intermediate
    // baseline update. A live drag (3D gizmo OR plan-view PlanElementDragController)
    // fires a `bim-wall-mutation-committed` stream — the OLD path started the 300 ms
    // soft-coalesce on EACH one, and because a real drag never truly idles for 300 ms
    // the timer force-fired `_executeRedetect` mid-drag → whole-level RoomDetection
    // per intermediate frame → main-thread peg → freeze. While a wall drag is in
    // flight (`window.__wallDragInProgress === true`, set by the wall transform
    // controller / plan-drag controller) we DROP these commits entirely; the drag-END
    // release (WallRebuildCoordinator.resumeAndFlushDeferredDrag → whole-level flush →
    // ONE final `bim-wall-mutation-committed`) drives EXACTLY ONE redetect. Mirrors the
    // WallRebuildCoordinator ADR-061 defer so the two stay in lock-step.
    if (typeof window !== 'undefined'
        && (window as unknown as { __wallDragInProgress?: boolean }).__wallDragInProgress === true) {
      return;
    }
    const ids = payload?.levelIds ?? (payload?.levelId ? [payload.levelId] : []);
    for (const levelId of ids) {
      if (!levelId) continue;
      // §FIX-ROOMREDETECT-NOPROGRESS-GUARD (L-63) — no-progress gate. If the level's
      // wall geometry is byte-identical to what the last completed redetect already saw,
      // this committed event can make NO progress (the classic re-arm loop after a
      // > hostSnap dangling gap). Do NOT arm another redetect — a genuine wall edit would
      // change the signature and release the gate. Skipped when the signature is unknown
      // ('' — minimal harness) so behaviour there is unchanged.
      const sig = this._computeWallSig(levelId);
      if (sig !== '' && this._lastRedetectWallSig.get(levelId) === sig) {
        console.debug(`[RoomTopologyObserver] redetect no-progress — wall geometry unchanged since last redetect (level=${levelId}) — §FIX-ROOMREDETECT-NOPROGRESS-GUARD`);
        continue;
      }
      // Cancel the WallStore-debounce timer + first-schedule bookkeeping — the
      // commit supersedes them. Then start (or reset) the soft-coalesce timer.
      const existing = this.debounceTimers.get(levelId);
      if (existing) clearTimeout(existing);
      this.debounceTimers.delete(levelId);
      this._firstScheduleAt.delete(levelId);
      this._resetCount.delete(levelId);

      // §OPENED-REGION (L-880) — ARM the opened-region comparison for this level.
      // Deliberately armed HERE and nowhere else: this is the wall-settle path, past
      // the paused branch (a project load queues into `_suppressedCommitLevels` and
      // returns above, so a load-time redetect that disagrees with the persisted rooms
      // can never be reported as "your move opened a region") and past the drag guard.
      // Consumed once, inside `_executeRedetect`, at the moment a redetect genuinely
      // runs — so a redetect swallowed by one of the six suppression guards leaves the
      // arm standing for the one that follows.
      this._openedRegionArmed.add(levelId);

      const prevCoalesce = this._commitCoalesceTimers.get(levelId);
      if (prevCoalesce) clearTimeout(prevCoalesce);
      const timer = setTimeout(() => {
        this._commitCoalesceTimers.delete(levelId);
        if (this._disposed || this.paused) return;
        this._executeRedetect(levelId);
      }, SOFT_COALESCE_MS);
      this._commitCoalesceTimers.set(levelId, timer);
    }
  };

  /** Legacy DOM-event handler for graceful degradation when runtime is not yet wired. */
  private _onWallMutationCommittedLegacy = (e: Event): void => {
    const levelId = (e as CustomEvent).detail?.levelId as string | undefined;
    this._onWallMutationCommitted({ levelId });
  };

  private _onBoundingPrefChanged = (): void => {
    this.scheduleRedetectAllLevels();
  };

  pause(): void  { this.paused = true; }

  /**
   * §FIX-TOPOLOGY-RESUME-LOSES-SUPPRESSED (C72 §4) — releasing the suppression
   * DISCHARGES what it suppressed. A `resume()` that silently drops the commits
   * it swallowed is irreversible suppression: the channel is nominally back on,
   * but the notifications that arrived while it was off are gone, so the rooms
   * stay stale until an unrelated later edit happens to fire a redetect.
   *
   * SYNCHRONOUS on purpose. `performUndoRedo._withPausedObservers` resumes in a
   * `finally`, and a deferred flush would be one more thing that can be lost;
   * `_executeRedetect` is also the path that records `_lastRedetectWallSig`, so
   * running it inline keeps the no-progress guard's bookkeeping truthful.
   *
   * IDEMPOTENT + SELF-GATING. `_executeRedetect` re-checks `paused`, `_disposed`,
   * graph-authority, building-generation, wall-drag and the no-progress
   * circuit-breaker. So a flush for a level whose geometry did not actually change
   * (the common ProjectLoader case, which runs its OWN explicit post-load
   * redetect) costs one signature comparison and fires nothing — this cannot
   * double-redetect a load.
   */
  resume(): void {
    this.paused = false;
    if (this._disposed) { this._suppressedCommitLevels.clear(); return; }
    const levels = [...this._suppressedCommitLevels];
    this._suppressedCommitLevels.clear();
    if (levels.length === 0) return;
    console.debug(
      `[RoomTopologyObserver] resume flushing ${levels.length} suppressed commit level(s): ` +
      `[${levels.join(', ')}] — §FIX-TOPOLOGY-RESUME-LOSES-SUPPRESSED (C72 §4)`,
    );
    for (const levelId of levels) {
      // Supersede any stale pending timers for the level, exactly as the
      // committed-event path does, then redetect once.
      const existing = this.debounceTimers.get(levelId);
      if (existing) clearTimeout(existing);
      this.debounceTimers.delete(levelId);
      this._firstScheduleAt.delete(levelId);
      this._resetCount.delete(levelId);
      const coalesce = this._commitCoalesceTimers.get(levelId);
      if (coalesce) clearTimeout(coalesce);
      this._commitCoalesceTimers.delete(levelId);
      this._executeRedetect(levelId);
    }
  }

  /** Levels whose commits are currently held by `pause()`. Test/diagnostic read. */
  get suppressedCommitLevelCount(): number { return this._suppressedCommitLevels.size; }

  flushPlacementLevels(): void {
    const levels = [...this._pendingPlacementLevels];
    this._pendingPlacementLevels.clear();
    if (levels.length === 0) return;
    setTimeout(() => {
      for (const levelId of levels) {
        this._scheduleRedetect(levelId, DEBOUNCE_MS);
      }
    }, 50);
  }

  cancelPendingForLevels(levelIds: readonly string[]): void {
    let cancelled = 0;
    for (const levelId of levelIds) {
      const timerId = this.debounceTimers.get(levelId);
      if (timerId !== undefined) {
        clearTimeout(timerId);
        this.debounceTimers.delete(levelId);
        this._firstScheduleAt.delete(levelId);
        this._resetCount.delete(levelId);
        cancelled++;
      }
      // §WS-2.B — also cancel any in-flight soft-coalesce timer for this level.
      const coalesce = this._commitCoalesceTimers.get(levelId);
      if (coalesce !== undefined) {
        clearTimeout(coalesce);
        this._commitCoalesceTimers.delete(levelId);
        cancelled++;
      }
    }
    console.log(
      `[RoomTopologyObserver] §G2 cancelled ${cancelled} pending redetect timer(s) for levels: [${[...levelIds].join(', ')}]`
    );
  }

  setPostBatchCooldown(untilMs: number): void {
    this._postBatchCooldownUntil = untilMs;
    console.log(
      `[RoomTopologyObserver] §G2 post-batch cooldown armed until T=${untilMs.toFixed(0)}ms`
    );
  }

  dispose(): void {
    this._disposed = true;
    for (const unsub of this._unsubscribers) { try { unsub(); } catch { /* */ } }
    this._unsubscribers.length = 0;
    for (const [, t] of this.debounceTimers) clearTimeout(t);
    this.debounceTimers.clear();
    // §WS-2.B — clear soft-coalesce timers too so a disposed observer doesn't
    // fire stray redetects after teardown.
    for (const [, t] of this._commitCoalesceTimers) clearTimeout(t);
    this._commitCoalesceTimers.clear();
    // SAFE MODE ROOM RESHAPE — a disposed observer holds nothing. Deferred commits
    // are dropped here (not discharged) because there is no observer left to
    // redetect INTO; `releasePlanCoveredLevels` already no-ops when disposed.
    this._planCoveredLevels.clear();
    this._planCoveredDeferred.clear();
    window.removeEventListener('bim-wall-mutation-committed', this._onWallMutationCommittedLegacy as EventListener);
    window.removeEventListener('pryzm-room-bounding-pref-changed', this._onBoundingPrefChanged);
  }

  private _scheduleRedetect(levelId: string, debounceMs: number = DEBOUNCE_MS): void {
    // §FIX-ROOMOBSERVER-PAUSE (C11 §6.3 / task #32): `pause()` MUST make
    // scheduling a COMPLETE no-op. Previously `this.paused` was honoured only
    // inside the debounce-timer callback — but the forced-fire path below
    // (MAX_DEBOUNCE_RESETS / MAX_DEADLINE_MS) calls `_executeRedetect()`
    // DIRECTLY, bypassing the timer. During bulk project load `ProjectLoader`
    // pauses the observer, yet every imported wall still reached this method,
    // reset the debounce, and after 12 resets force-fired `ReDetectRoomsCommand`
    // mid-import → main-thread thrash → "old projects stuck on load". Honour
    // `paused` at the top so a paused observer accumulates nothing and never
    // force-fires; `ProjectLoader` runs one explicit post-load redetect.
    if (this.paused || this._disposed) {
      return;
    }
    // ADR-0069 (GR1) — graph-authoritative level: the engine graph owns the rooms;
    // never auto-redetect (it would ADD fragmented faces → double rooms).
    if (this._graphAuthoritativeLevels.has(levelId)) {
      console.debug(`[RoomTopologyObserver] suppressed (level=${levelId}, reason=graph-authoritative ADR-0069)`);
      return;
    }
    if (batchCoordinator.isBatching) {
      console.debug(`[RoomTopologyObserver] suppressed (level=${levelId}, reason=isBatching, source=schedule)`);
      return;
    }
    // §GEN-SINGLE-REDETECT (L-369, 2026-07-17) — while a building generation is in flight,
    // suppress observer-driven AUTO-redetects entirely. A resi/office/house generation runs a
    // long tail of sub-batches (openings, floors, ceilings, finishes, furnish, lighting); each
    // sub-batch END fired one auto-redetect per level BETWEEN batches, all against
    // graph-authoritative levels or unchanged geometry — pure waste that tripped the
    // no-progress circuit-breaker dozens of times. Room identity during generation comes from
    // the executors' graph rooms + their explicit `ReDetectRoomsCommand`s (which bypass this
    // observer). buildingGenerationLifecycle.release() fires ONE final redetect sweep at the
    // true end. A live user edit (flag cleared) is unaffected.
    if (__pryzmBuildingGenActive()) {
      console.debug(`[RoomTopologyObserver] suppressed (level=${levelId}, reason=building-generation, source=schedule) — §GEN-SINGLE-REDETECT`);
      return;
    }

    if (debounceMs === CW_DEBOUNCE_MS && CurtainWallBuilder.isPlacementModeActive) {
      this._pendingPlacementLevels.add(levelId);
      console.debug(`[RoomTopologyObserver] suppressed (level=${levelId}, reason=placement-mode-deferred)`);
      return;
    }

    const now = Date.now();
    if (!this._firstScheduleAt.has(levelId)) {
      this._firstScheduleAt.set(levelId, now);
      this._resetCount.set(levelId, 0);
    } else {
      const resets = (this._resetCount.get(levelId) ?? 0) + 1;
      this._resetCount.set(levelId, resets);
      console.debug(`[RoomTopologyObserver] reset (level=${levelId}, n=${resets})`);

      const elapsed = now - (this._firstScheduleAt.get(levelId) ?? now);
      if (elapsed >= MAX_DEADLINE_MS || resets >= MAX_DEBOUNCE_RESETS) {
        const existing = this.debounceTimers.get(levelId);
        if (existing) clearTimeout(existing);
        this.debounceTimers.delete(levelId);
        this._firstScheduleAt.delete(levelId);
        this._resetCount.delete(levelId);
        console.warn(`[RoomTopologyObserver] forced fire (level=${levelId}, deadline=${MAX_DEADLINE_MS}ms, elapsed=${elapsed}ms, resets=${resets})`);
        this._executeRedetect(levelId);
        return;
      }
    }

    const existing = this.debounceTimers.get(levelId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      if (this._disposed) {
        this.debounceTimers.delete(levelId);
        this._firstScheduleAt.delete(levelId);
        this._resetCount.delete(levelId);
        return;
      }
      this.debounceTimers.delete(levelId);
      if (this.paused) {
        console.debug(`[RoomTopologyObserver] suppressed (level=${levelId}, reason=paused, source=timer)`);
        this._firstScheduleAt.delete(levelId);
        this._resetCount.delete(levelId);
        return;
      }
      if (batchCoordinator.isBatching) {
        console.debug(`[RoomTopologyObserver] suppressed (level=${levelId}, reason=isBatching, source=timer)`);
        this._firstScheduleAt.delete(levelId);
        this._resetCount.delete(levelId);
        return;
      }
      if (this._postBatchCooldownUntil > performance.now()) {
        console.log(`[RoomTopologyObserver] §G2 redetect suppressed in post-batch cooldown (level=${levelId})`);
        this._firstScheduleAt.delete(levelId);
        this._resetCount.delete(levelId);
        return;
      }
      this._firstScheduleAt.delete(levelId);
      this._resetCount.delete(levelId);
      this._executeRedetect(levelId);
    }, debounceMs);

    this.debounceTimers.set(levelId, timer);
  }

  scheduleRedetectAllLevels(): void {
    if (this.paused) return;
    const levels = this.bimManager.getLevels?.() ?? [];
    if (levels.length === 0) {
      console.debug('[RoomTopologyObserver] scheduleRedetectAllLevels: no levels — skipping');
      return;
    }
    console.log(`[RoomTopologyObserver] scheduleRedetectAllLevels — scheduling ${levels.length} level(s)`);
    for (const level of levels) {
      this._scheduleRedetect(level.id, DEBOUNCE_MS);
    }
  }

  private _executeRedetect(levelId: string): void {
    if (this._disposed) return;
    // §#48 (TASK queue 2026-05-20) — single source of truth for the paused
    // gate. The C11 §FIX-ROOMOBSERVER-PAUSE fix added the paused check to
    // `_scheduleRedetect`, but THREE other call sites (the cleanup-loop at
    // line ~137, the forced-fire branch at line ~241, the batch-redetect-all
    // at line ~277) invoke `_executeRedetect` DIRECTLY without going through
    // `_scheduleRedetect`. During post-load wall-flush (ProjectLoader.ts:1326),
    // those direct paths fired ReDetectRoomsCommand while the observer was
    // still paused for the bulk import — producing the "forced fire resets=12"
    // log + a redetect against half-built room polygons + a main-thread stall
    // long enough to look like a project-load hang. Putting the paused check
    // at this method's entry guarantees every redetect path honours it.
    if (this.paused) {
      console.debug(`[RoomTopologyObserver] _executeRedetect suppressed (paused, level=${levelId})`);
      return;
    }
    // SAFE MODE ROOM RESHAPE — execution-chokepoint guard. This level's rooms were
    // JUST written from the PREDICTED geometry the human approved; running
    // RoomDetectionEngine now would overwrite those rings with a SECOND algorithm's
    // answer. QUEUE, do not drop: the commit is recorded so the release discharges
    // it (C72 §4), which is why this is a `_planCoveredDeferred.add` and not a bare
    // `return` — a bare return here would re-create the exact defect
    // §FIX-TOPOLOGY-RESUME-LOSES-SUPPRESSED was landed to fix.
    if (this._planCoveredLevels.has(levelId)) {
      this._planCoveredDeferred.add(levelId);
      console.debug(`[RoomTopologyObserver] _executeRedetect deferred (level=${levelId}, reason=plan-covered-room-geometry) — SAFE MODE ROOM RESHAPE`);
      return;
    }
    // §GEN-SINGLE-REDETECT (L-369) — execution-chokepoint mirror of the scheduler guard. FOUR
    // paths reach here without passing `_scheduleRedetect` (the WallStore debounce timer, the
    // forced-fire branch, the committed-event soft-coalesce timer, scheduleRedetectAllLevels).
    // While a building generation is in flight, drop them all — the final release() sweep and
    // the executors' explicit redetects (which bypass this observer) own room detection.
    if (__pryzmBuildingGenActive()) {
      console.debug(`[RoomTopologyObserver] _executeRedetect suppressed (level=${levelId}, reason=building-generation) — §GEN-SINGLE-REDETECT`);
      return;
    }
    // §FIX-WALLMOVE-REDETECT-DEFER — execution-chokepoint guard. INVARIANT: no
    // redetect while a wall drag is in flight. FOUR paths reach `_executeRedetect`
    // without passing the committed-event guard above: the WallStore add/update/remove
    // debounce timer, the forced-fire branch (resets≥12 / deadline — which a plan-view
    // `ws.update` storm WILL trip since each mousemove re-arms the debounce), the
    // committed-event soft-coalesce timer, and `scheduleRedetectAllLevels`. During a
    // plan-view wall drag `PlanElementDragController._moveWall` calls `ws.update()` per
    // mousemove → `wall:update` → this path force-fires mid-drag → freeze. Suppress
    // here so every redetect path honours the drag defer; the drag-end flush drives one.
    if (typeof window !== 'undefined'
        && (window as unknown as { __wallDragInProgress?: boolean }).__wallDragInProgress === true) {
      console.debug(`[RoomTopologyObserver] _executeRedetect suppressed (wall drag in flight, level=${levelId}) — §FIX-WALLMOVE-REDETECT-DEFER`);
      return;
    }
    // ADR-0069 (GR1) — the graph-authoritative guard must live at the EXECUTION
    // chokepoint, not only in `_scheduleRedetect`. Two observer paths reach here
    // WITHOUT passing through the scheduler: the `bim-wall-mutation-committed`
    // soft-coalesce timer (_onWallMutationCommitted) and the forced-fire branch.
    // The house generator's post-openings §OPENING-VOID-WHOLE-LEVEL whole-level
    // rebuild emits a committed event → that path would auto-redetect a graph-
    // authoritative level and re-create the fragmented "Room NN" faces ALONGSIDE
    // the engine's named graph rooms (the founder's duplicated/generic labels).
    // An EXPLICIT redetect (commandManager.execute(new ReDetectRoomsCommand)) is
    // unaffected — it bypasses the observer entirely. GR2 surrender (manual wall
    // add/remove/update — §PR-05-UPDATE-SURRENDER) clears the flag first, so
    // manual edits still re-detect normally.
    if (this._graphAuthoritativeLevels.has(levelId)) {
      console.debug(`[RoomTopologyObserver] _executeRedetect suppressed (level=${levelId}, reason=graph-authoritative ADR-0069 GR1)`);
      return;
    }
    // §FIX-ROOMREDETECT-NOPROGRESS-GUARD (L-63) — execution circuit-breaker. FOUR paths
    // reach here without passing the committed-path no-progress gate (the WallStore
    // debounce timer, the forced-fire branch, the soft-coalesce timer, and
    // scheduleRedetectAllLevels). If the SAME wall signature fires redetect more than
    // NOPROGRESS_MAX times inside NOPROGRESS_WINDOW_MS — a per-frame runaway from a
    // non-closing loop — stop firing until the geometry genuinely changes. A real
    // interaction never redetects one level 6× within a second on identical wall geometry.
    const sig = this._computeWallSig(levelId);
    if (sig !== '') {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const burst = this._noProgressBurst.get(levelId);
      if (burst && burst.sig === sig && (now - burst.ts) < NOPROGRESS_WINDOW_MS) {
        burst.count++;
        burst.ts = now;
        if (burst.count > NOPROGRESS_MAX) {
          console.warn(`[RoomTopologyObserver] redetect circuit-breaker TRIPPED (level=${levelId}, ${burst.count} same-geometry redetects in <${NOPROGRESS_WINDOW_MS}ms) — suppressing until walls change — §FIX-ROOMREDETECT-NOPROGRESS-GUARD`);
          return;
        }
      } else {
        this._noProgressBurst.set(levelId, { sig, count: 1, ts: now });
      }
    }
    try {
      if (this._disposed) return;
      const level = this.bimManager.getLevelById(levelId);
      if (!level) {
        console.debug(`[RoomTopologyObserver] Level '${levelId}' not found — skipping redetect`);
        return;
      }
      const cmd = new ReDetectRoomsCommand(levelId, level.elevation, level.height ?? 3.0);
      if ((window as any).runtime?.bus) { (window as any).runtime.bus.executeCommand('room.update', {}).catch(() => {}); }
      // §OPENED-REGION (L-880) — consume the arm HERE, at the moment a redetect
      // genuinely runs, so a redetect swallowed by one of the guards above leaves the
      // arm standing for the next one. Unarmed (load, resume, generation, an explicit
      // redetect) means no comparison at all — not a silent one.
      const openedRegionArmed = this._openedRegionArmed.delete(levelId);
      // The room set as it stood BEFORE this re-derivation. This is the only instant
      // at which it is still readable: ReDetectRoomsCommand replaces the level's rooms
      // in place. Cheap (ids + polygons), and only taken when armed.
      const roomsBefore = openedRegionArmed ? this._snapshotRooms(levelId) : undefined;
      this.commandManager.execute(cmd);
      if (openedRegionArmed) this._reportOpenedRegions(levelId, roomsBefore);
      // Record the geometry this completed redetect saw so a subsequent no-progress
      // committed event (identical walls) is gated out.
      if (sig !== '') this._lastRedetectWallSig.set(levelId, sig);
    } catch (err) {
      console.error('[RoomTopologyObserver] Error scheduling re-detection:', err);
    }
  }

  /**
   * §FIX-ROOMREDETECT-NOPROGRESS-GUARD (L-63) — a cheap, stable signature of the level's
   * wall geometry (id + baseline X/Z @ mm + thickness @ mm + HEIGHT @ mm). Room re-detection
   * is a pure function of this (plus curtain walls / slabs, which drive their own
   * subscriptions), so an unchanged signature means a fresh redetect can make no progress.
   * Returns '' when the wall store cannot be read (e.g. a minimal test harness with no
   * `getByLevel`), which disables both no-progress gates — behaviour is then exactly as
   * before this guard.
   *
   * ─── §PR-09-WALLSIG-HEIGHT (founder ruling, 2026-08-17) ────────────────────────────────
   * `height` is IN. `check-propagation-trackers-reach` arm A8 measured the divergence that
   * put it here: `DoorDependencyTracker._wallGeometryChanged` (DoorDependencyTracker.ts:131-139
   * and the window twin) treats a height change as a real move and RE-ANCHORS every hosted
   * opening for it, while this signature omitted height entirely. One edit, two verdicts —
   * "a move" to the trackers, "byte-identical geometry" to the observer — so a height-only
   * edit was DROPPED by the committed-path no-progress gate (`_onWallMutationCommitted`) and
   * counted as a same-signature repeat toward the execution circuit-breaker below. The
   * founder's ruling: *"a height change is a geometric identity change … it must invalidate
   * the signature."*
   *
   * ENCODING, and why it cannot fluctuate. The founder's caveat was *"use the
   * canonical/normalized wall height — NOT a derived value that can fluctuate because of
   * representation or floating-point noise."* So height is folded through the SAME `mm()`
   * quantiser the baseline coordinates and thickness already use — `Math.round(metres * 1000)`,
   * an INTEGER number of millimetres — off `WallData.height`, the required, authored,
   * metres-valued store field (WallTypes.ts:258). It is never re-derived from a level, a
   * slab offset, a rake projection or a built mesh. Rounding to integer mm means two doubles
   * that differ only in their last bits (`3` vs `0.1 + 0.2 + 2.7`) produce the SAME token,
   * while a genuine 1 mm authoring change produces a different one. Separator `^` is used so
   * the height field cannot be confused with `#` (thickness), `>` (endpoint) or `|` (wall).
   *
   * BASELINE `y` IS DELIBERATELY STILL ABSENT — it is a SEPARATE ruling, not an oversight.
   * The founder ruled on HEIGHT. A wall's authored vertical placement is `baseOffset`
   * (worldY = level.elevation + slabBaseOffset + baseOffset, SlabWallCoupling.ts:61), and
   * `baseLine[*].y` is documented by WallTypes.ts §WALL-AUDIT-2026-M7 as a world-space MIRROR
   * of `level.elevation` that goes STALE when a level moves and that the builder re-projects
   * away at render time — "only the persisted DTO value is misleading". Folding that field in
   * would satisfy the gate arm while encoding the value its own canonical-convention note
   * calls misleading, and would leave `baseOffset` — which NEITHER this signature NOR
   * `_wallGeometryChanged` reads — still unmeasured. That question stays a declared finding
   * on tools/rac-conformance/certification/gates/tracker-pairs.json rather than being closed
   * on a ruling nobody made.
   *
   * OVER-INVALIDATION IS THE OTHER FAILURE. This signature feeds two gates that exist to STOP
   * runaway redetect loops, so a field that flickers would be as harmful as a field that is
   * missing. Both directions are pinned in
   * `src/__tests__/roomRedetectNoProgressGuard.test.ts` §PR-09-WALLSIG-HEIGHT: a height-only
   * edit MUST change the signature; float noise, a `properties` patch and a `materialId`
   * change MUST NOT.
   */
  /**
   * §OPENED-REGION (L-880) — read the level's current rooms as plain
   * `RegionSnapshot`s. Returns `undefined` when the room store cannot answer (a
   * minimal test harness with no `getByLevel`), which disables the whole feature
   * rather than guessing — a comparison against an unknown "before" would produce
   * exactly the false offers this feature exists to avoid.
   */
  private _snapshotRooms(levelId: string): RegionSnapshot[] | undefined {
    try {
      const rs = this.roomStore as {
        getByLevel?: (id: string) => Array<{
          id?: string; name?: string;
          boundary?: { polygon?: Array<{ x?: number; z?: number }> };
        }>;
      };
      if (typeof rs?.getByLevel !== 'function') return undefined;
      const rooms = rs.getByLevel(levelId);
      if (!Array.isArray(rooms)) return undefined;
      const out: RegionSnapshot[] = [];
      for (const r of rooms) {
        const poly = r?.boundary?.polygon;
        if (!r?.id || !Array.isArray(poly) || poly.length < 3) continue;
        out.push({
          id: r.id,
          name: r.name,
          polygon: poly.map(v => ({ x: v?.x ?? 0, z: v?.z ?? 0 })),
        });
      }
      return out;
    } catch {
      return undefined;
    }
  }

  /**
   * §OPENED-REGION (L-880) — compare the room set across the re-derivation that just
   * ran and publish anything the move left standing open.
   *
   * NON-FATAL BY CONSTRUCTION. This is an observation about the edit, never part of
   * it: a throw here must not colour the wall move the user actually performed. Every
   * finding is logged whether or not anyone is subscribed — detection is not
   * contingent on the chat surface being reachable (the same reasoning that put the
   * §GR12 invalidation in the move writer rather than in a follow-up).
   */
  private _reportOpenedRegions(levelId: string, before: RegionSnapshot[] | undefined): void {
    if (!before || before.length === 0) return;
    try {
      const after = this._snapshotRooms(levelId);
      if (!after) return;
      const ws = this.wallStore as {
        getByLevel?: (id: string) => Array<{
          id?: string;
          baseLine?: ReadonlyArray<{ x?: number; z?: number }>;
          thickness?: number; height?: number; systemTypeId?: string;
        }>;
      };
      if (typeof ws?.getByLevel !== 'function') return;
      const rawWalls = ws.getByLevel(levelId) ?? [];
      const wallsAfter: SurvivingWall[] = [];
      for (const w of rawWalls) {
        const bl = w?.baseLine;
        if (!w?.id || !bl || bl.length < 2) continue;
        wallsAfter.push({
          id: w.id,
          start: { x: bl[0]?.x ?? 0, z: bl[0]?.z ?? 0 },
          end: { x: bl[1]?.x ?? 0, z: bl[1]?.z ?? 0 },
          thickness: w.thickness,
          height: w.height,
          systemTypeId: w.systemTypeId,
        });
      }
      if (wallsAfter.length === 0) return;

      const scan = scanForOpenedRegions({ levelId, roomsBefore: before, roomsAfter: after, wallsAfter });
      if (scan.findings.length === 0) return;

      // §PROMPT-REACHES-A-HUMAN (L-881) — the subscriber count is printed with EVERY
      // finding, and its absence is an ERROR, not a debug line.
      //
      // WHY: build `a75e8e1e` shipped with this detector firing correctly in production
      // and the founder seeing nothing. The console carried the finding and NOTHING
      // else, which is consistent with two very different failures — "the offer ran and
      // could not reach a surface" and "no offer was ever subscribed" — and the log
      // could not tell them apart. That ambiguity cost a founder test cycle. A reading
      // of `listeners=0` now names the second one on sight.
      const listeners = openedRegionNotifier.listenerCount;
      for (const finding of scan.findings) {
        if (finding.kind === 'region-opened') {
          console.warn(
            `[RoomTopologyObserver] §OPENED-REGION level='${levelId}' — ${finding.detail} ` +
            `(gap ${finding.gap.lengthM.toFixed(2)} m, anchored ${finding.gap.anchoredEndpoints}/2, ` +
            `rooms ${scan.roomsBefore} → ${scan.roomsAfter}, listeners=${listeners})`,
          );
        } else {
          console.warn(
            `[RoomTopologyObserver] §OPENED-REGION level='${levelId}' REFUSED to propose a position ` +
            `(${finding.reason}, listeners=${listeners}) — ${finding.detail}`,
          );
        }
        if (listeners === 0) {
          console.error(
            `[RoomTopologyObserver] §PROMPT-REACHES-A-HUMAN — a region was found to be OPEN and ` +
            `NOTHING is subscribed to say so. The user will not be asked. This is a wiring defect ` +
            `(initOpenedRegionProposals did not run, or ran against a different module instance), ` +
            `not a detection result.`,
          );
        }
        openedRegionNotifier.publish(finding);
      }
    } catch (err) {
      console.warn('[RoomTopologyObserver] §OPENED-REGION scan failed (non-fatal):', err);
    }
  }

  private _computeWallSig(levelId: string): string {
    try {
      const ws = this.wallStore as { getByLevel?: (id: string) => Array<{ id?: string; baseLine?: ReadonlyArray<{ x?: number; z?: number }>; thickness?: number; height?: number }> };
      if (typeof ws?.getByLevel !== 'function') return '';
      const walls = ws.getByLevel(levelId) ?? [];
      if (!Array.isArray(walls)) return '';
      const mm = (n: number | undefined): number => Math.round((n ?? 0) * 1000);
      const parts: string[] = [];
      for (const w of walls) {
        const bl = w?.baseLine;
        if (!bl || bl.length < 2) continue;
        parts.push(`${w.id ?? '?'}:${mm(bl[0]?.x)},${mm(bl[0]?.z)}>${mm(bl[1]?.x)},${mm(bl[1]?.z)}#${mm(w.thickness)}^${mm(w.height)}`);
      }
      parts.sort();
      return `n${walls.length}|${parts.join('|')}`;
    } catch {
      return '';
    }
  }
}
