/**
 * §FEAT-DOOR-3D-LOD (L-266) — the 3D door (and therefore the ELEVATION) consumes DetailLevel.
 *
 * ADR-121 §3.3, the headline number: of 42 (element × view-type) pairs, EXACTLY TWO
 * discriminate the detail level — door×plan and window×plan. **ELEVATION AND SECTION
 * CONSUME LOD IN ZERO CELLS.** That is the "built plan-first, never carried across"
 * disease, and this suite kills it for the door row.
 *
 * The founder: *"Can you improve the LOD of the door in 3D and plan view and elevation?
 * More detailed?"* — with a reference elevation showing a frame with a visible REBATE, a
 * leaf with a PANEL / RAIL reveal, three HINGES, and a LEVER with an ESCUTCHEON.
 *
 * WHY THE 3D MESH IS THE RIGHT PLACE (and not a second symbol engine): an elevation is a
 * PROJECTION OF THESE MESHES. ADR-121 §4.3 — *"One resolver, three consumers — NOT a
 * second symbol engine per view type."* So the mesh gains the articulation, the elevation
 * inherits it, and the tier is resolved by the SAME `resolveEffectiveDetailLevel` the plan
 * symbol calls, against the real `vd-sys-3d-1` ViewDefinition. No private `detailed` flag.
 *
 *   coarse 100 — silhouette: frame + plain leaf slab. No ironmongery, no reveals.
 *   medium 200 — + hinges, handle, glazing/battens: EXACTLY WHAT SHIPPED BEFORE, so no
 *                view setting can regress today's model.
 *   fine   300 — + frame REBATE (planted stop), RAIL-AND-STILE leaf, ESCUTCHEON on BOTH
 *                faces. Every dimension from resolveDoorDimensions + the system type.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { viewDefinitionStore, DEFAULT_3D_VIEW_ID, initDefaultViewsManager } from '@pryzm/core-app-model';
import { DoorBuilder } from '../src/DoorBuilder';

const WALL = {
    id: 'w1', levelId: 'L0', thickness: 0.2, height: 3,
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
};
const wallStoreStub = {
    getById: () => WALL,
    getLevelById: () => ({ id: 'L0', elevation: 0 }),
} as never;

const DOOR = {
    id: 'd1', wallId: 'w1', openingId: 'o1',
    width: 0.9, height: 2.1, offset: 1.0, sillHeight: 0,
    doorType: 'single', hingesSide: 'left', handleSide: 'right', swingDirection: 'inward',
    frameColor: '#8b5a2b', leafColor: '#c8a165', handle: true, handleHeight: 1.05,
    threshold: true, thresholdHeight: 0.02, leafVisibleInPlan: false,
};

type Lod = 'coarse' | 'medium' | 'fine';

/** Build the door at `lod` by setting the 3D VIEW's detail level — the real precedence path. */
function buildAt(lod: Lod): THREE.Mesh[] {
    initDefaultViewsManager();                                  // ensures vd-sys-3d-1 exists
    viewDefinitionStore.update(DEFAULT_3D_VIEW_ID, { output: { detailLevel: lod } } as never);
    const scene = new THREE.Scene();
    const builder = new DoorBuilder(scene, wallStoreStub);
    builder.setMeshConsolidation(false); // §MESH110 — this file pins the BUILD stage (per-part structure); the MERGE stage is pinned in DoorMeshConsolidation.test.ts
    (builder as unknown as { rebuild(d: unknown): void }).rebuild(DOOR);
    const meshes: THREE.Mesh[] = [];
    scene.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    return meshes;
}

const roles = (m: THREE.Mesh[]) => m.map(x => (x.userData.role as string) ?? 'frame');
const count = (m: THREE.Mesh[], role: string) => roles(m).filter(r => r === role).length;

describe('L-266 — the 3D door reads the SHARED DetailLevel resolver, via the 3D ViewDefinition', () => {
    it('the view\'s Detail Level actually changes the mesh (it is a real consumer)', () => {
        const c = buildAt('coarse').length;
        const m = buildAt('medium').length;
        const f = buildAt('fine').length;
        expect(c).toBeLessThan(m);
        expect(m).toBeLessThan(f);
    });

    it('coarse is the MASSING door — frame + leaf slab, no ironmongery, no reveals', () => {
        const meshes = buildAt('coarse');
        expect(count(meshes, 'doorHandle')).toBe(0);
        expect(count(meshes, 'doorLeaf')).toBe(1);     // ONE slab: no rails, no panels
    });

    it('medium is TODAY\'S door — hinges + handle + a leaf slab (no regression, ever)', () => {
        const meshes = buildAt('medium');
        expect(count(meshes, 'doorHandle')).toBeGreaterThan(0);
        expect(count(meshes, 'doorLeaf')).toBe(1);
    });

    it('fine adds the RAIL-AND-STILE leaf — the founder\'s panel/rail reveal', () => {
        const meshes = buildAt('fine');
        // 2 stiles + top rail + bottom rail + >= 1 recessed panel.
        expect(count(meshes, 'doorLeaf')).toBeGreaterThanOrEqual(5);
    });

    it('fine puts an ESCUTCHEON + LEVER on BOTH faces (it had a handle on ONE side)', () => {
        const mediumZ = buildAt('medium').filter(m => m.userData.role === 'doorHandle').map(m => m.position.z);
        const fineZ   = buildAt('fine').filter(m => m.userData.role === 'doorHandle').map(m => m.position.z);
        expect(mediumZ.every(z => z > 0)).toBe(true);                 // one face only
        expect(fineZ.some(z => z > 0) && fineZ.some(z => z < 0)).toBe(true);
        expect(fineZ.length).toBe(mediumZ.length * 2);                // rose + lever, both faces
    });

    it('fine adds the frame REBATE — and it is DERIVED, not typed', () => {
        // The stop stands proud of the reveal by frameThickness/3 and sits BEHIND the leaf
        // face, so it must appear at a z strictly greater than half the leaf thickness.
        const frameParts = (lod: Lod) => buildAt(lod)
            .filter(m => (m.userData.role as string | undefined) === undefined)   // frame members
            .filter(m => m.position.z > 0.04 / 2);                                // behind the leaf face
        expect(frameParts('fine').length).toBe(3);       // 2 jamb stops + the head stop
        expect(frameParts('medium').length).toBe(0);     // the frame was three plain boxes
    });
});
