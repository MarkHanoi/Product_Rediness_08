// @vitest-environment happy-dom
//
// §UND-VIEW-SCOPE (L-1197) — the import underlay must render ONLY in the views that own it.
//
// THE FOUNDER'S BUG (production, 2026-08-19): clicking "▦ Plan + Site" composites an ESRI
// aerial of the site and places it through the import-underlay pipeline. Before this fix the
// underlay mesh was added to the SHARED THREE scene with no view scope of any kind, so it
// rendered in EVERY view — "even my 3D view has this image attached".
//
// WHAT THIS SUITE PROVES, THROUGH THE REAL PATH:
//   • the REAL `createPlanCanvasUnderlayFromSiteOverlay` stamps the scope on the mesh;
//   • the REAL `installUnderlayViewScope` listeners, driven by a REAL event emitter standing
//     in for `runtime.events`, hide a plan-scoped underlay the moment ViewController announces
//     `view-activated { mode:'3D' }` — and restore it on the way back;
//   • the DEFAULT (no scope) still renders in 3D, so L-258's founder criterion ("the plan
//     visible as an underlay in BOTH panes of the 3D+plan split") does not regress;
//   • the view gate COMPOSES with the Import Manager eye instead of overriding it.
//
// The only thing faked is `FloorPlanUnderlayTool` itself — an L1 package this lane is fenced
// out of, and NOT the subject under test. The fake mirrors the two load-bearing behaviours of
// the real tool verbatim (`FloorPlanUnderlayTool.ts:114–131`): it publishes itself on
// `window.floorPlanUnderlayTool` and it creates the mesh VISIBLE. The scope authority, its
// wiring, the creation bridge and the event plumbing are all real.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => {
    /** The mesh shape the creation bridge actually touches (position / rotation /
     *  updateMatrixWorld / visible / userData) — mirrors the real THREE.Mesh surface. */
    const newMesh = (): {
        visible: boolean;
        userData: Record<string, unknown>;
        position: { x: number; y: number; z: number };
        rotation: { x: number; y: number; z: number };
        updateMatrixWorld: () => void;
    } => ({
        visible: true,
        userData: {},
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        updateMatrixWorld: () => { /* no-op */ },
    });
    const meshState = {
        mesh: newMesh(),
        pxPerMeter: 1, widthPx: 1, heightPx: 1,
        planWidthMeters: 1, planHeightMeters: 1,
        locked: false, isSelected: false,
    };
    class FakeUnderlayTool {
        async create(): Promise<void> {
            // Mirrors the real tool: mesh starts VISIBLE, tool publishes itself.
            meshState.mesh.visible = true;
            meshState.mesh.userData = {
                id: 'underlay-test', type: 'floor_plan_underlay',
                isUnderlay: true, isNonBIM: true,
            };
            (window as unknown as { floorPlanUnderlayTool?: unknown }).floorPlanUnderlayTool = this;
        }
        getState(): typeof meshState { return meshState; }
        dispose(): void { /* no-op */ }
    }
    class FakeCreateUnderlayCommand {
        type = 'CREATE_UNDERLAY';
        constructor(public input: unknown) {}
    }
    return { meshState, newMesh, FakeUnderlayTool, FakeCreateUnderlayCommand };
});
vi.mock('@pryzm/input-host', () => ({ FloorPlanUnderlayTool: h.FakeUnderlayTool }));
vi.mock('@pryzm/command-registry', () => ({ CreateUnderlayCommand: h.FakeCreateUnderlayCommand }));

const { meshState, newMesh } = h;

import { createPlanCanvasUnderlayFromSiteOverlay } from '../src/engine/createSiteOverlayUnderlay';
import {
    installUnderlayViewScope,
    underlayVisibleInViewMode,
    readUnderlayViewScope,
    getUnderlayUserVisible,
    __resetUnderlayViewScopeForTests,
} from '../src/engine/underlayViewScope';

/** A REAL emitter standing in for `runtime.events` — the wiring under test must work
 *  against a bus that actually delivers, not against a spy that swallows. */
function makeEvents(): {
    on: (e: string, fn: (p: unknown) => void) => void;
    emit: (e: string, p?: unknown) => void;
} {
    const map = new Map<string, Array<(p: unknown) => void>>();
    return {
        on: (e, fn) => { const l = map.get(e) ?? []; l.push(fn); map.set(e, l); },
        emit: (e, p) => { for (const fn of map.get(e) ?? []) fn(p); },
    };
}

let events: ReturnType<typeof makeEvents>;

const INPUT = {
    dataUrl: 'data:image/png;base64,AAAA',
    widthPx: 893, heightPx: 893,     // the founder's screenshot: 893 × 893 px
    pxPerMeter: 2.2325,              // 400.02 m across
    positionEast: 0, positionNorth: 0, rotationZ: 0,
    fileName: 'Site GIS context',
};

