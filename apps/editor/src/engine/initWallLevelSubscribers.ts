import { resolveOpeningRenderMap } from './WallRebuildCoordinator';
import { resolveSlabBaseOffsetForWall } from '@pryzm/geometry-wall';
import { doorStore } from '@pryzm/geometry-door';
import { windowStore } from '@pryzm/geometry-window';
import { initDependencyCascade } from './initDependencyCascade';
import { checkAndAnnounceRoofWallClashes } from './roofWallClashAnnouncer';

/**
 * Registers:
 *   1. Level-drift guard (§DOOR-AUDIT-2026 P2 #9 / §WIN-AUDIT-2026 P2 #12)
 *   2. SpatialAuthority level-rebuild callback (FIX §2.1 §4), which now ends
 *      with the PR-10 roof→walls-beneath clash check (roofWallClashAnnouncer)
 *   3. The generic dependency-cascade consumer (CONNECT-0, C72 §2.1 —
 *      see initDependencyCascade.ts for what is routed and what is not)
 * Extracted from engineLauncher.ts Task 5.2.
 *
 * ── WHAT THE LEVEL-REBUILD CALLBACK COVERS (ADR-0345, lane LEVEL36) ─────────
 *
 * This callback is THE consumer that makes `RECONCILABLE_TYPES` true. Keep the
 * two in step: adding an arm here is what licenses adding a name there
 * (C72 §5.1 — "re-widening requires a consumer that HANDLES the added type").
 *
 *   ADAPTS HERE  · Wall   (per delivered id, `builder.updateWall`)
 *                · Slab   (per level query, `slabStore.triggerRebuild`)
 *                · Column (per delivered id, `columnBuilder.updateColumn`)  L-7202
 *                · Roof   (per level query, `roofBuilder.updateRoof`)       L-7202
 *   ADAPTS ELSEWHERE
 *                · Door / Window — hosted (C15): re-rendered by their host
 *                  wall's rebuild via `resolveOpeningRenderMap`, above.
 *                · Furniture / Plumbing / Lighting — `position.y` is persisted
 *                  ABSOLUTE state, so re-seating is a store write and P6 puts
 *                  it on the command path: `SetLevelHeightCommand` composes
 *                  `ReseatLevelElementsCommand` into its own undo unit.
 *   REFUSES BY NAME (ADR-0344 — silence is a defect, not a default)
 *                · Beam, Stair, CurtainWall. `SetLevelHeightCommand` counts
 *                  them and surfaces the refusal to the user at commit time.
 *                  Per-kind reasons: see `ReconcilableType` in SpatialAuthority.
 *
 * ⛔ This callback runs at RENDER time and must never write to a store — a
 * write here is both un-undoable and a P6 breach. Anything needing a store
 * write belongs in the command, not here.
 */
