/**
 * §FEAT-LANDSCAPE-SLAB-TYPES (L-963) — the DECIDING-LAYER proof.
 *
 * Founder: "For the slab — I need more slab types for landscape with grass types
 * and soil types."
 *
 * ── WHY THIS SUITE ASSERTS ON THE SCENE GRAPH AND NOT ON THE STORE ──────────
 *
 * §COMMITTED-IS-NOT-REACHABLE. A suite that asserted `slab.layers[0].materialId
 * === 'landscape-grass-lawn'` would pass on a build where every landscape slab
 * renders CONCRETE GREY, because that was the state of the code before this
 * change: `SlabFragmentBuilder` set `materialId: undefined` on every layer it
 * built, so the reference was stored perfectly and thrown away one layer later.
 * The only claim worth making is the one the founder can see:
 *
 *     A slab carrying the lawn type RENDERS GREEN, AT 280 mm, IN THE SCENE.
 *
 * so every assertion below reads a THREE.Material off a mesh that is actually in
 * the scene, and a Box3 measured from real geometry — never the record it came
 * from.
 *
 * ── WHY THE ORACLE IS THE MASTER CATALOGUE, AND WHY IT CANNOT MOVE WITH THE
 *    SUBJECT ───────────────────────────────────────────────────────────────
 *
 * Three lanes this session shipped controls that could not fail — one broke a
 * function feeding BOTH the builder and the expected value, so `expected 0,
 * measured 0` passed. The guard here is that the expected colour is read from
 * `STANDARD_MATERIAL_LIBRARY` (the master's own projection) through a DIFFERENT
 * accessor than the builder uses (`materialHexById`), and — the part that
 * matters — every colour assertion is ALSO pinned by ABSOLUTE facts that no
 * shared-source drift can satisfy by accident:
 *
 *   - grass must be GREEN-DOMINANT (g > r and g > b),
 *   - and must NOT be any of the three fallback greys the code can reach
 *     (`#909090` layer default, `#808080` material default, `#ccc` strip
 *     default), all of which have r === g === b.
 *
 * If the resolution silently regresses to a fallback, the absolute assertions
 * fail even if the master row and the accessor moved together.
 *
 * WATCHED RED: with `materialId: layer.materialId` reverted to `undefined` and
 * the `materialHexById` resolution removed from SlabFragmentBuilder — i.e. the
 * exact pre-change code — the grass test fails on the grey it falls back to.
 * The break moves the SUBJECT only; the oracle is untouched.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
    viewDefinitionStore, viewIntentInstanceStore, DEFAULT_3D_VIEW_ID, initDefaultViewsManager,
} from '@pryzm/core-app-model';
import { STANDARD_MATERIAL_LIBRARY } from '@pryzm/core-app-model/material-library';
import { SlabFragmentBuilder } from '../src/SlabFragmentBuilder';
import { slabSystemTypeStore } from '../src/SlabSystemTypeStore';
import { validateSlabData } from '../src/SlabValidator';
import type { SlabData } from '../src/SlabTypes';

const bim = { getLevelById: () => ({ id: 'L0', elevation: 3 }) } as never;

/**
 * The expected colour, read from the master through an accessor the builder does
 * NOT call. `materialHexById` is the builder's route; this is the raw projection.
 */
function masterHex(id: string): string {
    const def = STANDARD_MATERIAL_LIBRARY.find(m => m.id === id);
    if (!def) throw new Error(`test oracle broken — master catalogue has no row "${id}"`);
    const colour = def.params.color as THREE.Color;
    return `#${colour.getHexString()}`;
}

/** Every fallback colour the slab material path can reach. All are neutral greys. */
const FALLBACK_GREYS = ['#909090', '#808080', '#cccccc'];

let builders: SlabFragmentBuilder[] = [];

