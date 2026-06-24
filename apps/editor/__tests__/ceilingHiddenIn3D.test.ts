// @vitest-environment happy-dom
//
// §CEILING-HIDDEN-IN-3D (2026-06-24) — regression guard.
//
// Founder request: rooms now have ceilings, but in the normal authoring 3D view
// the ceiling caps each room and blocks seeing the interior layout. Fix: hide
// ceiling elements BY DEFAULT whenever the 3D/perspective view is active — not
// just in the exploded view. Ceilings must still be PRESENT in plan views, the
// schedule and exports (view-only `.visible`, never a geometry/store mutation).
//
// This guards BottomActionMenu's scene visibility filter:
//   · 3D view active  → ceiling roots .visible = false, walls stay visible
//   · plan/section view active (view-activated mode !== '3D') → ceilings restored
//   · the hide is recomputed from captured originals each pass, so toggling
//     views repeatedly stays consistent and never strips a ceiling permanently.
//
// Plan-view ceilings, schedules and exports are unaffected because they render
// from a separate projection / the store, not the live 3D scene `.visible` flag
// this filter touches.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { BottomActionMenu, type BottomActionMenuProps } from '../src/ui/bottom-menu/BottomActionMenu.js';

function makeCeiling(id: string, levelId: string): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 1), new THREE.MeshBasicMaterial());
    mesh.userData.id = id;
    mesh.userData.levelId = levelId;
    mesh.userData.elementType = 'ceiling';
    mesh.userData.type = 'ceiling';
    mesh.visible = true;
    return mesh;
}

function makeWall(id: string, levelId: string): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.userData.id = id;
    mesh.userData.levelId = levelId;
    mesh.userData.elementType = 'wall';
    mesh.visible = true;
    return mesh;
}

const STUB_PROPS: BottomActionMenuProps = {
    toolManager: {},
    selectionManager: {},
    navManager: {},
    service: {},
    wallTool: {},
    deleteSelected: () => {},
} as unknown as BottomActionMenuProps;

describe('§CEILING-HIDDEN-IN-3D — ceilings hidden in 3D, present in plan', () => {
    let scene: THREE.Scene;
    let ceiling: THREE.Mesh;
    let wall: THREE.Mesh;
    // Captured 'view-activated' handler so the test can drive view switches.
    let viewHandler: ((p: unknown) => void) | undefined;

    // The runtime event bus is threaded via the constructor's 2nd arg (Layout.ts
    // does this in production), NOT window.runtime — so the stub must be passed in.
    function makeMenu(): BottomActionMenu {
        viewHandler = undefined;
        const runtime = {
            events: {
                on: (name: string, cb: (p: unknown) => void) => {
                    if (name === 'view-activated') viewHandler = cb;
                    return () => {};
                },
                emit: () => {},
            },
            // Constructor reads these for a debug log — provide the minimal shape.
            stores: {
                viewState: { activeLayer: null, activeLevel: null, zoom: 1 },
                project: { units: 'metric' },
            },
            scene: { snap: { mode: 'off' } },
        };
        return new BottomActionMenu(STUB_PROPS, runtime as never);
    }

    beforeEach(() => {
        scene = new THREE.Scene();
        ceiling = makeCeiling('ceil-L0', 'L0');
        wall = makeWall('wall-L0', 'L0');
        scene.add(ceiling, wall);

        (window as any).scene = scene;
        (window as any).projectContext = { activeLevelId: 'L0', levels: [{ id: 'L0' }] };
        (window as any).bimManager = {
            getLevels: () => [{ id: 'L0', elevation: 0 }],
            activeLevelId: 'L0',
        };
    });

    afterEach(() => {
        delete (window as any).scene;
        delete (window as any).projectContext;
        delete (window as any).bimManager;
        delete (window as any).runtime;
    });

    function activateView(mode: string): void {
        viewHandler?.({ mode });
    }

    it('hides the ceiling on initial 3D paint, keeps walls visible', async () => {
        const menu = makeMenu();
        // The constructor schedules the initial filter via queueMicrotask.
        await Promise.resolve();
        (menu as any)._applySceneVisibilityFilters(); // deterministic re-run

        expect(ceiling.visible).toBe(false);
        expect(wall.visible).toBe(true);
    });

    it('restores the ceiling when a plan view activates', () => {
        const menu = makeMenu();
        (menu as any)._applySceneVisibilityFilters();
        expect(ceiling.visible).toBe(false);

        // Switch to a plan ('Top') view — ceilings come back.
        activateView('Top');
        expect(ceiling.visible).toBe(true);
        expect(wall.visible).toBe(true);
    });

    it('re-hides the ceiling when 3D re-activates (toggling stays consistent)', () => {
        const menu = makeMenu();
        (menu as any)._applySceneVisibilityFilters();

        for (let i = 0; i < 3; i++) {
            activateView('Top');
            expect(ceiling.visible).toBe(true);
            activateView('3D');
            expect(ceiling.visible).toBe(false);
            expect(wall.visible).toBe(true);
        }
    });

    it('respects the user override — ceilings stay shown in 3D when hide is off', () => {
        const menu = makeMenu();
        (menu as any)._hideCeilingsIn3D = false;
        (menu as any)._applySceneVisibilityFilters();

        // Override off → ceiling NOT hidden even though the 3D view is active.
        expect(ceiling.visible).toBe(true);
        expect(wall.visible).toBe(true);
    });

    it('does not mutate the ceiling geometry/store — only the .visible flag', () => {
        const menu = makeMenu();
        (menu as any)._applySceneVisibilityFilters();

        // userData (the store-facing identity/tags) is untouched.
        expect(ceiling.userData.id).toBe('ceil-L0');
        expect(ceiling.userData.elementType).toBe('ceiling');
        expect(ceiling.userData.levelId).toBe('L0');
        // Geometry still present (not deleted/disposed).
        expect(ceiling.geometry).toBeTruthy();
        // Only the view flag changed.
        expect(ceiling.visible).toBe(false);
    });
});
