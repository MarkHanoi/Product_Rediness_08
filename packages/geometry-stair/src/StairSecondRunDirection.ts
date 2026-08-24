// ─── §STAIR-SECOND-RUN-DIRECTION (L-10270) ───────────────────────────────────
//
// FOUNDER, verbatim (2026-08-23): "Once a stair in L or U shape is created — we
// should be able to AFTERWARDS modify, via RAC and via the UI properties panel,
// the DIRECTION OF THE SECOND RUN."
//
// ⭐ THE ENGINE ALREADY DID THIS. Two fields have been on the record and read by
// the geometry since long before this file:
//
//   • `turnDirection`  — L-shape: which way the 90° turn goes.
//        read by StairParameterReconciler.deriveStairGeometry (case 'L')
//   • `secondRunSide`  — U-shape: which side the 180° return run sits on.
//        read by StairParameterReconciler.deriveStairGeometry (case 'U'),
//             StairMeshBuilder §STAIR-U-LANDING-SIDE (landing slab side),
//             StairRailingBuilder (outer-rail side)
//
// They are TWO CONCEPTS, not one, and BOTH are live. `ElementRebuildRegistry`
// already registers both as geometry params, so a write to either already
// triggers `GenerateStairGeometryCommand`. Nothing here designs a new parameter.
//
// ─── ⛔ SO WHY WAS THE CONTROL NEVER PUBLISHED? BECAUSE THE STAMP LIES. ───────
//
// The record field and the flight geometry are written by TWO INDEPENDENT
// SOURCES, and they disagree on most stairs in the wild:
//
//   1. `StairCreationController.getFinalInput()` computes flight 2 as
//      `this.dir2 ?? this._computeLDir2(this.dir1)`. `dir2` is the direction the
//      architect DREW (set from the mouse). `turnDirection` is the separate
//      latched `_turnDirection` field, default 'left'. Draw a right-hand L
//      without touching the toggle and the record says 'left' while the stair
//      turns right.
//   2. Every non-controller creation path stamps a CONSTANT and derives the
//      flights some other way:
//        StairPathAdapter.ts:207        `turnDirection ?? 'left'`
//        StairPath3DToolHandler.ts:221  `'left'`
//        StairPathPlanToolHandler:180   `'left'`
//        StairPlanToolHandler.ts:209    `turnDirection = 'left'`
//      ⛔ That last one is demonstrable: with `flight1Dir = (0,0,1)` it emits
//      `flight2Dir = (1,0,0)`. The LEFT perpendicular of (0,0,1) is (-1,0,0).
//      So it stamps 'left' on a stair that geometrically turns RIGHT.
//
// ⇒ A panel toggle bound to `stair.turnDirection` would have shown "Left" on a
//   stair the architect can see turning right — the label and the mesh
//   contradicting each other, with the panel sounding authoritative. That is a
//   worse defect than an absent control (§CONTEXT-DATA-HONESTY), and it is the
//   most likely reason this control stayed unpublished.
//
// ⭐ THE CURE: the DISPLAYED handedness is DERIVED FROM THE GEOMETRY the user is
// looking at — never read off the stamp. `stairByWalls.ts:318` already
// establishes this precedent for the creation path ("Derived from the walls,
// never asked of the architect"). The stamp is kept in sync on every write so
// the two converge, and `stairSecondRunStampIsStale()` exposes the disagreement
// rather than hiding it.
//
// PURE: no THREE, no DOM, no I/O — the semantic layer
// (§03-BIM-SEMANTIC-MODEL-CONTRACT §1.1), same as StairParameterReconciler.
// Contracts: C84 (element integrity — one authority per axis), C98 (stair),
// C03 (state via commands), C16 (authoring + honest refusal).

import type { StairData, StairFlight, StairLanding, StairShape, Vec3 } from './StairTypes';

/** Which way a second run turns / sits, relative to the FIRST run's direction. */
export type StairRunHandedness = 'left' | 'right';

/**
 * The record field that owns the second run's direction FOR A GIVEN SHAPE.
 *
 * ⚠ These are two different questions and must not be merged into one field:
 * an L-shape's second run turns 90° (so "which way round the corner?"), a
 * U-shape's second run runs 180° back (so "which side of the first run?").
 * A single field would have to mean both, and the geometry reads them at
 * different points (`deriveStairGeometry` case 'L' vs case 'U', and the U value
 * additionally steers the landing slab and the outer rail).
 */
export type StairSecondRunField = 'turnDirection' | 'secondRunSide';

/**
 * Shape → owning field. The ONE table; every reader below consults it rather
 * than re-testing `shape === 'L'` at a call site (C84 EI-3: this family has
 * already paid once for hand-copied thresholds drifting apart).
 *
 * ⛔ `I`, `spiral` and `winder` are ABSENT deliberately — a straight stair has
 * no second run, and offering it a second-run control is a nonsense state.
 * `spiral` / `winder` have no second-run concept in this model either: neither
 * field is read for them anywhere in the geometry.
 */
