/**
 * ElevationViewBasis — §ELEV-SYMBOL-OPENING (L-1240)
 *
 * **A TOTAL ORTHOGRAPHIC BASIS FOR AN ELEVATION / SECTION, FOR *EVERY* HORIZONTAL VIEW
 * DIRECTION — NOT SIX OF THEM.**
 *
 * ═══ THE DEFECT THIS CLOSES, MEASURED BEFORE IT WAS WRITTEN ═══
 *
 * The drawing pipeline orients its picture plane through OBC's
 * `TechnicalDrawing.orientTo(direction)`. That method handles **exactly the six cardinal
 * axes**; for anything else its final branch is, verbatim:
 *
 *     else console.warn("[TechnicalDrawing] orientTo: direction does not match any of the
 *                        6 standard axes.");
 *
 * — i.e. it **warns and leaves `this.three.quaternion` UNTOUCHED**, which on a freshly created
 * drawing is the IDENTITY. `TechnicalDrawing.toDrawingSpace()` then computes
 * `inverse(drawing.three.matrixWorld) · ls.matrixWorld` and keeps `(x, z)` while DISCARDING
 * `y`. Under the identity that is **a PLAN PROJECTION**. The canvas meanwhile has already
 * decided it is drawing an elevation (`PlanViewCanvas.setSectionAxes(hAxis, flipV=true)`) and
 * reads the result as `H = x, V = −z`.
 *
 * **So a non-cardinal elevation silently draws the model's PLAN with world-Z read as height.**
 * Every horizontal line in the drawing comes back tilted by its host's PLAN BEARING.
 *
 * MEASURED (the L-1240 probe, `OpeningElevationSymbol.probe.test.ts` case C): a 1.2 m opening
 * in a wall bearing 30°, viewed along that wall's own normal — a direction 30° off cardinal:
 *
 *     head  (4.4054,−0.1701) → (5.4446, 0.4299)   dH=1.0392  dV=0.6000   ang=  30.00°
 *     sill  (4.5554,−0.4299) → (5.5946, 0.1701)   dH=1.0392  dV=0.6000   ang=  30.00°
 *
 * The head and sill of a window — **horizontal lines in space** — come back at 30°, the wall's
 * bearing, and `V` is not a height at all (±0.43 for an opening at world Y ≈ 12.4–13.8 m). This
 * is the founder's report verbatim: *"where the bottom and top are TRUE HORIZONTAL, we ANGLED
 * them"*, tilting one way for a wall bearing +30° and the other for −30°.
 *
 * ⚠ **REACHABLE TODAY, FROM A FIRST-CLASS TOOL.** `SectionPlanToolHandler._commit` writes
 * `projectionDirection: { x: tail.x, y: 0, z: tail.z }` from the tail the user DREW — any angle
 * at all. `EdgeProjectorService.getDirectionForView` returns that explicit direction for
 * `viewType === 'section'` *and* `'elevation'`. (The elevation-mark tool and both documentation
 * generators emit N/S/E/W only, so the stock four elevations are cardinal — that is why this
 * has survived: the default path is inside the supported six.)
 *
 * ═══ WHAT THIS MODULE DOES INSTEAD ═══
 *
 * It computes the basis EXACTLY, for any direction with a horizontal component, and **REFUSES
 * — by returning `null` with a named reason — for a direction that has none.** A vertical
 * direction is a PLAN, not an elevation; silently drawing one as the other is the defect above,
 * so the refusal is the point, not an edge case.
 *
 *   • `v` is **ALWAYS world +Y**. An elevation's vertical axis is plumb, by definition. This is
 *     what makes a horizontal world line project to a horizontal drawing line for EVERY
 *     direction — the invariant C86 §10.2 states and `ElevationViewBasis.test.ts` pins.
 *   • `h` is `normalize(n × v)` — the in-plane horizontal, right-handed with the view direction.
 *   • The quaternion is derived from those, and is asserted **BYTE-IDENTICAL to OBC's own
 *     `orientTo` on all six cardinal directions** (`ElevationViewBasis.test.ts` §A). That
 *     parity is the whole safety argument: adopting this basis cannot move a single line in the
 *     four stock elevations, because on those six inputs it IS the existing behaviour.
 *
 * ⛔ **This module makes no styling decision, reads no store and imports no THREE.** It is
 * plain numbers in, plain numbers out — the same purity `OpeningProfile.ts` keeps, and for the
 * same reason: it is consumed by the projector, by the symbol producer and by tests, and a
 * shared authority that drags a renderer in cannot be shared.
 *
 * Contract compliance:
 *   C09 §4.6.1  — elevation zone table; the picture plane is vertical, `cut` is empty
 *   C86 §10.2   — the head-and-sill invariant this basis is the projection half of
 *   C16 CA-18   — the refusal names the condition, the reason and the live alternative
 *   C05 §4 / P5 — no DOM, no THREE, no store reads, no I/O
 *
 * @module ElevationViewBasis
 */

