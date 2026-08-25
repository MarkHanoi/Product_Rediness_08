/**
 * §LIGHT99-COST (L-11422) — the per-fixture cost pin.
 *
 * The founder asked for new luminaires "WITH MAXIMUM PERFORMANCE". This suite is
 * the measurement that claim has to stand on, so a later family cannot quietly
 * make a furnished building expensive.
 *
 * ── The three costs, and which one actually scales ──────────────────────────
 *
 *   1. REAL LIGHTS — bounded by `LiveLightBudget`, NOT by the family count. This
 *      is the one that would have hurt (O(fragments × live_lights) whole-scene
 *      shading, plus a shader-permutation rebuild per count change), and it is
 *      already capped at 8/6/3/1 by tier. Adding families adds ZERO lights.
 *      Pinned in `LiveLightHonesty.test.ts`.
 *   2. MATERIALS — pooled module-level by `sharedMat`/`sharedLensMat`. This is
 *      the one that DID leak: measured 2026-08-25, `pendant` minted one material
 *      per instance (its gold inner ring) while all 31 other families shared
 *      cleanly. Fixed, and pinned below so it cannot come back.
 *   3. TRIANGLES — per-instance and unbounded by anything but authoring, so it
 *      is the axis a new family can actually blow. Ceiling pinned below.
 *
 * ⛔ These are COUNTS, measured in Node. They are not frame times: no bench in
 * this repo can measure GPU wall-time (no GL context headless). A green run here
 * does NOT establish a frame rate.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { LightingFragmentBuilder } from '../src/LightingFragmentBuilder';
import type { LightingData, LightingFixtureType } from '../src/LightingTypes';
import { BUILT_IN_LIGHTING_TYPES } from '../src/LightingTypeDefinitions';
import { LIGHTING_FIXTURE_PHOTOMETRY, photometryForFixture } from '@pryzm/core-app-model';

const g = globalThis as unknown as { window?: unknown };

/**
 * §TRIANGLE-CEILING — measured high-water mark across all families on
 * 2026-08-25 was `chandelier_decorative` at 4,984 (six arms × a lens each);
 * the next heaviest was `pendant_cluster` at 2,416. 5,600 leaves the
 * chandelier ~12% head-room for tessellation tweaks and fails anything that
 * arrives in a different weight class.
 *
 * ⚠ SHRINK-ONLY in spirit: if a new family needs this raised, that is a design
 * conversation, not a constant edit.
 */
const MAX_TRIANGLES_PER_FIXTURE = 5_600;

function triCount(o: THREE.Object3D): number {
    let t = 0;
    o.traverse((n) => {
        const m = n as THREE.Mesh;
        if (!m.isMesh || !m.geometry) return;
        const geo = m.geometry as THREE.BufferGeometry;
        if (geo.index) t += geo.index.count / 3;
        else if (geo.attributes.position) t += geo.attributes.position.count / 3;
    });
    return Math.round(t);
}

function materialsOf(o: THREE.Object3D): Set<THREE.Material> {
    const s = new Set<THREE.Material>();
    o.traverse((n) => {
        const m = n as THREE.Mesh;
        if (m.isMesh && m.material) s.add(m.material as THREE.Material);
    });
    return s;
}

const ALL_TYPES = BUILT_IN_LIGHTING_TYPES.map((t) => t.id as LightingFixtureType);

function build(type: LightingFixtureType, id = `c-${type}`, x = 0): {
    b: LightingFragmentBuilder; scene: THREE.Scene; root: THREE.Object3D;
} {
    const scene = new THREE.Scene();
    const b = new LightingFragmentBuilder();
    b.setScene(scene);
    const data: LightingData = {
        id, type: 'lighting', levelId: 'L1', fixtureType: type,
        position: { x, y: 2.4, z: 0 },
    };
    b.add(data);
    const root = scene.children.find((c) => c.userData?.id === id)!;
    return { b, scene, root };
}

describe('§LIGHT99-COST — every family builds, and builds something', () => {
    beforeEach(() => { g.window = g.window ?? {}; });

    it('every catalogue family builds without throwing', () => {
        for (const type of ALL_TYPES) {
            expect(() => { const { b } = build(type); b.dispose(); }, type).not.toThrow();
        }
    });

    it('every family produces REAL geometry — no silently empty fixture', () => {
        for (const type of ALL_TYPES) {
            const { b, root } = build(type);
            expect(root, `${type} produced no root`).toBeDefined();
            expect(triCount(root), `${type} built ZERO triangles`).toBeGreaterThan(0);
            b.dispose();
        }
    });

    it('no family exceeds the per-fixture triangle ceiling', () => {
        const over: string[] = [];
        for (const type of ALL_TYPES) {
            const { b, root } = build(type);
            const t = triCount(root);
            if (t > MAX_TRIANGLES_PER_FIXTURE) over.push(`${type}=${t}`);
            b.dispose();
        }
        expect(over, `over the ${MAX_TRIANGLES_PER_FIXTURE}-triangle ceiling`).toEqual([]);
    });
});

