// WallProfile — §WALL-PROFILE. The single source of truth for what a wall's
// ELEVATION PROFILE means. PURE module: no THREE, no DOM, no store reads.
//
// Modelled deliberately and closely on `WallRake.ts`, which is the proven shape for
// "a new per-wall geometric property with combinations it cannot yet honour": ONE
// module owning the meaning, ONE authorability gate consulted at EVERY write
// boundary, and refusals that name their reason. `PropertyDescriptorGenerator.ts:19-20`
// records what the alternative costs — a hand-copied second copy of the refusal rules
// that drifted from the gate and had to be deleted.
//
// ─── WHAT A PROFILE IS ────────────────────────────────────────────────────────
//
// Revit's "Edit Profile": the wall's vertical outline, authored IN THE WALL'S OWN
// PLANE. It turns a rectangular wall into a gable-topped wall, a stepped wall, a wall
// with a raked top, or a wall with a shaped notch — without modelling it as a separate
// element.
//
// ─── THE COORDINATE CONVENTION — STATED ONCE, NEVER RE-DERIVED ────────────────
//
// A profile is a CLOSED RING of vertices in the wall's local 2-D elevation frame:
//
//   u — distance ALONG the baseline from `baseLine[0]`, in metres, in [0, planarLength]
//   v — height ABOVE THE WALL'S BASE PLANE (level elevation + baseOffset), in metres
//
// Both are measured in the **UN-SHEARED** frame. That is not an arbitrary pick: it is
// the same commitment `WallRake.ts` already made for `thickness` and for an opening's
// `sillHeight`/`height` — *the authored quantity is measured in the un-sheared frame,
// and the true face-plane quantity is DERIVED*. Choosing the sheared frame would mint
// a second, contradictory convention inside one subsystem, and it would make a
// profile's numbers change meaning the moment its host was raked.
//
// The consequence, and it is the reason this convention is worth the words: a profile
// and a rake COMPOSE. The profiled wall is the image of the un-raked profiled wall
// under the same shear that `rakeShearPerMetre` already defines. Neither feature has
// to know about the other.
//
// ─── THE RECTANGLE IS THE ABSENT PROFILE, AND THAT IS THE ROUND-TRIP GUARANTEE ─
//
// `wallProfile` absent / null => the implicit rectangle [0, L] x [0, height]. Every
// wall ever authored IS that rectangle, so every existing wall, every existing
// snapshot and every existing geometry path is untouched vertex-for-vertex. This is
// the same guarantee `resolveRakeDeg` gives with 90 degrees, and it is what makes the
// field additive under C47 §1.2 (optional, no MAJOR bump).
//
// ─── `height` REMAINS THE BOUNDING HEIGHT ─────────────────────────────────────
//
// A profile may not exceed [0, L] x [0, height]. `wall.height` therefore keeps meaning
// exactly what it means today — the wall's overall extent — so `WallOccupancyStore`,
// the plan projection, IFC export and every consumer that reads `height` stay correct
// without being taught about profiles. A profile SUBTRACTS from the rectangle; it
// never grows it. Raising a gable means raising `height` and then cutting the
// shoulders down.
//
// ─── WHAT IS DELIBERATELY REFUSED (C65 §3.9 — no affordance without an
//     implementation) ────────────────────────────────────────────────────────────
//
//   ✅ profile x curve   — BUILT (§FEAT-WALL-PROFILE-CURVED, WJ1 2026-08-19, L-1072).
//                         The paragraph below was RIGHT about the diagnosis and it is kept
//                         because it is the reasoning that let the arm be lifted: it said
//                         plainly *"A profile on a curve is NOT ill-posed … It is refused
//                         because it is UNBUILT … This one CAN lift."* It lifted. `u` is
//                         ARC LENGTH (`wallCentrelineLength`), the per-station tessellation
//                         is `insertStationsAt`, and the missing per-station top is
//                         `CurvedProfileHeights`. What survives is the narrower
//                         `curved-multi-interval` refusal — a swept solid carries ONE
//                         vertical span per station.
//                         ⚠ The cross-reference below to rake's ill-posedness is DEAD TEXT:
//                         `rakeAuthorability` lifted its own `curved` arm on 2026-08-19 and
//                         a raked curved wall now ships as a CONE. Do not cite it.
//   • profile x curve   — REFUSED, and NOT for the reason rake is refused on a curve.
//                         Rake x curve is ILL-POSED (`WallRake.ts:83-86`, "never
//                         lifts") because one shear vector cannot follow an arc.
//                         A profile on a curve is NOT ill-posed — the face of a
//                         curved wall is a developable surface and (u, v) with u as
//                         ARC LENGTH is a perfectly good parameterisation of it.
//                         It is refused because it is UNBUILT: a straight edge in
//                         (u, v) is not a straight edge in space, so every profile
//                         edge becomes a curve that must be tessellated per station,
//                         and the curved arm builds its cap from `layerPlans` that
//                         carry no per-station top. ⚠ Do NOT copy rake's
//                         ill-posedness wording onto this refusal: curved x LAYERED
//                         is already BUILT, so "curved walls cannot do the hard
//                         thing" is not a claim this repo can make. This one CAN
//                         lift; rake's cannot.
//   • profile x layers  — UNBUILT. The V2 band slicer builds each band by slicing the
//                         plan footprint and extruding it between two HORIZONTAL Y
//                         planes; there is no per-station top in that path.
//   • profile x openings — UNBUILT, and the dangerous one. The opening-bearing body
//                         composes a rectangle minus voids and assumes the outer
//                         boundary is that rectangle (`WallHoleBodyBuilder.ts:141-151`
//                         hard-codes it). Worse, `WallOccupancyStore.canPlace` is
//                         explicitly 1-D and vertical-blind (`:669-671`), so nothing
//                         would notice an opening left floating in material the
//                         profile removed. An opening in removed material is worse
//                         than a refusal.
//
// ⛔ "INSTANCED" IS NOT ON THIS LIST, AND THE REASON MATTERS.
//
// The lane brief named four refusals — curved, layered, opening-bearing and
// INSTANCED. The first three are here. The fourth is handled as a ROUTER EXCLUSION
// (`WallFragmentBuilder.isSimpleWall`) rather than an authorability refusal, because
// making it a refusal would refuse EVERY wall: `isSimpleWall` selects exactly
// {not curved, <=1 layer, no openings, no joins}, which is precisely the set that
// remains after the three refusals above. A gate whose refusals intersect to the
// empty set is not a gate, it is a disabled feature with a reason attached.
//
// So the instanced arm is excluded at the ROUTER — one condition, `!hasWallProfile`,
// beside the others already there. ⚠ DO NOT trust a count written here: this line used
// to say "beside the four that are already there" and `isSimpleWall` now carries seven
// other clauses. **Read the predicate** (`WallFragmentBuilder.isSimpleWall`); it is the
// artefact, this is a paraphrase of it.
//
// ⚠ THE RAKE CLAIM THAT USED TO END THIS PARAGRAPH IS STALE — CORRECTED 2026-08-22
//   (WALL35, L-7102). It read: *"That is also the shape of the fix the instanced arm
//   needs for RAKE, **which it does not have**: measured 2026-08-18, a plain raked wall
//   instances with a matrix BYTE-IDENTICAL to the vertical wall's and renders vertical
//   while the model says otherwise (pinned §(A2b) of
//   `WallProfileNonRegressionBaseline.test.ts`). That defect is NOT fixed here — it is
//   reported and owned elsewhere."*
//
//   **It HAS the fix.** L-955 closed by `2449c742` on 2026-08-18 — the same day the
//   measurement above was taken, from the other side. `isSimpleWall` now tests
//   `isVerticalRake((wall as { rakeAngleDeg?: number }).rakeAngleDeg)`, and §(A2b) of
//   `WallProfileNonRegressionBaseline.test.ts` was rewritten to assert the EXCLUSION
//   (*"a plain RAKED wall is EXCLUDED from the instanced arm (L-955, closed)"*) plus the
//   control that the same wall at 90° still instances. Re-measured 2026-08-22: the raked
//   wall registers 0 instances, the vertical one 1.
//
//   The diagnosis the paragraph carried is UNCHANGED and still correct — a T·R·S product
//   expresses neither a shear nor a non-rectangular silhouette — which is why it is
//   corrected in place rather than deleted. What is wrong is only the tense.
//
// ─── SLICE 1 SCOPE — ⚠ THIS BLOCK WAS TRUE AT SLICE 1 AND IS NOW FALSE ────────
//
// ⛔ **CORRECTED IN PLACE 2026-08-22 (WALL35, L-7100). DO NOT DELETE THE PARAGRAPH; it
//    is the record of what this module was scoped to be, and reading it as a statement
//    about TODAY is what sent a bug hunt looking for an authoring path that already
//    existed.** It read, verbatim:
//
//      "This slice adds the MODEL, the GATE, PERSISTENCE and CACHE INVALIDATION. It adds
//       NO geometry and NO authoring path: nothing in the repo writes `wallProfile`, so
//       the field is unauthorable by construction. The gate is therefore in place BEFORE
//       the authoring path exists, which is the only ordering in which a refusal can
//       never be reached too late. A profile that could be stored but not drawn would be
//       exactly the silently-wrong wall `WallRake.ts:102` forbids."
//
//    **Every clause of the first half is now false.** Measured 2026-08-22:
//
//      • GEOMETRY EXISTS — `WallProfileBodyBuilder.buildWallProfileBodyGeometry`
//        (§FEAT-WALL-PROFILE-BODY, L-1067), reached from `WallFragmentBuilder`'s profile
//        arm; plus the per-station curved arm (§FEAT-WALL-PROFILE-CURVED, L-1072) and the
//        end-edge mitre (§FEAT-WALL-PROFILE-MITRE, L-1071).
//      • AN AUTHORING PATH EXISTS — `WallTool.enterProfileEditMode` →
//        `WallProfileEditor` → `WallTool._commitWallProfile` → `element.updateParameters`.
//      • IT IS REACHABLE BY A USER GESTURE — the **Contextual Edit Bar's "Edit Profile"
//        button** (`apps/editor/src/ui/ContextualEditBar.ts:1447` maps `wall: w.wallTool`
//        in its candidate table; `initTools.ts:879` assigns `window.wallTool`), shown for
//        a single selected wall and enabled per `profileEditAvailability`.
//      • AND TWO RESTORE PATHS WRITE IT — `ProjectLoader.ts:1051` and
//        `ImportProjectCommand.ts:686`, both via `CreateWallCommand`.
//
// ⭐ THE SECOND HALF STILL STANDS AND IS THE PART TO KEEP: *"a profile that could be
//   stored but not drawn would be exactly the silently-wrong wall `WallRake.ts:102`
//   forbids."* That is not a historical note — it is the standing invariant, and it was
//   BREACHED between 2026-08-19 and 2026-08-22 in a way this header could not describe,
//   because the breach was not in the model or the gate at all. The profile was stored
//   correctly, drawn correctly, and its **edge overlay was placed in a different frame**
//   (§WALL-EDGE-OVERLAY-FRAME, L-7101). A header that denies the feature exists cannot
//   warn you about the feature's bugs, which is precisely the cost of leaving this
//   paragraph in the present tense for three days.
//
//   The ordering claim also survives on its own terms: the gate DID land before the
//   authoring path, and it did its job — `profileAuthorability` refused every combination
//   it was supposed to refuse throughout. Nothing about L-7101 is a gate failure.

