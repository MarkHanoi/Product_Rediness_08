/**
 * §FEAT-WINDOW-REVEAL (L-1920 … L-1929, founder 2026-08-21) — THE ONE REVEAL MODEL.
 *
 * The founder asked for two things minutes apart, and they are ONE feature:
 *
 *   1. *"for all window types to have the possibility to extrude outside the façade —
 *       a new attribute in the Properties panel, like frame width but offset wide"*
 *      → a projecting window BOX (the modern oriel / box-window detail).
 *   2. *"another window type where the frame basically has angles inwards — the angle,
 *       which will define the size of the glass; and the side of the windows
 *       (top / bottom / left / right / all / multiple)"*
 *      → SPLAYED reveals, per side.
 *
 * ⭐ **THEY ARE MODELLED TOGETHER, IN THIS FILE, ON PURPOSE.** Both are answers to
 * "where does the reveal go between the wall face and the glazing plane?", and both need
 * a glazing plane to be placed. Modelled independently they would mint TWO rival notions
 * of where the glass sits, and the first edit that used both would put the pane in one
 * place and the splay's vanishing point in another. That is the defect shape this repo
 * has paid for repeatedly (see `WallArcParam.hostedElementFrame`'s header: *"a fourth copy
 * of this rule is the mistake that produced the defect in the first place"*). ONE model,
 * TWO parameters, ONE glazing plane — computed here and nowhere else.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════
 * 1. WHICH WAY IS "OUTSIDE"? — MEASURED, NOT ASSUMED
 * ═══════════════════════════════════════════════════════════════════════════════════
 *
 * A wall has two faces and the founder's photos are unambiguous that the box goes on the
 * EXTERIOR one. There is exactly one authored (never inferred) exterior axis in this
 * codebase, and it is the layer stack's:
 *
 *   • `WallLayerFootprint2D.buildWallLayerBands` — *"`layerThicknesses` is the authored
 *     stack, **exterior→interior** … Band *i* occupies the lateral interval
 *     `[-total/2 + Σ_{j<i} t_j, … ]` measured along **`leftPerp(footprint.direction)`**"*.
 *     So band 0 — the EXTERIOR band — occupies the MOST NEGATIVE lateral coordinate.
 *   • `WallSideFinishResolver.resolveLayerRenderFinishColor` — *"Exterior-first: index 0 is
 *     the exterior face, index n-1 the interior face."*
 *   • `WallFragmentBuilder:1551` — *"`outward` is `leftPerp(direction)`, so `z = +planHalf`
 *     is the LEFT face and `z = -planHalf` the RIGHT."*
 *
 * A hosted opening's group is rotated by `hostedElementFrame().rotationY = -angleY` with
 * `angleY = atan2(tz, tx)`, which maps the group's local `+Z` onto `(-tz, tx)` — precisely
 * `leftPerp(tangent)`. Therefore:
 *
 *   ⭐ **IN A HOSTED OPENING'S LOCAL FRAME, THE EXTERIOR IS `−Z`.** That is
 *   {@link EXTERIOR_LOCAL_Z}, stated once here and imported everywhere else. Nothing in
 *   this feature introduces a second notion of "the outside face", and nothing infers one
 *   from winding order or camera direction — `WallSideFinishResolver`'s header forbids
 *   exactly that (*"a render-time heuristic is … catastrophic for a PERSISTED
 *   assignment"*), and a projecting box is as persisted as a finish.
 *
 * ⚠ **A CONTRADICTION THIS MEASUREMENT EXPOSES, RECORDED RATHER THAN SILENTLY "FIXED".**
 * `WindowBuilder._addSillBoard` places the sill board at `+z` with the comment *"Sill
 * protrudes from bottom of window toward exterior (positive Z in group space)"*. By the
 * authored layer convention above, `+Z` is the **INTERIOR**. One of the two is wrong and
 * it is the sill comment — but moving the sill board is a VISIBLE change to every window
 * in every existing project, which is not this lane's ask and must not ride in on it.
 * Logged as L-1926; the board is left exactly where it is.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════
 * 2. THE MODEL — four quantities, one run
 * ═══════════════════════════════════════════════════════════════════════════════════
 *
 * With `t` = host wall thickness, `p` = `revealProjection` (signed), local `z` measured
 * across the wall (exterior negative):
 *
 * ```
 *   outer plane      zOuter = −t/2 − p        the box's outer lip
 *   reveal run       R      = t/2             exterior face → wall centre-plane
 *   glazing plane    zGlaz  = zOuter + R = −p
 *   side inset       i_s    = R · tan(θ_s)    θ_s = that side's splay angle
 *   glazing size     wG = w − (i_left + i_right)
 *                    hG = h − (i_head + i_sill)
 * ```
 *
 * **Why `R = t/2` and not `p + t/2`.** The reveal run is the depth of the REVEAL — the
 * classic detail, exterior face back to the wall centre-plane, which is exactly where this
 * builder has always put the glass. Holding `R` fixed is what makes the two parameters
 * COMPOSE instead of interfere: the projection slides the whole assembly outward (lip,
 * reveal and glazing move together, rigidly), and the splay shapes the reveal within it.
 * Had `R` grown with `p`, a user who deepened the box would have watched the glass shrink
 * without touching an angle — an attribute changing another attribute's meaning.
 *
 * **What the founder's two photos each are, in these terms:**
 *   • photo 1 (projecting box, glazing at the outer face): `p > 0`, all `θ = 0`. The lip
 *     stands `p` proud of the façade and the glass rides out with it, `t/2` behind the lip.
 *   • photo 2 (splayed white reveals): `p = 0`, `θ > 0` on the sides that splay. The reveal
 *     rakes from the full opening at the façade to a smaller pane at the wall centre.
 *   • both at once is his combined case, and it is one record with both fields set.
 *
 * ⛔ **THE WALL'S VOID IS NOT TOUCHED.** The wall still cuts the straight `w × h` prism it
 * always cut (`openingOutlineLocal` remains the one producer, C86 §10.1 PR-1). Everything
 * here is FRAME geometry hosted inside that void — which is why a layered wall, a raked
 * wall and a curved wall need no per-case handling in the cut, and why `p = 0 ∧ θ = 0`
 * reaches literally the old code rather than a reconstruction that happens to agree.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════
 * 3. THE REFUSAL BOUNDARY (C83) — IMPOSSIBLE vs INADVISABLE vs FINE
 * ═══════════════════════════════════════════════════════════════════════════════════
 *
 * C83 and the founder's standing direction ([[spatial-validity-rules-founder-direction]])
 * separate three verdicts and forbid silent auto-editing. {@link windowRevealRefusal}
 * returns the IMPOSSIBLE set — and it **names both numbers**, never one:
 *
 *   • the splays meet ⇒ the glazing has ZERO area. A silent clamp here would ship a window
 *     whose glazing is invisible and whose Properties panel says everything is fine.
 *   • the recess is deeper than the wall's outer half ⇒ the glazing plane leaves the wall.
 *
 * {@link windowRevealAdvisory} returns the INADVISABLE set — surfaced, never enforced.
 *
 * 🔴 **NOT BUILT, AND NAMED AS A GAP (L-1927):** projection across a PROPERTY BOUNDARY,
 * into a NEIGHBOURING element, or past a balcony. Those need parcel/site geometry (C19,
 * C57) and the element index, neither of which is reachable from an L1 geometry package.
 * This module refuses what it can MEASURE and stays silent about what it cannot — it does
 * not pretend the boundary case is checked.
 *
 * Architecture: **PURE.** No THREE, no DOM, no store reads. Consumed by `WindowBuilder`
 * (3D), `WindowPlanSymbolBuilder` (plan), `UpdateWindowParameterCommand` (validation) and
 * `WindowSection` (the panel's read-only derived readout) — four consumers, one answer.
 * P8 — the exported entry points emit a span, following `WindowDimensions.ts`.
 *
 * Contract compliance: C83 (spatial validity) · C84 (element integrity) · C86 (wall
 * opening) · C85 (host wall) · C67/C68 (a new user-visible attribute) · C73 (determinism).
 *
 * @module WindowReveal
 */

