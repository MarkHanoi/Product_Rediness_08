/**
 * PlumbingElevationSymbolBuilder — §FEAT-PLUMBING-PLAN-ELEV-SYMBOLS (L-221 P3)
 *
 * GENUINELY NEW: the first symbol builder that injects ELEVATION linework.
 * Every prior symbol builder (Door/Window/Sofa/Bed/Chair/Kitchen/Wardrobe/Tree/
 * Column/WallLayer) is plan-only. The founder asked for BOTH plan and elevation
 * ("the existing toilets, showers etc. elevations AND plan view are true
 * projections — too many lines"), so plan-symbol reuse is not an option — a
 * plan toilet symbol is a top view and is meaningless on a vertical projection.
 *
 * Decision (recorded here; C06 UI-shell/tools + DOC-2.x plan-symbol material):
 *   Elevation gets its OWN symbol set — a family FRONT profile (stepped
 *   silhouette in the X-Y plane) + a bounding SIDE profile (Z-Y plane), authored
 *   in `PlumbingSymbolGeometry.buildElevationLinework`. This is option (b) from
 *   the brief — a simplified silhouette + profile derived from the fixture's
 *   parametric footprint (NOT its triangulated mesh, NOT the plan symbol). It
 *   reuses the exact builder seam (local linework → world transform →
 *   toDrawingSpace → addProjectionLines → registerSegmentUUID), only in vertical
 *   planes. Suppression of the dense mesh edge-dump in elevation is via the
 *   `skipInElevation` mesh flag (PlumbingFragmentBuilder), the elevation sibling
 *   of the existing plan-only `skipInPlan` flag.
 *
 * Contract compliance mirrors PlumbingPlanSymbolBuilder (§01 §5 / §02 §1.2 / §05).
 * Called by: EdgeProjectorService.project() for elevation views only.
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { ViewDefinition, registerSegmentUUID, storeRegistry } from '@pryzm/core-app-model';
import type { PlumbingFixtureData } from './PlumbingTypes';
import { buildElevationLinework } from './PlumbingSymbolGeometry';
import { readFixtureRotationEuler } from './PlumbingFixtureFrame';

const PLMB_LAYER = 'A-PLMB';

interface ReadablePlumbingStore {
    getAll: () => PlumbingFixtureData[];
}

export class PlumbingElevationSymbolBuilder {
    /**
     * Injects elevation silhouette/profile symbols for fixtures visible in this
     * elevation. Filters by the elevation's level when it carries one; a
     * building-wide elevation (no levelId) includes every fixture and lets the
     * view crop / hidden-line pass cull. §01 §5 — no store mutations.
     */
    inject(drawing: OBC.TechnicalDrawing, viewDef: ViewDefinition): void {
        const store = storeRegistry.getStoreForType('plumbing') as ReadablePlumbingStore | undefined;
        if (!store || typeof store.getAll !== 'function') return;

        const levelId = viewDef.spatial?.levelId;

        if (!drawing.layers.has(PLMB_LAYER)) drawing.layers.create(PLMB_LAYER);

        let injected = 0;
        for (const fixture of store.getAll()) {
            if (levelId && fixture.levelId !== levelId) continue;

            const positions = buildElevationLinework(fixture);
            if (positions.length === 0) continue;

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

            const lineSegments = new THREE.LineSegments(
                geo,
                new THREE.LineBasicMaterial({ color: 0x000000 }),
            );
            this._applyTransform(lineSegments, fixture);
            lineSegments.updateWorldMatrix(true, false);

            const projected = OBC.TechnicalDrawing.toDrawingSpace(lineSegments, drawing);
            drawing.addProjectionLines(projected, PLMB_LAYER);
            registerSegmentUUID(drawing, projected, fixture.id);
            geo.dispose();
            injected++;
        }

        if (injected > 0) {
            console.log(
                `[PlumbingElevationSymbolBuilder] Injected ${injected} plumbing elevation ` +
                `symbol(s) into view ${viewDef.id}`,
            );
        }
    }

    /**
     * §PLUMBSYM161 — SAME defect and SAME fix as `PlumbingPlanSymbolBuilder`'s
     * twin method: `fixture.rotation` reads via `readFixtureRotationEuler`, not
     * the public `Euler` getters, because the store hands back a
     * `structuredClone`d record that has lost them. See
     * `PlumbingFixtureFrame.ts`'s `readFixtureRotationEuler` header.
     */
    private _applyTransform(obj: THREE.Object3D, fixture: PlumbingFixtureData): void {
        const p = fixture.position;
        if (p) obj.position.set(Number(p.x) || 0, Number(p.y) || 0, Number(p.z) || 0);
        if (fixture.rotation) obj.quaternion.setFromEuler(readFixtureRotationEuler(fixture.rotation));
    }
}

/** Singleton — imported by EdgeProjectorService, called once per elevation view. */
export const plumbingElevationSymbolBuilder = new PlumbingElevationSymbolBuilder();
