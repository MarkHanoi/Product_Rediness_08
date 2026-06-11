// §63.3 / §63.4 (2026-06-11) — bathroom fixture RECESS geometry tests.
//
// The founder's defects: the bath rendered as a SOLID BLOCK (no tub recess) and
// the vanity sink had only a faint flat circle (no basin bowl). These tests pin
// the fix: the BathBuilder now builds an OPEN tub well (rim frame + side walls +
// a floor BELOW the rim, with a hollow centre), and the VanityUnitBuilder builds
// a genuine recessed basin bowl (a bowl floor BELOW the counter top). We verify
// the cavity is real by:
//   (a) finding the LOWEST top-surface inside the footprint (the recessed floor)
//       and proving it sits well below the rim / counter top, and
//   (b) proving the centre of the fixture is OPEN at the rim plane (no solid mesh
//       spanning the whole top — i.e. it is a frame/well, not a closed block).

import * as THREE from '@pryzm/renderer-three/three';
import { describe, expect, it, beforeEach } from 'vitest';
import { BathBuilder } from '../src/builders/BathBuilder';
import { VanityUnitBuilder } from '../src/builders/BathroomVanityBuilder';
import { MaterialService } from '../src/MaterialService';
import type { FurnitureData } from '../src/FurnitureTypes';

const baseData = (over: Partial<FurnitureData>): FurnitureData => ({
    id: 't', type: 'furniture', furnitureType: 'bath',
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, order: 'XYZ' },
    levelId: 'L0', levelName: 'L0', levelElevation: 0, baseOffset: 0,
    width: 1.7, length: 0.7, height: 0.5,
    material: 'glass', properties: {},
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

describe('§63.3 — BathBuilder tub recess (open well, not a solid block)', () => {
    let svc: MaterialService;
    beforeEach(() => { svc = new MaterialService(); });

    it('builds a recessed inner well whose floor sits well below the top rim', () => {
        const group = new BathBuilder(svc).build(baseData({ width: 1.7, length: 0.7, height: 0.5 }));
        const boxes = meshBoxes(group);
        expect(boxes.length).toBeGreaterThan(2);   // shell + walls + rim + floor (not one box)

        const topY = Math.max(...boxes.map(b => b.max.y));     // rim top
        // The inner basin FLOOR: the mesh that spans the centre at the LOWEST top.
        // Identify meshes whose footprint covers the centre (|x|,|z| small) and take
        // the one with the lowest top surface — that is the well floor.
        const central = boxes.filter(b => b.min.x < 0.05 && b.max.x > -0.05 && b.min.z < 0.05 && b.max.z > -0.05);
        const wellTop = Math.min(...central.map(b => b.max.y));
        // The recess is genuine: the well floor top is clearly BELOW the rim top.
        expect(topY - wellTop).toBeGreaterThan(0.15);          // ≥150 mm recessed
    });

    it('the tub is HOLLOW at the rim plane (a frame of walls, not a closed lid)', () => {
        const group = new BathBuilder(svc).build(baseData({ width: 1.7, length: 0.7, height: 0.5 }));
        const boxes = meshBoxes(group);
        const topY = Math.max(...boxes.map(b => b.max.y));
        // A horizontal slice 10 mm below the rim must NOT be fully covered by any
        // single mesh at the centre (a solid block would have a box spanning the
        // whole top through this plane). The well centre is open.
        const planeY = topY - 0.01;
        const coversCentreAtPlane = boxes.some(b =>
            b.min.y <= planeY && b.max.y >= planeY &&
            b.min.x <= -0.3 && b.max.x >= 0.3 &&         // spans a wide x band
            b.min.z <= -0.1 && b.max.z >= 0.1);          // AND a wide z band → a lid
        expect(coversCentreAtPlane).toBe(false);
    });
});

describe('§63.4 — VanityUnitBuilder recessed basin bowl', () => {
    let svc: MaterialService;
    beforeEach(() => { svc = new MaterialService(); });

    it('the basin bowl floor is recessed below the counter top', () => {
        const data = baseData({ furnitureType: 'vanity_unit', width: 1.0, length: 0.5, height: 0.85 });
        const group = new VanityUnitBuilder(svc).build(data);
        const boxes = meshBoxes(group);
        // Counter top ≈ body height (0.85). The bowl floor sits ~90 mm below it.
        // Find the central meshes around the basin (|x|,|z| small) and take the
        // lowest top ABOVE the cabinet body (exclude the cabinet/drawers below).
        const COUNTER = 0.85;
        const central = boxes.filter(b =>
            b.min.x < 0.05 && b.max.x > -0.05 && b.min.z < 0.05 && b.max.z > -0.05 &&
            b.max.y > COUNTER - 0.15);                   // near/above the counter
        expect(central.length).toBeGreaterThan(1);       // rim + bowl wall + bowl floor
        const bowlFloorTop = Math.min(...central.map(b => b.max.y));
        // The bowl floor is clearly below the counter top → a real recess.
        expect(bowlFloorTop).toBeLessThan(COUNTER - 0.05);
        // And the rim sits at/above the counter top (a raised lip).
        const rimTop = Math.max(...central.map(b => b.max.y));
        expect(rimTop).toBeGreaterThanOrEqual(COUNTER);
    });
});