// ⚠ THE ONE IMPORT, AND IT DOES NOT COST THIS MODULE ITS PURITY. `WallArcParam` imports
//   nothing at all — no THREE, no DOM, no store — so `WallProfile` remains the pure module
//   its header promises and stays safe for `WallDataSchema` and the store gates to call.
//   It is imported rather than re-derived because "how long is this wall along its run?" is
//   a question this package must answer in exactly ONE place: a second arc-length formula
//   here would disagree with the polyline the solid is actually built from the moment
//   either changed, and `u` would then mean two things (C84 EI-9).
import { wallCentrelineLength } from './WallArcParam';

/** One vertex of a wall's elevation profile, in the wall's local (u, v) frame. */
export interface WallProfileVertex {
    /** Distance along the baseline from `baseLine[0]`, metres. */
    readonly u: number;
    /** Height above the wall's base plane, metres. */
    readonly v: number;
}

/**
 * A wall's authored elevation outline. `ring` is a CLOSED polygon — the closing edge
 * from the last vertex back to the first is IMPLICIT and must not be repeated.
 *
 * Wrapped in an object rather than being a bare array so that inner loops (a void
 * fully enclosed by wall) can be added later as a second field without a breaking
 * change to the persisted shape. There are none today and none are accepted.
 */
export interface WallProfile {
    readonly ring: ReadonlyArray<WallProfileVertex>;
}

