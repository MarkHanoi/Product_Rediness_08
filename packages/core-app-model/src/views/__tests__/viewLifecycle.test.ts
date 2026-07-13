/**
 * @vitest-environment happy-dom
 *
 * §G8-VIEW-LIFECYCLE — the V1 launch gate for "view creation / management"
 * (V1-LAUNCH-IMPLEMENTATION-PLAN phase 3.1). This suite pins the invariants the
 * gate is defined by, at the layer that OWNS them (core-app-model/views):
 *
 *   I1  every project gets its default views (3D + Ground plan + 4 elevations) —
 *       on boot, after a project SWITCH (clear), and after LOAD-from-snapshot.
 *   I3  view properties round-trip byte-identically through serialize/deserialize
 *       (detail level, view range, crop, visibility intent), and a PERSISTED view
 *       restores its OWN stored detailLevel — the raised DEFAULT_DETAIL_LEVEL
 *       ('medium' → 'fine', L-252) must never clobber it.
 *   I4  deleting a view does not ORPHAN its dependent per-view state, and UNDO
 *       (viewDefinitionStore.restore) re-instates it.
 *
 * I2 (create/rename/delete through the command bus, one undo entry each) is pinned
 * in apps/editor/__tests__/viewBusLifecycle.test.ts — the bus wiring lives at L5.
 * I5 (a plan view cannot be tumbled) is pinned in OrthoPlanCameraLock.test.ts.
 *
 * Contract: C06 §views, C03 §1.1 (ViewDefinition is a schema-stable entity),
 *           C05 (snapshot round-trip), C13 (project isolation / clear-on-switch).
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { viewDefinitionStore } from '../ViewDefinitionStore';
import {
    initDefaultViewsManager,
    DEFAULT_3D_VIEW_ID,
    DEFAULT_PLAN_VIEW_ID,
    DEFAULT_ELEVATION_VIEWS,
} from '../DefaultViewsManager';
import { initViewDeletionCascade } from '../ViewDeletionCascade';
import { viewIntentInstanceStore } from '../../presentation/ViewIntentInstanceStore';
import { SYSTEM_INTENT_IDS } from '../../presentation/SystemIntents';
import { projectScopeRegistry } from '../../persistence/ProjectScopeRegistry';
import { DEFAULT_DETAIL_LEVEL } from '@pryzm/schemas/view';

const ALL_DEFAULT_IDS = [
    DEFAULT_3D_VIEW_ID,
    DEFAULT_PLAN_VIEW_ID,
    ...DEFAULT_ELEVATION_VIEWS.map(e => e.id),
];

function ids(): Set<string> {
    return new Set(viewDefinitionStore.getAll().map(v => v.id));
}

describe('§G8-VIEW-LIFECYCLE — I1: every project gets its default views', () => {
    beforeEach(() => {
        viewDefinitionStore.reset();
        viewIntentInstanceStore.reset();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('boot: the 6 system defaults exist (3D + Ground plan + N/E/S/W elevations)', () => {
        initDefaultViewsManager();
        const present = ids();
        for (const id of ALL_DEFAULT_IDS) expect(present.has(id)).toBe(true);
        expect(ALL_DEFAULT_IDS).toHaveLength(6);
    });

    it('project SWITCH: the previous project\'s views are gone and the defaults are re-guaranteed', () => {
        vi.useFakeTimers();
        initDefaultViewsManager();          // registers the vd:store-reset listener
        viewDefinitionStore.create({ id: 'vd-project-a', name: 'Project A view', viewType: 'plan' });
        expect(ids().has('vd-project-a')).toBe(true);

        // Project switch = ProjectScopeRegistry clears every project-scoped store
        // (C13 — the production clear-on-switch path; viewDefinitionStore registers
        // its own `reset()` as the 'viewDefinitionStore' scope).
        projectScopeRegistry.clearAll();
        // No snapshot follows (a brand-new project), so the 300 ms vd:store-reset
        // fallback is the backstop for any default not already re-seeded.
        vi.advanceTimersByTime(301);

        const present = ids();
        expect(present.has('vd-project-a')).toBe(false);           // C13 — no cross-project leak
        for (const id of ALL_DEFAULT_IDS) expect(present.has(id)).toBe(true);
    });

    it('LOAD-from-snapshot: a snapshot with no default views is topped-up on vd:store-loaded', () => {
        initDefaultViewsManager();
        // A legacy project snapshot that predates the system defaults: one user view.
        viewDefinitionStore.deserialize({
            version: 1,
            views: [{
                id: 'vd-user-1', name: 'My Plan', viewType: 'plan',
                spatial: { levelId: 'L1' }, temporal: {}, rules: [],
                dependencies: { elements: [] },
                metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'user', version: 1 },
            }],
        });
        const present = ids();
        expect(present.has('vd-user-1')).toBe(true);       // the loaded view survives
        for (const id of ALL_DEFAULT_IDS) expect(present.has(id)).toBe(true); // …and the defaults are topped up
    });
});

describe('§G8-VIEW-LIFECYCLE — I3: view properties round-trip', () => {
    beforeEach(() => {
        viewDefinitionStore.reset();
        viewIntentInstanceStore.reset();
    });

    it('detail level / view range / crop / spatial survive serialize → reset → deserialize byte-identically', () => {
        viewDefinitionStore.create({
            id: 'vd-rt-1',
            name: 'Round Trip Plan',
            viewType: 'plan',
            discipline: 'architectural',
            spatial: { levelId: 'L2' },
            output: { scale: 50, detailLevel: 'coarse', visualStyle: 'shadedWithEdges', shadows: false },
            viewRange: {
                top:    { levelId: 'L2', offset: 2.3 },
                cut:    { levelId: 'L2', offset: 1.2 },
                bottom: { levelId: 'L2', offset: 0 },
                depth:  { levelId: 'L1', offset: -0.3 },
            },
            crop: {
                enabled: true,
                region: { min: [-5, -4], max: [5, 4] },
                annotationCrop: true,
                farClip: { offset: 12.5 },
            },
        });
        const before = viewDefinitionStore.get('vd-rt-1')!;

        const snapshot = viewDefinitionStore.serialize();
        const wire = JSON.parse(JSON.stringify(snapshot));   // what actually hits disk
        viewDefinitionStore.reset();
        expect(viewDefinitionStore.has('vd-rt-1')).toBe(false);
        viewDefinitionStore.deserialize(wire);

        const after = viewDefinitionStore.get('vd-rt-1')!;
        expect(after).toEqual(before);                        // byte-identical restoration
        expect(after.output!.detailLevel).toBe('coarse');
        expect(after.viewRange).toEqual(before.viewRange);
        expect(after.crop).toEqual(before.crop);
    });

    it('a PERSISTED view keeps its OWN detailLevel — the raised DEFAULT_DETAIL_LEVEL never clobbers it (L-252)', () => {
        // The new default is 'fine'; an older project persisted 'medium' on the very
        // ids DefaultViewsManager guarantees. The guarantee must be create-if-missing,
        // never overwrite-with-the-new-default.
        expect(DEFAULT_DETAIL_LEVEL).toBe('fine');

        viewDefinitionStore.deserialize({
            version: 1,
            views: ALL_DEFAULT_IDS.map((id, i) => ({
                id, name: `Persisted ${i}`,
                viewType: id === DEFAULT_3D_VIEW_ID ? '3d' : (id === DEFAULT_PLAN_VIEW_ID ? 'plan' : 'elevation'),
                spatial: {}, temporal: {}, rules: [], dependencies: { elements: [] },
                output: { detailLevel: 'medium' },
                metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'system', version: 1 },
            })),
        });
        initDefaultViewsManager();   // the boot guarantee runs over the loaded project

        for (const id of ALL_DEFAULT_IDS) {
            expect(viewDefinitionStore.get(id)!.output!.detailLevel).toBe('medium');
        }
    });

    it('a MISSING default view is created with the current DEFAULT_DETAIL_LEVEL', () => {
        initDefaultViewsManager();
        expect(viewDefinitionStore.get(DEFAULT_PLAN_VIEW_ID)!.output!.detailLevel).toBe(DEFAULT_DETAIL_LEVEL);
    });
});

describe('§G8-VIEW-LIFECYCLE — I4: deleting a view does not orphan its dependent state', () => {
    beforeEach(() => {
        viewDefinitionStore.reset();
        viewIntentInstanceStore.reset();
        initViewDeletionCascade();
    });

    function makeView(id: string): void {
        viewDefinitionStore.create({ id, name: id, viewType: 'plan', spatial: { levelId: 'L1' } });
        viewIntentInstanceStore.assign(id, SYSTEM_INTENT_IDS.architecturalDocumentation);
    }

    it('the view-intent instance is purged with the view (no orphan in the saved snapshot)', () => {
        makeView('vd-del-1');
        expect(viewIntentInstanceStore.has('vd-del-1')).toBe(true);

        viewDefinitionStore.delete('vd-del-1');

        expect(viewDefinitionStore.has('vd-del-1')).toBe(false);
        expect(viewIntentInstanceStore.has('vd-del-1')).toBe(false);
        // …and the orphan is gone from what gets serialised to disk.
        expect(viewIntentInstanceStore.serialize().instances.some(i => i.viewId === 'vd-del-1')).toBe(false);
    });

    it('UNDO of the delete re-instates the dependent state (restore → view-created)', () => {
        makeView('vd-del-2');
        const intentBefore = viewIntentInstanceStore.get('vd-del-2');
        const snapshot = viewDefinitionStore.get('vd-del-2')!;

        viewDefinitionStore.delete('vd-del-2');
        expect(viewIntentInstanceStore.has('vd-del-2')).toBe(false);

        // This is exactly what DeleteViewDefinitionCommand.undo() does.
        viewDefinitionStore.restore(snapshot);

        expect(viewDefinitionStore.has('vd-del-2')).toBe(true);
        expect(viewIntentInstanceStore.has('vd-del-2')).toBe(true);
        expect(viewIntentInstanceStore.get('vd-del-2')).toEqual(intentBefore);
    });

    it('the cascade never purges state belonging to a DIFFERENT view', () => {
        makeView('vd-keep');
        makeView('vd-drop');
        viewDefinitionStore.delete('vd-drop');
        expect(viewIntentInstanceStore.has('vd-keep')).toBe(true);
    });
});
