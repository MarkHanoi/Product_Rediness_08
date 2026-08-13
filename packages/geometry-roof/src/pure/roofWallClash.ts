/**
 * §GE-06-ROOF-WALL-SLICE — roof-vs-walls-beneath clash detection.
 *
 * The MINIMAL REAL slice of GE-06 that gap-register PR-10 needs: given ONE
 * roof and the wall records of the level beneath it, classify each wall as
 * clean, PENETRATING the roof underside, or leaving a GAP to it — as typed,
 * deterministic findings a consequence subscriber can announce. It is NOT a
 * general element-pair clash engine (that remains GE-06's missing algorithm);
 * it is the roof→walls-beneath pair only, as a pure function.
 *
 * PURE: no THREE, no DOM, no I/O, no Date, no Math.random (same rules as
 * `pitchedFromOffsets.ts`). Deterministic — identical inputs ⇒ deep-equal
 * findings, in the walls[] input order.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE UNDERSIDE MODEL — pinned from §ROOF-SIT-ON-WALL-HEAD (2026-06-17,
 * commits aa8bbb0a + 3db21345), verified against RoofGeometryBuilder today
 * ─────────────────────────────────────────────────────────────────────────────
 * Every builder in `RoofGeometryBuilder` emits the soffit at LOCAL y = −thickness
 * and the top/eave surface at y = 0 (`_buildExtrudedPolygon`,
 * `_buildVariableHeightRoof`, `_buildMultiLevel`, `_buildFromRingStack` — all
 * push `positions.push(x, -thickness, z)` for the bottom ring). The roof's
 * world origin is `originY = levelElevation + baseOffset`. Hence:
 *
 *   FLAT     underside(p) = originY − thicknessM              (constant)
 *     — the slab extrudes DOWNWARD. This is exactly the 2026-06-17 defect
 *     surface: with baseOffset 0 the slab occupied [wallHead − t, wallHead]
 *     and bit `t` metres INTO the wall tops. The shipped fix sets
 *     baseOffset = thickness for flat roofs ONLY, so the underside lands ON
 *     the wall head. This detector re-derives that clash from geometry.
 *
 *   PITCHED  underside(p) = originY + slope × d(p)
 *     — the uniform-pitch height field of `pitchedFromOffsets`
 *     (height = slope × distance-to-boundary), rising from the eave at y = 0.
 *     Per the same fix note, pitched roofs keep baseOffset 0 so the wall head
 *     meets the eave surface. `d(p)` is the distance from the plan point to
 *     the EAVE polygon boundary. Plumb thickness is NOT subtracted for the
 *     pitched form: the surface the wall head is meant to meet is the eave
 *     plane at y = 0, and the ring-stack soffit exists only at the eave ring.
 *     This is a first-order model of the sloped underside — honest for the
 *     uniform-pitch roofs `pitchedFromOffsets` builds; ridge-line exactness
 *     arrives with the Stage-2 straight skeleton, not here.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CLASSIFICATION — per wall, sampled along the baseline
 * ─────────────────────────────────────────────────────────────────────────────
 * The wall top (baseElevationY + heightM) is compared against the underside at
 * SAMPLES_PER_WALL uniform stations along the baseline, keeping only stations
 * strictly inside the eave polygon ("beneath the roof"). Then:
 *
 *   · any sample with top − underside > ε  ⇒ 'penetrates',
 *       magnitudeM = the DEEPEST overshoot (max over samples). A wall that
 *       pierces a sloped plane anywhere is a penetration even where other
 *       stations sit below the plane.
 *   · else, if every sample has underside − top > ε ⇒ 'gap',
 *       magnitudeM = the CLOSEST approach (min over samples) — the smallest
 *       distance the wall would have to grow to touch the roof.
 *   · else ⇒ clean (the wall meets the underside within ε somewhere).
 *
 * ε defaults to the kernel's `COINCIDENT_M` (C73 §2.1 model-space identity,
 * 1 mm) — a wall top 1 mm from the soffit is "the same place", not a clash.
 *
 * Walls with NO sample inside the eave polygon are not beneath this roof and
 * yield no finding. NOTE the polygon input is the EAVE polygon — the same ring
 * the builder receives (overhang already applied). Callers wanting membership
 * against the pre-overhang footprint pass that ring instead, accepting that
 * pitched heights are then measured from the footprint edge, not the eave.
 *
 * @file packages/geometry-roof/src/pure/roofWallClash.ts
 */

import { COINCIDENT_M, pointInPolygonXZ } from '@pryzm/geometry-kernel';
import { dedupeRing, type Pt2 } from './polygonOffset.js';

export type RoofWallClashKind = 'penetrates' | 'gap';

/** The wall facts this detector consumes — plan baseline + vertical extent. */
export interface RoofClashWall {
    readonly id: string;
    /** Baseline start, plan XZ metres. */
    readonly start: Pt2;
    /** Baseline end, plan XZ metres. */
    readonly end: Pt2;
    /** World Y of the wall base (its level's elevation), metres. */
    readonly baseElevationY: number;
    /** Wall height above its base, metres. */
    readonly heightM: number;
}