/** A ring below this cannot bound an area. */
export const PROFILE_MIN_VERTICES = 3;

/** Minimum enclosed area a profile ring must have, m^2. Below this it draws nothing. */
export const PROFILE_MIN_AREA_M2 = 1e-6;

/** Tolerance for the "profile must fit inside [0,L]x[0,height]" bound check, metres. */
export const PROFILE_BOUND_EPS_M = 1e-9;

/** Plan-space 2-D point, mirroring `WallRake.RakePt2` (local: this module stays dependency-free). */
export interface ProfilePt2 { readonly x: number; readonly z: number }

/**
 * The wall's PLANAR (XZ) centreline length — the `u` axis extent.
 *
 * Spelled here and only here, for the same reason `rakedPlanThickness` declares itself
 * "the SINGLE place that division is spelled": the schema, the store gate and any
 * future builder must agree on what `u in [0, L]` means, and three copies of
 * `Math.hypot` is how they stop agreeing. Y is ignored deliberately — `baseLine.y`
 * carries the level elevation and is not part of the wall's planar length
 * (`WallDataSchema.ts:236-238` states the same rule for MIN_WALL_LEN).
 */
export function wallProfilePlanarLength(
    baseLine: readonly [ProfilePt2, ProfilePt2] | undefined | null,
): number {
    if (!baseLine || !baseLine[0] || !baseLine[1]) return NaN;
    return Math.hypot(baseLine[1].x - baseLine[0].x, baseLine[1].z - baseLine[0].z);
}

/**
 * Resolve a possibly-absent profile to a concrete one, or `null` for THE RECTANGLE.
 *
 * `undefined` / `null` / a malformed value => `null`. This is the round-trip guarantee
 * for old snapshots, and the exact counterpart of `WallRake.resolveRakeDeg`: a wall
 * serialised before this field existed loads as the rectangle and re-serialises
 * without the key.
 *
 * ⚠ A malformed value resolving to `null` is SAFE here and is not silent narrowing
 * (C84 EI-2): the authorability gate below REJECTS malformed profiles at every write
 * boundary, so a malformed value cannot be in the store to begin with. This function's
 * tolerance exists for the READ path, where treating an unparseable legacy blob as
 * "the rectangle every wall already is" is the only non-destructive answer.
 */
export function resolveWallProfile(profile: unknown): WallProfile | null {
    if (profile === null || profile === undefined) return null;
    const ring = (profile as { ring?: unknown }).ring;
    if (!Array.isArray(ring) || ring.length < PROFILE_MIN_VERTICES) return null;
    const out: WallProfileVertex[] = [];
    for (const p of ring) {
        const u = (p as { u?: unknown } | null)?.u;
        const v = (p as { v?: unknown } | null)?.v;
        if (typeof u !== 'number' || typeof v !== 'number') return null;
        if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
        out.push({ u, v });
    }
    return { ring: out };
}

/** TRUE when the wall carries a real profile — i.e. it is NOT the implicit rectangle. */
export function hasWallProfile(profile: unknown): boolean {
    return resolveWallProfile(profile) !== null;
}

/** Twice the signed area of the ring; positive is counter-clockwise in (u, v). */
export function wallProfileSignedArea2(ring: ReadonlyArray<WallProfileVertex>): number {
    let acc = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        acc += a.u * b.v - b.u * a.v;
    }
    return acc;
}

// ─── The ring as an ENVELOPE — §FEAT-WALL-PROFILE-CURVED (WJ1, L-1072) ──────────
//
// A STRAIGHT wall consumes the ring as a `THREE.Shape` and extrudes it — the whole ring,
// exactly as authored, no sampling. A CURVED wall cannot: its body is a swept solid built
// from a station polyline, and the thing a sweep needs at each station is a TOP height and
// a BOTTOM height, not a polygon.
//
// ⭐ THAT IS THE ENTIRE CONTENT OF "the curved builder has no per-station top". It names a
//   MISSING FUNCTION, not a contradiction — and this is that function.
//
// ⚠ WHAT AN ENVELOPE CAN AND CANNOT REPRESENT, SAID BEFORE IT IS DISCOVERED. `topAt(u)`
//   is the HIGHEST point of the ring boundary at `u` and `bottomAt(u)` the lowest. For any
//   ring whose vertical extent at each `u` is a single interval — which is every profile a
//   draughtsman draws as a wall elevation, and every ring the editor can currently author
//   — the envelope IS the ring, losslessly. A ring with a re-entrant middle (a porthole, an
//   hourglass) has two intervals at some `u`, and the envelope fills the gap between them:
//   the curved wall would be SOLID where the ring is empty. That is a real limitation, it
//   is a limitation of the SWEEP and not of this function, and the honest place to fix it
//   is a per-station multi-interval sweep. It is declared in C85 rather than hidden here.

/**
 * The ring's vertical extent at `u`: `[bottom, top]`, or `null` when `u` lies outside the
 * ring's `u` range entirely.
 *
 * Computed by intersecting the vertical line at `u` with every EDGE of the closed ring and
 * taking the extremes of the crossings. Vertices are included by construction (an edge
 * ending at `u` contributes its endpoint), which is what makes a station placed EXACTLY on
 * a profile vertex land on the vertex rather than near it.
 *
 * ⚠ A vertical edge (`a.u === b.u`) contributes BOTH its endpoints rather than being
 *   skipped as a zero-length crossing. Skipping it is the obvious implementation and it is
 *   wrong at precisely the place it matters most: the ring's two END edges are vertical,
 *   so a skipped vertical edge makes `topAt(0)` and `topAt(L)` return null and the wall
 *   lose both its ends.
 */
