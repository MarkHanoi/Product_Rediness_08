/**
 * WindowPlanSymbolBuilder — the WINDOW plan symbol (Contract 19, C15, C09).
 *
 * Injects the window's 2D plan symbol into a TechnicalDrawing for every window on
 * the active plan level. Windows are hosted elements — their frame geometry is
 * embedded in the parent wall mesh and cannot be individually selected after
 * NativeElementMeshExporter projection — so this builder injects dedicated
 * LineSegments per window and registers each set's UUID so plan-view hitTest still
 * resolves the window's own element ID.
 *
 * §FEAT-WINDOW-PLAN-SYMBOL-SOUND (L-254)
 * ─────────────────────────────────────────────────────────────────────────────
 * Founder: *"I want to also have sound WINDOW symbols."* The window read as a flat
 * band — two parallel lines and a single glazing centreline, with no frame block,
 * no rebate, no sill and no pen hierarchy — while the DOOR had a full three-tier
 * LOD symbol since L-241. C15 governs doors and windows as ONE hosted-element
 * family, so they must be drawn to ONE standard. This builder is therefore the
 * MIRROR of `DoorPlanSymbolBuilder`, not a second symbol engine:
 *
 *   • the SAME `DetailLevel` enum (`@pryzm/schemas/view`, via the shared
 *     `resolveEffectiveDetailLevel` resolver — C09: detail level is visibility
 *     INTENT, and this builder owns NONE of the precedence),
 *   • the SAME dimensional-truth rule (L-127): every dimension is resolved from the
 *     window's REAL record / system type through `resolveWindowDimensions()`. There
 *     is not one magic literal in the symbol,
 *   • the SAME jamb invariant (§FIX-PLAN-DOOR-JAMB-SEAM): the frame-cut jamb ticks
 *     land on the opening VOID EDGES (∓width/2 from the symbol centre = `offset`
 *     and `offset + width` along the wall, C15 §2), which is exactly where the host
 *     wall's plan face lines are clipped — so the wall closes onto the frame with
 *     no seam.
 *
 * WHAT EACH DETAIL LEVEL EMITS
 * ─────────────────────────────────────────────────────────────────────────────
 *   'coarse' LOD 100 — the framed opening (jamb ticks on the void edges + the two
 *                      frame face lines) + a SINGLE glazing line.
 *   'medium' LOD 200 — + the FRAME BLOCK (an inner reveal tick at each jamb, so the
 *                      frame member reads as a rectangle of face width
 *                      `frameThickness`) + TRUE DOUBLE-LINE glazing at its real
 *                      `glazingThickness`.
 *   'fine'   LOD 300 — + the jamb REBATE/reveal step (the frame's inner face steps
 *                      back by `rebateDepth` across the glazing band — the pocket
 *                      the sealed unit is captured in) + the SILL/board line.
 *
 * DIMENSIONS DO NOT CHANGE WITH THE LOD (L-127). The frame face width, the glazing
 * thickness, the glazing span and the jamb positions are IDENTICAL at coarse,
 * medium and fine; only the number of lines drawn changes. Note in particular that
 * the glazing spans `clearHalf + rebateDepth` at EVERY level — the glass really is
 * captured in the rebate, so that is a dimension, not a draughting choice.
 *
 * PEN HIERARCHY (Contract-23 pen table; the founder's "heavy cut wall → medium
 * frame → thin glazing"):
 *   • the host WALL cut lines are heavy (A-WALL, weight 4 → 0.50 mm),
 *   • the window FRAME cut is medium  (A-GLAZ-CUT,  weight 2 → 0.25 mm),
 *   • the GLAZING and the sill board are thin (A-GLAZ-PROJ, weight 1 → 0.18 mm).
 * The sill is legitimately a PROJECTION: the plan cut plane sits above the sill, so
 * the board is seen below the cut, not sliced by it.
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
// §FEAT-WINDOW-PLAN-SYMBOL-SOUND (L-254) — the window is the SECOND consumer of the
// SHARED detail-level resolver (the door was the first, L-241). It owns no precedence.
import { resolveEffectiveDetailLevel, type DetailLevel } from '@pryzm/core-app-model';
import { vgGovernanceStore } from '@pryzm/visibility';
// §FEAT-WINDOW-PLAN-SYMBOL-SOUND (L-254) / L-127 — the ONE dimension authority the
// 3D builder also reads, so plan symbol ≡ placed window.
import { resolveWindowDimensions, DEFAULT_WINDOW_DIMENSIONS } from './WindowDimensions';

const WINDOW_LAYER = 'A-GLAZ';
/**
 * §WIN-AUDIT-2026 M5 — separate cut vs projection layers (mirrors door builder):
 *   • A-GLAZ-CUT  → the frame cut profile (jamb ticks, frame faces, rebate), medium.
 *   • A-GLAZ-PROJ → the glazing + the sill board, thin.
 */