function buildFromType(typeId: string): { scene: THREE.Scene; meshes: THREE.Mesh[] } {
    const type = slabSystemTypeStore.getById(typeId);
    if (!type) throw new Error(`no such slab system type: ${typeId}`);
    const data = {
        id: `slab-${typeId}`, type: 'slab', levelId: 'L0',
        width: 6, depth: 5,
        thickness: type.totalThickness,
        position: { x: 0, y: 0, z: 0 },
        systemTypeId: type.id,
        layers: structuredClone(type.layers),
    } as unknown as SlabData;

    viewDefinitionStore.update(DEFAULT_3D_VIEW_ID, { output: { detailLevel: 'medium' } } as never);
    const scene = new THREE.Scene();
    const builder = new SlabFragmentBuilder(scene, bim);
    builders.push(builder);
    builder.updateSlab(data);

    const meshes: THREE.Mesh[] = [];
    scene.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    for (const m of meshes) m.updateWorldMatrix(true, false);
    return { scene, meshes };
}

/** The mesh whose world-space centre sits highest — the slab's TOP layer. */
function topMesh(meshes: THREE.Mesh[]): THREE.Mesh {
    let best: THREE.Mesh | null = null;
    let bestY = -Infinity;
    for (const m of meshes) {
        const y = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()).y;
        if (y > bestY) { bestY = y; best = m; }
    }
    if (!best) throw new Error('no meshes in scene — the slab did not build at all');
    return best;
}

function hexOf(mesh: THREE.Mesh): string {
    const mat = mesh.material as THREE.MeshStandardMaterial;
    return `#${mat.color.getHexString()}`;
}

/** World-space vertical extent of the whole slab, measured from real geometry. */
function builtThickness(meshes: THREE.Mesh[]): number {
    const box = new THREE.Box3();
    for (const m of meshes) box.expandByObject(m);
    return box.max.y - box.min.y;
}

beforeEach(() => {
    initDefaultViewsManager();
    viewIntentInstanceStore.delete(DEFAULT_3D_VIEW_ID);
});
afterEach(() => {
    for (const b of builders) b.dispose();
    builders = [];
});