export function wallProfileExtentAt(
    ring: ReadonlyArray<WallProfileVertex>,
    u: number,
): { bottom: number; top: number } | null {
    if (!Array.isArray(ring) || ring.length < PROFILE_MIN_VERTICES) return null;
    if (!Number.isFinite(u)) return null;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const du = b.u - a.u;
        if (Math.abs(du) <= PROFILE_BOUND_EPS_M) {
            // Vertical edge — contributes its whole span when `u` is on it.
            if (Math.abs(a.u - u) <= PROFILE_U_TOL_M) {
                lo = Math.min(lo, a.v, b.v);
                hi = Math.max(hi, a.v, b.v);
            }
            continue;
        }
        const t = (u - a.u) / du;
        if (t < -PROFILE_BOUND_EPS_M || t > 1 + PROFILE_BOUND_EPS_M) continue;
        const v = a.v + (b.v - a.v) * Math.max(0, Math.min(1, t));
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
    return { bottom: lo, top: hi };
}

/**
 * Tolerance for "this `u` is ON that vertical edge", metres.
 *
 * NOT `PROFILE_BOUND_EPS_M` (1e-9): that is a bounds-check epsilon for exact arithmetic,
 * and a station's arc length is the accumulation of dozens of `Math.hypot` chords, so it
 * reaches the wall's far end micrometres off `L`. At 1e-9 the end station missed the end
 * edge and the wall lost its last cap. A micrometre is far below anything a wall models.
 */
export const PROFILE_U_TOL_M = 1e-6;

/**
 * The distinct `u` values at which the ring has a VERTEX, sorted.
 *
 * A swept curved wall is only as sharp as its stations: a ring corner at `u = 2.5` sampled
 * by stations at 2.4 and 2.6 renders as a bevel, not a corner. The caller inserts a station
 * at each of these so the authored corners survive the sweep — the same exactness
 * `sliceStations` gives an opening jamb, for the same reason.
 */
export function wallProfileVertexUs(ring: ReadonlyArray<WallProfileVertex>): number[] {
    const out: number[] = [];
    for (const p of ring) {
        if (!Number.isFinite(p.u)) continue;
        if (!out.some(q => Math.abs(q - p.u) <= PROFILE_U_TOL_M)) out.push(p.u);
    }
    return out.sort((a, b) => a - b);
}

// ─── The ring as TWO CHAINS — §FEAT-WALL-PROFILE-OPENINGS (OPEN38, L-7400) ──────
//
// `wallProfileExtentAt` above answers *"how tall is the wall AT u?"*, and that is exactly
// the question a SWEEP asks. It is NOT the question an OPENING asks, and the difference
// cost this lane its first design, so it is written down.
//
// An opening occupies a SPAN [u0, u1], never a station. Asking `extentAt` at each end of
// the span and at each ring vertex in between is the obvious test, and it is WRONG at a
// STEP. Take a ring whose top drops from v = 3 to v = 2 across a VERTICAL edge at u = 2:
// `wallProfileExtentAt(ring, 2).top` is **3**, because that function takes the EXTREME of
// every crossing — right for a sweep, which needs the station's full span, and wrong here.
// A window head at v = 2.5 spanning u ∈ [1.5, 2.5] then passes the vertex test and pokes
// out of the wall over half its width. Worse, the number a refusal is required to name —
// *"0.5 m above the roofline"* — is not visible to a station query at all.
//
// ⭐ SO THE OPENING QUESTION IS ASKED OF THE CHAINS: the ring split into its LOWER
//   boundary and its UPPER boundary, each a polyline, each evaluated across the WHOLE span
//   segment by segment. A piecewise-linear function's extreme over an interval is attained
//   at a clipped endpoint or at a breakpoint, and a VERTICAL segment contributes BOTH of
//   its ends — which is precisely the step the station query loses.
//
// ⚠ THIS IS NOT A SECOND MODEL OF THE RING. `wallProfileChains` normalises winding with
//   the SAME `wallProfileSignedArea2` that `buildWallProfileBodyGeometry` normalises with,
//   and concatenating `bottom` then `top` reproduces that CCW ring vertex for vertex. The
//   gate and the solid therefore read one ring, not two that agree today (C84 EI-9).

/**
 * The ring's lower and upper boundaries, as polylines, plus the CCW ring they came from.
 *
 * `null` when the ring is not an ELEVATION ring — fewer than three vertices, a non-finite
 * coordinate, no enclosed area, no `u` extent, or a boundary that doubles back in `u`.
 * That last one is the honest reading of "this ring has two vertical spans somewhere":
 * a bottom chain that goes right, then left, then right is not the lower boundary of a
 * wall elevation, and no top/bottom pair describes it.
 */
export interface WallProfileChains {
    /** Lower boundary, non-decreasing in `u`, from the ring's minimum `u` to its maximum. */
    readonly bottom: ReadonlyArray<WallProfileVertex>;
    /** Upper boundary, non-increasing in `u`, from the maximum `u` back to the minimum. */
    readonly top: ReadonlyArray<WallProfileVertex>;
    /** The authored ring normalised to counter-clockwise winding in (u, v). */
    readonly ccw: ReadonlyArray<WallProfileVertex>;
    readonly uMin: number;
    readonly uMax: number;
}