const SECOND_RUN_FIELD_BY_SHAPE: Readonly<Partial<Record<StairShape, StairSecondRunField>>> = {
    L: 'turnDirection',
    U: 'secondRunSide',
};

/** The field that owns this shape's second-run direction, or `null` if it has none. */
export function stairSecondRunField(shape: StairShape | undefined | null): StairSecondRunField | null {
    if (!shape) return null;
    return SECOND_RUN_FIELD_BY_SHAPE[shape] ?? null;
}

/** True when this SHAPE has a second run whose direction is a choice at all. */
export function stairShapeHasSecondRun(shape: StairShape | undefined | null): boolean {
    return stairSecondRunField(shape) !== null;
}

// ─── vector helpers (plain Vec3 — the semantic layer carries no THREE) ────────

/** C73 §2.3 — dir1/dir2 are UNIT vectors, so this compares a dimensionless cross. */
const EPS_UNIT = 1e-6;
/** C73 §2.3 — 0.1 mm, METRES: lateral offsets are model-space lengths. */
const EPS_M = 1e-4;

function normalizeXZ(v: Vec3 | undefined): Vec3 | null {
    if (!v) return null;
    const len = Math.hypot(v.x, v.z);
    if (len < EPS_UNIT) return null;
    return { x: v.x / len, y: 0, z: v.z / len };
}

/** Left-hand perpendicular — matches StairMeshBuilder's / the reconciler's `perpDir`. */
function perpLeft(v: Vec3): Vec3 {
    return { x: -v.z, y: 0, z: v.x };
}

function dotXZ(a: Vec3, b: Vec3): number {
    return a.x * b.x + a.z * b.z;
}

/** 2-D cross (XZ plane). Same formula as `stairByWalls.ts:150`. */
function crossXZ(a: Vec3, b: Vec3): number {
    return a.x * b.z - a.z * b.x;
}

/** Where flight 1 begins — its own override if it carries one, else the record origin. */
function firstRunOrigin(stair: StairData): Vec3 {
    return stair.flights?.[0]?.startOverride ?? stair.startPosition;
}

/**
 * Reflect a point about the LINE through `origin` along unit direction `axis`,
 * in the XZ plane. Y is carried through untouched (a mirror of a stair's plan
 * handedness must not move it vertically).
 */
function reflectPointAboutAxis(p: Vec3, origin: Vec3, axis: Vec3): Vec3 {
    const dx = p.x - origin.x;
    const dz = p.z - origin.z;
    const along = dx * axis.x + dz * axis.z;
    // The component ALONG the axis is kept; the perpendicular component is negated.
    return {
        x: origin.x + 2 * along * axis.x - dx,
        y: p.y,
        z: origin.z + 2 * along * axis.z - dz,
    };
}

/** Reflect a DIRECTION about `axis` (a pure vector reflection — no origin). */
function reflectDirAboutAxis(v: Vec3, axis: Vec3): Vec3 {
    const along = dotXZ(v, axis);
    return { x: 2 * along * axis.x - v.x, y: v.y, z: 2 * along * axis.z - v.z };
}

// ─── ELIGIBILITY — the honest refusal, in the panel's and the command's voice ──

export type StairSecondRunEligibility =
    | { readonly ok: true; readonly field: StairSecondRunField; readonly shape: StairShape }
    | { readonly ok: false; readonly reason: string };

/**
 * ⭐ Can this stair's second run be turned, and by which field?
 *
 * ONE gate, consulted by BOTH the property panel (to decide whether to render a
 * control at all) and `UpdateStairParametersCommand.canExecute` (to refuse) —
 * so the panel can never offer a flip the command would reject, and can never
 * withhold one the command would accept. That split is exactly what
 * §STAIR-ONE-LIMIT-AUTHORITY (L-1430) cost this family once already.
 *
 * ⚠ THE TWO-RUN GUARD IS LOAD-BEARING, not defensive padding:
 *
 *   • A CURVED stair persists with `shape: 'L'`. `StairPathAdapter.ts:190-192`
 *     maps `C → 'L'` because `StairShape` has no `'C'` member. A curved stair is
 *     therefore INDISTINGUISHABLE from an L by `shape` alone — but it carries
 *     many short arc flights, not two. Reflecting flights[1..] of an arc about
 *     flight 1's axis produces garbage. Counting runs separates them; reading
 *     `shape` cannot.
 *   • A 3-RUN U (`expectedSegmentsFor('U', '3-run')` — StairShapeRegistry) has
 *     THREE runs, and "the second run" is then genuinely ambiguous: turning run
 *     2 and turning run 3 are different edits with different results. That is
 *     UNDECIDED, and it is withheld with a written NOT-YET rather than guessed —
 *     the register `levelChangeVerbs.ts:348` and `duplicateToLevel.ts:471`
 *     already use for this family's storey axis.
 */
