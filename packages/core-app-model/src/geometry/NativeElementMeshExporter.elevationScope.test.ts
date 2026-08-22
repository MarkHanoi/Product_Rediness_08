/**
 * §ELEV-SCOPE-IS-THE-SCOPE (L-6000..L-6004) — THE FOUNDER'S NAMED ACCEPTANCE CASE.
 *
 * Founder, 2026-08-22, verbatim:
 *   *"i am selecting a window within the elevation — the elevation scope is defined on the
 *    right hand side split view — i am selecting a window that should be on the scope of the
 *    crop box but is not, is way further away — absolutely incorrect"*
 *   *"also the performance of opening the elevation view is really slow"*
 *
 * His console, on EVERY pass:
 *   [NativeElementMeshExporter] No levelId — exporting all 385 elements across 7 levels
 *                               (viewType=elevation)
 *   [EdgeProjectorService] project() viewId=vd-sys-elev-south dir=(0,0,-1) near=0.000 far=2.857
 *                         cullAABB(plan-family only)=[-15.49,-6.83 -> 0.35,-3.87]
 *
 * ⭐ ONE DEFECT, TWO SYMPTOMS. The exporter applied NO spatial scope to an elevation at all —
 * `cropRegion` was read only when `resolveViewScope(viewType).planFamily`, so an elevation
 * exported the WHOLE MODEL. The drawing therefore contained elements far outside the user's
 * crop (symptom 1: a window picked in the elevation resolves to one metres away), and every
 * element in the model was proxied and edge-projected on every pass (symptom 2: slow).
 *
 * ⚠ THE PREDECESSOR'S REASONING, AND WHY IT WAS HALF RIGHT (§FIX-ELEVATION-CROP-CLIP, L-123).
 * It said an XZ box "mixes the drawing-horizontal axis with the view DEPTH axis; a flat XZ box
 * CULL then drops any element that straddles the crop's depth slab". The DIAGNOSIS was right —
 * an axis-aligned XZ box is the wrong shape for an oblique elevation — but the REMEDY (cull
 * nothing) threw away the lateral and vertical bounds along with the depth one. An elevation's
 * crop bounds THREE axes, and this suite asserts all three.
 *
 * ⛔ AND IT IS NOT FIXED BY RE-ENABLING THE FLAT XZ AABB. That box really is the wrong shape.
 * The scope here is the SAME ORIENTED FRAME the projector already clips to
 * (`resolveSectionVolumeBox` delegates to `resolveElevationScopeFrame`), so no fourth authority
 * for the depth window is minted — §CROP-IS-THE-CLIP (L-4500..L-4504) stands.
 *
 * THE FIXTURE IS THE FOUNDER'S OWN SCOPE, reconstructed from the logged `cullAABB` + `far`:
 *   forward (0,0,-1) · near 0 · far 2.857 · width 15.74 · origin (-7.57, *, -3.92)
 * (inverting `_cropRegionFromSectionVolume`: minX = ox - w/2 - 0.05 = -15.49 ✓,
 *  maxZ = oz + 0.05 = -3.87 ✓, minZ = oz - far - 0.05 = -6.83 ✓.)
 * Every assertion below is a RULE over that frame, never a literal count.
 *
 * Maps C09 §4.6.7 (view scope), C24 (spatial crop vs paper crop), C04 (projection cost).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { NativeElementMeshExporter } from './NativeElementMeshExporter';

/** A box element root centred at (x, y, z). */
function rootAt(id: string, elementType: string, x: number, y: number, z: number, size = 1): THREE.Group {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial());
    mesh.userData.elementType = elementType;
    group.add(mesh);
    group.position.set(x, y, z);
    group.userData = { id, elementType };
    group.updateMatrixWorld(true);
    return group;
}

function fakeBimManager(levels: Array<{ id: string; elevation: number; height: number; childrenIds: string[] }>) {
    return {
        getLevels: () => levels,
        getLevelById: (id: string) => levels.find(l => l.id === id),
    } as never;
}

