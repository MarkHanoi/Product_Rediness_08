/**
 * @vitest-environment happy-dom
 *
 * §FEAT-DEFAULT-ELEVATIONS (L-110) — DefaultViewsManager guarantees the four
 * building elevations (N/E/S/W) on every project startup, alongside the existing
 * Ground Floor plan + {3D} defaults. They are deletable but re-created, and each
 * carries the `spatial.projectionDirection` shape EdgeProjectorService reads so it
 * projects a REAL elevation (not a blank stub).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { viewDefinitionStore } from '../ViewDefinitionStore';
import {
    initDefaultViewsManager,
    DEFAULT_3D_VIEW_ID,
    DEFAULT_PLAN_VIEW_ID,
    DEFAULT_ELEVATION_VIEWS,
} from '../DefaultViewsManager';

function idsPresent(): Set<string> {
    return new Set(viewDefinitionStore.getAll().map(v => v.id));
}

describe('§FEAT-DEFAULT-ELEVATIONS (L-110)', () => {
    beforeEach(() => {
        viewDefinitionStore.reset();
    });

    it('guarantees plan + {3D} + four N/E/S/W elevations on startup', () => {
        initDefaultViewsManager();
        const ids = idsPresent();
        expect(ids.has(DEFAULT_3D_VIEW_ID)).toBe(true);
        expect(ids.has(DEFAULT_PLAN_VIEW_ID)).toBe(true);
        for (const elev of DEFAULT_ELEVATION_VIEWS) {
            expect(ids.has(elev.id)).toBe(true);
        }
        expect(viewDefinitionStore.getByType('elevation')).toHaveLength(4);
    });

    it('orients each elevation to project north via spatial.projectionDirection (real projection)', () => {
        initDefaultViewsManager();
        for (const elev of DEFAULT_ELEVATION_VIEWS) {
            const def = viewDefinitionStore.get(elev.id)!;
            expect(def.viewType).toBe('elevation');
            expect(def.spatial.projectionDirection).toEqual({
                x: elev.dir.x, y: elev.dir.y, z: elev.dir.z,
            });
        }
        // The four directions are distinct (N/E/S/W), not all the same axis.
        const dirs = DEFAULT_ELEVATION_VIEWS.map(e => `${e.dir.x},${e.dir.z}`);
        expect(new Set(dirs).size).toBe(4);
    });

    it('re-creates a deleted default elevation when the guarantee re-runs', () => {
        initDefaultViewsManager();
        const victim = DEFAULT_ELEVATION_VIEWS[0].id;
        expect(viewDefinitionStore.delete(victim)).toBe(true);
        expect(idsPresent().has(victim)).toBe(false);
        // Re-running the boot guarantee (as store-load / reset events do) restores it.
        initDefaultViewsManager();
        expect(idsPresent().has(victim)).toBe(true);
    });
});
