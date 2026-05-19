/**
 * StairSymbolTechnicalDrawingBridge — DOC-2.5c
 *
 * Bridges StairPlanSymbolRegistry objects (THREE.Line, THREE.ArrowHelper) into
 * a TechnicalDrawing after EdgeProjectorService.project() completes.
 *
 * PROBLEM SOLVED:
 * NativeElementMeshExporter only traverses THREE.Mesh objects — it drops
 * THREE.Line (walking lines, break lines) and THREE.ArrowHelper (direction
 * arrows) entirely. This means stair walking lines, break lines and direction
 * arrows are absent from all exports (DXF, SVG, PDF) and from the
 * TechnicalDrawing overlay itself.
 *
 * SOLUTION:
 * Read StairPlanSymbolRegistry directly (bypassing NativeElementMeshExporter),
 * extract world-space position pairs from each registered object, and inject
 * them into the TechnicalDrawing on the A-STRS ISO 13567 layer.
 *
 * Contract compliance:
 *   §01 §5  — pure read; no store mutations; result lives in TechnicalDrawing.
 *   §02     — no elevation caching; reads userData.levelId for filtering only.
 *   §05     — pure service; no DOM, no BIM-UI components.
 *
 * Called by: EdgeProjectorService.project() (after door arc injection).
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { stairPlanSymbolRegistry } from '@pryzm/scene-committer';
import type { ViewDefinition } from '@pryzm/core-app-model';

/** ISO 13567 DXF layer for stair symbols — matches ELEMENT_TYPE_TO_PROJECTION_LAYER. */
const STAIR_LAYER = 'A-STRS';

export class StairSymbolTechnicalDrawingBridge {
    /**
     * Reads StairPlanSymbolRegistry entries (THREE.Line, THREE.ArrowHelper)
     * and injects their world-space geometry into a TechnicalDrawing.
     *
     * Called AFTER EdgeProjectorService.project() — bridges the non-mesh gap.
     *
     * @param drawing  The TechnicalDrawing being built for this view.
     * @param viewDef  The active ViewDefinition (plan or section).
     */
    inject(drawing: OBC.TechnicalDrawing, viewDef: ViewDefinition): void {
        if (stairPlanSymbolRegistry.size === 0) return;

        if (!drawing.layers.has(STAIR_LAYER)) {
            drawing.layers.create(STAIR_LAYER);
        }

        const levelId = viewDef.spatial?.levelId;
        let injectedLines = 0;
        let injectedArrows = 0;

        stairPlanSymbolRegistry.forEach(obj => {
            // Filter by level if the object carries stair userData.
            if (levelId && obj.userData.levelId && obj.userData.levelId !== levelId) return;

            if ((obj as THREE.Line).isLine && !(obj instanceof THREE.ArrowHelper)) {
                const positions = this._extractLinePositions(obj as THREE.Line);
                if (positions.length >= 6) {
                    const geo = new THREE.BufferGeometry();
                    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
                    const lineSegs = new THREE.LineSegments(
                        geo,
                        new THREE.LineBasicMaterial({ color: 0x000000 }),
                    );
                    lineSegs.updateWorldMatrix(true, false);
                    const projected = OBC.TechnicalDrawing.toDrawingSpace(lineSegs, drawing);
                    drawing.addProjectionLines(projected, STAIR_LAYER);
                    injectedLines++;
                }
            }

            if (obj instanceof THREE.ArrowHelper) {
                const positions = this._extractArrowPositions(obj);
                if (positions.length >= 6) {
                    const geo = new THREE.BufferGeometry();
                    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
                    const lineSegs = new THREE.LineSegments(
                        geo,
                        new THREE.LineBasicMaterial({ color: 0x000000 }),
                    );
                    lineSegs.updateWorldMatrix(true, false);
                    const projected = OBC.TechnicalDrawing.toDrawingSpace(lineSegs, drawing);
                    drawing.addProjectionLines(projected, STAIR_LAYER);
                    injectedArrows++;
                }
            }
        });

        if (injectedLines > 0 || injectedArrows > 0) {
            console.log(
                `[StairSymbolTechnicalDrawingBridge] Injected ${injectedLines} line(s) + ` +
                `${injectedArrows} arrow(s) into view ${viewDef.id} (level ${levelId ?? 'all'})`,
            );
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Extracts world-space line segment pairs from a THREE.Line.
     *
     * A THREE.Line draws connected segments between consecutive vertices.
     * For N vertices: segments are [0→1], [1→2], …, [N-2 → N-1].
     * Each segment is output as two consecutive xyz triples (LineSegments format).
     *
     * matrixWorld is applied so world-space coordinates are injected (§02 §1.2).
     */
    private _extractLinePositions(line: THREE.Line): number[] {
        const posAttr = line.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
        if (!posAttr || posAttr.count < 2) return [];

        line.updateWorldMatrix(true, false);
        const mat = line.matrixWorld;

        const positions: number[] = [];
        const tmp0 = new THREE.Vector3();
        const tmp1 = new THREE.Vector3();

        for (let i = 0; i < posAttr.count - 1; i++) {
            tmp0.set(posAttr.getX(i),     posAttr.getY(i),     posAttr.getZ(i))    .applyMatrix4(mat);
            tmp1.set(posAttr.getX(i + 1), posAttr.getY(i + 1), posAttr.getZ(i + 1)).applyMatrix4(mat);
            positions.push(tmp0.x, tmp0.y, tmp0.z, tmp1.x, tmp1.y, tmp1.z);
        }

        return positions;
    }

    /**
     * Extracts world-space line segment pairs from a THREE.ArrowHelper.
     *
     * ArrowHelper exposes a `line` child (THREE.Line) whose geometry encodes the
     * shaft in local space. Applying `line.matrixWorld` maps it to world space.
     */
    private _extractArrowPositions(arrow: THREE.ArrowHelper): number[] {
        const linePart = arrow.line as THREE.Line | undefined;
        if (!linePart || !linePart.geometry) return [];

        linePart.updateWorldMatrix(true, false);
        const mat = linePart.matrixWorld;

        const posAttr = linePart.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
        if (!posAttr || posAttr.count < 2) return [];

        const positions: number[] = [];
        const tmp0 = new THREE.Vector3();
        const tmp1 = new THREE.Vector3();

        for (let i = 0; i < posAttr.count - 1; i++) {
            tmp0.set(posAttr.getX(i),     posAttr.getY(i),     posAttr.getZ(i))    .applyMatrix4(mat);
            tmp1.set(posAttr.getX(i + 1), posAttr.getY(i + 1), posAttr.getZ(i + 1)).applyMatrix4(mat);
            positions.push(tmp0.x, tmp0.y, tmp0.z, tmp1.x, tmp1.y, tmp1.z);
        }

        return positions;
    }
}

/**
 * Singleton instance — imported by EdgeProjectorService.
 * §01 §5 — never stored in any PRYZM ElementStore.
 */
export const stairSymbolTechnicalDrawingBridge = new StairSymbolTechnicalDrawingBridge();
