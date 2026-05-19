/**
 * SofaPlanSymbolBuilder — Contract 48 §5
 *
 * Injects a CLEAN 2D plan-view symbol for every sofa into the active
 * TechnicalDrawing, after the base 3D-edge projection completes.
 *
 * Why this exists:
 *   The 3D sofa builders (CornerSofaBuilder, WhiteSofaBuilder) use
 *   roundedBox + plumpCushion (extruded shapes with bevels) so the 3D
 *   render reads as soft upholstery. When EdgeProjectorService runs
 *   THREE.EdgesGeometry over those meshes the bevels project as 3–5
 *   parallel concentric lines per edge, producing the dense "wireframe"
 *   look the user reported (attached_assets/image_1777009513646.png).
 *
 *   Standard architectural plan symbols for upholstery are simple line
 *   diagrams: outer outline + arm partitions + back-panel front edge +
 *   seat-cushion seams (per ISO 4068 / common AEC convention).
 *
 *   Therefore: every sofa-part mesh tags itself `userData.skipInPlan = true`
 *   so EdgeProjectorService excludes it from plan-view projection, and this
 *   builder injects the clean 2D symbol instead.
 *
 * Mirrors the architecture of DoorPlanSymbolBuilder:
 *   - Pure read; no store mutations.
 *   - Reads FurnitureStore via window._pryzmStores (same pattern doors use
 *     for wallStore).
 *   - Builds geometry in local sofa space (origin = inside corner of plinth),
 *     applies the sofa's world position + Y rotation, then projects via
 *     OBC.TechnicalDrawing.toDrawingSpace.
 *   - Registers the projected lines against the sofa element id so click
 *     selection in plan view still works.
 *
 * Scope: corner_sofa, white_corner_sofa, sofa, sofa_1seat/2seat/3seat,
 *        white_sofa_1seat/2seat/3seat. Other sofa families (Barcelona,
 *        glb_import, ai_element) fall through to default behaviour until
 *        their builders opt in.
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { ViewDefinition } from '@pryzm/core-app-model';
import { registerSegmentUUID } from '@pryzm/core-app-model';
import type { FurnitureData, FurnitureType } from '../FurnitureTypes';

const FURN_LAYER = 'A-FURN';

/** Sofa types this builder owns. Anything not listed falls through. */
const HANDLED: ReadonlySet<FurnitureType> = new Set<FurnitureType>([
    'corner_sofa',
    'white_corner_sofa',
    'sofa',
    'sofa_1seat',
    'sofa_2seat',
    'sofa_3seat',
    'white_sofa_1seat',
    'white_sofa_2seat',
    'white_sofa_3seat',
]);

/** Default widths per straight-sofa seat count (must match WhiteSofaBuilder). */
const DEFAULT_STRAIGHT_WIDTHS: Record<string, number> = {
    sofa:               1.85,
    sofa_1seat:         1.05,
    sofa_2seat:         1.85,
    sofa_3seat:         2.55,
    white_sofa_1seat:   1.05,
    white_sofa_2seat:   1.85,
    white_sofa_3seat:   2.55,
};

/** Shared structural proportions — must match the 3D builders. */
const PROFILE = {
    armW:    0.18,   // arm panel thickness in plan
    backThk: 0.14,   // back-panel depth in plan
} as const;

