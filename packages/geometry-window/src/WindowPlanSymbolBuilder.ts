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
// §FIX-HOSTED-PLAN-SYMBOL-ON-CURVED-HOST (2026-08-09) — the ONE hosted-element
// resolver. `WindowBuilder.positionGroup` calls exactly this function to place the
// 3-D window; the plan symbol now calls it too, so the two cannot disagree about
// where on the host the opening is or which way it faces.
import { hostedElementFrame, withAuthoritativeGeometry, openingGeometryFromWall } from '@pryzm/geometry-wall';

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
    // §MT-06-ONE-AUTHORITY — the PLAN symbol resolves the same authority the 3D
    // frame does. `wallData` is already in hand here, so the four numbers come
    // off the very wall this symbol is being drawn on (see
    // `openingGeometryFromWall`). Without this the 2D plan would keep the defect
    // §L-916 fixed in 3D: after a host move the void in plan is re-cut from
    // RECORD A while the symbol was still drawn from the frame record's stale
    // offset — the same hole-without-a-frame, one view over.
    private _computeSymbolGeometry(winRaw: any, wallData: any, lod: DetailLevel = 'medium'):
        { cut: THREE.BufferGeometry | null; proj: THREE.BufferGeometry | null } | null {
        const win = withAuthoritativeGeometry(winRaw, openingGeometryFromWall(wallData, winRaw?.id));

        const bl0 = wallData.baseLine?.[0];
        const bl1 = wallData.baseLine?.[1];
        if (!bl0 || !bl1) return null;

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

        // ── The host's station mapper — §FIX-HOSTED-PLAN-SYMBOL-ON-CURVED-HOST ─
        //
        // THIS IS THE SAME CALL `WindowBuilder.positionGroup` MAKES. The symbol used
        // to build its own CHORD basis here (`baseLine[0] + (offset + width/2)·dir`
        // with a constant `dir` and `leftNormal`) — the C15 §2 formula's straight-wall
        // special case. On a curved host that resolved a different point and a
        // different heading from the 3-D window, diverging progressively along the
        // curve. `hostedElementFrame` is now the only resolver in the path.
        const host = hostedElementFrame(wallData, Number(win.offset), width);
        if (!(host.length > 0)) return null;   // degenerate host — nothing to draw on

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

        /**
         * World point at (along-centreline `s`, across-centreline `n`) from the
         * opening centre — asked of the host, never of a chord. `n` runs on the LOCAL
         * left-normal at station `s`, which is what makes the jamb ticks RADIAL: the
         * same measurement datum `CurvedWallOpeningBuilder` carves the void with, so
         * the symbol and the void coincide by construction.
         *
         * The 3D WindowBuilder rotates its group by `hostedElementFrame().rotationY`
         * = the local tangent heading, which maps the group's local +Z (the side the
         * sill protrudes to) onto exactly this normal — so the plan sill lands on the
         * same side of the wall as the built sill, on a curve as on a straight run.
         */
        const at = (s: number, n: number): THREE.Vector3 => {
            const p = host.at(s, n);
            return new THREE.Vector3(p.x, 0, p.z);
        };
        const cutSeg = (a: THREE.Vector3, b: THREE.Vector3): void => {
            cutPositions.push(a.x, 0, a.z, b.x, 0, b.z);
        };
        const projSeg = (a: THREE.Vector3, b: THREE.Vector3): void => {
            projPositions.push(a.x, 0, a.z, b.x, 0, b.z);
        };
        /**
         * An ALONG-WALL run (`s0`→`s1` at `n` across) emitted as a polyline sampled at
         * the host's own centreline stations. A single chord between two conforming
         * endpoints would still sag off a curved face — an 800 mm glazing run on a
         * 10 m-radius wall sags ~8 mm, which is 4 % of a 200 mm wall in plan. Straight
         * host → exactly two points → one segment, byte-identical to the previous
         * `cutSeg(at(a,n), at(b,n))`.
         */
        const runSeg = (out: number[], s0: number, s1: number, n: number): void => {
            const pts = host.run(s0, s1, n);
            for (let i = 0; i + 1 < pts.length; i++) {
                const a = pts[i]!, b = pts[i + 1]!;
                out.push(a.x, 0, a.z, b.x, 0, b.z);
            }
        };

        // ── 1. THE FRAMED OPENING (every LOD) ────────────────────────────────
        //
        // THE JAMB INVARIANT (§FIX-PLAN-DOOR-JAMB-SEAM, shared with the door): the
        // two jamb ticks sit on the opening VOID EDGES (∓halfW from centre = offset
        // and offset+width along the wall). That is precisely where
        // `_suppressPlanViewOpeningLines` clips the host wall's plan face lines, so
        // the wall lines close onto the frame with no seam.
        for (const sign of [-1, 1]) {
            cutSeg(at(sign * halfW, -halfThk), at(sign * halfW, +halfThk));
        }

        // ── §FIX-WINDOW-SYMBOL-FRAME-BRIDGE (L-289) — C09 §4.6.4c ────────────
        //
        // A WINDOW IN PLAN READS `frame | glazing | frame`, NOT A SOLID SLAB.
        //
        // These wall-face lines USED TO BRIDGE THE FULL OPENING WIDTH
        // (`cutSeg(at(-halfW, n), at(+halfW, n))`), sealing the symbol into a
        // rectangle. But the plan cut plane slices the frame MEMBERS and the
        // GLAZING — it does NOT slice the void between them. A heavy CUT line run
        // along the wall face ACROSS THE GLASS ASSERTS A SOLID THAT IS NOT THERE,
        // so the window read as ONE CONTINUOUS BAND OF FULL WALL THICKNESS — a
        // solid slab — instead of two members with glass between them. That is
        // exactly the founder's "the frame in plan view is much thicker than in
        // reality", and it was NEVER the frame's WIDTH: that was measured
        // dimensionally exact (L-280) and is deliberately left untouched here.
        //
        // The face lines now span ONLY THE FRAME MEMBERS — void edge → inner face,
        // i.e. exactly `frameThickness` each side — and the glazing zone carries
        // GLAZING LINES ONLY. The jamb seam stays closed because the host wall's
        // own face lines are clipped at the VOID EDGES, which is where the jamb
        // ticks above stand: wall → jamb tick → frame face line is continuous.
        if (framed) {
            for (const sign of [-1, 1]) {
                for (const n of [-halfThk, +halfThk]) {
                    runSeg(cutPositions, sign * halfW, sign * clearHalf, n);
                }
            }
        } else {
            // DEGENERATE ONLY (`frameThickness ≥ halfWidth`): there are no distinct
            // members and no glazing band to cross, so the full-width face line is
            // the honest reading — the cut IS solid frame all the way across.
            for (const n of [-halfThk, +halfThk]) {
                runSeg(cutPositions, -halfW, +halfW, n);
            }
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
                runSeg(cutPositions, sFace, sPocket, -halfGlaz);       // rebate ledge
                cutSeg(at(sPocket, -halfGlaz), at(sPocket, +halfGlaz));// pocket end (glass seat)
                runSeg(cutPositions, sPocket, sFace, +halfGlaz);       // rebate ledge
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
                runSeg(cutPositions, sL, sR, -mullionHalfDepth);
                runSeg(cutPositions, sL, sR, +mullionHalfDepth);
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
                runSeg(projPositions, a, b, 0);
            } else {
                for (const n of [-halfGlaz, +halfGlaz]) {
                    runSeg(projPositions, a, b, n);
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
            runSeg(projPositions, -sEdge, +sEdge, nEdge);    // the board line
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
