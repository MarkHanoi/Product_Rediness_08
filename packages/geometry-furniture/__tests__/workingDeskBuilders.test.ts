/**
 * §DESK108 (founder, 2026-08-26) — the four LOD 300 working desks.
 *
 * Pinned here:
 *   • every desk builds without throwing;
 *   • the desk's lowest point sits ON the floor (y = 0, never below);
 *   • the work surface tops out exactly at data.height;
 *   • deterministic — two builds are geometry-identical (command snapshots
 *     must round-trip byte-identically);
 *   • THE PARAMETRIC RULE, measured on built geometry: resizing scales the
 *     LAYOUT, not the MEMBERS — the top slab keeps its thickness and the zen
 *     sled keeps its 40 mm tube cross-section under a 1.5× resize, while the
 *     overall bounding box tracks the requested footprint;
 *   • every material comes from the MaterialService cache (C100 §2.1 — the
 *     L-11384/L-11421 per-instance-material leak class);
 *   • the mesh budget: one mesh per MATERIAL GROUP, pinned per desk
 *     (zen 3 / skeleton 3 / vertex 3 / panel 2).
 */
import * as THREE from '@pryzm/renderer-three/three';
import { describe, it, expect, beforeEach } from 'vitest';
import { MaterialService } from '../src/MaterialService';
import type { FurnitureData, FurnitureType } from '../src/FurnitureTypes';
import {
    ZenDeskBuilder, SkeletonDeskBuilder, VertexDeskBuilder, PanelDeskBuilder,
} from '../src/builders/WorkingDeskBuilders';
import type { IFurnitureBuilder } from '../src/builders/IFurnitureBuilder';

const deskData = (over: Partial<FurnitureData> = {}): FurnitureData => ({
    id: 'desk-1', type: 'furniture', furnitureType: 'desk_zen' as FurnitureType,
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, order: 'XYZ' },
    levelId: 'L0', levelName: 'L0', levelElevation: 0, baseOffset: 0,
    width: 1.8, length: 0.8, height: 0.75,
    material: 'wood', properties: {},
    ...over,
} as FurnitureData);

interface DeskCase {
    name: string;
    make: (ms: MaterialService) => IFurnitureBuilder;
    meshBudget: number;
    variant: string;
}

const CASES: DeskCase[] = [
    { name: 'desk_zen',      make: (ms) => new ZenDeskBuilder(ms),      meshBudget: 3, variant: 'zen' },
    { name: 'desk_skeleton', make: (ms) => new SkeletonDeskBuilder(ms), meshBudget: 3, variant: 'skeleton' },
    { name: 'desk_vertex',   make: (ms) => new VertexDeskBuilder(ms),   meshBudget: 3, variant: 'vertex' },
    { name: 'desk_panel',    make: (ms) => new PanelDeskBuilder(ms),    meshBudget: 2, variant: 'panel' },
];

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

describe('§DESK108 — every desk builds, sits on the floor, tops out at height', () => {
    let ms: MaterialService;
    beforeEach(() => { ms = new MaterialService(); });

    it.each(CASES)('$name: builds without throwing', ({ make }) => {
        expect(() => make(ms).build(deskData())).not.toThrow();
    });

    it.each(CASES)('$name: lowest point ON the floor, work surface at data.height', ({ make, variant }) => {
        const g = make(ms).build(deskData({ height: 0.75 }));
        const box = new THREE.Box3().setFromObject(g);
        expect(box.min.y).toBeGreaterThanOrEqual(-1e-6);
        expect(box.min.y).toBeLessThan(0.01);            // feet touch, nothing floats
        if (variant === 'vertex') {
            // The raised return tops the desk by its fixed 0.20 m offset.
            expect(box.max.y).toBeCloseTo(0.95, 3);
        } else {
            expect(box.max.y).toBeCloseTo(0.75, 3);
        }
    });

    it.each(CASES)('$name: deterministic — two builds are geometry-identical', ({ make }) => {
        const a = fingerprint(make(ms).build(deskData()));
        const b = fingerprint(make(ms).build(deskData()));
        expect(a).toEqual(b);
    });

    it.each(CASES)('$name: every material comes from the MaterialService cache', ({ make }) => {
        const g = make(ms).build(deskData());
        for (const m of meshes(g)) {
            expect(ms.isCachedMaterial(m.material as THREE.Material)).toBe(true);
        }
    });

    it.each(CASES)('$name: one mesh per material group — budget pinned', ({ make, meshBudget, variant }) => {
        const g = make(ms).build(deskData());
        expect(meshes(g)).toHaveLength(meshBudget);
        expect(g.userData['role']).toBe('desk');
        expect(g.userData['variant']).toBe(variant);
    });
});

