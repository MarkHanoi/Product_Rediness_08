// WallRake — §WALL-RAKE. The single source of truth for what a raked (leaning)
// wall MEANS. PURE module: no THREE, no DOM, no store reads.
//
// ─── THE SIGN CONVENTION — STATED ONCE, NEVER RE-DERIVED ──────────────────────
//
// `WallData.rakeAngleDeg` is the angle, in DEGREES, between the FLOOR PLANE and
// the wall's rising face, measured **on the wall's LEFT side**, where LEFT is
// `leftPerp(direction)` in plan-XZ — i.e. 90° counter-clockwise from the wall's
// start→end direction when looking DOWN from +Y. This is the SAME "left" that
// `WallFootprint2D` and `JunctionResolverV2` already use (`leftPerp(d) = (-d.z, d.x)`);
// there is exactly one notion of "left" in the wall subsystem and this reuses it.
//
//   90°  — VERTICAL. The default, and the value every legacy wall loads as.
//   < 90 — the wall leans so its TOP moves TOWARD its LEFT.
//   > 90 — the wall leans so its TOP moves TOWARD its RIGHT.
//
// The wall pivots about its BASE centreline (`baseLine` at the level's floor).
// The bottom of the wall never moves. Therefore:
//
//     topOffset = height · cot(rakeAngleDeg) · leftPerp(direction)
//
// Worked example (pins the sign): a wall from (0,0) to (1,0) in XZ has
// direction (1,0) and leftPerp (0,1) = +Z. At rakeAngleDeg = 80° and height 3 m,
// cot(80°) ≈ +0.1763, so the top displaces ≈ +0.529 m in +Z — toward the LEFT.
// At 120°, cot(120°) ≈ −0.5774, so the top displaces ≈ −1.732 m — toward the RIGHT.
//
// ─── THE THICKNESS CONVENTION — ALSO STATED ONCE ──────────────────────────────
//
// `WallData.thickness` remains the **HORIZONTAL (plan) thickness**, measured in
// the XZ plane exactly as it is today. It is NOT re-interpreted as the
// perpendicular (true) thickness.
//
// WHY. Under this convention the wall's plan footprint at floor level is
// BYTE-IDENTICAL to what it is today for every rake angle. That is not a
// convenience — it is the reason the change is safe: `JunctionResolverV2`,
// `WallFootprint2D`, `WallOccupancyStore`, room detection, the plan projection
// and every opening-offset computation all operate on that footprint and are
// therefore provably unaffected. Re-interpreting `thickness` as perpendicular
// would silently widen the plan footprint of every raked wall and force the
// junction solver to be re-derived.
//
// The consequence, stated honestly: the TRUE (perpendicular) thickness of a
// raked wall is `thickness · sin(rakeAngleDeg)` — thinner than authored. For a
// PLAIN single-layer wall that is a cosmetic difference (0.2 m at 80° measures
// 0.197 m perpendicular). For a LAYERED wall it is NOT cosmetic: an architect
// authoring "100 mm blockwork" means 100 mm PERPENDICULAR, and honouring that
// requires the footprint to widen to `t / sin θ`. That work is not done, which
// is precisely why {@link rakeAuthorability} REFUSES a rake on a layered wall.
//
// ─── WHAT IS DELIBERATELY REFUSED (C65 §3.9 — no affordance without an
//     implementation) ────────────────────────────────────────────────────────
//
//   • rake × curve    — the shear direction is the wall's plan normal, which
//                       VARIES along an arc. One shear vector is simply wrong;
//                       the correct construction is a swept per-station frame.
//   • rake × layers   — the perpendicular-thickness convention above.
//   • rake × openings — the opening carve is a vertical band (WallHoleBodyBuilder);
//                       under a rake it must become an inclined one.
//
// These are enforced in `WallDataSchema` (add path) and `WallStore` (update and
// addOpening paths) so the model can never hold a combination the geometry
// cannot render. A refusal is a correct answer; a silently-wrong wall is not.

