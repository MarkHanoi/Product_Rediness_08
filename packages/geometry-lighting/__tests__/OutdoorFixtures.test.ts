/**
 * §OUTDOOR112 (2026-08-26) — the founder's five OUTDOOR SITE fixtures, each by
 * its DECIDED resolution, and the performance/photometry claims made for them.
 *
 * *"create outdoor lighting LOD 300 — fully compliant with the contract and
 * absolutely sound and performance proven: 1. small floor-based light /
 * 2. also floor-based lighting + lumen / 3. floor-based lighting /
 * 4. floor-based lighting / and last one modern tall floor-based lighting."*
 *
 * THE RESOLUTIONS (the decisions ARE what this suite pins — a suite that only
 * checked "it renders" would pass for five hand-written families too):
 *
 *   #1 globe mini-bollard  → NEW ROW `bollard_globe_mini`  · NEW archetype `globe_post` (louvres 3)
 *   #2 louvred bollard     → NEW ROW `bollard_louvred`     · NEW archetype `bollard` (louvres 4)
 *   #3 diffuser bollard    → NEW ROW `bollard_diffuser`    · SAME archetype `bollard` (louvres 0) — C84 EI-9
 *   #4 globe post light    → NEW ROW `globe_post_light`    · SAME archetype `globe_post` (lamp inside)
 *   #5 street luminaire    → NEW ROW `street_area_luminaire` · NEW archetype `street_arm`
 *
 * Three archetypes for five fixtures: the two head-detail pairs share a mass
 * with a row field (`louvres`), exactly as `endChamferMm` and `canopyMm` did.
 *
 * Run against the REAL builder, the REAL matrix and the REAL material
 * catalogue — a fake built from the header cannot falsify the header.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { LightingFragmentBuilder, LENS_ROLE } from '../src/LightingFragmentBuilder';
import type { LightingData, LightingFixtureType } from '../src/LightingTypes';
import { FLOOR_MOUNTED_FIXTURES } from '../src/LightingTypes';
import { BUILT_IN_LIGHTING_TYPES } from '../src/LightingTypeDefinitions';
import {
    lod200Row, efficacyClassFor, efficacyLmPerW, EFFICACY_BANDS,
    lod200BodyAppearance, minIpForLocation,
} from '@pryzm/core-app-model/lod200-fixtures';

const g = globalThis as unknown as { window?: unknown };

const FIVE = {
    globeMini:  { n: 1, id: 'bollard_globe_mini',     archetype: 'globe_post', louvres: 3 },
    louvred:    { n: 2, id: 'bollard_louvred',        archetype: 'bollard',    louvres: 4 },
    diffuser:   { n: 3, id: 'bollard_diffuser',       archetype: 'bollard',    louvres: 0 },
    globePost:  { n: 4, id: 'globe_post_light',       archetype: 'globe_post', louvres: 0 },
    street:     { n: 5, id: 'street_area_luminaire',  archetype: 'street_arm', louvres: 0 },
} as const;

const IDS = Object.values(FIVE).map((f) => f.id);

/**
 * ⚠ MESH BUDGET — the number a run of twenty bollards is judged by. The
 * builder's `_consolidateFixtureMeshes` (§MESH110) collapses every
 * same-material body part into one mesh; the luminous parts stay separate.
 * Bollard/street = 2, globe post = 2 (louvre stack) or 3 (lamp inside).
 */
const MESH_BUDGET = 3;
/** Triangle ceiling per fixture — generous, so a 24-segment sphere passes but a runaway does not. */
const TRI_CEILING = 8000;