export class SofaPlanSymbolBuilder {
    inject(drawing: OBC.TechnicalDrawing, viewDef: ViewDefinition): void {
        const levelId = viewDef.spatial?.levelId;
        if (!levelId) return;

        const furnitureStore = window.furnitureStore as // TODO(TASK-08)
            | { getAll: () => FurnitureData[] }
            | undefined;
        if (!furnitureStore) return;

        if (!drawing.layers.has(FURN_LAYER)) {
            drawing.layers.create(FURN_LAYER);
        }

        let injected = 0;

        for (const sofa of furnitureStore.getAll()) {
            if (!HANDLED.has(sofa.furnitureType)) continue;
            if (sofa.levelId !== levelId) continue;

            const positions = this._buildLocalLinework(sofa);
            if (positions.length === 0) continue;

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

            const lineSegments = new THREE.LineSegments(
                geo,
                new THREE.LineBasicMaterial({ color: 0x000000 }),
            );

            // Apply the sofa's world transform. Y is irrelevant for plan
            // projection (toDrawingSpace flattens to the drawing plane), but
            // we still apply it so the LineSegments lives at the correct level.
            if (sofa.position) {
                lineSegments.position.set(
                    sofa.position.x,
                    (sofa.position.y ?? 0) + (sofa.baseOffset ?? 0),
                    sofa.position.z,
                );
            }
            if (sofa.rotation) {
                lineSegments.quaternion.setFromEuler(new THREE.Euler(
                    sofa.rotation.x,
                    sofa.rotation.y,
                    sofa.rotation.z,
                    (sofa.rotation.order || 'XYZ') as THREE.EulerOrder,
                ));
            }
            lineSegments.updateWorldMatrix(true, false);

            const projected = OBC.TechnicalDrawing.toDrawingSpace(lineSegments, drawing);
            drawing.addProjectionLines(projected, FURN_LAYER);
            registerSegmentUUID(drawing, projected, sofa.id);
            injected++;
        }

        if (injected > 0) {
            console.log(
                `[SofaPlanSymbolBuilder] Injected ${injected} sofa symbol(s) ` +
                `into view ${viewDef.id} (level ${levelId})`,
            );
        }
    }

    // ── Private ──────────────────────────────────────────────────────────

    /**
     * Builds the 2D linework for one sofa in LOCAL space.
     * Local origin is the inside corner of the plinth; +X is the main run,
     * +Z is the perpendicular run (matches CornerSofaBuilder convention).
     * Returns a flat [x, 0, z, x, 0, z, ...] LineSegments position array.
     */
    private _buildLocalLinework(sofa: FurnitureData): number[] {
        const t = sofa.furnitureType;
        if (t === 'corner_sofa' || t === 'white_corner_sofa') {
            return this._buildCornerSofa(sofa);
        }
        return this._buildStraightSofa(sofa);
    }

    private _buildStraightSofa(sofa: FurnitureData): number[] {
        const totalWidth = sofa.width  ?? DEFAULT_STRAIGHT_WIDTHS[sofa.furnitureType] ?? 1.85;
        const seatDepth  = sofa.length ?? 0.95;
        const armW       = PROFILE.armW;
        const backThk    = PROFILE.backThk;

        const segs: number[] = [];
        const seg = (ax: number, az: number, bx: number, bz: number): void => {
            segs.push(ax, 0, az, bx, 0, bz);
        };

        // ── Outer rectangle outline ───────────────────────────────────────
        seg(0,          0,         totalWidth, 0        );  // back edge
        seg(totalWidth, 0,         totalWidth, seatDepth);  // right end
        seg(totalWidth, seatDepth, 0,          seatDepth);  // front edge
        seg(0,          seatDepth, 0,          0        );  // left end

        // ── Arm partitions (vertical lines at armW and totalWidth-armW) ──
        seg(armW,              0, armW,              seatDepth);
        seg(totalWidth - armW, 0, totalWidth - armW, seatDepth);

        // ── Back-panel front edge (between the two arms) ─────────────────
        seg(armW, backThk, totalWidth - armW, backThk);

        // ── Seat-cushion seams (vertical, between back panel and front) ──
        const innerWidth = totalWidth - armW * 2;
        const cushCount  = Math.max(1, Math.round(innerWidth / 0.80));
        const cushWidth  = innerWidth / cushCount;
        for (let i = 1; i < cushCount; i++) {
            const x = armW + cushWidth * i;
            seg(x, backThk, x, seatDepth);
        }

        return segs;
    }