// ─── Minimal vector shape ─────────────────────────────────────────────────────

/** A plain 3-component vector. Deliberately NOT `THREE.Vector3` — see the header on purity. */
export interface Vec3 { readonly x: number; readonly y: number; readonly z: number }

/** A point in the drawing's 2-D frame: `h` across the sheet, `v` UP the sheet (world height). */
export interface DrawingHV { readonly h: number; readonly v: number }

// ─── The basis ────────────────────────────────────────────────────────────────

/**
 * The orthographic frame of one elevation / section.
 *
 * `n` points INTO the sheet (the projection direction). `h` runs across it. `v` is world up.
 * The three are orthonormal and right-handed, so `quaternion` is a pure rotation.
 */
export interface ElevationViewBasis {
    /** Unit projection direction (into the page). Always horizontal — `y` is exactly 0. */
    readonly n: Vec3;
    /** Unit horizontal axis of the picture plane. */
    readonly h: Vec3;
    /** Unit vertical axis of the picture plane. **Always world +Y.** */
    readonly v: Vec3;
    /**
     * The rotation to place on `TechnicalDrawing.three.quaternion`, as `[x, y, z, w]`.
     *
     * Chosen so that `inverse(R) · P` maps a world point to `(P·h, −P·n, −P·v)` — i.e. the
     * component `toDrawingSpace` KEEPS in `x` is `P·h`, the component it keeps in `z` is
     * `−P·v`, and the component it DISCARDS in `y` is the depth. `PlanViewCanvas` then reads
     * `H = x`, `V = −z`, recovering `(P·h, P·v)` exactly.
     */
    readonly quaternion: readonly [number, number, number, number];
}

/**
 * Why a direction could not be made into an elevation basis.
 *
 * C16 CA-18 — a refusal names the CONDITION, the REASON and the LIVE ALTERNATIVE. The point of
 * returning this instead of quietly falling back to a cardinal guess is that a guessed basis is
 * indistinguishable, on screen, from a correct one until an architect measures the drawing.
 */
export interface ElevationBasisRefusal {
    readonly code: 'DEGENERATE_DIRECTION' | 'VERTICAL_DIRECTION';
    readonly reason: string;
    readonly alternative: string;
}

/**
 * How nearly vertical a direction may be before it is refused as "not an elevation".
 *
 * `|n × up|` is `sin(angle from vertical)`; 1e-6 corresponds to ~0.00006°. Deliberately a
 * DEGENERACY threshold, not a tolerance band: anything with a usable horizontal component is
 * served EXACTLY rather than snapped, which is the entire difference between this module and
 * the six-axis table it replaces.
 */
export const MIN_HORIZONTAL_COMPONENT = 1e-6;

function len(x: number, y: number, z: number): number {
    return Math.hypot(x, y, z);
}

/**
 * THE elevation basis for a projection direction.
 *
 * @param direction  The view direction (need not be normalised, need not be axis-aligned, and
 *                   may carry a vertical component — the horizontal part is what is used).
 * @returns the basis, or `null` when the direction cannot name an elevation. Use
 *          {@link elevationBasisRefusal} to obtain the reason to show the user.
 */
