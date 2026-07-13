/**
 * §FIX-DOOR-PLAN-SYMBOL-PURITY (L-266) — IN PLAN, THE DOOR IS ITS SYMBOL.
 *
 * THE SECOND PRODUCER OF THE FOUNDER'S "IMAGINARY LINES", AND THE HARDER ONE TO SEE.
 * ─────────────────────────────────────────────────────────────────────────────────
 * `DoorPlanSymbolBuilder` injects a clean 2D symbol. The plan projector then ALSO
 * edge-dumps the door's real 3D meshes onto A-DOOR — its own comment says the symbol
 * appears *"alongside projected door edges"*. And the 3D door's frame carries a HEAD BAR:
 *
 *     addBox(group, frameMat, w, ft, fd, 0, h / 2 - ft / 2, 0);   // full opening WIDTH
 *
 * `classifyByVertexY` sends every edge more than CUT_LINE_EPSILON above the cut plane to
 * the PROJECTION layer — it does not drop it. So the head bar (at ~2 m, over a 1.2 m cut
 * plane), the hinges, the threshold plate, the double-door centre mullion and every
 * glazing pane drew their outlines STRAIGHT ACROSS THE DOOR VOID, over the symbol.
 *
 * The fix is the convention Contract 48 §5 already established for every furniture family
 * (sofa / bed / chair / tree): AN ELEMENT WITH A PLAN SYMBOL DOES NOT ALSO EMIT ITS MESH
 * EDGES IN PLAN — it tags `userData.skipInPlan`, and the projector honours that tag
 * generically. The door had three ad-hoc ROLE-based skips instead (doorLeaf, doorHandle,
 * legacyDoorFrame): a per-part allowlist, which silently admits every part nobody thought
 * of — and the head bar was exactly such a part.
 *
 * WHAT THIS GUARDS
 *   C-1  EVERY door mesh carries `skipInPlan` (not a hand-maintained list of roles)
 *   C-2  the head bar — the actual offender — is one of them, and it really does span
 *        the full opening width (so the regression is stated in geometry, not in prose)
 *   C-3  the ONE record-driven exception survives: `leafVisibleInPlan` still shows the
 *        real 3D leaf when the user asks for it
 *   C-4  THE TAG REACHES THE VIEW. A tag nobody reads is the L-05 disease (geometry
 *        computed and thrown away), so we assert the projector's generic gate exists.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from '@pryzm/renderer-three/three';
import { DoorBuilder } from '../src/DoorBuilder';

const WALL = {
    id: 'w1', levelId: 'L0', thickness: 0.2, height: 3,
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
};
const wallStoreStub = {
    getById: (id: string) => (id === 'w1' ? WALL : undefined),
    getLevelById: () => ({ id: 'L0', elevation: 0 }),
} as never;

const DOOR = {
    id: 'd1', wallId: 'w1', openingId: 'o1',
    width: 0.9, height: 2.1, offset: 1.0, sillHeight: 0,
    doorType: 'single', hingesSide: 'left', swingDirection: 'inward',
    frameColor: '#8b5a2b', leafColor: '#c8a165', handle: true,
    threshold: true, thresholdHeight: 0.02, handleHeight: 1.05,
    leafVisibleInPlan: false,
};

function buildDoor(door: Record<string, unknown>): THREE.Mesh[] {
    const scene = new THREE.Scene();
    const builder = new DoorBuilder(scene, wallStoreStub);
    (builder as unknown as { rebuild(d: unknown): void }).rebuild(door);
    const meshes: THREE.Mesh[] = [];
    scene.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    return meshes;
}

describe('L-266 — the 3D door does not draw itself into the plan', () => {
    let meshes: THREE.Mesh[];
    beforeEach(() => { meshes = buildDoor(DOOR); });

    it('builds a real door (frame posts, head bar, leaf, hinges, handle)', () => {
        expect(meshes.length).toBeGreaterThan(5);
    });

    it('C-1 — EVERY door mesh is tagged skipInPlan', () => {
        for (const m of meshes) {
            expect(m.userData.skipInPlan, `mesh role=${m.userData.role ?? '<frame>'}`).toBe(true);
        }
    });

    it('C-2 — the HEAD BAR really does span the whole opening: this is the line he saw', () => {
        // Find the mesh whose along-wall extent covers the full void [offset, offset+width].
        // In the door's local frame the wall runs along X and the group is centred on the
        // opening, so the head bar spans x ∈ [-w/2, +w/2] and sits near the top (y > 0).
        const spanning = meshes.filter(m => {
            m.geometry.computeBoundingBox();
            const bb = m.geometry.boundingBox!;
            const spansWidth = (bb.max.x - bb.min.x) >= DOOR.width as number - 1e-6;
            const isHigh = m.position.y > 0;
            return spansWidth && isHigh;
        });
        expect(spanning.length).toBeGreaterThan(0);      // the head bar exists…
        for (const m of spanning) expect(m.userData.skipInPlan).toBe(true);   // …and is silenced
    });

    it('C-3 — leafVisibleInPlan is still honoured: the record decides, not the builder', () => {
        const leaves = buildDoor({ ...DOOR, leafVisibleInPlan: true })
            .filter(m => m.userData.role === 'doorLeaf');
        expect(leaves.length).toBeGreaterThan(0);
        for (const m of leaves) expect(m.userData.skipInPlan).toBe(false);
    });
});

describe('L-266 — the tag REACHES the view (verify at the outcome, not at the seam)', () => {
    it('C-4 — EdgeProjectorService still honours the generic skipInPlan gate', () => {
        // If this gate is ever removed, the head bar comes straight back and the symbol is
        // polluted again — with nothing else failing. So the coupling is stated here.
        const eps = readFileSync(
            resolve(__dirname, '../../../apps/editor/src/engine/views/EdgeProjectorService.ts'),
            'utf8',
        );
        expect(eps).toMatch(/isPlanView\s*&&\s*mesh\.userData\.skipInPlan\s*===\s*true/);
    });
});
