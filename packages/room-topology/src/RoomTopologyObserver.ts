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

export class RoomTopologyObserver {
  readonly debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private paused = false;
  private _disposed = false;
  private _pendingPlacementLevels = new Set<string>();
  private _firstScheduleAt = new Map<string, number>();
  private _resetCount = new Map<string, number>();
  private _postBatchCooldownUntil = 0;
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

  /** F.events.15 typed handler — receives `{ levelIds }` from runtime.events. */
  private _onWallMutationCommitted = (payload: { levelIds?: readonly string[]; levelId?: string }): void => {
    if (this.paused || this._disposed) return;
    const ids = payload?.levelIds ?? (payload?.levelId ? [payload.levelId] : []);
    for (const levelId of ids) {
      if (!levelId) continue;
      const existing = this.debounceTimers.get(levelId);
      if (existing) clearTimeout(existing);
      this.debounceTimers.delete(levelId);
      this._firstScheduleAt.delete(levelId);
      this._resetCount.delete(levelId);
      this._executeRedetect(levelId);
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
    if (batchCoordinator.isBatching) {
      console.debug(`[RoomTopologyObserver] suppressed (level=${levelId}, reason=isBatching, source=schedule)`);
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
    } catch (err) {
      console.error('[RoomTopologyObserver] Error scheduling re-detection:', err);
    }
  }
}
