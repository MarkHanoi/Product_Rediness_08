/**
 * §CARPET97 (founder, 2026-08-25) — the GEOMETRY half of the ten new carpets.
 *
 * The three pre-existing carpet builders have no build() test at all, and the
 * reason is worth stating rather than repeating: this package runs under
 * `happy-dom`, whose `canvas.getContext('2d')` returns **null**, and all three
 * write `canvas.getContext('2d')!` followed immediately by `ctx.fillStyle = …`.
 * Any test that called build() would have died on a TypeError before asserting
 * anything. `carpetTexture.ts` returns null instead, so the geometry below is
 * exercised for real; where a texture is genuinely needed (the dispose
 * contract), `HTMLCanvasElement.prototype.getContext` is stubbed with a double
 * that implements `Carpet2DContext` — the same interface the real browser
 * context is checked against — so the double cannot be more capable than the
 * thing it stands in for.
 *
 * Pinned here:
 *   • every builder builds without throwing;
 *   • the body's BOTTOM sits exactly on y = 0 (a rug that floats reads as a
 *     hovering slab; a rug that sinks z-fights the slab beneath it);
 *   • the pattern overlay floats above the body and never below it;
 *   • the userData contract the carousel / selection / shadow code reads;
 *   • the pattern EXTENDS rather than stretches, asserted on the built mesh;
 *   • disposing the pattern material frees its CanvasTexture — the documented
 *     GPU-leak guard;
 *   • the ROUND rug's diameter rule, and that it has no fringe;
 *   • the auto-furnish `rug` kind is deterministic AND actually varies.
 */
import * as THREE from '@pryzm/renderer-three/three';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MaterialService } from '../src/MaterialService';
import type { FurnitureData } from '../src/FurnitureTypes';
import {
    type CarpetPatternId, type Carpet2DContext,
    CARPET_PATTERNS, RECTANGULAR_CARPET_PATTERNS,
} from '../src/builders/carpetPatterns';
import {
    ParametricCarpetBuilder, VarietyRugBuilder, rugVarietyPool, carpetThickness,
} from '../src/builders/ParametricCarpetBuilders';
import { RoundBraidedCarpetBuilder } from '../src/builders/RoundBraidedCarpetBuilder';
import { createCarpetTexture } from '../src/builders/carpetTexture';

const ALL_IDS = Object.keys(CARPET_PATTERNS) as CarpetPatternId[];

const rugData = (over: Partial<FurnitureData> = {}): FurnitureData => ({
    id: 'rug-1', type: 'furniture', furnitureType: 'rug',
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, order: 'XYZ' },
    levelId: 'L0', levelName: 'L0', levelElevation: 0, baseOffset: 0,
    width: 3.0, length: 2.0, height: 0.004,
    material: 'fabric', properties: {},
    ...over,
} as FurnitureData);

const partsByRole = (g: THREE.Group, role: string): THREE.Mesh[] => {
    const out: THREE.Mesh[] = [];
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.userData?.['role'] === role) out.push(o as THREE.Mesh); });
    return out;
};

/** A 2D context double implementing exactly `Carpet2DContext`. */
function makeStubCtx(): Carpet2DContext {
    const noop = (): void => { /* records nothing — this suite only needs a texture to exist */ };
    return {
        fillStyle: '' as unknown, strokeStyle: '' as unknown,
        lineWidth: 1, lineCap: '' as unknown, lineJoin: '' as unknown,
        miterLimit: 10, globalAlpha: 1,
        fillRect: noop, beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
        quadraticCurveTo: noop, arc: noop, fill: noop, stroke: noop, save: noop, restore: noop,
    };
}

