// @vitest-environment happy-dom
/**
 * §SLAB116 (L-11780 · L-11781) — founder 2026-08-26, on production:
 *
 *   DEFECT 1 — "I edit a slab's LAYER colour or LAYER material, `UPDATE_SLAB_LAYERS`
 *   runs, plan re-projects … and the 3D slab keeps its old material/colour."
 *   DEFECT 2 — "I set the element Color Override and the slab MOVES — a red plate
 *   hanging outside the building at Level 5" with
 *   `[TopologyLayer] … 1 LOST [lift↔slab] … its group bounds moved under this scan`.
 *
 * ── THE TWO MEASURED MECHANISMS ─────────────────────────────────────────────────
 *
 * (1) `_buildSlab`'s PLAIN arm (taken for every one-layer stack — i.e. every plan-tool
 *     slab — and for LOD coarse) painted from SLAB-LEVEL `materialColor`/`materialId`
 *     and never read `layers[]`. The rebuild fired every time and re-painted the OLD
 *     colour. C84 EI-9: the layered arm and the plain arm answered "what colour is
 *     this slab" from two vocabularies, and only the panel's declared precedence
 *     (LayerMaterialCell) cited the one that never ran for the founder's slab.
 *
 * (2) A colour-only `UPDATE_ELEMENT_PARAMETER` → `SlabStore.update` → `bim-slab-updated`
 *     → a FULL `_buildSlab`: ring re-resolved, re-outset, re-triangulated, root
 *     re-seated — for a hex string. Any degraded arm of that rebuild drew a
 *     `BoxGeometry` at `childOffset = −centroid`, i.e. centred on `data.position` =
 *     the WORLD ORIGIN for plan-tool slabs, at the correct storey height: "snaps
 *     toward the project origin", red, poking out of the facade.
 *
 * ── WHAT IS PINNED, at the layer the founder experiences (the MESH, not the store) ─
 *   A. an appearance-only edit is a RESTYLE: same geometry object, same root.position,
 *      same world bbox, NEW material colour on the mesh              (DEFECT 2 pin)
 *   B. the undo replay (writing the previous record back) restores colour with the
 *      position still identical                                        (C16 §8.6)
 *   C. a byte-identical record — `SlabStore.triggerRebuild`'s contract — still REBUILDS
 *   D. a THICKNESS edit still rebuilds (the restyle gate is not over-broad)
 *   E. a one-layer slab paints its LAYER's colour, and a layer-colour edit reaches the
 *      mesh in place                                                  (DEFECT 1 pin)
 *   F. a one-layer slab paints its LAYER's MATERIAL (master hex wins, as declared)
 *   G. a two-layer slab restyles per layer, in place
 *   H. a degraded box is centred on the ring centroid, never the world origin
 *
 * ⛔ A, E, F, G, H FAIL ON THE PRE-FIX TREE (re-measured, see the L-11780 row): A/G on
 * geometry identity, E/F on the painted hex, H on the box centre (0, ·, 0).
 */
import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { SlabFragmentBuilder } from '../src/SlabFragmentBuilder';
import { STANDARD_MATERIAL_LIBRARY, materialHexById } from '@pryzm/core-app-model/material-library';

/** A 12 × 9 m plate far from the origin — a Level-5 apartment plate, not a test square at (0,0). */
const RING = [{ x: 40, y: -60 }, { x: 52, y: -60 }, { x: 52, y: -51 }, { x: 40, y: -51 }];
const CENTROID = { x: 46, z: -55.5 };
const L5_ELEVATION = 22;
const THICKNESS = 0.2;