function build(
    type: string,
    opts: { id?: string; x?: number; builder?: LightingFragmentBuilder; scene?: THREE.Scene } = {},
): { b: LightingFragmentBuilder; scene: THREE.Scene; root: THREE.Object3D } {
    const id = opts.id ?? `o-${type}`;
    const scene = opts.scene ?? new THREE.Scene();
    const b = opts.builder ?? new LightingFragmentBuilder();
    if (!opts.builder) b.setScene(scene);
    const data: LightingData = {
        id, type: 'lighting', levelId: 'L1',
        fixtureType: type as LightingFixtureType,
        position: { x: opts.x ?? 0, y: 0, z: 0 },   // floor-seated: base point ON the ground
    };
    b.add(data);
    return { b, scene, root: scene.children.find((c) => c.userData?.id === id)! };
}

function meshes(o: THREE.Object3D): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    o.traverse((n) => { if ((n as THREE.Mesh).isMesh) out.push(n as THREE.Mesh); });
    return out;
}
function lenses(o: THREE.Object3D): THREE.Mesh[] {
    return meshes(o).filter((m) => m.userData.role === LENS_ROLE);
}
function lightsIn(o: THREE.Object3D): THREE.Light[] {
    const out: THREE.Light[] = [];
    o.traverse((n) => { if ((n as THREE.Light).isLight) out.push(n as THREE.Light); });
    return out;
}
function triangles(o: THREE.Object3D): number {
    let t = 0;
    for (const m of meshes(o)) {
        const geo = m.geometry as THREE.BufferGeometry;
        t += geo.index ? geo.index.count / 3 : (geo.attributes.position?.count ?? 0) / 3;
    }
    return Math.round(t);
}
/** The fixture's own extent, in ITS frame (never world — the L-11505 frame lesson). */
function localBox(o: THREE.Object3D): THREE.Box3 {
    const box = new THREE.Box3().setFromObject(o);
    return box.translate(new THREE.Vector3(-o.position.x, -o.position.y, -o.position.z));
}

describe('§OUTDOOR112 — the five resolve to rows, and five fixtures cost THREE archetypes', () => {
    it('each of the five has a matrix row on its decided archetype, floor-mounted, exterior', () => {
        for (const [key, f] of Object.entries(FIVE)) {
            const row = lod200Row(f.id);
            expect(row, `#${f.n} ${key} has no matrix row`).toBeDefined();
            expect(row!.archetype, `#${f.n} ${key} archetype`).toBe(f.archetype);
            expect(row!.mount, `#${f.n} ${key} stands on the ground`).toBe('floor');
            expect(row!.location, `#${f.n} ${key} is a site fixture`).toBe('exterior');
            expect(row!.louvres ?? 0, `#${f.n} ${key} louvre count`).toBe(f.louvres);
            // DERIVED, never re-listed: the seating set reads the matrix.
            expect(FLOOR_MOUNTED_FIXTURES.has(f.id as never), `#${f.n} seats on the floor plane`).toBe(true);
            // Reachable: the registry the palette derives from carries it.
            expect(BUILT_IN_LIGHTING_TYPES.some((t) => t.id === f.id), `#${f.n} in the registry`).toBe(true);
        }
        // ⭐ THE C84 EI-9 CLAIM: #2/#3 and #1/#4 are head DETAILS of one mass each.
        expect(new Set(IDS.map((id) => lod200Row(id)!.archetype)).size).toBe(3);
    });

    it('the pre-existing `bollard_light` keeps its `post` archetype — untouched by the new bollard mass', () => {
        expect(lod200Row('bollard_light')!.archetype).toBe('post');
    });
});

