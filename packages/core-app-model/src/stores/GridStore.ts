/**
 * GridStore — Semantic authority for BIM structural grids.
 *
 * §01 §3.8 CONTRACT: Emits all mutations through the centralized StoreEventBus // TODO(TASK-08)
 * so DependencyResolver, Topology Layer (Phase 2), and World Model (Phase 3)
 * receive deterministic change notifications.
 *
 * §01 §3.5: Store is data only — no geometry, no builders, no spatial registration.
 *
 * SINGLE SOURCE OF TRUTH: BimManager is the rendering authority (scene meshes).
 * GridStore is the semantic authority (data). Commands bridge the two.
 */

import { Grid } from '../BimKernel';
import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)

export type { Grid };

export class GridStore {
    private grids: Map<string, Grid> = new Map();

    // Accepts optional projectContext for backward compatibility with call sites
    // that were created before the StoreEventBus migration. The argument is
    // intentionally unused — StoreEventBus is imported as a singleton (§01 §3.8).
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_projectContext?: unknown) {}

    add(grid: {
        id: string;
        name: string;
        axis: 'X' | 'Y';
        position: number;
        extentMin?: number;
        extentMax?: number;
        isVisible?: boolean;
        color?: string;
        isPinned?: boolean;
        mode?: 'orthogonal' | 'linear';
        startX?: number;
        startZ?: number;
        endX?: number;
        endZ?: number;
    }): void {
        const safeGrid: Grid = {
            extentMin: -100,
            extentMax: 100,
            isVisible: true,
            isPinned: false,
            mode: 'orthogonal',
            ...grid
        };
        this.grids.set(safeGrid.id, safeGrid);

        storeEventBus.emit({
            elementId: safeGrid.id,
            elementType: 'Grid',
            operation: 'create',
            timestamp: Date.now()
        });
    }

    /**
     * §40 §3 — PIN guard.
     * Geometry-touching fields cannot be mutated on a pinned grid. Visual,
     * naming and visibility updates are still allowed. To bypass the guard
     * (e.g. from TogglePinGridCommand or the Unpin user action) pass
     * `_force: true` in `updates`.
     */
    update(id: string, updates: Partial<Omit<Grid, 'id'>> & { _force?: boolean }): void {
        const existing = this.grids.get(id);
        if (!existing) {
            console.warn(`[GridStore] update: grid "${id}" not found.`);
            return;
        }

        const force = updates._force === true;
        const { _force, ...patch } = updates as any;

        if (existing.isPinned && !force) {
            const GEOM_KEYS = ['axis', 'position', 'extentMin', 'extentMax',
                               'mode', 'startX', 'startZ', 'endX', 'endZ'];
            const blocked = GEOM_KEYS.filter(k => k in patch);
            if (blocked.length > 0) {
                console.warn(
                    `[GridStore] update: grid "${id}" is PINNED — refusing to mutate ${blocked.join(', ')}. ` +
                    `Unpin the grid first or pass { _force: true }.`
                );
                // Drop the geometry fields, keep the rest (color/name/isVisible…).
                for (const k of blocked) delete patch[k];
                if (Object.keys(patch).length === 0) return;
            }
        }

        const next = structuredClone(existing);
        Object.assign(next, patch);
        this.grids.set(id, next);

        storeEventBus.emit({
            elementId: id,
            elementType: 'Grid',
            operation: 'update',
            timestamp: Date.now()
        });
    }

    remove(id: string): void {
        if (!this.grids.has(id)) return;
        this.grids.delete(id);

        storeEventBus.emit({
            elementId: id,
            elementType: 'Grid',
            operation: 'delete',
            timestamp: Date.now()
        });
    }

    get(id: string): Grid | undefined {
        return this.grids.get(id);
    }

    getById(id: string): Grid | undefined {
        return this.grids.get(id);
    }

    getAll(): Grid[] {
        return Array.from(this.grids.values());
    }

    has(id: string): boolean {
        return this.grids.has(id);
    }
}
