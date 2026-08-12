import type { RebuildTask } from '@pryzm/core-app-model';
import { resolveOpeningRenderMap } from './WallRebuildCoordinator';

/**
 * CONNECT-0 (roadmap Phase 5, C72 §2.1) — the production consumer of the
 * generic dependency cascade.
 *
 * Registered from `initWallLevelSubscribers` (same wiring seam as the
 * SpatialAuthority level-rebuild callback). This is ARM A of C72 §1.1 for
 * `pryzm-dep-cascade`: before this module existed, DependencyResolver
 * dispatched its computed cascade into a void — four events, typed catalog
 * entries, zero listeners, for its entire lifetime (C72 §0).
 *
 * ── What this listener routes, and what it deliberately does NOT ──────────
 *
 * ROUTED — `sitsOn` / `supports` (priority 1): the structural slab↔wall pair.
 * MEASURED-ABSENT from every bespoke tracker (EV-03: no tracker serves it), so
 * routing it here duplicates nothing. Targets are the EXISTING rebuild entry
 * points only — `FragmentBuilder.updateWall` (mesh re-project, no store write,
 * the same call the SpatialAuthority level-rebuild callback makes) and
 * `SlabStore.triggerRebuild` (builder-coordination signal; documented as NOT
 * emitting on storeEventBus, so no event loop is possible). No parallel
 * rebuild path is created (C72 §2.4 / BIM30-DO-NOT-REBUILD §2).
 *
 * NOT ROUTED — `hosts` / `hostedBy` (priority 2): Door/WindowDependencyTracker
 * own this pair (EXECUTED-PROVEN, regression-pinned). `boundedBy` /
 * `adjacentTo` / `connectedTo` (priority 3): RoomTopologyObserver owns room
 * re-detection. Routing either here would double-rebuild the best-wired paths
 * in the product — the exact hazard C72 §2.4 names. Priority ≥4 (derived /
 * record-only, incl. `joinedTo` per ADR-0321): record only, by design.
 *
 * Element-existence dispatch: a task names the AFFECTED element; we resolve it
 * against the wall then slab store and skip ids neither resolves (covers
 * cascade-deleted neighbours on `delete` triggers — C72 §2.3 tasks now flow
 * for deletes too, and a vanished target is simply skipped).
 */
export function initDependencyCascade(params: {
    wallTool: { getWallStore(): any; getFragmentBuilder(): any };
    slabStore: any;
}): void {
    const { wallTool, slabStore } = params;

    window.addEventListener('pryzm-dep-cascade', (e: Event) => {
        const detail = (e as CustomEvent).detail as {
            tasks?: RebuildTask[];
            triggerElementId?: string;
            operation?: string;
            prevState?: unknown;
        } | undefined;
        const tasks = detail?.tasks;
        if (!Array.isArray(tasks) || tasks.length === 0) return;

        const wallStore = wallTool.getWallStore();
        const builder = wallTool.getFragmentBuilder();
        let routed = 0;

        for (const task of tasks) {
            // Only the structural pair — see the header for why 2/3 are skipped.
            if (task.relationshipType !== 'sitsOn' && task.relationshipType !== 'supports') continue;
            if (!task.elementId || task.elementId === detail?.triggerElementId) continue;

            const wall = wallStore.getById?.(task.elementId);
            if (wall) {
                try {
                    builder.updateWall(wall, null, resolveOpeningRenderMap(wall, wallStore));
                    routed++;
                } catch (err) {
                    console.error(`[initDependencyCascade] structural cascade updateWall failed for wall "${task.elementId}" — continuing.`, err);
                }
                continue;
            }
            const slab = slabStore.getById?.(task.elementId) ?? slabStore.get?.(task.elementId);
            if (slab) {
                try {
                    slabStore.triggerRebuild(task.elementId);
                    routed++;
                } catch (err) {
                    console.error(`[initDependencyCascade] structural cascade triggerRebuild failed for slab "${task.elementId}" — continuing.`, err);
                }
            }
            // Neither store resolves the id: the affected element is gone
            // (cascade-deleted) or not a wall/slab — nothing to route.
        }

        if (routed > 0) {
            console.debug(`[initDependencyCascade] routed ${routed} structural task(s) from ${detail?.operation} on ${detail?.triggerElementId}`);
        }
    });

    console.log('[initDependencyCascade] pryzm-dep-cascade listener registered (CONNECT-0 — structural sitsOn/supports routing).');
}