    private _buildCornerSofa(sofa: FurnitureData): number[] {
        const widthMain     = sofa.widthMain     ?? sofa.width  ?? 3.0;
        const lengthSide    = sofa.lengthSide    ?? sofa.length ?? 2.0;
        const seatDepthMain = sofa.seatDepthMain ?? 0.90;
        const seatDepthSide = sofa.seatDepthSide ?? 0.90;
        const armW          = PROFILE.armW;
        const backThk       = PROFILE.backThk;

        const segs: number[] = [];
        const seg = (ax: number, az: number, bx: number, bz: number): void => {
            segs.push(ax, 0, az, bx, 0, bz);
        };

        // ── L-polygon outer outline ───────────────────────────────────────
        // Walk the L: back-of-main → right-end → front-of-main(to inside L)
        //   → front-of-side(at X=seatDepthSide) → far-end-of-side
        //   → back-of-side → close to origin.
        seg(0,             0,             widthMain,     0            );  // back of main
        seg(widthMain,     0,             widthMain,     seatDepthMain);  // right end (arm side)
        seg(widthMain,     seatDepthMain, seatDepthSide, seatDepthMain);  // front of main → inside L
        seg(seatDepthSide, seatDepthMain, seatDepthSide, lengthSide   );  // front of side
        seg(seatDepthSide, lengthSide,    0,             lengthSide   );  // far end of side (arm side)
        seg(0,             lengthSide,    0,             0            );  // back of side → close

        // ── Arm partitions (single end-arm per run; corner is open) ──────
        // Right arm at end of main run.
        seg(widthMain - armW, 0, widthMain - armW, seatDepthMain);
        // Far arm at end of side run.
        seg(0, lengthSide - armW, seatDepthSide, lengthSide - armW);

        // ── Back-panel front edges ───────────────────────────────────────
        // Main run: from inside-L corner outwards to inner edge of right arm.
        seg(seatDepthSide, backThk, widthMain - armW, backThk);
        // Side run: from inside-L corner outwards to inner edge of far arm.
        seg(backThk, seatDepthMain, backThk, lengthSide - armW);

        // ── Inside-L cushion-corner notch ────────────────────────────────
        // The plinth has a square inside corner at (seatDepthSide, seatDepthMain);
        // a short diagonal across that corner reads as the corner cushion seam
        // and matches the AEC convention shown in the user's reference image.
        const notch = Math.min(seatDepthMain, seatDepthSide) * 0.22;
        seg(
            seatDepthSide,         seatDepthMain - notch,
            seatDepthSide + notch, seatDepthMain,
        );

        // ── Corner unit cushion outline ──────────────────────────────────
        // The inside-L corner zone (the "missing square" at the elbow of the L)
        // houses the corner-unit cushion. Its back edges already coincide with
        // the back walls of the L (drawn in the outline above). What was MISSING
        // and what the user marked in green is:
        //   1. front-of-cushion edge on the side-run side  (closes the back-of-side
        //      cushion line into the inside-L kink)
        //   2. front-of-cushion edge on the main-run side  (closes the back-of-main
        //      cushion line into the inside-L kink)
        //   3. a diagonal cushion-fold seam from the inside-back corner across the
        //      corner unit to the inside-L kink — the classic AEC corner-pillow
        //      symbol.
        // Together with the existing back-of-main / back-of-side edges they form
        // the complete corner-cushion silhouette.
        seg(0,             seatDepthMain, seatDepthSide, seatDepthMain);  // (1) front edge — side-run side
        seg(seatDepthSide, 0,             seatDepthSide, seatDepthMain);  // (2) front edge — main-run side
        seg(0,             0,             seatDepthSide, seatDepthMain);  // (3) diagonal cushion-fold seam

        // ── Seat-cushion seams ───────────────────────────────────────────
        // Main run: vertical lines at cushion seams between back-panel-front
        // (Z=backThk) and front-of-main (Z=seatDepthMain), only past the
        // inside-L corner zone (X > seatDepthSide).
        const cushCountMain = Math.max(2, Math.floor(widthMain / 0.85));
        const cushWidthMain = widthMain / cushCountMain;
        for (let i = 1; i < cushCountMain; i++) {
            const x = cushWidthMain * i;
            if (x <= seatDepthSide + 0.05) continue;          // inside L corner
            if (x >= widthMain - armW - 0.05) continue;        // inside arm
            seg(x, backThk, x, seatDepthMain);
        }
        // Side run: horizontal lines at cushion seams between back-panel-front
        // (X=backThk) and front-of-side (X=seatDepthSide), only past the
        // inside-L corner zone (Z > seatDepthMain).
        const cushCountSide = Math.max(1, Math.floor(lengthSide / 0.85));
        const cushLenSide   = lengthSide / cushCountSide;
        for (let i = 1; i < cushCountSide; i++) {
            const z = cushLenSide * i;
            if (z <= seatDepthMain + 0.05) continue;
            if (z >= lengthSide - armW - 0.05) continue;
            seg(backThk, z, seatDepthSide, z);
        }

        return segs;
    }
}

/**
 * Singleton — imported by EdgeProjectorService and called once per plan view
 * after the base mesh-edge projection completes.
 */
export const sofaPlanSymbolBuilder = new SofaPlanSymbolBuilder();
