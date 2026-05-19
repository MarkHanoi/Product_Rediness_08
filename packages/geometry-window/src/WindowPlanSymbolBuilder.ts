/**
 * WindowPlanSymbolBuilder — Phase 6 (Contract 19)
 *
 * Injects a window frame symbol (two parallel lines across the wall opening +
 * a mid-pane glazing line) into a TechnicalDrawing for all windows on the
 * active plan level.
 *
 * Windows are hosted elements — their frame geometry is embedded in the parent
 * wall mesh and cannot be individually selected after NativeElementMeshExporter
 * projection.  This builder injects dedicated LineSegments for each window and
 * registers each set's UUID so that plan-view hitTest can return the window's
 * own element ID.
 *
 * Contract compliance:
 *   §01 §5  — pure read; no store mutations; result lives in the TechnicalDrawing.
 *   §02 §1.2 — wall geometry read from wallStore on every call; no cache.
 *   §05     — pure service; no DOM, no BIM-UI components.
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import type { ViewDefinition } from '@pryzm/core-app-model';
import { windowStore } from '@pryzm/geometry-window';
import { registerSegmentUUID } from '@pryzm/core-app-model';
import { storeRegistry } from '@pryzm/core-app-model';
import { vgGovernanceStore } from '@pryzm/visibility';

const WINDOW_LAYER = 'A-GLAZ';
/**
 * §WIN-AUDIT-2026 M5 — separate cut vs projection layers (mirrors door builder):
 *   • A-GLAZ-CUT  → frame jamb edges (cut by the section plane), heavy.
 *   • A-GLAZ-PROJ → frame face lines + glazing centreline (projection), light.
 */
const WINDOW_LAYER_CUT  = 'A-GLAZ-CUT';
const WINDOW_LAYER_PROJ = 'A-GLAZ-PROJ';

const LW_CUT  = 2;
const LW_PROJ = 1;


export class WindowPlanSymbolBuilder {
    /**
     * Injects window plan symbols for all windows on the active level.
     *
     * Per window:
     *   1. Resolve opening centre from wall baseLine + window.offset (CENTER convention).
     *   2. Draw two parallel lines across the opening width (frame outer faces).
     *   3. Draw a centre line to represent the glazing pane.
     *   4. Register the resulting LineSegments UUID for hitTest selection.
     */
    inject(drawing: OBC.TechnicalDrawing, viewDef: ViewDefinition): void {
        const levelId = viewDef.spatial?.levelId;
        if (!levelId) return;

        // §WINDOW-AUDIT-2026 (DI cleanup): resolve via storeRegistry instead of window-global.
        const wallStore = storeRegistry.getStoreForType('wall') as {
            getById: (id: string) => any;
            getAllWindows?: () => any[];
        } | undefined;
        if (!wallStore) {
            console.warn('[WindowPlanSymbolBuilder] wallStore not registered in storeRegistry — skipping window injection');
            return;
        }

        for (const layer of [WINDOW_LAYER, WINDOW_LAYER_CUT, WINDOW_LAYER_PROJ]) {
            if (!drawing.layers.has(layer)) drawing.layers.create(layer);
        }

        let injectedCount = 0;

        // Prefer wallStore.getAllWindows() — authoritative after project reload.
        // windowStore singleton is only populated during the current session.
        const wins: any[] = typeof wallStore.getAllWindows === 'function'
            ? wallStore.getAllWindows()
            : windowStore.getAll();

        for (const win of wins) {
            const wallData = wallStore.getById(win.wallId);
            if (!wallData) continue;
            if (wallData.levelId !== levelId) continue;

            // §W5 — VG governance: skip hidden windows entirely.
            if (vgGovernanceStore.getEffectiveStyle('Window', win.id).hidden) continue;

            const geos = this._computeFrameGeometry(win, wallData);
            if (!geos) continue;

            // ── Cut symbol (heavy) — jamb edges ────────────────────────────────
            if (geos.cut) {
                const cutSeg = new THREE.LineSegments(
                    geos.cut,
                    new THREE.LineBasicMaterial({ color: 0x000000, linewidth: LW_CUT }),
                );
                cutSeg.userData = { lineWeight: LW_CUT, role: 'cut', elementType: 'Window' };
                cutSeg.updateWorldMatrix(true, false);
                const projectedCut = OBC.TechnicalDrawing.toDrawingSpace(cutSeg, drawing);
                drawing.addProjectionLines(projectedCut, WINDOW_LAYER_CUT);
                registerSegmentUUID(drawing, projectedCut, win.id);
            }

            // ── Projection symbol (light) — frame faces + glazing centreline ───
            if (geos.proj) {
                const projSeg = new THREE.LineSegments(
                    geos.proj,
                    new THREE.LineBasicMaterial({ color: 0x000000, linewidth: LW_PROJ }),
                );
                projSeg.userData = { lineWeight: LW_PROJ, role: 'projection', elementType: 'Window' };
                projSeg.updateWorldMatrix(true, false);
                const projectedProj = OBC.TechnicalDrawing.toDrawingSpace(projSeg, drawing);
                drawing.addProjectionLines(projectedProj, WINDOW_LAYER_PROJ);
                registerSegmentUUID(drawing, projectedProj, win.id);
            }

            injectedCount++;
        }

        if (injectedCount > 0) {
            console.log(
                `[WindowPlanSymbolBuilder] Injected ${injectedCount} window symbol(s) ` +
                `into view ${viewDef.id} (level ${levelId})`,
            );
        }
    }

