// @vitest-environment happy-dom
//
// §LEVEL-EXPLODE-HIDE-CEILINGS (2026-06-24) — regression guard.
//
// Founder request: rooms now have ceilings, but in the EXPLODED / stacked-
// levels 3D view the ceiling caps each storey and occludes the room layout
// below — you can't see into the floors. Fix: hide ceiling roots while the
// levels are exploded; restore them when the explode collapses back to the
// normal stacked building view. View-only — no geometry/store mutation.
//
// This guards the controller's _applyMode visibility derivation:
//   · exploded → ceiling roots .visible = false, non-ceiling roots stay visible
//   · stacked  → ceiling roots .visible = true again (normal building view)
//   · solo     → only the soloed level shows (ceiling-hide only on explode)
//   · deactivate → every root's visibility restored
//   · repeated toggling stays consistent (recomputed from scratch each apply)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { LevelExplodeController } from '../src/engine/inspect/LevelExplodeController.js';

// Ceiling root as stamped by CeilingPanelBuilder: elementType/type 'ceiling' + levelId.
function makeCeiling(id: string, levelId: string): THREE.Group {
    const g = new THREE.Group();
    g.userData.id = id;
    g.userData.elementType = 'ceiling';
    g.userData.type = 'ceiling';
    g.userData.levelId = levelId;
    g.visible = true;
    return g;
}

// A wall mesh carries a levelId at build time.
function makeWall(id: string, levelId: string): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.userData.id = id;
    mesh.userData.levelId = levelId;
    mesh.userData.elementType = 'wall';
    mesh.visible = true;
    return mesh;
}

describe('§LEVEL-EXPLODE-HIDE-CEILINGS — exploded view hides ceilings, collapse restores', () => {
    let scene: THREE.Scene;
    let controller: LevelExplodeController;
    let ceilL0: THREE.Group;
    let ceilL1: THREE.Group;
    let wallL0: THREE.Mesh;
    let wallL1: THREE.Mesh;

    beforeEach(() => {
        scene = new THREE.Scene();
        ceilL0 = makeCeiling('ceil-L0', 'L0');
        ceilL1 = makeCeiling('ceil-L1', 'L1');
        wallL0 = makeWall('wall-L0', 'L0');
        wallL1 = makeWall('wall-L1', 'L1');
        scene.add(ceilL0, ceilL1, wallL0, wallL1);

        (window as any).bimManager = {
            getLevels: () => [
                { id: 'L0', elevation: 0, childrenIds: ['ceil-L0', 'wall-L0'] },
                { id: 'L1', elevation: 3, childrenIds: ['ceil-L1', 'wall-L1'] },
            ],
        };
        (window as any).runtime = { events: { on: () => () => {} } };

        controller = new LevelExplodeController();
        controller.init(scene);
        controller.activate(); // builds groups, resets to stacked
    });

    afterEach(() => {
        controller.dispose();
        delete (window as any).bimManager;
        delete (window as any).runtime;
    });

    function applyMode(mode: 'stacked' | 'exploded' | 'solo', soloLevelId?: string): void {
        // _onExplodeEvent is the public ingress; call the same path the DOM event uses.
        (controller as any)._onExplodeEvent({ mode, soloLevelId });
    }

    it('activate (stacked) keeps ceilings visible — normal building view unaffected', () => {
        expect(ceilL0.visible).toBe(true);
        expect(ceilL1.visible).toBe(true);
        expect(wallL0.visible).toBe(true);
        expect(wallL1.visible).toBe(true);
    });

    it('exploded hides every ceiling root but keeps the layout (walls) visible', () => {
        applyMode('exploded');
        expect(ceilL0.visible).toBe(false);
        expect(ceilL1.visible).toBe(false);
        expect(wallL0.visible).toBe(true);
        expect(wallL1.visible).toBe(true);
    });

    it('collapse (exploded → stacked) restores the ceilings', () => {
        applyMode('exploded');
        expect(ceilL0.visible).toBe(false);

        applyMode('stacked');
        expect(ceilL0.visible).toBe(true);
        expect(ceilL1.visible).toBe(true);
        expect(wallL0.visible).toBe(true);
    });

    it('repeated toggling stays consistent', () => {
        for (let i = 0; i < 4; i++) {
            applyMode('exploded');
            expect(ceilL0.visible).toBe(false);
            expect(ceilL1.visible).toBe(false);
            applyMode('stacked');
            expect(ceilL0.visible).toBe(true);
            expect(ceilL1.visible).toBe(true);
        }
    });

    it('solo mode does NOT hide the soloed level\'s ceiling (ceiling-hide is explode-only)', () => {
        applyMode('solo', 'L0');
        // Soloed level fully visible (ceiling included)…
        expect(ceilL0.visible).toBe(true);
        expect(wallL0.visible).toBe(true);
        // …other level fully hidden.
        expect(ceilL1.visible).toBe(false);
        expect(wallL1.visible).toBe(false);
    });

    it('deactivate restores every root\'s visibility', () => {
        applyMode('exploded');
        expect(ceilL0.visible).toBe(false);

        controller.deactivate();
        expect(ceilL0.visible).toBe(true);
        expect(ceilL1.visible).toBe(true);
        expect(wallL0.visible).toBe(true);
        expect(wallL1.visible).toBe(true);
    });
});