/** Plan-space 2-D point, mirroring `JunctionResolverV2.Pt2` (kept local so this module stays dependency-free). */
export interface RakePt2 { readonly x: number; readonly z: number }

/** The canonical vertical rake. Every wall without an explicit `rakeAngleDeg` IS this. */
export const RAKE_VERTICAL_DEG = 90;

/**
 * Authorable range, in degrees. Chosen so the lateral shift stays bounded:
 * |cot(15°)| ≈ 3.73, so a 3 m wall displaces at most ≈ 11.2 m. Beyond that the
 * "wall" is a roof and belongs to a different element. Values outside the range
 * are REJECTED at the schema boundary rather than clamped — clamping would make
 * the stored model disagree with what the author asked for.
 */
export const RAKE_MIN_DEG = 15;
export const RAKE_MAX_DEG = 165;

/** Angles within this of 90° are treated as exactly vertical (no shear, legacy code path). */
export const RAKE_VERTICAL_EPS_DEG = 1e-6;

const DEG2RAD = Math.PI / 180;

/**
 * Resolve a possibly-absent rake to a concrete angle.
 * `undefined` / `null` / non-finite ⇒ {@link RAKE_VERTICAL_DEG}. This is the
 * round-trip guarantee for old snapshots: a wall serialised before this field
 * existed loads as 90° and re-serialises without the field.
 */
export function resolveRakeDeg(rakeAngleDeg: number | null | undefined): number {
    return typeof rakeAngleDeg === 'number' && Number.isFinite(rakeAngleDeg)
        ? rakeAngleDeg
        : RAKE_VERTICAL_DEG;
}

/** TRUE when the wall is vertical — i.e. the rake is absent or indistinguishable from 90°. */
export function isVerticalRake(rakeAngleDeg: number | null | undefined): boolean {
    return Math.abs(resolveRakeDeg(rakeAngleDeg) - RAKE_VERTICAL_DEG) <= RAKE_VERTICAL_EPS_DEG;
}

/** TRUE when the value is a rake this build can actually author and render. */
export function isRakeInRange(rakeAngleDeg: number): boolean {
    return Number.isFinite(rakeAngleDeg)
        && rakeAngleDeg >= RAKE_MIN_DEG
        && rakeAngleDeg <= RAKE_MAX_DEG;
}

/**
 * Horizontal displacement per METRE of height, as a signed multiplier on the
 * wall's LEFT normal. This is `cot(rake)`; it is 0 at exactly 90°.
 */
export function rakeShearPerMetre(rakeAngleDeg: number | null | undefined): number {
    if (isVerticalRake(rakeAngleDeg)) return 0;
    const r = resolveRakeDeg(rakeAngleDeg) * DEG2RAD;
    const s = Math.sin(r);
    if (Math.abs(s) < 1e-12) return 0;      // degenerate — refuse to divide by ~0
    return Math.cos(r) / s;
}

/**
 * The horizontal offset of the wall's TOP footprint relative to its BASE footprint.
 *
 * `direction` need not be normalised — it is normalised here. Returns `null`
 * for a vertical wall (and for a degenerate direction) so callers can take the
 * exact pre-existing, un-sheared code path and stay byte-identical.
 */
export function rakeTopOffset(
    rakeAngleDeg: number | null | undefined,
    height: number,
    direction: RakePt2,
): RakePt2 | null {
    const k = rakeShearPerMetre(rakeAngleDeg);
    if (k === 0 || !Number.isFinite(height) || height === 0) return null;
    const L = Math.hypot(direction.x, direction.z);
    if (!(L > 1e-12)) return null;
    const dx = direction.x / L;
    const dz = direction.z / L;
    // leftPerp(d) = (-d.z, d.x) — the SAME convention as WallFootprint2D.
    const shift = height * k;
    return { x: -dz * shift, z: dx * shift };
}

