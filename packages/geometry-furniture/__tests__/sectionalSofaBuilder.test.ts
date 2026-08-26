/**
 * §SOFA113 (founder, 2026-08-26) — the L-shaped sectional sofa.
 *
 * Pinned here:
 *   • both hands × every seat count (2/3/4) build without throwing;
 *   • the sofa's lowest point sits ON the floor (y = 0, never below) and the
 *     back panel tops out exactly at data.height;
 *   • deterministic — two builds are geometry-identical;
 *   • every material comes from the MaterialService cache (C100 §2.1 — the
 *     L-11384/L-11421 per-instance-material leak class), and the three
 *     material slots (fabric frame / fabric cushions / metal feet) resolve to
 *     THREE distinct cached instances;
 *   • the mesh budget: ONE mesh per material group, exactly 4 total
 *     (frame / seatCushions / backCushions / feet) — within the ≤8 ceiling;
 *   • HANDEDNESS: left and right builds have IDENTICAL overall bounding
 *     boxes while the chaise mass sits on mirrored sides — the chaise-zone
 *     X centroids reflect about W/2 (cxL ≈ W − cxR);
 *   • SEAT COUNT is parametric: at fixed width, more seats → narrower chaise
 *     module and more cushion geometry;
 *   • THE PARAMETRIC RULE: the seat plane and the foot height are MEMBERS —
 *     invariant under a footprint resize;
 *   • the triangle budget is pinned so the sectional can never quietly grow
 *     past its family's weight class.
 */
import * as THREE from '@pryzm/renderer-three/three';
import { describe, it, expect, beforeEach } from 'vitest';
import { MaterialService } from '../src/MaterialService';
import type { FurnitureData, FurnitureType } from '../src/FurnitureTypes';
import {
    SectionalSofaBuilder,
    sectionalSofaLayout,
} from '../src/builders/SectionalSofaBuilder';

const sofaData = (over: Partial<FurnitureData> = {}): FurnitureData => ({
    id: 'sect-1', type: 'furniture',
    furnitureType: 'sofa_sectional_right' as FurnitureType,
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, order: 'XYZ' },
    levelId: 'L0', levelName: 'L0', levelElevation: 0, baseOffset: 0,
    width: 2.72, length: 1.70, height: 0.78,
    material: 'fabric', properties: {},
    ...over,
} as FurnitureData);

const leftData = (over: Partial<FurnitureData> = {}): FurnitureData =>
    sofaData({ furnitureType: 'sofa_sectional_left' as FurnitureType, ...over });

const meshes = (g: THREE.Group): THREE.Mesh[] => {
    const out: THREE.Mesh[] = [];
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); });
    return out;
};

const meshByRole = (g: THREE.Group, role: string): THREE.Mesh => {
    const m = meshes(g).find((x) => x.userData['role'] === role);
    if (!m) throw new Error(`no mesh with role '${role}'`);
    return m;
};

/** Concatenated position data of every mesh — the determinism fingerprint. */
const fingerprint = (g: THREE.Group): number[] =>
    meshes(g).flatMap((m) => Array.from(m.geometry.getAttribute('position').array as Float32Array));

const triCount = (g: THREE.Group): number =>
    meshes(g).reduce((n, m) => n + m.geometry.getAttribute('position').count / 3, 0);

/**
 * X centroid of every vertex in the CHAISE zone (z > runD) across all meshes —
 * the mass that distinguishes left from right.
 */
const chaiseZoneCentroidX = (g: THREE.Group, runD: number): number => {
    let sum = 0, n = 0;
    for (const m of meshes(g)) {
        const pos = m.geometry.getAttribute('position');
        for (let i = 0; i < pos.count; i++) {
            if (pos.getZ(i) > runD + 0.02) { sum += pos.getX(i); n++; }
        }
    }
    if (n === 0) throw new Error('no chaise-zone vertices found');
    return sum / n;
};

const SEATS = [2, 3, 4] as const;