/** THE FOUNDER'S SOUTH ELEVATION — reconstructed from his console, not invented. */
const FOUNDER_ORIGIN = { x: -7.57, y: 0, z: -3.92 };
const FOUNDER_WIDTH = 15.74;
const FOUNDER_FAR = 2.857;

function southElevation(): never {
    return {
        id: 'vd-sys-elev-south',
        name: 'South Elevation',
        viewType: 'elevation',
        spatial: {
            projectionDirection: { x: 0, y: 0, z: -1 },
            sectionVolume: {
                origin: [FOUNDER_ORIGIN.x, FOUNDER_ORIGIN.y, FOUNDER_ORIGIN.z],
                direction: [0, 0, -1],
                width: FOUNDER_WIDTH,
                height: 3,
                near: 0,
                far: FOUNDER_FAR,
            },
            cropRegion: { minX: -15.49, minZ: -6.83, maxX: 0.35, maxZ: -3.87 },
        },
        crop: { enabled: true, farClip: { offset: FOUNDER_FAR } },
    } as never;
}

/** Seven storeys, exactly as his console reports. */
const SEVEN_LEVELS = Array.from({ length: 7 }, (_, i) => ({
    id: `L${i}`, elevation: i * 3, height: 3, childrenIds: [] as string[],
}));

