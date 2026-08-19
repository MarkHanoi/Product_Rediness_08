/**
 * OpeningElevationSymbol — §ELEV-SYMBOL-OPENING (L-1240)
 *
 * **THE AUTHORED ELEVATION SYMBOL FOR A DOOR OR A WINDOW. There was never one.**
 *
 * ═══ WHAT WAS THERE BEFORE, MEASURED ═══
 *
 * `SymbolicRuleRenderer.symbolicRuleForLayer()` opens with `if (viewType !== 'plan') return
 * null;`, and its rule table holds exactly two keys — `'plan-door-swing'` and
 * `'plan-window-cased'`. Its own header line 4 says it draws *"in Canvas2D **plan** views"*, and
 * line 241 states the consequence outright: *"BEYOND door/window linework is projected
 * silhouette, not an authored symbol."*
 *
 * ⇒ **In elevation an opening was not a symbol at all. It was
 * `new THREE.EdgesGeometry(mesh.geometry, 1)` — the SOLID's wireframe**, every edge of every
 * frame box, front face AND back face, with the depth edges joining them. `HiddenLineRemoval`
 * cannot remove the back face because occluders are grouped by `userData.elementUUID` so *"an
 * element never hides its own linework"* (its header). So a window in elevation has always
 * drawn both of its faces. The precedent is already in the tree and it is the SAME founder
 * complaint, for a different family — `PlumbingElevationSymbolBuilder`'s header quotes him:
 * *"the existing toilets, showers etc. elevations AND plan view are true projections — too many
 * lines"*. Plumbing got an elevation symbol (L-221 P3). Doors and windows did not.
 *
 * ═══ THE PROBE, AND WHICH THEORY IT PROVED (L-1240) ═══
 *
 * Four candidate mechanisms were dumped as real projected segments through the REAL
 * `OBC.TechnicalDrawing.toDrawingSpace` and the REAL `orientTo`, on a 1.2 × 1.4 m opening at
 * world Y 12.41–13.81 (`OpeningElevationSymbol.probe.test.ts`). Angles are of the projected
 * segment in the sheet's `(h, v)` frame; 0° / 180° is horizontal, ±90° is plumb.
 *
 * | case | host                                  | view         | head / sill | jambs           |
 * |------|---------------------------------------|--------------|-------------|-----------------|
 * | A    | vertical, parallel to picture plane   | CARDINAL     | 0° ✅       | ±90° ✅          |
 * | B    | **RAKED 75°**, parallel to picture pl. | CARDINAL     | 0° ✅       | ±90° ✅          |
 * | C    | vertical, bearing 30°                 | NON-CARDINAL | **30° ⛔**  | **−60° ⛔**      |
 * | D    | RAKED 75°, bearing 30°                | NON-CARDINAL | **30° ⛔**  | −60°/120°, **unequal sides ⛔** |
 * | E/F  | vertical, bearing ±20°                | CARDINAL     | 0° ✅       | ±90° ✅          |
 * | G    | **RAKED 75°, bearing +20°**           | CARDINAL     | 0° ✅       | **84.76° ⛔**    |
 *
 * ⭐ **CASE B IS THE FALSIFICATION, AND IT MATTERS MORE THAN THE CONFIRMATIONS.** A raked host
 * viewed square-on is **BYTE-IDENTICAL to the unraked one** — same 1.2000 head, same 1.4000
 * rise. So in this repo **rake does not skew an opening, and it does not foreshorten it
 * either.** `WallRake.ts` displaces the wall HORIZONTALLY about its base line and keeps the
 * height PLUMB; a plumb rise projects unforeshortened onto a vertical picture plane. Any
 * statement of the form *"a rake foreshortens the opening vertically"* is FALSE HERE and must
 * not be written into a contract as an invariant — it describes a different rake convention.
 *
 * **THREE distinct live defects were separated by that table, and they had been read as one:**
 *
 *  - **D1 — the SKEW (cases C, D).** A non-cardinal view direction. `orientTo` handles six axes
 *    and silently no-ops otherwise, so the drawing keeps the identity quaternion and
 *    `toDrawingSpace` returns a PLAN. Head and sill come back at the host's plan BEARING —
 *    *"some tilting left, some right"*, exactly. Reachable today from `SectionPlanToolHandler`,
 *    which writes the tail the user drew as `projectionDirection`. Fixed by
 *    {@link ElevationViewBasis}, not by this module.
 *  - **D2 — the LEAN (case G).** A raked host at a bearing to a CARDINAL sheet. The rake
 *    displacement is perpendicular to the wall and grows with height, so a fraction
 *    `sin(bearing)` of it lands in `h`: the jamb tilts by `atan(cot(rake)·sin(bearing))` —
 *    measured 0.1283 m over 1.4 m at rake 75°, bearing 20°, which is the dump's 84.76° to the
 *    last digit. **This one is a CORRECT projection of the solid.** It is not a bug in the
 *    maths; it is a bug in the *choice to project a solid at all*.
 *  - **D3 — the WIREFRAME.** Both faces plus the depth edges, always.
 *
 * ═══ WHAT THIS MODULE DOES, AND WHY IT IS NOT A CLAMP ═══
 *
 * ⛔ It does **not** straighten projected lines. Clamping a malformed outline to horizontal is
 * the one fix the founder ruled out, and it would hide a wrong projection behind a straight
 * line. This module changes **what is drawn**: instead of photographing the solid, it SETS OUT
 * the opening from its own record — `{ offset, width, height, sillHeight, openingProfile }` —
 * in the wall's own `(x along, y up)` frame, and hands the result to the projector as ordinary
 * world geometry. Head and sill then draw horizontal because they ARE horizontal, at every
 * view angle, on every host: `y ↦ world Y` is the identity and {@link projectToElevation} reads
 * `v` straight off world Y.
 *
 * ⭐ **THE OUTLINE IS NOT DERIVED HERE.** It comes from `openingOutline()` in
 * `@pryzm/geometry-wall/OpeningProfile` — the ONE producer C86 §10.1 PR-1 mandates, whose own
 * header says *"⛔ No arm may re-derive an arc."* A `circular` window or a `round-arch` door
 * therefore lands in elevation as the SAME curve the wall was cut with, sampled to the same
 * `ARC_SAG_TOLERANCE_M`, not as a second circle that disagrees in the fourth decimal. This is
 * why the profile axis is honoured before the feature that needs it has shipped its UI: a
 * symbol hard-coded to a rectangle would re-open this exact bug the week round windows land.
 *
 * ⭐ **THE RAKE IS APPLIED, NOT DISCARDED — and that is the honest choice.** The void's face
 * genuinely stands where `baseStart + x·dir + (face + k·y)·leftPerp` puts it. Discarding `k·y`
 * would draw the opening somewhere the building does not have one. The consequence is stated
 * rather than hidden: viewed square-on the rake term is pure DEPTH and the jambs draw plumb (a
 * true elevation); viewed obliquely it contributes to `h` and the jambs lean **with the wall
 * they are cut in**, which is what an oblique projection of a leaning wall is. D2 is thereby
 * *explained and made consistent*, not erased.
 *
 * ⛔ **NO PEN DECISION IS MADE HERE.** Every polyline carries a {@link DrawingZone} and nothing
 * else — no weight, no colour, no dash. The zone is what the caller feeds
 * `graphicsRulesEngine.resolveStyle()`, which is per Contract-23 §7.1 the only sanctioned style
 * entry point. That is deliberate and it is the L-280 lesson: `SymbolicRuleRenderer` was once a
 * SECOND pen authority and it flattened the zone ladder for exactly the two element types that
 * have symbols. A producer that emitted a weight would rebuild that bug in a new file.
 *
 * Contract compliance:
 *   C86 §10.1 PR-1 — one outline producer; this module CONSUMES it and derives no arc
 *   C86 §10.2      — the head-and-sill invariant (added by this lane)
 *   C09 §4.6.1     — elevation has NO `cut` zone; every polyline here is projection or hidden
 *   C09 §4.6.4b    — the pen table is the only pen authority, including for symbols
 *   C16 CA-18      — every refusal names condition, reason and live alternative
 *   C05 §4 / P5    — pure: no DOM, no THREE, no store reads, no I/O
 *
 * @module OpeningElevationSymbol
 */

