import { resolveOpeningRenderMap } from './WallRebuildCoordinator';
import { doorStore } from '@pryzm/geometry-door';
import { windowStore } from '@pryzm/geometry-window';

/**
 * Registers:
 *   1. Level-drift guard (§DOOR-AUDIT-2026 P2 #9 / §WIN-AUDIT-2026 P2 #12)
 *   2. SpatialAuthority level-rebuild callback (FIX §2.1 §4)
 * Extracted from engineLauncher.ts Task 5.2.
 */
export function initWallLevelSubscribers(params: {
    wallTool: { getWallStore(): any; getFragmentBuilder(): any };
    slabStore: any;
    spatialAuthority: any;
}): void {
    const { wallTool, slabStore, spatialAuthority } = params;

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
    spatialAuthority.registerLevelRebuildCallback((_levelId: string, elementIds: string[]) => {
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
    });
}