describe('§CARPET97 — every carpet builds, and sits on the floor', () => {
    let ms: MaterialService;
    beforeEach(() => { ms = new MaterialService(); });

    it.each(RECTANGULAR_CARPET_PATTERNS)('%s: builds without throwing', (id) => {
        expect(() => new ParametricCarpetBuilder(ms, id).build(rugData())).not.toThrow();
    });

    it('the ROUND carpet builds without throwing', () => {
        expect(() => new RoundBraidedCarpetBuilder(ms).build(rugData())).not.toThrow();
    });

    it.each(RECTANGULAR_CARPET_PATTERNS)('%s: the body BOTTOM sits exactly on y = 0', (id) => {
        const body = partsByRole(new ParametricCarpetBuilder(ms, id).build(rugData()), 'body')[0]!;
        const box = new THREE.Box3().setFromObject(body);
        expect(box.min.y).toBeCloseTo(0, 6);
        expect(box.max.y).toBeCloseTo(0.004, 6);
    });

    it('the ROUND carpet body bottom sits exactly on y = 0 too', () => {
        const body = partsByRole(new RoundBraidedCarpetBuilder(ms).build(rugData()), 'body')[0]!;
        const box = new THREE.Box3().setFromObject(body);
        expect(box.min.y).toBeCloseTo(0, 6);
    });

    it.each(RECTANGULAR_CARPET_PATTERNS)('%s: the pattern floats ABOVE the body, never below', (id) => {
        const g = new ParametricCarpetBuilder(ms, id).build(rugData());
        const body = new THREE.Box3().setFromObject(partsByRole(g, 'body')[0]!);
        const pattern = partsByRole(g, 'pattern')[0]!;
        expect(pattern.position.y).toBeGreaterThan(body.max.y);
        // …but only just: a visible gap would read as a floating sheet.
        expect(pattern.position.y - body.max.y).toBeLessThan(0.002);
    });

    it.each(RECTANGULAR_CARPET_PATTERNS)('%s: honours the carpet userData + fringe contract', (id) => {
        const g = new ParametricCarpetBuilder(ms, id).build(rugData());
        expect(g.userData['role']).toBe('carpet');
        expect(g.userData['variant']).toBe(id);
        expect(partsByRole(g, 'body')).toHaveLength(1);
        expect(partsByRole(g, 'pattern')).toHaveLength(1);
        expect(partsByRole(g, 'fringe')).toHaveLength(2);   // the two SHORT ends
        g.traverse((o) => {
            if ((o as THREE.Mesh).isMesh) expect(o.userData['isCarpetPart']).toBe(true);
        });
    });

    it('thickness is clamped to [2 mm, 12 mm] whatever the store says', () => {
        expect(carpetThickness(undefined)).toBeCloseTo(0.004);
        expect(carpetThickness(0)).toBeCloseTo(0.004);      // falsy ⇒ default
        expect(carpetThickness(0.0001)).toBeCloseTo(0.002); // floor
        expect(carpetThickness(5)).toBeCloseTo(0.012);      // ceiling
        const g = new ParametricCarpetBuilder(new MaterialService(), 'moons').build(rugData({ height: 5 }));
        expect(new THREE.Box3().setFromObject(partsByRole(g, 'body')[0]!).max.y).toBeCloseTo(0.012, 6);
    });
});

describe('§CARPET97 — the pattern EXTENDS on the built mesh', () => {
    it.each(ALL_IDS)('%s: a wider rug carries more motifs at the same wavelength', (id) => {
        const ms = new MaterialService();
        const build = (w: number, l: number): Record<string, unknown> => {
            const g = id === 'round_braided'
                ? new RoundBraidedCarpetBuilder(ms).build(rugData({ width: w, length: l }))
                : new ParametricCarpetBuilder(ms, id).build(rugData({ width: w, length: l }));
            return partsByRole(g, 'pattern')[0]!.userData;
        };
        // The round rug is driven by its DIAMETER, so grow both axes for it.
        const small = build(2.0, id === 'round_braided' ? 2.0 : 2.0);
        const large = build(4.0, id === 'round_braided' ? 4.0 : 2.0);

        expect(Number(large['motifCountX'])).toBeGreaterThan(Number(small['motifCountX']) * 1.6);
        const tol = CARPET_PATTERNS[id].snapToWholePeriods ? 0.30 : 1e-6;
        const s = Number(small['wavelengthXm']);
        expect(Math.abs(Number(large['wavelengthXm']) - s) / s).toBeLessThanOrEqual(tol);
    });
});