import { openingOutline, resolveOpeningProfile, type OpeningProfileKind } from '@pryzm/geometry-wall';
import { rakeShearPerMetre } from '@pryzm/geometry-wall';
import type { DrawingZone } from './DrawingZone';
import type { Vec3 } from './ElevationViewBasis';

// ─── Inputs ───────────────────────────────────────────────────────────────────

/** A plan-space point on the host's base line. */
export interface PlanPoint { readonly x: number; readonly z: number }

/**
 * The host wall, as the symbol needs it.
 *
 * ⚠ `baseY` is the world Y of the wall's BASE PLANE — the datum the rake shear pivots about and
 * the datum `sillHeight` is measured from. It is ONE number and it must be the one the geometry
 * used (`rootWorldY + baseOffset`, §WALL-Y-DATUM / L-968). Re-deriving it as
 * `level.elevation + baseOffset` drops the slab term and puts the whole symbol at the wrong
 * height on a raised slab — a defect this family has already shipped once.
 */
export interface ElevationSymbolHost {
    readonly baseStart: PlanPoint;
    readonly baseEnd: PlanPoint;
    readonly baseY: number;
    /** Horizontal (plan) thickness, per `WallRake.ts`'s thickness convention. */
    readonly thickness: number;
    /** `WallData.rakeAngleDeg`. 90 / absent ⇒ vertical. */
    readonly rakeAngleDeg?: number | null;
    /** True when the host is an arc wall — drives the C86 §10.1 PR-5 profile refusal. */
    readonly curved?: boolean;
}

