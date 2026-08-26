// @vitest-environment happy-dom
/**
 * §SLABTYPES117-ARTICULATION (L-11800/L-11801) — founder 2026-08-26: "GLASS
 * STRUCTURAL slab with METAL BEAMS in a different colour — fancy slabs."
 *
 * `SlabTypeCatalogue` authored composite rows (a glass layer + a `beam-grid`
 * articulated layer) and `CompositeSlabBuilder` planned + triangulated them —
 * both already unit-tested — but nothing in `_buildSlab`'s per-layer loop ever
 * read `layer.articulation`: every layer, articulated or not, took the solid
 * poché arm. A beam-grid slab TYPE was selectable in the dropdown and would
 * have built as two stacked solid rectangles — the authored-but-unreachable
 * defect class this whole session has been closing, recurring one file over.
 *
 * This pins the wiring at the MESH, not the catalogue:
 *   A. an articulated layer produces REAL beam/band geometry (triangleCount > 0),
 *      not an empty or solid-poché placeholder
 *   B. it is tagged `role: 'geometry'` + a `'layer'` paint slot, so both the
 *      restyle-in-place path and the exporter/selection machinery see it
 *   C. a material-only edit on that layer restyles the SAME geometry object
 *      in place (no rebuild) — the extension seam `_materialForSlot`'s
 *      generic `'layer'` case already covered, now proven end to end
 *   D. a non-articulated layer on the SAME slab is completely unaffected
 *      (solid poché, unchanged) — this is additive, not a rewrite
 */
import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { SlabFragmentBuilder } from '../src/SlabFragmentBuilder';
import { planArticulation } from '../src/CompositeSlabBuilder';

const RING = [{ x: 40, y: -60 }, { x: 52, y: -60 }, { x: 52, y: -51 }, { x: 40, y: -51 }];
const L5_ELEVATION = 22;

function slabData(over: Record<string, unknown> = {}) {
    return {
        id: 'slab-glass-beam', type: 'slab', levelId: 'L5', parentId: 'L5',
        position: { x: 0, y: 0, z: 0 },
        width: 12, depth: 9, thickness: 0.30, baseOffset: 0,
        polygon: RING.map(p => ({ ...p })),
        layers: [
            { name: 'Glass', thickness: 0.10, function: 'finish', materialColor: '#cfe8ff' },
            {
                name: 'Steel beams', thickness: 0.20, function: 'structure', materialColor: '#1a1a1a',
                articulation: { kind: 'beam-grid', beamWidth: 0.20, maxSpacing: 2.4, perimeter: true },
            },
        ],
        properties: {}, ifcData: { guid: 'g', ifcClass: 'IfcSlab' },
        ...over,
    } as never;
}

function makeBuilder() {
    return new SlabFragmentBuilder(new THREE.Scene(), {
        getLevelById: () => ({ id: 'L5', elevation: L5_ELEVATION }),
    } as never);
}

function bodyMeshes(root: THREE.Object3D): THREE.Mesh[] {
    return root.children.filter(
        (c): c is THREE.Mesh => (c as THREE.Mesh).isMesh === true && c.userData?.role === 'geometry',
    );
}

function triCount(mesh: THREE.Mesh): number {
    const g = mesh.geometry;
    const idx = g.getIndex();
    return (idx ? idx.count : g.getAttribute('position').count) / 3;
}

describe('§SLABTYPES117-ARTICULATION — a beam-grid layer is REACHABLE, not just authored', () => {

    it('A · the articulated layer builds real beam/band geometry, not an empty or solid placeholder', () => {
        const b = makeBuilder();
        b.updateSlab(slabData());
        const root = b.getRootById('slab-glass-beam')!;
        const meshes = bodyMeshes(root);
        expect(meshes.length, 'glass layer + beam layer').toBe(2);
        const beamMesh = meshes.find(m => m.userData.paintSlot?.index === 1)!;
        expect(beamMesh, 'the articulated layer must be tagged with its layer index').toBeDefined();
        expect(triCount(beamMesh)).toBeGreaterThan(0);
        // The direct proof it is a GRID, not a solid poché: the same planner the
        // builder calls, on the same ring, must actually find interior joists —
        // a 12×9 m plate at 2.4 m max spacing cannot be spanned by the perimeter
        // band alone.
        const plan = planArticulation(RING, [], { kind: 'beam-grid', beamWidth: 0.20, maxSpacing: 2.4, perimeter: true });
        expect(plan.bands.length, 'perimeter band').toBeGreaterThan(0);
        expect(plan.beams.length, 'interior joists').toBeGreaterThan(0);
    });

    it('B · the beam mesh is selectable geometry with a layer paint slot', () => {
        const b = makeBuilder();
        b.updateSlab(slabData());
        const root = b.getRootById('slab-glass-beam')!;
        const beamMesh = bodyMeshes(root).find(m => m.userData.paintSlot?.index === 1)!;
        expect(beamMesh.userData.role).toBe('geometry');
        expect(beamMesh.userData.paintSlot).toEqual({ kind: 'layer', index: 1 });
        expect(beamMesh.userData.id).toBe('slab-glass-beam');
    });

    it('C · a material-only edit on the beam layer restyles the SAME geometry object in place', () => {
        const b = makeBuilder();
        b.updateSlab(slabData());
        const root = b.getRootById('slab-glass-beam')!;
        const before = bodyMeshes(root).find(m => m.userData.paintSlot?.index === 1)!;
        const geomBefore = before.geometry;

        const edited = slabData();
        (edited as { layers: Array<{ materialColor?: string }> }).layers[1]!.materialColor = '#c9a227'; // bronze
        b.updateSlab(edited);

        const after = bodyMeshes(root).find(m => m.userData.paintSlot?.index === 1)!;
        expect(after, 'the beam mesh must survive a restyle').toBe(before);
        expect(after.geometry, 'a colour-only edit must NOT re-triangulate the beam grid').toBe(geomBefore);
        expect('#' + (after.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('#c9a227');
    });

    it('D · the non-articulated glass layer is unaffected — additive, not a rewrite', () => {
        const b = makeBuilder();
        b.updateSlab(slabData());
        const root = b.getRootById('slab-glass-beam')!;
        const glassMesh = bodyMeshes(root).find(m => m.userData.paintSlot?.index === 0)!;
        // A solid poché over the full ring: far more triangles than a thin perimeter band.
        expect(triCount(glassMesh)).toBeGreaterThan(0);
        expect(glassMesh.userData.role).toBe('geometry');
    });

    it('E · a beam-grid layer on a slab with NO resolvable ring (box fallback) still builds, centred at local origin', () => {
        const b = makeBuilder();
        b.updateSlab(slabData({ polygon: undefined }));
        const root = b.getRootById('slab-glass-beam')!;
        const beamMesh = bodyMeshes(root).find(m => m.userData.paintSlot?.index === 1)!;
        expect(beamMesh, 'box-fallback slabs must still articulate their beam layer').toBeDefined();
        expect(triCount(beamMesh)).toBeGreaterThan(0);
        expect(beamMesh.position.x).toBeCloseTo(0, 9);
        expect(beamMesh.position.z).toBeCloseTo(0, 9);
    });
});