export function stairSecondRunEligibility(stair: StairData | null | undefined): StairSecondRunEligibility {
    if (!stair) return { ok: false, reason: 'No stair to read.' };

    const field = stairSecondRunField(stair.shape);
    if (!field) {
        return {
            ok: false,
            reason: stair.shape === 'I'
                ? 'A straight stair has one run, so there is no second run to turn.'
                : `A ${stair.shape} stair has no second run in this model, so there is no direction to turn.`,
        };
    }

    const runs = stair.flights?.length ?? 0;
    if (runs !== 2) {
        return {
            ok: false,
            reason: runs > 2
                ? `This stair has ${runs} runs. Turning "the second run" is only unambiguous on a two-run stair — which of ${runs} runs should move is not decided yet, so the control is withheld rather than guessing.`
                : `This stair has ${runs === 0 ? 'no' : 'one'} run on its record, so there is no second run to turn.`,
        };
    }

    if (!normalizeXZ(stair.flights[0]?.direction)) {
        return { ok: false, reason: 'The first run has no usable direction, so a turn cannot be measured against it.' };
    }

    return { ok: true, field, shape: stair.shape };
}

// ─── DERIVATION — the handedness the architect can SEE ────────────────────────

/**
 * ⭐ The handedness of the second run AS BUILT, read from the flight geometry —
 * never from `turnDirection` / `secondRunSide`.
 *
 * This is the value a panel must display and a RAC verb must report, because it
 * is the one that agrees with the mesh on screen. See the file header for why
 * the stamped field cannot be trusted for display.
 *
 * L — the sign of `cross(dir1, dir2)`. Verified against BOTH independent sites:
 *       `StairParameterReconciler` case 'L': left  ⇒ d2 = (-z1, 0, +x1)
 *                                            ⇒ cross(dir1,d2) = x1² + z1² = +1
 *                                            right ⇒ d2 = (+z1, 0, -x1) ⇒ -1
 *       `stairByWalls.ts:318`: `cross(u1,u2) > 0 ? 'right' : 'left'` — and its
 *       run 1 travels toward the corner, i.e. dir1 = -u1, so
 *       cross(dir1,dir2) = -cross(u1,u2). The two conventions AGREE.
 *
 * U — the runs are anti-parallel, so their cross is ~0 and carries no handedness.
 *     The side is the SIGN OF THE LATERAL OFFSET of run 2's `startOverride`
 *     against the left perpendicular of run 1 — which is precisely how
 *     `deriveStairGeometry` case 'U' constructs it (`+p·width`, p = left perp
 *     for 'left').
 *
 * Returns `null` when the stair is not eligible, or when the geometry is
 * degenerate (a U with no `startOverride`, or an offset below 0.1 mm). ⛔ `null`
 * is NOT "left" — callers must render it as "cannot be read", never as a value
 * (§CONTEXT-DATA-HONESTY: failure and a real answer must never be one value).
 */
export function deriveStairSecondRunHandedness(stair: StairData | null | undefined): StairRunHandedness | null {
    if (!stair) return null;
    const elig = stairSecondRunEligibility(stair);
    if (!elig.ok) return null;

    const dir1 = normalizeXZ(stair.flights[0]?.direction);
    if (!dir1) return null;

    if (elig.field === 'turnDirection') {
        const dir2 = normalizeXZ(stair.flights[1]?.direction);
        if (!dir2) return null;
        const c = crossXZ(dir1, dir2);
        if (Math.abs(c) < EPS_UNIT) return null;   // parallel / anti-parallel: no turn to read
        return c > 0 ? 'left' : 'right';
    }

    // U — lateral sign of run 2's start against run 1's left perpendicular.
    const start2 = stair.flights[1]?.startOverride;
    if (!start2) return null;
    const origin = firstRunOrigin(stair);
    const p = perpLeft(dir1);
    const lateral = (start2.x - origin.x) * p.x + (start2.z - origin.z) * p.z;
    if (Math.abs(lateral) < EPS_M) return null;
    return lateral > 0 ? 'left' : 'right';
}

/** The value STAMPED on the record. May disagree with the geometry — see the header. */
export function stairStampedSecondRunHandedness(stair: StairData | null | undefined): StairRunHandedness | null {
    if (!stair) return null;
    const field = stairSecondRunField(stair.shape);
    if (!field) return null;
    const v = field === 'turnDirection' ? stair.turnDirection : stair.secondRunSide;
    return v === 'left' || v === 'right' ? v : null;
}