import { trace, type Tracer } from '@opentelemetry/api';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/geometry-window', '0.1.0');
    return _cachedTracer;
}

/**
 * The sign of the EXTERIOR direction along a hosted opening's local Z axis.
 *
 * ⛔ **THE ONE STATEMENT OF "WHICH SIDE IS OUTSIDE" IN THIS FEATURE.** Derived in §1 of
 * this file's header from the authored layer stack, not from a normal, a winding order or
 * a camera. Import it; never re-derive it, and never write a bare `-1` for it.
 */
export const EXTERIOR_LOCAL_Z = -1 as const;

/** The four reveal sides, in construction vocabulary. UI labels them top/bottom/left/right. */
export const REVEAL_SIDES = ['head', 'sill', 'jambLeft', 'jambRight'] as const;
export type RevealSide = (typeof REVEAL_SIDES)[number];

/**
 * The record field each side's angle is stored in.
 *
 * ⭐ FOUR NAMED SCALARS, NOT "a scalar plus a mode enum". The founder asked for
 * *"top / bottom / left / right / all / multiple"* — so "all" and "multiple" are a
 * SELECTION the panel and RAC expand over, and the STORAGE is one number per side. A mode
 * enum would have made "left and top only" unrepresentable, which is his photo.
 */
export const REVEAL_SPLAY_FIELD: Readonly<Record<RevealSide, RevealSplayField>> = Object.freeze({
    head:      'revealSplayHead',
    sill:      'revealSplaySill',
    jambLeft:  'revealSplayJambLeft',
    jambRight: 'revealSplayJambRight',
});

