/**
 * @vitest-environment happy-dom
 */
/**
 * ⭐ §ROOF-SLOPE-METRE-UVS — C100 §10.16 (slice S34) — THE MESH-LEVEL PROOF.
 *
 * Founder: *"[dark roof shingles] I want this tiling by default on my roofs."*
 *
 * ── WHY EVERY ASSERTION READS A `THREE.Mesh` OUT OF A `THREE.Scene` ─────────
 *
 * §COMMITTED-IS-NOT-REACHABLE, and this slice has the receipts before it starts.
 * C100 §10.15.f measured `RoofFragmentBuilder.ts:197` passing `uvSpaceOfGeometry(
 * null)` — literally `null` — so a suite asserting `computeSlopeMetreUvs()`
 * returns nice numbers would have gone green on a build where every roof in
 * every project still refused its maps. The claim under test is therefore the
 * one the founder can see:
 *
 *   A ROOF CARRYING A SHINGLE RENDERS A MESH WHOSE SHINGLE MATERIAL HOLDS THE
 *   TEXTURE, AT THE PRODUCT'S REAL-WORLD SIZE, ON GEOMETRY WHOSE UVs MEASURE
 *   METRES UP THE RAFTER AND NOT ACROSS THE PLAN.
 *
 * ── THE ORACLE CANNOT MOVE WITH THE SUBJECT ─────────────────────────────────
 *
 * The pitch arithmetic is written out absolutely (`4 * Math.SQRT2`), never
 * derived by calling the subject. §CONFIDENT-REGISTER-ROWS: a control that asks
 * the code under test for its own expectation cannot fail. The `realWorldSizeM`
 * is READ FROM `MATERIAL_CATALOG`, never transcribed, so a row edit cannot leave
 * a stale number here passing.
 *
 * ── WHAT IS FAKED, AND WHY IT IS NOT THE SUBJECT ────────────────────────────
 *
 * Only the BYTE FETCH, through the production registration seam
 * (`registerTextureLoader`), exactly as the slab twin does. Everything after the
 * fetch — repeat, wrap, colour space, sharing, and the attachment to
 * `MeshStandardMaterial.map` — is production code. §FAKE-MORE-CAPABLE-THAN-REAL:
 * the fake cannot satisfy one assertion below, it can only fail to.
 *
 * ── WATCHED RED — RUN, NOT ASSERTED (see the commit body for the raw output) ─
 *
 *   RED-A  revert `RoofFragmentBuilder` to `uvSpaceOfGeometry(null)`
 *          -> the founder claim, the repeat, the course-count and the
 *             two-scales tests fall. This is the code as it stood this morning.
 *   RED-B  make the frame's `s` axis the PLAN projection (`(x, z)` on every
 *          face) — the "cheap fix" C100 §10.15.f names as a trap
 *          -> the isometry test falls on every pitched roof type, and the 45°
 *             rafter reads 4.000 m instead of 5.657 m.
 *   RED-C  drop the `sourceOf` copy and recompute normals after the split
 *          -> the bit-identical-soup test falls.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { projectMaterialRecord } from '@pryzm/core-app-model/material-library';
import {
    registerTextureLoader,
    disposeMaterialTextures,
    clearMaterialTextureDiagnostics,
    uvSpaceOfGeometry,
} from '@pryzm/core-app-model/material-resolver';
import { MATERIAL_CATALOG, type MaterialRecord } from '@pryzm/schemas/materials';
import {
    getFrameScheduler,
    _resetFrameSchedulerForTest,
    FakeRafAdapter,
} from '@pryzm/frame-scheduler';
import { RoofFragmentBuilder } from '../src/RoofFragmentBuilder';
import { RoofGeometryBuilder } from '../src/RoofGeometryBuilder';
import { applySlopeMetreUvs } from '../src/roofSlopeUvs';
import type { RoofData, RoofType } from '../src/RoofTypes';

// ─────────────────────────────────────────────────────────────────────────────
// THE PRODUCT, READ FROM THE MASTER
// ─────────────────────────────────────────────────────────────────────────────

/** The founder's row. Its scale is READ, never transcribed. */
const CHARCOAL_ID = 'roof-shingle-asphalt-charcoal';
const charcoalRow = MATERIAL_CATALOG.find(m => m.id === CHARCOAL_ID);
if (!charcoalRow) throw new Error(`${CHARCOAL_ID} is not in MATERIAL_CATALOG`);
const [TILE_W, TILE_H] = charcoalRow.tiling!.realWorldSizeM;

