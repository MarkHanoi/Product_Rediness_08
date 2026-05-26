import * as THREE from '@pryzm/renderer-three/three';
import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';
import { WallStore, WallData, WallBaseline, OpeningRenderMap, OpeningRenderData, WallJoinResolver, JoinData, WallJunctionInfillManager, computeJunctionInfills, resolveSlabBaseOffsetForWall } from '@pryzm/geometry-wall';
import {
    DEFAULT_SNAP_PIXEL_RADIUS,
    getWorldToleranceForActiveCamera,
} from '@pryzm/core-app-model';
import { doorStore, doorSystemTypeStore } from '@pryzm/geometry-door';
import { windowStore, windowSystemTypeStore } from '@pryzm/geometry-window';

// §4.3 FIX: Pre-resolves window/door display data into a plain OpeningRenderMap
// before calling buildWall(). Exported for use by initWallLevelSubscribers.
//
// §M-H5 (DAILY-USE 2026-05-20) — Now also resolves the architect's system-type
// finish colours (door panel + window glass) so the WallFragmentBuilder legacy
// path renders them instead of the hard-coded `#8d6e63` / `#88ccff` defaults.
// Resolution order:
//   1. Try `doorStore.has(elementId)` / `windowStore.has(elementId)` — the new
//      DoorBuilder / WindowBuilder path owns rendering, set skipLegacyFrame.
//   2. Otherwise fall back to the legacy `wallStore.getDoor()` / .getWindow()
//      record, which is what older projects (pre-doorStore migration) hold.
//      Pull frameColor / leafColor / glazingOpacity directly from the record
//      when present, OR derive them from the door/window system type when the
//      record has a systemTypeId.
export function resolveOpeningRenderMap(wall: WallData, store: WallStore): OpeningRenderMap {
    const map = new Map<string, OpeningRenderData>();
    for (const op of (wall.openings ?? [])) {
        if (!op.elementId) continue;
        if (op.type === 'window') {
            if (windowStore.has(op.elementId)) { map.set(op.elementId, { skipLegacyFrame: true }); continue; }
            const wd = store.getWindow(op.elementId);
            if (wd) {
                // §M-H5 — resolve the system-type frame finish + glazing
                // opacity when the legacy record carries a systemTypeId.
                const wdSysTypeId = (wd as { systemTypeId?: string }).systemTypeId;
                const wdSysType   = wdSysTypeId ? windowSystemTypeStore.getById(wdSysTypeId) : undefined;
                const resolvedFrameColor = wd.frameColor
                    ?? wdSysType?.frameFinish?.materialColor
                    ?? undefined;
                // §M-H5 — glass colour: tint preference from the legacy record
                // wins; otherwise some window system types model glazing as a
                // separate finish (when present); falls through to the
                // WallFragmentBuilder default `#88ccff` clear glass.
                const resolvedGlassColor = (wd as { glassColor?: string }).glassColor
                    ?? (wdSysType as { glassFinish?: { materialColor?: string } } | undefined)?.glassFinish?.materialColor
                    ?? undefined;
                // §M-H5 — glazingOpacity from the system type (default 0.3
                // matches the legacy hard-coded value, so absence is a no-op).
                // WindowSystemType.glazingOpacity is the canonical field;
                // 0 = clear glass (transparent), 1 = opaque (no see-through).
                // The legacy WallFragmentBuilder uses Three.Material.opacity
                // semantics where 1 = fully visible, so invert when present.
                const resolvedGlassOpacity = typeof wdSysType?.glazingOpacity === 'number'
                    ? Math.max(0, Math.min(1, 1 - wdSysType.glazingOpacity * 0.7))  // clear → 0.3 default, fully opaque → 1.0
                    : undefined;
                map.set(op.elementId, {
                    frameColor:   resolvedFrameColor,
                    glassColor:   resolvedGlassColor,
                    glassOpacity: resolvedGlassOpacity,
                    windowType:   wd.windowType as 'single' | 'double' | undefined,
                    sillHeight:   wd.sillHeight,
                    baseOffset:   (wd as { baseOffset?: number }).baseOffset,
                });
            }
        } else if (op.type === 'door') {
            if (doorStore.has(op.elementId)) { map.set(op.elementId, { skipLegacyFrame: true }); continue; }
            const dd = store.getDoor(op.elementId);
            if (dd) {
                // §M-H5 — same shape as the window branch above: prefer the
                // explicit record colours, fall back to the door system type.
                const ddSysTypeId = (dd as { systemTypeId?: string }).systemTypeId;
                const ddSysType   = ddSysTypeId ? doorSystemTypeStore.getById(ddSysTypeId) : undefined;
                const resolvedFrameColor = dd.frameColor
                    ?? ddSysType?.frameFinish?.materialColor
                    ?? undefined;
                const resolvedLeafColor = (dd as { leafColor?: string }).leafColor
                    ?? ddSysType?.leafFinish?.materialColor
                    ?? undefined;
                map.set(op.elementId, {
                    frameColor:  resolvedFrameColor,
                    leafColor:   resolvedLeafColor,
                    panelColor:  resolvedLeafColor,  // alias — see WallOpeningRenderData.ts §M-H5
                    doorType:    dd.doorType as 'single' | 'double' | undefined,
                    sillHeight:  dd.sillHeight,
                    baseOffset:  (dd as { baseOffset?: number }).baseOffset,
                });
            }
        }
    }
    return map;
}

