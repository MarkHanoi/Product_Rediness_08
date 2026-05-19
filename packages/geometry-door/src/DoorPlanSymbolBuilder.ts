/**
 * DoorPlanSymbolBuilder — DOC-2.5a
 *
 * Injects door swing arc geometry (panel line + quarter-circle arc) into a
 * TechnicalDrawing for all doors on the active plan level.
 *
 * This is necessary because door swing arcs have no 3D counterpart — they are a
 * purely 2D AEC convention symbol that EdgeProjectorService cannot produce by
 * projecting meshes. This builder computes swing geometry from DoorStore +
 * WallStore data and injects it directly into the TechnicalDrawing after the
 * base projection completes.
 *
 * Contract compliance:
 *   §01 §5  — pure read; no store mutations; result lives in the TechnicalDrawing.
 *   §02 §1.2 — wall geometry is read from wallStore.getById() on every call; no cache.
 *   §05     — pure service; no DOM, no BIM-UI components.
 *   §26 §4  — door preview and placed symbol MUST use the same geometry convention.
 *
 * Single door: one leaf — hinge at hingesSide jamb, swings 90° from closed to open.
 * Double door: two symmetric leaves — each hinged at its outer jamb, both swinging
 *              in the same direction (controlled by swingDirection field).
 *
 * Called by: EdgeProjectorService.project() (after base projection) — DOC-2.5a wiring.
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { ViewDefinition } from '@pryzm/core-app-model';
import { doorStore } from '@pryzm/geometry-door';
import { registerSegmentUUID } from '@pryzm/core-app-model';
import { storeRegistry } from '@pryzm/core-app-model';
import { vgGovernanceStore } from '@pryzm/visibility';

/** Number of line segments used to approximate the quarter-circle swing arc. */
const ARC_SEGMENTS = 32;

/** ISO 13567 DXF layer for door swing symbols — must match VGSceneApplicator category map. */
const DOOR_LAYER = 'A-DOOR';
/**
 * §DOOR-AUDIT-2026 M5 — separate cut vs projection layers so plan rendering can
 * apply distinct line weights per AEC convention:
 *   • A-DOOR-CUT  → leaf rectangle (the leaf is cut by the section plane), heavy.
 *   • A-DOOR-PROJ → swing arc + open-position line (projection only), light.
 * Both layers also carry the parent A-DOOR layer so existing per-category VG
 * overrides (visibility, colour) continue to apply unchanged.
 */
const DOOR_LAYER_CUT  = 'A-DOOR-CUT';
const DOOR_LAYER_PROJ = 'A-DOOR-PROJ';

/** Line weight (px) for cut symbols — matches §M5 plan-line-weight contract. */
const LW_CUT  = 2;
/** Line weight (px) for projection symbols — lighter than cut. */
const LW_PROJ = 1;