describe('§CARPET97 — the dispose contract frees the CanvasTexture', () => {
    let spy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
        // happy-dom has no 2D context; supply one implementing Carpet2DContext.
        spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
            .mockImplementation(() => makeStubCtx() as unknown as CanvasRenderingContext2D);
    });
    afterEach(() => { spy.mockRestore(); });

    it('the stub actually restores texture creation (guard against a vacuous test)', () => {
        expect(createCarpetTexture('moons', 3, 2)).not.toBeNull();
    });

    it.each(RECTANGULAR_CARPET_PATTERNS)('%s: disposing the material disposes its map', (id) => {
        const g = new ParametricCarpetBuilder(new MaterialService(), id).build(rugData());
        const mat = partsByRole(g, 'pattern')[0]!.material as THREE.MeshStandardMaterial;
        const tex = mat.map;
        expect(tex, `${id} built with no texture — the leak guard would be untested`).toBeTruthy();
        const texSpy = vi.spyOn(tex!, 'dispose');
        mat.dispose();
        expect(texSpy).toHaveBeenCalledTimes(1);
    });

    it('the ROUND carpet frees its map too', () => {
        const g = new RoundBraidedCarpetBuilder(new MaterialService()).build(rugData());
        const mat = partsByRole(g, 'pattern')[0]!.material as THREE.MeshStandardMaterial;
        const texSpy = vi.spyOn(mat.map!, 'dispose');
        mat.dispose();
        expect(texSpy).toHaveBeenCalledTimes(1);
    });

    it('a TILED design carries its repeat onto the texture, not onto the canvas', () => {
        const made = createCarpetTexture('diamond_trellis', 3.0, 2.0)!;
        expect(made.plan.tiled).toBe(true);
        expect(made.texture.wrapS).toBe(THREE.RepeatWrapping);
        expect(made.texture.repeat.x).toBeCloseTo(10, 3);
        expect(made.texture.repeat.y).toBeCloseTo(2.0 / 0.30, 3);
        made.texture.dispose();
    });

    it('a design uniform along its length CLAMPS that axis instead of tiling it', () => {
        const made = createCarpetTexture('fine_stripe', 3.0, 2.0)!;
        expect(made.texture.wrapS).toBe(THREE.RepeatWrapping);
        expect(made.texture.wrapT).toBe(THREE.ClampToEdgeWrapping);
        made.texture.dispose();
    });
});

describe('§CARPET97 — the ROUND rug is a disc, not a rectangle wearing a circle', () => {
    it('diameter = min(width, length): the disc is inscribed in the footprint', () => {
        const g = new RoundBraidedCarpetBuilder(new MaterialService())
            .build(rugData({ width: 3.0, length: 2.0 }));
        const box = new THREE.Box3().setFromObject(partsByRole(g, 'body')[0]!);
        // 2.0 m across BOTH axes — it never overhangs the 2.0 m dimension.
        expect(box.max.x - box.min.x).toBeCloseTo(2.0, 2);
        expect(box.max.z - box.min.z).toBeCloseTo(2.0, 2);
        expect(partsByRole(g, 'pattern')[0]!.userData['diameter']).toBeCloseTo(2.0, 6);
    });

    it('has NO fringe — deliberately, because it has no short ends', () => {
        const g = new RoundBraidedCarpetBuilder(new MaterialService()).build(rugData());
        expect(partsByRole(g, 'fringe')).toHaveLength(0);
        expect(g.userData['variant']).toBe('round_braided');
    });
});

describe('§CARPET97 — the auto-furnish `rug` kind', () => {
    it('draws from TWELVE rectangular carpets, the three originals included', () => {
        const pool = rugVarietyPool(new MaterialService());
        expect(pool).toHaveLength(12);
        const variants = pool.map((b) => b.build(rugData()).userData['variant']);
        expect(new Set(variants).size).toBe(12);
        expect(variants).toContain('patchwork'); // the pre-§CARPET97 default
        expect(variants).toContain('chevron');
        expect(variants).toContain('stripe');
        expect(variants).not.toContain('round_braided');
    });

    it('is DETERMINISTIC per position — command snapshots must round-trip', () => {
        const ms = new MaterialService();
        const at = (x: number, z: number): unknown =>
            new VarietyRugBuilder(ms).build(rugData({ position: { x, y: 0, z } })).userData['variant'];
        expect(at(1.5, 2.5)).toBe(at(1.5, 2.5));
        expect(at(1.5, 2.5)).toBe(at(1.5, 2.5));
    });

    it('actually VARIES across rooms — the defect was every room getting one rug', () => {
        const ms = new MaterialService();
        const seen = new Set<unknown>();
        for (let i = 0; i < 40; i++) {
            seen.add(new VarietyRugBuilder(ms)
                .build(rugData({ position: { x: i * 1.7, y: 0, z: i * 2.3 } })).userData['variant']);
        }
        expect(seen.size).toBeGreaterThan(6);
    });
});