type _WallDirtyEntry = { event: 'add' | 'update' | 'remove'; wall: WallData; prevState?: WallData };

interface WallRebuildDeps {
    wallTool: { getWallStore(): WallStore; getFragmentBuilder(): any };
    slabStore: any;
    bimManager: any;
    doorBuilder: { rebuildForWall(id: string): void };
    windowBuilder: { rebuildForWall(id: string): void };
    world: any;
}

/**
 * WallRebuildCoordinator — owns the wall-dirty-batch scheduler (§DIRTY-BATCH),
 * window.__wallRebuildControl, window.__engineTeardown (C13 §3.2-3.4 surface),
 * and the view-activated guard.
 * Extracted from engineLauncher.ts Task 5.2.
 */
export class WallRebuildCoordinator {
    private _joinsResolving = false;
    private _infillManager = new WallJunctionInfillManager();
    private _pendingWallEvents = new Map<string, _WallDirtyEntry>();
    private _wallRafHandle: TickListenerDisposer | null = null;
    private _wallRebuildPaused = false;
    private _wallRebuildDiscarding = false;
    private _viewSwitchInProgress = false;
    private _prevJoinMap = new Map<string, JoinData>();
    private static readonly _ADJACENCY_TOL = 0.31;

    // Deps wired via init()
    private _wallTool!: WallRebuildDeps['wallTool'];
    private _slabStore!: any;
    private _bimManager!: any;
    private _doorBuilder!: WallRebuildDeps['doorBuilder'];
    private _windowBuilder!: WallRebuildDeps['windowBuilder'];
    private _world!: any;

    get isJoinsResolving(): boolean { return this._joinsResolving; }

    init(deps: WallRebuildDeps): void {
        this._wallTool     = deps.wallTool;
        this._slabStore    = deps.slabStore;
        this._bimManager   = deps.bimManager;
        this._doorBuilder  = deps.doorBuilder;
        this._windowBuilder = deps.windowBuilder;
        this._world        = deps.world;

        // §VIEW-DIRTY-CHECK §1.4
        window.runtime?.events?.on('view-activated', (payload: unknown) => { // F.events.8
            const p = payload as { source?: string } | undefined;
            if (p?.source !== 'view-switch') return;
            this._viewSwitchInProgress = true;
            getFrameScheduler().scheduleOnce('engine-bootstrap-view-switch-clear', () => {
                this._viewSwitchInProgress = false;
                // §FIX-VIEWSWITCH-DROP (C11 §7.0): drain wall mutations that arrived
                // DURING the view switch. _scheduleFlush() now queues them and defers
                // the flush while _viewSwitchInProgress is set; without this drain a
                // wall drawn in the plan pane mid-switch never receives a 3D mesh.
                if (this._pendingWallEvents.size > 0 && !this._wallRebuildPaused && this._wallRafHandle === null) {
                    this._wallRafHandle = getFrameScheduler().scheduleOnce('engine-bootstrap-wall-flush', () => this._flush());
                }
            });
        });

        window.__wallRebuildControl = {
            pause:              () => this._pause(),
            resume:             () => this._resume(),
            resumeAndFlush:     () => this._resumeAndFlush(),
            discardAndSuppress: () => this._discardAndSuppress(),
            restore:            () => this._restore(),
        };

        window.__engineTeardown = {
            resetWallRebuildState: () => this._resetState(),
            get isWallRebuildPaused():     boolean { return (window.__engineTeardown as any)._coord?._wallRebuildPaused ?? false; },
            get isWallRebuildDiscarding(): boolean { return (window.__engineTeardown as any)._coord?._wallRebuildDiscarding ?? false; },
            get pendingWallEventCount():   number  { return (window.__engineTeardown as any)._coord?._pendingWallEvents.size ?? 0; },
        };
        (window.__engineTeardown as any)._coord = this;

        // Wall store subscriber — thin dispatcher.
        deps.wallTool.getWallStore().subscribe((event, wall, prevState) => {
            if (this._joinsResolving) return;
            this._scheduleFlush(event, wall, prevState);
        });
    }

