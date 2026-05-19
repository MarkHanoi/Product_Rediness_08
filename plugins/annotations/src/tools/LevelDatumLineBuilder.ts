/**
 * LevelDatumLineBuilder — DOC-2.5d
 *
 * Injects horizontal level datum lines into a TechnicalDrawing for section and
 * elevation views, and creates elevation label annotations in AnnotationStore.
 *
 * Every AEC-compliant section/elevation drawing must show horizontal datum lines
 * at each storey height with elevation values so structural heights can be read
 * directly from the drawing. Without these, section/elevation views cannot be
 * used as construction documentation.
 *
 * Algorithm per level:
 *   1. Read all levels from BimManager.getLevels() (§02 §1.4 — never cache).
 *   2. For each level, create a world-space horizontal line spanning ±HALF_EXTENT
 *      at the level's world Y elevation.
 *   3. Project via OBC.TechnicalDrawing.toDrawingSpace() and inject on A-ANNO-LEVL.
 *   4. Dispatch CreateAnnotationCommand(level-datum-line) for the elevation label
 *      so it appears in the AnnotationRenderLayer at the left end of the datum line.
 *
 * Contract compliance:
 *   §01 §5  — pure service; no direct store mutations; uses CreateAnnotationCommand.
 *   §02 §1.4 — level elevation always from bimManager.getLevels(); never cached.
 *   §05     — no DOM, no BIM-UI components.
 *
 * Called by:
 *   SectionViewService._projectSection()    — after section projection (DOC-2.5d)
 *   ViewController._activateElevationView() — after elevation projection (DOC-2.5d)
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import type { ViewDefinition } from '@pryzm/core-app-model';
import { makeAnnotationElement } from '../subsystem/AnnotationTypes';
import { makePointRef } from '../subsystem/AnnotationReference';
import { CreateAnnotationCommand } from '../commands/CreateAnnotationCommand';

/** ISO 13567 DXF layer for level datum lines and annotations. */
const LEVEL_LAYER = 'A-ANNO-LEVL';

/**
 * Half-span of the datum line in world metres.
 * Large enough to cover any typical building footprint.
 * toDrawingSpace naturally clips to the drawing extent.
 */
const HALF_EXTENT = 200;