export function elevationViewBasis(direction: {
    x: number; y?: number; z: number;
}): ElevationViewBasis | null {
    const dx = Number(direction.x);
    const dz = Number(direction.z);
    if (!Number.isFinite(dx) || !Number.isFinite(dz)) return null;

    // The picture plane of an elevation is VERTICAL, so only the horizontal part of the
    // direction can define it. A direction with a vertical component is FLATTENED, not
    // refused — that is what `PlanViewManager` and `resolveSectionDepthPlane` already do
    // (`projectionDirection.clone().setY(0)`), and disagreeing with them here would put two
    // answers in the pipeline for one question.
    const hLen = Math.hypot(dx, dz);
    if (!(hLen > MIN_HORIZONTAL_COMPONENT)) return null;

    const nx = dx / hLen;
    const nz = dz / hLen;
    const n: Vec3 = { x: nx, y: 0, z: nz };
    const v: Vec3 = { x: 0, y: 1, z: 0 };

    // h = n × v, normalised. With n horizontal and v = +Y this is exactly (−nz, 0, nx) and is
    // already unit-length; the divide is kept so the identity survives a later change to `v`.
    const hx = n.y * v.z - n.z * v.y;      // = -nz
    const hy = n.z * v.x - n.x * v.z;      // =  0
    const hz = n.x * v.y - n.y * v.x;      // =  nx
    const hl = len(hx, hy, hz);
    if (!(hl > MIN_HORIZONTAL_COMPONENT)) return null;
    const h: Vec3 = { x: hx / hl, y: hy / hl, z: hz / hl };

    return { n, h, v, quaternion: _quaternionFor(h, n, v) };
}

/**
 * The reason {@link elevationViewBasis} returned `null`, for a user-facing refusal.
 *
 * Split from the producer so the hot path allocates no string, and so the wording lives in ONE
 * place rather than at each call site (C16 CA-18 — a refusal whose text is retyped per caller
 * drifts into four different explanations of one condition).
 */
export function elevationBasisRefusal(direction: {
    x: number; y?: number; z: number;
}): ElevationBasisRefusal {
    const dx = Number(direction.x);
    const dz = Number(direction.z);
    if (!Number.isFinite(dx) || !Number.isFinite(dz)) {
        return {
            code: 'DEGENERATE_DIRECTION',
            reason: 'the view direction is not a finite vector, so no picture plane can be built from it',
            alternative: 'set the view’s projection direction, or re-place its elevation / section mark',
        };
    }
    return {
        code: 'VERTICAL_DIRECTION',
        reason: 'the view direction is vertical — an elevation’s picture plane is vertical, '
              + 'so a straight-down direction names a PLAN, not an elevation',
        alternative: 'use a plan view for a downward direction, or give this view a horizontal '
                   + 'projection direction',
    };
}

/**
 * Project a world point into the drawing's `(h, v)` frame.
 *
 * ⭐ **`v` IS THE WORLD HEIGHT, UNCONDITIONALLY** (`basis.v` is world +Y). That single line is
 * the whole head-and-sill invariant: a world-horizontal line has one `p.y`, therefore one `v`,
 * therefore draws horizontal — for EVERY direction, raked host or not.
 */
export function projectToElevation(basis: ElevationViewBasis, p: Vec3): DrawingHV {
    return {
        h: p.x * basis.h.x + p.y * basis.h.y + p.z * basis.h.z,
        v: p.x * basis.v.x + p.y * basis.v.y + p.z * basis.v.z,
    };
}

/** Signed depth of a world point along the view direction — positive is FARTHER from the viewer. */
export function elevationDepthOf(basis: ElevationViewBasis, p: Vec3): number {
    return p.x * basis.n.x + p.y * basis.n.y + p.z * basis.n.z;
}

// ─── Quaternion ───────────────────────────────────────────────────────────────

/**
 * The rotation whose COLUMNS are `(h, −n, −v)`.
 *
 * Derived, not guessed, from what `toDrawingSpace` does with it: it applies
 * `inverse(R)` and keeps components 0 and 2. `inverse(R)` of a rotation is its transpose, whose
 * ROWS are the columns of `R` — so row 0 = `h` (kept as drawing `x`), row 2 = `−v` (kept as
 * drawing `z`, which `PlanViewCanvas` negates back to the world height), and row 1 = `−n` is
 * the depth that gets discarded.
 *
 * Right-handedness: `h · ((−n) × (−v)) = h · (n × v) = h · h = 1`, since `h` is defined as
 * `n × v`. So this is a pure rotation for every admissible input, and the conversion below is
 * safe without a determinant guard.
 */
