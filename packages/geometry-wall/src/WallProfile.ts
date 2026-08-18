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
// beside the four that are already there. That is also the shape of the fix the
// instanced arm needs for RAKE, which it does not have: measured 2026-08-18, a plain
// raked wall instances with a matrix BYTE-IDENTICAL to the vertical wall's and renders
// vertical while the model says otherwise (pinned §(A2b) of
// `WallProfileNonRegressionBaseline.test.ts`). That defect is NOT fixed here — it is
// reported and owned elsewhere — but this module must not walk into it.
//
// ─── SLICE 1 SCOPE, STATED PLAINLY ────────────────────────────────────────────
//
// This slice adds the MODEL, the GATE, PERSISTENCE and CACHE INVALIDATION. It adds
// NO geometry and NO authoring path: nothing in the repo writes `wallProfile`, so the
// field is unauthorable by construction. The gate is therefore in place BEFORE the
// authoring path exists, which is the only ordering in which a refusal can never be
// reached too late. A profile that could be stored but not drawn would be exactly the
// silently-wrong wall `WallRake.ts:102` forbids.

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
    | 'curved'
    | 'layered'
    | 'hosted-openings';

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
    const L = wallProfilePlanarLength(subject.baseLine);
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
    if (subject.curve !== undefined && subject.curve !== null) {
        return {
            ok: false,
            code: 'curved',
            reason:
                'wall.wallProfile is not supported on a CURVED wall: the profile is authored in ' +
                "the wall's own plane, and a curved wall's face is a developable surface — a " +
                'straight profile edge is not straight in space, so every edge would have to be ' +
                'tessellated per station and the curved builder has no per-station top. ' +
                'Straighten the wall, or leave the profile unset.',
        };
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
