// @vitest-environment happy-dom
//
// §WALL-CUTAWAY-XRAY (2026-06-24) — regression guard.
//
// Bug: the "Wall Cutaway" toolbar button (BottomActionMenu) did a CLIPPING/
// section cut (a 1.2m clip plane sliced the wall tops off) instead of making
// the walls SEMI-TRANSPARENT (x-ray) so you can see into the rooms.
//
// Fix: `_toggleWallCutaway()` now drives `_applyWallCutawayXray(true/false)`,
// which clones each wall mesh's material with transparent=true + a low opacity
// + depthWrite=false, capturing the originals so OFF restores them exactly —
// the same capture/restore discipline the level filter uses for visibility.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { BottomActionMenu, type BottomActionMenuProps } from '../src/ui/bottom-menu/BottomActionMenu.js';

// A wall body: a Group tagged elementType='wall' with a child fragment mesh
// (the fragment carries no elementType — it lives on the parent Group).
function makeWall(id: string): { group: THREE.Group; body: THREE.Mesh; bodyMat: THREE.MeshStandardMaterial } {
    const group = new THREE.Group();
    group.userData.id = id;
    group.userData.elementType = 'wall';
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 0.2), bodyMat);
    body.userData.id = id;
    group.add(body);
    return { group, body, bodyMat };
}

function makeFloor(id: string): { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial } {
    const mat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(5, 0.1, 5), mat);
    mesh.userData.id = id;
    mesh.userData.elementType = 'slab';
    return { mesh, mat };
}

const STUB_PROPS: BottomActionMenuProps = {
    toolManager: {},
    selectionManager: {},
    navManager: {},
    service: {},
    wallTool: {},
    deleteSelected: () => {},
};

describe('§WALL-CUTAWAY-XRAY — wall cutaway makes walls transparent, not clipped', () => {
    let scene: THREE.Scene;
    let wall: ReturnType<typeof makeWall>;
    let floor: ReturnType<typeof makeFloor>;

    beforeEach(() => {
        scene = new THREE.Scene();
        wall = makeWall('wall-1');
        floor = makeFloor('floor-1');
        scene.add(wall.group, floor.mesh);
        (window as any).scene = scene;
    });

    afterEach(() => {
        delete (window as any).scene;
    });

    it('turning cutaway ON makes the wall semi-transparent (NOT a clip plane)', () => {
        const menu = new BottomActionMenu(STUB_PROPS);

        // Before: opaque, no clipping plane.
        expect(wall.body.material).toBe(wall.bodyMat);
        expect((wall.bodyMat as any).transparent).toBe(false);

        (menu as any)._toggleWallCutaway();

        const m = wall.body.material as THREE.Material;
        expect(m).not.toBe(wall.bodyMat);          // a new (cloned) material
        expect((m as any).transparent).toBe(true); // x-ray
        expect((m as any).opacity).toBeLessThan(1);
        expect((m as any).opacity).toBeGreaterThan(0);
        expect((m as any).depthWrite).toBe(false); // see through overlapping walls
        // It is X-RAY, not a SECTION: no clipping plane was installed.
        expect((m as any).clippingPlanes ?? null).toBeFalsy();
    });

    it('non-wall meshes (floor/slab) are left fully opaque', () => {
        const menu = new BottomActionMenu(STUB_PROPS);
        (menu as any)._toggleWallCutaway();

        expect(floor.mesh.material).toBe(floor.mat);
        expect((floor.mat as any).transparent).toBe(false);
    });

    it('turning cutaway OFF restores the wall material exactly', () => {
        const menu = new BottomActionMenu(STUB_PROPS);

        (menu as any)._toggleWallCutaway(); // ON
        expect(wall.body.material).not.toBe(wall.bodyMat);

        (menu as any)._toggleWallCutaway(); // OFF
        expect(wall.body.material).toBe(wall.bodyMat); // exact original restored
        expect((wall.bodyMat as any).transparent).toBe(false);
    });

    it('reset view restores wall material when cutaway was on', async () => {
        const menu = new BottomActionMenu(STUB_PROPS);

        (menu as any)._toggleWallCutaway(); // ON
        expect(wall.body.material).not.toBe(wall.bodyMat);

        await (menu as any)._resetView();
        expect(wall.body.material).toBe(wall.bodyMat);
    });

    it('toggles cleanly both ways across repeated presses', () => {
        const menu = new BottomActionMenu(STUB_PROPS);

        (menu as any)._toggleWallCutaway(); // ON
        (menu as any)._toggleWallCutaway(); // OFF
        (menu as any)._toggleWallCutaway(); // ON again

        const m = wall.body.material as THREE.Material;
        expect((m as any).transparent).toBe(true);

        (menu as any)._toggleWallCutaway(); // OFF again
        expect(wall.body.material).toBe(wall.bodyMat);
    });
});