describe('§OUTDOOR112 — photometry: real values with a stated basis, judged in the right band', () => {
    it('every row sits inside the lm/W band its CONSTRUCTION derives — bollard/globe decorative, street architectural', () => {
        for (const id of IDS) {
            const row = lod200Row(id)!;
            const cls = efficacyClassFor(row);
            const [lo, hi] = EFFICACY_BANDS[cls];
            const lmW = efficacyLmPerW(row);
            expect(lmW, `${id} ${lmW.toFixed(1)} lm/W outside ${cls} [${lo},${hi}]`).toBeGreaterThanOrEqual(lo);
            expect(lmW, `${id}`).toBeLessThanOrEqual(hi);
            expect(row.ipRating, `${id} IP below the exterior floor`).toBeGreaterThanOrEqual(minIpForLocation('exterior'));
        }
        expect(efficacyClassFor(lod200Row(FIVE.louvred.id)!)).toBe('decorative');
        expect(efficacyClassFor(lod200Row(FIVE.globePost.id)!)).toBe('decorative');
        expect(efficacyClassFor(lod200Row(FIVE.street.id)!)).toBe('architectural');
        // The louvred bollard's TRUE 60 lm/W would fail the architectural band —
        // which is exactly why efficacy class derives from archetype, not choice.
        expect(efficacyLmPerW(lod200Row(FIVE.louvred.id)!)).toBeLessThan(EFFICACY_BANDS.architectural[0]);
    });

    it('the founder\'s "+ lumen" row: delivered lumens, not module lumens, and the ordering the constructions imply', () => {
        const louvred  = lod200Row(FIVE.louvred.id)!;
        const diffuser = lod200Row(FIVE.diffuser.id)!;
        const mini     = lod200Row(FIVE.globeMini.id)!;
        const post     = lod200Row(FIVE.globePost.id)!;
        const street   = lod200Row(FIVE.street.id)!;

        expect(louvred.lumens).toBe(600);
        expect(louvred.watts).toBe(10);
        // Louvres CLAMP the spread; an open diffuser band does not.
        expect(louvred.beamAngleDeg).toBeLessThan(diffuser.beamAngleDeg);
        // A globe on a THIN pole is shadowed less than one over a thick head stack.
        expect(post.beamAngleDeg).toBeGreaterThan(mini.beamAngleDeg);
        // The street head is the area fixture: brightest, coolest, and Ra 70 not 80.
        expect(street.lumens).toBeGreaterThan(post.lumens);
        expect(post.lumens).toBeGreaterThan(louvred.lumens);
        expect(louvred.lumens).toBeGreaterThan(mini.lumens);
        expect(street.kelvin).toBe(4000);
        expect(street.cri).toBeLessThan(louvred.cri);
        expect(street.ipRating).toBe(66);
        // ⛔ THE NAMED GAP: one scalar cannot carry an asymmetric forward throw.
        // The row authors the symmetric downward spread and says so.
        expect(street.beamAngleDeg).toBe(140);
    });
});

describe('§OUTDOOR112 — geometry: builds, deterministic, base at the ground, within the mesh budget', () => {
    beforeEach(() => { g.window = g.window ?? {}; });

    it('every fixture builds with a body and at least one lens, rising from its base point (+Y)', () => {
        for (const id of IDS) {
            const { root } = build(id);
            expect(root, id).toBeDefined();
            expect(meshes(root).length, `${id} has meshes`).toBeGreaterThan(0);
            expect(lenses(root).length, `${id} has a luminous part`).toBeGreaterThan(0);
            const box = localBox(root);
            // The base sits ON the ground — nothing below the seat, and the top
            // is the authored height (the emitter rides above the pole/shaft).
            expect(box.min.y, `${id} nothing below the base point`).toBeGreaterThanOrEqual(-0.001);
            expect(box.max.y, `${id} rises`).toBeGreaterThan(lod200Row(id)!.dMm / 1000 * 0.9);
        }
    });

    it('MESH BUDGET — each fixture is ≤ budget meshes after consolidation, and triangles are bounded (numbers reported)', () => {
        const report: string[] = [];
        for (const id of IDS) {
            const { root } = build(id);
            const m = meshes(root).length;
            const t = triangles(root);
            report.push(`${id}: ${m} meshes · ${t} tris`);
            expect(m, `${id} meshes ${m} > budget ${MESH_BUDGET}`).toBeLessThanOrEqual(MESH_BUDGET);
            expect(t, `${id} tris`).toBeLessThanOrEqual(TRI_CEILING);
        }
        console.log('[§OUTDOOR112 mesh/tri census]\n  ' + report.join('\n  '));
    });

    it('deterministic — two builds of one row are mesh-for-mesh identical', () => {
        for (const id of IDS) {
            const a = build(id, { id: `${id}-a` }).root;
            const b = build(id, { id: `${id}-b` }).root;
            const ma = meshes(a), mb = meshes(b);
            expect(mb.length, id).toBe(ma.length);
            expect(triangles(b), id).toBe(triangles(a));
            for (let i = 0; i < ma.length; i++) {
                expect(mb[i]!.position.toArray(), `${id} mesh ${i}`).toEqual(ma[i]!.position.toArray());
                expect(mb[i]!.userData.role, `${id} mesh ${i} role`).toBe(ma[i]!.userData.role);
            }
        }
    });

    it('the louvred and diffuser bollards are the SAME mass — the slats are the only difference', () => {
        const louvred  = build(FIVE.louvred.id).root;
        const diffuser = build(FIVE.diffuser.id).root;
        // Both: one merged body + one luminous band.
        expect(lenses(louvred).length).toBe(1);
        expect(lenses(diffuser).length).toBe(1);
        // The louvred body carries more triangles (four slats folded in).
        expect(triangles(louvred)).toBeGreaterThan(triangles(diffuser) * (0.16 / 0.14) ** 0);
    });
});

