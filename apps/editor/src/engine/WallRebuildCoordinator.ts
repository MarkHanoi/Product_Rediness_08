import * as THREE from '@pryzm/renderer-three/three';
import { getFrameScheduler, deferWork, type TickListenerDisposer, type DeferWorkCanceller } from '@pryzm/frame-scheduler';
import { WallStore, WallData, WallBaseline, OpeningRenderMap, OpeningRenderData, WallJoinResolver, JoinData, WallJunctionInfillManager, computeJunctionInfills, resolveSlabBaseOffsetForWall, isWallPipelineV2Enabled, classifyWallDelta, composeWallGeometryHash } from '@pryzm/geometry-wall';
import {
    DEFAULT_SNAP_PIXEL_RADIUS,
    getWorldToleranceForActiveCamera,
    perfTraceOn,
    perfLog,
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

// §WALL-CORNER-DIAG (PERF, 2026-06-27) — the §DIAG-PERIM-CORNER / -WHOLE corner
// probes and the per-wall §DIAG-OPENING-VOID logs are O(n²)-endpoint-cluster +
// heavy console I/O that ran UNCONDITIONALLY on every wall-mutation flush. They
// are NOT per-frame (the flush is event-driven via scheduleOnce), but on a 192-
// wall level each edit still paid the O(n²) cluster + ~dozens of console lines
// for zero production benefit. Gate the whole capability behind one cheap typed
// global so a normal session pays nothing; turn it on from the console with
//   globalThis.__pryzmWallCornerDiag = true
// to restore the full corner/void diagnostics. `_wallDiagOn()` is the single
// guard — read it ONCE per flush and skip the probe AND its string-building when
// off (the template interpolation is itself a cost we must not pay).
function _wallDiagOn(): boolean {
    return (globalThis as unknown as { __pryzmWallCornerDiag?: boolean }).__pryzmWallCornerDiag === true;
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

    // ─── §PERF-WALL-MOVE-INCREMENTAL-REBUILD (L-234) ──────────────────────────────
    //
    // THE founder's most-repeated bug: "the user moves a wall with a hosted door and
    // the project gets FROZEN — but the logs don't say much."
    //
    // MEASURED (packages/geometry-wall/__tests__/WallMoveRebuildCost.measure.test.ts,
    // real store + real command + real resolver + real fragment builder): moving ONE
    // wall on a level of N re-extruded EXACTLY N wall bodies — 5/5, 50/50, 200/200 —
    // and, at a realistic door density, re-cut EVERY door void on the level. Not a
    // loop, not a hang: an O(level) synchronous geometry storm on the main thread,
    // silent because the only instrumentation was behind `perfTraceOn()`.
    //
    // Root cause (this file): the whole-level branch calls `builder.buildWall(...)`
    // UNCONDITIONALLY for every wall `resolveLevel` returns an adjustment for — and on
    // a connected floor plate that is every wall. The builder's own dirty guard
    // (`_lastBuiltVersion`, consulted inside `updateWall`/`_buildWallInternal`) is
    // bypassed by that direct `buildWall` call, so no wall is ever skipped.
    //
    // FIX — a MEMOIZATION, not an approximation. `buildWall(wall, joinData, renderMap,
    // worldY)` is a deterministic function of exactly those four arguments. We record
    // a CONTENT hash of them per wall and skip the call when it is unchanged: the mesh
    // the call would produce is byte-identical to the mesh already in the scene. So a
    // skipped wall is provably a no-op, which is a far stronger guarantee than any
    // "affected set" heuristic could give (and it is why we did NOT make `resolveLevel`
    // partial — see the note at the bottom of WallDeltaClassifier.ts).
    //
    // Why it is evaluated on the POST-preserve inputs: `_baselineImmutable`
    // (§FIX-WALL-JOIN-BASELINE-IMMUTABLE, L-44/46/47) and §POST-RESOLVE-PRESERVE below
    // DISCARD most of the resolver's baseline moves before they reach the builder. The
    // key is composed from `updated` (the store record after that decision) and
    // `adjustment` (after the anchor has rewritten `_adjBL`), i.e. from the geometry as
    // it is ACTUALLY CONSUMED. A different-thickness neighbour whose endpoint move the
    // anchor throws away therefore hashes IDENTICALLY and is correctly skipped — it has
    // no rendered effect. (That discarded-endpoint-move behaviour is L-242's separate
    // open defect; it is not touched here.)
    //
    // Self-healing: the skip also requires the builder to STILL own a group for the
    // wall (`getWallRoot`). If any other subsystem disposed the mesh, we rebuild. The
    // key is dropped on remove, on the openings-only fast path (which rebuilds bodies
    // with a cached join outside this map's knowledge), and on project reset.
    //
    // Escape hatch (DevTools, matching the house style of every other guard here):
    //   `window.__pryzmWallIncrementalRebuild = false`  → unconditional rebuild (old behaviour).
    private _lastBuildKey = new Map<string, string>();

    /**
     * §PERF-WALL-MOVE-INCREMENTAL-REBUILD — content key over EVERY input
     * `builder.buildWall(wall, joinData, renderMap, worldY)` consumes.
     *
     * `composeWallGeometryHash` (packages/geometry-wall — the existing, contract-
     * documented composer; NOT a re-implementation) folds baseLine, height, thickness,
     * baseOffset, levelId, curve, the full opening set, systemTypeId/materialId, the
     * layer stack and the JoinData (trimmed baseline + both miter normals). We append
     * the two inputs it cannot see: the resolved `worldY` (level elevation + slab
     * offset + baseOffset) and the per-opening render map (door/window colours the
     * legacy in-wall frame path draws).
     */
    private static _buildKey(
        wall: WallData,
        joinData: JoinData | null | undefined,
        renderMap: OpeningRenderMap | undefined,
        slabBaseOffset: number,
        worldY: number,
    ): string {
        let rm = '';
        if (renderMap) {
            for (const [id, data] of renderMap) rm += `${id}=${JSON.stringify(data)};`;
        }
        return `${composeWallGeometryHash(wall, joinData, slabBaseOffset)}|y${worldY.toFixed(4)}|rm${rm}`;
    }

    /** §PERF-WALL-MOVE-INCREMENTAL-REBUILD — default ON; `false` restores the old unconditional rebuild. */
    private static _incrementalRebuildOn(): boolean {
        return (globalThis as unknown as { __pryzmWallIncrementalRebuild?: boolean })
            .__pryzmWallIncrementalRebuild !== false;
    }

    // §A.21.D28-COALESCE (2026-06-30) — de-dup redundant explicit `rebuildWalls()`
    // re-queues. The generated-layout pipelines (and the resi §RESI-EXTERIOR-WALL-
    // MITER-FIX2 corner pass) call `rebuildWalls(sameWallSet)` REPEATEDLY across a
    // single generation+settle — and a sibling agent confirmed it fires again on mere
    // hover. Each call previously re-queued the whole exterior set + logged + scheduled
    // a flush, so the full set was rebuilt several times per settle. We fingerprint the
    // requested id-set; while an IDENTICAL set is still pending (queued + a flush
    // scheduled, not yet drained) a repeat call is a no-op. The fingerprint clears when
    // the flush actually drains (`_flush` start) so a genuinely-new post-edit re-queue
    // for the same walls still runs.
    private _pendingRebuildKey: string | null = null;

    // §FIX-WALLFLUSH-NOPROGRESS-GUARD (L-97, founder 2026-07-04) — the wall-rebuild-flush
    // analogue of the room-redetect §FIX-ROOMREDETECT-NOPROGRESS-GUARD (L-63). A whole-level
    // `_flush` writes each resolved wall's baseline back to the store (`store.update`); that
    // store mutation fires a buffered `wall:update` that re-arms `_scheduleFlush` AFTER
    // `_joinsResolving` clears. Normally the next flush is a no-op, but when a moved
    // door-bearing wall lands in a `§SELF-CLUSTER-GUARD` cluster (a wall whose BOTH ends fall
    // in one junction cluster) the resolver keeps wanting to re-write it, so the flush re-arms
    // EVERY rAF frame and never converges → the founder's hard freeze. `_flush` is a PURE
    // function of the level's wall geometry: if the store geometry is byte-identical to what
    // the LAST completed flush already built, this flush can make NO progress. These bound the
    // re-arm: (1) a per-level no-progress gate skips the flush when the level's wall signature
    // is unchanged since the last completed flush; (2) a circuit-breaker trips if the same
    // signature reaches `_flush` more than FLUSH_NOPROGRESS_MAX times inside the window. A
    // genuine edit changes the signature → both release immediately.
    private _lastFlushLevelSig = new Map<string, string>();
    private _flushBurst = new Map<string, { sig: string; count: number; ts: number }>();
    private static readonly _FLUSH_NOPROGRESS_MAX = 8;
    private static readonly _FLUSH_WINDOW_MS = 1_000;

    // §DIAG-WALL-MOVE-FREEZE (L-250) — see the block in `_flush()`. A 1-second rolling
    // window over flush count + wall-clock, so a frozen tab prints ONE line that says which
    // subsystem is actually looping instead of leaving us to guess a sixth hypothesis.
    private static _diagWindow = { ts: 0, flushes: 0, ms: 0, warned: false };
    private static readonly _DIAG_FLUSHES_PER_SEC = 30;

    // §PERF-WALL-RESOLVE-ONCE-PER-GEN (L-131 P1) — end-of-generation resolve coalescing.
    // A large multi-family generation triggers whole-level `WallJoinResolver.resolveLevel`
    // ~3× PER LEVEL: the mitre-corner pass (§RESI-EXTERIOR-WALL-MITER-FIX2, re-armed via
    // fireAfterSettle) + the openings/doors/windows repair passes each call
    // `__wallRebuildControl.rebuildWalls(ids)`, and each takes the whole-level path
    // (no prevState ⇒ `classifyWallDelta` = 'whole-level'). resolveLevel is a PURE
    // function of the level's CURRENT store geometry, so running it once at the very end
    // (after every wall + opening has settled into the store) is byte-identical to running
    // it 3× — the last resolve is authoritative; the earlier ones are redundant. While a
    // generation coalesce window is open the coordinator ACCUMULATES the requested wall ids
    // instead of resolving inline, then runs ONE whole-level resolve per affected level when
    // the window closes (the executor fires it once the generation is quiescent; a backstop
    // timer fires it if the executor never does). Gated by `__pryzmWallResolveOncePerGen`
    // (default ON — set `false` to revert to the per-pass inline resolves). This changes
    // ONLY the SCHEDULING of resolveLevel, never the join math.
    private _genCoalesceActive = false;
    private _genPendingIds = new Set<string>();
    private _genTerminalCancel: DeferWorkCanceller | null = null;
    // Quiet-period after the LAST rebuildWalls accumulate before the terminal resolve fires.
    // Must exceed the largest inter-pass gap (the openings pass fires its rebuildWalls ~250ms
    // after its batch settles; other passes poll wall-readiness) so all corner + opening-void
    // requests coalesce into ONE terminal per level. A late straggler after the window closes
    // still resolves correctly (just as a separate flush) — the no-progress guard backstops
    // any redundant re-arm.
    private static readonly _GEN_TERMINAL_QUIET_MS = 1_500;
    // Absolute backstop: if no accumulate ever re-arms the debounce (e.g. a zero-wall build),
    // close the window anyway so the corners/voids are applied and an open window can't leak
    // into a later generation.
    private static readonly _GEN_COALESCE_BACKSTOP_MS = 20_000;

    // §PERF-GEN-INSTRUMENT (L-131 P0) — per-level resolveLevel counter for one generation,
    // reset at generation begin. Only written when `perfTraceOn()`; lets the founder capture
    // before/after resolve counts on prod (flag OFF ≈ 3/level, flag ON ≈ 1/level).
    private _resolveCountByLevel = new Map<string, number>();

    private _resolveOncePerGenOn(): boolean {
        return (globalThis as { __pryzmWallResolveOncePerGen?: boolean }).__pryzmWallResolveOncePerGen !== false;
    }

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
            // §A.21.D7-FIX — true while this coordinator still has wall events queued
            // OR the WallFragmentBuilder still has builds queued / a drain rAF live.
            // Lets the BatchCoordinator idle-probe complete openings-only / furnish-only
            // batches (which build no walls) in ~2 frames instead of the 8 s watchdog.
            hasPendingBuilds:   () => this._hasPendingBuilds(),
            // §A.21.D28 — force a rebuild of specific walls from CURRENT store data,
            // independent of the pending-event queue and the §BATCH-BUS-DISCARD window.
            // The generated-layout pipelines add window/door OPENINGS via a batch that
            // overlaps the preceding wall batch's discard window — so the
            // `addOpening → emit('update')` rebuild signal is silently dropped (the
            // discard pattern assumes the wall was already built in the batch drain,
            // which is FALSE for an openings-on-existing-walls batch). The result: the
            // opening is in the data but the wall mesh keeps its solid body until an
            // unrelated manual edit triggers a whole-level rebuild. This entry point
            // lets the generator explicitly re-queue the affected walls AFTER its
            // openings batch settles, reproducing exactly the rebuild the manual
            // WindowTool gets for free (no discard window in the manual path).
            rebuildWalls:       (wallIds: readonly string[]) => this._rebuildWalls(wallIds),
            // §A.21.D40 #3 — rebuild ONLY the named walls' BODIES (their opening holes)
            // from current store data, WITHOUT re-running the whole-level
            // `WallJoinResolver.resolveLevel` / V2-cache / junction-infill pass. Used by
            // the generated-layout post-openings repair: `rebuildWalls` above takes the
            // whole-level path (no prevState), which RE-TRIMS every wall on the level —
            // and on the GROUND floor (where interior partitions were welded ONTO the
            // user's pre-drawn shell) that zoom-dependent re-resolve perturbs the shell
            // baselines ("ground walls go off at the end"). This body-only path reuses
            // each wall's already-resolved miter cache (`_prevJoinMap`) so the welded
            // ground shell geometry stays EXACTLY put while the new opening holes still
            // appear. Falls back to `rebuildWalls` (whole-level) when a wall has no
            // cached join (never resolved) so a free wall still renders correctly.
            rebuildWallBodies:  (wallIds: readonly string[]) => this._rebuildWallBodies(wallIds),
            // §PERF-WALL-DRAG-DEFER (ADR-061) — drain wall events queued during a
            // wall drag once the gizmo is released (drag-end safety net).
            resumeAndFlushDeferredDrag: () => this._resumeAndFlushDeferredDrag(),
            // §PERF-WALL-RESOLVE-ONCE-PER-GEN (L-131 P1) — open/close a generation coalesce
            // window so the mitre-corner + openings repair passes resolve each level ONCE at
            // end-of-generation instead of ~3×. See _beginGenerationResolveCoalesce.
            beginGenerationResolveCoalesce: () => this._beginGenerationResolveCoalesce(),
            endGenerationResolveCoalesce:   () => this._endGenerationResolveCoalesce(),
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
        if (this._pendingWallEvents.size === 0) return;
        // §WALL-JOIN-LOAD-SKIP (2026-06-24) — project-open HANG fix. When the
        // ProjectLoader sets `window.__pryzmWallRestoreFlush = true` for the duration of a
        // restore-from-snapshot, the persisted wall geometry is ALREADY join-resolved (the
        // store `baseLine` is the trimmed/welded line the last resolve produced, persisted
        // verbatim by ProjectSerializer §WALL-JOIN-SAVE-FIX). Re-running the whole-level
        // `WallJoinResolver.resolveLevel` / `_clampPartitionEndsToShellInnerFace` pass on
        // EVERY level on the critical load thread is the confirmed hang root for large
        // residential buildings (hundreds–thousands of walls × 5–6 floors blocks the main
        // thread → "Loading Auto-save…" forever); the §POST-RESOLVE-PRESERVE guard already
        // reports that re-resolve as REDUNDANT ("rendered + persisted geometry unchanged;
        // the rejected re-resolve is NOT applied"). So on restore we BUILD every queued
        // wall body directly from its persisted baseline (O(walls), no resolve), then defer
        // ONE whole-level resolve per level OFF the critical path (a later frame) to refine
        // the mitered end-caps — the project is interactive immediately, joints settle a
        // frame or two later. The live-EDIT path (flag unset) is byte-identical to before.
        const _restoreFlag = (globalThis as unknown as { __pryzmWallRestoreFlush?: boolean }).__pryzmWallRestoreFlush === true;
        if (_restoreFlag) {
            try { this._flushRestore(); } catch (err) { console.error('[WallRebuildCoordinator] §WALL-JOIN-LOAD-SKIP restore flush failed — falling back to full flush', err); this._flush(); }
            return;
        }
        try { this._flush(); } catch (err) { console.error('[WallRebuildCoordinator] end-of-load flush failed', err); }
    }

    /**
     * §WALL-JOIN-LOAD-SKIP (2026-06-24) — RESTORE-mode flush. Builds every queued wall
     * body from its PERSISTED (already-resolved) baseline WITHOUT running the whole-level
     * `WallJoinResolver.resolveLevel` / `_clampPartitionEndsToShellInnerFace` pass — that
     * pass is the project-open hang root and is redundant on restore (the persisted
     * baseline is the resolved geometry). It then schedules ONE deferred whole-level
     * resolve per affected level (via the existing `_rebuildWalls` whole-level path) on a
     * later frame, OFF the critical load thread, so the mitered end-caps are refined
     * exactly as a live edit would produce them — but the project is interactive first.
     *
     * Visual parity: a wall built with `joinData = null` renders on its own (persisted,
     * already-trimmed) centreline with square end caps — the corner miters appear once the
     * deferred resolve lands. For the common case the trimmed baselines already meet at the
     * junction so any residual cap difference is sub-frame and corrected by the deferred
     * pass. This NEVER touches the live-edit `_flush` path.
     */
    private _flushRestore(): void {
        this._wallRafHandle = null;
        const batch = new Map(this._pendingWallEvents);
        this._pendingWallEvents.clear();
        if (batch.size === 0) return;

        const builder = this._wallTool.getFragmentBuilder();
        const store   = this._wallTool.getWallStore();

        const affectedLevelIds = new Set<string>();
        let built = 0;
        this._joinsResolving = true;
        try {
            for (const [wallId, { event }] of batch) {
                if (event === 'remove') {
                    builder.removeWall(wallId);
                    try { window.__planSymbolCache?.invalidate(wallId); } catch { /* noop */ }
                    continue;
                }
                const fresh = store.getById(wallId);
                if (!fresh) continue;
                affectedLevelIds.add(fresh.levelId);
                const slabOff = resolveSlabBaseOffsetForWall(fresh, this._slabStore);
                const lvl     = this._bimManager.getLevelById(fresh.levelId);
                const worldY  = (lvl?.elevation ?? 0) + slabOff + (fresh.baseOffset ?? 0);
                try {
                    // joinData = null → build on the persisted (resolved) baseline. The
                    // deferred whole-level resolve below refines the mitered caps.
                    builder.buildWall(fresh, null, resolveOpeningRenderMap(fresh, store), worldY);
                    builder.recordBuiltVersion(wallId, fresh, null, slabOff);
                    this._doorBuilder.rebuildForWall(wallId);
                    this._windowBuilder.rebuildForWall(wallId);
                    built++;
                } catch (err) {
                    console.error(`[WallRebuildCoordinator] §WALL-JOIN-LOAD-SKIP: restore buildWall failed for "${wallId}" — continuing.`, err);
                }
            }
        } finally {
            this._joinsResolving = false;
        }

        console.log(
            `[WallRebuildCoordinator] §WALL-JOIN-LOAD-SKIP — restored ${built} wall(s) across ` +
            `${affectedLevelIds.size} level(s) from persisted baselines (NO load-time resolveLevel); ` +
            `deferring one whole-level resolve per level off the critical path.`,
        );

        // Commit barrier — identical to the whole-level path so room-redetect / OTel /
        // plan-cache consumers behave the same.
        try {
            window.runtime?.events?.emit('bim-wall-mutation-committed', {
                levelIds: Array.from(affectedLevelIds),
                sourceCommandId: undefined,
            });
        } catch (err) {
            console.warn('[WallRebuildCoordinator] §WALL-JOIN-LOAD-SKIP: failed to dispatch bim-wall-mutation-committed', err);
        }

        // Defer the authoritative whole-level resolve OFF the critical load thread. We
        // re-queue every restored wall per level as a plain `update` (no prevState ⇒
        // whole-level rebuild) and run `_flush` from a later frame slot. This produces the
        // exact mitered geometry a live edit would, but only after the project is already
        // interactive — so the load itself never blocks on the resolver. Spread across
        // levels via one scheduleOnce per level keeps any single frame's resolve bounded.
        const restoredByLevel = new Map<string, string[]>();
        for (const [wallId, { event }] of batch) {
            if (event === 'remove') continue;
            const w = store.getById(wallId);
            if (!w) continue;
            (restoredByLevel.get(w.levelId) ?? restoredByLevel.set(w.levelId, []).get(w.levelId)!).push(wallId);
        }
        let _delay = 0;
        for (const [levelId, ids] of restoredByLevel) {
            const _ids = ids.slice();
            getFrameScheduler().scheduleOnce(
                `wall-join-load-skip-deferred-resolve-${levelId}-${_delay++}`,
                () => {
                    try { this._rebuildWalls(_ids); }
                    catch (err) { console.warn(`[WallRebuildCoordinator] §WALL-JOIN-LOAD-SKIP deferred resolve for level ${levelId} failed (non-fatal):`, err); }
                },
                'post-render',
            );
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

    /**
     * §A.21.D7-FIX — true while there is still wall work pending anywhere in the
     * pipeline: events queued in this coordinator (not yet flushed into the builder),
     * a coordinator flush rAF in flight, OR the WallFragmentBuilder still has builds
     * queued / a drain rAF live. The BatchCoordinator idle-probe reads this to decide
     * when an in-progress batch is genuinely done.
     */
    private _hasPendingBuilds(): boolean {
        if (this._pendingWallEvents.size > 0 || this._wallRafHandle !== null) return true;
        try {
            const builder = this._wallTool?.getFragmentBuilder?.();
            if (builder && builder.hasPendingBuilds === true) return true;
        } catch { /* builder not wired yet — treat as not pending */ }
        return false;
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
        // §PERF-WALL-MOVE-INCREMENTAL-REBUILD — a project switch throws the scene away;
        // every wall must rebuild from scratch on the new project's first flush.
        this._lastBuildKey.clear();
        this._pendingRebuildKey = null;   // §A.21.D28-COALESCE — clear fingerprint on project switch
        // §PERF-WALL-RESOLVE-ONCE-PER-GEN — abandon any open generation coalesce window
        // (a project switch mid-generation must not carry accumulated ids across projects).
        if (this._genTerminalCancel) { try { this._genTerminalCancel(); } catch { /* ignore */ } this._genTerminalCancel = null; }
        this._genCoalesceActive = false;
        this._genPendingIds.clear();
        this._resolveCountByLevel.clear();
        console.log('[WallRebuildCoordinator] C13 resetWallRebuildState() — wall pipeline clean for project switch');
    }

    /**
     * §PERF-WALL-RESOLVE-ONCE-PER-GEN (L-131 P1) — open a generation coalesce window.
     * While open, `_rebuildWalls(ids)` ACCUMULATES the requested wall ids instead of
     * running a whole-level `WallJoinResolver.resolveLevel` immediately; the single
     * terminal resolve (one per affected level) runs when `_endGenerationResolveCoalesce`
     * fires. The generator (ResidentialBuildingExecutor) opens the window before its
     * mitre + openings passes and fires the terminal once the generation is quiescent.
     *
     * P0/P1 SEPARATION: the per-level resolve counter reset + the begin log run whenever
     * perf-trace is on, REGARDLESS of the P1 flag — so a flag-OFF run still captures the
     * BEFORE baseline (~3 resolves/level) and a flag-ON run the AFTER (~1). Coalescing
     * itself only activates when `__pryzmWallResolveOncePerGen` is ON (default).
     */
    private _beginGenerationResolveCoalesce(): void {
        if (perfTraceOn()) {
            this._resolveCountByLevel.clear();
            perfLog('§PERF-GEN-INSTRUMENT', 'generation begin — wall resolveLevel counter reset');
        }
        // Cancel any stale window from a prior generation before opening a fresh one.
        if (this._genTerminalCancel) { this._genTerminalCancel(); this._genTerminalCancel = null; }
        if (!this._resolveOncePerGenOn()) {
            // Flag OFF → legacy behaviour: the passes' rebuildWalls calls resolve inline.
            this._genCoalesceActive = false;
            this._genPendingIds.clear();
            return;
        }
        this._genCoalesceActive = true;
        this._genPendingIds.clear();
        // Absolute backstop so an open window can never leak (see field doc).
        this._genTerminalCancel = deferWork(() => {
            this._genTerminalCancel = null;
            if (this._genCoalesceActive) {
                console.warn('[WallRebuildCoordinator] §PERF-WALL-RESOLVE-ONCE-PER-GEN — backstop closing generation coalesce window (executor terminal never fired)');
                this._endGenerationResolveCoalesce();
            }
        }, WallRebuildCoordinator._GEN_COALESCE_BACKSTOP_MS);
    }

    /**
     * §PERF-WALL-RESOLVE-ONCE-PER-GEN (L-131 P1) — close the generation coalesce window
     * and run the single terminal rebuild over every accumulated wall id. Because the
     * window is now closed, `_rebuildWalls(ids)` takes its normal whole-level path — all
     * accumulated ids land in ONE `_pendingWallEvents` batch, so `_flush` resolves each
     * affected level EXACTLY ONCE from the final store geometry (identical mitred corners
     * + opening void cuts to the ~3 inline resolves these passes triggered before).
     * Idempotent: a no-op when no window is open / nothing was accumulated.
     */
    private _endGenerationResolveCoalesce(): void {
        if (this._genTerminalCancel) { this._genTerminalCancel(); this._genTerminalCancel = null; }
        if (!this._genCoalesceActive) return;
        this._genCoalesceActive = false;
        const ids = Array.from(this._genPendingIds);
        this._genPendingIds.clear();
        if (perfTraceOn()) {
            perfLog('§PERF-GEN-INSTRUMENT', `end-of-gen terminal — ${ids.length} coalesced wall id(s) → one whole-level resolve per affected level`);
        }
        if (ids.length === 0) return;
        // Window closed → real whole-level path (single coalesced flush).
        this._rebuildWalls(ids);
    }

    /**
     * §A.21.D28 — force-rebuild a set of walls from CURRENT store data.
     *
     * Re-queues each named wall as an `update` event (no `prevState` → the
     * §STEP7 neighbour-diff and the ADR-057 openings-only fast path are both
     * skipped, so `_flush` takes the authoritative whole-level rebuild for the
     * affected level(s) — identical to what a manual opening placement triggers).
     *
     * This deliberately IGNORES `_wallRebuildDiscarding` and `_wallRebuildPaused`:
     * it is an EXPLICIT, post-batch repair call made by the generated-layout
     * pipelines once their openings batch has fully settled, precisely because
     * the implicit `addOpening → emit('update')` signal was dropped while a batch
     * discard/pause window was open. It must therefore queue + flush regardless of
     * those guards. It still honours `_joinsResolving` (defers to a frame slot so
     * it never re-enters an in-flight resolve).
     */
    private _rebuildWalls(wallIds: readonly string[]): void {
        // §PERF-WALL-RESOLVE-ONCE-PER-GEN (L-131 P1) — inside an open generation coalesce
        // window, ACCUMULATE the requested ids and defer the whole-level resolveLevel to the
        // single end-of-generation terminal (`_endGenerationResolveCoalesce`). Every
        // generation pass (mitre corners, openings/doors/windows repair) funnels through here;
        // holding them until the store has fully settled lets one terminal resolve per level
        // produce byte-identical corners + void cuts at ~1/3 the resolveLevel calls. NOTE:
        // manual edits never reach this method (they flow through `_scheduleFlush → _flush`),
        // so only the generator pipelines are coalesced. `_endGenerationResolveCoalesce`
        // clears the flag BEFORE re-invoking, so the terminal drain takes the real path below.
        if (this._genCoalesceActive) {
            let added = 0;
            for (const id of wallIds) {
                if (typeof id === 'string' && id.length > 0 && !this._genPendingIds.has(id)) { this._genPendingIds.add(id); added++; }
            }
            // Re-arm the terminal debounce: every generation pass (mitre corners, openings,
            // doors, windows, entrance) funnels its rebuildWalls request through here, so the
            // terminal fires QUIET_MS after the LAST pass queues its walls — i.e. once the
            // store is quiescent and every corner + opening void is captured. deferWork
            // survives background-tab throttling (the passes themselves use it).
            if (this._genTerminalCancel) this._genTerminalCancel();
            this._genTerminalCancel = deferWork(() => {
                this._genTerminalCancel = null;
                this._endGenerationResolveCoalesce();
            }, WallRebuildCoordinator._GEN_TERMINAL_QUIET_MS);
            if (perfTraceOn()) perfLog('§PERF-GEN-INSTRUMENT', `rebuildWalls coalesced +${added} id(s) (pending=${this._genPendingIds.size})`);
            return;
        }
        const store = this._wallTool?.getWallStore?.();
        if (!store) return;
        // §A.21.D28-COALESCE — if an IDENTICAL set is already queued with a flush
        // pending (not yet drained), this re-queue is redundant: the in-flight flush
        // will rebuild exactly these walls. Skip it (no re-queue, no log, no extra
        // flush schedule). The key clears when `_flush()` actually drains. A different
        // set, or a repeat after the flush drained, proceeds normally.
        const _key = wallIds.length > 0
            ? Array.from(new Set(wallIds)).sort().join(',')
            : '';
        if (
            _key !== '' &&
            this._pendingRebuildKey === _key &&
            (this._wallRafHandle !== null || this._joinsResolving)
        ) {
            return;
        }
        let queued = 0;
        for (const id of wallIds) {
            const wall = store.getById(id);
            if (!wall) continue;
            // No prevState → classifyWallDelta returns 'whole-level' (the openings
            // membership changed vs. the last build), so every wall on the level is
            // rebuilt from current data — the same authoritative path the manual
            // WindowTool exercises.
            this._pendingWallEvents.set(wall.id, { event: 'update', wall });
            queued++;
        }
        if (queued === 0) return;
        this._pendingRebuildKey = _key;
        console.log(`[WallRebuildCoordinator] §A.21.D28 rebuildWalls — re-queued ${queued} wall(s) for an explicit post-openings rebuild`);
        // If a resolve is mid-flight, or a flush is already scheduled, let that run
        // (it will pick up the freshly-queued walls). Otherwise schedule one now.
        if (this._joinsResolving) {
            if (this._wallRafHandle === null) {
                this._wallRafHandle = getFrameScheduler().scheduleOnce('engine-bootstrap-wall-flush', () => this._flush());
            }
            return;
        }
        if (this._wallRafHandle !== null) return;
        this._wallRafHandle = getFrameScheduler().scheduleOnce('engine-bootstrap-wall-flush', () => this._flush());
    }

    /**
     * §A.21.D40 #3 — rebuild ONLY the named walls' bodies (their opening holes) from
     * current store data, REUSING each wall's last-resolved miter/trim cache and
     * SKIPPING the whole-level `resolveLevel` / V2-cache / junction-infill pass.
     *
     * WHY (the "ground walls go off at the end" defect): the generated-house pipeline
     * welds the ground interior partitions ONTO the user's PRE-DRAWN shell, then —
     * after the openings batch settles — repairs the host-wall meshes so the new holes
     * show. The repair previously went through `_rebuildWalls`, which queues an `update`
     * with NO prevState → `classifyWallDelta` returns `whole-level` →
     * `WallJoinResolver.resolveLevel` re-runs over the WHOLE ground level with a
     * zoom-dependent snap radius. Because the welded partition endpoints now sit ON the
     * shell, that re-resolve can treat partition↔shell contacts as fresh corner joins
     * and RE-TRIM (move) the shell baselines — the perimeter that rendered correctly
     * shifts/breaks. Opening creation does NOT move any baseline, so the shell trim is
     * pure collateral damage.
     *
     * This path rebuilds each wall body via `builder.updateWall(fresh, cachedJoin, …)`
     * exactly like the ADR-057 openings-only fast path, but is driven DIRECTLY (not via
     * the classifier, which forces whole-level on an opening-SET change). It never calls
     * `resolveLevel`, so no baseline is touched — the welded ground shell stays put.
     *
     * Walls grouped per level (the helper emits the commit barrier per level). Honours
     * `_joinsResolving` by deferring to a frame slot, like `_rebuildWalls`.
     */
    private _rebuildWallBodies(wallIds: readonly string[]): void {
        const store = this._wallTool?.getWallStore?.();
        if (!store) return;
        // Resolve each id to its current level; skip ids not in the store.
        const byLevel = new Map<string, string[]>();
        for (const id of wallIds) {
            const wall = store.getById(id);
            if (!wall) continue;
            (byLevel.get(wall.levelId) ?? byLevel.set(wall.levelId, []).get(wall.levelId)!).push(id);
        }
        if (byLevel.size === 0) return;

        // ── §A.21.D61 — PERIMETER-CORNER CAP CONSISTENCY (the no-window-side gap) ──
        // The body-only path reuses each wall's CACHED `_prevJoinMap` JoinData so the
        // welded ground shell stays put (D40). That is correct ONLY when the wall was
        // previously whole-level resolved: the cache then holds the EXACT miter the
        // resolver gave it, which is the SAME plane it shares with its corner
        // neighbour (a CORNER join writes BOTH walls' miters in one `_applyCorner`, so
        // the cached pair is mutually consistent). Rebuilding the windowed wall from
        // that cache reproduces the identical end cap, and the un-rebuilt no-window
        // neighbour already carries the matching cached miter → the corner stays flush.
        //
        // BUT a windowed wall with NO cache entry (never whole-level resolved — e.g.
        // the generated-layout pipeline added its opening before any resolve touched
        // it) would here build with `cachedJoinData = null` → a SQUARE end cap. Its
        // corner NEIGHBOUR, if it WAS resolved, still renders its cached MITER. The two
        // caps no longer share a plane → a gap/overlap opens — and it shows on the
        // section that has NO window (the un-rebuilt mitered neighbour), exactly the
        // founder's report. The D40 header documents a "falls back to rebuildWalls when
        // a wall has no cached join" escape — it was never actually implemented here.
        //
        // Fix (minimal, deterministic, NO extra `resolveLevel` for the cached case):
        // split each level's ids by whether `_prevJoinMap` has them. CACHED ids keep
        // the body-only fast path (D40 perf + ground-walls-stay-put intact). UNCACHED
        // ids are routed to the whole-level `_rebuildWalls` path, which runs ONE
        // `resolveLevel` that mitres the windowed wall AND its corner neighbour
        // together → both caps come from the same `_applyCorner` and are flush by
        // construction. This only ever fires for a wall the resolver had not yet seen,
        // so it cannot perturb the already-correct welded shell (those are cached).
        const cachedByLevel = new Map<string, string[]>();
        const uncachedIds: string[] = [];
        for (const [levelId, ids] of byLevel) {
            const cached: string[] = [];
            for (const id of ids) {
                if (this._prevJoinMap.has(id)) cached.push(id);
                else                           uncachedIds.push(id);
            }
            if (cached.length > 0) cachedByLevel.set(levelId, cached);
        }

        const run = (): void => {
            const builder = this._wallTool.getFragmentBuilder();
            const liveStore = this._wallTool.getWallStore();
            let total = 0;
            for (const [levelId, ids] of cachedByLevel) {
                this._flushOpeningsOnly(ids, levelId, builder, liveStore);
                total += ids.length;
            }
            console.log(
                `[WallRebuildCoordinator] §A.21.D40 rebuildWallBodies — rebuilt ${total} wall body/bodies ` +
                `(no resolveLevel re-trim) across ${cachedByLevel.size} level(s)` +
                (uncachedIds.length
                    ? `; §A.21.D61 routed ${uncachedIds.length} uncached wall(s) to whole-level for corner-cap consistency`
                    : ''),
            );
            // §DIAG-PERIM-CORNER (founder #10, 2026-06-12) — the founder reports the
            // perimeter corners read CLEAN right after the shell is drawn but DEGRADE
            // once interior walls + openings are placed ("the joint generator seems to
            // not action again"). This body-only repair reuses each wall's CACHED miter
            // and deliberately skips `resolveLevel`, so the FINAL corner state is whatever
            // the last whole-level resolve left — and is never re-mitred with the COMPLETE
            // wall set. To pick the right fix WITHOUT another blind change to this
            // hang-prone path (v180), capture the exact corner state now: cluster all
            // level walls' UNTRIMMED endpoints; for every 2-wall L-corner report whether
            // BOTH walls carry a cached miter and the GAP between their cached TRIMMED
            // corner endpoints (a clean corner ⇒ the two trimmed ends coincide; a gap ⇒
            // the cap planes no longer meet → the visible open corner). Pure logging.
            // §WALL-CORNER-DIAG (PERF) — opt-in; skipped (cluster + strings) when off.
            if (_wallDiagOn()) try {
                for (const [levelId] of cachedByLevel) {
                    const lvlWalls = liveStore.getAll().filter((w: WallData) => w.levelId === levelId);
                    // Untrimmed (source) endpoints → true corners cluster even after a trim.
                    const ends: Array<{ id: string; side: 'start' | 'end'; p: { x: number; z: number } }> = [];
                    for (const w of lvlWalls) {
                        const src = (w as unknown as { _sourceBaseLine?: ReadonlyArray<{ x: number; z: number }> })._sourceBaseLine ?? w.baseLine;
                        ends.push({ id: w.id, side: 'start', p: { x: src[0].x, z: src[0].z } });
                        ends.push({ id: w.id, side: 'end',   p: { x: src[1].x, z: src[1].z } });
                    }
                    const TOL = 0.12;            // corner-cluster radius (m)
                    const used = new Set<number>();
                    let corners = 0, bothCached = 0, gappy = 0;
                    for (let i = 0; i < ends.length; i++) {
                        if (used.has(i)) continue;
                        const grp = [i];
                        for (let j = i + 1; j < ends.length; j++) {
                            if (used.has(j)) continue;
                            if (ends[i]!.id === ends[j]!.id) continue;
                            const dx = ends[i]!.p.x - ends[j]!.p.x, dz = ends[i]!.p.z - ends[j]!.p.z;
                            if (dx * dx + dz * dz <= TOL * TOL) grp.push(j);
                        }
                        if (grp.length !== 2) continue;            // only pure 2-wall L-corners here
                        grp.forEach(k => used.add(k));
                        corners++;
                        const a = ends[grp[0]!]!, b = ends[grp[1]!]!;
                        const ja = this._prevJoinMap.get(a.id) as (JoinData & { baseLine?: [THREE.Vector3, THREE.Vector3] }) | undefined;
                        const jb = this._prevJoinMap.get(b.id) as (JoinData & { baseLine?: [THREE.Vector3, THREE.Vector3] }) | undefined;
                        const capPt = (j: typeof ja, side: 'start' | 'end'): { x: number; z: number } | null => {
                            const bl2 = j?.baseLine; if (!bl2) return null;
                            const v = side === 'start' ? bl2[0] : bl2[1]; return { x: v.x, z: v.z };
                        };
                        const pa = capPt(ja, a.side), pb = capPt(jb, b.side);
                        const both = !!pa && !!pb;
                        if (both) bothCached++;
                        const gap = both ? Math.hypot(pa!.x - pb!.x, pa!.z - pb!.z) : NaN;
                        if (both && gap > 0.005) {
                            gappy++;
                            console.warn(
                                `[WallRebuildCoordinator] §DIAG-PERIM-CORNER ⚠ ${levelId} corner ${a.id}(${a.side})↔${b.id}(${b.side}) ` +
                                `GAP=${(gap * 1000).toFixed(0)}mm — cached cap planes no longer meet (open corner).`,
                            );
                        } else if (!both) {
                            console.warn(
                                `[WallRebuildCoordinator] §DIAG-PERIM-CORNER ⚠ ${levelId} corner ${a.id}(${a.side})↔${b.id}(${b.side}) ` +
                                `cachedMiter: ${a.id}=${ja ? 'yes' : 'NO'} ${b.id}=${jb ? 'yes' : 'NO'} — a square-capped side ⇒ mismatched corner.`,
                            );
                        }
                    }
                    console.log(
                        `[WallRebuildCoordinator] §DIAG-PERIM-CORNER ${levelId} summary: L-corners=${corners} ` +
                        `bothCached=${bothCached} gappy(>5mm or square-cap)=${gappy + (corners - bothCached)}`,
                    );
                }
            } catch (err) {
                console.warn('[WallRebuildCoordinator] §DIAG-PERIM-CORNER probe failed (non-fatal):', err);
            }
            // §A.21.D61 — uncached walls (never resolved) need a whole-level pass so the
            // windowed wall AND its corner neighbour are mitred together → flush corner.
            if (uncachedIds.length > 0) {
                this._rebuildWalls(uncachedIds);
            }
        };
        // If a resolve is mid-flight, defer to a frame slot so we never re-enter it.
        if (this._joinsResolving) {
            getFrameScheduler().scheduleOnce('engine-bootstrap-wall-bodies', run);
            return;
        }
        run();
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
        // §PERF-WALL-DRAG-DEFER (ADR-061) — while a wall is being dragged via the
        // 3D gizmo / endpoint handle, the event is queued (above) but the
        // expensive whole-level `_flush` (WallJoinResolver.resolveLevel +
        // per-wall buildWall re-cutting hosted openings) is DEFERRED until the
        // drag ends. The mesh follows the gizmo live via WallTransformController
        // (visual-only), so feedback stays smooth; the authoritative rebuild,
        // room redetect, and plan re-projection fire ONCE on release via
        // resumeAndFlushDeferredDrag(). This mirrors the door-move pattern
        // (ADR-057) and stops the synchronous rebuild storm from blocking the
        // interaction frame. The drag-end commit clears the flag BEFORE its own
        // store mutation, so that final mutation takes the immediate path below.
        if (typeof window !== 'undefined' && window.__wallDragInProgress === true) return;
        if (this._wallRafHandle === null) {
            this._wallRafHandle = getFrameScheduler().scheduleOnce('engine-bootstrap-wall-flush', () => this._flush());
        }
    }

    /**
     * §PERF-WALL-DRAG-DEFER (ADR-061) — drain any wall events that were queued
     * while `window.__wallDragInProgress` was set (a wall drag in flight). Called
     * by registerTransformDragHandler on drag-END as a safety net for the rare
     * case where the drag moved sub-threshold and dispatched no command (so no
     * store mutation re-triggered `_scheduleFlush`). Schedules ONE whole-level
     * flush if events are pending and none is already scheduled. Honours the
     * pause / view-switch guards exactly like `_scheduleFlush`.
     */
    private _resumeAndFlushDeferredDrag(): void {
        if (this._pendingWallEvents.size === 0) return;
        if (this._wallRebuildPaused) return;
        if (this._viewSwitchInProgress) return;
        if (this._wallRafHandle !== null) return;
        this._wallRafHandle = getFrameScheduler().scheduleOnce('engine-bootstrap-wall-flush', () => this._flush());
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

    // §POST-RESOLVE-PRESERVE constants (mirror the standalone replica in
    // apps/editor/__tests__/postResolvePreserveGuard.test.ts).
    private static readonly _PRESERVE_STUB_LEN = 0.15;   // = DEGENERATE_STUB_LENGTH
    private static readonly _PRESERVE_LATERAL_TOL = 0.02; // = PARITY_TOL_MM (20mm); never widen
    private static readonly _PRESERVE_EXTEND_TOL = 0.50;  // a real corner miter extends a wall by < half its thickness; 0.5m = spike

    /**
     * §POST-RESOLVE-PRESERVE-ANCHOR — pure decision used by `_flush` (and exercised
     * directly by the reload-stability regression test). Given the wall's committed
     * store baseline (`sourceBL`), its TRUE anchor (`trueSourceBL` = `_sourceBaseLine`
     * when present, else `sourceBL`), the resolver's freshly-computed baseline
     * (`newBL`), and whether the resolver flagged the wall invalid, decide whether the
     * re-resolve result is DESTRUCTIVE and must be reverted. When it returns
     * `preserve: true`, the caller MUST commit `anchorBL` to the store as BOTH
     * `baseLine` and `_sourceBaseLine` so the rendered geometry, the persisted record,
     * and the next resolve all anchor to the same fixed line — making reload
     * idempotent (no lateral drift accumulating across opens).
     */
    static decidePreservedBaseline(
        sourceBL: WallBaseline | undefined,
        trueSourceBL: WallBaseline | undefined,
        newBL: WallBaseline,
        adjInvalid: boolean,
    ): { preserve: boolean; anchorBL: WallBaseline | null } {
        if (!sourceBL) return { preserve: false, anchorBL: null };
        const dst = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(b.x - a.x, b.z - a.z);
        const preLen = dst(sourceBL[0], sourceBL[1]);
        const newLen = dst(newBL[0], newBL[1]);
        const L = preLen || 1e-9;
        const ux = (sourceBL[1].x - sourceBL[0].x) / L;
        const uz = (sourceBL[1].z - sourceBL[0].z) / L;
        const perp = (p: { x: number; z: number }) => Math.abs((p.x - sourceBL[0].x) * uz - (p.z - sourceBL[0].z) * ux);
        const lateral = Math.max(perp(newBL[0]), perp(newBL[1]));
        const wasValid = preLen >= WallRebuildCoordinator._PRESERVE_STUB_LEN;
        const overExtended = newLen > preLen + WallRebuildCoordinator._PRESERVE_EXTEND_TOL;
        const destructive = adjInvalid
            || newLen < WallRebuildCoordinator._PRESERVE_STUB_LEN
            || lateral > WallRebuildCoordinator._PRESERVE_LATERAL_TOL
            || overExtended;
        if (wasValid && destructive) {
            return { preserve: true, anchorBL: trueSourceBL ?? sourceBL };
        }
        return { preserve: false, anchorBL: null };
    }

    /**
     * ADR-057 P1 (OI-053h) — single-wall openings-only rebuild branch.
     *
     * Precondition (proven by `classifyWallDelta`): every wall in `wallIds` had
     * ONLY its opening VALUES (offset/width/height/sill) change — baseline,
     * thickness, layers, curve, the opening SET, and the wall set are all
     * unchanged, and all walls are on `levelId`. Under that precondition the
     * level joins, the V2 miter cache, and the junction infills are invariant,
     * so this branch rebuilds ONLY each affected wall's body geometry (its hole)
     * via `builder.updateWall(fresh, cachedJoinData, renderMap, slabOff)`, then
     * re-anchors only that wall's hosted children. It does NOT touch
     * `WallJoinResolver.resolveLevel`, `refreshV2Cache`, `computeJunctionInfills`,
     * `_prevJoinMap`, or any neighbour wall — producing identical visual output
     * to a full rebuild for this delta at O(edited walls) instead of
     * O(walls-per-level).
     *
     * MITER PRESERVATION: `cachedJoinData` is read back from `_prevJoinMap`, which
     * holds the exact `JoinData` (trimmed baseLine + start/end miter normals) the
     * LAST whole-level resolve produced for this wall. Because the baseline,
     * thickness and adjacency are invariant under an openings-only change, that
     * cached JoinData is still the correct one — passing it (rather than `null`)
     * preserves the wall's mitered end caps exactly as a full rebuild would. The
     * `_renderVersion` bump from the opening edit still busts the builder's cache
     * key, so the wall body is genuinely rebuilt with the new hole + old miters.
     * A wall with no `_prevJoinMap` entry (a free, never-joined wall) passes
     * `null`, which is the correct "no miter" input.
     *
     * The §WJR-NAN-GUARD consumer guard inside `builder.updateWall` →
     * `buildWall` is still traversed (we call the same builder entry point), so
     * a degenerate baseline is still skipped on this path.
     */
    private _flushOpeningsOnly(
        wallIds: string[],
        levelId: string,
        builder: ReturnType<WallRebuildDeps['wallTool']['getFragmentBuilder']>,
        store: WallStore,
    ): void {
        this._joinsResolving = true;
        const _rebuiltWallIds: string[] = [];
        // §DIAG-OPENING-VOID (2026-06-10) — walls whose store record HAS openings but
        // whose group came out of the body-only rebuild WITHOUT a void-cut body (still
        // instanced, or no WallPart body mesh). Those are the interior-partition doors
        // the founder saw "leaf against a solid wall". We collect them and fall back to
        // the proven whole-level `_rebuildWalls` path (the apartment behaviour) so the
        // void is actually carved — the body-only fast path's cached join can leave the
        // wall un-bodied (e.g. a stale/`invalid` cached JoinData hides the group at
        // buildWall:760, or the instance→mesh transition didn't fire). Empty in the
        // common (correct) case ⇒ no extra resolveLevel, welded-shell-stays-put intact.
        const _voidNotCut: string[] = [];
        try {
            for (const wallId of wallIds) {
                const fresh = store.getById(wallId);
                if (!fresh) continue;
                const slabOff = resolveSlabBaseOffsetForWall(fresh, this._slabStore);
                // Re-use the wall's last-resolved join (miter normals + trimmed
                // baseline) — invariant under an openings-only edit. null when free.
                const cachedJoinData = this._prevJoinMap.get(wallId) ?? null;
                // §PERF-WALL-MOVE-INCREMENTAL-REBUILD (L-234) — this fast path rebuilds the
                // body through the builder's OWN guard with a CACHED join, outside the
                // whole-level memo's knowledge. Drop the memo entry so the next whole-level
                // flush can never mistake this wall for "already built with those inputs".
                // Strictly conservative: the worst case is one redundant rebuild.
                this._lastBuildKey.delete(wallId);
                try {
                    builder.updateWall(fresh, cachedJoinData, resolveOpeningRenderMap(fresh, store), slabOff);
                    _rebuiltWallIds.push(wallId);

                    // §DIAG-OPENING-VOID — verify the void was actually cut for every
                    // opening-bearing wall on this fast path. The wall body is rendered
                    // as box segments AROUND each opening (a WallPart child mesh per
                    // segment); an instanced wall has NO WallPart child (only a hit-proxy)
                    // and a `joinData.invalid`-hidden group has NO body at all. Either ⇒
                    // the door leaf shows but no hole is carved (the founder's interior-
                    // partition defect). Detect it and queue the wall for the whole-level
                    // fallback below.
                    const _openings = fresh.openings ?? [];
                    if (_openings.length > 0) {
                        // An instanced wall's group has only a `hit-proxy` child and NO
                        // WallPart/WallLayer body mesh; a `joinData.invalid`-hidden group
                        // has no body either. Both ⇒ bodyParts === 0 ⇒ no void carved.
                        const group = builder.getWallRoot(wallId);
                        let bodyParts = 0;
                        let isHidden = false;
                        let hasHitProxy = false;
                        if (group) {
                            isHidden = group.visible === false || group.userData?.__wjrNaNHidden === true;
                            for (const child of group.children) {
                                const ud = (child as { userData?: { elementType?: string; role?: string } }).userData;
                                if (ud?.elementType === 'WallPart' || ud?.elementType === 'WallLayer') bodyParts++;
                                if (ud?.role === 'hit-proxy') hasHitProxy = true;
                            }
                        }
                        // §DIAG-OPENING-VOID (functional, NOT gated): voidCut drives the
                        // whole-level fallback below, so it must always run. The `path`
                        // label + the verbose per-wall info log ARE diagnostic — only
                        // build the string / emit when §WALL-CORNER-DIAG is on.
                        const voidCut = !isHidden && bodyParts > 0;
                        const path = (): string => !group ? 'no-group'
                            : (bodyParts === 0 && hasHitProxy) ? 'instanced'
                            : isHidden ? 'hidden(invalid-join?)'
                            : (fresh.layers && fresh.layers.length > 0) ? 'layered-grid'
                            : 'single-segmented';
                        if (_wallDiagOn()) {
                            console.log(
                                `[WallRebuildCoordinator] §DIAG-OPENING-VOID wall=${wallId} ` +
                                `level=${levelId} openings=${_openings.length} path=${path()} ` +
                                `bodyParts=${bodyParts} cachedJoin=${cachedJoinData ? (cachedJoinData.invalid ? 'INVALID' : 'yes') : 'null'} ` +
                                `voidCut=${voidCut}`,
                            );
                        }
                        if (!voidCut) {
                            // A genuine defect (door leaf on an un-carved wall) — keep this
                            // warn unconditional; it is rare and routes to the repair path.
                            console.warn(
                                `[WallRebuildCoordinator] §DIAG-OPENING-VOID ⚠ wall=${wallId} has ${_openings.length} ` +
                                `opening(s) but the body-only rebuild did NOT cut the void (path=${path()}) — ` +
                                `routing to the whole-level rebuild so the hole is carved.`,
                            );
                            _voidNotCut.push(wallId);
                        }
                    }
                } catch (err) {
                    console.error(`[WallRebuildCoordinator] §ADR-057-P1: openings-only updateWall failed for wall "${wallId}" — continuing.`, err);
                }
            }

            // DW-14 FIX: re-anchor door/window meshes AFTER the hole geometry rebuilt.
            for (const wallId of _rebuiltWallIds) {
                this._doorBuilder.rebuildForWall(wallId);
                this._windowBuilder.rebuildForWall(wallId);
            }
        } finally {
            this._joinsResolving = false;
        }

        // §DIAG-OPENING-VOID — whole-level fallback for any opening-bearing wall the
        // body-only path failed to carve. `_rebuildWalls` queues each as an `update`
        // with no prevState ⇒ `_flush` runs the authoritative whole-level rebuild
        // (fresh `resolveLevel` join + `buildWall` from current store data, which
        // unregisters from instancing and builds the segmented void body) — exactly
        // the path the apartment generator's interior doors take, where the void IS
        // cut. Runs AFTER `_joinsResolving` is cleared so it isn't deferred onto an
        // in-flight resolve.
        if (_voidNotCut.length > 0) {
            this._rebuildWalls(_voidNotCut);
        }

        // §WALL-AUDIT-2026-W6 §COMMIT-BARRIER — emit the quiescent signal exactly
        // as the whole-level path does, so downstream consumers (plan-cache warm,
        // room redetect listeners, OTel commit barrier) behave identically.
        try {
            window.runtime?.events?.emit('bim-wall-mutation-committed', {
                levelIds: [levelId],
                sourceCommandId: undefined,
            });
        } catch (err) {
            console.warn('[WallRebuildCoordinator] §ADR-057-P1: failed to dispatch bim-wall-mutation-committed', err);
        }
    }

    /**
     * §FIX-WALLFLUSH-NOPROGRESS-GUARD (L-97) — a cheap, stable signature of EVERY input the
     * whole-level `_flush` rebuild consumes: for each wall, id + baseline @ mm + thickness +
     * height + baseOffset + opening set (offset/width/sill/height) + layer thicknesses + curve
     * control + material (id / colour). `_flush` (resolveLevel → footprint → miter-prism →
     * hosted-child re-anchor + material) is a pure function of exactly these, so an unchanged
     * signature means a fresh flush can build nothing new. CRITICALLY it covers material /
     * height / baseOffset too, so a legitimate material or elevation edit (which leaves the
     * join geometry unchanged) still changes the signature and is NEVER suppressed — only a
     * genuine no-op re-arm (the baseline anchor write-back, which touches none of these beyond
     * a baseline it leaves byte-identical once converged) is gated out. Order-independent.
     */
    private _levelWallSig(levelId: string, store: { getAll(): any[] }): string {
        try {
            const walls = store.getAll().filter((w: any) => w && w.levelId === levelId);
            const mm = (n: number | undefined): number => Math.round((Number(n) || 0) * 1000);
            const parts: string[] = [];
            for (const w of walls) {
                const bl = w.baseLine;
                if (!bl || bl.length < 2 || !bl[0] || !bl[1]) continue;
                const ops = (w.openings ?? [])
                    .map((o: any) => `${mm(o.offset)},${mm(o.width)},${mm(o.sillHeight)},${mm(o.height)}`)
                    .sort()
                    .join(';');
                const lys = (w.layers ?? []).map((l: any) => mm(l.thickness)).join(',');
                const cv = w.curve ? `${mm(w.curve.control?.x)},${mm(w.curve.control?.z)}` : '';
                const mat = `${w.materialId ?? ''}/${w.materialColor ?? ''}`;
                parts.push(
                    `${w.id}:${mm(bl[0].x)},${mm(bl[0].z)}>${mm(bl[1].x)},${mm(bl[1].z)}` +
                    `#${mm(w.thickness)}h${mm(w.height)}b${mm(w.baseOffset)}|o[${ops}]|l[${lys}]|c[${cv}]|m[${mat}]`,
                );
            }
            parts.sort();
            return `n${parts.length}|${parts.join('|')}`;
        } catch {
            // Any read failure → a UNIQUE token so the guard never falsely suppresses a flush.
            return `err${Math.random()}`;
        }
    }

    private _flush(): void {
        this._wallRafHandle = null;
        // §A.21.D28-COALESCE — the drain is starting; clear the explicit-rebuild
        // fingerprint so a genuinely-new post-drain `rebuildWalls(sameSet)` is honoured.
        this._pendingRebuildKey = null;
        if (this._pendingWallEvents.size === 0) return;

        const batch = new Map(this._pendingWallEvents);
        this._pendingWallEvents.clear();

        const builder = this._wallTool.getFragmentBuilder();
        const store   = this._wallTool.getWallStore();

        // ─── §DIAG-WALL-MOVE-FREEZE (L-250) — MAKE THE FREEZE REPORT ITSELF ──────────────
        //
        // The founder's #1 bug: moving/resizing a wall that hosts a door freezes the tab.
        // It has now survived L-01/ADR-0099, L-97, and L-234 — and, as of today, a FRESH
        // bundle. Every hypothesis reachable from a test has been REFUTED BY MEASUREMENT:
        //
        //   · the rebuild is O(affected), not O(level)   — 200 wall bodies → 4, 48 CSG → 0
        //     (WallMoveRebuildCost.measure.test.ts, on HEAD)
        //   · WallJoinResolver.resolveLevel CONVERGES     — it is a fixed point even on the
        //     §SELF-CLUSTER topology a Length edit creates
        //     (WallJoinResolver.hostedDoorLengthEditNoHang.test.ts)
        //   · the no-progress guard below CANNOT be defeated by a version counter — the
        //     level signature is millimetre-rounded geometry only, so it is stable.
        //
        // So the freeze is NOT the rebuild cost, NOT the resolver, and NOT this loop — and I
        // cannot reproduce it from a test. That means the ONLY way forward is to make the
        // LIVE app produce the evidence, instead of guessing at a sixth hypothesis.
        //
        // This counts flushes and wall-clock inside a 1-second window and, when a single
        // settle blows past a sane bound, prints ONE loud line carrying the state that
        // actually discriminates between the remaining explanations: how many flushes fired,
        // how long they took, how many walls are on the level, and whether the level
        // signature is CHANGING (a real oscillation, geometry that will not settle) or STATIC
        // (the loop is upstream of us — the re-arm is coming from the view/projection layer,
        // not the wall pipeline). Those two answers point at completely different subsystems.
        //
        // Cheap by construction: two counters and a timestamp on a path that already runs.
        {
            const _now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
            const w = WallRebuildCoordinator._diagWindow;
            if (_now - w.ts > 1_000) { w.ts = _now; w.flushes = 0; w.ms = 0; w.warned = false; }
            w.flushes++;
            const _t0 = _now;
            // Report ONCE per window, the moment the bound is crossed — never spam a frozen tab.
            if (!w.warned && w.flushes > WallRebuildCoordinator._DIAG_FLUSHES_PER_SEC) {
                w.warned = true;
                const lvls = new Set<string>();
                for (const { wall } of batch.values()) lvls.add(wall.levelId);
                const levelId = [...lvls][0] ?? '?';
                const wallsOnLevel = (() => {
                    try { return store.getAll().filter((x: any) => x?.levelId === levelId).length; }
                    catch { return -1; }
                })();
                const sigNow  = (() => { try { return this._levelWallSig(levelId, store); } catch { return '?'; } })();
                const sigLast = this._lastFlushLevelSig.get(levelId) ?? '(none)';
                const doorWalls = (() => {
                    try {
                        return store.getAll()
                            .filter((x: any) => x?.levelId === levelId && (x.openings?.length ?? 0) > 0).length;
                    } catch { return -1; }
                })();
                console.warn(
                    `[WallRebuildCoordinator] §DIAG-WALL-MOVE-FREEZE (L-250) — ${w.flushes} flushes in <1s ` +
                    `(${w.ms.toFixed(0)}ms in flush). level=${levelId} walls=${wallsOnLevel} wallsWithOpenings=${doorWalls} ` +
                    `batch=${batch.size} — level signature is ${sigNow === sigLast ? 'STATIC (the re-arm is UPSTREAM of the wall pipeline — look at the view/projection layer)' : 'CHANGING (a genuine geometric oscillation — the walls will not settle)'}`,
                );
            }
            // Charge this flush's cost to the window on the way out.
            queueMicrotask(() => {
                const _t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
                WallRebuildCoordinator._diagWindow.ms += (_t1 - _t0);
            });
        }

        // §FIX-WALLFLUSH-NOPROGRESS-GUARD (L-97) — break the self-re-arming flush loop. This
        // runs BEFORE the openings-only fast path so BOTH rebuild paths are covered. If the
        // store geometry of every affected level is byte-identical to what the last completed
        // flush already built, this flush can make no progress (the re-arm after a
        // §SELF-CLUSTER-GUARD wall keeps getting re-written) → skip it entirely: no resolve, no
        // fast-path body rebuild, no store.update, no `bim-wall-mutation-committed`, so the loop
        // terminates. A genuine edit changes a level's signature and releases the gate; the
        // circuit-breaker is the belt-and-braces if any rebuild input the signature does not
        // capture still oscillates.
        const _flushLevels = new Set<string>();
        for (const { wall } of batch.values()) _flushLevels.add(wall.levelId);
        {
            const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
            const sigByLevel = new Map<string, string>();
            let anyProgress = false;
            for (const levelId of _flushLevels) {
                const sig = this._levelWallSig(levelId, store);
                sigByLevel.set(levelId, sig);
                if (this._lastFlushLevelSig.get(levelId) !== sig) anyProgress = true;
            }
            if (!anyProgress && this._lastFlushLevelSig.size > 0) {
                console.debug('[WallRebuildCoordinator] §FIX-WALLFLUSH-NOPROGRESS-GUARD flush skipped — wall geometry unchanged since the last completed flush');
                return;
            }
            for (const [levelId, sig] of sigByLevel) {
                const b = this._flushBurst.get(levelId);
                if (b && b.sig === sig && (now - b.ts) < WallRebuildCoordinator._FLUSH_WINDOW_MS) {
                    b.count++;
                    if (b.count > WallRebuildCoordinator._FLUSH_NOPROGRESS_MAX) {
                        console.warn(`[WallRebuildCoordinator] §FIX-WALLFLUSH-NOPROGRESS-GUARD circuit-breaker TRIPPED (level=${levelId}, ${b.count} same-geometry flushes in <${WallRebuildCoordinator._FLUSH_WINDOW_MS}ms) — suppressing until walls change`);
                        return;
                    }
                } else {
                    this._flushBurst.set(levelId, { sig, count: 1, ts: now });
                }
            }
        }

        // ─── ADR-057 P1 (OI-053h) — single-wall openings-only fast path ────────
        // Classify the batch BEFORE the §STEP7 neighbour expansion (which only
        // ever adds walls on a *baseline* change — an openings-only batch adds
        // none). If the entire batch is a provably openings-only change on
        // baseline-stable walls of one level (door/window OFFSET edit, or a
        // batch of such edits), rebuild ONLY those wall bodies + re-anchor their
        // hosted children, and SKIP the whole-level resolveLevel / V2 cache
        // refresh / junction-infill pass — all three are invariant under an
        // opening-value change (their inputs are wall endpoints/thickness/
        // adjacency, none of which moved). See WallDeltaClassifier for the proof.
        // ANY uncertainty → classifier returns 'whole-level' → fall through to
        // the unchanged authoritative rebuild below.
        const _delta = classifyWallDelta(Array.from(batch.values()));
        if (_delta.kind === 'openings-only') {
            this._flushOpeningsOnly(_delta.wallIds, _delta.levelId, builder, store);
            // §FIX-WALLFLUSH-NOPROGRESS-GUARD (L-97) — record what this fast-path flush built so
            // a subsequent no-op re-arm on the identical geometry is gated out at the top.
            for (const levelId of _flushLevels) this._lastFlushLevelSig.set(levelId, this._levelWallSig(levelId, store));
            return;
        }
        // §PERF-WALL-MOVE-INCREMENTAL-REBUILD (L-234) — `_delta.kind === 'moved-wall'`
        // (a pure baseline drag) deliberately does NOT get a fast path here. A move
        // DOES change junction geometry, so it MUST fall through to the authoritative
        // whole-level `resolveLevel` + ADR-0055 `refreshV2Cache` below — skipping either
        // would render stale corners the moment ADR-0055 P4b / L-242 lands. What the
        // classification buys is downstream: the incremental BUILD gate in the
        // `adjustments.forEach` loop, which rebuilds only the wall bodies whose geometry
        // inputs actually changed instead of re-extruding the entire level.
        // ──────────────────────────────────────────────────────────────────────

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
                        // §PERF-WALL-MOVE-INCREMENTAL-REBUILD — the mesh is gone; drop the
                        // memo so a re-created wall (undo of a delete) always rebuilds.
                        this._lastBuildKey.delete(wallId);
                        try { window.__planSymbolCache?.invalidate(wallId); } catch { /* noop */ }
                    }
                }

                const levelWalls = store.getAll().filter((w: any) => w.levelId === levelId);
                const prevHadJoin = new Set<string>(this._prevJoinMap.keys());

                const _cam    = this._world.camera?.three;
                const _canvas = this._world.renderer?.three?.domElement as HTMLCanvasElement | undefined;
                const snapR   = getWorldToleranceForActiveCamera(DEFAULT_SNAP_PIXEL_RADIUS, _cam, _canvas);
                // §PERF-GEN-INSTRUMENT (L-131 P0) — time the whole-level resolve and count how
                // many times each level is resolved during one generation. Zero-cost when
                // perf-trace is off (single boolean read). This is the measurement the founder
                // uses on prod to compare BEFORE (flag OFF ≈ 3/level) vs AFTER (flag ON ≈ 1).
                const _resT0 = perfTraceOn() ? performance.now() : 0;
                const adjustments = WallJoinResolver.resolveLevel(levelWalls, { snapRadius: snapR });
                if (perfTraceOn()) {
                    const _n = (this._resolveCountByLevel.get(levelId) ?? 0) + 1;
                    this._resolveCountByLevel.set(levelId, _n);
                    perfLog('§PERF-GEN-INSTRUMENT', `_flush resolveLevel level=${levelId} walls=${levelWalls.length} elapsedMs=${(performance.now() - _resT0).toFixed(1)} resolveCountThisGen=${_n}`);
                }

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
                        refreshV2Cache?: (specs: ReadonlyArray<{ id: string; startXZ: { x: number; z: number }; endXZ: { x: number; z: number }; thickness: number; systemTypeId?: string }>) => void;
                    }).refreshV2Cache;
                    if (typeof refresh === 'function') {
                        // §V2-PRETRIM-FIX (2026-05-27): feed the V2 resolver the
                        // PRE-TRIM baselines. The store can hold POST-TRIM baselines
                        // from a previous _flush — those endpoints sit `halfT` apart
                        // from the junction centre, which is far outside V2's 1 mm
                        // `snapEpsilonM` cluster radius, so junction detection MISSES
                        // and `cache.getMiter(id)` returns null → V2 silently falls
                        // back to MiterPrismBuilder and the wedge re-appears.
                        // `wall._sourceBaseLine` is the archived pre-trim baseline
                        // written by this coordinator on each trim; when absent
                        // (fresh wall, no trim yet), `baseLine` itself is pre-trim.
                        const specs = levelWalls
                            .filter(w => w.baseLine?.length >= 2 && typeof w.thickness === 'number')
                            .map(w => {
                                const srcBL = (w as unknown as { _sourceBaseLine?: ReadonlyArray<{ x: number; z: number }> })._sourceBaseLine;
                                const pStart = srcBL?.[0] ?? w.baseLine[0];
                                const pEnd   = srcBL?.[1] ?? w.baseLine[1];
                                return {
                                    id: w.id,
                                    startXZ: { x: pStart.x, z: pStart.z },
                                    endXZ:   { x: pEnd.x,   z: pEnd.z },
                                    thickness: w.thickness,
                                    // §FIX-WALL-V2-EXISTING-CORNER-IMMUTABLE (L-130) — thread the
                                    // wall's systemTypeId into the V2 resolver so it freezes an
                                    // existing same-type L-corner when a DIFFERENT-type wall joins
                                    // (mirrors WallJoinResolver §FIX-EXISTING-CORNER-IMMUTABLE).
                                    systemTypeId: (w as unknown as { systemTypeId?: string }).systemTypeId,
                                };
                            });
                        refresh.call(builder, specs);
                    }
                } catch (err) {
                    console.warn('[WallRebuildCoordinator] V2 cache refresh failed (non-fatal):', err);
                }
                // ────────────────────────────────────────────────────────────────

                const _rebuiltWallIds = new Set<string>();
                // §PERF-WALL-MOVE-INCREMENTAL-REBUILD (L-234) — walls the resolver
                // returned an adjustment for whose geometry inputs were byte-identical to
                // the last build, so `buildWall` was elided. On the founder's edit (drag
                // ONE wall on a plate of N) this is N − (the handful that actually moved).
                let _skippedCleanWalls = 0;

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
                    // §POST-RESOLVE-PRESERVE-ANCHOR (founder 2026-06-23) — the
                    // AUTHORITATIVE baseline to defend/restore is the wall's TRUE source:
                    // `_sourceBaseLine` (the user-drawn / persisted original) when present,
                    // else `baseLine`. This is the SAME anchor `WallJoinResolver.resolveLevel`
                    // seeds from (§SOURCE-BL-FIX). Previously preserve compared/reverted to
                    // `_preTrimWall.baseLine`, which may itself already be a TRIMMED value
                    // written by an earlier non-preserve flush — so the "committed baseline"
                    // preserve kept drifted a little further every reload (and, because a
                    // preserve flush skips store.update, `_sourceBaseLine` was never stamped,
                    // so the save fell back to the trimmed `baseLine` → the disk record
                    // walked). Anchoring to the true source makes preserve idempotent across
                    // reloads. When `_sourceBaseLine` is absent it equals `_sourceBL` exactly,
                    // so this is a byte-identical no-op on the already-stable paths.
                    const _trueSrcRaw = (_preTrimWall as unknown as { _sourceBaseLine?: WallBaseline } | undefined)?._sourceBaseLine;
                    const _trueSourceBL: WallBaseline | undefined = _trueSrcRaw
                        ? [{ x: _trueSrcRaw[0].x, y: _trueSrcRaw[0].y, z: _trueSrcRaw[0].z }, { x: _trueSrcRaw[1].x, y: _trueSrcRaw[1].y, z: _trueSrcRaw[1].z }]
                        : _sourceBL;
                    const _sourceBaseLineToStore = _preTrimWall?._sourceBaseLine ?? _sourceBL;
                    // §WS-2.E (plan §2.E, 2026-05-29): skip the store.update +
                    // version bump when the resolver's "new" baseline is
                    // identical (sub-µm) to the wall's current baseLine — this
                    // is the common case for non-affected neighbours in a join
                    // resolution storm. The store-update fires `wall:update`
                    // events to every subscriber; skipping when nothing moved
                    // raises cache hit-rate downstream + cuts the resolver's
                    // own cost in dense scenes. The `buildWall` call below
                    // still runs (the join mesh may need a refresh even when
                    // the baseline didn't move — e.g. a neighbour rejoining).
                    const _EPS = 1e-6;
                    const _bMoved = !_preTrimWall || !_sourceBL
                        || Math.abs(_newBL[0].x - _sourceBL[0].x) > _EPS
                        || Math.abs(_newBL[0].y - _sourceBL[0].y) > _EPS
                        || Math.abs(_newBL[0].z - _sourceBL[0].z) > _EPS
                        || Math.abs(_newBL[1].x - _sourceBL[1].x) > _EPS
                        || Math.abs(_newBL[1].y - _sourceBL[1].y) > _EPS
                        || Math.abs(_newBL[1].z - _sourceBL[1].z) > _EPS;

                    // §POST-RESOLVE-PRESERVE (founder 2026-06-19) — this is the
                    // §A.21.D28 POST-OPENINGS whole-level re-resolve. The store ALREADY
                    // holds the correctly-welded baseline from the initial build; the
                    // job here is only to re-cut opening voids. But re-running
                    // resolveLevel with a zoom-dependent snapRadius can DESTROY a wall
                    // that was welded fine: it reclassifies a partition↔shell contact
                    // as a CORNER join, so a partition whose start is BOTH clamped to
                    // the shell inner face (+99mm) AND corner-joined collapses to a
                    // ~0.10m stub → §RESOLVED-STUB-SWEEP flags it invalid → the builder
                    // SKIPS it → the partition VANISHES + a ~1.6m corner gap opens; or a
                    // shell wall's body is pivoted >20mm laterally off the previewed line
                    // (§DIAG-PARITY/§PARITY-GATE). The weld-time §WELD-NO-LATERAL-SHIFT
                    // guard cannot see this — it runs pre-commit. So HERE, if the
                    // re-resolve's result is DESTRUCTIVE vs the committed (welded)
                    // baseline of a PREVIOUSLY-VALID wall — it would collapse it into the
                    // degenerate band, invalidate it, or pivot it laterally past tol —
                    // we KEEP the committed baseline and build the wall VALID (clearing
                    // any stub-sweep invalid flag). Along-axis miter/trim of any size is
                    // still allowed (real corners still close); only the destructive
                    // re-trim is reverted. Byte-identical no-op on axis-clean plates /
                    // Level-01 (lateral≈0, no collapse). Does NOT move openings (the
                    // void cut still runs); does NOT touch area-cap math.
                    // §POST-RESOLVE-OVEREXTEND (founder 2026-06-19, 2nd facet) — the
                    // re-resolve can ALSO over-EXTEND a wall ALONG its axis: at a
                    // partition↔outer-wall join, a near-parallel/ill-conditioned miter
                    // intersection lands far away (and the "T-JOIN trim exceeds safety
                    // bound, skipping" path leaves the end there), so a 2.3m wall's body
                    // shoots out into a multi-metre diagonal SPIKE past the shell — while
                    // the store/panel may still read the short length. A real miter only
                    // extends a wall by ~half its thickness; an extension beyond
                    // EXTEND_TOL is never a legitimate join. Treat it as destructive and
                    // keep the committed baseline (outer wall stays put — the founder's
                    // "outer walls should be priority").
                    const _preserveOn = (globalThis as unknown as { __pryzmPostResolvePreserve?: boolean }).__pryzmPostResolvePreserve !== false;
                    let _preserve = false;
                    // §POST-RESOLVE-PRESERVE-ANCHOR — when preserve fires, this is the
                    // stable baseline we COMMIT (store + render), not just the joinData copy.
                    let _preserveAnchorBL: WallBaseline | undefined;
                    if (_preserveOn && _sourceBL && _bMoved) {
                        const _adjInvalid = (adjustment as unknown as { invalid?: boolean }).invalid === true;
                        const _decision = WallRebuildCoordinator.decidePreservedBaseline(_sourceBL, _trueSourceBL, _newBL, _adjInvalid);
                        // §FIX-WALL-JOIN-BASELINE-IMMUTABLE (L-44 / L-46 / L-47, founder 2026-07-02) —
                        // an authored-VALID wall's baseline is IMMUTABLE under a whole-level JOIN
                        // re-resolve: anchor it to its source even for a "clean" along-axis trim that
                        // `decidePreservedBaseline` would otherwise PERMIT (persist). That permit WAS
                        // the founder bug — persisting the resolver's trimmed/square-capped centreline
                        // shrank an unrelated already-joined wall on a NEARBY CREATE (L-47), shrank a
                        // wall on a TYPE CHANGE (L-46, §DIAG-WALL-SPIKE bMoved=true), and diverged the
                        // committed 3-wall T from its clean preview (L-44: §MULTI-CLUSTER-PARTITION-TRIM
                        // square-capped an arm 0.004m off the node). A join is a RENDER-TIME footprint
                        // operation — it mitres/butts the extruded geometry via the JoinData miter
                        // normals here (computed from the SAME authored source, §SOURCE-BL-FIX) and the
                        // V2 footprint — and must NEVER mutate/persist another wall's stored baseline
                        // (the reverted §CLAMP-COSHARE-WELD "moving shared baselines → length changes"
                        // hazard, which §MULTI-CLUSTER-PARTITION-TRIM reintroduced through this write-
                        // back). FIX: anchor EVERY moved, authored-valid wall back to its source so the
                        // stored length never changes on a join. Only a genuinely-degenerate AUTHORED
                        // stub (< stub length) is excluded, so §FIX-WALL-CLUSTER-DEGENERATE /
                        // §RESOLVED-STUB-SWEEP still skip real stubs. `_sourceBaseLine` is the AUTHORED
                        // anchor (explicit user moves refresh it — UpdateWallBaselineCommand §R5-FIX —
                        // so this never reverts an intentional edit). Escape hatch (diagnostics /
                        // exact-input callers): `__pryzmWallJoinBaselineImmutable = false`.
                        const _immAnchorBL = _trueSourceBL ?? _sourceBL;
                        const _immLen = Math.hypot(
                            _immAnchorBL[1].x - _immAnchorBL[0].x,
                            _immAnchorBL[1].z - _immAnchorBL[0].z,
                        );
                        const _baselineImmutable =
                            (globalThis as unknown as { __pryzmWallJoinBaselineImmutable?: boolean }).__pryzmWallJoinBaselineImmutable !== false
                            && _immLen >= WallRebuildCoordinator._PRESERVE_STUB_LEN;
                        if ((_decision.preserve && _decision.anchorBL) || _baselineImmutable) {
                            _preserve = true;
                            // The baseline we keep is the wall's TRUE source (the persisted /
                            // user-drawn anchor the resolver itself seeds from), not the
                            // possibly-already-trimmed store `baseLine`. This is what makes
                            // reload idempotent: every flush restores to the same fixed
                            // anchor instead of re-defending whatever the last flush left.
                            _preserveAnchorBL = _decision.anchorBL ?? _immAnchorBL;
                            // Make the JoinData internally consistent with the preserved
                            // (anchor) baseline and clear the stub-sweep skip flag so the
                            // builder renders the wall on its line. NOTE: buildWall reads the
                            // CENTRELINE from `wall.baseLine` (store), NOT joinData.baseLine —
                            // so the store write-back below (gated by `_preserve`) is what
                            // actually fixes the rendered + persisted geometry; this keeps the
                            // joinData consistent for _prevJoinMap / diagnostics.
                            _adjBL[0].set(_preserveAnchorBL[0].x, _preserveAnchorBL[0].y, _preserveAnchorBL[0].z);
                            _adjBL[1].set(_preserveAnchorBL[1].x, _preserveAnchorBL[1].y, _preserveAnchorBL[1].z);
                            const _adjMut = adjustment as unknown as { invalid?: boolean; invalidReason?: string };
                            if (_adjMut.invalid) { _adjMut.invalid = false; _adjMut.invalidReason = undefined; }
                            const _dst = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(b.x - a.x, b.z - a.z);
                            const _preLen = _dst(_sourceBL[0], _sourceBL[1]);
                            const _newLen = _dst(_newBL[0], _newBL[1]);
                            const _Lw = _preLen || 1e-9;
                            const _uxw = (_sourceBL[1].x - _sourceBL[0].x) / _Lw, _uzw = (_sourceBL[1].z - _sourceBL[0].z) / _Lw;
                            const _perpw = (p: { x: number; z: number }) => Math.abs((p.x - _sourceBL[0].x) * _uzw - (p.z - _sourceBL[0].z) * _uxw);
                            const _lateral = Math.max(_perpw(_newBL[0]), _perpw(_newBL[1]));
                            const _overExtended = _newLen > _preLen + WallRebuildCoordinator._PRESERVE_EXTEND_TOL;
                            const _why = _adjInvalid || _newLen < WallRebuildCoordinator._PRESERVE_STUB_LEN
                                ? `collapse (newLen=${_newLen.toFixed(3)}m)`
                                : _overExtended
                                    ? `over-extend spike (preLen=${_preLen.toFixed(3)}m → newLen=${_newLen.toFixed(3)}m)`
                                    : `lateral pivot (${(_lateral * 1000).toFixed(0)}mm)`;
                            // §WALL-JOIN-LOAD-SKIP (2026-06-24) — gate behind the wall-join
                            // debug flag. This fires per-preserved-wall on every flush
                            // (including the deferred post-load resolves), flooding the
                            // console for large buildings; opt-in only.
                            if ((globalThis as unknown as { __PRYZM_WALL_JOIN_DEBUG?: boolean }).__PRYZM_WALL_JOIN_DEBUG === true)
                            // eslint-disable-next-line no-console
                            console.warn(`[WallRebuildCoordinator] §POST-RESOLVE-PRESERVE held ${wallId} STABLE — caught a post-openings ${_why} and re-anchored to source (rendered + persisted geometry unchanged; the rejected re-resolve is NOT applied)`);
                        }
                    }

                    // §DIAG-WALL-SPIKE (founder 2026-06-19) — surface EVERY wall the
                    // rebuild's resolveLevel moves significantly, with the before/after
                    // baselines + the §POST-RESOLVE-PRESERVE decision, so a single
                    // console filter pinpoints a malforming wall. Filter the console by
                    //   §DIAG-WALL-SPIKE        → only the walls that moved a lot
                    //   §POST-RESOLVE-PRESERVE  → only the ones the guard reverted
                    // For a laser trace of ONE wall set `window.__pryzmTraceWall='<id>'`
                    // (or a substring) → §DIAG-WALL-TRACE logs it every flush regardless
                    // of threshold. Reading: dLen ≫ 0 = over-extend spike; dLen ≪ 0 =
                    // collapse; lateral ≫ 0 = pivot. preserve=true ⇒ guard kept the
                    // committed (short/correct) baseline → body should build clean; if
                    // you still see a spike with preserve=true the mesh is STALE (no
                    // rebuild fired), with preserve=false the guard MISSED it (tell me
                    // the numbers). Cheap: only fires on a real move or the traced id.
                    if (_sourceBL) {
                        const __dst = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(b.x - a.x, b.z - a.z);
                        const __preLen = __dst(_sourceBL[0], _sourceBL[1]);
                        const __newLen = __dst(_newBL[0], _newBL[1]);
                        const __L = __preLen || 1e-9;
                        const __ux = (_sourceBL[1].x - _sourceBL[0].x) / __L, __uz = (_sourceBL[1].z - _sourceBL[0].z) / __L;
                        const __perp = (p: { x: number; z: number }) => Math.abs((p.x - _sourceBL[0].x) * __uz - (p.z - _sourceBL[0].z) * __ux);
                        const __lat = Math.max(__perp(_newBL[0]), __perp(_newBL[1]));
                        const __dLen = __newLen - __preLen;
                        const __traceId = (globalThis as unknown as { __pryzmTraceWall?: string }).__pryzmTraceWall;
                        const __traced = !!__traceId && wallId.includes(__traceId);
                        // §DIAG-WALL-SPIKE fires ONLY when the guard did NOT preserve (a
                        // genuinely concerning move that WILL be applied) or on an explicit
                        // trace. A preserved wall is held stable and already reported by the
                        // calm §POST-RESOLVE-PRESERVE line above — emitting SPIKE for it too is
                        // a false alarm (the `new`/`lateral` numbers describe the REJECTED
                        // re-resolve, not the rendered geometry), so it is suppressed here.
                        if (__traced || ((Math.abs(__dLen) > 0.30 || __lat > 0.05) && !_preserve)) {
                            const __tag = __traced ? '§DIAG-WALL-TRACE' : '§DIAG-WALL-SPIKE';
                            const __thk = (_preTrimWall as unknown as { thickness?: number } | undefined)?.thickness ?? 0;
                            // eslint-disable-next-line no-console
                            console.warn(
                                `[WallRebuildCoordinator] ${__tag} ${wallId} t=${__thk.toFixed(3)} ` +
                                `srcLen=${__preLen.toFixed(3)}m newLen=${__newLen.toFixed(3)}m dLen=${__dLen >= 0 ? '+' : ''}${__dLen.toFixed(3)}m ` +
                                `lateral=${(__lat * 1000).toFixed(0)}mm preserve=${_preserve} bMoved=${_bMoved} invalid=${(adjustment as unknown as { invalid?: boolean }).invalid === true} ` +
                                `src=(${_sourceBL[0].x.toFixed(3)},${_sourceBL[0].z.toFixed(3)})→(${_sourceBL[1].x.toFixed(3)},${_sourceBL[1].z.toFixed(3)}) ` +
                                `new=(${_newBL[0].x.toFixed(3)},${_newBL[0].z.toFixed(3)})→(${_newBL[1].x.toFixed(3)},${_newBL[1].z.toFixed(3)})`,
                            );
                        }
                    }

                    if (_bMoved && !_preserve) {
                        store.update(wallId, { baseLine: _newBL, ...(_sourceBaseLineToStore ? { _sourceBaseLine: _sourceBaseLineToStore } : {}) } as any);
                    } else if (_preserve && _preserveAnchorBL) {
                        // §POST-RESOLVE-PRESERVE-ANCHOR — buildWall reads the centreline from
                        // `wall.baseLine` (the store), so simply SKIPPING store.update kept
                        // whatever was already in the store — which could be a value an
                        // earlier non-preserve flush had already trimmed, and left the wall
                        // WITHOUT a `_sourceBaseLine` (so the next save persisted the trimmed
                        // line → drift on every reload). Here we COMMIT the stable anchor as
                        // BOTH `baseLine` (what gets rendered) AND `_sourceBaseLine` (the
                        // resolver seed + what gets saved), so:
                        //   • the rendered wall sits on the original line (no pivot),
                        //   • the save writes the original line (no disk walk),
                        //   • the next resolve seeds from the same fixed anchor (idempotent).
                        // No-op write when the store already holds the anchor (the §WS-2.E
                        // sub-µm skip still applies inside store.update for unchanged values).
                        // Guarded: a write must never be worse than the old skip-on-preserve
                        // behaviour, so any store rejection (e.g. an opening-bearing reversal
                        // guard) degrades to leaving the store untouched.
                        // §PRESERVE-IDEMPOTENT (founder 2026-06-23 — project-open HANG fix):
                        // the preserve branch fires on EVERY flush (the resolver keeps wanting
                        // to pivot the held wall), so an UNCONDITIONAL store.update writes +
                        // emits a mutation every flush → the buffered StoreEventBus re-schedules
                        // a flush after _joinsResolving clears → infinite re-flush loop → the
                        // project never finishes loading ("Loading Auto-save…" forever). Write
                        // ONLY when the store does not already hold the anchor (baseLine AND the
                        // _sourceBaseLine stamp); once anchored, skip → no emit → the loop
                        // terminates. The first flush still commits the stable anchor exactly once.
                        const _cur = store.getById(wallId) as unknown as { baseLine?: ReadonlyArray<{ x: number; z: number }>; _sourceBaseLine?: ReadonlyArray<{ x: number; z: number }> } | undefined;
                        const _eq = (p?: { x: number; z: number }, q?: { x: number; z: number }) =>
                            !!p && !!q && Math.abs(p.x - q.x) < 1e-4 && Math.abs(p.z - q.z) < 1e-4;
                        const _alreadyAnchored = !!_cur?._sourceBaseLine
                            && _eq(_cur.baseLine?.[0], _preserveAnchorBL[0]) && _eq(_cur.baseLine?.[1], _preserveAnchorBL[1])
                            && _eq(_cur._sourceBaseLine?.[0], _preserveAnchorBL[0]) && _eq(_cur._sourceBaseLine?.[1], _preserveAnchorBL[1]);
                        if (!_alreadyAnchored) {
                            try {
                                store.update(wallId, { baseLine: _preserveAnchorBL, _sourceBaseLine: _preserveAnchorBL } as any);
                            } catch (err) {
                                console.warn(`[WallRebuildCoordinator] §POST-RESOLVE-PRESERVE anchor write-back skipped for ${wallId} (non-fatal):`, err);
                            }
                        }
                    }
                    const updated = store.getById(wallId);
                    if (updated) {
                        const slabOff = resolveSlabBaseOffsetForWall(updated, this._slabStore);
                        const lvl     = this._bimManager.getLevelById(updated.levelId);
                        const worldY  = (lvl?.elevation ?? 0) + slabOff + (updated.baseOffset ?? 0);
                        const _renderMap = resolveOpeningRenderMap(updated, store);

                        // ── §PERF-WALL-MOVE-INCREMENTAL-REBUILD (L-234) ────────────────
                        // THE fix for the founder's "move a wall with a hosted door → the
                        // project freezes". `buildWall` was called here UNCONDITIONALLY for
                        // every wall the resolver returned an adjustment for — i.e. every
                        // wall on the plate — re-extruding N wall bodies (and re-cutting
                        // every door void) synchronously on the main thread for a ONE-wall
                        // edit. `buildWall` is a deterministic function of exactly
                        // (wall, joinData, renderMap, worldY): if all four are byte-identical
                        // to the last build, the mesh it would produce is byte-identical to
                        // the mesh already in the scene, so the call is a provable no-op.
                        // Skip it. This is a memoization — NOT a heuristic affected set —
                        // so join correctness is untouched: `resolveLevel` still solves the
                        // WHOLE level, `refreshV2Cache` above still sees every wall, and
                        // `_prevJoinMap` below is still written for every adjustment. Only
                        // the redundant GEOMETRY work is elided.
                        // Guards: the builder must still own the wall's group (self-heal if
                        // another subsystem disposed the mesh), and the whole gate is
                        // disable-able via `window.__pryzmWallIncrementalRebuild = false`.
                        const _buildKey = WallRebuildCoordinator._buildKey(updated, adjustment, _renderMap, slabOff, worldY);
                        const _clean =
                            WallRebuildCoordinator._incrementalRebuildOn()
                            && this._lastBuildKey.get(wallId) === _buildKey
                            && !!builder.getWallRoot(wallId);
                        if (_clean) {
                            _skippedCleanWalls++;
                            return;   // geometry inputs unchanged → mesh already correct.
                        }

                        try {
                            builder.buildWall(updated, adjustment, _renderMap, worldY);
                            builder.recordBuiltVersion(wallId, updated, adjustment, slabOff);
                            this._lastBuildKey.set(wallId, _buildKey);
                            _rebuiltWallIds.add(wallId);

                            // §DIAG-MESH-SPIKE (founder 2026-06-19) — PATH-AGNOSTIC extrusion-
                            // spike auto-detector. A wall's CENTRELINE can be clean (parity
                            // ≤47mm, joins closed=✓ — so §DIAG-WALL-SPIKE and §DIAG-PARITY stay
                            // quiet) while its BUILT BODY extrudes a vertex metres past the
                            // baseline — a bad mitre on a wall WITH openings (the no-opening
                            // MiterPrismBuilder is already §MITER-T-CLAMP'd; the opening build
                            // paths are not). Measure the built group's world XZ bbox diagonal vs
                            // the baseline length: a clean wall ≈ len; a spike blows it up. Fires
                            // for ANY wall so it auto-names the culprit (no manual trace). Filter
                            // the console by §DIAG-MESH-SPIKE. OPT-IN (default OFF): calling
                            // getWallMesh during a rebuild logs "No fragments found" for not-yet-
                            // built walls — noisy. It found the spike; re-enable for future ones
                            // via `window.__pryzmDiagMeshSpike = true`.
                            if ((globalThis as unknown as { __pryzmDiagMeshSpike?: boolean }).__pryzmDiagMeshSpike === true)
                            try {
                                const __grp = (builder as unknown as { getWallMesh?: (id: string) => THREE.Object3D | undefined }).getWallMesh?.(wallId);
                                if (__grp) {
                                    const __box = new THREE.Box3().setFromObject(__grp);
                                    if (Number.isFinite(__box.min.x) && Number.isFinite(__box.max.x)) {
                                        const __bl2 = updated.baseLine;
                                        const __len2 = Math.hypot(__bl2[1].x - __bl2[0].x, __bl2[1].z - __bl2[0].z);
                                        const __thk2 = (updated as unknown as { thickness?: number }).thickness ?? 0.2;
                                        const __diag = Math.hypot(__box.max.x - __box.min.x, __box.max.z - __box.min.z);
                                        const __expect = __len2 + __thk2;
                                        if (__diag > __expect + 1.0) {   // mesh overshoots its own footprint by >1m = extrusion spike
                                            // eslint-disable-next-line no-console
                                            console.warn(
                                                `[WallRebuildCoordinator] §DIAG-MESH-SPIKE ${wallId} t=${__thk2.toFixed(3)} ` +
                                                `baselineLen=${__len2.toFixed(3)}m BUILT-MESH-XZ-DIAG=${__diag.toFixed(3)}m ` +
                                                `(expected ≈${__expect.toFixed(3)}m → overshoots by ${(__diag - __expect).toFixed(3)}m) ` +
                                                `openings=${updated.openings?.length ?? 0} layered=${!!(updated as unknown as { layers?: unknown[] }).layers?.length} ` +
                                                `bbox=(${__box.min.x.toFixed(2)},${__box.min.z.toFixed(2)})→(${__box.max.x.toFixed(2)},${__box.max.z.toFixed(2)}) — centreline OK, EXTRUSION spike`,
                                            );
                                        }
                                    }
                                }
                            } catch { /* noop — diagnostic only */ }

                            // §DIAG-WALL-TRACE — the ACTUAL baseline the body was built
                            // from (store.getById after the preserve decision). For a
                            // traced wall: if this builtLen is short but you SEE a spike,
                            // the spiked mesh is stale (an earlier flush built it long and
                            // nothing rebuilt it); if builtLen is long, this flush built
                            // the spike. Pinpoints store-vs-mesh divergence.
                            const __traceId2 = (globalThis as unknown as { __pryzmTraceWall?: string }).__pryzmTraceWall;
                            if (__traceId2 && wallId.includes(__traceId2)) {
                                const __bl = updated.baseLine;
                                const __builtLen = Math.hypot(__bl[1].x - __bl[0].x, __bl[1].z - __bl[0].z);
                                // eslint-disable-next-line no-console
                                console.warn(`[WallRebuildCoordinator] §DIAG-WALL-TRACE ${wallId} BUILT body from baseLine len=${__builtLen.toFixed(3)}m at (${__bl[0].x.toFixed(3)},${__bl[0].z.toFixed(3)})→(${__bl[1].x.toFixed(3)},${__bl[1].z.toFixed(3)}) worldY=${worldY.toFixed(3)}`);
                            }
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
                            // §PERF-WALL-MOVE-INCREMENTAL-REBUILD — built via the builder's own
                            // guard with a null join, outside the memo. Drop the entry.
                            this._lastBuildKey.delete(wallId);
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
                            // §PERF-WALL-MOVE-INCREMENTAL-REBUILD — the wall LOST its join;
                            // rebuilt with a null join outside the memo. Drop the entry.
                            this._lastBuildKey.delete(w.id);
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

                // §PERF-WALL-MOVE-INCREMENTAL-REBUILD (L-234) — the number the founder has
                // been waiting months for. BEFORE this fix `rebuilt` was ALWAYS the whole
                // level (200/200 on a 200-wall plate, measured); it is now the size of the
                // set that actually changed. ALWAYS-ON (one line per flush, not per wall):
                // the whole point of L-234 is that this cost used to be invisible because
                // the only instrumentation on this path was behind `perfTraceOn()`.
                if (_delta.kind === 'moved-wall' || _skippedCleanWalls > 0) {
                    // eslint-disable-next-line no-console
                    console.debug(
                        `[WallRebuildCoordinator] §PERF-WALL-MOVE-INCREMENTAL-REBUILD level=${levelId} ` +
                        `delta=${_delta.kind}${_delta.kind === 'moved-wall' ? ` moved=[${_delta.movedWallIds.join(',')}]` : ''} ` +
                        `levelWalls=${levelWalls.length} adjustments=${adjustments.size} ` +
                        `rebuilt=${_rebuiltWallIds.size} skippedClean=${_skippedCleanWalls}`,
                    );
                }

                // §DIAG-PERIM-CORNER-WHOLE (founder #5/#11, 2026-06-12) — the active
                // generated-house repair takes THIS whole-level resolveLevel path (v184
                // §OPENING-VOID-WHOLE-LEVEL), NOT the body-only §DIAG-PERIM-CORNER probe
                // in `_rebuildWallBodies`. To actually SEE the perimeter-corner state the
                // founder reports, mirror that probe here against the FRESH `adjustments`
                // (the resolver's just-computed trimmed baselines, NOT a stale cache):
                // cluster all level walls' UNTRIMMED endpoints; for each pure 2-wall
                // L-corner report the GAP between the two walls' resolved trimmed joining
                // ends. A clean corner ⇒ the two trimmed ends coincide (gap ≈ 0); a gap ⇒
                // the cap planes no longer meet → the visible open corner. With the
                // §NEAR-CORNER-L resolver fix a slightly-gapped (welded/rotated) shell
                // corner is now mitred to the shared centreline crossing, so this should
                // read gap≈0 + bothMitred. Pure logging; gated to avoid console flood.
                // §WALL-CORNER-DIAG (PERF) — the O(n²) endpoint cluster + console output
                // below is opt-in. A normal flush skips it entirely (no cluster, no
                // string-building). Enable with `globalThis.__pryzmWallCornerDiag = true`.
                if (_wallDiagOn()) try {
                    const _ends: Array<{ id: string; side: 'start' | 'end'; p: { x: number; z: number } }> = [];
                    for (const w of levelWalls) {
                        const src = (w as unknown as { _sourceBaseLine?: ReadonlyArray<{ x: number; z: number }> })._sourceBaseLine ?? w.baseLine;
                        if (!src || src.length < 2 || !src[0] || !src[1]) continue;
                        _ends.push({ id: w.id, side: 'start', p: { x: src[0].x, z: src[0].z } });
                        _ends.push({ id: w.id, side: 'end',   p: { x: src[1].x, z: src[1].z } });
                    }
                    const _TOL = 0.12;
                    const _used = new Set<number>();
                    let _corners = 0, _bothMitred = 0, _gappy = 0;
                    const _resBL = (id: string, side: 'start' | 'end'): { x: number; z: number } | null => {
                        const a = adjustments.get(id) as (JoinData & { baseLine?: [THREE.Vector3, THREE.Vector3] }) | undefined;
                        const b = a?.baseLine; if (!b) return null;
                        const v = side === 'start' ? b[0] : b[1]; return { x: v.x, z: v.z };
                    };
                    const _resMN = (id: string, side: 'start' | 'end'): boolean => {
                        const a = adjustments.get(id) as JoinData | undefined;
                        return !!(side === 'start' ? a?.startMN : a?.endMN);
                    };
                    for (let i = 0; i < _ends.length; i++) {
                        if (_used.has(i)) continue;
                        const grp = [i];
                        for (let j = i + 1; j < _ends.length; j++) {
                            if (_used.has(j) || _ends[i]!.id === _ends[j]!.id) continue;
                            const dx = _ends[i]!.p.x - _ends[j]!.p.x, dz = _ends[i]!.p.z - _ends[j]!.p.z;
                            if (dx * dx + dz * dz <= _TOL * _TOL) grp.push(j);
                        }
                        if (grp.length !== 2) continue;
                        grp.forEach(k => _used.add(k));
                        _corners++;
                        const a = _ends[grp[0]!]!, b = _ends[grp[1]!]!;
                        const pa = _resBL(a.id, a.side), pb = _resBL(b.id, b.side);
                        const bothMitred = _resMN(a.id, a.side) && _resMN(b.id, b.side);
                        if (bothMitred) _bothMitred++;
                        const gap = pa && pb ? Math.hypot(pa.x - pb.x, pa.z - pb.z) : NaN;
                        if (Number.isFinite(gap) && gap > 0.005) {
                            _gappy++;
                            console.warn(
                                `[WallRebuildCoordinator] §DIAG-PERIM-CORNER-WHOLE ⚠ ${levelId} corner ` +
                                `${a.id}(${a.side})↔${b.id}(${b.side}) GAP=${(gap * 1000).toFixed(0)}mm ` +
                                `bothMitred=${bothMitred} — open corner (resolver did NOT close it).`,
                            );
                        }
                    }
                    if (_corners > 0) {
                        console.log(
                            `[WallRebuildCoordinator] §DIAG-PERIM-CORNER-WHOLE ${levelId} summary: ` +
                            `L-corners=${_corners} bothMitred=${_bothMitred} gappy(>5mm)=${_gappy}`,
                        );
                    }
                } catch (err) {
                    console.warn('[WallRebuildCoordinator] §DIAG-PERIM-CORNER-WHOLE probe failed (non-fatal):', err);
                }

                // DW-14 FIX: reposition door/window meshes AFTER wall hole geometry is rebuilt.
                for (const wallId of _rebuiltWallIds) {
                    this._doorBuilder.rebuildForWall(wallId);
                    this._windowBuilder.rebuildForWall(wallId);
                }

                const _freshWalls = store.getAll().filter((w: any) => w.levelId === levelId);

                // ADR-0055 §P4c (live-fix 2026-05-27) — when the V2 pipeline is the
                // active path for a wall, its footprint polygon already has
                // edge-coincident corners at every junction by construction
                // (the wedge is closed). The legacy `WallJunctionInfill` prism on
                // top of that produces a visible dark triangle — it's redundant
                // geometry that doesn't align with the V2 corners, so it shows
                // through as the user-reported "L/T black triangle" defect.
                // Filter the infill input to walls that DO NOT take the V2 path
                // (layered, or with openings — those still use MiterPrismBuilder
                // and still need the infill to plug their junction gap). Pure
                // partition walls (the apartment generator's production output
                // and the user's manual-wall test case) skip the infill cleanly.
                // This is the targeted slice of P4c that retires infill on the
                // call sites V2 already covers; the full retirement waits for
                // P4a+P4b per ADR-0055A.
                const _walls_for_infill = isWallPipelineV2Enabled()
                    ? _freshWalls.filter((w: any) =>
                        (w.openings && w.openings.length > 0) ||
                        (w.layers   && w.layers.length   > 0))
                    : _freshWalls;
                this._infillManager.update(
                    computeJunctionInfills(_walls_for_infill),
                    this._world.scene.three as THREE.Scene,
                );
            } finally {
                this._joinsResolving = false;
            }
        }

        // §FIX-WALLFLUSH-NOPROGRESS-GUARD (L-97) — record the geometry this completed flush
        // built, so a re-armed flush on the identical (now-anchored) geometry is gated out.
        for (const levelId of affectedLevelIds) {
            this._lastFlushLevelSig.set(levelId, this._levelWallSig(levelId, store));
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