export type RevealSplayField =
    | 'revealSplayHead'
    | 'revealSplaySill'
    | 'revealSplayJambLeft'
    | 'revealSplayJambRight';

/**
 * Human labels for the UI and for refusal text.
 *
 * ⚠ **LEFT AND RIGHT ARE STATED, NOT INFERRED FROM A VIEWPOINT.** `jambLeft` is the jamb
 * at local `−X` (the `offset` end of the opening's span along the wall) and `jambRight` is
 * at `+X`. That is the SAME left/right `WindowBuilder` already uses for its own jamb
 * members (*"Left jamb … `-(w / 2 - ft / 2)`"*), so the panel's "Left" and the built left
 * jamb cannot disagree. It is deliberately NOT defined as "left as seen from outside" —
 * that flips with which face you stand on, and an attribute whose meaning depends on where
 * the reader is standing is not an attribute.
 */
export const REVEAL_SIDE_LABEL: Readonly<Record<RevealSide, string>> = Object.freeze({
    head:      'Top (head)',
    sill:      'Bottom (sill)',
    jambLeft:  'Left jamb',
    jambRight: 'Right jamb',
});

/**
 * The largest splay angle the schema accepts, in degrees.
 *
 * At 90° the reveal plane is parallel to the glazing plane and `tan` diverges; the cap is
 * a REPRESENTABILITY bound, not a design opinion. Whether a given angle is buildable on a
 * given window is a GEOMETRIC question and is answered by {@link windowRevealRefusal},
 * which is why this number is generous rather than cautious.
 */
export const MAX_REVEAL_SPLAY_DEG = 85;

/** The fields this feature reads off a window record. Structural, so tests need no store. */
export interface WindowRevealSource {
    width: number;
    height: number;
    /** Signed metres. `> 0` projects past the EXTERIOR face; `< 0` recesses inward. */
    revealProjection?: number;
    revealSplayHead?: number;
    revealSplaySill?: number;
    revealSplayJambLeft?: number;
    revealSplayJambRight?: number;
}