export class DoorPlanSymbolBuilder {
    /**
     * Injects door swing arcs for all doors on the active level into a TechnicalDrawing.
     *
     * Algorithm per door:
     *   Single door:
     *     1. Resolve hinge point in world XZ from wall baseline + door offset + hingesSide.
     *     2. Compute panel direction (along wall toward open edge) and swing direction
     *        (perpendicular to wall — inward vs outward controlled by swingDirection field).
     *     3. Tesselate a 32-segment quarter-circle arc from closed (0°) to open (90°).
     *     4. Add the panel-open line (hinge → 90°-open panel end).
     *     5. Inject the combined BufferGeometry into the drawing on layer A-DOOR.
     *
     *   Double door:
     *     Same as single but generates TWO symmetric leaves:
     *       – Left leaf:  hinge at left jamb inner corner, panelDir = +dir (toward centre)
     *       – Right leaf: hinge at right jamb inner corner, panelDir = −dir (toward centre)
     *     Both leaves swing in the same swingDirection. Each leaf is half the clear opening width.
     *
     * Called AFTER EdgeProjectorService.project() — bridges the non-mesh gap.
     * §01 §5 — this method produces no store mutations.
     *
     * @param drawing  The TechnicalDrawing being built for this view.
     * @param viewDef  The active ViewDefinition (must be plan/detail/structural-plan).
     */
    inject(drawing: OBC.TechnicalDrawing, viewDef: ViewDefinition): void {
        const levelId = viewDef.spatial?.levelId;
        if (!levelId) return;

        // §DOOR-AUDIT-2026 (DI cleanup): resolve via storeRegistry instead of window-global.
        const wallStore = storeRegistry.getStoreForType('wall') as { getById: (id: string) => any } | undefined;
        if (!wallStore) {
            console.warn('[DoorPlanSymbolBuilder] wallStore not registered in storeRegistry — skipping door swing arc injection');
            return;
        }

        // §M5 — ensure all three layers exist. The legacy DOOR_LAYER is kept so
        // existing per-category VG overrides continue to resolve.
        for (const layer of [DOOR_LAYER, DOOR_LAYER_CUT, DOOR_LAYER_PROJ]) {
            if (!drawing.layers.has(layer)) drawing.layers.create(layer);
        }

        let injectedCount = 0;

        for (const door of doorStore.getAll()) {
            const wallData = wallStore.getById(door.wallId);
            if (!wallData) continue;
            if (wallData.levelId !== levelId) continue;

            // §WIN-AUDIT-2026 W5 parity — respect VG governance hidden flag.
            if (vgGovernanceStore.getEffectiveStyle('Door', door.id).hidden) continue;

            const geos = this._computeSwingGeometry(door, wallData);
            if (!geos) continue;

            // ── Cut symbol (heavy) — leaf rectangle ────────────────────────────
            if (geos.cut) {
                const cutSeg = new THREE.LineSegments(
                    geos.cut,
                    new THREE.LineBasicMaterial({ color: 0x000000, linewidth: LW_CUT }),
                );
                cutSeg.userData = { lineWeight: LW_CUT, role: 'cut', elementType: 'Door' };
                cutSeg.updateWorldMatrix(true, false);
                const projectedCut = OBC.TechnicalDrawing.toDrawingSpace(cutSeg, drawing);
                drawing.addProjectionLines(projectedCut, DOOR_LAYER_CUT);
                registerSegmentUUID(drawing, projectedCut, door.id);
            }

            // ── Projection symbol (light) — swing arc + open line ──────────────
            if (geos.proj) {
                const projSeg = new THREE.LineSegments(
                    geos.proj,
                    new THREE.LineBasicMaterial({ color: 0x000000, linewidth: LW_PROJ }),
                );
                projSeg.userData = { lineWeight: LW_PROJ, role: 'projection', elementType: 'Door' };
                projSeg.updateWorldMatrix(true, false);
                const projectedProj = OBC.TechnicalDrawing.toDrawingSpace(projSeg, drawing);
                drawing.addProjectionLines(projectedProj, DOOR_LAYER_PROJ);
                registerSegmentUUID(drawing, projectedProj, door.id);
            }

            injectedCount++;
        }

        if (injectedCount > 0) {
            console.log(
                `[DoorPlanSymbolBuilder] Injected ${injectedCount} door swing arc(s) ` +
                `into view ${viewDef.id} (level ${levelId})`,
            );
        }
    }

    // ── Private ──────────────────────────────────────────────────────────────