export function wallProfileChains(
    ring: ReadonlyArray<WallProfileVertex>,
): WallProfileChains | null {
    if (!Array.isArray(ring) || ring.length < PROFILE_MIN_VERTICES) return null;
    for (const p of ring) {
        if (!p || !Number.isFinite(p.u) || !Number.isFinite(p.v)) return null;
    }
    const a2 = wallProfileSignedArea2(ring);
    if (!Number.isFinite(a2) || Math.abs(a2) / 2 <= PROFILE_MIN_AREA_M2) return null;

    // CCW in (u, v) means: traversing FORWARD, the lower boundary runs left→right and the
    // upper boundary runs right→left. Normalised rather than refused, exactly as
    // `buildWallProfileBodyGeometry` normalises it and for the stated reason — a
    // draughtsman does not think about winding.
    const ccw = a2 > 0 ? [...ring] : [...ring].reverse();

    let uMin = Infinity, uMax = -Infinity;
    for (const p of ccw) { if (p.u < uMin) uMin = p.u; if (p.u > uMax) uMax = p.u; }
    if (!(uMax - uMin > PROFILE_U_TOL_M)) return null;

    // The bottom chain runs from the ring's BOTTOM-LEFT vertex to its BOTTOM-RIGHT one.
    // Ties on `u` break to the LOWEST `v` at BOTH ends, which is what picks the FOOT of a
    // vertical end edge rather than its head — and the ring's two end edges are vertical on
    // every wall elevation, so the tie is the normal case, not the corner case.
    let iBL = 0, iBR = 0;
    for (let i = 1; i < ccw.length; i++) {
        const p = ccw[i]!, bl = ccw[iBL]!, br = ccw[iBR]!;
        if (p.u < bl.u - PROFILE_U_TOL_M
            || (Math.abs(p.u - bl.u) <= PROFILE_U_TOL_M && p.v < bl.v)) iBL = i;
        if (p.u > br.u + PROFILE_U_TOL_M
            || (Math.abs(p.u - br.u) <= PROFILE_U_TOL_M && p.v < br.v)) iBR = i;
    }
    if (iBL === iBR) return null;

    const walk = (from: number, to: number): WallProfileVertex[] | null => {
        const out: WallProfileVertex[] = [];
        for (let k = 0, i = from; ; k++, i = (i + 1) % ccw.length) {
            out.push(ccw[i]!);
            if (i === to) return out;
            if (k > ccw.length) return null;   // defensive — unreachable on a simple ring
        }
    };
    const bottom = walk(iBL, iBR);
    const top = walk(iBR, iBL);
    if (!bottom || !top) return null;

    // MONOTONICITY IS THE SINGLE-INTERVAL TEST, expressed on the boundary rather than by
    // counting crossings. `firstMultiIntervalU` samples one `u` per gap and says so ("a
    // SUFFICIENT test, not a COMPLETE one"); this is complete for the property an opening
    // actually needs, because a boundary that doubles back in `u` is precisely a ring with
    // more than one span there.
    for (let i = 1; i < bottom.length; i++) {
        if (bottom[i]!.u < bottom[i - 1]!.u - PROFILE_U_TOL_M) return null;
    }
    for (let i = 1; i < top.length; i++) {
        if (top[i]!.u > top[i - 1]!.u + PROFILE_U_TOL_M) return null;
    }
    return { bottom, top, ccw, uMin, uMax };
}

/**
 * The extreme value of a chain polyline over `[u0, u1]`, or `null` when no segment of the
 * chain overlaps the span at all.
 *
 * ⚠ A VERTICAL segment contributes BOTH of its endpoints. That is the whole reason this
 *   exists alongside `wallProfileExtentAt` — see the block above.
 */
function chainExtremeOverSpan(
    chain: ReadonlyArray<WallProfileVertex>,
    u0: number,
    u1: number,
    mode: 'min' | 'max',
): number | null {
    let best = mode === 'min' ? Infinity : -Infinity;
    const take = (v: number): void => {
        best = mode === 'min' ? Math.min(best, v) : Math.max(best, v);
    };
    for (let i = 0; i + 1 < chain.length; i++) {
        const a = chain[i]!, b = chain[i + 1]!;
        const lo = Math.min(a.u, b.u), hi = Math.max(a.u, b.u);
        if (hi < u0 - PROFILE_U_TOL_M || lo > u1 + PROFILE_U_TOL_M) continue;
        const du = b.u - a.u;
        if (Math.abs(du) <= PROFILE_U_TOL_M) { take(a.v); take(b.v); continue; }
        const c0 = Math.max(lo, u0), c1 = Math.min(hi, u1);
        take(a.v + (b.v - a.v) * ((c0 - a.u) / du));
        take(a.v + (b.v - a.v) * ((c1 - a.u) / du));
    }
    return Number.isFinite(best) ? best : null;
}

/**
 * Clearance an opening must keep from the ring's own boundary, metres.
 *
 * ⭐ DELIBERATELY THE SAME MAGNITUDE AS `WallHoleBodyBuilder.OPENING_EPS_M` (1e-4, C73
 *   §2.3), and NOT `PROFILE_BOUND_EPS_M` (1e-9). The builder already refuses an opening
 *   whose head reaches within 0.1 mm of the wall top (`normaliseWallHoles`: *"a full-height
 *   opening is a wall split, not a hole"*), because a hole TANGENT to the outer boundary is
 *   not a hole — the extruder produces a pinched, self-touching contour. A gate that
 *   admitted at 1e-9 what the builder rejects at 1e-4 would hand the builder a case it
 *   declines, and the wall would silently fall back to a body with no profile in it.
 */
export const PROFILE_FIT_TOL_M = 1e-4;

/** An opening's rectangle in the wall's own (u, v) elevation frame. */
export interface ProfileOpeningRect {
    /** Left edge — distance along the baseline from `baseLine[0]`. */
    readonly u0: number;
    /** Right edge. */
    readonly u1: number;
    /** Sill, above the wall's base plane. */
    readonly v0: number;
    /** Head, above the wall's base plane. */
    readonly v1: number;
    /**
     * TRUE for a FLOOR-REACHING opening — a door. The body builder carves such an opening
     * out of the wall's BOTTOM EDGE as a notch rather than as a closed hole
     * (`WallHoleBodyBuilder`: *"floor-reaching openings are carved out of the bottom edge of
     * the outer profile so the body remains ONE continuous surface"*), and that walk is only
     * valid where the ring's own lower boundary is FLAT across the span and sits at the
     * door's foot. Judged by the `uneven-foot` arm below.
     */
    readonly floorReaching?: boolean;
}

export type ProfileRectFitCode =
    /** The ring is not an elevation ring at all — see `wallProfileChains`. */
    | 'ring-not-elevation'
    /** The opening runs past the `u` extent the ring actually occupies. */
    | 'span-outside-ring'
    /** The head is above the ring's UPPER boundary somewhere across the span. */
    | 'above-top'
    /** The sill is below the ring's LOWER boundary somewhere across the span. */
    | 'below-bottom'
    /** A door whose foot the ring's lower boundary does not meet flat across the span. */
    | 'uneven-foot';

export interface ProfileRectFit {
    readonly ok: boolean;
    readonly code?: ProfileRectFitCode;
    /** Names the edge AND the metres. Suitable for a store error or a tooltip. */
    readonly reason?: string;
    /** How far, in METRES, the rectangle lies outside the material. Absent when `ok`. */
    readonly overshootM?: number;
}

const FIT_OK: ProfileRectFit = { ok: true };

