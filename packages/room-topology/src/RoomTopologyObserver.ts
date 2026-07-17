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
  private paused = false;
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
  // ── ADR-0069 (GR1/GR2) — graph-authoritative levels ─────────────────────────
  // A level whose rooms were created DIRECTLY from the engine graph (the
  // executors dispatch `BatchCreateRoomsCommand` from `option.rooms`). For such a
  // level, AUTO-redetect MUST be suppressed: re-tracing the (possibly trimmed-
  // loose) walls would `mergeWithExisting`-ADD the fragmented faces ALONGSIDE the
  // graph rooms → DOUBLE rooms (the founder's "RBedroom002 / Room00-002" overlap).
  // The graph is the source of room identity. GR2: a genuine MANUAL structural
  // wall edit (`add`/`remove`, NOT a batched generation mutation, NOT a rebuild
  // `update`) on the level CLEARS the flag → detection re-asserts from then on.
  private _graphAuthoritativeLevels = new Set<string>();

  /** ADR-0069 — mark a level graph-authoritative: its rooms come from the engine
   *  graph, so the observer suppresses AUTO-redetect there (no fragmentation /
   *  double rooms). Cleared by a manual structural wall edit (GR2) or reset. */
  markGraphAuthoritative(levelId: string): void {
    this._graphAuthoritativeLevels.add(levelId);
  }
  /** Surrender graph authority for a level (manual edit / explicit re-detect). */
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
        // ADR-0069 GR2 — a genuine MANUAL structural wall edit (add/remove of a
        // wall, NOT a batched generation mutation and NOT a rebuild 'update')
        // surrenders graph authority for this level, so detection re-asserts from
        // now on (the graph was a generation-time seed, not a permanent lock).
        if ((event === 'add' || event === 'remove') && !batchCoordinator.isBatching
            && this._graphAuthoritativeLevels.has(wall.levelId)) {
          this._graphAuthoritativeLevels.delete(wall.levelId);
          console.debug(`[RoomTopologyObserver] graph authority surrendered (level=${wall.levelId}, manual ${event}) — ADR-0069 GR2`);
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
    if (this.paused || this._disposed) return;
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
  resume(): void { this.paused = false; }

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
    // add/remove) clears the flag first, so manual edits still re-detect normally.
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
      this.commandManager.execute(cmd);
      // Record the geometry this completed redetect saw so a subsequent no-progress
      // committed event (identical walls) is gated out.
      if (sig !== '') this._lastRedetectWallSig.set(levelId, sig);
    } catch (err) {
      console.error('[RoomTopologyObserver] Error scheduling re-detection:', err);
    }
  }

  /**
   * §FIX-ROOMREDETECT-NOPROGRESS-GUARD (L-63) — a cheap, stable signature of the level's
   * wall geometry (id + baseline endpoints @ mm + thickness). Room re-detection is a pure
   * function of this (plus curtain walls / slabs, which drive their own subscriptions), so
   * an unchanged signature means a fresh redetect can make no progress. Returns '' when the
   * wall store cannot be read (e.g. a minimal test harness with no `getByLevel`), which
   * disables both no-progress gates — behaviour is then exactly as before this guard.
   */
  private _computeWallSig(levelId: string): string {
    try {
      const ws = this.wallStore as { getByLevel?: (id: string) => Array<{ id?: string; baseLine?: ReadonlyArray<{ x?: number; z?: number }>; thickness?: number }> };
      if (typeof ws?.getByLevel !== 'function') return '';
      const walls = ws.getByLevel(levelId) ?? [];
      if (!Array.isArray(walls)) return '';
      const mm = (n: number | undefined): number => Math.round((n ?? 0) * 1000);
      const parts: string[] = [];
      for (const w of walls) {
        const bl = w?.baseLine;
        if (!bl || bl.length < 2) continue;
        parts.push(`${w.id ?? '?'}:${mm(bl[0]?.x)},${mm(bl[0]?.z)}>${mm(bl[1]?.x)},${mm(bl[1]?.z)}#${mm(w.thickness)}`);
      }
      parts.sort();
      return `n${walls.length}|${parts.join('|')}`;
    } catch {
      return '';
    }
  }
}
