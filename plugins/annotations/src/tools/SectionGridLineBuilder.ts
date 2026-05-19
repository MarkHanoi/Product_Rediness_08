/**
 * SectionGridLineBuilder — DOC-2.5e
 *
 * Injects vertical structural grid lines into a TechnicalDrawing for section
 * and elevation views, and creates grid bubble label annotations.
 *
 * Every AEC-compliant section/elevation drawing must show vertical grid lines
 * at each column grid position that intersects the section cut, with alphanumeric
 * bubbles at the top (and optionally bottom) of each line.
 *
 * Algorithm:
 *   1. Read all grids from BimManager.getGrids() (§02 §1.4 — never cache).
 *   2. For each visible grid, compute the world-space XZ intersection of the
 *      grid plane with the section cut plane (derived from viewDef.spatial.sectionPlane).
 *   3. Build a tall vertical LineSegments at (cx, ±HALF_HEIGHT, cz) in world space.
 *   4. Project via OBC.TechnicalDrawing.toDrawingSpace() and inject on S-GRID.
 *   5. Dispatch CreateAnnotationCommand(section-grid-line) for the bubble label
 *      so it appears in the AnnotationRenderLayer at the top of each grid line.
 *
 * Section plane math (THREE.Plane convention: n·p + constant = 0, i.e. n·p = -constant):
 *   X-axis grid (at x = position): z_cut = (-constant - nx * position) / nz   (if |nz| > ε)
 *   Y-axis grid (at z = position): x_cut = (-constant - nz * position) / nx   (if |nx| > ε)
 *   When a grid's plane is parallel to the section normal it is not visible → skip.
 *
 * Contract compliance:
 *   §01 §5  — pure service; no direct store mutations; uses CreateAnnotationCommand.
 *   §02 §1.4 — grids always from bimManager.getGrids(); never cached here.
 *   §05     — no DOM, no BIM-UI components.
 *
 * Called by:
 *   SectionViewService._projectSection()    — after section projection (DOC-2.5e)
 *   ViewController._activateElevationView() — after elevation projection (DOC-2.5e)
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import type { ViewDefinition } from '@pryzm/core-app-model';
import type { Grid } from '@pryzm/core-app-model';
import { makeAnnotationElement } from '../subsystem/AnnotationTypes';
import { makePointRef } from '../subsystem/AnnotationReference';
import { CreateAnnotationCommand } from '../commands/CreateAnnotationCommand';

/** ISO 13567 DXF layer for structural grid lines in section/elevation. */
const GRID_LAYER = 'S-GRID';

/** Half-height of the vertical grid line in world metres. Covers any typical building. */
const HALF_HEIGHT = 100;

/** Dot-product threshold below which a grid is considered parallel to the section. */
const EPSILON = 0.001;