    private _pause(): void { this._wallRebuildPaused = true; }

    private _resumeAndFlush(): void {
        this._wallRebuildPaused = false;
        if (this._wallRafHandle !== null) { this._wallRafHandle(); this._wallRafHandle = null; }
        if (this._pendingWallEvents.size > 0) {
            try { this._flush(); } catch (err) { console.error('[WallRebuildCoordinator] end-of-load flush failed', err); }
        }
    }

    private _resume(): void {
        this._wallRebuildPaused = false;
        if (this._wallRafHandle !== null) return;
        if (this._pendingWallEvents.size > 0) {
            this._wallRafHandle = getFrameScheduler().scheduleOnce('engine-bootstrap-wall-flush-resume', () => this._flush(), 'pre-render');
        }
        console.debug('[WallRebuildCoordinator] §F.2 resume — async wall flush scheduled for next pre-render slot');
    }

    private _discardAndSuppress(): void {
        this._wallRebuildDiscarding = true;
        console.debug('[WallRebuildCoordinator] §BATCH-BUS-DISCARD: discard mode ON');
    }

    private _restore(): void {
        this._wallRebuildDiscarding = false;
        console.debug('[WallRebuildCoordinator] §BATCH-BUS-DISCARD: discard mode OFF');
    }

    private _resetState(): void {
        this._wallRebuildPaused     = false;
        this._wallRebuildDiscarding = false;
        this._joinsResolving        = false;
        if (this._wallRafHandle !== null) { try { this._wallRafHandle(); } catch { /* ignore */ } this._wallRafHandle = null; }
        this._pendingWallEvents.clear();
        this._prevJoinMap.clear();
        console.log('[WallRebuildCoordinator] C13 resetWallRebuildState() — wall pipeline clean for project switch');
    }

    private _scheduleFlush(event: 'add' | 'update' | 'remove', wall: WallData, prevState?: WallData): void {
        // §BATCH-BUS-DISCARD: discard mode is an intentional drop (project teardown).
        if (this._wallRebuildDiscarding) return;
        // §FIX-VIEWSWITCH-DROP (C11 §7.0): the mutation MUST be queued BEFORE any
        // deferral check below. Returning early here (as the old code did for
        // _viewSwitchInProgress) loses the wall permanently — there is no re-queue
        // path. Queue first, then decide whether to flush now or defer.
        const existing = this._pendingWallEvents.get(wall.id);
        const resolvedPrev = prevState ?? existing?.prevState;
        this._pendingWallEvents.set(wall.id, { event, wall, prevState: resolvedPrev });
        // Defer the flush — but never drop the event — while paused or mid view-switch.
        // _resume()/_resumeAndFlush() drains the pause case; the 'view-activated'
        // clear handler (see init()) drains the view-switch case.
        if (this._wallRebuildPaused) return;
        if (this._viewSwitchInProgress) return;
        if (this._wallRafHandle === null) {
            this._wallRafHandle = getFrameScheduler().scheduleOnce('engine-bootstrap-wall-flush', () => this._flush());
        }
    }