/**
 * The founder's charcoal shingle, with its `procedural:` maps swapped for
 * `.png` paths.
 *
 * ⚠ WHY THE SWAP IS NOT A CHEAT, AND WHY IT IS ALSO A FINDING. C100 §10.10.c
 * measured runtime procedural generation OFF (`__pryzmProceduralTexturesV1`, at
 * 150–830 ms of blocked main thread per pattern), so the shipped charcoal row
 * resolves to its authored colour today for a reason that has nothing to do with
 * UVs. THIS slice owns exactly one of the mechanisms in series (§THREE-
 * INVALIDATION-GATES-IN-SERIES); the file-backed swap isolates it, and the
 * SCALE — the number this suite is actually about — is the row's own.
 */
const CHARCOAL_SHINGLE: MaterialRecord = {
    ...charcoalRow,
    id: 'test-roof-shingle-asphalt-charcoal',
    maps: {
        color:     '/textures/roof/shingle-charcoal/color.png',
        normal:    '/textures/roof/shingle-charcoal/normal.png',
        roughness: '/textures/roof/shingle-charcoal/roughness.png',
    },
};

/** A DIFFERENT product size, so "the repeat tracks the product" is falsifiable. */
const CEDAR_ID = 'roof-shingle-cedar';
const cedarRow = MATERIAL_CATALOG.find(m => m.id === CEDAR_ID);
if (!cedarRow) throw new Error(`${CEDAR_ID} is not in MATERIAL_CATALOG`);
const [CEDAR_W, CEDAR_H] = cedarRow.tiling!.realWorldSizeM;
const CEDAR_SHINGLE: MaterialRecord = {
    ...cedarRow,
    id: 'test-roof-shingle-cedar',
    maps: { color: '/textures/roof/shingle-cedar/color.png' },
};

// ─────────────────────────────────────────────────────────────────────────────
// THE ROOF — a 45° gable whose rafter length is known by hand
// ─────────────────────────────────────────────────────────────────────────────

const SPAN_X = 10;          // eave-to-eave along the ridge
const SPAN_Z = 8;           // gable span; the ridge sits at z = 4
const HALF_SPAN = SPAN_Z / 2;
const SLOPE = 1.0;          // rise/run = 1 -> 45°
const RIDGE_H = HALF_SPAN * SLOPE;              // 4 m
/** ⭐ The number this whole slice is about: the RAFTER, not the run. */
const RAFTER = HALF_SPAN * Math.SQRT2;          // 5.65685… m
/** ⛔ What the "cheap" plan projection would have measured instead. */
const PLAN_RUN = HALF_SPAN;                      // 4 m

const rect = (w: number, d: number): Array<[number, number]> =>
    [[0, 0], [w, 0], [w, d], [0, d]];

function roofData(over: Partial<RoofData> = {}): RoofData {
    return {
        id:         'roof-uv-1',
        type:       'roof',
        levelId:    'L0',
        roofType:   'gable',
        footprint:  { polygon: rect(SPAN_X, SPAN_Z), centroid: [0, 0] },
        slope:      SLOPE,
        overhang:   0,
        baseOffset: 0,
        thickness:  0.2,
        properties: {},
        ...over,
    } as unknown as RoofData;
}

const bim = { getLevelById: () => ({ id: 'L0', elevation: 0 }) } as never;

// ─────────────────────────────────────────────────────────────────────────────
// HARNESS
// ─────────────────────────────────────────────────────────────────────────────

let builders: RoofFragmentBuilder[] = [];
let raf: FakeRafAdapter;

/** Drives the REAL public path: enqueue, then pump the real FrameScheduler. */
function buildRoof(data: RoofData, record?: MaterialRecord): THREE.Mesh {
    const scene = new THREE.Scene();
    const map = record
        ? new Map([[record.id, projectMaterialRecord(record)]])
        : undefined;
    const builder = new RoofFragmentBuilder(scene, bim, undefined, map as never);
    builders.push(builder);
    builder.updateRoof(data);
    raf.pumpFrames(4);

    let mesh: THREE.Mesh | null = null;
    scene.traverse(o => { if ((o as THREE.Mesh).isMesh && !mesh) mesh = o as THREE.Mesh; });
    if (!mesh) throw new Error('no mesh in the scene — the roof did not build at all');
    return mesh;
}