/** A fully-resolved reveal, in the hosted opening's LOCAL frame (metres, `+X` along wall). */
export interface ResolvedWindowReveal {
    /**
     * `false` ⇒ **the record authored nothing** and every consumer must take its existing
     * code path unchanged. This is the byte-identity guarantee (C84 EI-2), and it is a
     * FLAG rather than "all the numbers happen to be zero" so a consumer can short-circuit
     * before it computes anything at all.
     */
    readonly active: boolean;
    /** Signed projection actually applied, metres. */
    readonly projection: number;
    /** Reveal run — outer plane to glazing plane. `t / 2`. */
    readonly run: number;
    /** Local Z of the box's outer lip. Equals `−t/2` when `projection` is 0. */
    readonly zOuterFace: number;
    /** Local Z of the glazing plane. Equals `0` — the wall centre-plane — when `projection` is 0. */
    readonly zGlazing: number;
    /** Per-side inward inset at the glazing plane, metres. All zero when nothing is splayed. */
    readonly inset: Readonly<Record<RevealSide, number>>;
    /** Per-side authored angle, degrees, after clamping to the schema's representable range. */
    readonly splayDeg: Readonly<Record<RevealSide, number>>;
    /** Glazing rectangle width at the glazing plane. THE founder's *"the angle defines the size of the glass"*. */
    readonly glazingWidth: number;
    /** Glazing rectangle height at the glazing plane. */
    readonly glazingHeight: number;
    /** Centre of the glazing rectangle in local X — non-zero when the two jambs splay unequally. */
    readonly glazingCentreX: number;
    /** Centre of the glazing rectangle in local Y — non-zero when head and sill splay unequally. */
    readonly glazingCentreY: number;
    /** `true` when at least one side has a non-zero angle. */
    readonly hasSplay: boolean;
    /** `true` when the projection is non-zero. */
    readonly hasProjection: boolean;
}

const ZERO_INSET: Readonly<Record<RevealSide, number>> = Object.freeze({
    head: 0, sill: 0, jambLeft: 0, jambRight: 0,
});

function _finite(v: unknown): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Clamp an authored angle into the representable band. Never a silent geometric clamp — see the refusal. */
function _angle(v: unknown): number {
    const a = _finite(v);
    if (a <= 0) return 0;
    return a > MAX_REVEAL_SPLAY_DEG ? MAX_REVEAL_SPLAY_DEG : a;
}

/** `true` when the record authors no reveal at all — the byte-identity predicate. */
export function isRevealAuthored(win: WindowRevealSource | null | undefined): boolean {
    if (!win) return false;
    return _finite(win.revealProjection) !== 0
        || _angle(win.revealSplayHead) > 0
        || _angle(win.revealSplaySill) > 0
        || _angle(win.revealSplayJambLeft) > 0
        || _angle(win.revealSplayJambRight) > 0;
}

/**
 * THE reveal resolver — the only place the glazing plane, the outer lip and the four
 * insets are computed.
 *
 * @param win            the window record (or any object carrying the reveal fields)
 * @param wallThickness  the HOST wall's thickness, metres. The caller reads it from the
 *                       wall record; this module never reaches for a store.
 */