describe('§SOFA113 — sectional builds, sits on the floor, tops out at height', () => {
    let ms: MaterialService;
    beforeEach(() => { ms = new MaterialService(); });

    it.each(SEATS)('both hands build without throwing at seatCount=%i', (seats) => {
        const b = new SectionalSofaBuilder(ms);
        expect(() => b.build(sofaData({ properties: { seatCount: seats } }))).not.toThrow();
        expect(() => b.build(leftData({ properties: { seatCount: seats } }))).not.toThrow();
    });

    it('lowest point ON the floor, back panel tops at data.height', () => {
        const g = new SectionalSofaBuilder(ms).build(sofaData({ height: 0.78 }));
        const box = new THREE.Box3().setFromObject(g);
        expect(box.min.y).toBeGreaterThanOrEqual(-1e-6);
        expect(box.min.y).toBeLessThan(0.01);          // feet touch, nothing floats
        expect(box.max.y).toBeCloseTo(0.78, 3);        // the structural back panel
    });

    it('deterministic — two builds are geometry-identical', () => {
        const b = new SectionalSofaBuilder(ms);
        expect(fingerprint(b.build(sofaData()))).toEqual(fingerprint(b.build(sofaData())));
    });

    it('every material comes from the MaterialService cache; 3 distinct slots', () => {
        const g = new SectionalSofaBuilder(ms).build(sofaData());
        for (const m of meshes(g)) {
            expect(ms.isCachedMaterial(m.material as THREE.Material)).toBe(true);
        }
        const frame = meshByRole(g, 'frame').material;
        const seat  = meshByRole(g, 'seatCushions').material;
        const back  = meshByRole(g, 'backCushions').material;
        const feet  = meshByRole(g, 'feet').material;
        expect(seat).toBe(back);          // one cushion fabric slot
        expect(frame).not.toBe(seat);     // frame fabric ≠ cushion fabric
        expect(feet).not.toBe(frame);     // metal slot is its own material
        expect(feet).not.toBe(seat);
    });

    it('mesh budget: exactly 4 merged meshes — frame/seatCushions/backCushions/feet', () => {
        const g = new SectionalSofaBuilder(ms).build(sofaData());
        expect(meshes(g)).toHaveLength(4);
        expect(meshes(g).length).toBeLessThanOrEqual(8);   // the §SOFA113 ceiling
        for (const role of ['frame', 'seatCushions', 'backCushions', 'feet']) {
            const m = meshByRole(g, role);
            expect(m.userData['skipInPlan'], role).toBe(true);   // Contract 48 §3.4
            expect(m.userData['edgeAngleDeg'], role).toBe(30);   // Contract 48 §3.5
        }
        expect(g.userData['role']).toBe('sofa');
        expect(g.userData['variant']).toBe('sectional');
    });

    it('triangle budget pinned — the sectional stays in its family weight class', () => {
        const tris = triCount(new SectionalSofaBuilder(ms).build(sofaData()));
        expect(tris).toBeGreaterThan(1000);   // it is a real LOD 300 sofa…
        expect(tris).toBeLessThan(16000);     // …not a runaway subdivision
    });
});

describe('§SOFA113 — handedness: left/right are exact mirrors', () => {
    const ms = new MaterialService();

    it('left and right have IDENTICAL overall bounding footprints', () => {
        const r = new THREE.Box3().setFromObject(new SectionalSofaBuilder(ms).build(sofaData()));
        const l = new THREE.Box3().setFromObject(new SectionalSofaBuilder(ms).build(leftData()));
        for (const axis of ['x', 'y', 'z'] as const) {
            expect(l.min[axis]).toBeCloseTo(r.min[axis], 4);
            expect(l.max[axis]).toBeCloseTo(r.max[axis], 4);
        }
    });

    it('the chaise sits on MIRRORED sides: the chaise-zone footprint reflects about W/2', () => {
        const lay = sectionalSofaLayout(sofaData());
        const gR = new SectionalSofaBuilder(ms).build(sofaData());
        const gL = new SectionalSofaBuilder(ms).build(leftData());

        // Bounding footprint of the chaise zone (z > runD) — reflects EXACTLY.
        const zoneX = (g: THREE.Group): { min: number; max: number } => {
            let min = Infinity, max = -Infinity;
            for (const m of meshes(g)) {
                const pos = m.geometry.getAttribute('position');
                for (let i = 0; i < pos.count; i++) {
                    if (pos.getZ(i) > lay.runD + 0.02) {
                        min = Math.min(min, pos.getX(i));
                        max = Math.max(max, pos.getX(i));
                    }
                }
            }
            return { min, max };
        };
        const r = zoneX(gR);
        const l = zoneX(gL);
        expect(l.min).toBeCloseTo(lay.W - r.max, 6);       // exact bbox reflection
        expect(l.max).toBeCloseTo(lay.W - r.min, 6);

        // Centroid side check (2dp — non-indexed cap triangulation duplicates
        // vertices asymmetrically, so the centroid is sanity, not the proof).
        const cxR = chaiseZoneCentroidX(gR, lay.runD);
        const cxL = chaiseZoneCentroidX(gL, lay.runD);
        expect(cxR).toBeGreaterThan(lay.W / 2);            // right hand: chaise right
        expect(cxL).toBeLessThan(lay.W / 2);               // left hand: chaise left
        expect(cxL).toBeCloseTo(lay.W - cxR, 2);
    });

    it('sectionalSofaLayout: mx reflects for left, identity for right', () => {
        const r = sectionalSofaLayout(sofaData());
        const l = sectionalSofaLayout(leftData());
        expect(r.mx(0.5)).toBeCloseTo(0.5, 9);
        expect(l.mx(0.5)).toBeCloseTo(l.W - 0.5, 9);
        expect(l.hand).toBe('left');
        expect(r.hand).toBe('right');
    });
});