function slabData(over: Record<string, unknown> = {}) {
    return {
        id: 'slab-l5', type: 'slab', levelId: 'L5', parentId: 'L5',
        position: { x: 0, y: 0, z: 0 },
        width: 12, depth: 9, thickness: THICKNESS, baseOffset: 0,
        polygon: RING.map(p => ({ ...p })),
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

/** The colour ON THE MESH — never the record. */
function paintedHex(mesh: THREE.Mesh): string {
    return '#' + (mesh.material as THREE.MeshStandardMaterial).color.getHexString();
}

function worldBox(root: THREE.Object3D): THREE.Box3 {
    root.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(root);
}

const TOL = 6; // half a micrometre — the L-1177 tolerance, not loosened

function expectSamePlace(a: THREE.Box3, b: THREE.Box3): void {
    expect(b.min.x).toBeCloseTo(a.min.x, TOL);
    expect(b.max.x).toBeCloseTo(a.max.x, TOL);
    expect(b.min.z).toBeCloseTo(a.min.z, TOL);
    expect(b.max.z).toBeCloseTo(a.max.z, TOL);
    expect(b.min.y).toBeCloseTo(a.min.y, TOL);
    expect(b.max.y).toBeCloseTo(a.max.y, TOL);
}

describe('§SLAB116 (L-11780) — an APPEARANCE edit restyles in place; it cannot re-seat', () => {

    it('A · Color Override: same geometry object, same root.position, same world bbox — and the mesh IS red', () => {
        const b = makeBuilder();
        b.updateSlab(slabData());
        const root = b.getRootById('slab-l5')!;
        const [mesh] = bodyMeshes(root);
        const geomBefore = mesh!.geometry;
        const posBefore = root.position.clone();
        const boxBefore = worldBox(root);
        expect(paintedHex(mesh!)).not.toBe('#ff0000');

        // The exact write `UpdateElementParameterCommand`'s slab arm lands:
        // `{ ...existing, materialColor }` → store → bim-slab-updated → updateSlab.
        b.updateSlab(slabData({ materialColor: '#ff0000' }));

        const [after] = bodyMeshes(root);
        expect(after, 'the body mesh must survive a restyle').toBe(mesh);
        expect(after!.geometry, 'a colour edit must NOT re-triangulate').toBe(geomBefore);
        expect(root.position.x).toBeCloseTo(posBefore.x, TOL);
        expect(root.position.y).toBeCloseTo(posBefore.y, TOL);
        expect(root.position.z).toBeCloseTo(posBefore.z, TOL);
        expectSamePlace(boxBefore, worldBox(root));
        expect(paintedHex(after!), 'the override must reach the MESH').toBe('#ff0000');
        expect(root.userData.materialColor).toBe('#ff0000');
    });

    it('B · undo replay (previous record written back) restores the colour with the position identical', () => {
        const b = makeBuilder();
        b.updateSlab(slabData({ materialColor: '#a0a0a0' }));
        const root = b.getRootById('slab-l5')!;
        const boxBefore = worldBox(root);
        const geomBefore = bodyMeshes(root)[0]!.geometry;

        b.updateSlab(slabData({ materialColor: '#ff0000' }));
        b.updateSlab(slabData({ materialColor: '#a0a0a0' }));   // what undo() replays

        const [mesh] = bodyMeshes(root);
        expect(paintedHex(mesh!)).toBe('#a0a0a0');
        expect(mesh!.geometry).toBe(geomBefore);
        expectSamePlace(boxBefore, worldBox(root));
    });

    it('C · a byte-identical record (SlabStore.triggerRebuild) still REBUILDS — the restyle gate is not a rebuild suppressor', () => {
        const b = makeBuilder();
        const data = slabData();
        b.updateSlab(data);
        const root = b.getRootById('slab-l5')!;
        const geomBefore = bodyMeshes(root)[0]!.geometry;
        const boxBefore = worldBox(root);

        b.updateSlab(data);                                  // same frozen reference
        expect(bodyMeshes(root)[0]!.geometry, 'a re-projection request must re-triangulate').not.toBe(geomBefore);

        const clone = JSON.parse(JSON.stringify(data));      // equal, different object
        const geomMid = bodyMeshes(root)[0]!.geometry;
        b.updateSlab(clone);
        expect(bodyMeshes(root)[0]!.geometry).not.toBe(geomMid);
        expectSamePlace(boxBefore, worldBox(root));          // and a rebuild never moves it either
    });

    it('D · a THICKNESS edit still rebuilds: new geometry, top face pinned, bottom drops', () => {
        const b = makeBuilder();
        b.updateSlab(slabData());
        const root = b.getRootById('slab-l5')!;
        const geomBefore = bodyMeshes(root)[0]!.geometry;
        const boxBefore = worldBox(root);

        b.updateSlab(slabData({ thickness: 0.4 }));
        const boxAfter = worldBox(root);
        expect(bodyMeshes(root)[0]!.geometry).not.toBe(geomBefore);
        expect(boxAfter.max.y).toBeCloseTo(boxBefore.max.y, TOL);        // C92 §10 datum = top
        expect(boxAfter.min.y).toBeCloseTo(boxBefore.min.y - 0.2, TOL);
        expect(boxAfter.min.x).toBeCloseTo(boxBefore.min.x, TOL);
        expect(boxAfter.max.z).toBeCloseTo(boxBefore.max.z, TOL);
    });
});

describe('§SLAB116 (L-11780) — the LAYER stack the panel writes is what the body paints', () => {

    const ONE_LAYER = (materialColor: string, materialId?: string) => [
        { name: 'Layer 1', function: 'structure', thickness: THICKNESS, materialColor, ...(materialId ? { materialId } : {}) },
    ];

    it('E · a one-layer slab paints its LAYER colour, and a layer-colour edit reaches the mesh IN PLACE', () => {
        const b = makeBuilder();
        b.updateSlab(slabData({ layers: ONE_LAYER('#112233') }));
        const root = b.getRootById('slab-l5')!;
        const [mesh] = bodyMeshes(root);
        expect(mesh, 'one layer ⇒ one body mesh').toBeDefined();
        expect(bodyMeshes(root).length).toBe(1);
        expect(paintedHex(mesh!), 'the layer colour must be what the 3D body paints').toBe('#112233');

        const geomBefore = mesh!.geometry;
        const boxBefore = worldBox(root);
        // The founder's gesture: Save Layers → UPDATE_SLAB_LAYERS → store → rebuild.
        b.updateSlab(slabData({ layers: ONE_LAYER('#445566') }));

        const [after] = bodyMeshes(root);
        expect(paintedHex(after!), 'the edited layer colour must reach the MESH').toBe('#445566');
        expect(after!.geometry, 'a layer-colour edit is a restyle, not a rebuild').toBe(geomBefore);
        expectSamePlace(boxBefore, worldBox(root));
    });

    it("F · a one-layer slab paints its LAYER's MATERIAL — the master hex wins, as LayerMaterialCell declares", () => {
        const master = STANDARD_MATERIAL_LIBRARY[0]!;
        const masterHex = String(materialHexById(master.id)).toLowerCase();
        expect(masterHex).toMatch(/^#[0-9a-f]{6}$/);

        const b = makeBuilder();
        // Colour DISAGREES with the material on purpose: the declared precedence says
        // the material is painted and the colour is only the fallback.
        b.updateSlab(slabData({ layers: ONE_LAYER('#123456', master.id) }));
        const [mesh] = bodyMeshes(b.getRootById('slab-l5')!);
        expect(paintedHex(mesh!)).toBe(masterHex);
    });

    it('I · a body mesh stamped with an UNKNOWN paint slot forces a full rebuild — the composite-extension seam refuses rather than paints blind', () => {
        const b = makeBuilder();
        b.updateSlab(slabData({ layers: ONE_LAYER('#112233') }));
        const root = b.getRootById('slab-l5')!;
        const [mesh] = bodyMeshes(root);
        expect(mesh!.userData.paintSlot).toEqual({ kind: 'layer', index: 0 });
        const geomBefore = mesh!.geometry;
        const boxBefore = worldBox(root);

        // What a not-yet-taught composite part would look like to the restyle path.
        mesh!.userData.paintSlot = { kind: 'glass-panel' };
        b.updateSlab(slabData({ layers: ONE_LAYER('#445566') }));

        const [after] = bodyMeshes(root);
        expect(after!.geometry, 'an unknown slot must REBUILD, never be painted as the body').not.toBe(geomBefore);
        expect(paintedHex(after!)).toBe('#445566');           // the rebuild still lands the colour
        expect(after!.userData.paintSlot).toEqual({ kind: 'layer', index: 0 });
        expectSamePlace(boxBefore, worldBox(root));           // and a rebuild never moves it
    });

    it('G · a two-layer slab restyles EACH layer mesh in place', () => {
        const layers = (top: string, bottom: string) => [
            { name: 'Screed',      function: 'screed',    thickness: 0.05, materialColor: top },
            { name: 'RC Concrete', function: 'structure', thickness: 0.15, materialColor: bottom },
        ];
        const b = makeBuilder();
        b.updateSlab(slabData({ layers: layers('#aa0000', '#00aa00') }));
        const root = b.getRootById('slab-l5')!;
        const meshes = bodyMeshes(root);
        expect(meshes.length).toBe(2);
        expect(paintedHex(meshes[0]!)).toBe('#aa0000');
        expect(paintedHex(meshes[1]!)).toBe('#00aa00');
        const geoms = meshes.map(m => m.geometry);
        const boxBefore = worldBox(root);

        b.updateSlab(slabData({ layers: layers('#0000aa', '#00aa00') }));
        const after = bodyMeshes(root);
        expect(after.length).toBe(2);
        expect(paintedHex(after[0]!)).toBe('#0000aa');
        expect(paintedHex(after[1]!)).toBe('#00aa00');
        expect(after[0]!.geometry).toBe(geoms[0]);
        expect(after[1]!.geometry).toBe(geoms[1]);
        expectSamePlace(boxBefore, worldBox(root));
    });
});

describe('§SLAB116-BOX-AT-CENTROID (L-11781) — a degraded box sits on its ring, never on the world origin', () => {

    it('H · a NON-SIMPLE ring (refused per ADR-0299) degrades to a box centred on the ring centroid', () => {
        // The same four corners as RING, ordered as a bowtie so edge 0→1 crosses 2→3.
        const bowtie = [{ x: 40, y: -60 }, { x: 52, y: -51 }, { x: 52, y: -60 }, { x: 40, y: -51 }];
        const b = makeBuilder();
        b.updateSlab(slabData({ polygon: bowtie }));
        const root = b.getRootById('slab-l5')!;
        const [mesh] = bodyMeshes(root);
        expect(mesh!.geometry, 'the refusal must degrade to a box, not triangulate a crossing ring').toBeInstanceOf(THREE.BoxGeometry);
        expect(mesh!.userData.degraded, 'ADR-0299 §4 — degraded output is MARKED').toBeTruthy();

        const box = worldBox(root);
        const cx = (box.min.x + box.max.x) / 2;
        const cz = (box.min.z + box.max.z) / 2;
        // Pre-fix: (0, ·, 0) — the box was placed at childOffset = −centroid, i.e. on
        // `data.position`, which is the world origin for every plan-tool slab.
        expect(cx).toBeCloseTo(CENTROID.x, TOL);
        expect(cz).toBeCloseTo(CENTROID.z, TOL);
        // And still at the right storey: top = elevation + baseOffset, C92 §10.
        expect(box.max.y).toBeCloseTo(L5_ELEVATION, TOL);
        expect(box.min.y).toBeCloseTo(L5_ELEVATION - THICKNESS, TOL);
    });
});
