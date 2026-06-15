// §SINK-BASIN-RECESS (founder, 2026-06-15) — standalone kitchen-sink recess test.
//
// The founder's defect: the standalone kitchen `sink` rendered as a SOLID BLOCK
// with a flat steel slab on top (no basin bowl). This mirrors the BathBuilder
// fix (an open well: a frame of side walls + a deck ring + a floor BELOW the rim,
// with a hollow centre). We verify the cavity is real, exactly as the bath test
// does, by:
//   (a) finding the LOWEST top-surface inside the footprint (the bowl floor) and
//       proving it sits well below the worktop rim, and
//   (b) proving the centre of the sink is OPEN at the rim plane (no single mesh
//       spanning the whole top — a frame/well, not a closed lid).

import * as THREE from '@pryzm/renderer-three/three';
import { describe, expect, it, beforeEach } from 'vitest';
import { SinkBuilder } from '../src/builders/ApplianceBuilders';
import { MaterialService } from '../src/MaterialService';
import type { FurnitureData } from '../src/FurnitureTypes';

const baseData = (over: Partial<FurnitureData>): FurnitureData => ({
    id: 's', type: 'furniture', furnitureType: 'sink',
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, order: 'XYZ' },
    levelId: 'L0', levelName: 'L0', levelElevation: 0, baseOffset: 0,
    width: 0.6, length: 0.6, height: 0.9,
    material: 'metal', properties: {},
    ...over,
});

/** Collect every mesh's local AABB in the group. */
function meshBoxes(group: THREE.Group): THREE.Box3[] {
    const boxes: THREE.Box3[] = [];
    group.updateMatrixWorld(true);
    group.traverse(o => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.computeBoundingBox();
        const b = m.geometry.boundingBox!.clone();
        b.applyMatrix4(m.matrixWorld);
        boxes.push(b);
    });
    return boxes;
}

describe('§SINK-BASIN-RECESS — SinkBuilder bowl recess (open well, not a solid block)', () => {
    let svc: MaterialService;
    beforeEach(() => { svc = new MaterialService(); });

    it('builds a recessed bowl whose floor sits well below the worktop rim', () => {
        const group = new SinkBuilder(svc).build(baseData({ width: 0.6, length: 0.6, height: 0.9 }));
        const boxes = meshBoxes(group);
        expect(boxes.length).toBeGreaterThan(3);   // cabinet + 4 walls + deck ring + floor + tap

        const topY = Math.max(...boxes.map(b => b.max.y));   // rim / tap top
        // The bowl FLOOR is the central mesh with the lowest top surface ABOVE the
        // cabinet body. The cabinet body top is at the worktop (~0.9); the bowl floor
        // sits ~0.18 m below it. Restrict to meshes near/above the worktop so the
        // cabinet box (top at 0.9) doesn't masquerade as the floor.
        const WORKTOP = 0.9;
        const central = boxes.filter(b =>
            b.min.x < 0.05 && b.max.x > -0.05 && b.min.z < 0.05 && b.max.z > -0.05 &&
            b.max.y > WORKTOP - 0.25 && b.max.y <= WORKTOP + 0.02);
        const bowlFloorTop = Math.min(...central.map(b => b.max.y));
        // The recess is genuine: the bowl floor top is clearly below the worktop.
        expect(WORKTOP - bowlFloorTop).toBeGreaterThan(0.15);   // ≥150 mm recessed
    });

    it('the bowl opening is OPEN at the worktop (no solid lid capping the basin)', () => {
        const group = new SinkBuilder(svc).build(baseData({ width: 0.6, length: 0.6, height: 0.9 }));
        const boxes = meshBoxes(group);
        // The OLD solid sink had a thin steel slab whose TOP sat at the worktop and
        // spanned the whole basin footprint — a flat lid over the centre. A real well
        // has no such mesh: the only thing reaching the worktop is the deck RING
        // (which leaves the centre clear) plus the cabinet carcass BELOW it. We assert
        // no thin mesh whose top is at/near the worktop spans the central bowl opening.
        const WORKTOP = 0.9;
        const hasLidOverBowl = boxes.some(b => {
            const top = b.max.y;
            const thickness = b.max.y - b.min.y;
            // A "lid": a thin (≤ 8 cm) horizontal mesh sitting at the worktop top that
            // covers the centre in BOTH axes (the old flat basin slab did exactly this).
            return top >= WORKTOP - 0.06 && top <= WORKTOP + 0.02 &&
                   thickness <= 0.08 &&
                   b.min.x <= -0.12 && b.max.x >= 0.12 &&
                   b.min.z <= -0.12 && b.max.z >= 0.12;
        });
        expect(hasLidOverBowl).toBe(false);
    });
});
