/**
 * §TVFURN114 (founder, 2026-08-26) — the LOD 300 TV-furniture family:
 * `tv_lowboard` (modular bays, optional incorporated TV) + `tv_console_slat`
 * (slat-wrapped stadium console).
 *
 * Pinned here:
 *   • both pieces build without throwing, sit ON the floor (y = 0), and top
 *     out at data.height (the TV variant tops out ABOVE it — the screen);
 *   • deterministic — two builds are geometry-identical;
 *   • no per-instance materials: every mesh material is MaterialService-cached
 *     or the ONE module-shared screen material (C100 §2.1 / the L-11384 class);
 *   • THE BAY RULE (resolveLowboardBays): bayWidth outranks bayCount, both
 *     clamp 2..8, pattern cycles over {d,o,c} — and bay count CHANGES the
 *     built geometry (dividers + fronts), measured on merged meshes;
 *   • THE SLAT RULE (§CARPET97): count derives from the ring perimeter at
 *     CONSTANT 38 mm slat width — resizing adds slats, never stretches them,
 *     measured on the first slat of the merged ring at two widths;
 *   • the withTv composition is ONE element reusing TvBuilder's own geometry;
 *   • material slots: carcass follows data.color; front follows
 *     properties.frontColor / frontMaterialId through the ONE ladder (an
 *     unresolvable id paints C100 §5 magenta, never a plausible timber);
 *   • mesh budgets pinned: lowboard 3 / lowboard+TV 6 / console 4 (≤ 8).
 */
import * as THREE from '@pryzm/renderer-three/three';
import { isSharedGpuResource } from '@pryzm/renderer-three';
import { describe, it, expect, beforeEach } from 'vitest';
import { MaterialService } from '../src/MaterialService';
import type { FurnitureData, FurnitureType } from '../src/FurnitureTypes';
import {
    LowboardBuilder, SlatConsoleBuilder,
    resolveLowboardBays, slatRingPerimeter, slatCountForPerimeter,
    SLAT_WIDTH, SLAT_PITCH,
} from '../src/builders/MediaWallBuilder';

const data = (over: Partial<FurnitureData> = {}): FurnitureData => ({
    id: 'tvf-1', type: 'furniture', furnitureType: 'tv_lowboard' as FurnitureType,
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, order: 'XYZ' },
    levelId: 'L0', levelName: 'L0', levelElevation: 0, baseOffset: 0,
    width: 2.0, length: 0.42, height: 0.55,
    material: 'wood', properties: {},
    ...over,
} as FurnitureData);

const consoleData = (over: Partial<FurnitureData> = {}): FurnitureData =>
    data({ furnitureType: 'tv_console_slat' as FurnitureType,
        width: 1.5, length: 0.4, height: 0.45, ...over });

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

const fingerprint = (g: THREE.Group): number[] =>
    meshes(g).flatMap((m) => Array.from(m.geometry.getAttribute('position').array as Float32Array));

const triCount = (g: THREE.Group): number =>
    meshes(g).reduce((t, m) => {
        const geo = m.geometry;
        return t + (geo.index ? geo.index.count / 3 : geo.getAttribute('position').count / 3);
    }, 0);

describe('§TVFURN114 — both pieces build, sit on the floor, top out at height', () => {
    let ms: MaterialService;
    beforeEach(() => { ms = new MaterialService(); });

    it('tv_lowboard builds without throwing', () => {
        expect(() => new LowboardBuilder(ms).build(data())).not.toThrow();
    });

    it('tv_console_slat builds without throwing', () => {
        expect(() => new SlatConsoleBuilder(ms).build(consoleData())).not.toThrow();
    });

    it('tv_lowboard: feet ON the floor, top slab at data.height', () => {
        const g = new LowboardBuilder(ms).build(data());
        const box = new THREE.Box3().setFromObject(g);
        expect(box.min.y).toBeGreaterThanOrEqual(-1e-6);
        expect(box.min.y).toBeLessThan(0.01);
        expect(box.max.y).toBeCloseTo(0.55, 3);
    });

    it('tv_console_slat: plinth ON the floor, top slab at data.height', () => {
        const g = new SlatConsoleBuilder(ms).build(consoleData());
        const box = new THREE.Box3().setFromObject(g);
        expect(box.min.y).toBeGreaterThanOrEqual(-1e-6);
        expect(box.min.y).toBeLessThan(0.01);
        expect(box.max.y).toBeCloseTo(0.45, 3);
        // Footprint honours the requested stadium exactly (slats flush).
        expect(box.max.x - box.min.x).toBeCloseTo(1.5, 2);
        expect(box.max.z - box.min.z).toBeCloseTo(0.4, 2);
    });

    it('deterministic — two builds are geometry-identical', () => {
        expect(fingerprint(new LowboardBuilder(ms).build(data())))
            .toEqual(fingerprint(new LowboardBuilder(ms).build(data())));
        expect(fingerprint(new SlatConsoleBuilder(ms).build(consoleData())))
            .toEqual(fingerprint(new SlatConsoleBuilder(ms).build(consoleData())));
    });

    it('no per-instance materials — cached or the one shared screen material', () => {
        for (const g of [
            new LowboardBuilder(ms).build(data()),
            new LowboardBuilder(ms).build(data({ properties: { withTv: true } })),
            new SlatConsoleBuilder(ms).build(consoleData()),
        ]) {
            for (const m of meshes(g)) {
                const mat = m.material as THREE.Material;
                expect(ms.isCachedMaterial(mat) || isSharedGpuResource(mat)).toBe(true);
            }
        }
    });

    it('mesh budgets pinned: lowboard 3 / lowboard+TV 6 / console 4 — all ≤ 8', () => {
        const lb  = new LowboardBuilder(ms).build(data());
        const tv  = new LowboardBuilder(ms).build(data({ properties: { withTv: true } }));
        const con = new SlatConsoleBuilder(ms).build(consoleData());
        expect(meshes(lb)).toHaveLength(3);   // carcass / fronts / handles
        expect(meshes(tv)).toHaveLength(6);   // + tv-stand / bezel / screen
        expect(meshes(con)).toHaveLength(4);  // slats / top / core / plinth
        expect(lb.userData['role']).toBe('tv_furniture');
        expect(con.userData['variant']).toBe('slat_console');
        // Tri budgets pinned at the default card size — the report quotes these.
        expect(triCount(lb)).toBe(300);
        expect(triCount(tv)).toBe(348);
        expect(triCount(con)).toBe(1392);
    });
});