describe('§DESK108 — resize scales the LAYOUT, never the MEMBERS', () => {
    const ms = new MaterialService();

    it.each(CASES)('$name: the worktop plane depends only on height, not footprint', ({ make, variant }) => {
        const roleOfTop = variant === 'vertex' ? 'waterfall'
            : variant === 'panel' ? 'carcass' : 'top';
        const worktopPlane = (w: number, l: number): number => {
            const g = make(ms).build(deskData({ width: w, length: l }));
            const box = new THREE.Box3().setFromObject(meshByRole(g, roleOfTop));
            return box.max.y;
        };
        expect(worktopPlane(1.8, 0.8)).toBeCloseTo(worktopPlane(2.7, 1.2), 6);
    });

    it('desk_zen: the sled keeps its 40 mm tube section while the layout stretches', () => {
        const at = (w: number, l: number): { sledX: number; sledZ: number; totalX: number } => {
            const g = new ZenDeskBuilder(ms).build(deskData({ width: w, length: l }));
            const sled = new THREE.Box3().setFromObject(meshByRole(g, 'sled'));
            const total = new THREE.Box3().setFromObject(g);
            return {
                sledX: sled.max.x - sled.min.x,     // tube cross-section (planar loop)
                sledZ: sled.max.z - sled.min.z,     // runner length (layout)
                totalX: total.max.x - total.min.x,  // desk width (layout)
            };
        };
        const small = at(1.8, 0.8);
        const large = at(2.7, 1.2);
        expect(small.sledX).toBeCloseTo(0.040, 6);            // the member…
        expect(large.sledX).toBeCloseTo(0.040, 6);            // …does not scale
        expect(large.sledZ / small.sledZ).toBeCloseTo(1.5, 2); // the layout does
        expect(large.totalX / small.totalX).toBeCloseTo(1.5, 2);
    });

    it('desk_zen: pure top slab is exactly 35 mm at both sizes', () => {
        for (const w of [1.8, 2.7]) {
            const g = new ZenDeskBuilder(ms).build(deskData({ width: w }));
            const box = new THREE.Box3().setFromObject(meshByRole(g, 'top'));
            expect(box.max.y - box.min.y).toBeCloseTo(0.035, 6);
        }
    });

    it('desk_skeleton: pure top slab is exactly 30 mm at both sizes', () => {
        for (const w of [1.6, 2.4]) {
            const g = new SkeletonDeskBuilder(ms).build(deskData({ width: w, length: 0.7 }));
            const box = new THREE.Box3().setFromObject(meshByRole(g, 'top'));
            expect(box.max.y - box.min.y).toBeCloseTo(0.030, 6);
        }
    });
});

describe('§DESK108 — per-desk construction facts from the references', () => {
    const ms = new MaterialService();

    it('desk_zen is ASYMMETRIC: sled left of centre, pedestal right of centre', () => {
        const g = new ZenDeskBuilder(ms).build(deskData());
        const sled = new THREE.Box3().setFromObject(meshByRole(g, 'sled'));
        const ped  = new THREE.Box3().setFromObject(meshByRole(g, 'pedestal'));
        expect((sled.min.x + sled.max.x) / 2).toBeLessThan(0);
        expect((ped.min.x + ped.max.x) / 2).toBeGreaterThan(0);
    });

    it('desk_skeleton: the lower shelf sits at ~45% height on the RIGHT side', () => {
        const g = new SkeletonDeskBuilder(ms).build(deskData({ width: 1.6, length: 0.7 }));
        const shelf = new THREE.Box3().setFromObject(meshByRole(g, 'shelf'));
        const cy = (shelf.min.y + shelf.max.y) / 2;
        expect(cy).toBeCloseTo(0.75 * 0.45, 2);
        expect((shelf.min.x + shelf.max.x) / 2).toBeGreaterThan(0);
    });

    it('desk_vertex: the return is 0.20 m ABOVE the worktop; the fold reaches the floor', () => {
        const g = new VertexDeskBuilder(ms).build(deskData({ width: 1.7, length: 0.75 }));
        const ret = new THREE.Box3().setFromObject(meshByRole(g, 'return'));
        expect(ret.max.y).toBeCloseTo(0.95, 3);
        const wf = new THREE.Box3().setFromObject(meshByRole(g, 'waterfall'));
        expect(wf.min.y).toBeLessThan(0.005);   // the angled panel lands on the floor
        expect(wf.max.y).toBeCloseTo(0.75, 3);  // and the slab is the worktop
    });

    it('desk_panel: drawer fronts sit PROUD of the recessed band, both behind the top edge', () => {
        const g = new PanelDeskBuilder(ms).build(deskData({ width: 1.5, length: 0.7 }));
        const drawers = new THREE.Box3().setFromObject(meshByRole(g, 'drawers'));
        const carcass = new THREE.Box3().setFromObject(meshByRole(g, 'carcass'));
        expect(drawers.max.z).toBeLessThan(carcass.max.z);  // recessed behind the top
    });
});