describe('§OUTDOOR112 — the glowing TRANSLUCENT globe actually renders translucent (L-11501 carriage)', () => {
    beforeEach(() => { g.window = g.window ?? {}; });

    const frosted = lod200BodyAppearance('glass-frosted')!;

    it('the head master material is translucent in the LIVE catalogue — the test is not asserting a constant', () => {
        expect(frosted.transparent).toBe(true);
        expect(frosted.opacity).toBeLessThan(1);
        expect(lod200Row(FIVE.globeMini.id)!.headMaterialId).toBe('glass-frosted');
        expect(lod200Row(FIVE.globePost.id)!.headMaterialId).toBe('glass-frosted');
    });

    for (const key of ['globeMini', 'globePost'] as const) {
        it(`#${FIVE[key].n} ${FIVE[key].id}: the globe lens is transparent at the catalogue's opacity — and STAYS so through the day/night re-pool`, () => {
            const { b, root } = build(FIVE[key].id);
            const globe = lenses(root).find((m) => (m.material as THREE.MeshStandardMaterial).transparent);
            expect(globe, 'a translucent lens exists').toBeDefined();
            const mat = globe!.material as THREE.MeshStandardMaterial;
            expect(mat.opacity).toBe(frosted.opacity);
            expect(mat.transparent).toBe(true);
            expect(globe!.castShadow, 'a translucent shade casts no opaque shadow').toBe(false);

            // ⭐ THE ARM THAT MATTERS: `_syncLens` re-pools every lens material on
            // each sync. Before §OUTDOOR112 that pool had no translucency axis, so
            // a frosted globe would have turned OPAQUE on the first pass.
            b.syncLights();
            b.setDayNight('night');
            const after = globe!.material as THREE.MeshStandardMaterial;
            expect(after.transparent, 'translucency survives the re-pool').toBe(true);
            expect(after.opacity).toBe(frosted.opacity);
            // …and it is still POOLED, not minted per fixture.
            const twin = build(FIVE[key].id, { id: 'twin' }).root;
            const twinGlobe = lenses(twin).find((m) => (m.material as THREE.MeshStandardMaterial).transparent)!;
            expect((twinGlobe.material as THREE.MeshStandardMaterial).uuid).toBe(
                (lenses(build(FIVE[key].id, { id: 'twin2' }).root)
                    .find((m) => (m.material as THREE.MeshStandardMaterial).transparent)!
                    .material as THREE.MeshStandardMaterial).uuid,
            );
        });
    }

    it('the bollards\' diffuser bands are OPAQUE lenses — an opal band reads white, not see-through', () => {
        for (const id of [FIVE.louvred.id, FIVE.diffuser.id]) {
            for (const lens of lenses(build(id).root)) {
                expect((lens.material as THREE.MeshStandardMaterial).transparent, id).toBe(false);
            }
        }
    });
});