describe('§TVFURN114 — THE BAY RULE', () => {
    const ms = new MaterialService();

    it('defaults to 4 bays cycling drawer/open/door', () => {
        expect(resolveLowboardBays(1.964, {})).toEqual(['drawer', 'open', 'door', 'drawer']);
    });

    it('bayCount is honoured and clamps to 2..8', () => {
        expect(resolveLowboardBays(1.964, { bayCount: 6 })).toHaveLength(6);
        expect(resolveLowboardBays(1.964, { bayCount: 1 })).toHaveLength(2);
        expect(resolveLowboardBays(1.964, { bayCount: 40 })).toHaveLength(8);
    });

    it('bayWidth OUTRANKS bayCount — the count derives from the run', () => {
        // 1.964 / 0.4 = 4.91 → 5 bays, even though bayCount says 2.
        expect(resolveLowboardBays(1.964, { bayWidth: 0.4, bayCount: 2 })).toHaveLength(5);
    });

    it('pattern cycles and unknown characters read as drawer', () => {
        expect(resolveLowboardBays(1.964, { bayCount: 4, bayPattern: 'oc' }))
            .toEqual(['open', 'door', 'open', 'door']);
        expect(resolveLowboardBays(1.964, { bayCount: 2, bayPattern: 'xq' }))
            .toEqual(['drawer', 'drawer']);
    });

    it('bay count CHANGES the built geometry — dividers and fronts both move', () => {
        const at = (bayCount: number): { carcass: number; fronts: number } => {
            const g = new LowboardBuilder(ms).build(
                data({ properties: { bayCount, bayPattern: 'd' } }));
            return {
                carcass: meshByRole(g, 'carcass').geometry.getAttribute('position').count,
                fronts:  meshByRole(g, 'fronts').geometry.getAttribute('position').count,
            };
        };
        const three = at(3);
        const five  = at(5);
        // 2 more dividers of 24 verts each; 4 more drawer fronts of 24 each.
        expect(five.carcass - three.carcass).toBe(2 * 24);
        expect(five.fronts - three.fronts).toBe(4 * 24);
    });

    it('an all-open pattern has NO fronts and NO handles — one carcass mesh', () => {
        const g = new LowboardBuilder(ms).build(
            data({ properties: { bayCount: 3, bayPattern: 'o' } }));
        expect(meshes(g)).toHaveLength(1);
        expect(meshes(g)[0].userData['role']).toBe('carcass');
    });

    it('resize scales the LAYOUT, never the MEMBERS — front gauge fixed at 18 mm', () => {
        const frontDepth = (w: number): number => {
            const g = new LowboardBuilder(ms).build(data({ width: w }));
            const b = new THREE.Box3().setFromObject(meshByRole(g, 'fronts'));
            return b.max.z - b.min.z;
        };
        expect(frontDepth(2.0)).toBeCloseTo(0.018, 6);
        expect(frontDepth(3.0)).toBeCloseTo(0.018, 6);
    });
});