describe('§ELEV-SCOPE-IS-THE-SCOPE — the elevation crop bounds the exported element set', () => {
    beforeEach(() => elementRegistry.clear());

    function exportWith(elements: Array<{ id: string; type: string; x: number; y: number; z: number }>) {
        const levels = SEVEN_LEVELS.map(l => ({ ...l, childrenIds: [] as string[] }));
        for (const e of elements) {
            elementRegistry.registerRoot(e.id, rootAt(e.id, e.type, e.x, e.y, e.z));
            // Put every element on the storey whose band contains it, so the census is honest.
            const lvl = levels.find(l => e.y >= l.elevation && e.y < l.elevation + l.height) ?? levels[0];
            lvl.childrenIds.push(e.id);
        }
        const exporter = new NativeElementMeshExporter();
        exporter.setBimManager(fakeBimManager(levels));
        const groups = exporter.exportForView(southElevation());
        const ids = new Set(groups.map(g => g.userData.elementUUID as string));
        exporter.releaseGroups(groups, { disposeProxies: true });
        return ids;
    }

    it('AXIS 1 — LATERAL: a window beyond the crop width is NOT exported (the founder symptom)', () => {
        // Both at the same DEPTH and the same HEIGHT as the in-scope one. The ONLY thing that
        // separates them is lateral distance — which is precisely what he pointed at.
        const inScope = { id: 'win-in', type: 'Window', x: FOUNDER_ORIGIN.x, y: 1.2, z: FOUNDER_ORIGIN.z - 1 };
        const farLeft = { id: 'win-far-left', type: 'Window', x: FOUNDER_ORIGIN.x - FOUNDER_WIDTH, y: 1.2, z: FOUNDER_ORIGIN.z - 1 };
        const farRight = { id: 'win-far-right', type: 'Window', x: FOUNDER_ORIGIN.x + FOUNDER_WIDTH, y: 1.2, z: FOUNDER_ORIGIN.z - 1 };

        const ids = exportWith([inScope, farLeft, farRight]);

        expect(ids.has('win-in')).toBe(true);          // the drawing must still contain its subject
        expect(ids.has('win-far-left')).toBe(false);   // RED before the fix
        expect(ids.has('win-far-right')).toBe(false);  // RED before the fix
    });

    it('AXIS 2 — DEPTH: an element behind the far plane is NOT exported', () => {
        const inScope = { id: 'w-near', type: 'Wall', x: FOUNDER_ORIGIN.x, y: 1.2, z: FOUNDER_ORIGIN.z - 1 };
        const behind = { id: 'w-behind', type: 'Wall', x: FOUNDER_ORIGIN.x, y: 1.2, z: FOUNDER_ORIGIN.z - FOUNDER_FAR - 5 };
        const inFront = { id: 'w-in-front', type: 'Wall', x: FOUNDER_ORIGIN.x, y: 1.2, z: FOUNDER_ORIGIN.z + 5 };

        const ids = exportWith([inScope, behind, inFront]);

        expect(ids.has('w-near')).toBe(true);
        expect(ids.has('w-behind')).toBe(false);
        expect(ids.has('w-in-front')).toBe(false);
    });

    it('AXIS 2b — DEPTH STRADDLERS SURVIVE: the real L-123 concern is honoured, not reintroduced', () => {
        // A 8 m-deep wall whose near face is inside the crop and whose far face is well past
        // it. L-123 disabled culling because a CONTAINMENT test would delete this. The scope
        // test is an INTERSECTION test, so it survives — and the projector's own
        // `clipSegmentToSectionBox` then clips it at the boundary (clip, not cull).
        const levels = SEVEN_LEVELS.map(l => ({ ...l, childrenIds: [] as string[] }));
        const straddler = new THREE.Group();
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 8), new THREE.MeshBasicMaterial());
        straddler.add(mesh);
        straddler.position.set(FOUNDER_ORIGIN.x, 1.2, FOUNDER_ORIGIN.z - 2);
        straddler.userData = { id: 'w-straddle', elementType: 'Wall' };
        straddler.updateMatrixWorld(true);
        elementRegistry.registerRoot('w-straddle', straddler);
        levels[0].childrenIds.push('w-straddle');

        const exporter = new NativeElementMeshExporter();
        exporter.setBimManager(fakeBimManager(levels));
        const groups = exporter.exportForView(southElevation());
        const ids = new Set(groups.map(g => g.userData.elementUUID as string));
        exporter.releaseGroups(groups, { disposeProxies: true });

        expect(ids.has('w-straddle')).toBe(true);
    });

    it('AXIS 3 — VERTICAL: the default extent is the WHOLE level stack (L-302 must not regress)', () => {
        // A building elevation spans the full building height by default. An element on the
        // TOP storey of seven must survive; the vertical bound is only narrowed when the user
        // has dragged the top/bottom handle.
        const ground = { id: 'w-l0', type: 'Wall', x: FOUNDER_ORIGIN.x, y: 1.2, z: FOUNDER_ORIGIN.z - 1 };
        const top = { id: 'w-l6', type: 'Wall', x: FOUNDER_ORIGIN.x, y: 19.2, z: FOUNDER_ORIGIN.z - 1 };
        const aboveStack = { id: 'w-sky', type: 'Wall', x: FOUNDER_ORIGIN.x, y: 60, z: FOUNDER_ORIGIN.z - 1 };

        const ids = exportWith([ground, top, aboveStack]);

        expect(ids.has('w-l0')).toBe(true);
        expect(ids.has('w-l6')).toBe(true);
        expect(ids.has('w-sky')).toBe(false);  // outside the level stack entirely
    });

    it('THE COST — an element set of N in the model exports only the in-scope subset', () => {
        // The perf half of the SAME defect, stated as a ratio rather than a millisecond count
        // (a ms figure measured on this machine tells the founder nothing). 20 elements laid
        // out across the plate; only those inside his 15.74 m x 2.857 m scope may be exported.
        const els: Array<{ id: string; type: string; x: number; y: number; z: number }> = [];
        for (let i = 0; i < 20; i++) {
            els.push({
                id: `e${i}`, type: 'FurniturePart',
                x: FOUNDER_ORIGIN.x - 30 + i * 3.2,
                y: 1.2,
                z: FOUNDER_ORIGIN.z - 1,
            });
        }
        const ids = exportWith(els);
        expect(ids.size).toBeLessThan(els.length);
        // The subject of the drawing is still in it — a cheaper drawing that lost its content
        // would be the worse bug.
        expect(ids.size).toBeGreaterThan(0);
    });
});