export class SectionGridLineBuilder {
    /**
     * Injects grid lines into a TechnicalDrawing for section/elevation views.
     * Also dispatches CreateAnnotationCommand for each grid bubble label.
     *
     * @param drawing  The TechnicalDrawing to inject into.
     * @param viewDef  The active ViewDefinition (must be 'section' or 'elevation').
     */
    inject(drawing: OBC.TechnicalDrawing, viewDef: ViewDefinition): void {
        if (viewDef.viewType !== 'section' && viewDef.viewType !== 'elevation') return;

        const bimManager = window.bimManager;
        if (!bimManager || typeof bimManager.getGrids !== 'function') {
            console.warn('[SectionGridLineBuilder] bimManager not available — skipping grid line injection');
            return;
        }

        const grids: Grid[] = bimManager.getGrids();
        if (!grids || grids.length === 0) return;

        if (!drawing.layers.has(GRID_LAYER)) {
            drawing.layers.create(GRID_LAYER);
        }

        // Resolve section plane normal components (XZ only — sections are always vertical).
        // THREE.Plane convention: n · p + constant = 0  →  n · p = -constant
        const sp = viewDef.spatial?.sectionPlane;
        const rawNormal = sp?.normal ?? this._normalFromProjDir(viewDef);
        const nx = rawNormal[0];
        const nz = rawNormal[2];
        const constant = sp?.constant ?? 0;

        const commandManager = window.commandManager; // TODO(TASK-06)
        let injectedCount = 0;

        for (const grid of grids) {
            if (!grid.isVisible) continue;

            const cutResult = this._computeCutPoint(grid, nx, nz, constant);
            if (!cutResult) continue; // grid is parallel to the section plane → not visible

            const { cx, cz } = cutResult;

            // Tall vertical line in world space: from (cx, -HALF_HEIGHT, cz) to (cx, +HALF_HEIGHT, cz).
            const positions = [cx, -HALF_HEIGHT, cz, cx, HALF_HEIGHT, cz];
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

            const lineSegs = new THREE.LineSegments(
                geo,
                new THREE.LineBasicMaterial({ color: 0x000000 }),
            );
            lineSegs.updateWorldMatrix(true, false);

            const projected = OBC.TechnicalDrawing.toDrawingSpace(lineSegs, drawing);
            drawing.addProjectionLines(projected, GRID_LAYER);

            // Dispatch CreateAnnotationCommand for the bubble label at the top of the grid line.
            if (commandManager && typeof commandManager.execute === 'function') {
                // Reference point is the world-space top of the vertical line.
                const topPoint = new THREE.Vector3(cx, HALF_HEIGHT, cz);
                const refPoint = makePointRef(topPoint);
                refPoint.cachedPosition = { x: cx, y: HALF_HEIGHT, z: cz };

                const ann = makeAnnotationElement(
                    crypto.randomUUID(),
                    'section-grid-line',
                    viewDef.id,
                    [refPoint],
                    { modelPoints: [{ x: cx, y: HALF_HEIGHT, z: cz }], offset: 0 },
                    {
                        gridId:    grid.id,
                        gridLabel: grid.name,
                    },
                );
                try {
                    // [E.5.x] Bus telemetry — fire-and-forget; legacy commandManager drives state during migration.
                    // P13 (A36): typed payload so AnnotationsState receives the correct id/viewId/kind.
                    if (window.runtime?.bus) { window.runtime.bus.executeCommand('annotation.create', { id: ann.id, viewId: ann.ownerViewId, kind: ann.type as any }).catch(() => {}); }
                    commandManager.execute(new CreateAnnotationCommand(ann));
                } catch (err) {
                    // Non-fatal — grid linework in TechnicalDrawing is already injected.
                    console.warn('[SectionGridLineBuilder] CreateAnnotationCommand failed:', err);
                }
            }

            injectedCount++;
        }

        if (injectedCount > 0) {
            console.log(
                `[SectionGridLineBuilder] Injected ${injectedCount} grid line(s) ` +
                `into ${viewDef.viewType} view "${viewDef.id}"`,
            );
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Computes the world-space XZ position (cx, cz) where the grid plane
     * intersects the section cut plane.
     *
     * Section cut plane equation: nx * x + nz * z = d   where d = -constant
     *
     *   X-axis grid (x = position, z varies):
     *     Substitute x = position → nz * z = d - nx * position → z_cut = (d - nx*p) / nz
     *     Not visible if |nz| ≤ EPSILON (grid plane parallel to section).
     *
     *   Y-axis grid (z = position, x varies):
     *     Substitute z = position → nx * x = d - nz * position → x_cut = (d - nz*p) / nx
     *     Not visible if |nx| ≤ EPSILON (grid plane parallel to section).
     *
     * @returns { cx, cz } or null when the grid is parallel to the section.
     */
    private _computeCutPoint(
        grid: Grid,
        nx: number,
        nz: number,
        constant: number,
    ): { cx: number; cz: number } | null {
        const p = grid.position;
        const d = -constant; // n · p = d for points on the plane

        if (grid.axis === 'X') {
            if (Math.abs(nz) <= EPSILON) return null;
            const zCut = (d - nx * p) / nz;
            return { cx: p, cz: zCut };
        } else {
            // Y-axis grid (z = p)
            if (Math.abs(nx) <= EPSILON) return null;
            const xCut = (d - nz * p) / nx;
            return { cx: xCut, cz: p };
        }
    }

    /**
     * Falls back to deriving an XZ normal from projectionDirection when no
     * explicit sectionPlane is defined (typical for elevation view definitions).
     */
    private _normalFromProjDir(viewDef: ViewDefinition): [number, number, number] {
        const pd = viewDef.spatial?.projectionDirection;
        if (pd) return [pd.x, pd.y, pd.z];
        return [0, 0, -1]; // default: front elevation
    }
}

/**
 * Singleton instance.
 * §01 §5 — never stored in any PRYZM ElementStore.
 */
export const sectionGridLineBuilder = new SectionGridLineBuilder();