describe('§SOFA113 — seat count is parametric (2/3/4)', () => {
    const ms = new MaterialService();

    it('clamps out-of-range and non-numeric seatCount to the 2..4 window', () => {
        expect(sectionalSofaLayout(sofaData({ properties: { seatCount: 7 } })).seatCount).toBe(4);
        expect(sectionalSofaLayout(sofaData({ properties: { seatCount: 1 } })).seatCount).toBe(2);
        expect(sectionalSofaLayout(sofaData({ properties: { seatCount: 'x' } })).seatCount).toBe(3);
        expect(sectionalSofaLayout(sofaData()).seatCount).toBe(3);
    });

    it('at fixed width: more seats → narrower chaise footprint', () => {
        const extentAt = (seats: number): number => {
            const g = new SectionalSofaBuilder(ms).build(sofaData({ properties: { seatCount: seats } }));
            const lay = sectionalSofaLayout(sofaData({ properties: { seatCount: seats } }));
            let min = Infinity, max = -Infinity;
            for (const m of meshes(g)) {
                const pos = m.geometry.getAttribute('position');
                for (let i = 0; i < pos.count; i++) {
                    if (pos.getZ(i) > lay.runD + 0.02) {
                        min = Math.min(min, pos.getX(i));
                        max = Math.max(max, pos.getX(i));
                    }
                }
            }
            return max - min;
        };
        expect(extentAt(2)).toBeGreaterThan(extentAt(3));
        expect(extentAt(3)).toBeGreaterThan(extentAt(4));
    });

    it('more seats → more cushion geometry (both seat and back runs)', () => {
        const vertsAt = (seats: number, role: string): number => {
            const g = new SectionalSofaBuilder(ms).build(sofaData({ properties: { seatCount: seats } }));
            return meshByRole(g, role).geometry.getAttribute('position').count;
        };
        expect(vertsAt(4, 'seatCushions')).toBeGreaterThan(vertsAt(2, 'seatCushions'));
        expect(vertsAt(4, 'backCushions')).toBeGreaterThan(vertsAt(2, 'backCushions'));
    });
});

describe('§SOFA113 — resize scales the LAYOUT, never the MEMBERS', () => {
    const ms = new MaterialService();

    it('the seat plane depends only on members, not the footprint', () => {
        const seatTop = (w: number, l: number): number => {
            const g = new SectionalSofaBuilder(ms).build(sofaData({ width: w, length: l }));
            return new THREE.Box3().setFromObject(meshByRole(g, 'seatCushions')).max.y;
        };
        expect(seatTop(2.72, 1.70)).toBeCloseTo(seatTop(3.60, 2.20), 6);
    });

    it('the feet stay LOW metal feet at every size: 80 mm, floor-touching', () => {
        for (const w of [2.72, 3.60]) {
            const g = new SectionalSofaBuilder(ms).build(sofaData({ width: w }));
            const feet = new THREE.Box3().setFromObject(meshByRole(g, 'feet'));
            expect(feet.min.y).toBeCloseTo(0, 6);
            expect(feet.max.y).toBeCloseTo(0.08, 6);
        }
    });

    it('the overall footprint tracks the requested dimensions', () => {
        const g = new SectionalSofaBuilder(ms).build(sofaData({ width: 3.4, length: 2.0 }));
        const box = new THREE.Box3().setFromObject(g);
        expect(box.max.x - box.min.x).toBeCloseTo(3.4, 2);
        expect(box.max.z - box.min.z).toBeCloseTo(2.0, 2);
    });
});