// §CW90 item 8 — curtain walls are treated AS walls by both viewport modes.
function makeCurtainWall(id: string): {
    group: THREE.Group;
    mullion: THREE.Mesh; mullionMat: THREE.MeshStandardMaterial;
    panel: THREE.Mesh; panelMat: THREE.MeshStandardMaterial;
} {
    const group = new THREE.Group();
    group.userData.id = id;
    group.userData.elementType = 'CurtainWall';
    group.userData.type = 'curtain-wall';
    // A mullion part — opaque, stamped like CurtainWallBuilder does.
    const mullionMat = new THREE.MeshStandardMaterial({ color: 0x777777 });
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3, 0.08), mullionMat);
    mullion.userData = { elementType: 'CurtainWallPart', role: 'mullion', parentId: id };
    // A GLASS panel — the authored glazing material (transparent, catalogue row).
    const panelMat = new THREE.MeshStandardMaterial({ color: 0xeef8ff, transparent: true, opacity: 0.18 });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.5, 0.02), panelMat);
    panel.userData = { elementType: 'CurtainWallPart', role: 'panel', parentId: id };
    group.add(mullion, panel);
    return { group, mullion, mullionMat, panel, panelMat };
}

describe('§CW90 item 8 — cutaway + low-height treat curtain walls as walls', () => {
    let scene: THREE.Scene;
    let cw: ReturnType<typeof makeCurtainWall>;

    beforeEach(() => {
        scene = new THREE.Scene();
        cw = makeCurtainWall('cw-1');
        scene.add(cw.group);
        (window as any).scene = scene;
    });

    afterEach(() => {
        delete (window as any).scene;
    });

    it('⭐ cutaway x-rays the curtain-wall MULLION like a wall body', () => {
        const menu = new BottomActionMenu(STUB_PROPS);
        (menu as any)._toggleWallCutaway();

        const m = cw.mullion.material as THREE.Material;
        expect(m).not.toBe(cw.mullionMat);
        expect((m as any).transparent).toBe(true);
        expect((m as any).opacity).toBeLessThan(1);
    });

    it('⭐ cutaway leaves the authored GLASS panel material untouched (glass stays glass)', () => {
        const menu = new BottomActionMenu(STUB_PROPS);
        (menu as any)._toggleWallCutaway();

        // Already transparent — forcing the x-ray recipe would destroy the
        // authored glazing for no added see-through.
        expect(cw.panel.material).toBe(cw.panelMat);
        expect((cw.panelMat as any).opacity).toBeCloseTo(0.18, 6);
    });

    it('cutaway OFF restores the mullion material exactly', () => {
        const menu = new BottomActionMenu(STUB_PROPS);
        (menu as any)._toggleWallCutaway();
        (menu as any)._toggleWallCutaway();
        expect(cw.mullion.material).toBe(cw.mullionMat);
    });

    it('⭐ low-height mode includes the curtain wall in the wall target set (parity with walls)', () => {
        const menu = new BottomActionMenu(STUB_PROPS);
        // The ONE predicate both modes funnel through.
        expect((menu as any)._isWallObject(cw.group)).toBe(true);
        expect((menu as any)._isWallObject(cw.mullion)).toBe(true);
        expect((menu as any)._isWallObject(cw.panel)).toBe(true);
        // And its mode rule answers exactly as it does for a wall.
        (menu as any)._wallCutMode = 'down';
        expect((menu as any)._wallVisibleInMode(cw.group)).toBe(false);
        (menu as any)._wallCutMode = 'up';
        expect((menu as any)._wallVisibleInMode(cw.group)).toBe(true);
    });
});