/**
 * Does `rect` lie entirely inside the material the ring encloses?
 *
 * ⭐ THE ANSWER NAMES THE NUMBER. A refusal here reaches the author as *"the wall's top
 *   edge falls to 1.732 m across this opening, and its head is at 2.100 m — 0.368 m of the
 *   opening would be outside the wall"*, because a refusal that says only "does not fit"
 *   leaves them to guess which of six numbers to change. That is the founder's standing
 *   direction on refusals and it is why `overshootM` is on the result as well as in the
 *   sentence: the caller can offer a nudge without re-deriving it.
 *
 * ⚠ THIS IS THE ONE PREDICATE. `WallOccupancyStore.canPlace` asks it before an opening is
 *   placed, `profileAuthorability` asks it before a profile is written over openings that
 *   already exist, and `buildWallProfileBodyGeometry` is only ever handed openings that
 *   passed it. Three questions — *may this opening go here*, *may this ring be applied*,
 *   *can this solid be built* — are the SAME question from three sides, and answering them
 *   in three places is how the gate and the geometry drift (C84 EI-9, and the drift
 *   `PropertyDescriptorGenerator.ts:19-20` records the cost of).
 */
export function wallProfileRectFit(
    ring: ReadonlyArray<WallProfileVertex>,
    rect: ProfileOpeningRect,
): ProfileRectFit {
    const chains = wallProfileChains(ring);
    if (!chains) {
        return {
            ok: false,
            code: 'ring-not-elevation',
            reason:
                'This wall outline is not a simple elevation outline — its upper or lower edge ' +
                'doubles back on itself, so there is no single "top" and "bottom" for an opening ' +
                'to sit between. Author the outline as one span per position along the wall, and ' +
                'cut voids as door or window openings rather than as notches in the outline.',
        };
    }
    const { bottom, top, uMin, uMax } = chains;

    const u0 = Math.min(rect.u0, rect.u1);
    const u1 = Math.max(rect.u0, rect.u1);
    const v0 = Math.min(rect.v0, rect.v1);
    const v1 = Math.max(rect.v0, rect.v1);
    if (![u0, u1, v0, v1].every((n) => Number.isFinite(n))) {
        return {
            ok: false,
            code: 'span-outside-ring',
            reason: 'The opening has no finite position or size, so it cannot be checked against the wall outline.',
        };
    }

    if (u0 < uMin - PROFILE_FIT_TOL_M || u1 > uMax + PROFILE_FIT_TOL_M) {
        const over = Math.max(uMin - u0, u1 - uMax);
        return {
            ok: false,
            code: 'span-outside-ring',
            overshootM: over,
            reason:
                `The opening spans ${u0.toFixed(3)}–${u1.toFixed(3)} m along the wall, but the ` +
                `wall's edited outline only occupies ${uMin.toFixed(3)}–${uMax.toFixed(3)} m — ` +
                `${over.toFixed(3)} m of the opening would sit where the outline has removed the ` +
                'wall entirely. Move the opening inside the outline, or extend the outline over it.',
        };
    }

    const minTop = chainExtremeOverSpan(top, u0, u1, 'min');
    const maxBot = chainExtremeOverSpan(bottom, u0, u1, 'max');
    const minBot = chainExtremeOverSpan(bottom, u0, u1, 'min');
    if (minTop === null || maxBot === null || minBot === null) {
        return {
            ok: false,
            code: 'ring-not-elevation',
            reason:
                'The wall outline does not cover the whole width of this opening, so the opening ' +
                'cannot be checked against it.',
        };
    }

    if (v1 > minTop - PROFILE_FIT_TOL_M) {
        const over = v1 - minTop;
        return {
            ok: false,
            code: 'above-top',
            overshootM: over,
            reason:
                `The wall's edited outline falls to ${minTop.toFixed(3)} m somewhere across this ` +
                `opening (${u0.toFixed(3)}–${u1.toFixed(3)} m along the wall), and the opening's ` +
                `head is at ${v1.toFixed(3)} m — ` +
                (over > 0
                    ? `${over.toFixed(3)} m of the opening would be outside the wall. `
                    : 'the two meet exactly, which leaves no wall above the opening to hold it. ') +
                'Lower the opening, make it shorter, or raise the outline above it.',
        };
    }

    if (rect.floorReaching) {
        // A DOOR is cut out of the BOTTOM EDGE, so the bottom edge has to be there to cut:
        // flat across the whole span, and at the door's own foot.
        const uneven = maxBot - minBot;
        const offFoot = Math.abs(v0 - minBot);
        if (uneven > PROFILE_FIT_TOL_M || offFoot > PROFILE_FIT_TOL_M) {
            const over = Math.max(uneven, offFoot);
            return {
                ok: false,
                code: 'uneven-foot',
                overshootM: over,
                reason:
                    `This is a floor-reaching opening, and the wall's edited outline is not level ` +
                    `along its foot: across ${u0.toFixed(3)}–${u1.toFixed(3)} m the bottom of the ` +
                    `outline runs between ${minBot.toFixed(3)} m and ${maxBot.toFixed(3)} m while ` +
                    `the opening's foot is at ${v0.toFixed(3)} m (a difference of ` +
                    `${over.toFixed(3)} m). A door is carved out of the wall's bottom edge, so that ` +
                    'edge must be flat and at the door\'s own level across the whole opening. Move ' +
                    'the opening onto a level stretch, or level the outline beneath it.',
            };
        }
        return FIT_OK;
    }

    if (v0 < maxBot + PROFILE_FIT_TOL_M) {
        const over = maxBot - v0;
        return {
            ok: false,
            code: 'below-bottom',
            overshootM: over,
            reason:
                `The wall's edited outline rises to ${maxBot.toFixed(3)} m somewhere across this ` +
                `opening (${u0.toFixed(3)}–${u1.toFixed(3)} m along the wall), and the opening's ` +
                `sill is at ${v0.toFixed(3)} m — ` +
                (over > 0
                    ? `${over.toFixed(3)} m of the opening would be outside the wall. `
                    : 'the two meet exactly, which leaves no wall below the opening to hold it. ') +
                'Raise the opening, or lower the outline beneath it.',
        };
    }

    return FIT_OK;
}

/**
 * Read an opening record — an `Opening`, an `OpeningDims`, or anything shaped like one —
 * as a `(u, v)` rectangle, or `null` when it does not carry enough to be judged.
 *
 * ⚠ `null` IS "UNJUDGEABLE", NOT "FINE". The callers must treat it as a refusal on a
 *   profiled host, and one of them very nearly did the opposite: `WallProfileVariants`
 *   elicits the gate's sentence with a bare `openings: [{}]` probe, and `canPlace` passes
 *   `[{}]` to `rakeAuthorability` for the same purpose. A reader that returned "the empty
 *   rectangle" for those would have made every probe pass and every real check meaningless
 *   — the §CONTEXT-DATA-HONESTY failure where absent and clear are the same value.
 */
