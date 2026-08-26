// @vitest-environment happy-dom
//
// §EDGE131 (L-12100) — the floor-finish edge overlay, proven AT THE AUTHORITY.
//
// The sibling suite (`packages/geometry-slab/__tests__/floorFinishEdgeGate.test.ts`)
// proves the builder now stamps and hides correctly. That is necessary and NOT
// sufficient: a builder flag proves nothing about the view gate that is supposed to
// govern it, and the whole defect was a builder and a gate that never met. This
// suite therefore drives the REAL `WallEdgeVisibilityService` over a REAL scene
// containing a REAL `FloorPanelBuilder` product, through the exact two-call sequence
// `initScene.ts:808-813` runs on `view-activated`:
//
//     wallEdgeVisibilityService.setVisible(isPlanMode);
//     wallEdgeVisibilityService.applyRenderMode(isPlanMode ? 'plan' : '3d');
//
// Both halves of the founder's requirement are asserted against that sequence:
// 3-D hides the lines, and PLAN still draws them — a fix that silenced plan would
// be a regression, not a fix.
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { FloorPanelBuilder, SLAB_EDGE_MODE_SETTINGS } from '@pryzm/geometry-slab';
import { buildWallEdgeOverlay } from '@pryzm/geometry-wall';
import type { FloorData } from '@pryzm/core-app-model/stores';
import { WallEdgeVisibilityService } from '../src/ui/WallEdgeVisibilityService';

const stubBim = { getLevelById: (_id: string) => ({ elevation: 0 }) } as never;

function makeFloor(id: string, levelId: string): FloorData {
    return {
        id,
        levelId,
        boundary: {
            polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }],
            baseOffset: 0,
            thickness: 0.05,
        },
        serviceHoles: [],
        finishSpec: { finishColor: '#D4C4A8', finishPattern: 'none', exposedScreed: false },
        visible: true,
    } as unknown as FloorData;
}

/** A structural slab overlay, stamped exactly as SlabFragmentBuilder.ts:926 does. */
function controlSlabEdge(): THREE.LineSegments {
    const s = SLAB_EDGE_MODE_SETTINGS['3d'];
    const line = new THREE.LineSegments(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: s.color, depthTest: s.depthTest, depthWrite: s.depthWrite }),
    );
    line.renderOrder = s.renderOrder;
    line.visible = false;
    line.userData = { id: 'SB-1', parentId: 'SB-1', elementType: 'SlabEdges', role: 'edges', selectable: false };
    return line;
}

/**
 * A DECOY: an untagged black line on EDITOR_LAYER — the shape
 * `lineworkProbe.attributeProducer` attributes to OBC TechnicalDrawing projection
 * output. The gate must not seize it; widening the matcher to "anything that looks
 * like a line" would have silently taken over another subsystem's linework.
 */
function decoyProjectionLine(): THREE.LineSegments {
    const line = new THREE.LineSegments(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: 0x000000 }),
    );
    line.visible = true;
    line.userData = {};
    return line;
}

/** Every floor-finish perimeter overlay in the scene, however many storeys. */
function floorEdges(scene: THREE.Scene): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    scene.traverse(o => { if (o.userData?.elementType === 'FloorEdges') out.push(o); });
    return out;
}

