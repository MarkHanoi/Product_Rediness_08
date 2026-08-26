/**
 * §FURN123 (founder, 2026-08-26) — "Cafe tables. Sofas. Soft furniture,
 * shelves." pin tests for the genuinely-new pieces.
 *
 * Sofas are NOT covered here: the audit found straight sofas (sofa_1seat/
 * 2seat/3seat, armchair) already built + registered + reachable — see
 * whiteSofaBuilder coverage elsewhere. Nothing was duplicated.
 *
 * Pinned here:
 *   • CafeTableBuilder (3 variants) — builds, floor-seated, mesh budget 2,
 *     deterministic, materials from the MaterialService cache.
 *   • OttomanBuilder (3 variants) — builds, floor-seated, mesh budget per
 *     kind, deterministic, materials from the cache.
 *   • bookshelfShelfCount/Ys — shelf count DERIVES from height at a constant
 *     pitch (§CARPET97/§WARD118 discipline: a resize adds shelves, it never
 *     stretches a fixed set). This is the REGRESSION test: the builder used
 *     to hard-code `SHELVES = 5` regardless of height — a table where every
 *     row returned the same count would have passed against that old code;
 *     this table does NOT (heights below map to DIFFERENT counts).
 *   • BookshelfBuilder — mesh budget 1 (open) / 3 (glass), against the old
 *     one-mesh-per-panel construction (up to 6 / 8 meshes).
 *   • floatingShelfCount/Ys + FloatingShelfBuilder — same discipline, mesh
 *     budget 1.
 */
import * as THREE from '@pryzm/renderer-three/three';
import { describe, it, expect, beforeEach } from 'vitest';
import { MaterialService } from '../src/MaterialService';
import type { FurnitureData, FurnitureType } from '../src/FurnitureTypes';
import { CafeTableBuilder } from '../src/builders/DiningSetBuilders';
import { OttomanBuilder } from '../src/builders/WhiteSofaBuilder';
import {
    BookshelfBuilder, FloatingShelfBuilder,
    bookshelfShelfCount, bookshelfShelfYs,
    floatingShelfCount, floatingShelfYs,
} from '../src/builders/BookshelfBuilder';

const data = (over: Partial<FurnitureData> = {}): FurnitureData => ({
    id: 'furn123-1', type: 'furniture', furnitureType: 'cafe_table_round' as FurnitureType,
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, order: 'XYZ' },
    levelId: 'L0', levelName: 'L0', levelElevation: 0, baseOffset: 0,
    width: 0.70, length: 0.70, height: 0.75,
    material: 'wood', properties: {},
    ...over,
} as FurnitureData);

const meshes = (g: THREE.Group): THREE.Mesh[] => {
    const out: THREE.Mesh[] = [];
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); });
    return out;
};

const fingerprint = (g: THREE.Group): number[] =>
    meshes(g).flatMap((m) => Array.from(m.geometry.getAttribute('position').array as Float32Array));

/* ────────────────────────────────────────────────────────────────────────── */
/*  Cafe tables                                                               */
/* ────────────────────────────────────────────────────────────────────────── */