export function initWallLevelSubscribers(params: {
    wallTool: { getWallStore(): any; getFragmentBuilder(): any };
    slabStore: any;
    spatialAuthority: any;
    /** PR-10 — roof records of the reconciled level (stranded per C72 §5.1). */
    roofStore: { getByLevel(levelId: string): any[] };
    /** PR-10 — NEW elevation source for the stranded-origin computation. */
    bimManager: { getLevelById(id: string): { elevation?: number } | undefined };
    /** PR-10 — announcement channel override (tests). Default: showAppToast. */
    announceRoofWallClash?: (message: string, kind: 'warn' | 'error') => unknown;

    // ── L-7202 (lane LEVEL36) — the two per-kind rebuild entry points that
    // un-strand Column and Roof on a level-elevation change. Both are OPTIONAL
    // so every existing caller (and the PR-10 tests) keeps compiling; when a
    // handle is absent the kind simply is not rebuilt, exactly as before.
    // See the ReconcilableType comment block in `SpatialAuthority.ts` for why
    // these two and not Beam / Stair / CurtainWall.
    /** L-7202 — columns re-derive `level.elevation` in `ColumnFragmentBuilder:225`. */
    columnStore?: { getById?(id: string): any; get?(id: string): any };
    columnBuilder?: { updateColumn(column: any): void };
    /** L-7202 — roofs re-derive `level.elevation` in `RoofFragmentBuilder:305`. */
    roofBuilder?: { updateRoof(roof: any): void };
}): void {
    const {
        wallTool, slabStore, spatialAuthority, roofStore, bimManager, announceRoofWallClash,
        columnStore, columnBuilder, roofBuilder,
    } = params;

    // ── §DOOR/WIN-AUDIT P2 #9/#12: host-wall level-drift guard ───────────────
    wallTool.getWallStore().subscribe((event: string, wall: any, prevState: any) => {
        if (event !== 'update' || !prevState) return;
        if (prevState.levelId === wall.levelId) return;
        const newLevelId = wall.levelId;
        if (!newLevelId) return;
        const bm: any = window.bimManager;
        if (!bm?.registerElement) return;
        try {
            for (const d of doorStore.getByWallId(wall.id)) bm.registerElement(d.id, newLevelId);
            for (const w of windowStore.getByWallId(wall.id)) bm.registerElement(w.id, newLevelId);
            console.log(`[initWallLevelSubscribers] §DOOR/WIN-AUDIT P2#9: re-registered openings on wall ${wall.id} from level ${prevState.levelId} → ${newLevelId}`);
        } catch (err) {
            console.error(`[initWallLevelSubscribers] §DOOR/WIN-AUDIT P2#9: re-registration failed for wall ${wall.id}.`, err);
        }
    });

    // ── FIX §2.1 §4: SpatialAuthority level-rebuild callback ─────────────────
    spatialAuthority.registerLevelRebuildCallback((_levelId: string, elementIds: string[], elevationDeltaM?: number) => {
        const store   = wallTool.getWallStore();
        const builder = wallTool.getFragmentBuilder();
        for (const id of elementIds) {
            const wall = store.getById(id);
            if (wall) {
                try {
                    // §LEVEL-DATUM-IS-NOT-IN-THE-KEY (L-2051) — RESOLVE THE SLAB TERM.
                    //
                    // This passed no `slabBaseOffset` at all, i.e. the builder's
                    // `slabBaseOffset ?? 0`. That was INVISIBLE for as long as the
                    // sibling defect (L-2050) meant this call never rebuilt anything:
                    // the composite cache key omitted the level elevation, so a level
                    // move short-circuited at the version guard every time.
                    //
                    // Folding the datum into that key makes THIS call live — and a live
                    // call with a missing slab term would seat every wall on a raised
                    // slab `slabBaseOffset` metres too LOW, dropping its hosted openings
                    // with it. The two changes must ship together: fixing the
                    // invalidation without this line converts a stale wall into a
                    // wrongly-seated one, which is worse because it looks deliberate.
                    //
                    // `_flushWallRebuild` resolves exactly this way (WallRebuildCoordinator
                    // :617, :1374, :2241, :2373, :2393) — same function, same store, so the
                    // level path and the edit path cannot seat one wall two ways.
                    const slabOff = resolveSlabBaseOffsetForWall(wall, slabStore);
                    builder.updateWall(wall, null, resolveOpeningRenderMap(wall, store), slabOff);
                } catch (err) {
                    console.error(`[initWallLevelSubscribers] §WALL-AUDIT-2026-C1: updateWall (level-rebuild) failed for wall "${id}" — continuing.`, err);
                }
            }
        }
        const slabsOnLevel = slabStore.getAll().filter((s: any) => s.levelId === _levelId);
        for (const s of slabsOnLevel) slabStore.triggerRebuild(s.id);
        if (slabsOnLevel.length > 0) {
            console.log(`[initWallLevelSubscribers] FIX-9: Re-projected ${slabsOnLevel.length} slab(s) after level "${_levelId}" elevation change.`);
        }

        // ── L-7202 (lane LEVEL36): COLUMNS — per delivered id ────────────────
        // Delivered ids are the level's `childrenIds` that classified
        // DETERMINED-RECONCILED (or UNDETERMINED, fail-open). We probe the
        // column store for each rather than querying by level, because that is
        // the shape the wall arm above already uses and it keeps the two arms
        // reading the same list. `updateColumn` re-derives worldY from
        // `level.elevation` (ColumnFragmentBuilder:225,234), so re-invoking it
        // is exactly what makes the column follow — no store write, no new
        // rebuild path (C72 §2.4 / BIM30-DO-NOT-REBUILD §2).
        if (columnStore && columnBuilder) {
            let columnsRebuilt = 0;
            for (const id of elementIds) {
                const col = columnStore.getById?.(id) ?? columnStore.get?.(id);
                if (!col) continue;
                try {
                    columnBuilder.updateColumn(col);
                    columnsRebuilt++;
                } catch (err) {
                    console.error(`[initWallLevelSubscribers] L-7202: updateColumn (level-rebuild) failed for column "${id}" — continuing.`, err);
                }
            }
            if (columnsRebuilt > 0) {
                console.log(`[initWallLevelSubscribers] L-7202: Re-seated ${columnsRebuilt} column(s) after level "${_levelId}" elevation change.`);
            }
        }

        // ── L-7202 (lane LEVEL36): ROOFS — per level query ───────────────────
        // Queried by level (the slab shape) rather than per delivered id: a
        // roof is frequently registered against the level it CAPS rather than
        // sitting in that level's childrenIds, so an id-driven loop misses it.
        // `updateRoof` re-derives `level.elevation + baseOffset`
        // (RoofFragmentBuilder:305).
        //
        // ⚠ ORDERING IS LOAD-BEARING: this runs BEFORE the PR-10 clash check
        // below, so that check sees the roof in its NEW position. Before this
        // arm existed the roof never moved and the check's whole purpose was to
        // announce the resulting clash; now that the roof follows, a pure level
        // move should produce NO clash, and the check correctly says nothing.
        // The check is deliberately left in place — it still catches the cases
        // it was built for (a roof whose own baseOffset strands it).
        if (roofBuilder) {
            let roofsRebuilt = 0;
            for (const r of (roofStore.getByLevel(_levelId) ?? [])) {
                try {
                    roofBuilder.updateRoof(r);
                    roofsRebuilt++;
                } catch (err) {
                    console.error(`[initWallLevelSubscribers] L-7202: updateRoof (level-rebuild) failed for roof "${r?.id}" — continuing.`, err);
                }
            }
            if (roofsRebuilt > 0) {
                console.log(`[initWallLevelSubscribers] L-7202: Re-seated ${roofsRebuilt} roof(s) after level "${_levelId}" elevation change.`);
            }
        }

        // ── PR-10 (C72 §5.1): roof→walls-beneath clash check ─────────────────
        // Runs AFTER walls rebuilt and slabs re-projected. Roofs have no
        // reconcile consumer (classifyForReconcile → DETERMINED-STRANDED), so
        // the walls just moved and the roof did not — detect the clash and
        // ANNOUNCE it (toast channel), refining the generic SHORTFALL warn in
        // SpatialAuthority.ts. Never throws into the reconcile path.
        try {
            checkAndAnnounceRoofWallClashes({
                levelId: _levelId,
                elevationDeltaM,
                roofStore,
                wallStore: store,
                getLevelElevation: (id) => bimManager?.getLevelById?.(id)?.elevation,
                announce: announceRoofWallClash,
            });
        } catch (err) {
            console.error(`[initWallLevelSubscribers] PR-10: roof/wall clash check failed for level "${_levelId}" — continuing.`, err);
        }
    });

    // ── CONNECT-0 (C72 §2.1): the pryzm-dep-cascade consumer ─────────────────
    initDependencyCascade({ wallTool, slabStore });
}