describe('§FEAT-LANDSCAPE-SLAB-TYPES — a lawn slab renders green, at 280 mm, in the scene', () => {

    it('THE FOUNDER CLAIM: the lawn type builds a 280 mm stack whose TOP FACE is the master grass colour', () => {
        const { meshes } = buildFromType('st-landscape-lawn-280');

        // Three layers → three meshes. A collapse to one would mean the layered
        // path was not taken and the whole build-up was lost.
        expect(meshes).toHaveLength(3);

        // Thickness measured from GEOMETRY, not read back off the record.
        expect(builtThickness(meshes)).toBeCloseTo(0.280, 6);

        const hex = hexOf(topMesh(meshes));

        // (a) it is the master's colour, via an accessor the builder never calls
        expect(hex).toBe(masterHex('landscape-grass-lawn'));

        // (b) ABSOLUTE anchors — these hold no matter what the master row says,
        //     and they are what makes (a) non-vacuous.
        const c = new THREE.Color(hex);
        expect(c.g).toBeGreaterThan(c.r);
        expect(c.g).toBeGreaterThan(c.b);
        expect(FALLBACK_GREYS).not.toContain(hex);
    });

    it('each of the three lawn layers renders ITS OWN master material — not one colour smeared over the stack', () => {
        const { meshes } = buildFromType('st-landscape-lawn-280');
        const rendered = new Set(meshes.map(hexOf));

        expect(rendered).toEqual(new Set([
            masterHex('landscape-grass-lawn'),
            masterHex('landscape-topsoil'),
            masterHex('landscape-gravel-light'),
        ]));
        // Three DISTINCT colours: a single-colour stack would be the old
        // `data.materialColor` fallback winning for every layer.
        expect(rendered.size).toBe(3);
    });

    it('all ten landscape types build, resolve every layer to a master row, and reach no fallback grey', () => {
        const ids = slabSystemTypeStore.getAll()
            .filter(t => t.id.startsWith('st-landscape-'))
            .map(t => t.id);
        expect(ids).toHaveLength(10);

        for (const id of ids) {
            const type = slabSystemTypeStore.getById(id)!;
            const { meshes } = buildFromType(id);

            // §2 of the store's note: the layered render path needs > 1 layer. A
            // single-layer landscape type would store perfectly and render grey.
            expect(type.layers.length).toBeGreaterThan(1);
            expect(meshes).toHaveLength(type.layers.length);
            expect(builtThickness(meshes)).toBeCloseTo(type.totalThickness, 6);
            expect(type.loadBearing).toBe(false);

            for (const layer of type.layers) {
                // C100 §2 — every landscape layer REFERENCES the master and copies
                // no colour. A `materialColor` here would be a transcribed hex.
                expect(layer.materialId).toBeTruthy();
                expect(layer.materialColor).toBeUndefined();
                expect(masterHex(layer.materialId!)).toBeTruthy();
            }
            for (const m of meshes) {
                expect(FALLBACK_GREYS).not.toContain(hexOf(m));
            }
        }
    });

    it('the four landscape layer roles pass the store-boundary schema — extending the type alone would ZodError', () => {
        // SlabValidator's Zod enum is a SECOND spelling of SlabLayerFunction. If
        // only the TypeScript union had been extended this would throw, and the
        // user would meet it as a slab that silently refuses to be created.
        for (const id of ['st-landscape-lawn-280', 'st-landscape-gravel-200', 'st-landscape-turf-artificial-160']) {
            const type = slabSystemTypeStore.getById(id)!;
            expect(() => validateSlabData({
                id, type: 'slab', levelId: 'L0',
                thickness: type.totalThickness,
                position: { x: 0, y: 0, z: 0 },
                width: 6, depth: 5,
                layers: structuredClone(type.layers),
            })).not.toThrow();
        }
    });

    it('⛔ NON-REGRESSION: the four structural types are untouched — RC 200 still builds one 200 mm grey layer', () => {
        const rc = slabSystemTypeStore.getById('st-monolithic-rc-200')!;
        expect(rc.totalThickness).toBeCloseTo(0.200, 6);
        expect(rc.loadBearing).toBeUndefined();   // absent, not `false` — nothing was rewritten
        expect(rc.layers).toHaveLength(1);
        expect(rc.layers[0].materialColor).toBe('#909090');
        expect(rc.layers[0].materialId).toBeUndefined();

        for (const id of ['st-composite-deck-300', 'st-insulated-screed', 'st-topping-slab-150']) {
            const t = slabSystemTypeStore.getById(id)!;
            expect(t.loadBearing).toBeUndefined();
            for (const l of t.layers) {
                // A structural layer names no master material and keeps its stored
                // hex — the change is ADDITIVE, and this is what proves it.
                expect(l.materialId).toBeUndefined();
                expect(l.materialColor).toBeTruthy();
            }
        }
    });

    it('⛔ NON-REGRESSION: a multi-layer slab with NO materialId renders exactly its stored hexes', () => {
        const { meshes } = buildFromType('st-composite-deck-300');
        expect(meshes).toHaveLength(3);
        expect(builtThickness(meshes)).toBeCloseTo(0.300, 6);
        expect(new Set(meshes.map(hexOf))).toEqual(new Set(['#c8bfa8', '#f5e07a', '#909090']));
    });

    it('a layer naming a material the master does not hold falls back to its stored hex AND says so', () => {
        // C84 §5 / C100 §5 — a miss must stay distinguishable from a hit. Silent
        // fallback is how "this material was lost" and "this layer is grey" become
        // one value.
        const warnings: string[] = [];
        const original = console.warn;
        console.warn = (...args: unknown[]) => { warnings.push(String(args[0])); };
        try {
            viewDefinitionStore.update(DEFAULT_3D_VIEW_ID, { output: { detailLevel: 'medium' } } as never);
            const scene = new THREE.Scene();
            const builder = new SlabFragmentBuilder(scene, bim);
            builders.push(builder);
            builder.updateSlab({
                id: 'slab-miss', type: 'slab', levelId: 'L0',
                width: 4, depth: 4, thickness: 0.2,
                position: { x: 0, y: 0, z: 0 },
                layers: [
                    { name: 'Bogus',  thickness: 0.1, function: 'growing-medium', materialId: 'landscape-does-not-exist', materialColor: '#123456' },
                    { name: 'Gravel', thickness: 0.1, function: 'drainage',       materialId: 'landscape-gravel-light' },
                ],
            } as unknown as SlabData);

            const meshes: THREE.Mesh[] = [];
            scene.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
            for (const m of meshes) m.updateWorldMatrix(true, false);

            expect(hexOf(topMesh(meshes))).toBe('#123456');
        } finally {
            console.warn = original;
        }
        expect(warnings.some(w => w.includes('landscape-does-not-exist'))).toBe(true);
    });
});