export class LevelDatumLineBuilder {
    /**
     * Injects level datum lines into a TechnicalDrawing for section/elevation views.
     * Also dispatches CreateAnnotationCommand for each elevation label.
     *
     * @param drawing  The TechnicalDrawing to inject into.
     * @param viewDef  The active ViewDefinition (must be 'section' or 'elevation').
     */
    inject(drawing: OBC.TechnicalDrawing, viewDef: ViewDefinition): void {
        if (viewDef.viewType !== 'section' && viewDef.viewType !== 'elevation') return;

        const bimManager = window.bimManager;
        if (!bimManager || typeof bimManager.getLevels !== 'function') {
            console.warn('[LevelDatumLineBuilder] bimManager not available — skipping datum line injection');
            return;
        }

        // §02 §1.4 — always call getLevels(); never cache.
        const levels: Array<{ id: string; name: string; elevation: number }> = bimManager.getLevels();
        if (!levels || levels.length === 0) return;

        if (!drawing.layers.has(LEVEL_LAYER)) {
            drawing.layers.create(LEVEL_LAYER);
        }

        // Determine the horizontal span direction in world space.
        const spanDir = this._computeSpanDirection(viewDef);

        const commandManager = window.commandManager; // TODO(TASK-06)
        let injectedCount = 0;

        for (const level of levels) {
            // §02 §1.4 — re-read elevation from BimManager, not from the cached list object.
            const worldY: number = typeof bimManager.getLevelById === 'function'
                ? (bimManager.getLevelById(level.id)?.elevation ?? level.elevation)
                : level.elevation;

            // Build world-space datum line: horizontal at worldY spanning ±HALF_EXTENT.
            const p0 = new THREE.Vector3(
                -spanDir.x * HALF_EXTENT,
                worldY,
                -spanDir.z * HALF_EXTENT,
            );
            const p1 = new THREE.Vector3(
                spanDir.x * HALF_EXTENT,
                worldY,
                spanDir.z * HALF_EXTENT,
            );

            const positions = [p0.x, p0.y, p0.z, p1.x, p1.y, p1.z];
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

            const lineSegs = new THREE.LineSegments(
                geo,
                new THREE.LineBasicMaterial({ color: 0x000000 }),
            );
            lineSegs.updateWorldMatrix(true, false);

            const projected = OBC.TechnicalDrawing.toDrawingSpace(lineSegs, drawing);
            drawing.addProjectionLines(projected, LEVEL_LAYER);

            // Dispatch CreateAnnotationCommand for the elevation label.
            // Reference point is the world-space left end of the datum line.
            // AnnotationRenderLayer projects this to screen and renders the label text.
            if (commandManager && typeof commandManager.execute === 'function') {
                const labelText = this._formatElevation(worldY);
                const refPoint = makePointRef(new THREE.Vector3(p0.x, worldY, p0.z));
                refPoint.cachedPosition = { x: p0.x, y: worldY, z: p0.z };

                const ann = makeAnnotationElement(
                    crypto.randomUUID(),
                    'level-datum-line',
                    viewDef.id,
                    [refPoint],
                    { modelPoints: [{ x: p0.x, y: worldY, z: p0.z }], offset: 0 },
                    {
                        levelId: level.id,
                        elevationLabel: labelText,
                    },
                );
                try {
                    // [E.5.x] Bus telemetry — fire-and-forget; legacy commandManager drives state during migration.
                    // P13 (A36): typed payload so AnnotationsState receives the correct id/viewId/kind.
                    if (window.runtime?.bus) { window.runtime.bus.executeCommand('annotation.create', { id: ann.id, viewId: ann.ownerViewId, kind: ann.type as any }).catch(() => {}); }
                    commandManager.execute(new CreateAnnotationCommand(ann));
                } catch (err) {
                    // Non-fatal — datum lines in TechnicalDrawing are already injected.
                    console.warn('[LevelDatumLineBuilder] CreateAnnotationCommand failed:', err);
                }
            }

            injectedCount++;
        }

        if (injectedCount > 0) {
            console.log(
                `[LevelDatumLineBuilder] Injected ${injectedCount} datum line(s) ` +
                `into ${viewDef.viewType} view "${viewDef.id}"`,
            );
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Formats a world-Y elevation as an AEC elevation label.
     * e.g.  0      → "±0.000"
     *       3.5    → "+3.500"
     *      -1.0    → "-1.000"
     */
    private _formatElevation(worldY: number): string {
        if (Math.abs(worldY) < 0.0005) return '±0.000';
        const sign = worldY > 0 ? '+' : '-';
        return `${sign}${Math.abs(worldY).toFixed(3)}`;
    }

    /**
     * Computes the world-space span direction (unit vector in XZ) for the datum line.
     *
     * - Section views:   perpendicular to the section normal in XZ (e.g. normal=(0,0,-1) → span=(1,0,0)).
     * - Elevation views: defaults to world X span (appropriate for Front/Back).
     *                    Left/Right elevations also use X by convention — datum lines span the building.
     */
    private _computeSpanDirection(viewDef: ViewDefinition): THREE.Vector3 {
        const sp = viewDef.spatial?.sectionPlane;
        if (sp) {
            const normal = new THREE.Vector3(sp.normal[0], 0, sp.normal[2]).normalize();
            if (normal.lengthSq() < 0.0001) return new THREE.Vector3(1, 0, 0);
            // Perpendicular in XZ: rotate 90° around world Y.
            return new THREE.Vector3(-normal.z, 0, normal.x).normalize();
        }
        // Elevation view — default to world X span.
        return new THREE.Vector3(1, 0, 0);
    }
}

/**
 * Singleton instance.
 * §01 §5 — never stored in any PRYZM ElementStore.
 */
export const levelDatumLineBuilder = new LevelDatumLineBuilder();
