/**
 * PlumbingPlanSymbolBuilder — §FEAT-PLUMBING-PLAN-ELEV-SYMBOLS (L-221)
 *
 * Injects a CLEAN 2D plan-view symbol for every plumbing fixture into the active
 * TechnicalDrawing, after the base 3D-edge projection completes — mirroring the
 * DoorPlanSymbolBuilder / SofaPlanSymbolBuilder architecture exactly.
 *
 * Why this exists:
 *   The LOD400 fixture meshes (ToiletGeometry, ShowerGeometry, sink, bath, …)
 *   are extruded D-silhouettes + bevels + spheres + cylinders, so the generic
 *   `THREE.EdgesGeometry` projection emits thousands of triangulation edges per
 *   fixture (measured: ~55 ms edge-extraction + ~10.8 k hidden-line-removal
 *   segments for ONE toilet). An architectural plan shows a toilet as a
 *   standardised symbol (bowl outline + cistern rectangle), not a mesh trace.
 *
 *   Therefore: every fixture-part mesh tags `userData.skipInPlan = true` (in
 *   PlumbingFragmentBuilder) so EdgeProjectorService excludes it from plan-view
 *   projection, and this builder injects the clean 2D symbol instead — the same
 *   suppress-then-replace mechanism doors/sofas/kitchens use.
 *
 * Contract compliance:
 *   §01 §5   — pure read; no store mutations; result lives in the TechnicalDrawing.
 *   §02 §1.2 — fixture data read from the plumbing store on every call; no cache.
 *   §05      — pure service; no DOM, no BIM-UI components.
 *
 * Called by: EdgeProjectorService.project() (plan / detail / structural-plan).
 */

import * as THREE from '@pryzm/renderer-three/three';
import { projectToDrawingSpace, type DrawingSurface } from '@pryzm/core-app-model';
import { ViewDefinition, registerSegmentUUID, storeRegistry } from '@pryzm/core-app-model';
import type { PlumbingFixtureData } from './PlumbingTypes';
import { buildPlanLinework } from './PlumbingSymbolGeometry';
import { readFixtureRotationEuler } from './PlumbingFixtureFrame';

/** ISO 13567 DXF layer for plumbing/MEP fixtures — matches ELEMENT_TYPE_TO_PROJECTION_LAYER. */
const PLMB_LAYER = 'A-PLMB';

interface ReadablePlumbingStore {
    getAll: () => PlumbingFixtureData[];
}

export class PlumbingPlanSymbolBuilder {
    /**
     * Injects clean plan symbols for all fixtures on the active level.
     * §01 §5 — produces no store mutations.
     */
    inject(drawing: DrawingSurface, viewDef: ViewDefinition): void {
        const levelId = viewDef.spatial?.levelId;
        if (!levelId) return;

        const store = storeRegistry.getStoreForType('plumbing') as ReadablePlumbingStore | undefined;
        if (!store || typeof store.getAll !== 'function') return;

        if (!drawing.layers.has(PLMB_LAYER)) drawing.layers.create(PLMB_LAYER);

        let injected = 0;
        for (const fixture of store.getAll()) {
            if (fixture.levelId !== levelId) continue;

            const positions = buildPlanLinework(fixture);
            if (positions.length === 0) continue;

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

            const lineSegments = new THREE.LineSegments(
                geo,
                new THREE.LineBasicMaterial({ color: 0x000000 }),
            );
            // Match PlumbingFragmentBuilder's placement (root.position = data.position,
            // root.quaternion = data.rotation) so the symbol lands exactly on the mesh.
            this._applyTransform(lineSegments, fixture);
            lineSegments.updateWorldMatrix(true, false);

            const projected = projectToDrawingSpace(lineSegments, drawing);
            drawing.addProjectionLines(projected, PLMB_LAYER);
            registerSegmentUUID(drawing, projected, fixture.id);
            geo.dispose();
            injected++;
        }

        if (injected > 0) {
            console.log(
                `[PlumbingPlanSymbolBuilder] Injected ${injected} plumbing symbol(s) ` +
                `into view ${viewDef.id} (level ${levelId})`,
            );
        }
    }

    /**
     * §PLUMBSYM161 — `fixture.rotation` reads via `readFixtureRotationEuler`, NOT
     * `Number(r.x) || 0`. The store hands back a `structuredClone`d record, which
     * strips `THREE.Euler`'s prototype (its public `x`/`y`/`z`/`order` getters)
     * while keeping its private `_x`/`_y`/`_z`/`_order` fields intact. Reading the
     * public getters off that corpse silently yields `undefined` for every
     * field, so the OLD code here always drew every plumbing plan symbol at yaw
     * ZERO — see `PlumbingFixtureFrame.ts`'s `readFixtureRotationEuler` header
     * for the full measurement (§PLUMBSYM161, L-12680).
     */
    private _applyTransform(obj: THREE.Object3D, fixture: PlumbingFixtureData): void {
        const p = fixture.position;
        if (p) obj.position.set(Number(p.x) || 0, Number(p.y) || 0, Number(p.z) || 0);
        if (fixture.rotation) obj.quaternion.setFromEuler(readFixtureRotationEuler(fixture.rotation));
    }
}

/**
 * Singleton — imported by EdgeProjectorService and called once per plan view
 * after the base mesh-edge projection completes. §01 §5 — never stored in any
 * PRYZM ElementStore.
 */
export const plumbingPlanSymbolBuilder = new PlumbingPlanSymbolBuilder();