const WINDOW_LAYER_CUT  = 'A-GLAZ-CUT';
const WINDOW_LAYER_PROJ = 'A-GLAZ-PROJ';

/** PRYZM 1–6 line-weight scale (see SVGCompositeRenderer): 2 → 0.25 mm, 1 → 0.18 mm. */
const LW_CUT  = 2;
const LW_PROJ = 1;


export class WindowPlanSymbolBuilder {
    /**
     * Injects window plan symbols for all windows on the active level.
     *
     * Per window:
     *   1. Ask the SHARED resolver which Detail Level this view wants (C09).
     *   2. Resolve the window's REAL dimensions from its record / system type (L-127).
     *   3. Build the symbol in world XZ at that LOD.
     *   4. Register the resulting LineSegments UUIDs for hitTest selection.
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

            // §FEAT-WINDOW-PLAN-SYMBOL-SOUND (L-254) — the SAME shared resolver the
            // door calls. Precedence (C09 element/type/category override → the view's
            // own `output.detailLevel` → DEFAULT_DETAIL_LEVEL) lives there, not here.
            const lod = resolveEffectiveDetailLevel(win.id, viewDef.id, {
                elementType: 'window',
                category:    'window',
            });

            const geos = this._computeSymbolGeometry(win, wallData, lod);
            if (!geos) continue;

            // ── Cut symbol (medium pen) — the frame cut profile ────────────────
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

            // ── Projection symbol (thin pen) — glazing + sill board ────────────
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

    // ── Private ──────────────────────────────────────────────────────────────

    /**
     * Computes the complete window plan symbol in world XZ (y = 0) at the requested
     * Detail Level. `lod` changes ONLY how many lines are emitted — never a
     * dimension (L-127).
     *
     * Local symbol frame: `s` runs ALONG the wall from the opening centre (positive
     * toward `dir`), `n` runs ACROSS the wall along the left-normal. Every point is
     * `centre + s·dir + n·leftNormal`, so the maths below reads as a section.
     *
     *   n = ±halfThk            the two wall faces (where the wall lines terminate)
     *   s = ∓halfWidth          the opening VOID EDGES  (C15 §2: offset, offset+width)
     *   s = ∓clearHalf          the frame's inner face  (= halfWidth − frameThickness)
     *   s = ∓(clearHalf+rebate) the rebate pocket the glazing is captured in
     *   n = ±glazingThickness/2 the two glazing faces
     *
     * Returns null when the wall baseline or thickness is missing/degenerate — a
     * symbol drawn at a guessed wall thickness would be a dimensional lie (L-127),
     * so we draw nothing and say so.
     */
    private _computeSymbolGeometry(win: any, wallData: any, lod: DetailLevel = 'medium'):
        { cut: THREE.BufferGeometry | null; proj: THREE.BufferGeometry | null } | null {
        const bl0 = wallData.baseLine?.[0];
        const bl1 = wallData.baseLine?.[1];
        if (!bl0 || !bl1) return null;

        // ── Wall basis vectors in world XZ (y = 0) ───────────────────────────
        const start = new THREE.Vector3(Number(bl0.x), 0, Number(bl0.z));
        const end   = new THREE.Vector3(Number(bl1.x), 0, Number(bl1.z));
        const dir   = new THREE.Vector3().subVectors(end, start);
        if (dir.lengthSq() === 0) return null;
        dir.normalize();
        // Wall left-normal: 90° CCW from dir in XZ — (−dir.z, 0, dir.x). The 3D
        // WindowBuilder rotates its group by −wallAngle, which maps the group's
        // local +Z (the side the sill protrudes to) onto exactly this vector — so
        // the plan sill lands on the same side of the wall as the built sill.
        const leftNormal = new THREE.Vector3(-dir.z, 0, dir.x);

        // The host wall's REAL thickness — the symbol never invents one.
        const wallThickness = Number(wallData.thickness);
        if (!Number.isFinite(wallThickness) || wallThickness <= 0) {
            console.warn(
                `[WindowPlanSymbolBuilder] Wall ${wallData.id ?? '<unknown>'} has no usable thickness ` +
                `— refusing to draw window ${win.id} at a guessed dimension (L-127).`,
            );
            return null;
        }
        const halfThk = wallThickness / 2;

        // §OPENING-OFFSET-LEFTEDGE-UNIFY (2026-06-24): win.offset is the LEFT EDGE of
        // the span [offset, offset+width]; the plan-symbol CENTRE = offset + width/2.
        const width  = Number(win.width);
        if (!Number.isFinite(width) || width <= 0) return null;
        const halfW  = width / 2;
        const centre = start.clone().addScaledVector(dir, Number(win.offset) + halfW);

        // ── The window's REAL dimensions (L-127 — record → type → canonical) ──
        const dims       = resolveWindowDimensions(win);
        const frameThick = Math.max(0, dims.frameThickness);
        const glazThick  = Math.max(0, dims.glazingThickness);
        const halfGlaz   = glazThick / 2;

        // Frame inner face: `frameThickness` in from each void edge.
        const clearHalf = halfW - frameThick;
        const framed    = clearHalf > 0;   // degenerate windows (frame ≥ half-width) skip the block
        // The rebate can never be deeper than the frame member that contains it.
        const rebate    = framed ? Math.max(0, Math.min(dims.rebateDepth, frameThick)) : 0;
        // The glazing is CAPTURED IN THE REBATE, so it spans past the clear opening
        // by exactly the rebate depth. This is a DIMENSION (true at every LOD), not
        // a draughting choice — which is why it is computed here, once.
        const glazHalf  = framed ? clearHalf + rebate : halfW;

        // ── Segment accumulators (separated by pen role) ─────────────────────
        const cutPositions:  number[] = [];   // frame cut profile   → A-GLAZ-CUT  (medium)
        const projPositions: number[] = [];   // glazing + sill board → A-GLAZ-PROJ (thin)

        /** World point at (along-wall `s`, across-wall `n`) from the opening centre. */
        const at = (s: number, n: number): THREE.Vector3 =>
            centre.clone().addScaledVector(dir, s).addScaledVector(leftNormal, n);
        const cutSeg = (a: THREE.Vector3, b: THREE.Vector3): void => {
            cutPositions.push(a.x, 0, a.z, b.x, 0, b.z);
        };
        const projSeg = (a: THREE.Vector3, b: THREE.Vector3): void => {
            projPositions.push(a.x, 0, a.z, b.x, 0, b.z);
        };

        // ── 1. THE FRAMED OPENING (every LOD) ────────────────────────────────
        //
        // THE JAMB INVARIANT (§FIX-PLAN-DOOR-JAMB-SEAM, shared with the door): the
        // two jamb ticks sit on the opening VOID EDGES (∓halfW from centre = offset
        // and offset+width along the wall). That is precisely where
        // `_suppressPlanViewOpeningLines` clips the host wall's plan face lines, so
        // the wall lines close onto the frame with no seam. The two frame face lines
        // then bridge the void at ±halfThk, sealing the reveal into a rectangle.
        for (const sign of [-1, 1]) {
            cutSeg(at(sign * halfW, -halfThk), at(sign * halfW, +halfThk));
        }
        for (const n of [-halfThk, +halfThk]) {
            cutSeg(at(-halfW, n), at(+halfW, n));
        }

        // ── 2. THE FRAME BLOCK (medium + fine) ───────────────────────────────
        //
        // A reveal tick at each jamb's INNER face closes the frame member into a
        // rectangle of face width `frameThickness` — the "frame block in section"
        // the founder's LOD-300 reference shows. At `fine` this flat inner face is
        // REPLACED by the stepped rebate profile below, so it is not drawn twice.
        if (framed && lod === 'medium') {
            for (const sign of [-1, 1]) {
                cutSeg(at(sign * clearHalf, -halfThk), at(sign * clearHalf, +halfThk));
            }
        }

        // ── 3. THE JAMB REBATE / REVEAL STEP (fine only) ─────────────────────
        //
        // The frame's inner face is not flat: across the glazing band it steps BACK
        // into the frame by `rebateDepth`, forming the pocket (the check) that
        // captures the sealed unit. In section that reads as five segments per jamb:
        //
        //        n = +halfThk ─┐  (wall face)
        //                      │
        //        n = +halfGlaz ┴────┐        ← rebate ledge
        //                           │        ← pocket end: the glass seats on this
        //        n = −halfGlaz ┬────┘        ← rebate ledge
        //                      │
        //        n = −halfThk ─┘  (wall face)
        //                   s=∓clearHalf   s=∓(clearHalf+rebate)
        //
        // Every offset is a real dimension: `frameThickness`, `rebateDepth`,
        // `glazingThickness` and the host wall thickness. No literals (L-127).
        if (framed && lod === 'fine') {
            for (const sign of [-1, 1]) {
                const sFace   = sign * clearHalf;              // frame inner face
                const sPocket = sign * (clearHalf + rebate);   // rebate pocket end
                cutSeg(at(sFace, -halfThk),  at(sFace, -halfGlaz));    // face, exterior side
                cutSeg(at(sFace, -halfGlaz), at(sPocket, -halfGlaz));  // rebate ledge
                cutSeg(at(sPocket, -halfGlaz), at(sPocket, +halfGlaz));// pocket end (glass seat)
                cutSeg(at(sPocket, +halfGlaz), at(sFace, +halfGlaz));  // rebate ledge
                cutSeg(at(sFace, +halfGlaz), at(sFace, +halfThk));     // face, interior side
            }
        }

        // ── 4. THE MULLIONS / MEETING STILES (medium + fine; cut pen) ────────
        //
        // §FEAT-WINDOW-CUT-ZONE-AND-LOD (L-278). THE MULLION IS THE MEMBER THAT PROVES THE
        // WINDOW IS CUT, NOT SKIPPED. The plan plane passes straight THROUGH it, so it is a
        // genuine CUT solid — a post section interrupting the glazing — and the founder's
        // LOD-300 reference names it explicitly (*"mullion/meeting-stile at the centre"*).
        //
        // WHETHER there is a mullion at all is NOT a draughting choice: it is what the pane
        // grid says. `columnRatios = [1]` → a single pane → NO post, and drawing one anyway
        // would be L-127 (a symbol inventing a member the element does not have).
        // `[0.5, 0.5]` → one post on the centreline. HOW WIDE it is is
        // `columnDividerThickness` — already widened to the 60 mm meeting-stile minimum for a
        // `double` by `resolveWindowDimensions()`, so this post and the one `WindowBuilder`
        // extrudes are THE SAME POST. No new field: both numbers were already on the record.
        //
        // The post's DEPTH across the reveal is `dividerDepthRatio` of the frame reveal — the
        // ratio `WindowBuilder` has always extruded its dividers at (`fd * 0.5`), which was an
        // unnamed literal there and therefore invisible here. It is now named once, in
        // DEFAULT_WINDOW_DIMENSIONS, and read by both.
        const ratios   = dims.columnRatios.length > 0 ? dims.columnRatios : [1];
        const ratioSum = ratios.reduce((s, r) => s + r, 0) || 1;
        const cdt      = Math.max(0, dims.columnDividerThickness);
        const mullionHalfDepth = (wallThickness * DEFAULT_WINDOW_DIMENSIONS.dividerDepthRatio) / 2;

        // The pane boundaries, in the SAME frame `WindowBuilder` divides its inner width in:
        // the clear opening between the frame's inner faces, split by the pane ratios.
        const innerSpan = 2 * clearHalf;
        const boundaries: number[] = [];
        if (framed && innerSpan > 0) {
            let s = -clearHalf;
            for (let c = 0; c < ratios.length - 1; c++) {
                s += ((ratios[c] ?? 0) / ratioSum) * innerSpan;
                boundaries.push(s);
            }
        }

        const drawMullions = (lod === 'medium' || lod === 'fine') && cdt > 0;
        if (drawMullions) {
            for (const s of boundaries) {
                const sL = s - cdt / 2;
                const sR = s + cdt / 2;
                // The post in section: a closed rectangle interrupting the glazing band.
                cutSeg(at(sL, -mullionHalfDepth), at(sR, -mullionHalfDepth));
                cutSeg(at(sL, +mullionHalfDepth), at(sR, +mullionHalfDepth));
                cutSeg(at(sL, -mullionHalfDepth), at(sL, +mullionHalfDepth));
                cutSeg(at(sR, -mullionHalfDepth), at(sR, +mullionHalfDepth));
            }
        }

        // ── 5. THE GLAZING (every LOD; thin pen) ─────────────────────────────
        //
        // coarse       — ONE line on the glazing centreline (LOD 100).
        // medium/fine  — a TRUE DOUBLE LINE at the real `glazingThickness`, i.e. the
        //                two glazing faces at n = ∓glazingThickness/2.
        // The SPAN is the same at every LOD (`glazHalf`, glass captured in the
        // rebate) — only the line count changes.
        //
        // §FEAT-WINDOW-CUT-ZONE-AND-LOD (L-278) — BUT THE GLASS DOES NOT CROSS THE POST.
        // Where the pane grid puts a mullion, the glazing is BROKEN at the post's faces and
        // resumes on the far side: a single-pane window is one run (byte-identical to what
        // shipped), a two-pane window is two. Running the glazing line straight through its
        // own meeting stile is exactly the *"flat stack of parallel lines"* the founder
        // reported — the glass is not there, the post is.
        const glazRuns: Array<[number, number]> = [];
        if (drawMullions && boundaries.length > 0) {
            let from = -glazHalf;
            for (const s of boundaries) {
                glazRuns.push([from, s - cdt / 2]);
                from = s + cdt / 2;
            }
            glazRuns.push([from, +glazHalf]);
        } else {
            glazRuns.push([-glazHalf, +glazHalf]);
        }

        for (const [a, b] of glazRuns) {
            if (b - a <= 0) continue;   // a post wider than its own pane: draw no glass
            if (lod === 'coarse' || glazThick <= 0) {
                projSeg(at(a, 0), at(b, 0));
            } else {
                for (const n of [-halfGlaz, +halfGlaz]) {
                    projSeg(at(a, n), at(b, n));
                }
            }
        }

        // ── 6. THE SILL / BOARD (fine only; thin pen) ────────────────────────
        //
        // The sill board projects `sillDepth` beyond the wall face and overhangs each
        // jamb by `sillOverhang` — the same dimensions the 3D WindowBuilder extrudes
        // it at, resolved from the same record. It is drawn on the left-normal side,
        // which is where the 3D builder's group-local +Z (its sill direction) points.
        //
        // PROJECTION, not cut: the plan cut plane is above the sill, so the board is
        // seen beneath the cut — hence the thin pen, per Contract-23.
        if (lod === 'fine' && dims.sill && dims.sillDepth > 0) {
            const nFace  = halfThk;                       // the wall face the sill sits on
            const nEdge  = halfThk + dims.sillDepth;      // the board's outer edge
            const sEdge  = halfW + dims.sillOverhang;     // the board's ends
            projSeg(at(-sEdge, nEdge), at(+sEdge, nEdge));   // the board line
            projSeg(at(-sEdge, nFace), at(-sEdge, nEdge));   // returns to the wall face
            projSeg(at(+sEdge, nFace), at(+sEdge, nEdge));
        }

        const cutGeo = cutPositions.length > 0 ? new THREE.BufferGeometry() : null;
        if (cutGeo) cutGeo.setAttribute('position', new THREE.Float32BufferAttribute(cutPositions, 3));

        const projGeo = projPositions.length > 0 ? new THREE.BufferGeometry() : null;
        if (projGeo) projGeo.setAttribute('position', new THREE.Float32BufferAttribute(projPositions, 3));

        return { cut: cutGeo, proj: projGeo };
    }
}

export const windowPlanSymbolBuilder = new WindowPlanSymbolBuilder();