/** The shingle slot (§2.5 slot 3) off a built roof mesh. */
function shingleMat(mesh: THREE.Mesh): THREE.MeshStandardMaterial {
    const mats = mesh.material as THREE.Material[];
    expect(Array.isArray(mats), 'a roof mesh carries the four-slot material array').toBe(true);
    return mats[3] as THREE.MeshStandardMaterial;
}

interface Tri { p: number[][]; uv: number[][] }

/** Triangles of one material slot, with their positions and UVs. */
function trianglesOfSlot(geo: THREE.BufferGeometry, slot: number): Tri[] {
    const pos = geo.getAttribute('position');
    const uv  = geo.getAttribute('uv');
    const idx = geo.getIndex();
    if (!idx) throw new Error('geometry is not indexed');
    const out: Tri[] = [];
    for (const g of geo.groups) {
        if (g.materialIndex !== slot) continue;
        for (let i = g.start; i < g.start + g.count; i += 3) {
            const tri: Tri = { p: [], uv: [] };
            for (let k = 0; k < 3; k++) {
                const v = idx.getX(i + k);
                tri.p.push([pos.getX(v), pos.getY(v), pos.getZ(v)]);
                tri.uv.push(uv ? [uv.getX(v), uv.getY(v)] : [NaN, NaN]);
            }
            out.push(tri);
        }
    }
    return out;
}

/** The full rendered triangle soup — position AND normal, in draw order. */
function soup(geo: THREE.BufferGeometry): number[] {
    const pos = geo.getAttribute('position');
    const nrm = geo.getAttribute('normal');
    const idx = geo.getIndex()!;
    const out: number[] = [];
    for (let i = 0; i < idx.count; i++) {
        const v = idx.getX(i);
        out.push(pos.getX(v), pos.getY(v), pos.getZ(v));
        if (nrm) out.push(nrm.getX(v), nrm.getY(v), nrm.getZ(v));
    }
    return out;
}

const dist3 = (a: number[], b: number[]): number =>
    Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
const dist2 = (a: number[], b: number[]): number =>
    Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);

/**
 * ⭐ THE CORRECTNESS PREDICATE, stated once.
 *
 * The uv map must be an ISOMETRY of each face: one metre travelled on the roof
 * is one unit travelled in uv, in EVERY direction. A plan projection satisfies
 * this along the eave and fails it up the rafter by exactly cos(pitch) — which
 * is the defect C100 §10.15.f named and the reason this is asserted edge by
 * edge rather than as a single span.
 */
function assertIsometric(tris: Tri[], label: string): void {
    expect(tris.length, `${label}: no triangles in the slot`).toBeGreaterThan(0);
    let checked = 0;
    for (const t of tris) {
        for (const [a, b] of [[0, 1], [1, 2], [2, 0]] as const) {
            const d3 = dist3(t.p[a]!, t.p[b]!);
            if (d3 < 1e-6) continue;                 // degenerate edge, no claim
            const d2 = dist2(t.uv[a]!, t.uv[b]!);
            expect(
                Math.abs(d2 - d3) / d3,
                `${label}: uv edge ${d2.toFixed(6)} m vs surface edge ${d3.toFixed(6)} m`,
            ).toBeLessThan(1e-3);
            checked++;
        }
    }
    expect(checked, `${label}: nothing was actually measured`).toBeGreaterThan(0);
}

beforeEach(() => {
    _resetFrameSchedulerForTest();
    raf = new FakeRafAdapter();
    getFrameScheduler().start(raf);
    disposeMaterialTextures();
    clearMaterialTextureDiagnostics();
    // The ONLY fake: the byte fetch, through the production seam.
    registerTextureLoader('.png', () => new THREE.Texture());
});