/** The opening, as the symbol needs it. Field names match `Opening` in `WallTypes.ts`. */
export interface ElevationSymbolOpening {
    readonly id: string;
    readonly type: 'door' | 'window';
    /** LEFT-EDGE offset along the wall (§OPENING-OFFSET-LEFTEDGE-UNIFY). */
    readonly offset: number;
    readonly width: number;
    readonly height: number;
    readonly sillHeight: number;
    /** The VOID SHAPE axis (C86 §10.1 PR-7). Absent ⇒ rectangular. */
    readonly openingProfile?: unknown;
    /** The LEAF COUNT axis — orthogonal to the profile (C86 §9 WO-Voc-4). */
    readonly leafCount?: 'single' | 'double' | null;
    /**
     * `DoorData.hingesSide`. **Absent ⇒ NO swing indicator is drawn at all.**
     *
     * ⛔ Not defaulted to `'left'` here even though the door schema defaults it there, because a
     * symbol drawn from a default states a HAND the drawing does not know — and a wrong hinge
     * side on a door elevation is a construction error, not a cosmetic one. C65 §3.4: a missing
     * value is an explicit absent state, never a silent default.
     */
    readonly hingesSide?: 'left' | 'right' | null;
    /** `DoorData.swingDirection`. Absent ⇒ no swing indicator (same rule as `hingesSide`). */
    readonly swingDirection?: 'inward' | 'outward' | null;
}

/** Coarse / medium / fine — the `DetailLevel` union, restated structurally to keep L0 out of L3. */
export type SymbolDetail = 'coarse' | 'medium' | 'fine';

export interface ElevationSymbolOptions {
    /** Default `'fine'` — matches `DEFAULT_DETAIL_LEVEL`. */
    readonly detail?: SymbolDetail;
    /**
     * Which face of the wall the symbol is set out on: `+1` / `−1` pick the face on the
     * `leftPerp` / `−leftPerp` side, `0` the centreline.
     *
     * The CALLER resolves this from the view direction, because the caller is the only one that
     * knows it — see {@link nearFaceSign}. It is a parameter rather than an internal decision so
     * this module stays view-agnostic and testable without a basis.
     */
    readonly faceSign?: -1 | 0 | 1;
    /**
     * Frame width in metres — the inset from the void outline to the leaf/glass line.
     *
     * ⚠ **NOT MEASURED against the built frame.** `WindowBuilder` carries `frameWidth` on
     * `WindowData` and `DoorBuilder` its own; this module is not given either today, so the
     * inset is a DRAWING convention at LOD 200/300 and is declared as such rather than passed
     * off as the model's dimension. Wiring the real value is named in L-1240's residue.
     */
    readonly frameWidthM?: number;
}

// ─── Outputs ──────────────────────────────────────────────────────────────────