/** Give the module's `queueMicrotask` re-apply a chance to run. */
const settle = (): Promise<void> => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
    __resetUnderlayViewScopeForTests();
    meshState.mesh = newMesh();
    events = makeEvents();
    const w = window as unknown as Record<string, unknown>;
    w['scene'] = {};
    w['camera'] = {};
    w['renderer'] = { domElement: document.createElement('canvas') };
    w['runtime'] = { bus: { executeCommand: vi.fn(async () => {}) }, events };
    w['projectContext'] = { activeLevelId: null };
    delete w['floorPlanUnderlayTool'];
    delete w['__pryzmRemoveUnderlayInternal'];
    delete w['__pryzmRecreateUnderlayInternal'];
});

describe('§UND-VIEW-SCOPE — underlayVisibleInViewMode (the decision)', () => {
    it('a plan-scoped underlay renders in plan-family views only', () => {
        for (const mode of ['Top', 'Ceiling', 'ceiling-plan', 'Ground Floor']) {
            expect(underlayVisibleInViewMode('plan', mode)).toBe(true);
        }
        for (const mode of ['3D', 'Front', 'Back', 'Left', 'Right', 'Section']) {
            expect(underlayVisibleInViewMode('plan', mode)).toBe(false);
        }
    });

    it('an unclassifiable view fails CLOSED for a scoped underlay, OPEN for an unscoped one', () => {
        expect(underlayVisibleInViewMode('plan', null)).toBe(false);
        expect(underlayVisibleInViewMode('plan', undefined)).toBe(false);
        expect(underlayVisibleInViewMode('all', null)).toBe(true);
    });

    it("defaults an unstamped underlay to 'all' — L-258 compatibility", () => {
        expect(readUnderlayViewScope({ visible: true, userData: {} })).toBe('all');
        expect(readUnderlayViewScope(null)).toBe('all');
        expect(readUnderlayViewScope({ visible: true, userData: { viewScope: 'plan' } })).toBe('plan');
    });
});

describe('§UND-VIEW-SCOPE — real create → real view switch', () => {
    it('THE FOUNDER BUG: a plan-scoped site raster is HIDDEN when the 3D view activates', async () => {
        installUnderlayViewScope();

        const ok = await createPlanCanvasUnderlayFromSiteOverlay({ ...INPUT, viewScope: 'plan' });
        expect(ok).toBe(true);
        // The creation bridge stamped the scope on the mesh that actually renders.
        expect(meshState.mesh.userData['viewScope']).toBe('plan');

        // The plan view that OWNS it — visible.
        events.emit('view-activated', { mode: 'Top', type: 'orthographic', source: 'view-switch' });
        expect(meshState.mesh.visible).toBe(true);

        // Switch to 3D. Before this fix the mesh stayed in the shared scene and rendered
        // here — this is the assertion that fails without §UND-VIEW-SCOPE.
        events.emit('view-activated', { mode: '3D', type: 'perspective', source: 'view-switch' });
        expect(meshState.mesh.visible).toBe(false);

        // …and every non-plan view, not just 3D.
        for (const mode of ['Front', 'Back', 'Left', 'Right']) {
            events.emit('view-activated', { mode, type: 'perspective', source: 'view-switch' });
            expect(meshState.mesh.visible).toBe(false);
        }

        // Back to plan — it returns. The gate is a filter, not a delete.
        events.emit('view-activated', { mode: 'Top', type: 'orthographic', source: 'view-switch' });
        expect(meshState.mesh.visible).toBe(true);
    });

    it('L-258 NON-REGRESSION: an unscoped (user-placed) plan still renders in 3D', async () => {
        installUnderlayViewScope();
        const ok = await createPlanCanvasUnderlayFromSiteOverlay(INPUT); // no viewScope
        expect(ok).toBe(true);

        events.emit('view-activated', { mode: '3D', type: 'perspective', source: 'view-switch' });
        expect(meshState.mesh.visible).toBe(true);
    });

    it('composes with the Import Manager eye — the view gate never un-hides a hidden import', async () => {
        installUnderlayViewScope();
        await createPlanCanvasUnderlayFromSiteOverlay({ ...INPUT, viewScope: 'plan' });
        events.emit('view-activated', { mode: 'Top' });
        expect(meshState.mesh.visible).toBe(true);

        // User clicks the eye OFF (ImportManagerPanel._dispatchVisibility).
        events.emit('pryzm-floor-plan-underlay-set-visibility', { visible: false });
        await settle();
        expect(getUnderlayUserVisible()).toBe(false);
        expect(meshState.mesh.visible).toBe(false);

        // A view switch back into the owning view must NOT resurrect it.
        events.emit('view-activated', { mode: 'Top' });
        expect(meshState.mesh.visible).toBe(false);

        // Eye back ON, in the owning view → visible; in 3D → still gated.
        events.emit('pryzm-floor-plan-underlay-set-visibility', { visible: true });
        await settle();
        expect(meshState.mesh.visible).toBe(true);
        events.emit('view-activated', { mode: '3D' });
        expect(meshState.mesh.visible).toBe(false);
    });

    it('a create that lands while the user is already in 3D never flashes into it', async () => {
        installUnderlayViewScope();
        events.emit('view-activated', { mode: '3D' });          // user is in 3D first
        await createPlanCanvasUnderlayFromSiteOverlay({ ...INPUT, viewScope: 'plan' });
        expect(meshState.mesh.visible).toBe(false);
    });
});