describe('§TVFURN114 — THE SLAT RULE (§CARPET97 discipline)', () => {
    const ms = new MaterialService();

    it('the count table — derived from the ring perimeter at 52 mm pitch', () => {
        // slatRingPerimeter(w, d) = 2(w − d) + π(d − 0.018)
        const n = (w: number, d: number): number =>
            slatCountForPerimeter(slatRingPerimeter(w, d));
        expect(n(1.0, 0.4)).toBe(46);
        expect(n(1.5, 0.4)).toBe(65);
        expect(n(2.1, 0.4)).toBe(88);
        expect(n(0.8, 0.8)).toBe(47);   // pure drum — no straight run
        expect(SLAT_PITCH).toBeCloseTo(SLAT_WIDTH + 0.014, 6);
    });

    it('resizing ADDS slats at constant slat width — never stretches them', () => {
        const at = (w: number): { n: number; firstSlatW: number } => {
            const g = new SlatConsoleBuilder(ms).build(consoleData({ width: w }));
            const geo = meshByRole(g, 'slats').geometry;
            const pos = geo.getAttribute('position');
            expect(pos.count % 24).toBe(0);         // merged 24-vert boxes
            // First 24 vertices = the FIRST slat (front run, yaw 0):
            let minX = Infinity, maxX = -Infinity;
            for (let i = 0; i < 24; i++) {
                const x = pos.getX(i);
                minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            }
            return { n: pos.count / 24, firstSlatW: maxX - minX };
        };
        const small = at(1.5);
        const large = at(2.1);
        expect(small.n).toBe(65);
        expect(large.n).toBe(88);                       // the COUNT moved…
        expect(small.firstSlatW).toBeCloseTo(SLAT_WIDTH, 6);
        expect(large.firstSlatW).toBeCloseTo(SLAT_WIDTH, 6);  // …the WIDTH did not
        const g = new SlatConsoleBuilder(ms).build(consoleData({ width: 2.1 }));
        expect(g.userData['slatCount']).toBe(88);
    });
});

describe('§TVFURN114 — the withTv composition (ONE element, TvBuilder geometry)', () => {
    const ms = new MaterialService();

    it('the TV stands ON the unit: screen above the top, narrower than the run', () => {
        const g = new LowboardBuilder(ms).build(data({ properties: { withTv: true } }));
        const box = new THREE.Box3().setFromObject(g);
        // 0.55 unit + 0.09 stand + 1.24 × 0.58 panel = 1.359 m to the bezel top.
        expect(box.max.y).toBeCloseTo(0.55 + 0.09 + Math.min(1.4, 2.0 * 0.62) * 0.58, 2);
        expect(g.userData['withTv']).toBe(true);
        // The panel never overhangs the unit.
        expect(box.max.x - box.min.x).toBeCloseTo(2.0, 2);
    });

    it('the tv_lowboard_tv TYPE seeds the composition; an explicit withTv:false wins', () => {
        // A TYPE, because placement resolves descriptor defaults by type — a
        // same-type card with `withTv: true` would have placed without its screen.
        const typed = new LowboardBuilder(ms).build(
            data({ furnitureType: 'tv_lowboard_tv' as FurnitureType }));
        expect(meshes(typed)).toHaveLength(6);
        expect(typed.userData['withTv']).toBe(true);
        const off = new LowboardBuilder(ms).build(
            data({ furnitureType: 'tv_lowboard_tv' as FurnitureType, properties: { withTv: false } }));
        expect(meshes(off)).toHaveLength(3);
        expect(off.userData['withTv']).toBe(false);
    });

    it('without the flag the SAME type builds no TV — 3 meshes, top at height', () => {
        const g = new LowboardBuilder(ms).build(data());
        expect(meshes(g)).toHaveLength(3);
        expect(g.userData['withTv']).toBe(false);
        expect(new THREE.Box3().setFromObject(g).max.y).toBeCloseTo(0.55, 3);
    });
});

describe('§TVFURN114 — material slots through the ONE ladder', () => {
    const ms = new MaterialService();
    const hex = (m: THREE.Mesh): number =>
        ((m.material as THREE.MeshStandardMaterial).color.getHex());

    it('carcass follows data.color; front derives the ancestor door tint', () => {
        const g = new LowboardBuilder(ms).build(data({ color: '#336699' }));
        expect(hex(meshByRole(g, 'carcass'))).toBe(0x336699);
        expect(hex(meshByRole(g, 'fronts'))).toBe(0x336699 - 0x101010);
    });

    it('properties.frontColor changes ONLY the fronts', () => {
        const g = new LowboardBuilder(ms).build(
            data({ color: '#336699', properties: { frontColor: '#993311' } }));
        expect(hex(meshByRole(g, 'carcass'))).toBe(0x336699);
        expect(hex(meshByRole(g, 'fronts'))).toBe(0x993311);
    });

    it('an unresolvable frontMaterialId paints C100 §5 magenta, never a timber', () => {
        const g = new LowboardBuilder(ms).build(
            data({ properties: { frontMaterialId: 'no-such-material-§TVFURN114' } }));
        expect(hex(meshByRole(g, 'fronts'))).toBe(0xff00ff);
    });

    it('console: data.color drives top + slats; the core stays dark', () => {
        const g = new SlatConsoleBuilder(ms).build(consoleData({ color: '#c08050' }));
        expect(hex(meshByRole(g, 'top'))).toBe(0xc08050);
        expect(hex(meshByRole(g, 'slats'))).toBe(0xc08050);
        expect(hex(meshByRole(g, 'core'))).toBe(0x241f19);
    });
});
