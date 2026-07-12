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
// §FIX-DOOR-PREVIEW-EXACT / §FIX-DOOR-FRAME (L-127) — same dimension source as
// the 3D builder + the plan-tool preview so the swing symbol matches exactly.
import { resolveDoorDimensions } from './DoorDimensions';
import { registerSegmentUUID } from '@pryzm/core-app-model';
import { storeRegistry } from '@pryzm/core-app-model';
// §FEAT-DOOR-PLAN-SYMBOL-DETAIL-LEVEL (L-241) P2/P4 — the door is the FIRST
// consumer of the SHARED detail-level resolver. It does NOT own the precedence.
import { resolveEffectiveDetailLevel, type DetailLevel } from '@pryzm/core-app-model';
import { vgGovernanceStore } from '@pryzm/visibility';

/** Number of line segments used to approximate the quarter-circle swing arc. */
const ARC_SEGMENTS = 32;

/**
 * §FEAT-DOOR-PLAN-SYMBOL-DETAIL-LEVEL (L-241) — what each Detail Level EMITS.
 *
 * Founder (with three reference images): *"I want a SOUND door, still absolutely
 * accurate with regards to its element dims… In any case the FRAME of the door is
 * present, the LEAF of the door in plan view renders OPENED."*
 *
 *   'coarse'  LOD 100  — framed opening + a SINGLE-LINE leaf at 90° + swing arc.
 *   'medium'  LOD 200  — framed opening + the leaf as a TRUE DOUBLE-LINE rectangle
 *                        at its real `leafThickness`, at 90° + swing arc.
 *   'fine'    LOD 300  — medium + frame reveal / rebate, threshold, lever hardware.
 *
 * THE LEAF IS DRAWN OPEN AT EVERY LEVEL. Before L-241 it was drawn CLOSED (lying
 * in the opening) *and* an open-position radial line *and* the arc were drawn —
 * three coincident readings of one leaf, which is the "confusing extra chord" the
 * founder reported. AEC convention (and both of his reference images) draw the
 * leaf once, in the 90° open position, with the arc closing back onto the frame.
 *
 * DIMENSIONAL TRUTH (non-negotiable, L-127): every dimension below — leaf length,
 * leaf thickness, frame thickness, frame depth, hinge position — is resolved from
 * the SELECTED DOOR TYPE via `resolveDoorDimensions()`. There is no hard-coded
 * literal in any symbol. Consequently the leaf width, the frame thickness and the
 * hinge position are IDENTICAL at coarse, medium and fine; only the number of
 * lines drawn changes.
 */

/**
 * §FIX-PLAN-DOOR-JAMB-SEAM (2026-07-02) — watertight door-in-wall plan symbol.
 *
 * INVARIANT: the frame-cut jamb ticks MUST land on the opening VOID EDGES, i.e.
 * exactly where the host wall's plan-projected face lines terminate. Per C15 §2
 * the void spans `[offset, offset + width]` along the wall (`voidStart =
 * baseLine[0] + offset·wallDir`, `voidEnd = baseLine[0] + (offset+width)·wallDir`),
 * and `_suppressPlanViewOpeningLines` (EdgeProjectorService) clips the wall lines
 * to that same span. The plan-symbol CENTRE = `offset + width/2`, so relative to
 * the centre the two jambs sit at `∓ width/2` = `∓ halfWidth`.
 *
 * The prior code inset each jamb tick by `frameThick` (`∓(halfWidth − frameThick)`),
 * leaving a `frameThick` (~50 mm) GAP between the wall-line terminus and the frame
 * tick on BOTH jambs — the reported plan defect. Matching the window builder (whose
 * jamb edges sit at `±halfW` = the void edges) closes the seam.
 *
 * NOTE: the door LEAF still legitimately hinges from the inner frame corner
 * (`halfWidth − frameThick`) — the leaf sits inside the frame reveal; only the
 * frame-cut tick moves out to the void edge so the wall lines close onto it.
 *
 * Returns the two frame-cut tick segments as a flat [ax,0,az, bx,0,bz, …] array
 * (4 vertices → 2 segments) in world XZ (y = 0). Pure — no store/DOM side effects.
 */