/** What a polyline IS, so a consumer can filter without re-reading its geometry. */
export type ElevationSymbolRole =
    | 'void-outline'
    | 'frame'
    | 'leaf-division'
    | 'swing-indicator';

/**
 * One emitted polyline, in WORLD space.
 *
 * `closed` means `points[n-1]` joins `points[0]`; the closing point is NOT repeated, matching
 * `OpeningOutline.points`' own convention so the two cannot drift.
 */
export interface ElevationSymbolPolyline {
    readonly role: ElevationSymbolRole;
    /** The zone the caller resolves the pen from. NEVER a pen (C09 §4.6.4b). */
    readonly zone: DrawingZone;
    readonly points: readonly Vec3[];
    readonly closed: boolean;
}

/** A named refusal — C16 CA-18. */
export interface ElevationSymbolRefusal {
    readonly code:
        | 'DEGENERATE_HOST'
        | 'DEGENERATE_OPENING'
        | 'PROFILE_ON_CURVED_HOST';
    readonly reason: string;
    readonly alternative: string;
}

export interface ElevationSymbolResult {
    readonly polylines: readonly ElevationSymbolPolyline[];
    /** Non-null ⇒ nothing was emitted and the caller MUST surface this, not fall back. */
    readonly refusal: ElevationSymbolRefusal | null;
}

const EMPTY: readonly ElevationSymbolPolyline[] = Object.freeze([]);

/** Default drawing inset from the void edge to the leaf line, in metres (60 mm). */
export const DEFAULT_FRAME_WIDTH_M = 0.06;

// ─── Which face is nearest the viewer ─────────────────────────────────────────

/**
 * The face of `host` that faces `viewDirection` — the one an elevation shows.
 *
 * `viewDirection` points INTO the sheet, so the NEAR face is the one on the side the view is
 * coming FROM: the face whose outward normal opposes the view direction. Returns `0` when the
 * wall is edge-on (its normal is perpendicular to the view direction is impossible for a
 * horizontal pair, but a degenerate baseline gives 0), which sets the symbol on the centreline.
 */
export function nearFaceSign(
    host: Pick<ElevationSymbolHost, 'baseStart' | 'baseEnd'>,
    viewDirection: { x: number; z: number },
): -1 | 0 | 1 {
    const dx = host.baseEnd.x - host.baseStart.x;
    const dz = host.baseEnd.z - host.baseStart.z;
    const l = Math.hypot(dx, dz);
    if (!(l > 1e-9)) return 0;
    // leftPerp(d) = (-d.z, d.x) — the SAME "left" WallFootprint2D and JunctionResolverV2 use.
    const lpx = -dz / l;
    const lpz = dx / l;
    const dot = lpx * viewDirection.x + lpz * viewDirection.z;
    if (Math.abs(dot) < 1e-9) return 0;
    // dot < 0 ⇒ leftPerp points back toward the viewer ⇒ the +leftPerp face is the near one.
    return dot < 0 ? 1 : -1;
}

// ─── The producer ─────────────────────────────────────────────────────────────

/**
 * Build the authored elevation linework for one opening, in WORLD space.
 *
 * @returns polylines plus a refusal. A refusal is EXCLUSIVE — when it is non-null, `polylines`
 *          is empty, and the caller must show the reason rather than draw something else. ⛔ A
 *          silent fall-back to a rectangle is forbidden by name (C86 §10.1).
 */