export function profileOpeningRectOf(opening: unknown): ProfileOpeningRect | null {
    if (opening === null || typeof opening !== 'object') return null;
    const o = opening as {
        offset?: unknown; width?: unknown; height?: unknown; sillHeight?: unknown; type?: unknown;
    };
    const num = (x: unknown): number | null =>
        typeof x === 'number' && Number.isFinite(x) ? x : null;
    const offset = num(o.offset);
    const width = num(o.width);
    const height = num(o.height);
    // A missing `sillHeight` is NOT read as 0. `Opening.sillHeight` is REQUIRED in
    // `WallTypes.ts` ("geometry generation depends on it"), so an absent one means the
    // caller handed us something that is not an opening — and defaulting it to 0 would
    // silently turn an unjudgeable record into a door sitting on the floor.
    const sill = num(o.sillHeight);
    if (offset === null || width === null || height === null || sill === null) return null;
    if (!(width > 0) || !(height > 0)) return null;
    return {
        u0: offset,
        u1: offset + width,
        v0: sill,
        v1: sill + height,
        // The SAME classification `normaliseWallHoles` makes ("sill at (or below) the floor
        // → floor notch (door); else interior hole"), by the SAME epsilon, so the gate and
        // the builder cannot disagree about which openings are notches.
        floorReaching: sill <= PROFILE_FIT_TOL_M,
    };
}

// ─── Authorability ────────────────────────────────────────────────────────────

/** The subset of a wall this module needs in order to judge a profile. */
export interface ProfileSubject {
    readonly wallProfile?: unknown;
    readonly baseLine?: readonly [ProfilePt2, ProfilePt2];
    readonly height?: number;
    readonly curve?: unknown;
    readonly layers?: ReadonlyArray<unknown>;
    readonly openings?: ReadonlyArray<unknown>;
}

export type ProfileRefusalCode =
    | 'malformed'
    | 'degenerate'
    | 'out-of-bounds'
    /**
     * ⚠ RETIRED, NOT REMOVED (§FEAT-WALL-PROFILE-CURVED, WJ1, L-1072). No arm returns
     * this any more — a profile on a curved wall is BUILT. The member survives so a
     * persisted refusal record or a downstream `switch` written against it still compiles
     * and can be recognised as historical rather than silently falling through a default.
     */
    | 'curved'
    /**
     * The one thing a SWEPT solid genuinely cannot express: a ring that is empty in its
     * middle at some `u`. Named separately from `curved` precisely so nobody can read the
     * lifting of `curved` as "curves take any profile now".
     */
    | 'curved-multi-interval'
    | 'layered'
    | 'hosted-openings';

/**
 * The first `u` at which the ring encloses TWO OR MORE separate vertical spans, or null.
 *
 * Detected by counting the ring's crossings of the vertical line at `u`: a simple polygon
 * crossed by a line encloses `crossings / 2` intervals, so four or more crossings at one
 * `u` means at least two intervals. Sampled at the MIDPOINT of every gap between
 * consecutive vertex `u` values — not at the vertices themselves, where a crossing count
 * is ambiguous by definition (the line passes exactly through a corner).
 *
 * ⚠ THIS IS A SUFFICIENT TEST, NOT A COMPLETE ONE, and saying so matters more than the
 *   test does: it samples one `u` per gap, which catches every multi-interval region an
 *   authored ring can have (a region is bounded by vertices, so it contains a whole gap),
 *   but a ring built by a future generator with sub-gap structure could slip through. It
 *   errs toward ADMITTING, and what an admitted bad ring produces is a solid where a void
 *   was drawn — visible and reversible, not corrupt.
 */
function firstMultiIntervalU(ring: ReadonlyArray<WallProfileVertex>): number | null {
    const us = wallProfileVertexUs(ring);
    for (let g = 0; g + 1 < us.length; g++) {
        const u = (us[g]! + us[g + 1]!) / 2;
        let crossings = 0;
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i]!;
            const b = ring[(i + 1) % ring.length]!;
            if ((a.u <= u && b.u > u) || (b.u <= u && a.u > u)) crossings++;
        }
        if (crossings >= 4) return u;
    }
    return null;
}

export interface ProfileAuthorability {
    readonly ok: boolean;
    /** Machine-readable reason. `undefined` when `ok`. */
    readonly code?: ProfileRefusalCode;
    /** Human-readable reason, suitable for a store error or a disabled-control tooltip. */
    readonly reason?: string;
}

const PROFILE_OK: ProfileAuthorability = { ok: true };

/**
 * Decide whether `subject` may hold its profile, given everything else about it.
 *
 * A wall with NO profile is always authorable — this function never rejects the
 * implicit rectangle — so it can be called UNCONDITIONALLY on every write, which is
 * what lets `WallDataSchema` (create), `WallStore.update` (edit) and
 * `WallStore.addOpening` (host an opening) all consult it without any of them needing
 * to know whether a profile is present.
 *
 * That last caller is the one worth naming: `addOpening` is a write boundary that does
 * NOT pass through `update()` (`WallStore.ts:1125-1127` says so in those words), so a
 * gate wired only into `update` would let an author reach `profile + opening` by doing
 * the two operations in the other order. `rakeAuthorability` learned this the same way.
 */
