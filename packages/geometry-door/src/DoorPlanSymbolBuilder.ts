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
 *   'coarse'  LOD 100  — jamb cut ticks + a SINGLE-LINE leaf at 90° + swing arc.
 *   'medium'  LOD 200  — + the jamb LINING PROFILE (a true rectangle per jamb) and
 *                        the leaf as a TRUE DOUBLE-LINE rectangle at its real
 *                        `leafThickness`, at 90° + swing arc.
 *   'fine'    LOD 300  — medium + the door STOP / rebate in each lining, the LEVER
 *                        + ESCUTCHEON hardware, and the CLOSED-LEAF GHOST.
 *
 * THE LEAF IS DRAWN OPEN AT EVERY LEVEL. Before L-241 it was drawn CLOSED (lying
 * in the opening) *and* an open-position radial line *and* the arc were drawn —
 * three coincident readings of one leaf, which is the "confusing extra chord" the
 * founder reported. AEC convention (and both of his reference images) draw the
 * leaf once, in the 90° open position, with the arc closing back onto the frame.
 *
 * §FIX-DOOR-PLAN-SYMBOL-PURITY (L-266) — WHAT THE SYMBOL MAY CONTAIN, AND NOTHING ELSE
 * ─────────────────────────────────────────────────────────────────────────────────────
 * The founder, on the shipped symbol: *"There are lines that are really not needed —
 * those lines are imaginary. In the symbol we only need the FRAME, the LEAF (opened)
 * and the CURVED LINE representing the opening. That's all."*
 *
 * NOTHING MAY BRIDGE THE VOID except the leaf, its arc and (at LOD 300) its ghost.
 * At the plan cut height a DOOR OPENING IS EMPTY — the leaf has swung out of it. Any
 * line drawn across the void span is therefore drawing something that is not there.
 * (This is exactly where a door differs from a WINDOW: a window's frame and glazing
 * ARE cut by the 1.2 m plane, so its spanning lines are real cut geometry. The door's
 * were not.) Two producers were drawing across the void and BOTH are now gone:
 *
 *   1. THIS BUILDER drew two FRAME FACE LINES from void edge to void edge at ±half
 *      the wall thickness (§FIX-DOOR-FRAME, L-127) — i.e. it re-drew the WALL through
 *      the doorway. They were added to "close the reveal" when the wall's own face
 *      lines were clipped at the opening and the jamb ticks were still inset by
 *      `frameThickness`, leaving a 50 mm gap. §FIX-PLAN-DOOR-JAMB-SEAM (2026-07-02)
 *      moved the ticks ONTO the void edges, which is what actually closes the outline
 *      — the spanning lines have been redundant ever since, and read as two imaginary
 *      chords across the doorway. The FRAME is now drawn as what it physically is: a
 *      LINING PROFILE at each jamb, `frameThickness` long, spanning the wall reveal.
 *   2. THE 3D DOOR MESH itself. `DoorBuilder`'s head bar spans the FULL opening width
 *      (it is the frame's head member, ~2.05 m up), and the projector classifies any
 *      edge above the cut plane as PROJECTION linework — so the head bar, the hinges,
 *      the threshold plate, the centre mullion and the glazing all dumped their edges
 *      onto A-DOOR:proj, straight across the void. `DoorBuilder` now tags every mesh
 *      `userData.skipInPlan` (the Contract 48 §5 convention: an element with a plan
 *      SYMBOL does not also emit its mesh edges), so the plan door is this symbol and
 *      only this symbol.
 *
 * NOTE FOR THE NEXT READER: the wall's own face lines are clipped to the void span by
 * `_suppressPlanViewOpeningLines`, and the true plan cut section is void at the opening
 * BY CONSTRUCTION (L-246). Neither was the source of the reported lines.
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
/**
 * §FIX-DOOR-PLAN-SYMBOL-PURITY (L-266) — the CLOSED-LEAF GHOST sub-layer.
 *
 * The founder: *"If you can, you can represent the leaf when CLOSED in GREY and DASHED."*
 *
 * A LIGHTER PEN IS A ZONE, NOT A COLOUR LITERAL (Contract 23 §8). `drawingZoneFromLayerName`
 * classifies any `*-BEYOND` sub-layer into the BEYOND zone, and `resolvePen('BEYOND','door')`
 * IS the light grey reference pen (0.09 mm, #6b7280, opacity 0.55) — thinner than both the cut
 * and the projection pen. The ghost asks the pen table for a lighter pen by declaring its ZONE;
 * it never carries a hex value or a width.
 *
 * ON "DASHED", AND WHY IT IS NOT: §FEAT-REVIT-LINE-TYPE-SEMANTICS (L-277, landed the same day)
 * made C09 §4.6.4 normative from the founder's own words — *"Dashed lines should be reserved
 * ONLY for true hidden edges."* The closed-leaf ghost is not an OCCLUDED edge; it is reference
 * linework we DELIBERATELY show, which is precisely what the BEYOND zone means. Filing it under
 * HIDDEN to steal the dash would break the one invariant L-277 exists to hold (occlusion, never
 * distance and never convenience, is the sole producer of `hidden`). If the ghost should dash,
 * that is one explicit GraphicsRules intent override (P7) — not a literal in this builder.
 */
const DOOR_LAYER_GHOST = 'A-DOOR-BEYOND';

/** Line weight (px) for cut symbols — matches §M5 plan-line-weight contract. */
const LW_CUT  = 2;
/** Line weight (px) for projection symbols — lighter than cut. */
const LW_PROJ = 1;
/** Line weight (px) for the closed-leaf ghost — the lightest of the three. */
const LW_GHOST = 1;

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

        // §M5 — ensure all layers exist. The legacy DOOR_LAYER is kept so existing
        // per-category VG overrides continue to resolve.
        for (const layer of [DOOR_LAYER, DOOR_LAYER_CUT, DOOR_LAYER_PROJ, DOOR_LAYER_GHOST]) {
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

            // ── Closed-leaf GHOST (lightest) — LOD 300 only ────────────────────
            // §FIX-DOOR-PLAN-SYMBOL-PURITY (L-266). On the BEYOND sub-layer, so the
            // pen table (not this builder) decides that it is grey and dashed.
            if (geos.ghost) {
                const ghostSeg = new THREE.LineSegments(
                    geos.ghost,
                    new THREE.LineBasicMaterial({ color: 0x000000, linewidth: LW_GHOST }),
                );
                ghostSeg.userData = { lineWeight: LW_GHOST, role: 'beyond', elementType: 'Door' };
                ghostSeg.updateWorldMatrix(true, false);
                const projectedGhost = OBC.TechnicalDrawing.toDrawingSpace(ghostSeg, drawing);
                drawing.addProjectionLines(projectedGhost, DOOR_LAYER_GHOST);
                registerSegmentUUID(drawing, projectedGhost, door.id);
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
        { cut: THREE.BufferGeometry | null; proj: THREE.BufferGeometry | null;
          ghost: THREE.BufferGeometry | null } | null {
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

        // L-266 — the hardware is drawn only when the RECORD says the door carries a
        // handle (`DoorOpeningSchema.handle`, the same flag DoorBuilder builds the 3D
        // lever from). A symbol that draws ironmongery onto a handle-less door has
        // invented it.
        const hasHandle: boolean = door.handle !== false;

        // ── Segment accumulators (separated by line-weight role) ─────────────
        const cutPositions:   number[] = [];  // §M5 frame + leaf rectangle (cut by section plane)
        const projPositions:  number[] = [];  // §M5 swing arc + hardware (projection)
        const ghostPositions: number[] = [];  // L-266 closed-leaf ghost (BEYOND pen)

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

        const clearHalf = halfWidth - frameThick;   // centre → inner frame corner

        // ── MEDIUM+ (LOD 200) — the JAMB LINING PROFILE ──────────────────────
        //
        // §FIX-DOOR-PLAN-SYMBOL-PURITY (L-266). THE FRAME IS TWO LININGS, NOT A BOX
        // AROUND THE DOORWAY. What was here before were two lines running from void
        // edge to void edge at ±halfThickness — the wall's own face lines, re-drawn
        // straight through the doorway (see the header note). A door lining is a
        // member that lines the REVEAL at each jamb; it is `frameThickness` long
        // along the wall and spans the wall thickness across it. In plan that is a
        // RECTANGLE AT EACH JAMB — and nothing at all between them.
        //
        //        wall face ──┐ ┌── lining ──┐                 ┌── lining ──┐ ┌── wall
        //                    │ │            │      VOID       │            │ │
        //                    └─┴────────────┘   (empty!)      └────────────┴─┘
        //                   void edge   inner corner      inner corner   void edge
        //
        // The void-edge tick (above) is the outer end of each lining; here we close
        // the profile with the inner reveal tick and the two lining FACE lines. Every
        // offset is a record dimension: the lining length is exactly `frameThickness`
        // (void edge → inner corner) and its depth is the host wall's reveal.
        if (lod !== 'coarse' && clearHalf > 0) {
            const tick = leftNormal.clone().multiplyScalar(halfThk);
            for (const sign of [-1, 1]) {
                const outer = centre.clone().addScaledVector(dir, sign * halfWidth);   // void edge
                const inner = centre.clone().addScaledVector(dir, sign * clearHalf);   // inner corner
                // Inner reveal tick — the lining's inner end, across the wall depth.
                cutPositions.push(
                    inner.x - tick.x, 0, inner.z - tick.z,
                    inner.x + tick.x, 0, inner.z + tick.z,
                );
                // The two lining face lines — flush with the wall faces, `frameThickness`
                // long. These are what the wall's clipped face lines terminate onto.
                for (const n of [-halfThk, +halfThk]) {
                    const a = outer.clone().addScaledVector(leftNormal, n);
                    const b = inner.clone().addScaledVector(leftNormal, n);
                    cutPositions.push(a.x, 0, a.z, b.x, 0, b.z);
                }
            }
        }

        // ── FINE (LOD 300) — the door STOP / REBATE in each lining ───────────
        // The leaf seats against the stop, so the two stop faces sit at ±half the
        // REAL leaf thickness either side of the leaf's closed plane (the wall
        // centreline, where the hinge pivots), and each stop runs the lining's own
        // length — void edge → inner corner = exactly `frameThickness`.
        //
        // §DOOR-FRAME-DEPTH — the frame LINING spans the full wall reveal (DoorBuilder
        // overrides `frameDepth` with the host wall thickness), so the plan reveal is
        // governed by `halfThk`, not by `dims.frameDepth`. No literal appears here:
        // the rebate offset IS the leaf thickness the 3D leaf is built from (L-127).
        if (lod === 'fine' && clearHalf > 0) {
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
                this._addLeaf(hinge, panelDir, swingDir, leafLength, leafThick, hasHandle, lod,
                              cutPositions, projPositions, ghostPositions, leftNormal);
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

            this._addLeaf(hingePoint, panelDir, swingDir, leafLength, leafThick, hasHandle, lod,
                          cutPositions, projPositions, ghostPositions, leftNormal);
        }

        // §FIX-DOOR-PLAN-SYMBOL-PURITY (L-266) — the THRESHOLD LINE IS GONE. It ran
        // from inner corner to inner corner ACROSS THE VOID on the wall centreline —
        // one of the "imaginary lines" the founder marked. His enumeration of the
        // symbol is exhaustive: *"the FRAME, the LEAF (opened) and the CURVED LINE.
        // That's all"* (+ the optional closed-leaf ghost). ADR-121 §4.2 lists
        // "thresholds" among the LOD-300 plan additions; the founder's direction is
        // higher in the conflict order, and LOD 300 remains a strict superset of 200
        // via the rebate, the hardware and the ghost.

        const cutGeo = cutPositions.length > 0 ? new THREE.BufferGeometry() : null;
        if (cutGeo) cutGeo.setAttribute('position', new THREE.Float32BufferAttribute(cutPositions, 3));

        const projGeo = projPositions.length > 0 ? new THREE.BufferGeometry() : null;
        if (projGeo) projGeo.setAttribute('position', new THREE.Float32BufferAttribute(projPositions, 3));

        const ghostGeo = ghostPositions.length > 0 ? new THREE.BufferGeometry() : null;
        if (ghostGeo) ghostGeo.setAttribute('position', new THREE.Float32BufferAttribute(ghostPositions, 3));

        return { cut: cutGeo, proj: projGeo, ghost: ghostGeo };
    }

    /**
     * Appends ONE door leaf, drawn in the 90° OPEN position, plus its swing arc.
     *
     * §FEAT-DOOR-PLAN-SYMBOL-DETAIL-LEVEL (L-241) P4 — draughting, per LOD:
     *
     *   coarse : 1 single leaf line (hinge → open tip) + arc          → 1 + 32 segs
     *   medium : leaf as a true double-line rectangle at `leafThick` + arc
     *   fine   : medium + LEVER + ESCUTCHEON hardware on the open leaf,
     *            + the CLOSED-LEAF GHOST (grey/dashed, via the BEYOND pen)
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
     * @param hasHandle  The RECORD's `handle` flag — gates the LOD-300 ironmongery.
     * @param lod        Effective detail level for this door in this view.
     * @param leftNormal Wall left-normal — the closed leaf's thickness runs across it.
     */
    private _addLeaf(
        hinge: THREE.Vector3,
        panelDir: THREE.Vector3,
        swingDir: THREE.Vector3,
        leafLength: number,
        leafThick: number,
        hasHandle: boolean,
        lod: DetailLevel,
        cutPositions: number[],
        projPositions: number[],
        ghostPositions: number[],
        leftNormal: THREE.Vector3,
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

        // ── 3. FINE (LOD 300) — LEVER + ESCUTCHEON on the open leaf (PROJECTION) ──
        //
        // §FIX-DOOR-PLAN-SYMBOL-PURITY (L-266). The founder, red arrow on the shipped
        // symbol: *"the LOD and quality of the handle — honestly not being enough."*
        // His Revit-grade reference draws the ironmongery as a LEVER growing out of a
        // ROSE (escutcheon) on BOTH leaf faces. The prior symbol drew one bare line
        // per face — a lever with no rose and no body.
        //
        // Drawn per face:
        //          ┌──┐            rose: a `roseHalf`-long plate standing `roseProj`
        //     ─────┤  ├────        proud of the leaf face (3 lines: 2 cheeks + 1 back)
        //          │  │
        //          └──┘  ← lever   lever: a single line out of the rose centre,
        //                          perpendicular to the face, `leverLen` long.
        //
        // EVERY dimension is a multiple of the REAL `leafThickness` resolved from the
        // door type, so the hardware scales with the door and no literal is typed here
        // (ADR-121 §4.4: *a richer HARDCODED glyph is the same bug at higher
        // resolution*). It is skipped on a leaf too narrow to carry it (so a slim leaf
        // never draws hardware over its own tip) and on a door whose record says it has
        // no handle.
        if (lod === 'fine' && hasHandle) {
            const setBack   = 3 * leafThick;         // latch edge → handle centreline
            const leverLen  = 2 * leafThick;         // lever projection from the face
            const roseHalf  = leafThick;             // half the rose's along-leaf length
            const roseProj  = leafThick / 2;         // how far the rose stands proud
            if (leafLength > setBack + roseHalf) {
                const base = hinge.clone().addScaledVector(swingDir, leafLength - setBack);
                // face = 0 (hinge-side face) and face = leafThick (opposite face);
                // `out` is the outward normal of that face, along ∓panelDir.
                for (const [faceOffset, outSign] of [[0, -1], [leafThick, +1]] as const) {
                    const c = base.clone().addScaledVector(panelDir, faceOffset);
                    const along = (t: number) => c.clone().addScaledVector(swingDir, t);
                    const out   = (p: THREE.Vector3, d: number) =>
                        p.clone().addScaledVector(panelDir, outSign * d);
                    // Rose — two cheeks off the leaf face + the back plate joining them.
                    const cheekA0 = along(-roseHalf);
                    const cheekB0 = along(+roseHalf);
                    const cheekA1 = out(cheekA0, roseProj);
                    const cheekB1 = out(cheekB0, roseProj);
                    projSeg(cheekA0.x, cheekA0.z, cheekA1.x, cheekA1.z);
                    projSeg(cheekB0.x, cheekB0.z, cheekB1.x, cheekB1.z);
                    projSeg(cheekA1.x, cheekA1.z, cheekB1.x, cheekB1.z);
                    // Lever — out of the rose's face, perpendicular to the leaf.
                    const lever0 = out(c, roseProj);
                    const lever1 = out(c, roseProj + leverLen);
                    projSeg(lever0.x, lever0.z, lever1.x, lever1.z);
                }
            }
        }

        // ── 4. FINE (LOD 300) — the CLOSED-LEAF GHOST (BEYOND pen) ───────────
        //
        // The founder: *"you can represent the leaf when CLOSED in GREY and DASHED."*
        // Same leaf, same hinge, same thickness — lying in the opening instead of at
        // 90°: from the hinge along `panelDir` (the CLOSED direction) for `leafLength`,
        // its thickness `leafThick` across the wall, centred on the wall centreline
        // exactly as the 3D leaf is (DoorBuilder centres the leaf on the wall's centre
        // plane). Its latch edge therefore lands on the arc's t=0 end — the ghost and
        // the arc close onto the same frame corner, which is the geometric statement
        // the ghost exists to make.
        //
        // GREY + DASHED IS A PEN, NOT A COLOUR (Contract 23 §8): these segments go to
        // the `A-DOOR-BEYOND` sub-layer and the pen table resolves BEYOND × door to the
        // grey dashed reference pen. No hex literal is authored here.
        if (lod === 'fine') {
            const half = leafThick / 2;
            const g = (t: number, n: number): THREE.Vector3 =>
                hinge.clone().addScaledVector(panelDir, t).addScaledVector(leftNormal, n);
            const q0 = g(0, -half), q1 = g(leafLength, -half);
            const q2 = g(leafLength, +half), q3 = g(0, +half);
            const ghostSeg = (a: THREE.Vector3, b: THREE.Vector3): void => {
                ghostPositions.push(a.x, 0, a.z, b.x, 0, b.z);
            };
            ghostSeg(q0, q1); ghostSeg(q1, q2); ghostSeg(q2, q3); ghostSeg(q3, q0);
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
