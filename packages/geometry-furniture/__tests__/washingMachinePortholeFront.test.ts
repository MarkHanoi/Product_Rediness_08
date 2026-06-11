// §62 (2026-06-11) — appliance round-door orientation test.
//
// The founder's defect: a kitchen-mounted washing machine's round porthole
// "door" ring (the chrome bezel + Bosch-style concentric grooves) was built
// from TorusGeometry that had `rotation.x = Math.PI / 2` applied. A default
// THREE.TorusGeometry already lies in the XY plane with its axis (normal) along
// +Z — i.e. it faces the user on the unit's FRONT face. Rotating it by π/2
// about X lays the ring FLAT onto the horizontal (XZ) plane (normal = +Y, up),
// so the "door circle" sat flat like a hotplate instead of facing forward.
//
// This pins the fix: every torus ring in the washing-machine unit must remain
// VERTICAL and FRONT-FACING. We discriminate by world-space AABB:
//   - A correct front-facing ring spans ~2·radius in X and Y, and is THIN in Z.
//   - A wrongly-flattened ring spans ~2·radius in X and Z, and is THIN in Y.
// So for each torus we assert  Z-extent ≪ Y-extent  (the ring is a tall, thin
// vertical disc, not a wide flat horizontal one).

import * as THREE from '@pryzm/renderer-three/three';
import { describe, expect, it } from 'vitest';
import { KitchenCabinetEngine } from '../src/engines/KitchenCabinetEngine';
import type { KitchenCabinetConfig } from '../src/KitchenTypes';

/** Build a single-unit straight kitchen whose only unit is a washing machine. */
function buildWashingMachineKitchen(): THREE.Group {
    const config: KitchenCabinetConfig = {
        layoutType: 'kitchen_straight',
        depth: 0.60,
        length: 0.60,
        height: 0.90,
        numUnits: 1,
        units: [
            { index: 0, arm: 'main', front: 'none', appliance: 'washing_machine_white' },
        ],
    };
    const group = new KitchenCabinetEngine().create(config);
    group.updateMatrixWorld(true);
    return group;
}

/** World-space AABBs of every TorusGeometry mesh in the group. */
function torusBoxes(group: THREE.Group): THREE.Box3[] {
    const boxes: THREE.Box3[] = [];
    group.traverse(o => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        if ((m.geometry as THREE.BufferGeometry)?.type !== 'TorusGeometry') return;
        m.geometry.computeBoundingBox();
        const b = m.geometry.boundingBox!.clone();
        b.applyMatrix4(m.matrixWorld);
        boxes.push(b);
    });
    return boxes;
}

describe('§62 — washing-machine porthole ring is vertical & front-facing', () => {
    it('renders at least one torus ring (the porthole bezel)', () => {
        const tori = torusBoxes(buildWashingMachineKitchen());
        expect(tori.length).toBeGreaterThan(0);
    });

    it('every porthole ring lies in the VERTICAL front plane (thin in Z, tall in Y), not flat on the floor', () => {
        const tori = torusBoxes(buildWashingMachineKitchen());
        for (const b of tori) {
            const size = new THREE.Vector3();
            b.getSize(size);
            // A front-facing ring is a thin vertical disc: its Z (depth/front)
            // extent must be far smaller than its Y (height) extent. A flat,
            // floor-lying ring would instead be thin in Y and large in Z.
            expect(size.z).toBeLessThan(size.y * 0.5);
            // And it must genuinely have vertical height (it is a real disc,
            // not a degenerate sliver).
            expect(size.y).toBeGreaterThan(0.05);
        }
    });
});