    private _computeFrameGeometry(win: any, wallData: any):
        { cut: THREE.BufferGeometry | null; proj: THREE.BufferGeometry | null } | null {
        const bl0 = wallData.baseLine?.[0];
        const bl1 = wallData.baseLine?.[1];
        if (!bl0 || !bl1) return null;

        const start = new THREE.Vector3(Number(bl0.x), 0, Number(bl0.z));
        const end   = new THREE.Vector3(Number(bl1.x), 0, Number(bl1.z));
        const dir   = new THREE.Vector3().subVectors(end, start).normalize();
        const normal = new THREE.Vector3(-dir.z, 0, dir.x);

        const wallThickness = Number(wallData.thickness ?? 0.2);
        const halfThick = wallThickness / 2;

        const centre = start.clone().addScaledVector(dir, Number(win.offset));
        const halfW  = Number(win.width) / 2;

        // Corner A and B of the opening along the wall direction
        const edgeA = centre.clone().addScaledVector(dir, -halfW);
        const edgeB = centre.clone().addScaledVector(dir,  halfW);

        // Frame outer face 1 and 2 (along left normal and right normal of wall)
        const n1 = normal.clone().multiplyScalar(halfThick);
        const n2 = normal.clone().multiplyScalar(-halfThick);

        // §M5 — split into cut vs projection accumulators.
        // CUT  = jamb edges (connecting the two frame face lines at each opening end)
        //        — these are the actual cut profile through the wall thickness.
        // PROJ = the two parallel frame face lines + the glazing centre line —
        //        beyond the cut plane, projected onto the section.
        const cutPositions:  number[] = [];
        const projPositions: number[] = [];

        const a1 = edgeA.clone().add(n1);
        const b1 = edgeB.clone().add(n1);
        const a2 = edgeA.clone().add(n2);
        const b2 = edgeB.clone().add(n2);

        // PROJ — outer frame line 1 (wall outer face side)
        projPositions.push(a1.x, 0, a1.z, b1.x, 0, b1.z);
        // PROJ — outer frame line 2 (wall inner face side)
        projPositions.push(a2.x, 0, a2.z, b2.x, 0, b2.z);
        // PROJ — glazing centre line
        projPositions.push(edgeA.x, 0, edgeA.z, edgeB.x, 0, edgeB.z);

        // CUT — jamb lines at each end (cut profile of the frame at the section plane)
        cutPositions.push(a1.x, 0, a1.z, a2.x, 0, a2.z);
        cutPositions.push(b1.x, 0, b1.z, b2.x, 0, b2.z);

        const cutGeo = new THREE.BufferGeometry();
        cutGeo.setAttribute('position', new THREE.Float32BufferAttribute(cutPositions, 3));
        const projGeo = new THREE.BufferGeometry();
        projGeo.setAttribute('position', new THREE.Float32BufferAttribute(projPositions, 3));

        return { cut: cutGeo, proj: projGeo };
    }
}

export const windowPlanSymbolBuilder = new WindowPlanSymbolBuilder();