describe('§EDGE131 — the view gate now REACHES the floor finish', () => {
    let scene: THREE.Scene;
    let builder: FloorPanelBuilder;
    let service: WallEdgeVisibilityService;
    let slab: THREE.LineSegments;
    let wall: THREE.Object3D;
    let decoy: THREE.LineSegments;

    /** The founder's screenshot: one floor finish per storey, five storeys. */
    const STOREYS = ['L0', 'L1', 'L2', 'L3', 'L4'];

    beforeEach(() => {
        scene = new THREE.Scene();
        builder = new FloorPanelBuilder(scene, stubBim);
        for (const lvl of STOREYS) builder.buildFloor(makeFloor(`fl-${lvl}`, lvl));

        slab = controlSlabEdge();
        wall = buildWallEdgeOverlay(new THREE.BoxGeometry(1, 1, 1), 'W-1');
        decoy = decoyProjectionLine();
        scene.add(slab, wall, decoy);

        service = new WallEdgeVisibilityService(scene);
    });

    /** Exactly what initScene.ts:808-813 runs on 'view-activated'. */
    function activateView(mode: string): void {
        const isPlanMode = mode === 'Top' || mode === 'Ground Floor';
        service.setVisible(isPlanMode);
        service.applyRenderMode(isPlanMode ? 'plan' : '3d');
    }

    it('the scene really does hold one floor-finish overlay per storey', () => {
        // Guard against a vacuous pass: if the builder stopped emitting overlays,
        // every "nothing is visible" assertion below would pass for the wrong reason.
        expect(floorEdges(scene)).toHaveLength(STOREYS.length);
    });

    it('entering the 3-D view hides EVERY storey — the founder’s repeat is gone', () => {
        activateView('3D');
        expect(floorEdges(scene).filter(o => o.visible)).toHaveLength(0);
        // The families that already worked must still work — uniformity, not a patch.
        expect(slab.visible).toBe(false);
        expect(wall.visible).toBe(false);
    });

    it('no BLACK, always-on-top line survives in 3-D — that pair IS the plan setting', () => {
        activateView('Top');   // pick up plan styling first...
        activateView('3D');    // ...then prove the 3-D switch takes it back off.

        for (const e of floorEdges(scene)) {
            const mat = (e as THREE.LineSegments).material as THREE.LineBasicMaterial;
            expect(mat.color.getHex()).toBe(SLAB_EDGE_MODE_SETTINGS['3d'].color);
            expect(mat.depthTest).toBe(true);
            expect(e.renderOrder).toBe(SLAB_EDGE_MODE_SETTINGS['3d'].renderOrder);
            expect(e.visible).toBe(false);
        }
    });

    it('PLAN still draws the floor linework, black and on top', () => {
        activateView('Top');

        const edges = floorEdges(scene);
        expect(edges).toHaveLength(STOREYS.length);
        for (const e of edges) {
            expect(e.visible).toBe(true);
            const mat = (e as THREE.LineSegments).material as THREE.LineBasicMaterial;
            expect(mat.color.getHex()).toBe(0x000000);
            expect(mat.depthTest).toBe(false);
            expect(e.renderOrder).toBe(999);
        }
        expect(slab.visible).toBe(true);
        expect(wall.visible).toBe(true);
    });

    it("the 'Ground Floor' plan mode counts as plan too", () => {
        activateView('Ground Floor');
        expect(floorEdges(scene).every(e => e.visible)).toBe(true);
    });

    it('3-D → plan → 3-D round-trips; the gate is not one-way', () => {
        activateView('3D');
        expect(floorEdges(scene).some(e => e.visible)).toBe(false);
        activateView('Top');
        expect(floorEdges(scene).every(e => e.visible)).toBe(true);
        activateView('3D');
        expect(floorEdges(scene).some(e => e.visible)).toBe(false);
    });

    it('a floor built WHILE in the 3-D view is hidden by the rebuild re-apply', async () => {
        activateView('3D');
        builder.buildFloor(makeFloor('fl-late', 'L5'));

        const late = floorEdges(scene).filter(o => o.userData.floorId === 'fl-late');
        expect(late).toHaveLength(1);

        window.dispatchEvent(new Event('bim-floor-added'));
        await new Promise(r => setTimeout(r, 0));   // the re-apply is a microtask

        expect(late[0]!.visible).toBe(false);
        expect(floorEdges(scene).filter(o => o.visible)).toHaveLength(0);
    });

    it('the gate never seizes untagged projection linework', () => {
        activateView('3D');
        expect(decoy.visible).toBe(true);
        activateView('Top');
        expect(decoy.visible).toBe(true);
        // ...and its material is untouched by the plan restyle.
        expect((decoy.material as THREE.LineBasicMaterial).depthTest).toBe(true);
    });
});
