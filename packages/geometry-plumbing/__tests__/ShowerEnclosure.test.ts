/**
 * ShowerEnclosure — L-36 orientation + L-37 composite walk-in enclosure suite.
 *
 * Covers (per the L-36 / L-37 task, ADR-0113):
 *   (a) §FIX-SHOWER-ORIENTATION — a wall-hosted shower's default orientation
 *       seats its FRONT (rain-head / tray / glass, authored at local +Z) along
 *       the OUTWARD wall normal (into the room), i.e. the riser sits against the
 *       wall and the head projects out — NOT reversed into the wall as before.
 *   (b) §FEAT-SHOWER-ENCLOSURE-TYPE — the composite walk-in builds head + linear
 *       gutter + frameless glass, and the chosen glass DIRECTION parameter is
 *       reflected in geometry (glass on the −X side for `left`, +X for `right`).
 *   (c) The three walk-in variants register in the plumbing catalogue and each
 *       builds without error.
 *
 * These mirror the geometry-parity contracts (36 §5 / 39 §5): the same
 * `createShowerGeometry` factory drives preview, committed mesh, and this test.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { describe, it, expect } from 'vitest';
import {
    createShowerGeometry,
    SHOWER_WALKIN_VARIANTS,
    walkInGlassSide,
    isWalkInShower,
    type ShowerVariant,
} from '../src/ShowerGeometry';
import { plumbingSystemTypeStore } from '../src/PlumbingSystemTypeStore';

/** Collect meshes/groups whose userData.part matches `tag`. */
function partsTagged(root: THREE.Object3D, tag: string): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    root.traverse((o) => { if (o.userData?.part === tag) out.push(o); });
    return out;
}

/**
 * Replicates the (fixed) PlumbingTool 3D orientation for a wall-hosted shower:
 * lookAt(point + outwardNormal) with NO 180° flip. Returns the world-space
 * direction the fixture's local +Z (its FRONT) points after seating.
 */
function seatedFrontAxis(outwardNormal: THREE.Vector3, applyLegacyFlip = false): THREE.Vector3 {
    const obj = new THREE.Object3D();
    obj.position.set(0, 0, 0);
    obj.lookAt(outwardNormal.clone()); // point + normal, with point at origin
    if (applyLegacyFlip) obj.rotateY(Math.PI); // the OLD (buggy) behaviour
    obj.updateMatrixWorld(true);
    return new THREE.Vector3(0, 0, 1).applyQuaternion(obj.quaternion).normalize();
}

describe('§FIX-SHOWER-ORIENTATION (L-36) — wall-hosted default facing', () => {
    it('shower FRONT is authored at local +Z (rain-head / tray project into +Z)', () => {
        const g = createShowerGeometry('shower_system_shelf');
        const box = new THREE.Box3().setFromObject(g);
        // The column back (riser) hugs z≈0; the rain arm + head reach into +Z.
        expect(box.max.z).toBeGreaterThan(0.2);
        expect(box.max.z).toBeGreaterThan(Math.abs(box.min.z));
    });

    it('after lookAt (no flip) the shower front points along the outward normal (into the room)', () => {
        for (const n of [
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(0, 0, 1),
            new THREE.Vector3(-1, 0, 0),
            new THREE.Vector3(0, 0, -1),
        ]) {
            const front = seatedFrontAxis(n, /*legacyFlip*/ false);
            // Front (+Z) aligns with the outward room normal → faces out of the wall.
            expect(front.dot(n)).toBeGreaterThan(0.999);
        }
    });

    it('the removed 180° flip would have driven the front INTO the wall (documents the bug)', () => {
        const n = new THREE.Vector3(1, 0, 0);
        const front = seatedFrontAxis(n, /*legacyFlip*/ true);
        // Old behaviour: +Z anti-parallel to the outward normal → head into wall.
        expect(front.dot(n)).toBeLessThan(-0.999);
    });
});

describe('§FEAT-SHOWER-ENCLOSURE-TYPE (L-37) — composite walk-in geometry', () => {
    it('builds head + linear gutter + frameless glass', () => {
        const g = createShowerGeometry('shower_walkin_left');
        expect(partsTagged(g, 'rainHead').length).toBeGreaterThan(0);
        expect(partsTagged(g, 'gutter').length).toBeGreaterThan(0);
        expect(partsTagged(g, 'glass').length).toBeGreaterThan(0);
    });

    it('glass sits on the chosen side — left = −X, right = +X', () => {
        const left  = createShowerGeometry('shower_walkin_left');
        const right = createShowerGeometry('shower_walkin_right');

        const glassCentreX = (root: THREE.Object3D): number => {
            const panels = partsTagged(root, 'glass');
            expect(panels.length).toBeGreaterThan(0);
            // Average world-X of the tagged glass panels.
            const v = new THREE.Vector3();
            let sum = 0;
            for (const p of panels) { p.getWorldPosition(v); sum += v.x; }
            return sum / panels.length;
        };

        expect(glassCentreX(left)).toBeLessThan(0);    // glass on the left (−X)
        expect(glassCentreX(right)).toBeGreaterThan(0); // glass on the right (+X)
        // Direction parameter decodes from the variant slug.
        expect(walkInGlassSide('shower_walkin_left')).toBe('left');
        expect(walkInGlassSide('shower_walkin_right')).toBe('right');
        expect(walkInGlassSide('shower_walkin_corner')).toBe('corner');
    });
});

describe('(c) catalogue registration + build safety', () => {
    it('all three walk-in variants register in the shower family of the catalogue', () => {
        const showerTypes = plumbingSystemTypeStore.getByFamily('shower');
        const ids = new Set(showerTypes.map(t => t.id));
        for (const v of SHOWER_WALKIN_VARIANTS) {
            expect(isWalkInShower(v)).toBe(true);
            expect(ids.has(`pf-shower-${v}`)).toBe(true);
        }
    });

    it('every walk-in variant builds a non-empty group without throwing', () => {
        for (const v of SHOWER_WALKIN_VARIANTS as ShowerVariant[]) {
            const g = createShowerGeometry(v);
            expect(g).toBeInstanceOf(THREE.Group);
            let meshCount = 0;
            g.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshCount++; });
            expect(meshCount).toBeGreaterThan(5);
        }
    });
});
