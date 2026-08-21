/**
 * §MATERIAL-MAPS-AND-TILING (L-1702 / L-1703) — THE MESH-LEVEL PROOF.
 *
 * Founder: *"they have really nice wooden parquet materials, proper tiling
 * floors… I want them all."*
 *
 * ── WHY EVERY ASSERTION READS A `THREE.Material` OFF A MESH IN THE SCENE ────
 *
 * §COMMITTED-IS-NOT-REACHABLE, and this lane had the receipts before it started:
 * C100 §10.6 measured `matDef.textures` READ at seven sites and WRITTEN by
 * nothing, so *"all seven reads resolve `undefined` on every element, every
 * frame"*. A suite asserting `resolveMaterialTextures(...).state === 'resolved'`
 * would have passed on that exact build — the resolver would have been right and
 * the floor would still have been flat. And L-1670, THIS session, is the same
 * shape one layer along: a wall finish reached the store AND the builder, and two
 * invalidation gates meant nothing repainted.
 *
 * So the claim under test is the one the founder can see:
 *
 *   A SLAB CARRYING A MATERIAL WITH MAPS RENDERS A MESH WHOSE MATERIAL HOLDS THE
 *   TEXTURE, AT THE MATERIAL'S REAL-WORLD SCALE, ON GEOMETRY WHOSE UVs ARE IN
 *   METRES.
 *
 * ── WHY THE ORACLE CANNOT MOVE WITH THE SUBJECT ─────────────────────────────
 *
 * The repeat is asserted against ABSOLUTE arithmetic written out in the test
 * (`1 / 1.2`), never against `deriveTextureRepeat()` — the function the subject
 * uses. §CONFIDENT-REGISTER-ROWS: a control that calls the code under test to
 * compute its own expectation cannot fail.
 *
 * ── WHAT IS FAKED, AND WHY THAT IS NOT THE SUBJECT ──────────────────────────
 *
 * Only the BYTE FETCH. The test registers a loader for `.png` through the
 * production registration seam (`registerTextureLoader`) that hands back a bare
 * `THREE.Texture` instead of decoding an image — because happy-dom cannot decode
 * one and a unit test must not hit the network. Everything downstream of the
 * fetch — colour space, wrap mode, repeat, rotation, sharing, and the attachment
 * to `MeshStandardMaterial.map` — is production code in `acquireTexture()` /
 * `applyMaterialMaps()`. §FAKE-MORE-CAPABLE-THAN-REAL is respected: the fake
 * cannot satisfy any assertion below, it can only fail to.
 *
 * WATCHED RED — RUN, not asserted. Each break was applied to the SUBJECT, the
 * suite executed, and the failing test names recorded here:
 *
 *   RED-A  remove `stampMetreUvs(geo)` from `buildSlabGeometry`
 *          -> 1 failed / 14 passed. Only the declaration test falls, which is
 *             right: the slab passes `UV_METRES` itself because it KNOWS its own
 *             geometry; the stamp exists for consumers that do not.
 *   RED-B  `deriveTextureRepeat`'s metres arm returns `[1, 1]`
 *          -> 2 failed / 13 passed: the repeat test and the two-scales test.
 *   RED-C  the builder attaches no maps at all — the PRE-LANE state, the one
 *          C100 §10.6 measured
 *          -> 9 failed / 6 passed, including THE FOUNDER CLAIM.
 *
 * ⭐ RED-C is the one that matters: it is not a synthetic break, it is the code
 * as it stood this morning, and this suite fails on it.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { projectMaterialRecord } from '@pryzm/core-app-model/material-library';
import {
    registerTextureLoader,
    disposeMaterialTextures,
    clearMaterialTextureDiagnostics,
    materialTextureDiagnostics,
    materialTextureCacheSize,
    resolveMaterialTextures,
    UV_NONE,
    uvSpaceOfGeometry,
} from '@pryzm/core-app-model/material-resolver';
import type { MaterialRecord } from '@pryzm/schemas/materials';
import { SlabFragmentBuilder } from '../src/SlabFragmentBuilder';
import type { SlabData } from '../src/SlabTypes';

const bim = { getLevelById: () => ({ id: 'L0', elevation: 0 }) } as never;

/** The product under test: a 1.2 m herringbone oak parquet panel. */
const PARQUET: MaterialRecord = {
    source: 'builtin',
    id: 'test-oak-parquet-herringbone',
    label: 'Wood · Oak Parquet Herringbone (test)',
    category: 'Wood',
    color: '#c8a96e',
    metalness: 0,
    roughness: 0.55,
    opacity: 1,
    transparent: false,
    maps: {
        color: '/textures/wood/oak-parquet-herringbone/color.png',
        normal: '/textures/wood/oak-parquet-herringbone/normal.png',
        roughness: '/textures/wood/oak-parquet-herringbone/roughness.png',
    },
    tiling: { realWorldSizeM: [1.2, 1.2] },
};

