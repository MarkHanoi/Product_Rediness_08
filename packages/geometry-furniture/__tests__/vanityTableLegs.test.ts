// §VANITY-LEGS (founder, 2026-06-15) — VanityTableBuilder leg + extent guard.
//
// The founder's defects on the vanity_table (FU041, 0.9 × 0.45 × 0.75 m):
//   (1) "legs not well defined" — the pre-fix builder made only TWO legs, both
//       on the depth centre-line (z = 0), so it read as two posts down the
//       middle rather than four proper corner legs.
//   (2) "going through the wall" — anything protruding behind the footprint
//       back edge (−L/2) penetrates the wall once the auto-furnish solver
//       recesses the FOOTPRINT back to GAP off the wall.
//
// This suite pins the fix:
//   (a) the vanity has FOUR distinct corner legs (one in each XZ quadrant), and
//   (b) NO mesh extends behind the footprint back face (−L/2) — the rear-most
//       point of the whole group is the integrated mirror, flush at −L/2.

import * as THREE from '@pryzm/renderer-three/three';
import { describe, expect, it, beforeEach } from 'vitest';
import { VanityTableBuilder } from '../src/builders/BedroomDressingBuilder';
import { MaterialService } from '../src/MaterialService';
import type { FurnitureData } from '../src/FurnitureTypes';

const W = 0.9, L = 0.45, H = 0.75;

const vanityData = (over: Partial<FurnitureData> = {}): FurnitureData => ({
    id: 't', type: 'furniture', furnitureType: 'vanity_table',
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, order: 'XYZ' },
    levelId: 'L0', levelName: 'L0', levelElevation: 0, baseOffset: 0,
    width: W, length: L, height: H,
    material: 'wood', properties: {},
    ...over,
});

/** Collect every mesh's world-space AABB in the group. */
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

describe('§VANITY-LEGS — VanityTableBuilder geometry', () => {
    let svc: MaterialService;
    beforeEach(() => { svc = new MaterialService(); });

    it('builds FOUR corner legs — one in each XZ quadrant under the top', () => {
        const group = new VanityTableBuilder(svc).build(vanityData());
        const boxes = meshBoxes(group);

        // A "leg" is a slim, floor-rooted vertical member: small XZ footprint,
        // bottom near the floor, top below the table underside. This isolates the
        // legs from the top slab, drawer, pull and the (tall, thin, rear) mirror.
        const legs = boxes.filter(b => {
            const dx = b.max.x - b.min.x;
            const dz = b.max.z - b.min.z;
            const dy = b.max.y - b.min.y;
            return dx < 0.10 && dz < 0.10 && b.min.y < 0.05 && dy > 0.3;
        });
        expect(legs.length, 'vanity must have exactly four corner legs').toBe(4);

        // One leg centre in each of the four XZ quadrants (not all on z = 0).
        const quadrant = (b: THREE.Box3): string => {
            const cx = (b.min.x + b.max.x) / 2;
            const cz = (b.min.z + b.max.z) / 2;
            return `${cx >= 0 ? '+' : '-'}${cz >= 0 ? '+' : '-'}`;
        };
        const quads = new Set(legs.map(quadrant));
        expect(quads.size, 'the four legs occupy four distinct corners').toBe(4);
    });

    it('NO mesh protrudes behind the footprint back face (−L/2) — nothing to push through the wall', () => {
        const group = new VanityTableBuilder(svc).build(vanityData());
        const boxes = meshBoxes(group);
        const rearMost = Math.min(...boxes.map(b => b.min.z));
        // The back face of the footprint is at −L/2. The rear-most mesh (the
        // integrated mirror) must be flush with — never behind — that plane.
        expect(rearMost, `rear-most mesh z=${rearMost.toFixed(3)} is behind −L/2=${(-L / 2).toFixed(3)}`)
            .toBeGreaterThanOrEqual(-L / 2 - 1e-6);
    });
});
