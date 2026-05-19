/**
 * RoofSlopeSymbolBuilder — DOC-2.5f
 *
 * Injects slope direction arrows with rise:run labels into a TechnicalDrawing
 * for all non-flat roof elements visible in the active plan view.
 *
 * In AEC plan drawings, each pitched roof face carries a slope arrow pointing
 * downhill with a "rise:run" ratio label (e.g. "1:4"). Without these, roof
 * plans cannot be used as construction documentation.
 *
 * Algorithm per roof:
 *   1. Skip flat roofs (roofType === 'flat' or slope is undefined/0).
 *   2. Compute world Y of the roof face: bimManager.getLevelById(levelId).elevation
 *      + baseOffset (§02 §1.4 — never cache elevation).
 *   3. For each edge of footprint.polygon:
 *      a. Compute edge midpoint in world XZ.
 *      b. Arrow direction = normalize(edgeMidpoint – centroid) [outward = downslope].
 *      c. Build shaft (centroid → 70% of distance toward midpoint) + arrowhead V.
 *      d. Inject LineSegments on A-ROOF layer.
 *   4. Dispatch CreateAnnotationCommand('roof-slope-arrow') once per roof at centroid
 *      so the AnnotationRenderLayer renders the slope ratio label.
 *
 * Contract compliance:
 *   §01 §5  — pure service; no direct store mutations; uses CreateAnnotationCommand.
 *   §02 §1.4 — level elevation from bimManager.getLevelById(); never cached.
 *   §05     — no DOM, no BIM-UI components.
 *   §07 R-9 — §ROOF-SYSTEM-AUDIT-2026 §5.4: all dependencies (roofStore,
 *             bimManager, commandManager) are constructor-injected. Zero
 *             window-global reads (was: 3 in legacy implementation).
 *
 * Called by:
 *   EdgeProjectorService.project() — plan/detail/structural-plan views (DOC-2.5f).
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import type { ViewDefinition } from '@pryzm/core-app-model';
import type { RoofData } from './RoofTypes.js';
import { makeAnnotationElement } from '@pryzm/plugin-annotations';
import { makePointRef } from '@pryzm/plugin-annotations';
import { CreateAnnotationCommand } from '@pryzm/command-registry';

/** ISO 13567 DXF layer for roof slope annotations. */
const ROOF_LAYER = 'A-ROOF';

/** Half-angle of the arrowhead wings in radians (±30°). */
const ARROWHEAD_HALF_ANGLE = Math.PI / 6;

/** Length of each arrowhead wing in world metres. */
const ARROWHEAD_WING_LEN = 0.2;

/** Fraction of the centroid→midpoint distance used as the shaft length. */
const SHAFT_FRACTION = 0.65;

/** Minimum shaft length in world metres (prevents tiny arrows on small roofs). */
const MIN_SHAFT = 0.4;

/** Maximum shaft length in world metres. */
const MAX_SHAFT = 1.5;

/** Minimal RoofStore surface this builder requires. */
interface RoofStoreLike {
    getByLevel(levelId: string): RoofData[];
}

/** Minimal BimManager surface this builder requires (level elevation lookup). */
interface BimManagerLike {
    getLevelById(id: string): { elevation: number } | undefined;
}

/** Minimal CommandManager surface this builder requires. */
interface CommandManagerLike {
    execute(command: unknown): unknown;
}

export class RoofSlopeSymbolBuilder {
    /**
     * @param roofStore       PRYZM roof data store — read-only.
     * @param bimManager      Spatial authority for level elevations (§02 §1.4).
     * @param commandManager  Command bus for dispatching CreateAnnotationCommand.
     */
    constructor(
        private readonly roofStore:      RoofStoreLike,
        private readonly bimManager:     BimManagerLike,
        private readonly commandManager: CommandManagerLike,
    ) {}