    private static _pt3dDist(a: {x:number;y:number;z:number}, b: {x:number;y:number;z:number}): number {
        return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2);
    }

    private static _findAdjacentWallIds(refBaseLine: WallBaseline, refId: string, store: { getAll(): WallData[] }): string[] {
        const [rA, rB] = refBaseLine;
        const adj: string[] = [];
        for (const w of store.getAll()) {
            if (w.id === refId) continue;
            const [wA, wB] = w.baseLine;
            if (WallRebuildCoordinator._pt3dDist(rA, wA) < WallRebuildCoordinator._ADJACENCY_TOL ||
                WallRebuildCoordinator._pt3dDist(rA, wB) < WallRebuildCoordinator._ADJACENCY_TOL ||
                WallRebuildCoordinator._pt3dDist(rB, wA) < WallRebuildCoordinator._ADJACENCY_TOL ||
                WallRebuildCoordinator._pt3dDist(rB, wB) < WallRebuildCoordinator._ADJACENCY_TOL) {
                adj.push(w.id);
            }
        }
        return adj;
    }

    private _flush(): void {
        this._wallRafHandle = null;
        if (this._pendingWallEvents.size === 0) return;

        const batch = new Map(this._pendingWallEvents);
        this._pendingWallEvents.clear();

        const builder = this._wallTool.getFragmentBuilder();
        const store   = this._wallTool.getWallStore();

        // §STEP7: Diff-based dirty marking — find former neighbours of moved/removed walls.
        for (const [, entry] of batch) {
            const { event, wall, prevState } = entry;
            if (!prevState) continue;
            const baselineChanged = event === 'remove' || (event === 'update' && prevState.baseLine && (
                WallRebuildCoordinator._pt3dDist(prevState.baseLine[0], wall.baseLine[0]) > 0.001 ||
                WallRebuildCoordinator._pt3dDist(prevState.baseLine[1], wall.baseLine[1]) > 0.001
            ));
            if (baselineChanged) {
                for (const nId of WallRebuildCoordinator._findAdjacentWallIds(prevState.baseLine, wall.id, store)) {
                    if (!batch.has(nId)) {
                        const neighbour = store.getById(nId);
                        if (neighbour) batch.set(nId, { event: 'update', wall: neighbour });
                    }
                }
            }
        }

        const affectedLevelIds = new Set<string>();
        for (const { wall } of batch.values()) affectedLevelIds.add(wall.levelId);

        for (const levelId of affectedLevelIds) {
            this._joinsResolving = true;
            try {
                for (const [wallId, { event }] of batch) {
                    if (event === 'remove') {
                        builder.removeWall(wallId);
                        try { window.__planSymbolCache?.invalidate(wallId); } catch { /* noop */ }
                    }
                }

                const levelWalls = store.getAll().filter((w: any) => w.levelId === levelId);
                const prevHadJoin = new Set<string>(this._prevJoinMap.keys());

                const _cam    = this._world.camera?.three;
                const _canvas = this._world.renderer?.three?.domElement as HTMLCanvasElement | undefined;
                const snapR   = getWorldToleranceForActiveCamera(DEFAULT_SNAP_PIXEL_RADIUS, _cam, _canvas);
                const adjustments = WallJoinResolver.resolveLevel(levelWalls, { snapRadius: snapR });

                // ─── ADR-0055 — Pascal wall pipeline cache refresh ─────────────
                // Orchestrator owns the level-wide miter cache used by the new
                // resolver→footprint→extruder chain in `WallFragmentBuilder`. We
                // refresh it ONCE per level rebuild here — after `resolveLevel`
                // returns the trimmed baselines, so the V2 resolver sees the same
                // wall geometry the legacy `MiterPrismBuilder` path consumes.
                // Pure data hand-off (L1→L1, no store reach-down inside the
                // builder); the builder owns geometry only, the coordinator owns
                // orchestration. Skipped silently if the builder lacks the method
                // (older runtimes) — V2 then falls back to the per-call auto path.
                try {
                    const refresh = (builder as unknown as {
                        refreshV2Cache?: (specs: ReadonlyArray<{ id: string; startXZ: { x: number; z: number }; endXZ: { x: number; z: number }; thickness: number }>) => void;
                    }).refreshV2Cache;
                    if (typeof refresh === 'function') {
                        const specs = levelWalls
                            .filter(w => w.baseLine?.length >= 2 && typeof w.thickness === 'number')
                            .map(w => ({
                                id: w.id,
                                startXZ: { x: w.baseLine[0].x, z: w.baseLine[0].z },
                                endXZ:   { x: w.baseLine[1].x, z: w.baseLine[1].z },
                                thickness: w.thickness,
                            }));
                        refresh.call(builder, specs);
                    }
                } catch (err) {
                    console.warn('[WallRebuildCoordinator] V2 cache refresh failed (non-fatal):', err);
                }
                // ────────────────────────────────────────────────────────────────

                const _rebuiltWallIds = new Set<string>();

                adjustments.forEach((adjustment: JoinData & { baseLine: [THREE.Vector3, THREE.Vector3] }, wallId: string) => {
                    const _adjBL = adjustment.baseLine;
                    const _newBL: WallBaseline = [
                        { x: _adjBL[0].x, y: _adjBL[0].y, z: _adjBL[0].z },
                        { x: _adjBL[1].x, y: _adjBL[1].y, z: _adjBL[1].z },
                    ];
                    const _preTrimWall = store.getById(wallId);
                    const _sourceBL: WallBaseline | undefined = _preTrimWall
                        ? [{ x: _preTrimWall.baseLine[0].x, y: _preTrimWall.baseLine[0].y, z: _preTrimWall.baseLine[0].z }, { x: _preTrimWall.baseLine[1].x, y: _preTrimWall.baseLine[1].y, z: _preTrimWall.baseLine[1].z }]
                        : undefined;
                    const _sourceBaseLineToStore = _preTrimWall?._sourceBaseLine ?? _sourceBL;
                    store.update(wallId, { baseLine: _newBL, ...(_sourceBaseLineToStore ? { _sourceBaseLine: _sourceBaseLineToStore } : {}) } as any);
                    const updated = store.getById(wallId);
                    if (updated) {
                        const slabOff = resolveSlabBaseOffsetForWall(updated, this._slabStore);
                        const lvl     = this._bimManager.getLevelById(updated.levelId);
                        const worldY  = (lvl?.elevation ?? 0) + slabOff + (updated.baseOffset ?? 0);
                        try {
                            builder.buildWall(updated, adjustment, resolveOpeningRenderMap(updated, store), worldY);
                            builder.recordBuiltVersion(wallId, updated, adjustment, slabOff);
                            _rebuiltWallIds.add(wallId);
                        } catch (err) {
                            console.error(`[WallRebuildCoordinator] §WALL-AUDIT-2026-C1: buildWall failed for wall "${wallId}" — continuing.`, err);
                        }
                    }
                });

                for (const [wallId, { event }] of batch) {
                    if (event !== 'remove' && !adjustments.has(wallId)) {
                        const fresh = store.getById(wallId);
                        if (fresh) {
                            const slabOff = resolveSlabBaseOffsetForWall(fresh, this._slabStore);
                            try {
                                builder.updateWall(fresh, null, resolveOpeningRenderMap(fresh, store), slabOff);
                                _rebuiltWallIds.add(wallId);
                            } catch (err) {
                                console.error(`[WallRebuildCoordinator] §WALL-AUDIT-2026-C1: updateWall (isolated) failed for wall "${wallId}" — continuing.`, err);
                            }
                        }
                    }
                }

                // §STALE-CACHE-FIX: rebuild walls that lost their join.
                for (const w of levelWalls) {
                    if (prevHadJoin.has(w.id) && !adjustments.has(w.id) && !batch.has(w.id)) {
                        const fresh = store.getById(w.id);
                        if (fresh) {
                            const slabOff = resolveSlabBaseOffsetForWall(fresh, this._slabStore);
                            try {
                                builder.updateWall(fresh, null, resolveOpeningRenderMap(fresh, store), slabOff);
                                _rebuiltWallIds.add(w.id);
                            } catch (err) {
                                console.error(`[WallRebuildCoordinator] §WALL-AUDIT-2026-C1: updateWall (stale-join) failed for wall "${w.id}" — continuing.`, err);
                            }
                        }
                    }
                }

                for (const w of levelWalls) this._prevJoinMap.delete(w.id);
                adjustments.forEach((adj: JoinData, wallId: string) => this._prevJoinMap.set(wallId, adj));

                // DW-14 FIX: reposition door/window meshes AFTER wall hole geometry is rebuilt.
                for (const wallId of _rebuiltWallIds) {
                    this._doorBuilder.rebuildForWall(wallId);
                    this._windowBuilder.rebuildForWall(wallId);
                }

                const _freshWalls = store.getAll().filter((w: any) => w.levelId === levelId);
                this._infillManager.update(computeJunctionInfills(_freshWalls), this._world.scene.three as THREE.Scene);
            } finally {
                this._joinsResolving = false;
            }
        }

        // §WALL-AUDIT-2026-W6 §COMMIT-BARRIER: emit quiescent signal.
        try {
            // F.events.15 — bim-wall-mutation-committed migrated from DOM CustomEvent to runtime.events.
            window.runtime?.events?.emit('bim-wall-mutation-committed', {
                levelIds: Array.from(affectedLevelIds),
                sourceCommandId: undefined,
            });
        } catch (err) {
            console.warn('[WallRebuildCoordinator] §WALL-AUDIT-2026-W6: failed to dispatch bim-wall-mutation-committed', err);
        }
    }
}