export function computeDoorFrameJambTicks(params: {
    /** Opening centre in world XZ (= voidStart + halfWidth·dir). */
    centre: THREE.Vector3;
    /** Unit wall direction in world XZ (y = 0). */
    dir: THREE.Vector3;
    /** Wall left-normal (−dir.z, 0, dir.x); tick runs across the wall depth. */
    leftNormal: THREE.Vector3;
    /** Half the opening width — distance from centre to each void edge. */
    halfWidth: number;
    /** Half the wall thickness — tick half-length either side of the centreline. */
    halfThickness: number;
}): number[] {
    const { centre, dir, leftNormal, halfWidth, halfThickness } = params;
    // Jambs on the VOID EDGES (∓ halfWidth) — coincide with the wall-line terminus.
    const leftJamb  = centre.clone().addScaledVector(dir, -halfWidth);
    const rightJamb = centre.clone().addScaledVector(dir, +halfWidth);
    const tickHalf  = leftNormal.clone().multiplyScalar(halfThickness);
    return [
        // Left jamb tick (perpendicular line across the wall depth)
        leftJamb.x - tickHalf.x, 0, leftJamb.z - tickHalf.z,
        leftJamb.x + tickHalf.x, 0, leftJamb.z + tickHalf.z,
        // Right jamb tick
        rightJamb.x - tickHalf.x, 0, rightJamb.z - tickHalf.z,
        rightJamb.x + tickHalf.x, 0, rightJamb.z + tickHalf.z,
    ];
}

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

            // §FEAT-DOOR-PLAN-SYMBOL-DETAIL-LEVEL (L-241) P2 — ask the SHARED
            // resolver, per door, which LOD this view wants. Precedence lives in
            // `resolveEffectiveDetailLevel` (C09 element/type/category override →
            // the view's own `output.detailLevel` → 'medium'); the door owns none
            // of it. Every other plan-symbol builder calls exactly this function.
            const lod = resolveEffectiveDetailLevel(door.id, viewDef.id, {
                elementType: 'door',
                category:    'door',
            });

            const geos = this._computeSwingGeometry(door, wallData, lod);
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
     * Computes the complete door plan symbol geometry in world XZ (y = 0) at the
     * requested Detail Level (§FEAT-DOOR-PLAN-SYMBOL-DETAIL-LEVEL, L-241 P4).
     *
     * Single door: one leaf (drawn OPEN at 90°) + one swing arc.
     * Double door: two symmetric leaves + two arcs, mirrored about the centre.
     *
     * `lod` changes ONLY how many lines are emitted — never a dimension (L-127).
     *
     * Returns null if the wall baseline data is missing or malformed.
     */
    private _computeSwingGeometry(door: any, wallData: any, lod: DetailLevel = 'medium'):
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

        // §OPENING-OFFSET-LEFTEDGE-UNIFY (2026-06-24): door.offset is the LEFT EDGE of
        // the span [offset, offset+width]; the plan-symbol CENTRE = offset + width/2.
        const width    = Number(door.width);
        const halfWidth = width / 2;
        const centre   = start.clone().addScaledVector(dir, Number(door.offset) + halfWidth);

        // ── Frame and leaf dimensions ─────────────────────────────────────────
        // §FIX-DOOR-PREVIEW-EXACT (L-127) — resolve frame + leaf thickness from the
        // SELECTED door type (single source of truth) so the plan symbol's frame /
        // leaf geometry is identical to the placed 3D door and the tool preview.
        const dims = resolveDoorDimensions(door.systemTypeId, door.doorType);
        const frameThick: number = Math.max(0, dims.frameThickness);
        const leafThick:  number = Math.max(0.01, dims.leafThickness);
        const halfLeaf = leafThick / 2;

        // ── Swing direction (perpendicular to wall) ───────────────────────────
        const swingDir = (door.swingDirection === 'outward')
            ? leftNormal.clone().negate()
            : leftNormal.clone();

        // ── Segment accumulators (separated by line-weight role) ─────────────
        const cutPositions:  number[] = [];   // §M5 leaf rectangle (cut by section plane)
        const projPositions: number[] = [];   // §M5 swing arc + open-position line (projection)

        // §DOOR-WINDOW-PLAN-FRAME (DAILY-USE 2026-05-21) — Add the frame
        // jamb cut symbols (two short perpendicular ticks at each jamb
        // crossing the full wall thickness). Architect reported: "in plan
        // view the 'Frame' doesn't render — We would like to see the frame
        // of the door and window - of course - cut." This is the standard
        // AEC convention symbol for the cut frame profile in plan view.
        // The wall projection cuts at the door opening (so there's a gap
        // in the wall line); the frame ticks bridge that gap by showing
        // the frame's depth perpendicular to the wall axis. CUT layer
        // (heavy line weight) because the section plane physically cuts
        // through the frame member at every floor-plan slice elevation.
        //
        // §FIX-PLAN-DOOR-JAMB-SEAM (2026-07-02) — the two jamb ticks are now
        // drawn on the opening VOID EDGES (±halfWidth from centre = offset and
        // offset+width along the wall), which is exactly where the host wall's
        // plan-projected face lines terminate (C15 §2 voidStart/voidEnd; matched
        // by _suppressPlanViewOpeningLines in EdgeProjectorService). Previously
        // the ticks were inset by frameThick, leaving a ~frameThick (50 mm) gap
        // between each wall-line terminus and the frame tick — the reported
        // "wall lines don't meet the door frame" plan defect. This mirrors the
        // window builder, whose jamb edges already sit on the void edges.
        // Delegated to the shared pure helper so the wall-line↔frame coincidence
        // invariant has a single, testable source of truth.
        const wallThickness = Math.max(0.05, Number(wallData.thickness ?? 0.2));
        const halfThk       = wallThickness / 2;
        cutPositions.push(
            ...computeDoorFrameJambTicks({
                centre,
                dir,
                leftNormal,
                halfWidth,
                halfThickness: halfThk,
            }),
        );

        // §FIX-DOOR-FRAME (L-127) — CLOSE THE REVEAL. The host wall's two plan face
        // lines are suppressed across the opening span (EdgeProjectorService
        // `_suppressPlanViewOpeningLines`), so without a frame the doorway reads as
        // an OPEN GAP in the wall outline (founder: "openings show gap where frame
        // should close the reveal"). Mirror WindowPlanSymbolBuilder: draw the two
        // frame face lines PARALLEL to the wall at ±halfThickness, spanning the void
        // edges (∓halfWidth from centre). Together with the jamb ticks above these
        // frame the opening into a watertight rectangle — the door FRAME cut profile.
        {
            const nOuter = leftNormal.clone().multiplyScalar(halfThk);
            const nInner = leftNormal.clone().multiplyScalar(-halfThk);
            const voidLeft  = centre.clone().addScaledVector(dir, -halfWidth);
            const voidRight = centre.clone().addScaledVector(dir, +halfWidth);
            const oL = voidLeft.clone().add(nOuter);
            const oR = voidRight.clone().add(nOuter);
            const iL = voidLeft.clone().add(nInner);
            const iR = voidRight.clone().add(nInner);
            cutPositions.push(oL.x, 0, oL.z, oR.x, 0, oR.z);   // outer frame face line
            cutPositions.push(iL.x, 0, iL.z, iR.x, 0, iR.z);   // inner frame face line
        }

        const clearHalf = halfWidth - frameThick;   // centre → inner frame corner

        // ── FINE (LOD 300) — frame REVEAL + REBATE (founder's image 2) ────────
        // The framed opening at medium is a plain rectangle. At fine we draw the
        // frame MEMBER itself: a reveal tick across the wall at each inner frame
        // corner (∓clearHalf), closing the frame profile into a true rectangle of
        // face-width `frameThickness`; plus the door STOP (rebate) — two short
        // lines along the wall from the void edge to the inner corner, offset from
        // the leaf plane by half the real leaf thickness.
        //
        // Every offset here is a DOOR-TYPE dimension (frameThickness, leafThickness,
        // frameDepth) — no literals (L-127).
        if (lod === 'fine' && clearHalf > 0) {
            const tick = leftNormal.clone().multiplyScalar(halfThk);
            for (const s of [-clearHalf, +clearHalf]) {
                const p = centre.clone().addScaledVector(dir, s);
                cutPositions.push(
                    p.x - tick.x, 0, p.z - tick.z,
                    p.x + tick.x, 0, p.z + tick.z,
                );
            }
            // Rebate / door stop: the leaf seats against it, so the two stop faces
            // sit at ±halfLeaf either side of the leaf's closed plane (the wall
            // centreline — where the hinge pivots), and the stop runs `frameThick`
            // along the wall, i.e. from the void edge to the inner frame corner.
            // §DOOR-FRAME-DEPTH — the frame LINING spans the full wall reveal
            // (DoorBuilder overrides `frameDepth` with the host wall thickness), so
            // the plan reveal is governed by `halfThk`, not by `dims.frameDepth`.
            const stopOffset = Math.min(halfLeaf, halfThk);
            for (const sign of [-1, 1]) {
                const outer = centre.clone().addScaledVector(dir, sign * halfWidth);
                const inner = centre.clone().addScaledVector(dir, sign * clearHalf);
                for (const n of [-stopOffset, +stopOffset]) {
                    const a = outer.clone().addScaledVector(leftNormal, n);
                    const b = inner.clone().addScaledVector(leftNormal, n);
                    cutPositions.push(a.x, 0, a.z, b.x, 0, b.z);
                }
            }
        }

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

            const leftHinge  = centre.clone().addScaledVector(dir, -clearHalf);
            const rightHinge = centre.clone().addScaledVector(dir, +clearHalf);

            const leaves: Array<{ hinge: THREE.Vector3; panelDir: THREE.Vector3 }> = [
                { hinge: leftHinge,  panelDir: dir.clone() },
                { hinge: rightHinge, panelDir: dir.clone().negate() },
            ];

            for (const { hinge, panelDir } of leaves) {
                this._addLeaf(hinge, panelDir, swingDir, leafLength, leafThick, lod,
                              cutPositions, projPositions);
            }
        } else {
            // ── Single door ──────────────────────────────────────────────────
            const leafLength: number = Math.max(0.05, width - 2 * frameThick);

            const panelDir = (door.hingesSide === 'right')
                ? dir.clone().negate()
                : dir.clone();

            const hingePoint = (door.hingesSide === 'right')
                ? centre.clone().addScaledVector(dir, +clearHalf)
                : centre.clone().addScaledVector(dir, -clearHalf);

            this._addLeaf(hingePoint, panelDir, swingDir, leafLength, leafThick, lod,
                          cutPositions, projPositions);
        }

        // ── FINE (LOD 300) — THRESHOLD (projection, light) ───────────────────
        // The leaf is drawn OPEN, so its closed plane (the wall centreline across
        // the clear opening) is empty — which is exactly where the threshold /
        // floor-finish transition line belongs. Spans the CLEAR opening
        // (∓clearHalf = the inner frame corners), so it is dimensionally exact.
        if (lod === 'fine' && clearHalf > 0) {
            const tA = centre.clone().addScaledVector(dir, -clearHalf);
            const tB = centre.clone().addScaledVector(dir, +clearHalf);
            projPositions.push(tA.x, 0, tA.z, tB.x, 0, tB.z);
        }

        const cutGeo = cutPositions.length > 0 ? new THREE.BufferGeometry() : null;
        if (cutGeo) cutGeo.setAttribute('position', new THREE.Float32BufferAttribute(cutPositions, 3));

        const projGeo = projPositions.length > 0 ? new THREE.BufferGeometry() : null;
        if (projGeo) projGeo.setAttribute('position', new THREE.Float32BufferAttribute(projPositions, 3));

        return { cut: cutGeo, proj: projGeo };
    }

    /**
     * Appends ONE door leaf, drawn in the 90° OPEN position, plus its swing arc.
     *
     * §FEAT-DOOR-PLAN-SYMBOL-DETAIL-LEVEL (L-241) P4 — draughting, per LOD:
     *
     *   coarse : 1 single leaf line (hinge → open tip) + arc          → 1 + 32 segs
     *   medium : leaf as a true double-line rectangle at `leafThick` + arc
     *   fine   : medium + lever hardware on the open leaf
     *
     * WHY THE LEAF IS OPEN (was: closed): the previous symbol drew the leaf lying
     * CLOSED inside the opening AND a radial "open-position" line AND the arc —
     * three readings of one leaf, which is the confusing extra chord the founder
     * reported. Both of his reference images (LOD 100 and LOD 200-300) draw the
     * leaf ONCE, open, with the arc closing back onto the frame.
     *
     * L-127 INVARIANT (must hold at EVERY LOD): the hinge point, `leafLength`
     * (the clear leaf width) and `leafThick` are inputs resolved from the door
     * TYPE — this function never invents a dimension. The arc radius is exactly
     * `leafLength`, so the arc still terminates on the opposite frame corner.
     *
     * @param hinge      World XZ pivot (inner frame corner on the wall centreline).
     * @param panelDir   Unit vector along the wall, hinge → latch (the CLOSED direction).
     * @param swingDir   Unit vector perpendicular to the wall (the OPEN direction).
     * @param leafLength Clear leaf width = hinge → latch = the arc radius.
     * @param leafThick  Full leaf thickness (from the door type).
     * @param lod        Effective detail level for this door in this view.
     */
    private _addLeaf(
        hinge: THREE.Vector3,
        panelDir: THREE.Vector3,
        swingDir: THREE.Vector3,
        leafLength: number,
        leafThick: number,
        lod: DetailLevel,
        cutPositions: number[],
        projPositions: number[],
    ): void {
        const cutSeg = (a: THREE.Vector3, b: THREE.Vector3): void => {
            cutPositions.push(a.x, 0, a.z, b.x, 0, b.z);
        };
        const projSeg = (ax: number, az: number, bx: number, bz: number): void => {
            projPositions.push(ax, 0, az, bx, 0, bz);
        };

        // ── 1. The LEAF at 90° OPEN (CUT — the leaf is sliced by the plan cut) ─
        //
        //          P1 ─────── P2      ← latch / free edge (tip)
        //           │          │
        //           │ leaf     │      length = leafLength (clear width)
        //           │          │      thickness = leafThick (along the wall)
        //          P0 ─────── P3      ← hinge edge, ON the wall centreline
        //        (hinge)
        //
        const P0 = hinge.clone();
        const P1 = hinge.clone().addScaledVector(swingDir, leafLength);
        const P3 = hinge.clone().addScaledVector(panelDir, leafThick);
        const P2 = P1.clone().addScaledVector(panelDir, leafThick);

        if (lod === 'coarse') {
            // LOD 100 — a single leaf line on the hinge face. Same hinge, same
            // length, same swing: only the leaf's THICKNESS is not draughted.
            cutSeg(P0, P1);
        } else {
            cutSeg(P0, P1);   // hinge-side face
            cutSeg(P1, P2);   // latch (free) edge — the leaf's real thickness
            cutSeg(P2, P3);   // opposite face
            cutSeg(P3, P0);   // hinge edge
        }

        // ── 2. Swing arc — hinge-face corner swept through 90° (PROJECTION) ───
        //
        // Arc centre: the hinge. Arc radius: leafLength.
        //   t = 0    → panelDir  (leaf CLOSED, lying in the opening)
        //   t = π/2  → swingDir  (leaf OPEN, = P1, the drawn leaf tip)
        // So the arc runs from the far frame corner to the drawn leaf tip — the
        // classic quarter-circle that closes the symbol onto the frame.
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

        // ── 3. FINE (LOD 300) — LEVER HARDWARE on the open leaf (PROJECTION) ──
        // A lever on each leaf face, set back from the latch edge. Its length and
        // set-back are DERIVED from the real leaf thickness (2 × / 3 ×) — no magic
        // numbers, and it scales with the door type. Skipped on leaves too narrow
        // to carry it, so a slim leaf never draws hardware over its own tip.
        if (lod === 'fine') {
            const setBack  = 3 * leafThick;
            const leverLen = 2 * leafThick;
            if (leafLength > setBack + leverLen) {
                const base = hinge.clone().addScaledVector(swingDir, leafLength - setBack);
                // Face A (hinge-side face, at the leaf's near face = offset 0).
                const a0 = base.clone();
                const a1 = base.clone().addScaledVector(panelDir, -leverLen);
                projSeg(a0.x, a0.z, a1.x, a1.z);
                // Face B (opposite face, offset by the real leaf thickness).
                const b0 = base.clone().addScaledVector(panelDir, leafThick);
                const b1 = base.clone().addScaledVector(panelDir, leafThick + leverLen);
                projSeg(b0.x, b0.z, b1.x, b1.z);
            }
        }

        // §L-241 — the legacy "open-position line" (hinge → open tip) is GONE: the
        // leaf itself is now drawn there. Emitting both produced the double line
        // the founder flagged.
    }
}

/**
 * Singleton instance — imported by EdgeProjectorService.
 * §01 §5 — never stored in any PRYZM ElementStore.
 */
export const doorPlanSymbolBuilder = new DoorPlanSymbolBuilder();