    /**
     * Injects roof slope arrow symbols into a TechnicalDrawing for plan views.
     *
     * @param drawing  The TechnicalDrawing to inject into.
     * @param viewDef  The active ViewDefinition (must be 'plan', 'detail', or 'structural-plan').
     */
    inject(drawing: OBC.TechnicalDrawing, viewDef: ViewDefinition): void {
        if (
            viewDef.viewType !== 'plan' &&
            viewDef.viewType !== 'detail' &&
            viewDef.viewType !== 'structural-plan'
        ) return;

        const levelId = viewDef.spatial?.levelId;
        if (!levelId) return;

        const roofs: RoofData[] = this.roofStore.getByLevel(levelId);
        if (!roofs || roofs.length === 0) return;

        if (!drawing.layers.has(ROOF_LAYER)) {
            drawing.layers.create(ROOF_LAYER);
        }

        let injectedCount = 0;

        for (const roof of roofs) {
            // Skip flat roofs — they have no slope to represent.
            if (roof.roofType === 'flat') continue;
            const slope = roof.slope;
            if (!slope || slope <= 0) continue;

            // §02 §1.4 — resolve level elevation from BimManager at call-time.
            const levelElevation: number =
                this.bimManager.getLevelById(roof.levelId)?.elevation ?? 0;
            const worldY = levelElevation + (roof.baseOffset ?? 0);

            const polygon = roof.footprint?.polygon;
            const centroid = roof.footprint?.centroid;
            if (!polygon || polygon.length < 3 || !centroid) continue;

            const cx = centroid[0];
            const cz = centroid[1]; // RoofFootprint uses [x, z] in XZ plane

            // Build one slope arrow per polygon edge.
            for (let i = 0; i < polygon.length; i++) {
                const a = polygon[i];
                const b = polygon[(i + 1) % polygon.length];

                // Edge midpoint in XZ.
                const midX = (a[0] + b[0]) * 0.5;
                const midZ = (a[1] + b[1]) * 0.5;

                // Arrow direction: from centroid outward toward edge midpoint (= downslope).
                const dx = midX - cx;
                const dz = midZ - cz;
                const distToMid = Math.sqrt(dx * dx + dz * dz);
                if (distToMid < 0.001) continue;

                const ux = dx / distToMid;
                const uz = dz / distToMid;

                // Shaft length: SHAFT_FRACTION of distance, clamped.
                const shaftLen = Math.min(MAX_SHAFT, Math.max(MIN_SHAFT, SHAFT_FRACTION * distToMid));

                // Arrow shaft: from centroid to (centroid + dir * shaftLen).
                const tipX = cx + ux * shaftLen;
                const tipZ = cz + uz * shaftLen;

                // Arrowhead V — two wings at ±ARROWHEAD_HALF_ANGLE from the reversed direction.
                const backAngle = Math.atan2(uz, ux) + Math.PI; // 180° reversed = "back"
                const wingL_x = tipX + Math.cos(backAngle - ARROWHEAD_HALF_ANGLE) * ARROWHEAD_WING_LEN;
                const wingL_z = tipZ + Math.sin(backAngle - ARROWHEAD_HALF_ANGLE) * ARROWHEAD_WING_LEN;
                const wingR_x = tipX + Math.cos(backAngle + ARROWHEAD_HALF_ANGLE) * ARROWHEAD_WING_LEN;
                const wingR_z = tipZ + Math.sin(backAngle + ARROWHEAD_HALF_ANGLE) * ARROWHEAD_WING_LEN;

                // Positions: [shaft p0, shaft p1, wing-left p0, wing-left p1, wing-right p0, wing-right p1]
                const positions = [
                    cx,      worldY, cz,
                    tipX,    worldY, tipZ,
                    tipX,    worldY, tipZ,
                    wingL_x, worldY, wingL_z,
                    tipX,    worldY, tipZ,
                    wingR_x, worldY, wingR_z,
                ];

                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

                const lineSegs = new THREE.LineSegments(
                    geo,
                    new THREE.LineBasicMaterial({ color: 0x000000 }),
                );
                lineSegs.updateWorldMatrix(true, false);

                const projected = OBC.TechnicalDrawing.toDrawingSpace(lineSegs, drawing);
                drawing.addProjectionLines(projected, ROOF_LAYER);
            }

            // Dispatch ONE CreateAnnotationCommand per roof for the slope label at the centroid.
            const label = this._formatSlope(slope);
            const refPoint = makePointRef(new THREE.Vector3(cx, worldY, cz));
            refPoint.cachedPosition = { x: cx, y: worldY, z: cz };

            const ann = makeAnnotationElement(
                crypto.randomUUID(),
                'roof-slope-arrow',
                viewDef.id,
                [refPoint],
                { modelPoints: [{ x: cx, y: worldY, z: cz }], offset: 0 },
                {
                    roofId:     roof.id,
                    slopeLabel: label,
                    slope,
                },
            );
            try {
                // [E.5.x] Bus telemetry — fire-and-forget; legacy commandManager drives state during migration.
                if (window.runtime?.bus) { window.runtime.bus.executeCommand('annotation.create', ann).catch(() => {}); }
                this.commandManager.execute(new CreateAnnotationCommand(ann));
            } catch (err) {
                console.warn('[RoofSlopeSymbolBuilder] CreateAnnotationCommand failed:', err);
            }

            injectedCount++;
        }

        if (injectedCount > 0) {
            console.log(
                `[RoofSlopeSymbolBuilder] Injected slope arrows for ${injectedCount} roof(s) ` +
                `in plan view "${viewDef.id}"`,
            );
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Formats a slope (rise/run) as an AEC rise:run label.
     *
     *   slope = rise / run
     *   label = "1:N" where N = 1/slope (rounded if near integer).
     *
     * Examples:
     *   0.25  → "1:4"
     *   0.333 → "1:3"
     *   0.5   → "1:2"
     *   1.0   → "1:1"
     *   2.0   → "2:1"
     */
    private _formatSlope(slope: number): string {
        if (slope >= 1) {
            const rise = Math.round(slope * 10) / 10;
            return `${rise}:1`;
        }
        const run = 1 / slope;
        const rounded = Math.round(run * 10) / 10;
        return `1:${rounded % 1 === 0 ? Math.round(rounded) : rounded}`;
    }
}