describe('§OUTDOOR112 — the light emits from the DRAWN luminous body (shared layout, one arithmetic)', () => {
    beforeEach(() => { g.window = g.window ?? {}; });

    it('louvred bollard: the point light sits at the centre of the band under the cap — not at the base', () => {
        const { b, root } = build(FIVE.louvred.id);
        b.syncLights();
        const light = lightsIn(root)[0];
        expect(light, 'the sole fixture wins the budget').toBeDefined();
        // h = 0.9 → cap 0.035, band 0.16 → centre 0.9 − 0.035 − 0.08 = 0.785.
        expect(light!.position.y).toBeCloseTo(0.785, 6);
        expect(light!.position.x).toBe(0);
        expect(light!.position.z).toBe(0);
        // …and the drawn band is centred on the same Y.
        expect(lenses(root)[0]!.position.y).toBeCloseTo(0.785, 6);
    });

    it('globe post: the light sits at the globe centre above the 2.7 m pole; the globe is drawn there too', () => {
        const { b, root } = build(FIVE.globePost.id);
        b.syncLights();
        const light = lightsIn(root)[0]!;
        // r = 0.2 → centre 2.7 + 0.17 = 2.87.
        expect(light.position.y).toBeCloseTo(2.87, 6);
        const globe = lenses(root).find((m) => (m.material as THREE.MeshStandardMaterial).transparent)!;
        expect(globe.position.y).toBeCloseTo(2.87, 6);
    });

    it('street luminaire: the light is OVER THE ROAD at the arm\'s end, under the head — never at the pole', () => {
        const { b, root } = build(FIVE.street.id);
        b.syncLights();
        const light = lightsIn(root)[0]!;
        expect(light.position.z, 'cantilevered along +Z').toBeGreaterThan(0.8);
        expect(light.position.y, 'just under the head near the 5 m pole top').toBeGreaterThan(4.7);
        expect(light.position.y).toBeLessThan(5.0);
        const lens = lenses(root)[0]!;
        expect(lens.position.z).toBeCloseTo(light.position.z, 6);
        expect(lens.position.y).toBeGreaterThan(light.position.y);
    });
});

describe('§OUTDOOR112 — a RUN of bollards: emissive fallback and the honesty stamp beyond the live budget', () => {
    beforeEach(() => { g.window = g.window ?? {}; });

    it('twenty louvred bollards: every one keeps its lit band, every one carries a LiveLightState, the dark ones say WHY', () => {
        const scene = new THREE.Scene();
        const b = new LightingFragmentBuilder();
        b.setScene(scene);
        b.setQualityTier('performance');
        for (let i = 0; i < 20; i++) build(FIVE.louvred.id, { id: `run-${i}`, x: i * 2.5, builder: b, scene });
        b.syncLights();

        const rows = b.liveLightDiagnostics();
        expect(rows.length).toBe(20);
        expect(b.liveLightCount).toBe(b.liveLightBudget);
        expect(b.liveLightCount).toBeLessThan(20);
        for (const r of rows) {
            expect(r.total).toBe(20);
            expect(r.budget).toBe(b.liveLightBudget);
            if (r.lit) expect(r.reason).toBeNull();
            else expect(r.reason).toContain('Not lit');
        }
        // The path still READS lit: every root has its emissive band whatever its rank.
        let dark = 0;
        for (const root of scene.children) {
            expect(lenses(root).length, root.userData.id).toBeGreaterThan(0);
            if (lightsIn(root).length === 0) dark++;
        }
        expect(dark).toBe(20 - b.liveLightBudget);
        // …and twenty bollards are ≤ 40 meshes total (the budget that makes a run affordable).
        let total = 0;
        for (const root of scene.children) total += meshes(root).length;
        expect(total).toBeLessThanOrEqual(20 * 2);
    });
});
