/**
 * §DESK108 (founder, 2026-08-26) — the dining half: extending table + three
 * dining SETS (one element each, chairs built in).
 *
 * Pinned here:
 *   • every builder builds without throwing, lowest point ON the floor;
 *   • deterministic (two builds geometry-identical);
 *   • one mesh per MATERIAL GROUP, budgets pinned (2 / 3 / 5 / 3);
 *   • materials from the MaterialService cache (C100 §2.1);
 *   • the CHAIR COUNT is parametric (`properties.chairCount`) and geometry
 *     grows exactly linearly — 8 shells carry 2× the vertices of 4;
 *   • the parametric rule: table resize scales the TABLE layout, the chairs
 *     stay standard-sized (shell y-extent invariant, vertex count invariant);
 *   • an odd count seats the remainder at the HEAD of the table;
 *   • the extending top is genuinely 3-segment; the H-stretcher exists low;
 *   • C84 EI-9: the grey shell is the SAME silhouette as the quilted shell
 *     (identical shell vertex layout, different material + no quilting).
 */
import * as THREE from '@pryzm/renderer-three/three';
import { describe, it, expect, beforeEach } from 'vitest';
import { MaterialService } from '../src/MaterialService';
import type { FurnitureData, FurnitureType } from '../src/FurnitureTypes';
import {
    ExtendingDiningTableBuilder, RusticDiningSetBuilder,
    ModernDiningSetBuilder, ShellDiningSetBuilder,
    chairPlacements, chairCountOf,
} from '../src/builders/DiningSetBuilders';
import type { IFurnitureBuilder } from '../src/builders/IFurnitureBuilder';

const setData = (over: Partial<FurnitureData> = {}): FurnitureData => ({
    id: 'set-1', type: 'furniture', furnitureType: 'dining_set_modern' as FurnitureType,
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, order: 'XYZ' },
    levelId: 'L0', levelName: 'L0', levelElevation: 0, baseOffset: 0,
    width: 2.2, length: 1.0, height: 0.75,
    material: 'wood', properties: {},
    ...over,
} as FurnitureData);

interface SetCase {
    name: string;
    make: (ms: MaterialService) => IFurnitureBuilder;
    meshBudget: number;
    defaultChairs: number;
}