/** A 600 mm porcelain tile — same maps shape, DIFFERENT scale. */
const TILE_600: MaterialRecord = {
    ...PARQUET,
    id: 'test-porcelain-600',
    label: 'Ceramic · Porcelain 600 (test)',
    category: 'Ceramic & Tile',
    maps: { color: '/textures/tile/porcelain-600/color.png' },
    tiling: { realWorldSizeM: [0.6, 0.6] },
};

const SLAB_W = 6;
const SLAB_D = 5;

let builders: SlabFragmentBuilder[] = [];
let fetched: string[] = [];

function slabData(materialId: string): SlabData {
    return {
        id: `slab-${materialId}`, type: 'slab', levelId: 'L0',
        width: SLAB_W, depth: SLAB_D, thickness: 0.2,
        position: { x: 0, y: 0, z: 0 },
        materialId,
        polygon: [
            { x: 0, y: 0 }, { x: SLAB_W, y: 0 },
            { x: SLAB_W, y: SLAB_D }, { x: 0, y: SLAB_D },
        ],
    } as unknown as SlabData;
}

function buildWith(record: MaterialRecord): THREE.Mesh[] {
    const scene = new THREE.Scene();
    const builder = new SlabFragmentBuilder(scene, bim);
    builders.push(builder);
    // The REAL projection — the same function `STANDARD_MATERIAL_LIBRARY` is
    // built from. Not a hand-made StandardMaterialDef.
    builder.setDeps({ materialMap: new Map([[record.id, projectMaterialRecord(record)]]) });
    builder.updateSlab(slabData(record.id));

    const meshes: THREE.Mesh[] = [];
    scene.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    if (meshes.length === 0) throw new Error('no meshes in scene — the slab did not build at all');
    return meshes;
}

function stdMaterial(mesh: THREE.Mesh): THREE.MeshStandardMaterial {
    const m = mesh.material;
    if (Array.isArray(m)) throw new Error('unexpected material array on the slab body');
    return m as THREE.MeshStandardMaterial;
}

beforeEach(() => {
    fetched = [];
    disposeMaterialTextures();
    clearMaterialTextureDiagnostics();
    // The ONLY fake: the byte fetch. Registered through the production seam.
    registerTextureLoader('.png', (url, _onLoad, _onError) => {
        fetched.push(url);
        return new THREE.Texture();
    });
});

afterEach(() => {
    for (const b of builders) b.dispose();
    builders = [];
    disposeMaterialTextures();
});