    /**
     * Computes the complete door plan symbol geometry in world XZ (y = 0).
     *
     * For single doors: one leaf rectangle + one 90° swing arc + one open-position line.
     * For double doors: two symmetric leaf rectangles + two 90° swing arcs +
     *                   two open-position lines, mirrored about the door centre.
     *
     * Returns null if the wall baseline data is missing or malformed.
     */
    private _computeSwingGeometry(door: any, wallData: any):
        { cut: THREE.BufferGeometry | null; proj: THREE.BufferGeometry | null } | null {
        const bl0 = wallData.baseLine?.[0];
        const bl1 = wallData.baseLine?.[1];
        if (!bl0 || !bl1) return null;

        // ── Wall basis vectors in world XZ (y = 0) ───────────────────────────
        const start = new THREE.Vector3(Number(bl0.x), 0, Number(bl0.z));
        const end   = new THREE.Vector3(Number(bl1.x), 0, Number(bl1.z));
        const dir   = new THREE.Vector3().subVectors(end, start).normalize();

        // Wall left-normal: 90° CCW from dir in XZ plane — (−dir.z, 0, dir.x).
        const leftNormal = new THREE.Vector3(-dir.z, 0, dir.x);

        // Door centre: baseLine[0] + dir * door.offset  (PLAN-09 CENTER convention)
        const centre   = start.clone().addScaledVector(dir, Number(door.offset));
        const width    = Number(door.width);
        const halfWidth = width / 2;

        // ── Frame and leaf dimensions ─────────────────────────────────────────
        const frameThick: number = Math.max(0, Number(door.frameThickness ?? 0.05));
        const leafThick:  number = Math.max(0.01, Number(door.leafThickness ?? 0.04));
        const halfLeaf = leafThick / 2;

        // ── Swing direction (perpendicular to wall) ───────────────────────────
        const swingDir = (door.swingDirection === 'outward')
            ? leftNormal.clone().negate()
            : leftNormal.clone();

        // ── Segment accumulators (separated by line-weight role) ─────────────
        const cutPositions:  number[] = [];   // §M5 leaf rectangle (cut by section plane)
        const projPositions: number[] = [];   // §M5 swing arc + open-position line (projection)

        const isDouble = door.doorType === 'double';

        if (isDouble) {
            // ── Double door — two symmetric leaves ────────────────────────────
            //
            // Each leaf spans from its outer jamb inner corner to the door centre.
            // Leaf length = half the clear opening (width − 2 × frameThick) / 2.
            //
            // Left leaf:  hinge at (centre − dir × (halfWidth − frameThick)), panelDir = +dir
            // Right leaf: hinge at (centre + dir × (halfWidth − frameThick)), panelDir = −dir
            // Both leaves swing toward swingDir (90° arc from closed to open).
            //
            // This matches the DoorPlanToolHandler preview exactly:
            //   canvas left arc : centred at −halfPx, angle 0 → π/2 (CW)
            //   canvas right arc: centred at +halfPx, angle π → π/2 (CCW)
            // ─────────────────────────────────────────────────────────────────
            const leafLength = Math.max(0.05, (width - 2 * frameThick) / 2);
            const clearHalf  = halfWidth - frameThick;   // distance from centre to inner jamb corner

            const leftHinge  = centre.clone().addScaledVector(dir, -clearHalf);
            const rightHinge = centre.clone().addScaledVector(dir, +clearHalf);

            const leaves: Array<{ hinge: THREE.Vector3; panelDir: THREE.Vector3 }> = [
                { hinge: leftHinge,  panelDir: dir.clone() },
                { hinge: rightHinge, panelDir: dir.clone().negate() },
            ];

            for (const { hinge, panelDir } of leaves) {
                this._addLeaf(hinge, panelDir, swingDir, leafLength, halfLeaf, leafThick,
                              cutPositions, projPositions);
            }
        } else {
            // ── Single door — existing geometry, unchanged ────────────────────
            const leafLength: number = Math.max(0.05, width - 2 * frameThick);

            const panelDir = (door.hingesSide === 'right')
                ? dir.clone().negate()
                : dir.clone();

            const hingePoint = (door.hingesSide === 'right')
                ? centre.clone().addScaledVector(dir, +(halfWidth - frameThick))
                : centre.clone().addScaledVector(dir, -(halfWidth - frameThick));

            this._addLeaf(hingePoint, panelDir, swingDir, leafLength, halfLeaf, leafThick,
                          cutPositions, projPositions);
        }

        const cutGeo = cutPositions.length > 0 ? new THREE.BufferGeometry() : null;
        if (cutGeo) cutGeo.setAttribute('position', new THREE.Float32BufferAttribute(cutPositions, 3));

        const projGeo = projPositions.length > 0 ? new THREE.BufferGeometry() : null;
        if (projGeo) projGeo.setAttribute('position', new THREE.Float32BufferAttribute(projPositions, 3));

        return { cut: cutGeo, proj: projGeo };
    }