export function resolveWindowReveal(
    win: WindowRevealSource,
    wallThickness: number,
): ResolvedWindowReveal {
    return _tracer().startActiveSpan('pryzm.window.resolveReveal', (span) => {
        try {
            const t = _finite(wallThickness) > 0 ? wallThickness : 0;
            const run = t / 2;
            const projection = _finite(win.revealProjection);

            const splayDeg = Object.freeze({
                head:      _angle(win.revealSplayHead),
                sill:      _angle(win.revealSplaySill),
                jambLeft:  _angle(win.revealSplayJambLeft),
                jambRight: _angle(win.revealSplayJambRight),
            });
            const hasSplay = splayDeg.head > 0 || splayDeg.sill > 0
                || splayDeg.jambLeft > 0 || splayDeg.jambRight > 0;
            const hasProjection = projection !== 0;

            span.setAttribute('pryzm.window.reveal.projection_m', projection);
            span.setAttribute('pryzm.window.reveal.has_splay', hasSplay);

            if (!hasSplay && !hasProjection) {
                // ⛔ THE SHORT CIRCUIT. Every window drawn before this feature lands here and
                // every consumer then takes literally its old path. Not "a reconstruction that
                // agrees" — the same code (the pattern `openingOutlineLocal`'s `isRectangular`
                // arm established, and for the same reason).
                return Object.freeze({
                    active: false,
                    projection: 0,
                    run,
                    zOuterFace: -run,
                    zGlazing: 0,
                    inset: ZERO_INSET,
                    splayDeg,
                    glazingWidth: win.width,
                    glazingHeight: win.height,
                    glazingCentreX: 0,
                    glazingCentreY: 0,
                    hasSplay: false,
                    hasProjection: false,
                });
            }

            const tan = (deg: number) => (deg > 0 ? Math.tan((deg * Math.PI) / 180) : 0);
            const inset = Object.freeze({
                head:      run * tan(splayDeg.head),
                sill:      run * tan(splayDeg.sill),
                jambLeft:  run * tan(splayDeg.jambLeft),
                jambRight: run * tan(splayDeg.jambRight),
            });

            // The glazing rectangle. NOT clamped to a positive floor: a degenerate result is a
            // REFUSAL the caller must have already consulted, and quietly flooring it here is
            // exactly the silent clamp C83 forbids — it would put a hairline of glass in a
            // window the user believes is glazed.
            const glazingWidth  = win.width  - inset.jambLeft - inset.jambRight;
            const glazingHeight = win.height - inset.head     - inset.sill;

            // Unequal splays move the pane's CENTRE, which is what makes a raking head with
            // square jambs (his photo) read correctly instead of as a symmetric funnel.
            const glazingCentreX = (inset.jambLeft - inset.jambRight) / 2;
            const glazingCentreY = (inset.sill - inset.head) / 2;

            const zOuterFace = -run - projection;

            return Object.freeze({
                active: true,
                projection,
                run,
                zOuterFace,
                zGlazing: zOuterFace + run,
                inset,
                splayDeg,
                glazingWidth,
                glazingHeight,
                glazingCentreX,
                glazingCentreY,
                hasSplay,
                hasProjection,
            });
        } finally {
            span.end();
        }
    });
}

/**
 * C83 — the IMPOSSIBLE set. Returns the reason, or `null` when the reveal is buildable.
 *
 * ⭐ **EVERY BRANCH NAMES BOTH NUMBERS** — the angle (or depth) the user asked for AND the
 * dimension that makes it degenerate. C83's refusal style and the founder's own direction:
 * a refusal that says only "too big" leaves the user guessing which of the two to change.
 *
 * ⛔ **NEVER CLAMPS.** The caller refuses; it does not quietly build something else. A
 * window whose glazing has been silently reduced to nothing looks, from the panel, exactly
 * like a window that worked.
 */