describe('§LIGHT99-COST — materials are POOLED, not minted per fixture', () => {
    beforeEach(() => { g.window = g.window ?? {}; });

    /**
     * ⭐ THE REGRESSION THIS SUITE EXISTS FOR.
     *
     * Two instances of one family must share EVERY material object. Measured
     * before the fix: `pendant` returned a union of 6 against 5 per instance —
     * one fresh `MeshStandardMaterial` per pendant. Every other family was 0.
     */
    it('two instances of the SAME family share every material object', () => {
        const leaks: string[] = [];
        for (const type of ALL_TYPES) {
            const scene = new THREE.Scene();
            const b = new LightingFragmentBuilder();
            b.setScene(scene);
            b.add({ id: 'a', type: 'lighting', levelId: 'L1', fixtureType: type, position: { x: 0, y: 2.4, z: 0 } });
            b.add({ id: 'b', type: 'lighting', levelId: 'L1', fixtureType: type, position: { x: 9, y: 2.4, z: 0 } });
            const ra = scene.children.find((c) => c.userData?.id === 'a')!;
            const rb = scene.children.find((c) => c.userData?.id === 'b')!;
            const ma = materialsOf(ra);
            const union = new Set([...ma, ...materialsOf(rb)]);
            if (union.size !== ma.size) leaks.push(`${type} (+${union.size - ma.size}/instance)`);
            b.dispose();
        }
        expect(leaks, 'families minting per-instance materials').toEqual([]);
    });

    it('twelve fixtures of one family cost the materials of ONE', () => {
        const scene = new THREE.Scene();
        const b = new LightingFragmentBuilder();
        b.setScene(scene);
        for (let i = 0; i < 12; i++) {
            b.add({ id: `p${i}`, type: 'lighting', levelId: 'L1', fixtureType: 'pendant', position: { x: i * 2, y: 2.4, z: 0 } });
        }
        const first = materialsOf(scene.children.find((c) => c.userData?.id === 'p0')!);
        const all = materialsOf(scene);
        expect(all.size, 'a kitchen of twelve pendants must not mint twelve materials').toBe(first.size);
        b.dispose();
    });
});

describe('§LIGHT99-COST — geometry is deterministic', () => {
    beforeEach(() => { g.window = g.window ?? {}; });

    it('the same family built twice yields identical triangle counts and mesh counts', () => {
        for (const type of ALL_TYPES) {
            const a = build(type, 'x1', 0);
            const c = build(type, 'x2', 0);
            let meshesA = 0, meshesB = 0;
            a.root.traverse((n) => { if ((n as THREE.Mesh).isMesh) meshesA++; });
            c.root.traverse((n) => { if ((n as THREE.Mesh).isMesh) meshesB++; });
            expect(triCount(a.root), `${type} triangles not deterministic`).toBe(triCount(c.root));
            expect(meshesA, `${type} mesh count not deterministic`).toBe(meshesB);
            a.b.dispose(); c.b.dispose();
        }
    });
});

describe('§LIGHT99-COST — fixture lights never cast shadows', () => {
    beforeEach(() => { g.window = g.window ?? {}; });

    /**
     * §NIGHT-ALL-LIGHTS-ON. A fixture PointLight that cast shadows would need a
     * cube shadow map and a texture unit each — the tight cap that belongs to the
     * sun/key light. No fixture's look may depend on casting one.
     */
    it('no fixture-owned light casts a shadow, in any family', () => {
        for (const type of ALL_TYPES) {
            const { b, scene } = build(type);
            b.setQualityTier('cinematic');
            b.syncLights();
            scene.traverse((o) => {
                const l = o as THREE.Light;
                if (l.isLight) expect(l.castShadow, `${type} light casts a shadow`).toBe(false);
            });
            b.dispose();
        }
    });
});

describe('§LIGHT99-COST — every family has defensible photometry', () => {
    it('the photometry table covers EXACTLY the families the picker offers', () => {
        const picker = new Set(ALL_TYPES);
        const table = new Set(Object.keys(LIGHTING_FIXTURE_PHOTOMETRY));
        const offeredNotRated = [...picker].filter((t) => !table.has(t));
        const ratedNotOffered = [...table].filter((t) => !picker.has(t as LightingFixtureType));
        expect(offeredNotRated, 'offered by the picker but absent from photometry').toEqual([]);
        expect(ratedNotOffered, 'rated but not offered').toEqual([]);
    });

    it('no family silently falls through to FALLBACK_PHOTOMETRY', () => {
        for (const type of ALL_TYPES) {
            const p = photometryForFixture(type);
            expect(p, type).toBe((LIGHTING_FIXTURE_PHOTOMETRY as Record<string, unknown>)[type]);
        }
    });

    it('every row is in a physically sane range', () => {
        for (const type of ALL_TYPES) {
            const p = photometryForFixture(type);
            // A fixture that emits nothing is not a fixture.
            expect(p.lumens, `${type} lumens`).toBeGreaterThan(0);
            // 22 000 lm is the high bay, the brightest thing in the catalogue.
            expect(p.lumens, `${type} lumens`).toBeLessThanOrEqual(25_000);
            expect(p.kelvin, `${type} kelvin`).toBeGreaterThanOrEqual(2_200);
            expect(p.kelvin, `${type} kelvin`).toBeLessThanOrEqual(6_500);
            expect(p.beamAngleDeg, `${type} beam`).toBeGreaterThan(0);
            expect(p.beamAngleDeg, `${type} beam`).toBeLessThanOrEqual(360);
            expect(p.reachM, `${type} reach`).toBeGreaterThan(0);
            expect(p.reachM, `${type} reach`).toBeLessThanOrEqual(9);
            expect(['point', 'linear'], `${type} form`).toContain(p.form);
            expect(['ceiling', 'wall', 'floor', 'table'], `${type} mount`).toContain(p.mount);
        }
    });
});
