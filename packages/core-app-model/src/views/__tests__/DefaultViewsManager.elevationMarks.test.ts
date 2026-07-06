/**
 * @vitest-environment happy-dom
 *
 * §FEAT-ELEVATION-MARKERS (L-116) — DefaultViewsManager guarantees, for each of
 * the four default elevations (L-110), a first-class DOC-2.7 `elevation-mark`
 * ANNOTATION on the Ground Floor plan (like any BIM/Revit elevation tag). The
 * mark is project-north oriented, links back to its elevation view, is deleted
 * with its elevation, and is re-guaranteed on the next startup — mirroring the
 * L-110 default-view guarantee.
 *
 * Reuses the shared `window.annotationStore`; here we stand in a minimal fake
 * with the same add/has/remove/getAll/getByType surface (no plugins/annotations
 * up-import — core-app-model is a lower layer).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { viewDefinitionStore } from '../ViewDefinitionStore';
import {
    initDefaultViewsManager,
    DEFAULT_PLAN_VIEW_ID,
    DEFAULT_ELEVATION_VIEWS,
} from '../DefaultViewsManager';

interface FakeAnn { id: string; type: string; ownerViewId: string; parameters: any; geometry2D: any }

class FakeAnnotationStore {
    private _data = new Map<string, FakeAnn>();
    add(el: FakeAnn): void { if (!this._data.has(el.id)) this._data.set(el.id, el); }
    has(id: string): boolean { return this._data.has(id); }
    remove(id: string): void { this._data.delete(id); }
    getAll(): FakeAnn[] { return [...this._data.values()]; }
    getByType(type: string): FakeAnn[] { return this.getAll().filter(a => a.type === type); }
}

function installFakeAnnotationStore(): FakeAnnotationStore {
    const s = new FakeAnnotationStore();
    (window as any).annotationStore = s;
    return s;
}

describe('§FEAT-ELEVATION-MARKERS (L-116)', () => {
    let anns: FakeAnnotationStore;

    beforeEach(() => {
        viewDefinitionStore.reset();
        anns = installFakeAnnotationStore();
    });

    it('creates one elevation-mark on the Ground Floor plan per default elevation', () => {
        initDefaultViewsManager();
        const marks = anns.getByType('elevation-mark');
        expect(marks).toHaveLength(4);
        // one per default elevation, all owned by the ground-floor plan, all linked
        for (const elev of DEFAULT_ELEVATION_VIEWS) {
            const mark = anns.getAll().find(m => m.id === elev.markId);
            expect(mark).toBeDefined();
            expect(mark!.type).toBe('elevation-mark');
            expect(mark!.ownerViewId).toBe(DEFAULT_PLAN_VIEW_ID);
            expect(mark!.parameters.linkedViewId).toBe(elev.id); // link → navigate to elevation
        }
    });

    it('orients each mark to project north (facingDirection = elevation projectionDirection)', () => {
        initDefaultViewsManager();
        for (const elev of DEFAULT_ELEVATION_VIEWS) {
            const mark = anns.getAll().find(m => m.id === elev.markId)!;
            expect(mark.parameters.facingDirection).toEqual({ x: elev.dir.x, y: 0, z: elev.dir.z });
            // placed on the side the elevation looks FROM (arrow points into the model)
            expect(mark.parameters.position).toEqual({ x: -elev.dir.x * 6, y: 0, z: -elev.dir.z * 6 });
        }
        // the four marks point in four distinct directions
        const dirs = anns.getByType('elevation-mark')
            .map(m => `${m.parameters.facingDirection.x},${m.parameters.facingDirection.z}`);
        expect(new Set(dirs).size).toBe(4);
    });

    it('is idempotent — re-running the guarantee does not duplicate marks', () => {
        initDefaultViewsManager();
        initDefaultViewsManager();
        expect(anns.getByType('elevation-mark')).toHaveLength(4);
    });

    it('deletes a mark with its elevation, then re-guarantees it on the next startup', () => {
        initDefaultViewsManager();
        const victim = DEFAULT_ELEVATION_VIEWS[0];
        expect(anns.has(victim.markId)).toBe(true);

        // Simulate the DeleteViewDefinitionCommand path: the store deletes the view
        // and dispatches vd:view-deleted, which the guard listens to.
        viewDefinitionStore.delete(victim.id);
        window.dispatchEvent(new CustomEvent('vd:view-deleted', { detail: { viewId: victim.id } }));
        // The mark is removed synchronously with its elevation.
        expect(anns.has(victim.markId)).toBe(false);

        // Re-running the boot guarantee restores both the elevation and its mark.
        initDefaultViewsManager();
        expect(viewDefinitionStore.has(victim.id)).toBe(true);
        expect(anns.has(victim.markId)).toBe(true);
        expect(anns.getByType('elevation-mark')).toHaveLength(4);
    });

    it('tolerates the annotation store not being ready (views still created; marks topped-up later)', () => {
        (window as any).annotationStore = undefined;
        initDefaultViewsManager();
        // Elevations exist even with no annotation store…
        expect(viewDefinitionStore.getByType('elevation')).toHaveLength(4);
        // …and marks are topped-up once the store appears + the guarantee re-runs.
        const s = installFakeAnnotationStore();
        initDefaultViewsManager();
        expect(s.getByType('elevation-mark')).toHaveLength(4);
    });
});