/**
 * True when the stamped field contradicts the built geometry — the defect the
 * file header measures. Exposed so a surface can SAY SO rather than silently
 * preferring one of the two (a silent preference is how the two drifted for as
 * long as they did). `false` when either side is unreadable: an absent stamp is
 * not a contradiction.
 */
export function stairSecondRunStampIsStale(stair: StairData | null | undefined): boolean {
    const derived = deriveStairSecondRunHandedness(stair);
    const stamped = stairStampedSecondRunHandedness(stair);
    if (derived === null || stamped === null) return false;
    return derived !== stamped;
}

// ─── THE MIRROR ──────────────────────────────────────────────────────────────

export interface StairSecondRunMirror {
    readonly flights: StairFlight[];
    readonly landings: StairLanding[];
    /** Set only for the shape that owns it — never both. */
    readonly turnDirection?: StairRunHandedness;
    readonly secondRunSide?: StairRunHandedness;
}

/**
 * ⭐ Turn the second run to `want`, returning the fields to write.
 *
 * ── WHAT IS PRESERVED, AND WHY IT IS NOT A GUESS ─────────────────────────────
 *
 * The operation is a REFLECTION ABOUT THE FIRST RUN'S OWN AXIS — the line
 * through run 1's start along run 1's direction. Under that reflection run 1 is
 * pointwise FIXED: same start, same direction, same riser count, same end. Only
 * the second run and the landing move.
 *
 * That is not one of several defensible conventions — it is the literal content
 * of the request. "Change the direction of the second run" names run 1 as the
 * fixed reference; an operation that moved run 1 would be changing the FIRST
 * run's position, which is what `MoveStairCommand` is for. So the start point is
 * preserved, and it is preserved BY CONSTRUCTION rather than by a rule this
 * function asserts.
 *
 * ⛔ WHAT IS **NOT** DECIDED, and is deliberately not decided here: whether the
 * mirrored run may sweep into a wall, off the slab, or out of its room. This
 * model carries no clearance check for stairs, and the founder's standing
 * direction on spatial validity (IMPOSSIBLE vs INADVISABLE vs FINE — always ASK,
 * never auto-edit) is not satisfiable by a function that can only return
 * geometry. This mirror therefore neither refuses nor relocates; the surfaces
 * SAY so. See the panel note and the RAC handoff spec.
 *
 * ── ONE REFLECTION SERVES BOTH SHAPES ────────────────────────────────────────
 *
 * L: run 2 is perpendicular to run 1, so reflecting negates it — exactly the
 *    other perpendicular, i.e. the other turn.
 * U: run 2 is anti-parallel to run 1, so reflecting leaves its DIRECTION alone
 *    (as it must — a U's return run is still a return run) and mirrors only its
 *    lateral OFFSET, which is where a U's handedness actually lives.
 *
 * Positions are mirrored here as well as directions so the record is coherent
 * the instant it is written. `GenerateStairGeometryCommand` then re-derives:
 * `deriveStairGeometry` rebuilds a uniform stair from the flipped FLAG, and
 * `reconcilePathAuthoredStairLayout` re-chains a drawn stair from the flipped
 * DIRECTIONS — both agree with what is returned here, so the rebuild is
 * idempotent rather than corrective.
 *
 * Returns `null` when the stair is not eligible (see
 * {@link stairSecondRunEligibility}) or already faces `want` as built.
 */
export function mirrorStairSecondRun(
    stair: StairData | null | undefined,
    want: StairRunHandedness,
): StairSecondRunMirror | null {
    if (!stair) return null;
    const elig = stairSecondRunEligibility(stair);
    if (!elig.ok) return null;

    const dir1 = normalizeXZ(stair.flights[0]?.direction);
    if (!dir1) return null;

    const current = deriveStairSecondRunHandedness(stair);
    if (current === want) return null;      // already there — no store write, no rebuild.

    const origin = firstRunOrigin(stair);

    const flights: StairFlight[] = stair.flights.map((f, i) => {
        if (i === 0) return { ...f };       // run 1 is pointwise fixed.
        const d = normalizeXZ(f.direction);
        return {
            ...f,
            direction: d ? reflectDirAboutAxis(d, dir1) : f.direction,
            startOverride: f.startOverride
                ? reflectPointAboutAxis(f.startOverride, origin, dir1)
                : f.startOverride,
        };
    });

    const landings: StairLanding[] = (stair.landings ?? []).map(l => ({
        ...l,
        center: l.center ? reflectPointAboutAxis(l.center, origin, dir1) : l.center,
    }));

    return elig.field === 'turnDirection'
        ? { flights, landings, turnDirection: want }
        : { flights, landings, secondRunSide: want };
}