function _quaternionFor(h: Vec3, n: Vec3, v: Vec3): [number, number, number, number] {
    // Column-major basis: c0 = h, c1 = -n, c2 = -v. m[row][col].
    const m00 = h.x, m01 = -n.x, m02 = -v.x;
    const m10 = h.y, m11 = -n.y, m12 = -v.y;
    const m20 = h.z, m21 = -n.z, m22 = -v.z;

    // Shepperd's method — the branch-per-largest-diagonal form, for numerical stability at
    // every rotation (the naive `w`-first form loses precision near 180°, which IS one of the
    // six cardinals and therefore not hypothetical here).
    const trace = m00 + m11 + m22;
    let x: number, y: number, z: number, w: number;
    if (trace > 0) {
        const s = 0.5 / Math.sqrt(trace + 1.0);
        w = 0.25 / s;
        x = (m21 - m12) * s;
        y = (m02 - m20) * s;
        z = (m10 - m01) * s;
    } else if (m00 > m11 && m00 > m22) {
        const s = 2.0 * Math.sqrt(1.0 + m00 - m11 - m22);
        w = (m21 - m12) / s;
        x = 0.25 * s;
        y = (m01 + m10) / s;
        z = (m02 + m20) / s;
    } else if (m11 > m22) {
        const s = 2.0 * Math.sqrt(1.0 + m11 - m00 - m22);
        w = (m02 - m20) / s;
        x = (m01 + m10) / s;
        y = 0.25 * s;
        z = (m12 + m21) / s;
    } else {
        const s = 2.0 * Math.sqrt(1.0 + m22 - m00 - m11);
        w = (m10 - m01) / s;
        x = (m02 + m20) / s;
        y = (m12 + m21) / s;
        z = 0.25 * s;
    }

    // ── SIGN CANONICALISATION — and it is NOT cosmetic tidying ──────────────────
    //
    // `q` and `−q` are THE SAME ROTATION (the quaternion double cover), so the projection is
    // identical either way. Shepperd's branches, however, pick the sign from whichever
    // diagonal element happened to be largest — so two of the four horizontal cardinals came
    // out negated relative to the literals OBC's `orientTo` writes. Left alone, the parity
    // test would have to assert "equal up to sign", and an assertion with an escape hatch in
    // it is exactly the kind that stops catching the thing it was written for.
    //
    // Canonical form: first non-zero of (w, x, y, z) is positive. MEASURED to reproduce all
    // four OBC literals EXACTLY under this rule — see `ElevationViewBasis.test.ts` §A, which
    // asserts byte equality and would fail if this block were removed.
    if (w < 0 || (w === 0 && (x < 0 || (x === 0 && (y < 0 || (y === 0 && z < 0)))))) {
        return [-x, -y, -z, -w];
    }
    return [x, y, z, w];
}

/**
 * The six quaternions OBC's `TechnicalDrawing.orientTo` hard-codes, keyed by direction.
 *
 * Present ONLY so `ElevationViewBasis.test.ts` can assert parity against the real library
 * values without importing `@thatopen/components` into an L3 pure module. ⛔ It is NOT a
 * lookup table for the producer — `elevationViewBasis` computes every direction, including
 * these six, from the same formula. A second code path for the cardinals is exactly the
 * six-vs-infinity split this module exists to remove.
 */
export const OBC_CARDINAL_QUATERNIONS: ReadonlyArray<{
    readonly direction: Vec3;
    readonly quaternion: readonly [number, number, number, number];
}> = Object.freeze([
    { direction: { x:  1, y: 0, z:  0 }, quaternion: [0.5, -0.5, 0.5, 0.5] },
    { direction: { x: -1, y: 0, z:  0 }, quaternion: [0.5, 0.5, -0.5, 0.5] },
    { direction: { x:  0, y: 0, z:  1 }, quaternion: [0, Math.SQRT1_2, -Math.SQRT1_2, 0] },
    { direction: { x:  0, y: 0, z: -1 }, quaternion: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] },
] as const);