describe('⭐ AT THE MESH — a parquet slab renders the texture at real-world scale', () => {

    it('THE FOUNDER CLAIM: the slab mesh material carries the colour map', () => {
        const mat = stdMaterial(buildWith(PARQUET)[0]!);
        expect(mat.map).toBeInstanceOf(THREE.Texture);
        expect(mat.normalMap).toBeInstanceOf(THREE.Texture);
        expect(mat.roughnessMap).toBeInstanceOf(THREE.Texture);
    });

    it('the repeat is 1 / realWorldSizeM — ABSOLUTE arithmetic, not the subject re-run', () => {
        const mat = stdMaterial(buildWith(PARQUET)[0]!);
        // 1.2 m panel on metre UVs -> one repetition every 1.2 uv units.
        expect(mat.map!.repeat.x).toBeCloseTo(1 / 1.2, 10);
        expect(mat.map!.repeat.y).toBeCloseTo(1 / 1.2, 10);
    });

    it('⭐ A SMALLER PRODUCT TILES MORE — the two scales are not the same value', () => {
        const parquet = stdMaterial(buildWith(PARQUET)[0]!);
        const tile = stdMaterial(buildWith(TILE_600)[0]!);
        expect(tile.map!.repeat.x).toBeCloseTo(1 / 0.6, 10);
        // 600 mm tiles at exactly twice the density of a 1.2 m panel. If the
        // repeat were surface-derived rather than product-derived, these two
        // would be EQUAL on this identically-sized slab — which is the defect
        // real-world sizing exists to prevent.
        expect(tile.map!.repeat.x).toBeCloseTo(parquet.map!.repeat.x * 2, 10);
    });

    it('⭐ THE SCALE IS INDEPENDENT OF THE SURFACE: a 6x5 m and a 12x10 m slab tile identically', () => {
        const small = stdMaterial(buildWith(PARQUET)[0]!);

        const scene = new THREE.Scene();
        const builder = new SlabFragmentBuilder(scene, bim);
        builders.push(builder);
        builder.setDeps({ materialMap: new Map([[PARQUET.id, projectMaterialRecord(PARQUET)]]) });
        const big = slabData(PARQUET.id) as unknown as Record<string, unknown>;
        big['id'] = 'slab-big';
        big['width'] = 12; big['depth'] = 10;
        big['polygon'] = [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 10 }, { x: 0, y: 10 }];
        builder.updateSlab(big as unknown as SlabData);
        const meshes: THREE.Mesh[] = [];
        scene.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
        const large = stdMaterial(meshes[0]!);

        expect(large.map!.repeat.x).toBeCloseTo(small.map!.repeat.x, 10);
        // ...and they are the SAME texture object: one upload, not one per slab.
        expect(large.map).toBe(small.map);
    });

    it('the sampler state is right — RepeatWrapping, sRGB colour, LINEAR data maps', () => {
        const mat = stdMaterial(buildWith(PARQUET)[0]!);
        expect(mat.map!.wrapS).toBe(THREE.RepeatWrapping);
        expect(mat.map!.wrapT).toBe(THREE.RepeatWrapping);
        // ⭐ The single most common PBR defect: a data map decoded as sRGB.
        expect(mat.map!.colorSpace).toBe(THREE.SRGBColorSpace);
        expect(mat.normalMap!.colorSpace).toBe(THREE.NoColorSpace);
        expect(mat.roughnessMap!.colorSpace).toBe(THREE.NoColorSpace);
    });

    it('the URL went through the ONE catalogue asset seam, and the record kept its logical path', () => {
        buildWith(PARQUET);
        expect(fetched).toContain('/textures/wood/oak-parquet-herringbone/color.png');
        // The record is untouched: the rewrite happens at fetch time so a persisted
        // project survives a bucket move (L-570).
        expect(PARQUET.maps!.color).toBe('/textures/wood/oak-parquet-herringbone/color.png');
    });

    it('ONE texture per (path x scale) — a hundred slabs do not mint a hundred uploads', () => {
        buildWith(PARQUET);
        const afterFirst = materialTextureCacheSize();
        for (let i = 0; i < 5; i++) buildWith(PARQUET);
        expect(materialTextureCacheSize()).toBe(afterFirst);
        // 3 channels fetched once each, never re-fetched.
        expect(fetched).toHaveLength(3);
    });
});