/** The roof facts this detector consumes — see the underside model above. */
export interface RoofClashRoof {
    readonly id: string;
    /** EAVE polygon in plan XZ (overhang applied) — the builder's input ring. */
    readonly eavePolygon: ReadonlyArray<Pt2>;
    /**
     * 'flat' → constant underside originY − thicknessM.
     * 'pitched' → uniform-pitch surface originY + slope × d(p) (all sloped
     * RoofTypes approximate to this field at first order).
     */
    readonly form: 'flat' | 'pitched';
    /** World Y of the roof origin = levelElevation + baseOffset, metres. */
    readonly originY: number;
    /** Roof slab thickness, metres (consumed by the flat form). */
    readonly thicknessM: number;
    /** Rise/run ratio — required for 'pitched', ignored for 'flat'. */
    readonly slope?: number;
}

export interface RoofWallClashFinding {
    readonly wallId: string;
    readonly roofId: string;
    readonly kind: RoofWallClashKind;
    /** Deepest penetration, or closest gap, in metres. Always > ε. */
    readonly magnitudeM: number;
}

/** Uniform stations sampled along each wall baseline (endpoints inclusive). */
export const SAMPLES_PER_WALL = 9;

/** Min distance from plan point `p` to the ring's boundary edges, metres. */
function distanceToRingBoundary(p: Pt2, ring: ReadonlyArray<Pt2>): number {
    const [px, pz] = p;
    let best = Infinity;
    const n = ring.length;
    for (let i = 0; i < n; i++) {
        const [ax, az] = ring[i]!;
        const [bx, bz] = ring[(i + 1) % n]!;
        const dx = bx - ax;
        const dz = bz - az;
        const len2 = dx * dx + dz * dz;
        // Degenerate edge → distance to its point. (dedupeRing removes these,
        // but stay total: a guard here beats a NaN downstream.)
        const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0;
        const qx = ax + t * dx;
        const qz = az + t * dz;
        const ex = px - qx;
        const ez = pz - qz;
        const d2 = ex * ex + ez * ez;
        if (d2 < best) best = d2;
    }
    return Math.sqrt(best);
}

/**
 * World Y of the roof underside at plan point `p` — the surface a wall top
 * beneath this roof is meant to meet. See the module header for the model and
 * its provenance.
 */
export function roofUndersideYAt(roof: RoofClashRoof, p: Pt2): number {
    if (roof.form === 'flat') {
        return roof.originY - roof.thicknessM;
    }
    const slope = roof.slope ?? 0;
    return roof.originY + slope * distanceToRingBoundary(p, dedupeRing(roof.eavePolygon));
}

/**
 * Detect roof-vs-walls-beneath clashes. Pure, deterministic; findings come
 * back in `walls` input order, at most one finding per wall.
 *
 * @param roof     the roof record (see RoofClashRoof).
 * @param walls    the candidate walls of the level beneath.
 * @param epsilonM tolerance below which top-vs-underside is "the same place".
 *                 Defaults to the kernel's COINCIDENT_M (C73 §2.1, 1 mm).
 */
export function detectRoofWallClashes(
    roof: RoofClashRoof,
    walls: ReadonlyArray<RoofClashWall>,
    epsilonM: number = COINCIDENT_M,
): RoofWallClashFinding[] {
    const ring = dedupeRing(roof.eavePolygon);
    if (ring.length < 3) return [];
    const ringXZ = ring.map(([x, z]) => ({ x, z }));

    const findings: RoofWallClashFinding[] = [];

    for (const wall of walls) {
        const [sx, sz] = wall.start;
        const [ex, ez] = wall.end;
        const dx = ex - sx;
        const dz = ez - sz;
        const degenerate = dx * dx + dz * dz < COINCIDENT_M * COINCIDENT_M;

        // Stations along the baseline; a zero-length wall gets its midpoint.
        const stations: Pt2[] = degenerate
            ? [[(sx + ex) / 2, (sz + ez) / 2]]
            : Array.from({ length: SAMPLES_PER_WALL }, (_, i): Pt2 => {
                const t = i / (SAMPLES_PER_WALL - 1);
                return [sx + t * dx, sz + t * dz];
            });

        const topY = wall.baseElevationY + wall.heightM;
        let deepestPenetration = -Infinity;
        let closestGap = Infinity;
        let sampled = 0;

        for (const p of stations) {
            if (!pointInPolygonXZ(p[0], p[1], ringXZ)) continue;
            sampled++;
            const delta = topY - roofUndersideYAt(roof, p); // >0 above underside
            if (delta > deepestPenetration) deepestPenetration = delta;
            if (-delta < closestGap) closestGap = -delta;
        }

        if (sampled === 0) continue; // not beneath this roof

        if (deepestPenetration > epsilonM) {
            findings.push({
                wallId: wall.id,
                roofId: roof.id,
                kind: 'penetrates',
                magnitudeM: deepestPenetration,
            });
        } else if (closestGap > epsilonM) {
            findings.push({
                wallId: wall.id,
                roofId: roof.id,
                kind: 'gap',
                magnitudeM: closestGap,
            });
        }
        // else: the wall meets the underside within ε somewhere — clean.
    }

    return findings;
}