/** Magnitude of the top-vs-base horizontal displacement. Used to size validity guards. */
export function rakeLateralShift(rakeAngleDeg: number | null | undefined, height: number): number {
    if (!Number.isFinite(height)) return 0;
    return Math.abs(height * rakeShearPerMetre(rakeAngleDeg));
}

/**
 * The TRUE (perpendicular) thickness of a wall whose authored, horizontal
 * `thickness` is `planThickness`. Equals `planThickness` at 90°.
 * Exposed so the inspector can show the author what they actually built.
 */
export function perpendicularThickness(
    planThickness: number,
    rakeAngleDeg: number | null | undefined,
): number {
    if (isVerticalRake(rakeAngleDeg)) return planThickness;
    return planThickness * Math.abs(Math.sin(resolveRakeDeg(rakeAngleDeg) * DEG2RAD));
}

// ─── Authorability ────────────────────────────────────────────────────────────

/** The subset of a wall this module needs in order to judge a rake. */
export interface RakeSubject {
    readonly rakeAngleDeg?: number;
    readonly curve?: unknown;
    readonly layers?: ReadonlyArray<unknown>;
    readonly openings?: ReadonlyArray<unknown>;
}

export interface RakeAuthorability {
    readonly ok: boolean;
    /** Machine-readable reason. `undefined` when `ok`. */
    readonly code?: 'out-of-range' | 'curved' | 'layered' | 'hosted-openings';
    /** Human-readable reason, suitable for a store error or a disabled-control tooltip. */
    readonly reason?: string;
}

const OK: RakeAuthorability = { ok: true };

/**
 * Decide whether `subject` may hold a non-vertical rake, given everything else
 * about it. A VERTICAL wall is always authorable — this function never rejects
 * a wall that has no rake, so it can be called unconditionally on every write.
 *
 * This is the single gate. `WallDataSchema` (create), `WallStore.update` (edit)
 * and `WallStore.addOpening` (host an opening) all consult it, so there is no
 * ordering of operations that can reach a combination the builder cannot draw.
 */
export function rakeAuthorability(subject: RakeSubject): RakeAuthorability {
    const deg = subject.rakeAngleDeg;
    if (deg === undefined || isVerticalRake(deg)) return OK;

    if (!isRakeInRange(deg)) {
        return {
            ok: false,
            code: 'out-of-range',
            reason:
                `wall.rakeAngleDeg must be within [${RAKE_MIN_DEG}, ${RAKE_MAX_DEG}] degrees ` +
                `(90 = vertical); received ${deg}.`,
        };
    }
    if (subject.curve !== undefined && subject.curve !== null) {
        return {
            ok: false,
            code: 'curved',
            reason:
                'wall.rakeAngleDeg is not supported on a CURVED wall: the shear direction is the ' +
                "wall's plan normal, which varies along an arc, so a single shear vector would " +
                'produce a wall that is only correct at one station. Straighten the wall or leave ' +
                'the rake at 90.',
        };
    }
    if (subject.layers !== undefined && subject.layers !== null && subject.layers.length > 1) {
        return {
            ok: false,
            code: 'layered',
            reason:
                'wall.rakeAngleDeg is not supported on a LAYERED wall: layer thicknesses are ' +
                'authored PERPENDICULAR to the face, and the raked plan footprint that honours ' +
                'that (t / sin θ per layer) is not implemented. Use a single-layer wall type.',
        };
    }
    if (subject.openings !== undefined && subject.openings !== null && subject.openings.length > 0) {
        return {
            ok: false,
            code: 'hosted-openings',
            reason:
                'wall.rakeAngleDeg is not supported on a wall that HOSTS OPENINGS: the opening ' +
                'carve is a vertical band and the door/window transform assumes a vertical host ' +
                'face (C15). Remove the openings, or leave the rake at 90.',
        };
    }
    return OK;
}