    /**
     * Appends a single door-leaf symbol into the positions array:
     *   1. Closed-position leaf rectangle (4 edges).
     *   2. Quarter-circle swing arc (ARC_SEGMENTS edges).
     *   3. Open-position line (hinge → fully-open latch tip).
     *
     * @param hinge     World XZ pivot point (hinge jamb corner on wall centreline).
     * @param panelDir  Unit vector along wall away from hinge toward latch (closed direction).
     * @param swingDir  Unit vector perpendicular to wall (open direction = 90° target).
     * @param leafLength Distance from hinge to latch corner (= arc radius).
     * @param halfLeaf  Half the leaf thickness (leafThick / 2).
     * @param leafThick Full leaf thickness.
     * @param positions Accumulator array for line-segment positions (x,y,z pairs).
     */
    private _addLeaf(
        hinge: THREE.Vector3,
        panelDir: THREE.Vector3,
        swingDir: THREE.Vector3,
        leafLength: number,
        halfLeaf: number,
        leafThick: number,
        cutPositions: number[],
        projPositions: number[],
    ): void {
        const cutSeg = (ax: number, az: number, bx: number, bz: number): void => {
            cutPositions.push(ax, 0, az, bx, 0, bz);
        };
        const projSeg = (ax: number, az: number, bx: number, bz: number): void => {
            projPositions.push(ax, 0, az, bx, 0, bz);
        };

        // ── 1. Leaf rectangle — closed position (CUT — heavy line weight) ────
        //
        //   A ─────────────────── B   ← outer face (−swingDir × halfLeaf)
        //   │  hinge end  latch  │
        //   D ─────────────────── C   ← inner face (+swingDir × halfLeaf)
        //
        const A = hinge.clone().addScaledVector(swingDir, -halfLeaf);
        const B = A.clone().addScaledVector(panelDir, leafLength);
        const C = B.clone().addScaledVector(swingDir, leafThick);
        const D = hinge.clone().addScaledVector(swingDir, halfLeaf);

        cutSeg(A.x, A.z, B.x, B.z);  // outer face
        cutSeg(B.x, B.z, C.x, C.z);  // latch (free) edge
        cutSeg(C.x, C.z, D.x, D.z);  // inner face
        cutSeg(D.x, D.z, A.x, A.z);  // hinge edge

        // ── 2. Swing arc — traces outer corner B through 90° (PROJECTION) ────
        //
        // Arc centre: hinge point (pivot on wall centreline)
        // Arc radius: leafLength
        // At t=0:   panelDir direction (leaf closed, lying along wall)
        // At t=π/2: swingDir direction (leaf fully open, perpendicular to wall)
        for (let i = 0; i < ARC_SEGMENTS; i++) {
            const t0 = (i       / ARC_SEGMENTS) * (Math.PI / 2);
            const t1 = ((i + 1) / ARC_SEGMENTS) * (Math.PI / 2);
            const c0 = Math.cos(t0), s0 = Math.sin(t0);
            const c1 = Math.cos(t1), s1 = Math.sin(t1);
            projSeg(
                hinge.x + (c0 * panelDir.x + s0 * swingDir.x) * leafLength,
                hinge.z + (c0 * panelDir.z + s0 * swingDir.z) * leafLength,
                hinge.x + (c1 * panelDir.x + s1 * swingDir.x) * leafLength,
                hinge.z + (c1 * panelDir.z + s1 * swingDir.z) * leafLength,
            );
        }

        // ── 3. Open-position line — leaf at 90° (PROJECTION) ──────────────────
        const openTip = hinge.clone().addScaledVector(swingDir, leafLength);
        projSeg(hinge.x, hinge.z, openTip.x, openTip.z);
    }
}

/**
 * Singleton instance — imported by EdgeProjectorService.
 * §01 §5 — never stored in any PRYZM ElementStore.
 */
export const doorPlanSymbolBuilder = new DoorPlanSymbolBuilder();
