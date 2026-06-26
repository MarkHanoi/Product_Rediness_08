/**
 * §LIGHT-LOD-IMPROVE (2026-06-26) — fixture level-of-detail tests.
 *
 * The founder reported the light fixtures looked crude in the 3D view. This
 * suite pins the improved geometry so a future change can't silently regress it:
 *
 *   (a) the downlight (the most-placed fixture) now carries a recessed reflector
 *       cone + an outer trim bezel (torus) + a DOMED emissive lens, not just a
 *       black can + a flat disc;
 *   (b) every fixture's lens reads as a light — a MeshStandardMaterial with a
 *       non-black emissive and a warm (non-purple) tint;
 *   (c) main visible bodies stay within the tessellation budget (≤ 32 radial
 *       segments) so a building full of fixtures stays light;
 *   (d) the lens is a domed cap (SphereGeometry), not a flat CircleGeometry.
 *
 * THREE works under node vitest (see geometry-beam BeamInstancing.test.ts).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { LightingFragmentBuilder } from '../src/LightingFragmentBuilder';
import type { LightingData, LightingFixtureType } from '../src/LightingTypes';

// The builder's constructor reads (window as any).runtime?.events?.on — provide a
// minimal window so node vitest doesn't throw. The optional chain no-ops if absent
// but `window` itself must exist.
const g = globalThis as unknown as { window?: unknown };

function makeData(fixtureType: LightingFixtureType): LightingData {
    return {
        id: `light-${fixtureType}`,
        type: 'lighting',
        levelId: 'level-1',
        fixtureType,
        position: { x: 0, y: 2.4, z: 0 },
    };
}

/** Collect every mesh in the built fixture group. */
function meshesOf(group: THREE.Object3D): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    group.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
    });
    return out;
}

/** True for a material that reads as an emissive light lens. */
function isEmissiveLens(m: THREE.Material): boolean {
    const s = m as THREE.MeshStandardMaterial;
    return (
        (s as THREE.Material).type === 'MeshStandardMaterial' &&
        !!s.emissive &&
        s.emissive.getHex() !== 0x000000 &&
        (s.emissiveIntensity ?? 0) > 0
    );
}

/** Max radial segment count across cylinder/cone/sphere bodies in a group. */
function maxRadialSegments(group: THREE.Object3D): number {
    let max = 0;
    for (const mesh of meshesOf(group)) {
        const geo = mesh.geometry as THREE.BufferGeometry & { parameters?: Record<string, number> };
        const p = geo.parameters;
        if (!p) continue;
        const seg = p.radialSegments ?? p.widthSegments ?? p.tubularSegments;
        if (typeof seg === 'number') max = Math.max(max, seg);
    }
    return max;
}

describe('§LIGHT-LOD-IMPROVE — fixture level of detail', () => {
    let builder: LightingFragmentBuilder;

    beforeEach(() => {
        if (g.window === undefined) g.window = {};
        builder = new LightingFragmentBuilder();
        builder.setScene(new THREE.Group());
    });

    afterEach(() => {
        builder.dispose();
    });

    it('builds a downlight with reflector + bezel + domed lens (not a flat disc)', () => {
        builder.add(makeData('downlight'));
        // The builder adds the fixture group to its scene; read it back.
        const scene = (builder as unknown as { _scene: THREE.Object3D })._scene;
        const root = scene.children.find((c) => c.userData?.fixtureType === 'downlight')!;
        expect(root).toBeDefined();

        const meshes = meshesOf(root);
        // body + reflector cone + bezel + lens => at least 4 sub-meshes.
        expect(meshes.length).toBeGreaterThanOrEqual(4);

        // A torus bezel must be present (the recessed-can trim ring).
        const hasBezel = meshes.some(
            (m) => (m.geometry as THREE.BufferGeometry).type === 'TorusGeometry',
        );
        expect(hasBezel).toBe(true);

        // The lens is a domed SphereGeometry, never a flat CircleGeometry.
        const lens = meshes.find((m) =>
            Array.isArray(m.material)
                ? m.material.some(isEmissiveLens)
                : isEmissiveLens(m.material),
        );
        expect(lens).toBeDefined();
        expect((lens!.geometry as THREE.BufferGeometry).type).toBe('SphereGeometry');
    });

    it('gives every fixture a warm (non-purple) emissive lens', () => {
        const types: LightingFixtureType[] = [
            'downlight',
            'pendant',
            'pendant_pebble',
            'pendant_conical',
            'floor_wood_post',
            'floor_arc_brass',
            'table_terracotta',
            'floor_tripod_black',
            'pendant_cluster',
        ];
        const scene = (builder as unknown as { _scene: THREE.Object3D })._scene;

        for (const t of types) {
            builder.add(makeData(t));
            const root = scene.children.find((c) => c.userData?.fixtureType === t)!;
            const lensMesh = meshesOf(root).find((m) =>
                Array.isArray(m.material)
                    ? m.material.some(isEmissiveLens)
                    : isEmissiveLens(m.material),
            );
            expect(lensMesh, `${t} should have an emissive lens`).toBeDefined();

            const mat = (Array.isArray(lensMesh!.material)
                ? lensMesh!.material.find(isEmissiveLens)!
                : lensMesh!.material) as THREE.MeshStandardMaterial;

            // Warm/neutral, not the brand purple (#6600FF). THREE stores colour
            // in linear space, so absolute magnitudes are lowered; the invariant
            // that matters is the HUE: red & green dominate blue (a warm white),
            // and every channel is lit (not a dark/black emissive).
            const c = mat.emissive;
            expect(c.r).toBeGreaterThan(0.2);        // red channel lit (warm)
            expect(c.r).toBeGreaterThanOrEqual(c.b); // never blue-dominant
            expect(c.g).toBeGreaterThanOrEqual(c.b); // never blue-dominant
            // Purple (#6600FF) would have r≈0.13, g≈0, b≈1 in linear — excluded
            // by the two dominance checks above. Warm whites (#fff8e0 / #fff3d0)
            // and the amber inner rings (#c8a000) all pass.
        }
    });

    it('keeps visible bodies within the tessellation budget (≤ 32 radial segments)', () => {
        const scene = (builder as unknown as { _scene: THREE.Object3D })._scene;
        const types: LightingFixtureType[] = [
            'downlight',
            'pendant',
            'pendant_conical',
            'floor_tripod_black',
            'floor_wood_post',
        ];
        for (const t of types) {
            builder.add(makeData(t));
            const root = scene.children.find((c) => c.userData?.fixtureType === t)!;
            // Lens caps are allowed to be SEG_LENS (32); nothing should exceed it.
            expect(maxRadialSegments(root)).toBeLessThanOrEqual(32);
        }
    });
});