describe('⭐ THE GEOMETRY — the slab body carries uv, and the units are METRES', () => {

    it('the slab body has a uv attribute at all (it had none before L-1703)', () => {
        const geo = buildWith(PARQUET)[0]!.geometry;
        const uv = geo.getAttribute('uv');
        expect(uv).toBeDefined();
        expect(uv.count).toBe(geo.getAttribute('position').count);
    });

    it('⭐ the builder DECLARES the uv space, so a downstream re-materialiser need not guess', () => {
        const geo = buildWith(PARQUET)[0]!.geometry;
        // The stamp is what makes initUI's style sweep and the property
        // inspector safe: they re-material meshes they did not build.
        expect(uvSpaceOfGeometry(geo)).toEqual({ kind: 'metres' });
        // ...and an UNSTAMPED geometry refuses, rather than guessing.
        expect(uvSpaceOfGeometry(new THREE.BufferGeometry())).toEqual({ kind: 'none' });
    });

    it('the cap uv spans the slab in METRES, not 0..1', () => {
        const geo = buildWith(PARQUET)[0]!.geometry;
        const uv = geo.getAttribute('uv');
        let maxU = -Infinity, maxV = -Infinity;
        for (let i = 0; i < uv.count; i++) {
            maxU = Math.max(maxU, uv.getX(i));
            maxV = Math.max(maxV, uv.getY(i));
        }
        // A 6 x 5 m slab. 0..1 UVs would cap both at 1; metres reach the slab's
        // own dimensions (plus the small SLAB_WALL_OUTSET, and the perimeter run
        // on the edge band, so this is a floor rather than an equality).
        expect(maxU).toBeGreaterThan(SLAB_W - 0.5);
        expect(maxV).toBeGreaterThan(SLAB_D - 0.5);
    });
});

describe('⭐ C100 §5 — no silent fallback: the four outcomes are four values', () => {

    it('"no maps" is not a failure and produces no diagnostic', () => {
        const plain: MaterialRecord = { ...PARQUET, id: 'p', maps: undefined, tiling: undefined };
        expect(resolveMaterialTextures(plain, { kind: 'metres' })).toEqual({ state: 'no-maps' });
        expect(materialTextureDiagnostics()).toEqual([]);
    });

    it('a surface with NO uvs REFUSES the maps and names why — it does not paint texel (0,0)', () => {
        const r = resolveMaterialTextures(PARQUET, UV_NONE);
        expect(r.state).toBe('no-uvs');
        if (r.state !== 'no-uvs') throw new Error('unreachable');
        expect(r.reason).toContain('no uv attribute');
    });

    it('maps without a tiling is INVALID, and distinguishable from both of the above', () => {
        const broken = { ...PARQUET, id: 'broken', tiling: undefined };
        const r = resolveMaterialTextures(broken, { kind: 'metres' });
        expect(r.state).toBe('invalid');
        if (r.state !== 'invalid') throw new Error('unreachable');
        expect(r.reason).toContain('tiling');
    });

    it('an UNLOADABLE format is a NAMED, deduplicated diagnostic — and the base colour still renders', () => {
        const ktx: MaterialRecord = {
            ...PARQUET,
            id: 'ktx',
            maps: { color: '/textures/x/color.ktx2' },
        };
        const mat = stdMaterial(buildWith(ktx)[0]!);
        // The pattern is missing...
        expect(mat.map ?? null).toBeNull();
        // ...the material still renders, from its own colour — never a crash and
        // never a substituted texture.
        expect(`#${mat.color.getHexString()}`).toBe(PARQUET.color);
        // ...and the failure is NAMED, once, with the path.
        const diags = materialTextureDiagnostics();
        expect(diags).toHaveLength(1);
        expect(diags[0]!.path).toBe('/textures/x/color.ktx2');
        expect(diags[0]!.reason).toContain('.ktx2');
    });

    it('the diagnostic is emitted ONCE PER PATH, never once per element', () => {
        const ktx: MaterialRecord = { ...PARQUET, id: 'ktx2', maps: { color: '/textures/y/c.ktx2' } };
        for (let i = 0; i < 4; i++) buildWith(ktx);
        expect(materialTextureDiagnostics()).toHaveLength(1);
    });
});