afterEach(() => {
    for (const b of builders) b.clearProjectGeometry();
    builders = [];
    disposeMaterialTextures();
    _resetFrameSchedulerForTest();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('⭐ AT THE MESH — a 45° roof tiles a shingle at its real-world size', () => {

    it('THE FOUNDER CLAIM: the shingle slot on the roof mesh carries the maps', () => {
        const mat = shingleMat(buildRoof(roofData({ materialId: CHARCOAL_SHINGLE.id }), CHARCOAL_SHINGLE));
        expect(mat.map).toBeInstanceOf(THREE.Texture);
        expect(mat.normalMap).toBeInstanceOf(THREE.Texture);
        expect(mat.roughnessMap).toBeInstanceOf(THREE.Texture);
    });

    it('the geometry DECLARES metres — the stamp, not a heuristic', () => {
        const mesh = buildRoof(roofData({ materialId: CHARCOAL_SHINGLE.id }), CHARCOAL_SHINGLE);
        expect(mesh.geometry.getAttribute('uv')).toBeTruthy();
        expect(uvSpaceOfGeometry(mesh.geometry).kind).toBe('metres');
    });

    it('the repeat is 1 / realWorldSizeM — ABSOLUTE arithmetic, the master\'s own scale', () => {
        const mat = shingleMat(buildRoof(roofData({ materialId: CHARCOAL_SHINGLE.id }), CHARCOAL_SHINGLE));
        expect(mat.map!.repeat.x).toBeCloseTo(1 / TILE_W, 10);
        expect(mat.map!.repeat.y).toBeCloseTo(1 / TILE_H, 10);
    });

    it('⭐ A DIFFERENT PRODUCT TILES DIFFERENTLY on the identical roof', () => {
        const charcoal = shingleMat(buildRoof(roofData({ id: 'r-a', materialId: CHARCOAL_SHINGLE.id }), CHARCOAL_SHINGLE));
        const cedar    = shingleMat(buildRoof(roofData({ id: 'r-b', materialId: CEDAR_SHINGLE.id }), CEDAR_SHINGLE));
        expect(cedar.map!.repeat.x).toBeCloseTo(1 / CEDAR_W, 10);
        expect(cedar.map!.repeat.y).toBeCloseTo(1 / CEDAR_H, 10);
        // If the repeat were derived from the SURFACE rather than the PRODUCT,
        // these two would be equal on this identically-sized roof — C100 §10.9.a's
        // whole reason for real-world sizing.
        expect(cedar.map!.repeat.y).not.toBeCloseTo(charcoal.map!.repeat.y, 6);
    });

    it('⛔⭐ THE PITCH PROOF: the up-slope uv edge measures the RAFTER (5.657 m), not the RUN (4 m)', () => {
        const mesh = buildRoof(roofData({ materialId: CHARCOAL_SHINGLE.id }), CHARCOAL_SHINGLE);
        const tris = trianglesOfSlot(mesh.geometry, 3);

        // The pure eave->ridge edge of the south slope: Δ = (0, +4, +4).
        let measured: number | null = null;
        for (const t of tris) {
            for (const [a, b] of [[0, 1], [1, 2], [2, 0]] as const) {
                const dx = Math.abs(t.p[a]![0]! - t.p[b]![0]!);
                const dy = Math.abs(t.p[a]![1]! - t.p[b]![1]!);
                const dz = Math.abs(t.p[a]![2]! - t.p[b]![2]!);
                if (dx < 1e-6 && Math.abs(dy - RIDGE_H) < 1e-6 && Math.abs(dz - HALF_SPAN) < 1e-6) {
                    measured = dist2(t.uv[a]!, t.uv[b]!);
                }
            }
        }
        expect(measured, 'no eave->ridge edge found on the shingle slot').not.toBeNull();
        // 4 m of rise over 4 m of run is 5.65685… m of rafter. Hand arithmetic.
        expect(measured!).toBeCloseTo(RAFTER, 4);
        expect(
            Math.abs(measured! - PLAN_RUN),
            'a plan projection would have measured 4 m here — that is the 41 % error',
        ).toBeGreaterThan(1.5);
    });

    it('⭐ THE COURSE COUNT THE FOUNDER SEES: 41 % more courses up a 45° rafter than a plan projection gives', () => {
        const mesh = buildRoof(roofData({ materialId: CHARCOAL_SHINGLE.id }), CHARCOAL_SHINGLE);
        const mat  = shingleMat(mesh);
        // Texture repetitions between eave and ridge = rafter / tile height.
        const repeatsUpSlope = RAFTER * mat.map!.repeat.y;
        const repeatsIfPlan  = PLAN_RUN * mat.map!.repeat.y;
        expect(repeatsUpSlope / repeatsIfPlan).toBeCloseTo(Math.SQRT2, 6);
        expect(repeatsUpSlope).toBeCloseTo(RAFTER / TILE_H, 6);
    });

    it('the whole shingle surface is ISOMETRIC — every edge, not just the one measured above', () => {
        const mesh = buildRoof(roofData({ materialId: CHARCOAL_SHINGLE.id }), CHARCOAL_SHINGLE);
        assertIsometric(trianglesOfSlot(mesh.geometry, 3), 'gable shingle');
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('⭐ ALL TEN GENERATOR ENTRY POINTS — do all ten, or say which', () => {

    /**
     * The ten `RoofGeometryBuilder` entry points C100 §10.15.f sized S34 against.
     * Each row names the DATA that routes to it, so a routing change breaks the
     * test rather than silently retargeting it.
     */
    const TEN: Array<{ name: string; data: RoofData }> = [
        { name: 'flat',             data: roofData({ roofType: 'flat' }) },
        { name: 'shed',             data: roofData({ roofType: 'shed' }) },
        { name: 'gable',            data: roofData({ roofType: 'gable' }) },
        { name: 'hip',              data: roofData({ roofType: 'hip' }) },
        { name: 'dutch-hip',        data: roofData({ roofType: 'dutch' }) },
        { name: 'gambrel',          data: roofData({ roofType: 'gambrel' }) },
        { name: 'mansard',          data: roofData({ roofType: 'mansard' }) },
        {
            name: 'segmented (merge path)',
            data: roofData({
                roofType: 'gable',
                segments: [
                    { subPolygon: { polygon: rect(6, 8), centroid: [0, 0] }, roofType: 'gable' },
                    { subPolygon: { polygon: [[6, 0], [10, 0], [10, 8], [6, 8]], centroid: [0, 0] }, roofType: 'flat' },
                ],
            } as unknown as Partial<RoofData>),
        },
        {
            // Concave L -> §ROOF-CONCAVE-DECOMPOSE, one gable per wing, merged.
            name: 'concave-pitched (L wing decomposition)',
            data: roofData({
                roofType: 'gable',
                footprint: { polygon: [[0, 0], [10, 0], [10, 4], [4, 4], [4, 8], [0, 8]], centroid: [0, 0] },
            } as unknown as Partial<RoofData>),
        },
        {
            // >8 convex vertices -> §ROOF-ENGINE-STAGE-1 general offset builder.
            name: 'general-pitched (ring stack)',
            data: roofData({
                roofType: 'hip',
                footprint: {
                    polygon: Array.from({ length: 12 }, (_, i) => {
                        const a = (i / 12) * Math.PI * 2;
                        return [5 + 5 * Math.cos(a), 4 + 4 * Math.sin(a)] as [number, number];
                    }),
                    centroid: [0, 0],
                },
            } as unknown as Partial<RoofData>),
        },
    ];

    for (const { name, data } of TEN) {
        it(`${name} — declares metres and its shingle surface is ISOMETRIC`, () => {
            const mesh = buildRoof({ ...data, id: `roof-${name}`, materialId: CHARCOAL_SHINGLE.id }, CHARCOAL_SHINGLE);
            const geo = mesh.geometry;
            expect(geo.getAttribute('uv'), `${name}: no uv attribute`).toBeTruthy();
            expect(uvSpaceOfGeometry(geo).kind, `${name}: undeclared uv space`).toBe('metres');
            assertIsometric(trianglesOfSlot(geo, 3), name);
            // And the material actually took the maps on THIS form.
            expect(shingleMat(mesh).map, `${name}: no map bound`).toBeInstanceOf(THREE.Texture);
        });
    }

    it('⛔ BARREL REFUSES BY NAME — no uv, no stamp, no map, and it says why', () => {
        const mesh = buildRoof(
            roofData({ id: 'roof-barrel', roofType: 'barrel', materialId: CHARCOAL_SHINGLE.id }),
            CHARCOAL_SHINGLE,
        );
        expect(mesh.geometry.getAttribute('uv')).toBeFalsy();
        expect(uvSpaceOfGeometry(mesh.geometry).kind).toBe('none');
        expect(String(mesh.geometry.userData.pryzmUvRefusal)).toMatch(/barrel/i);
        // ⭐ The refusal reaches the PIXEL as a flat colour, not as a wrong pattern.
        expect(shingleMat(mesh).map ?? null).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('⛔ NO GRAPHICS REGRESSION — a roof with no texture renders exactly as before', () => {

    /**
     * ⭐ The public per-form statics do NOT run the uv pass (it lives at
     * `generate()`), so `generateGable(data)` IS the pre-slice geometry and
     * `generate(data)` is the post-slice one. Comparing their expanded soups
     * compares this slice against the code it replaced, on real roof geometry,
     * float for float.
     */
    const FORMS: Array<[string, (d: RoofData) => THREE.BufferGeometry, RoofType]> = [
        ['flat',    d => RoofGeometryBuilder.generateFlat(d),      'flat'],
        ['shed',    d => RoofGeometryBuilder.generateShed(d),      'shed'],
        ['gable',   d => RoofGeometryBuilder.generateGable(d),     'gable'],
        ['hip',     d => RoofGeometryBuilder.generateHip(d),       'hip'],
        ['dutch',   d => RoofGeometryBuilder.generateDutchHip(d),  'dutch'],
        ['gambrel', d => RoofGeometryBuilder.generateGambrel(d),   'gambrel'],
        ['mansard', d => RoofGeometryBuilder.generateMansard(d),   'mansard'],
    ];

    for (const [name, raw, type] of FORMS) {
        it(`${name}: the rendered triangle soup — positions AND normals — is bit-identical`, () => {
            const d = roofData({ roofType: type });
            const before = soup(raw(d));
            const after  = soup(RoofGeometryBuilder.generate(d));
            expect(after.length).toBe(before.length);
            expect(after).toEqual(before);
        });
    }

    it('the material groups still cover exactly the same index ranges', () => {
        const d = roofData({ roofType: 'hip' });
        const before = RoofGeometryBuilder.generateHip(d).groups.map(g => [g.start, g.count, g.materialIndex]);
        const after  = RoofGeometryBuilder.generate(d).groups.map(g => [g.start, g.count, g.materialIndex]);
        expect(after).toEqual(before);
    });

    it('a roof with NO material renders the flat colour it always did, with no map', () => {
        const mat = shingleMat(buildRoof(roofData({ id: 'roof-plain' })));
        expect(mat.map ?? null).toBeNull();
        // ⚠ D — the DEFAULT IS NOT THIS SLICE'S. C100 §10.15.f: `DEFAULT_SHINGLE`
        // applies retroactively to every roof carrying no explicit colour, so
        // changing it restyles every existing project. Pinned so a future lane
        // has to change it on purpose, in a commit that says so.
        expect('#' + mat.color.getHexString()).toBe('#c8a46e');
    });

    it('⭐ the split copies its source — a duplicated vertex is not a recomputed one', () => {
        // A folded pair of triangles sharing one edge: the shared vertices must
        // split (two frames) and their normals must survive the split verbatim.
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([
            0, 0, 0,   4, 0, 0,   4, 0, 4,   0, 0, 4,   // horizontal quad
            0, 3, 8,   4, 3, 8,                          // fold up and away
        ], 3));
        geo.setIndex([0, 1, 2, 0, 2, 3, 3, 2, 5, 3, 5, 4]);
        geo.computeVertexNormals();
        geo.addGroup(0, 12, 3);
        const before = soup(geo);

        const outcome = applySlopeMetreUvs(geo);
        expect(outcome.applied).toBe(true);
        expect(outcome.applied && outcome.frames).toBe(2);
        expect(outcome.applied && outcome.splitVertices).toBeGreaterThan(0);
        expect(soup(geo)).toEqual(before);
        assertIsometric(trianglesOfSlot(geo, 3), 'folded pair');
    });

    it('⭐ a continuous slope is NOT split — one plane, one frame, no seam', () => {
        const geo = new THREE.BufferGeometry();
        // Two coplanar triangles of one 30° slope.
        geo.setAttribute('position', new THREE.Float32BufferAttribute([
            0, 0, 0,   4, 0, 0,   4, 2, 4,   0, 2, 4,
        ], 3));
        geo.setIndex([0, 1, 2, 0, 2, 3]);
        geo.computeVertexNormals();
        geo.addGroup(0, 6, 3);

        const outcome = applySlopeMetreUvs(geo);
        expect(outcome.applied && outcome.frames).toBe(1);
        expect(outcome.applied && outcome.splitVertices).toBe(0);
        assertIsometric(trianglesOfSlot(geo, 3), 'single plane');
    });

    it('refuses a geometry that already declares uv, rather than overwriting it', () => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 0, 1], 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1], 2));
        geo.setIndex([0, 1, 2]);
        const outcome = applySlopeMetreUvs(geo);
        expect(outcome.applied).toBe(false);
        expect(!outcome.applied && outcome.reason).toMatch(/already declares uv/);
    });
});