export function profileAuthorability(subject: ProfileSubject): ProfileAuthorability {
    const raw = subject.wallProfile;
    if (raw === null || raw === undefined) return PROFILE_OK;

    const profile = resolveWallProfile(raw);
    if (!profile) {
        return {
            ok: false,
            code: 'malformed',
            reason:
                'wall.wallProfile must be { ring: [{u, v}, ...] } with at least ' +
                `${PROFILE_MIN_VERTICES} vertices whose u and v are finite numbers. ` +
                'Omit the field entirely for a normal rectangular wall.',
        };
    }

    const ring = profile.ring;

    // (1) DEGENERATE — a ring that encloses no area draws nothing, and "draws nothing"
    //     must never be reachable from a valid model (C84 EI-2: refuse, do not narrow).
    const area = Math.abs(wallProfileSignedArea2(ring)) / 2;
    if (!(area > PROFILE_MIN_AREA_M2)) {
        return {
            ok: false,
            code: 'degenerate',
            reason:
                `wall.wallProfile encloses no area (${area.toExponential(2)} m^2, minimum ` +
                `${PROFILE_MIN_AREA_M2} m^2) — its vertices are collinear or coincident, so the ` +
                'wall would render as nothing at all.',
        };
    }

    // (2) OUT OF BOUNDS — the profile SUBTRACTS from [0, L] x [0, height]; it never
    //     grows it. See the header: this is what keeps `wall.height` meaning the same
    //     thing to every consumer that already reads it.
    // ⭐ §FEAT-WALL-PROFILE-CURVED (WJ1, L-1072) — THE CHORD IS NOT THE ARC. Until the
    //   curved arm was built this line could only ever see a straight wall, so `u`'s upper
    //   bound and the wall's chord were the same number. They are NOT the same number on an
    //   arc: the chord is strictly shorter than the run, so a ring authored across the full
    //   curved wall would have been refused as out-of-bounds at the far end — a refusal
    //   with a correct-sounding message and a wrong `L` in it, which is the hardest kind to
    //   see. `wallCentrelineLength` returns the arc for a curved wall and the chord for a
    //   straight one, and it measures the SAME polyline the solid is built from.
    const L = subject.curve != null
        ? wallCentrelineLength({ baseLine: subject.baseLine, curve: subject.curve } as never)
        : wallProfilePlanarLength(subject.baseLine);
    const H = subject.height;
    if (Number.isFinite(L) && typeof H === 'number' && Number.isFinite(H)) {
        for (let i = 0; i < ring.length; i++) {
            const p = ring[i]!;
            const uBad = p.u < -PROFILE_BOUND_EPS_M || p.u > L + PROFILE_BOUND_EPS_M;
            const vBad = p.v < -PROFILE_BOUND_EPS_M || p.v > H + PROFILE_BOUND_EPS_M;
            if (uBad || vBad) {
                return {
                    ok: false,
                    code: 'out-of-bounds',
                    reason:
                        `wall.wallProfile vertex ${i} (u=${p.u}, v=${p.v}) lies outside the wall's ` +
                        `own extent [0, ${L.toFixed(4)}] x [0, ${H}]. A profile may only CUT the ` +
                        'wall down; to make it taller or longer, change height or the baseline first.',
                };
            }
        }
    }

    // (3) THE UNBUILT COMBINATIONS. Order affects only which reason the author is shown
    //     first; each is independently sufficient.
    //
    // ✅ THE `curved` ARM IS LIFTED (§FEAT-WALL-PROFILE-CURVED, WJ1, L-1072), AND ITS TEXT
    //    IS KEPT SO THE RETRACTION IS LEGIBLE (C84 §6) — the same courtesy `WallRake.ts`
    //    extends to the curved-rake refusal it lifted the same way. It read:
    //
    //      "wall.wallProfile is not supported on a CURVED wall: the profile is authored in
    //       the wall's own plane, and a curved wall's face is a developable surface — a
    //       straight profile edge is not straight in space, so every edge would have to be
    //       tessellated per station and the curved builder has no per-station top.
    //       Straighten the wall, or leave the profile unset."
    //
    //    EVERY CLAUSE OF THAT IS TRUE AND THE CONCLUSION WAS THE WRONG ONE — for the third
    //    time in this family, and in the same shape each time. "A straight edge in (u,v) is
    //    not straight in space" is a reason to TESSELLATE, and `insertStationsAt` does.
    //    "The curved builder has no per-station top" was a fact about eight lines of
    //    `CurvedWallLayerBuilder`, and `CurvedProfileHeights` is those eight lines. Neither
    //    clause asserts a contradiction; both describe absent code.
    //
    //    ⭐ THE HEADER OF THIS FILE ALREADY SAID SO, and that is the part worth carrying
    //      forward: it read *"A profile on a curve is NOT ill-posed … It is refused because
    //      it is UNBUILT … This one CAN lift."* The module knew. What made the refusal
    //      persist was the user-facing STRING, which reads like a law — and downstream
    //      readers quote strings, not headers. **A refusal must say which kind it is IN THE
    //      TEXT THE AUTHOR SEES**, or it will be read as impossible whatever the header says.
    //
    // ⛔ WHAT IS STILL REFUSED ON A CURVE, and it is a genuine limitation of the SWEEP:
    //    see `curved-multi-interval` below. A swept solid carries ONE vertical interval per
    //    station, so a ring that is empty in its middle at some `u` (a porthole, an
    //    hourglass) cannot be expressed and would render SOLID where the author drew a
    //    void. That is refused rather than approximated.
    if (subject.curve !== undefined && subject.curve !== null) {
        const bad = firstMultiIntervalU(ring);
        if (bad !== null) {
            return {
                ok: false,
                code: 'curved-multi-interval',
                reason:
                    `wall.wallProfile cannot be applied to a CURVED wall at u=${bad.toFixed(4)}: the ` +
                    'ring encloses TWO separate vertical spans there (a void with material above and ' +
                    'below it). A curved wall is built as a swept solid, which carries one top and ' +
                    'one bottom per station, so the void would render as solid material. Straighten ' +
                    'the wall, or author the void as a window opening instead.',
            };
        }
    }
    if (subject.layers !== undefined && subject.layers !== null && subject.layers.length > 1) {
        return {
            ok: false,
            code: 'layered',
            reason:
                'wall.wallProfile is not supported on a LAYERED wall: each layer band is built by ' +
                'slicing the plan footprint and extruding it between two HORIZONTAL planes, so the ' +
                'bands have no per-station top and the wall would render as a full rectangle while ' +
                'the model said otherwise. Use a single-layer wall type, or leave the profile unset.',
        };
    }
    if (subject.openings !== undefined && subject.openings !== null && subject.openings.length > 0) {
        return {
            ok: false,
            code: 'hosted-openings',
            reason:
                'wall.wallProfile is not supported on a wall that HOSTS DOORS OR WINDOWS: the ' +
                'opening-bearing body is built as a rectangle minus voids and assumes that outer ' +
                'rectangle, and the occupancy check that guards openings is purely horizontal — so ' +
                'nothing would notice an opening left floating in material the profile removed. ' +
                'Remove the openings first, or leave the profile unset.',
        };
    }

    return PROFILE_OK;
}