export function buildOpeningElevationSymbol(
    opening: ElevationSymbolOpening,
    host: ElevationSymbolHost,
    options: ElevationSymbolOptions = {},
): ElevationSymbolResult {
    const dx = host.baseEnd.x - host.baseStart.x;
    const dz = host.baseEnd.z - host.baseStart.z;
    const len = Math.hypot(dx, dz);
    if (!(len > 1e-9) || !Number.isFinite(host.baseY)) {
        return {
            polylines: EMPTY,
            refusal: {
                code: 'DEGENERATE_HOST',
                reason: 'the host wall has no length, or no base datum, so the opening has no '
                      + 'line to be set out along',
                alternative: 'repair the wall’s base line, then re-open this view',
            },
        };
    }

    const profile: OpeningProfileKind = resolveOpeningProfile(opening.openingProfile);

    // C86 §10.1 PR-5 — a curved host REFUSES a non-rectangular profile, PERMANENTLY and BY
    // NAME, because its bands are sliced in ARC-LENGTH space and a circle in arc-length space is
    // not a circle in world space. A RECTANGULAR opening on a curved host is served: its head
    // and sill are still horizontal, and the outline is set out on the chord.
    if (host.curved === true && profile !== 'rectangular') {
        return {
            polylines: EMPTY,
            refusal: {
                code: 'PROFILE_ON_CURVED_HOST',
                reason: `a ${profile} opening cannot be drawn in a curved wall — the void is set `
                      + 'out along the arc, not in a flat face',
                alternative: 'use a rectangular opening here, or move it to a straight wall',
            },
        };
    }

    const outline = openingOutline({
        profile,
        offset: opening.offset,
        width: opening.width,
        height: opening.height,
        sillHeight: opening.sillHeight,
    });
    if (!outline) {
        return {
            polylines: EMPTY,
            refusal: {
                code: 'DEGENERATE_OPENING',
                reason: `the opening’s dimensions cannot hold a ${profile} profile `
                      + `(${opening.width} × ${opening.height} m at sill ${opening.sillHeight} m)`,
                alternative: 'resize the opening — a circular opening needs equal width and '
                           + 'height, and an arched head needs at least half its own width',
            },
        };
    }

    const detail: SymbolDetail = options.detail ?? 'fine';
    const faceSign = options.faceSign ?? 0;
    const frameW = options.frameWidthM ?? DEFAULT_FRAME_WIDTH_M;

    // ── The seating frame. ONE place, used by every point below. ──────────────
    const ux = dx / len, uz = dz / len;          // along-wall unit
    const lpx = -uz,     lpz = ux;               // leftPerp — the ONE notion of "left"
    const k = rakeShearPerMetre(host.rakeAngleDeg);
    const face = faceSign * (Number.isFinite(host.thickness) ? host.thickness / 2 : 0);

    /**
     * Wall-local `(x along, y up from base)` ↦ WORLD.
     *
     * ⭐ `y` reaches world Y untouched. That single line IS the head-and-sill invariant: the
     * head is one `y`, so it is one world Y, so it is one `v` in every view. The rake and the
     * face offset move the point only in the XZ plane — i.e. only in `h` and DEPTH, never in
     * height.
     */
    const toWorld = (x: number, y: number): Vec3 => {
        const perp = face + k * y;
        return {
            x: host.baseStart.x + ux * x + lpx * perp,
            y: host.baseY + y,
            z: host.baseStart.z + uz * x + lpz * perp,
        };
    };

    const out: ElevationSymbolPolyline[] = [{
        role: 'void-outline',
        // C09 §4.6.1 — an elevation slices nothing (`ViewScope.cut = false`), so an opening's
        // outline is PROJECTION. It is never `cut`, and asserting that here is what keeps a
        // later caller from reaching for the heavy cut pen because the line "looks structural".
        zone: 'projection',
        points: outline.points.map(p => toWorld(p.x, p.y)),
        closed: true,
    }];

    // ── LOD 200+ — the frame line ─────────────────────────────────────────────
    //
    // Produced by calling THE SAME `openingOutline` on an INSET record, never by offsetting the
    // polyline. For an arc that matters: a concentric arc of radius r − f is the true parallel
    // offset, and shrinking the record reproduces it exactly (the springing line rises by f as
    // the radius drops by f), whereas offsetting sampled points would introduce a second, subtly
    // different curve — the disagreement C86 §10.1 PR-1 exists to prevent.
    if (detail !== 'coarse' && frameW > 0) {
        const inset = _insetRecord(opening, profile, frameW);
        if (inset) {
            const innerOutline = openingOutline({ profile, ...inset });
            if (innerOutline) {
                out.push({
                    role: 'frame',
                    zone: 'projection',
                    points: innerOutline.points.map(p => toWorld(p.x, p.y)),
                    closed: true,
                });
            }
        }
    }

    // ── LOD 200+ — the meeting stile / mullion of a DOUBLE leaf ───────────────
    if (detail !== 'coarse' && opening.leafCount === 'double') {
        const xMid = opening.offset + opening.width / 2;
        const yLo = opening.sillHeight + frameW;
        const yHi = opening.sillHeight + opening.height - frameW;
        if (yHi > yLo) {
            out.push({
                role: 'leaf-division',
                zone: 'projection',
                points: [toWorld(xMid, yLo), toWorld(xMid, yHi)],
                closed: false,
            });
        }
    }

    // ── LOD 300 — the swing indicator, ONLY when the hand is known ────────────
    //
    // EN ISO 7519 / EN 12519: the leaf's hanging edge is marked by two lines converging on it,
    // drawn DASHED when the leaf opens AWAY from the viewer. The zone carries that: `hidden` is
    // the one zone that dashes (C09 §4.6.0), so the convention is expressed through the ladder
    // instead of by this module choosing a dash pattern — which is the L-280 bypass.
    if (detail === 'fine' && opening.type === 'door'
        && (opening.hingesSide === 'left' || opening.hingesSide === 'right')
        && (opening.swingDirection === 'inward' || opening.swingDirection === 'outward')) {
        const xL = opening.offset + frameW;
        const xR = opening.offset + opening.width - frameW;
        const yLo = opening.sillHeight + frameW;
        const yHi = opening.sillHeight + opening.height - frameW;
        const xHinge = opening.hingesSide === 'left' ? xL : xR;
        const xFree  = opening.hingesSide === 'left' ? xR : xL;
        const yMid = (yLo + yHi) / 2;
        if (xR > xL && yHi > yLo) {
            out.push({
                role: 'swing-indicator',
                // A leaf that opens AWAY is behind the wall face from here — the dashed
                // hidden-line convention. A leaf that opens TOWARD the viewer is in front of it
                // and draws solid, on the projection pen.
                zone: opening.swingDirection === 'outward' ? 'hidden' : 'projection',
                points: [
                    toWorld(xFree, yLo),
                    toWorld(xHinge, yMid),
                    toWorld(xFree, yHi),
                ],
                closed: false,
            });
        }
    }

    return { polylines: out, refusal: null };
}

