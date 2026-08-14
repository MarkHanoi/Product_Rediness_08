import { resolveOpeningRenderMap } from './WallRebuildCoordinator';
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
}): void {
    const { wallTool, slabStore, spatialAuthority, roofStore, bimManager, announceRoofWallClash } = params;

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
                    builder.updateWall(wall, null, resolveOpeningRenderMap(wall, store));
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
