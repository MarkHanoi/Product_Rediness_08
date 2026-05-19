/**
 * DOC-2.5 — Grid Bubble Tool
 *
 * Batch-places 'grid-bubble' annotations at both endpoints of every visible
 * grid line when autoPlaceForView() is called (e.g. on view activation).
 *
 * Grid coordinate convention (Y-up world space):
 *   axis 'X' — grid line at x = position, running from z = extentMin to z = extentMax
 *   axis 'Y' — grid line at z = position, running from x = extentMin to x = extentMax
 *
 * Each grid line produces two annotations (one at each endpoint).
 * Duplicate grid bubbles for the same (viewId, gridId, endIndex) are suppressed.
 *
 * Geometry stored in modelPoints:
 *   [0] = 3D endpoint position
 *
 * Parameters stored:
 *   { gridId, gridName, axis, position, endIndex, cachedLabel }
 *
 * Contract compliance:
 *   §05 §7.8 — No bim-* / @thatopen/ui elements
 *   §01 §2   — CreateAnnotationCommand dispatched through CommandManager
 *   §01 §3.3 — AnnotationElement contains only plain serialisable primitives
 */

import * as OBC from '@thatopen/components';
import { makeAnnotationElement } from '../subsystem/AnnotationTypes';
import { makePointRef, ResolverStores } from '../subsystem/AnnotationReference';
import { AnnotationStore } from '../subsystem/AnnotationStore';
import type { Grid } from '@pryzm/core-app-model';


export class GridBubbleTool {
    public isActive = false;
    private _activeViewId: string | null = null;

    constructor(
        _components: OBC.Components,
        private _annotationStore: AnnotationStore,
        private _resolverStores: ResolverStores
    ) {
        void _components; // accepted for API consistency; not used internally
    }

    setActiveViewId(viewId: string | null): void {
        this._activeViewId = viewId;
    }

    setResolverStores(stores: ResolverStores): void {
        this._resolverStores = stores;
    }

    // Called by AnnotationManager when a view is activated (or on demand).
    autoPlaceForView(viewId: string): void {
        const gridStore = (this._resolverStores as any).gridStore ?? window.gridStore;
        if (!gridStore) {
            console.warn('[GridBubbleTool] gridStore not available — skipping auto-placement');
            return;
        }

        const grids: Grid[] = gridStore.getAll();
        if (!grids.length) return;

        // Collect existing grid bubbles for this view to avoid duplicates
        const existingKeys = new Set<string>();
        const existing = this._annotationStore.getByView(viewId);
        for (const ann of existing) {
            if (ann.type === 'grid-bubble') {
                const key = `${viewId}|${ann.parameters.gridId}|${ann.parameters.endIndex}`;
                existingKeys.add(key);
            }
        }

        let placed = 0;
        for (const grid of grids) {
            if (!grid.isVisible) continue;
            const endpoints = this._computeEndpoints(grid);
            for (let i = 0; i < endpoints.length; i++) {
                const dupeKey = `${viewId}|${grid.id}|${i}`;
                if (existingKeys.has(dupeKey)) continue;

                const ep  = endpoints[i]!;
                const ref = makePointRef({ x: ep[0]!, y: ep[1]!, z: ep[2]! } as any);
                const cachedPos = { x: ep[0]!, y: ep[1]!, z: ep[2]! };

                const id  = crypto.randomUUID();
                const ann = makeAnnotationElement(
                    id,
                    'grid-bubble',
                    viewId,
                    [{ ...ref, cachedPosition: cachedPos }],
                    { modelPoints: [cachedPos], offset: 0 },
                    {
                        gridId:      grid.id,
                        gridName:    grid.name,
                        axis:        grid.axis,
                        position:    grid.position,
                        endIndex:    i,
                        cachedLabel: grid.name,
                    }
                );

                // P13 (A36): typed payload so AnnotationsState receives the correct id/viewId/kind.
                if (window.runtime?.bus) { window.runtime.bus.executeCommand('annotation.create', { id: ann.id, viewId: ann.ownerViewId, kind: ann.type as any }).catch(() => {}); }
                existingKeys.add(dupeKey);
                placed++;
            }
        }

        console.log(`[GridBubbleTool] Auto-placed ${placed} grid bubbles in view`, viewId);
    }

    // Called when the active view changes in AnnotationManager.
    activate(): void {
        if (this.isActive) return;
        this.isActive = true;
        if (this._activeViewId) {
            this.autoPlaceForView(this._activeViewId);
        }
    }

    deactivate(): void {
        this.isActive = false;
    }

    dispose(): void {
        this.deactivate();
    }

    // ── Private ────────────────────────────────────────────────────────────────

    /**
     * Returns the two 3D endpoints of a grid line as [x, y, z] tuples.
     *
     * axis 'X' → line at x=position, running z from extentMin→extentMax
     * axis 'Y' → line at z=position, running x from extentMin→extentMax
     * Y is always 0 (plan-level; the grid is drawn on the floor plane).
     */
    private _computeEndpoints(grid: Grid): [number, number, number][] {
        const p  = grid.position;
        const mn = grid.extentMin;
        const mx = grid.extentMax;

        if (grid.axis === 'X') {
            return [
                [p, 0, mn],
                [p, 0, mx],
            ];
        } else {
            return [
                [mn, 0, p],
                [mx, 0, p],
            ];
        }
    }
}