/**
 * The opening record, inset by `f` on every side.
 *
 * ⭐ **ONE uniform inset serves every profile, and that is a RESULT, not a convenience.** The
 * first draft special-cased the arches — *"the top of the box stays put while the sill rises, so
 * `height` loses ONE f, not two"* — and the concentricity test caught it: that inset put the
 * inner arc's centre 60 mm ABOVE the void's, giving a radius of 0.4441 where a true parallel
 * offset is 0.4400. Worked through instead of patched:
 *
 *   r′ = (w − 2f)/2 = r − f, and y₁′ = (sill + f) + (h − 2f) = y₁ − f,
 *   so centre′ = y₁′ − r′ = (y₁ − f) − (r − f) = y₁ − r = centre.  **∎ CONCENTRIC.**
 *
 * The same algebra keeps a circle's square box square and its centre fixed. So there is one
 * branch, not three — which is also what lets the inner outline come back through
 * `openingOutline` rather than from a polyline-offset routine that would sample a second,
 * subtly different curve (C86 §10.1 PR-1).
 *
 * ⚠ **NOT MEASURED — `segmental-arch`.** Its rise is `SEGMENTAL_RISE_RATIO × width`, so shrinking
 * the width shrinks the rise: the inner curve is a SIMILAR segmental arch, not a true parallel
 * offset of the outer one. At a 60 mm frame on a 1 m opening the departure is well under a
 * drawn line's width, and the alternative — teaching this module the arch's construction — is
 * exactly the re-derivation PR-1 forbids. Recorded rather than silently accepted.
 *
 * Returns `null` when the inset would collapse the opening — the frame line is then simply not
 * drawn, which is correct: an opening narrower than two frame widths has no visible reveal.
 */
function _insetRecord(
    opening: ElevationSymbolOpening,
    _profile: OpeningProfileKind,
    f: number,
): { offset: number; width: number; height: number; sillHeight: number } | null {
    const w = opening.width - 2 * f;
    const h = opening.height - 2 * f;
    if (!(w > 0) || !(h > 0)) return null;
    return {
        offset: opening.offset + f,
        width: w,
        height: h,
        sillHeight: opening.sillHeight + f,
    };
}