export function windowRevealRefusal(
    win: WindowRevealSource,
    wallThickness: number,
): string | null {
    return _tracer().startActiveSpan('pryzm.window.revealRefusal', (span) => {
        try {
            if (!isRevealAuthored(win)) return null;

            const t = _finite(wallThickness);
            const r = resolveWindowReveal(win, wallThickness);

            // ── RECESS DEEPER THAN THE WALL'S OUTER HALF ────────────────────────────────
            // At `p = −t/2` the glazing plane has reached the INTERIOR face; past it the
            // pane leaves the wall entirely and there is nothing for the reveal to run in.
            if (t > 0 && r.projection <= -r.run) {
                return `A recess of ${(-r.projection).toFixed(3)} m cannot be cut into a `
                    + `${t.toFixed(3)} m wall: the glazing plane would sit at or beyond the `
                    + `interior face (the deepest recess this wall can carry is under `
                    + `${r.run.toFixed(3)} m). Reduce the recess, or host the window in a thicker wall.`;
            }

            // ── THE SPLAYS MEET — ZERO GLASS ────────────────────────────────────────────
            if (r.hasSplay && r.glazingWidth <= 0) {
                return `Splaying the left jamb ${r.splayDeg.jambLeft}° and the right jamb `
                    + `${r.splayDeg.jambRight}° over a ${r.run.toFixed(3)} m reveal removes `
                    + `${(r.inset.jambLeft + r.inset.jambRight).toFixed(3)} m from a `
                    + `${win.width.toFixed(3)} m opening — the two reveals meet and the glazing `
                    + `has no width. Reduce the angles, or widen the window past `
                    + `${(r.inset.jambLeft + r.inset.jambRight).toFixed(3)} m.`;
            }
            if (r.hasSplay && r.glazingHeight <= 0) {
                return `Splaying the head ${r.splayDeg.head}° and the sill ${r.splayDeg.sill}° `
                    + `over a ${r.run.toFixed(3)} m reveal removes `
                    + `${(r.inset.head + r.inset.sill).toFixed(3)} m from a `
                    + `${win.height.toFixed(3)} m opening — the two reveals meet and the glazing `
                    + `has no height. Reduce the angles, or raise the window past `
                    + `${(r.inset.head + r.inset.sill).toFixed(3)} m.`;
            }

            // ── A SLIVER IS NOT A WINDOW ────────────────────────────────────────────────
            // C73's tolerance floor: below 1 mm the pane is not manufacturable and, more to
            // the point, is not distinguishable from the degenerate case above by eye.
            if (r.hasSplay && (r.glazingWidth < 0.001 || r.glazingHeight < 0.001)) {
                return `Those angles leave a glazing panel of only `
                    + `${(r.glazingWidth * 1000).toFixed(1)} × ${(r.glazingHeight * 1000).toFixed(1)} mm `
                    + `in a ${win.width.toFixed(3)} × ${win.height.toFixed(3)} m opening. `
                    + `Reduce the splay angles.`;
            }

            return null;
        } finally {
            span.end();
        }
    });
}

/**
 * C83 — the INADVISABLE set. Returned so a caller can SHOW it; never enforced.
 *
 * The founder's standing direction is *"always ASK, never auto-edit"*. These are the
 * conditions worth asking about, and they are deliberately separated from
 * {@link windowRevealRefusal} so that "unusual" can never silently become "forbidden".
 *
 * 🔴 The genuinely important advisory — *"this box crosses the property boundary"* — is
 * **NOT HERE and NOT BUILT** (L-1927). See this file's header §3.
 */
export function windowRevealAdvisory(
    win: WindowRevealSource,
    wallThickness: number,
): string | null {
    if (!isRevealAuthored(win)) return null;
    const r = resolveWindowReveal(win, wallThickness);
    const notes: string[] = [];

    // A cantilever this deep is a structural element, not a trim detail, and in most
    // jurisdictions a projection over the building line needs consent. PRYZM cannot see
    // the boundary (L-1927), so it says what it CAN see and names what it cannot.
    if (r.projection >= 0.6) {
        notes.push(
            `A ${r.projection.toFixed(2)} m projection is a structural cantilever, not a trim `
            + `detail. PRYZM does not check it against the property boundary, a balcony or a `
            + `neighbouring element — that check is not built (L-1927).`,
        );
    }
    // More than half the glass gone is a deliberate effect, not a reveal.
    if (r.hasSplay && r.glazingWidth > 0 && r.glazingHeight > 0) {
        const areaRatio = (r.glazingWidth * r.glazingHeight) / (win.width * win.height);
        if (areaRatio < 0.5) {
            notes.push(
                `These angles leave ${(areaRatio * 100).toFixed(0)}% of the opening as glass `
                + `(${r.glazingWidth.toFixed(3)} × ${r.glazingHeight.toFixed(3)} m). Daylight and `
                + `any glazing-ratio check will read the reduced pane, not the opening.`,
            );
        }
    }
    return notes.length ? notes.join(' ') : null;
}