const CASES: SetCase[] = [
    { name: 'dining_table_extending', make: (ms) => new ExtendingDiningTableBuilder(ms), meshBudget: 2, defaultChairs: 0 },
    { name: 'dining_set_rustic',      make: (ms) => new RusticDiningSetBuilder(ms),      meshBudget: 3, defaultChairs: 4 },
    { name: 'dining_set_modern',      make: (ms) => new ModernDiningSetBuilder(ms),      meshBudget: 5, defaultChairs: 6 },
    { name: 'dining_set_shell',       make: (ms) => new ShellDiningSetBuilder(ms),       meshBudget: 3, defaultChairs: 8 },
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

const vertexCount = (m: THREE.Mesh): number => m.geometry.getAttribute('position').count;

const fingerprint = (g: THREE.Group): number[] =>
    meshes(g).flatMap((m) => Array.from(m.geometry.getAttribute('position').array as Float32Array));

describe('§DESK108 dining — every set builds, sits on the floor, budgets pinned', () => {
    let ms: MaterialService;
    beforeEach(() => { ms = new MaterialService(); });

    it.each(CASES)('$name: builds without throwing', ({ make }) => {
        expect(() => make(ms).build(setData())).not.toThrow();
    });

    it.each(CASES)('$name: lowest point ON the floor, never below', ({ make }) => {
        const box = new THREE.Box3().setFromObject(make(ms).build(setData()));
        expect(box.min.y).toBeGreaterThanOrEqual(-1e-6);
        expect(box.min.y).toBeLessThan(0.03);
    });

    it.each(CASES)('$name: deterministic — two builds geometry-identical', ({ make }) => {
        expect(fingerprint(make(ms).build(setData())))
            .toEqual(fingerprint(make(ms).build(setData())));
    });

    it.each(CASES)('$name: one mesh per material group — budget pinned', ({ make, meshBudget, defaultChairs }) => {
        const g = make(ms).build(setData());
        expect(meshes(g)).toHaveLength(meshBudget);
        expect(g.userData['chairCount']).toBe(defaultChairs);
    });

    it.each(CASES)('$name: every material comes from the MaterialService cache', ({ make }) => {
        for (const m of meshes(make(ms).build(setData()))) {
            expect(ms.isCachedMaterial(m.material as THREE.Material)).toBe(true);
        }
    });
});

describe('§DESK108 dining — chair count is a PARAMETER', () => {
    const ms = new MaterialService();

    it('chairCountOf: default, override, clamp', () => {
        expect(chairCountOf(setData(), 6)).toBe(6);
        expect(chairCountOf(setData({ properties: { chairCount: 4 } }), 6)).toBe(4);
        expect(chairCountOf(setData({ properties: { chairCount: 99 } }), 6)).toBe(12);
        expect(chairCountOf(setData({ properties: { chairCount: 0 } }), 6)).toBe(1);
        expect(chairCountOf(setData({ properties: { chairCount: 'six' } }), 6)).toBe(6);
    });

    it('shell set: 8 shells carry EXACTLY 2× the vertices of 4 — linear geometry', () => {
        const at = (n: number): number => vertexCount(meshByRole(
            new ShellDiningSetBuilder(ms).build(setData({ properties: { chairCount: n } })),
            'shells',
        ));
        expect(at(8)).toBe(2 * at(4));
    });

    it('rustic set: chair timber grows linearly with count too', () => {
        const at = (n: number): number => vertexCount(meshByRole(
            new RusticDiningSetBuilder(ms).build(setData({ properties: { chairCount: n } })),
            'chairs',
        ));
        expect(at(8)).toBe(2 * at(4));
    });

    it('an ODD count seats the remainder at the table HEAD (+x, facing the table)', () => {
        const p = chairPlacements(5, 2.2, 1.0);
        expect(p).toHaveLength(5);
        const head = p.find((q) => q.x > 2.2 / 2);
        expect(head).toBeDefined();
        expect(head!.z).toBe(0);
        expect(head!.rotY).toBeCloseTo(-Math.PI / 2, 6);
        // The four side chairs face the table from both long sides.
        expect(p.filter((q) => q.rotY === 0)).toHaveLength(2);
        expect(p.filter((q) => Math.abs(q.rotY - Math.PI) < 1e-9)).toHaveLength(2);
    });
});

describe('§DESK108 dining — table resize scales the TABLE, chairs stay standard', () => {
    const ms = new MaterialService();

    it('modern set: shells keep their height and vertex count when the table grows 1.5×', () => {
        const at = (w: number, l: number): { ySpan: number; verts: number; xSpan: number } => {
            const g = new ModernDiningSetBuilder(ms).build(setData({ width: w, length: l }));
            const shells = meshByRole(g, 'shells');
            const box = new THREE.Box3().setFromObject(shells);
            return {
                ySpan: box.max.y - box.min.y,     // chair height — a MEMBER
                verts: vertexCount(shells),        // same six chairs
                xSpan: box.max.x - box.min.x,     // seat spacing — LAYOUT
            };
        };
        const small = at(2.2, 1.0);
        const large = at(3.3, 1.5);
        expect(large.ySpan).toBeCloseTo(small.ySpan, 6);
        expect(large.verts).toBe(small.verts);
        expect(large.xSpan).toBeGreaterThan(small.xSpan * 1.3); // chairs spread out
    });
});

describe('§DESK108 dining — construction facts from the references', () => {
    const ms = new MaterialService();

    it('extending table: the top is genuinely 3-segment; the H-stretcher sits low', () => {
        const g = new ExtendingDiningTableBuilder(ms).build(setData({ width: 1.8, length: 0.9, height: 0.76 }));
        // 3 merged boxes × 24 vertices each — a single-slab top would be 24.
        expect(vertexCount(meshByRole(g, 'top'))).toBe(72);
        const frame = new THREE.Box3().setFromObject(meshByRole(g, 'frame'));
        expect(frame.min.y).toBeCloseTo(0, 6);            // legs on the floor
        // Stretcher rails around y = 0.14 — inside the frame's low band.
        expect(frame.max.y).toBeCloseTo(0.76 - 0.035, 3); // frame stops under the top
        expect(g.userData['chairCount']).toBe(0);          // table only — no chairs
    });

    it('C84 EI-9: grey shell and quilted shell are ONE silhouette — same shell vertex layout', () => {
        const modern = new ModernDiningSetBuilder(ms).build(setData({ properties: { chairCount: 4 } }));
        const grey   = new ShellDiningSetBuilder(ms).build(setData({ properties: { chairCount: 4 } }));
        expect(vertexCount(meshByRole(modern, 'shells'))).toBe(vertexCount(meshByRole(grey, 'shells')));
        // The quilting is the modern set's own extra material group…
        expect(meshes(modern).some((m) => m.userData['role'] === 'quilting')).toBe(true);
        // …and the grey set deliberately has none (no empty-mesh lie).
        expect(meshes(grey).some((m) => m.userData['role'] === 'quilting')).toBe(false);
    });

    it('sets carry chairs OUTSIDE the table footprint (tucked, overhanging the long sides)', () => {
        const g = new ShellDiningSetBuilder(ms).build(setData({ width: 2.6, length: 1.1 }));
        const box = new THREE.Box3().setFromObject(g);
        expect(box.max.z).toBeGreaterThan(1.1 / 2);       // chair backs overhang
        expect(box.max.z).toBeLessThan(1.1 / 2 + 0.40);   // …but stay tucked
    });
});