describe('§FURN123 — CafeTableBuilder: builds, floor-seated, budgets pinned', () => {
    let ms: MaterialService;
    beforeEach(() => { ms = new MaterialService(); });

    const TYPES: FurnitureType[] = ['cafe_table_round', 'cafe_table_square', 'cafe_table_marble'] as FurnitureType[];

    it.each(TYPES)('%s: builds without throwing', (t) => {
        expect(() => new CafeTableBuilder(ms).build(data({ furnitureType: t }))).not.toThrow();
    });

    it.each(TYPES)('%s: lowest point on the floor', (t) => {
        const box = new THREE.Box3().setFromObject(new CafeTableBuilder(ms).build(data({ furnitureType: t })));
        expect(box.min.y).toBeGreaterThanOrEqual(-1e-6);
        expect(box.min.y).toBeLessThan(0.03);
    });

    it.each(TYPES)('%s: mesh budget = 2 (top + pedestal base)', (t) => {
        expect(meshes(new CafeTableBuilder(ms).build(data({ furnitureType: t })))).toHaveLength(2);
    });

    it.each(TYPES)('%s: deterministic — two builds geometry-identical', (t) => {
        expect(fingerprint(new CafeTableBuilder(ms).build(data({ furnitureType: t }))))
            .toEqual(fingerprint(new CafeTableBuilder(ms).build(data({ furnitureType: t }))));
    });

    it.each(TYPES)('%s: every material comes from the MaterialService cache', (t) => {
        for (const m of meshes(new CafeTableBuilder(ms).build(data({ furnitureType: t })))) {
            expect(ms.isCachedMaterial(m.material as THREE.Material)).toBe(true);
        }
    });

    it('round variants use a diameter footprint — width == length in userData', () => {
        const g = new CafeTableBuilder(ms).build(data({ furnitureType: 'cafe_table_round' as FurnitureType, width: 0.8 }));
        expect(g.userData['width']).toBeCloseTo(0.8, 9);
        expect(g.userData['length']).toBeCloseTo(0.8, 9);
    });
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  Soft furniture: poufs, ottoman, floor cushion                            */
/* ────────────────────────────────────────────────────────────────────────── */

describe('§FURN123 — OttomanBuilder: builds, floor-seated, budgets pinned', () => {
    let ms: MaterialService;
    beforeEach(() => { ms = new MaterialService(); });

    const CASES: Array<{ type: FurnitureType; meshBudget: number }> = [
        { type: 'pouf_round' as FurnitureType, meshBudget: 2 },
        { type: 'ottoman_rect' as FurnitureType, meshBudget: 2 },
        { type: 'floor_cushion_square' as FurnitureType, meshBudget: 1 },
    ];

    it.each(CASES)('$type: builds without throwing', ({ type }) => {
        expect(() => new OttomanBuilder(ms).build(data({ furnitureType: type, width: 0.5, length: 0.5, height: 0.4 }))).not.toThrow();
    });

    it.each(CASES)('$type: lowest point on the floor', ({ type }) => {
        const box = new THREE.Box3().setFromObject(
            new OttomanBuilder(ms).build(data({ furnitureType: type, width: 0.5, length: 0.5, height: 0.4 })),
        );
        expect(box.min.y).toBeGreaterThanOrEqual(-1e-6);
        expect(box.min.y).toBeLessThan(0.03);
    });

    it.each(CASES)('$type: mesh budget pinned', ({ type, meshBudget }) => {
        const g = new OttomanBuilder(ms).build(data({ furnitureType: type, width: 0.5, length: 0.5, height: 0.4 }));
        expect(meshes(g)).toHaveLength(meshBudget);
    });

    it.each(CASES)('$type: deterministic — two builds geometry-identical', ({ type }) => {
        const d = data({ furnitureType: type, width: 0.5, length: 0.5, height: 0.4 });
        expect(fingerprint(new OttomanBuilder(ms).build(d))).toEqual(fingerprint(new OttomanBuilder(ms).build(d)));
    });

    it.each(CASES)('$type: every material comes from the MaterialService cache', ({ type }) => {
        for (const m of meshes(new OttomanBuilder(ms).build(data({ furnitureType: type, width: 0.5, length: 0.5, height: 0.4 })))) {
            expect(ms.isCachedMaterial(m.material as THREE.Material)).toBe(true);
        }
    });

    it('unknown type falls back to pouf_round rather than throwing', () => {
        expect(() => new OttomanBuilder(ms).build(data({ furnitureType: 'not_a_real_ottoman' as FurnitureType }))).not.toThrow();
    });

    it.each(CASES)('$type: NO mesh tags skipInPlan — no plan-symbol builder covers ottomans', ({ type }) => {
        // `skipInPlan` means "SofaPlanSymbolBuilder draws the 2D symbol instead"
        // (Contract 48 §3.4) and that builder has no ottoman cases: tagging it
        // would render a pouf as four floating feet in plan and a floor cushion
        // as NOTHING. The default edge projection must draw these.
        const g = new OttomanBuilder(ms).build(data({ furnitureType: type, width: 0.5, length: 0.5, height: 0.4 }));
        for (const m of meshes(g)) expect(m.userData['skipInPlan']).toBeUndefined();
    });
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  Shelves — bookcase (fixed regression) + the new floating variant         */
/* ────────────────────────────────────────────────────────────────────────── */

describe('§FURN123 — bookshelfShelfCount/Ys: shelf count DERIVES from height', () => {
    it('constant-pitch table — DIFFERENT heights give DIFFERENT counts (the regression this fixes)', () => {
        // The old builder hard-coded 4 internal shelves at EVERY height — a table
        // where every row shares one count would have passed against that code.
        // This table does not: it is strictly non-decreasing and genuinely varies.
        const table: Array<[number, number]> = [[0.8, 1], [1.2, 3], [1.8, 5], [2.4, 6], [3.0, 8]];
        for (const [h, n] of table) expect(bookshelfShelfCount(h), `derived @ ${h}`).toBe(n);
        // Strictly increasing across the table — proves height genuinely drives count.
        for (let i = 1; i < table.length; i++) {
            expect(bookshelfShelfCount(table[i]![0])).toBeGreaterThan(bookshelfShelfCount(table[i - 1]![0]));
        }
    });

    it('an explicit properties.shelfCount override is honoured, clamped to what fits', () => {
        expect(bookshelfShelfCount(1.9, 3)).toBe(3);
        expect(bookshelfShelfCount(1.9, 99)).toBeLessThan(99);   // clamped, not honoured verbatim
        expect(bookshelfShelfCount(1.9, 0)).toBe(0);
    });

    it('bookshelfShelfYs returns `count` positions, strictly increasing, inside the carcass', () => {
        const h = 1.9;
        const n = bookshelfShelfCount(h);
        const ys = bookshelfShelfYs(h, n);
        expect(ys).toHaveLength(n);
        for (let i = 1; i < ys.length; i++) expect(ys[i]!).toBeGreaterThan(ys[i - 1]!);
        for (const y of ys) { expect(y).toBeGreaterThan(0); expect(y).toBeLessThan(h); }
    });
});

describe('§FURN123 — BookshelfBuilder: merged meshes, parametric, floor-seated', () => {
    let ms: MaterialService;
    beforeEach(() => { ms = new MaterialService(); });

    it('bookshelf (open): mesh budget 1 (ONE merged frame — was up to 6 panels)', () => {
        const g = new BookshelfBuilder(ms).build(data({ furnitureType: 'bookshelf' as FurnitureType, width: 0.9, length: 0.32, height: 1.9 }));
        expect(meshes(g)).toHaveLength(1);
    });

    it('bookshelf_glass: mesh budget 3 (frame + doors + handles)', () => {
        const g = new BookshelfBuilder(ms).build(data({ furnitureType: 'bookshelf_glass' as FurnitureType, width: 0.9, length: 0.32, height: 1.9 }));
        expect(meshes(g)).toHaveLength(3);
    });

    it('lowest point on the floor', () => {
        const box = new THREE.Box3().setFromObject(
            new BookshelfBuilder(ms).build(data({ furnitureType: 'bookshelf' as FurnitureType, width: 0.9, length: 0.32, height: 1.9 })),
        );
        expect(box.min.y).toBeGreaterThanOrEqual(-1e-6);
        expect(box.min.y).toBeLessThan(0.03);
    });

    it('resizing taller ADDS shelves — the frame mesh vertex count grows with height', () => {
        const at = (h: number) => {
            const g = new BookshelfBuilder(ms).build(data({ furnitureType: 'bookshelf' as FurnitureType, width: 0.9, length: 0.32, height: h }));
            return meshes(g)[0]!.geometry.getAttribute('position').count;
        };
        expect(at(2.4)).toBeGreaterThan(at(0.8));
    });

    it('deterministic — two builds geometry-identical', () => {
        const d = data({ furnitureType: 'bookshelf' as FurnitureType, width: 0.9, length: 0.32, height: 1.9 });
        expect(fingerprint(new BookshelfBuilder(ms).build(d))).toEqual(fingerprint(new BookshelfBuilder(ms).build(d)));
    });

    it('every material comes from the MaterialService cache (frame mesh)', () => {
        const g = new BookshelfBuilder(ms).build(data({ furnitureType: 'bookshelf' as FurnitureType, width: 0.9, length: 0.32, height: 1.9 }));
        expect(ms.isCachedMaterial(meshes(g)[0]!.material as THREE.Material)).toBe(true);
    });
});

describe('§FURN123 — floatingShelfCount/Ys + FloatingShelfBuilder', () => {
    let ms: MaterialService;
    beforeEach(() => { ms = new MaterialService(); });

    it('constant-pitch table — count varies with height', () => {
        const table: Array<[number, number]> = [[0.5, 2], [1.05, 3], [1.5, 5], [2.0, 6]];
        for (const [h, n] of table) expect(floatingShelfCount(h), `derived @ ${h}`).toBe(n);
    });

    it('floatingShelfYs: `count` positions spanning the full height, board on the floor at count>1', () => {
        const h = 1.05, boardT = 0.035;
        const n = floatingShelfCount(h);
        const ys = floatingShelfYs(h, n, boardT);
        expect(ys).toHaveLength(n);
        expect(ys[0]!).toBeCloseTo(boardT / 2, 9);              // lowest board's underside at y=0
        expect(ys[ys.length - 1]!).toBeCloseTo(h - boardT / 2, 9); // top board's top at y=h
    });

    it('builds without throwing, mesh budget 1, deterministic, cached materials', () => {
        const d = data({ furnitureType: 'shelf_floating' as FurnitureType, width: 0.9, length: 0.22, height: 1.05 });
        const build = () => new FloatingShelfBuilder(ms).build(d);
        expect(build).not.toThrow();
        const g = build();
        expect(meshes(g)).toHaveLength(1);
        expect(fingerprint(g)).toEqual(fingerprint(build()));
        expect(ms.isCachedMaterial(meshes(g)[0]!.material as THREE.Material)).toBe(true);
    });

    it('lowest board sits on the floor (y=0) for a multi-board cluster', () => {
        const g = new FloatingShelfBuilder(ms).build(
            data({ furnitureType: 'shelf_floating' as FurnitureType, width: 0.9, length: 0.22, height: 1.05 }),
        );
        const box = new THREE.Box3().setFromObject(g);
        expect(box.min.y).toBeGreaterThanOrEqual(-1e-6);
        expect(box.min.y).toBeLessThan(0.02);
    });
});
