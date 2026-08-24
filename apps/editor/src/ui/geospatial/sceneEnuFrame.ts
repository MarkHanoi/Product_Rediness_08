// §L-430 slice 2b — the SCENE ⇄ ENU frame boundary, headless and testable.
//
// WHY THIS MODULE EXISTS
// ----------------------
// `CesiumViewport.ts` is ~8 000 lines bound to Cesium + the DOM, so the frame mapping that
// lives inside it cannot be unit-tested. That mapping — scene-XZ metres → ENU (east, north)
// — is ALSO the exact place ADR-0115 §Remaining #2 ("globe applies θ to the placed model")
// has to be implemented. Leaving it open-coded in ~15 sites inside an untestable file is how
// a double-rotation defect gets shipped: one site migrated, one missed, and the building
// lands on the globe at the wrong bearing with nothing failing.
//
// So the mapping is extracted here as pure functions, tested directly, and the viewport
// becomes a caller. No THREE, no Cesium, no DOM.
//
// THE TWO FRAMES
// --------------
//   SCENE-XZ  — what the user authors in. Once L-430 lands, this is the PROJECT-NORTH frame:
//               the parcel's dominant edge is axis-aligned so walls are orthogonal.
//   ENU       — East/North/Up metres about the site origin, TRUE north, what the globe and
//               every geospatial consumer expect.
//
// The base mapping (unchanged, project-wide) is `east = x`, `north = −z`. On top of that,
// θ (project→true, clockwise; `SiteLocation.trueNorth`) rotates the authored frame back onto
// the earth. Rotation is about the SITE ORIGIN, which is also the scene origin, so the
// free-vector form is exact — no separate base term is needed.
//
// θ = 0 ⇒ pure identity ⇒ byte-identical to the pre-L-430 behaviour (ADR-0070 byte-identity).
// Every un-rotated site therefore keeps its existing globe placement to the last bit.

// ─────────────────────────────────────────────────────────────────────────────────────────
// MIGRATION INVENTORY — READ BEFORE ENABLING THE θ PRODUCER (L-430 slice 3)
// ─────────────────────────────────────────────────────────────────────────────────────────
// θ is still 0 everywhere in production: nothing derives a non-zero project north yet, so
// every mapping below is currently the identity and the globe is byte-identical to before.
// That is the ONLY reason a partial migration is safe. The moment slice 3 writes a non-zero
// θ to `SiteLocation.trueNorth`, every site still open-coding `east = x, north = −z` places
// its geometry at the OLD bearing while the migrated sites rotate — the building splits
// across two frames. Nothing throws; it just looks subtly wrong.
//
// MIGRATED (routes through `sceneXZToEnu`):
//   • `renderFormaMassing` → the `toCartesian(x, z, up)` closure — the primary path that
//     places the authored building + boundary + envelope on the globe.
//   • `polygonCentroidAndAreaXZ(ring, θ)` — centroid rotated; |area| is rotation-invariant
//     so it needs no correction. Its call sites are individually reasoned:
//       – terrain sampling, camera flyTo, and the two centroid→lat/lon sites PASS θ;
//       – the pitched-roof ridge fan deliberately DOES NOT (see below).
//   • `footprintBBoxXZ(walls, slabs, θ)` — centre rotated; see the caveat in its docstring
//     (an AABB is frame-dependent, so its `area` stays a project-frame approximation and
//     must never be reused for a metric/compliance figure).
//   • Terrain sampling: the boundary ring, the 1.7× street push-out and the extent radius
//     all now work from the ROTATED ring. Sampling an unrotated ring would probe ground
//     heights at the WRONG REAL-WORLD PLACE, seating the building on a neighbouring plot's
//     ground — which reads as an elevation bug, not a frame bug.
//
// DELIBERATELY NOT ROTATED (rotating these would DOUBLE-rotate — the defect, not the fix):
//   • The pitched-roof ridge fan's use of `polygonCentroidAndAreaXZ`: it is a scene → ENU →
//     scene ROUND TRIP used only to recover a centroid in SCENE space. Applying θ without
//     inverting it on the way back would rotate the roof apex off its own footprint. Its
//     vertices reach ENU later via `toCartesian`, where θ is applied exactly once.
//   • `enuToLatLon` itself, and the street-ring compass samples built from an ENU centroid —
//     they already operate in ENU.
//
//   • `renderFacadeAnalysis` → `sceneRingToMetric` AND its opening list. The most
//     consequential site: this study evaluates the AUTHORED façade against occluders that are
//     true-north by origin (OSM context) and against true-north sun directions. An unrotated
//     ring would compute shadows and sky exposure for a building rotated by θ relative to its
//     own surroundings — a fully-populated, plausible, WRONG heatmap.
//   • The glTF real-model placement — via `enuFrameWithProjectNorth(position)`, which bakes θ
//     into the placement MATRIX so position and HEADING rotate together and cannot drift
//     apart. Applied at all four placement/reseat sites; the `previousMatrix` reload path
//     deliberately does NOT re-apply θ (that matrix already carries it — re-applying would
//     compound on every reload).
//   • The GLSL façade-drape shader — θ passed as the `u_pryzmProjNorth` uniform and applied
//     to `positionMC`. REQUIRED, because the face table / centroid / roof bbox it samples
//     against are now true-frame while `positionMC` is project-frame; without it every
//     fragment samples the wrong face and the drape slides around the building. The GLSL is a
//     STRING — no compiler or unit test reaches inside it — so its algebra is pinned to the
//     source text by `sceneEnuFrame.test.ts`.
//
// NOT YET MIGRATED — must be converted (or consciously exempted) before slice 3:
//   • Nothing known in this file. The inventory above is believed complete, but it was built
//     by inspection, not by a machine check — so treat "believed complete" accordingly and
//     re-grep for `north = -` / `-p.z` / `-cz` in the geospatial layer before enabling θ.
//   • OUTSIDE this file, still open: `RealSunService.setProjectNorth` has no CALLER yet (no
//     `site.location-changed` subscriber); `computeSunHoursOnModel` / `sunSamples` need θ
//     threaded from the site; `FacadeOrientationService.northBasis(trueNorth)` is already
//     parameterised but its callers still rely on the 0 default; and the plan/sheet north
//     arrow still reads a literal angle (C34 §1.4 violation).
//
// EXEMPT (already TRUE-north sources — rotating them would DOUBLE-rotate):
//   • Terrain samples, OSM/Overpass context geometry, the sun anchor, and anything else whose
//     east/north came from lat/lon rather than from authored scene coordinates. This is why θ
//     is applied here at the scene boundary and NOT inside `enuToCartesian`, which is shared
//     by both authored and world-sourced inputs.
// ─────────────────────────────────────────────────────────────────────────────────────────

import {
    projectVectorToTrueNorth,
    trueVectorToProjectNorth,
} from '../site/overlay/projectTrueNorth';
// §PARCEL-SHADE-NOT-MIRRORED (L-10740) — the C73 canonical point-in-polygon, for the reflection
// arm at the foot of this file. Same kernel body every other straddle test in the geospatial
// layer delegates to, so the arm cannot disagree with the sea clip or the façade study.
import { pointInPolygonXZ } from '@pryzm/geometry-kernel';

/** ENU offset from the site origin, metres. True north. */
export interface EnuEastNorth {
    readonly east: number;
    readonly north: number;
}

/** A point in the authoring scene, metres. Project north (once θ ≠ 0). */
export interface SceneXZ {
    readonly x: number;
    readonly z: number;
}

/**
 * Scene-XZ (PROJECT frame) → ENU east/north (TRUE frame) about the site origin.
 *
 * This is the single frame boundary for placing authored geometry on the globe. Callers that
 * previously wrote `east = x, north = -z` inline must route through here, or their geometry
 * will sit at the wrong bearing once θ ≠ 0 while everything else rotates correctly.
 *
 * @param projectNorthRad θ, radians clockwise (`SiteLocation.trueNorth`). 0 ⇒ identity.
 */
export function sceneXZToEnu(x: number, z: number, projectNorthRad = 0): EnuEastNorth {
    const base = { east: x, north: -z };
    return projectNorthRad === 0 ? base : projectVectorToTrueNorth(base, projectNorthRad);
}

/**
 * Inverse of {@link sceneXZToEnu}: ENU east/north (TRUE frame) → scene-XZ (PROJECT frame).
 * Used where the globe hands a real-world position back to the authoring scene (terrain
 * sampling, context-building centroids, boundary round-trips).
 */
export function enuToSceneXZ(east: number, north: number, projectNorthRad = 0): SceneXZ {
    const p = projectNorthRad === 0
        ? { east, north }
        : trueVectorToProjectNorth({ east, north }, projectNorthRad);
    return { x: p.east, z: -p.north };
}

/**
 * Bearing helper: a heading measured in the PROJECT frame (degrees clockwise from the
 * scene's −Z / "up" axis) expressed as a TRUE-north compass bearing. glTF model headings and
 * the Cesium entity orientations need this — rotating a model's POSITION without its HEADING
 * leaves it correctly placed but wrongly facing, which reads as a subtle modelling error
 * rather than a frame bug, so it is easy to miss.
 */
export function projectHeadingToTrueBearingDeg(headingDeg: number, projectNorthRad = 0): number {
    const deg = headingDeg + (projectNorthRad * 180) / Math.PI;
    return ((deg % 360) + 360) % 360;
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// §PARCEL-SHADE-NOT-MIRRORED (L-10740) — THE REFLECTION ARM. ⭐ WORTH MORE THAN THE FIX.
// ─────────────────────────────────────────────────────────────────────────────────────────
// Founder 2026-08-24: "the parcel shade in PRYZM view … often the shade is not correct — it sort
// of MIRRORS to one side outwards." The live `§SITE-FRAME-PROBE` printed
// `FRAME VERDICT: CONSISTENT` on that very session.
//
// ⛔ IT WAS NOT LYING — IT HAD NO TERM FOR THIS. The probe's single test is
// `deriveProjectNorthAngleFromParcel(storedRing) ≈ 0` ("is the ring square in the authoring
// frame?"). That derivation folds its answer into (−45°, +45°] **mod 90°** and reads only the
// dominant EDGE DIRECTION. Therefore:
//   • a MIRRORED ring is still square              ⇒ residual 0 ⇒ CONSISTENT;
//   • a ring rotated by exactly 90° is still square ⇒ residual 0 ⇒ CONSISTENT;
//   • a WRONG-SIGNED θ is a rotation, and applied consistently it re-derives to 0 as well.
// All three are proven, not argued, in `apps/editor/__tests__/parcelShadeIsNotMirrored.test.ts`.
// A success criterion with no term for the thing that is wrong reports success forever.
//
// WHAT THE ARM CHECKS, and why each term is NON-VACUOUS. It compares the two rings the founder is
// actually comparing on screen — the PARCEL BOUNDARY and the BUILDABLE ENVELOPE / shade — which
// are produced by INDEPENDENT pipelines that must nonetheless land in ONE frame:
//   • `displaced`  — the envelope is an INSET of the parcel, so its centroid MUST lie inside the
//                    parcel ring. That is a geometric impossibility, not a tolerance, which makes
//                    it the strongest of the three. It fires on a mirror (which throws the shade
//                    across the plot CORNER the frame origin sits on) AND on the 2026-08-05
//                    stale-async zoning race (a NEIGHBOURING parcel's envelope drawn in this
//                    parcel's frame) — a defect that investigation explicitly recorded as
//                    invisible to this probe.
//   • `oversized`  — an inset can never enclose more area than the ring it was inset from.
//   • `reflected`  — the two rings wind in OPPOSITE directions. Signed area is the chirality
//                    primitive: a rotation preserves it exactly, a reflection negates it. ⚠ This
//                    is the WEAKEST of the three and is reported separately for that reason — a
//                    producer that merely emits the opposite winding convention trips it too.
//                    Read it as "these two rings were not built by the same frame logic", never
//                    as a proven reflection on its own.
// Silent (`ok`) whenever there is nothing to compare: an absent or degenerate envelope is not a
// defect, and a diagnostic that invents findings out of missing data is its own bug.
// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * SIGNED shoelace area of a scene-XZ ring, m². ⭐ The chirality primitive: its SIGN is the ring's
 * winding, which a rotation preserves exactly and a reflection negates. Everything that reports
 * `|area|` — including `polygonCentroidAndAreaXZ` in the viewport — is reflection-blind by
 * construction, which is precisely how a mirror survives every existing frame check.
 */
export function ringSignedAreaXZ(ring: ReadonlyArray<SceneXZ> | null | undefined): number {
    if (!ring || ring.length < 3) return 0;
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return a / 2;
}

/** Area-weighted centroid of a scene-XZ ring, falling back to the vertex mean when degenerate. */
function ringCentroidXZ(ring: ReadonlyArray<SceneXZ>): SceneXZ {
    let a2 = 0, ax = 0, az = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        const cross = p.x * q.z - q.x * p.z;
        a2 += cross;
        ax += (p.x + q.x) * cross;
        az += (p.z + q.z) * cross;
    }
    if (Math.abs(a2) > 1e-9) return { x: ax / (3 * a2), z: az / (3 * a2) };
    let sx = 0, sz = 0;
    for (const p of ring) { sx += p.x; sz += p.z; }
    return { x: sx / ring.length, z: sz / ring.length };
}

/** The verdict of {@link detectRingFrameDisagreement}. `ok` = no term fired. */
export interface RingFrameDisagreement {
    /** True when NO term fired — including when there was nothing to compare. */
    readonly ok: boolean;
    /** The two rings wind in opposite directions. Weakest term — see the block note above. */
    readonly reflected: boolean;
    /** The inner ring's centroid lies OUTSIDE the outer ring. Strongest term. */
    readonly displaced: boolean;
    /** The inner ring encloses more area than the outer. An inset cannot grow. */
    readonly oversized: boolean;
    /** Human-readable summary naming the mechanism — safe to print verbatim in a probe line. */
    readonly note: string;
}

const NOTHING_TO_COMPARE: RingFrameDisagreement = {
    ok: true, reflected: false, displaced: false, oversized: false,
    note: 'no envelope ring to compare against the boundary — nothing asserted',
};

/**
 * ⭐ THE ARM `§SITE-FRAME-PROBE` was missing: does the buildable-envelope ring sit in the SAME
 * frame as the parcel boundary it was derived from? Pure, deterministic and total — it never
 * throws and never reports a finding it cannot support. See the block note above for why each
 * term is non-vacuous and which of them is weak.
 *
 * @param outer the committed parcel boundary, scene-XZ metres (authoring frame).
 * @param inner the buildable-envelope / shade ring, expected to be an INSET of `outer`.
 */
export function detectRingFrameDisagreement(
    outer: ReadonlyArray<SceneXZ> | null | undefined,
    inner: ReadonlyArray<SceneXZ> | null | undefined,
): RingFrameDisagreement {
    if (!outer || outer.length < 3 || !inner || inner.length < 3) return NOTHING_TO_COMPARE;

    const outerArea = ringSignedAreaXZ(outer);
    const innerArea = ringSignedAreaXZ(inner);
    if (Math.abs(outerArea) < 1e-6 || Math.abs(innerArea) < 1e-6) return NOTHING_TO_COMPARE;

    const reflected = Math.sign(outerArea) !== Math.sign(innerArea);
    // 1 % headroom: a legitimate inset is strictly smaller, and floating-point noise on a ring
    // that was NOT inset (the §L-619 upper-bound footprint, which IS the parcel) must not fire.
    const oversized = Math.abs(innerArea) > Math.abs(outerArea) * 1.01;
    const c = ringCentroidXZ(inner);
    const displaced = !pointInPolygonXZ(c.x, c.z, outer);

    if (!reflected && !displaced && !oversized) {
        return {
            ok: true, reflected: false, displaced: false, oversized: false,
            note: 'envelope ring agrees with the boundary frame (same winding, centroid inside, '
                + 'area <= parcel) — no reflection or displacement detectable',
        };
    }
    const parts: string[] = [];
    if (displaced) {
        parts.push(
            `DISPLACED — the envelope centroid (${c.x.toFixed(1)}, ${c.z.toFixed(1)}) lies OUTSIDE `
            + 'the parcel ring. An inset cannot do that. Either the shade is MIRRORED about the '
            + 'frame origin (which sits on a parcel CORNER, so the mirror lands wholly to one side '
            + '— the founder’s "mirrors to one side outwards"), or this envelope belongs to a '
            + 'DIFFERENT parcel drawn in this one’s frame (the §STALE-ASYNC-ZONING race)',
        );
    }
    if (oversized) {
        parts.push(
            `OVERSIZED — envelope |area| ${Math.abs(innerArea).toFixed(0)} m² > parcel `
            + `${Math.abs(outerArea).toFixed(0)} m². An inset ring can never enclose more than the `
            + 'ring it was inset from',
        );
    }
    if (reflected) {
        parts.push(
            'OPPOSITE WINDING — the two rings have opposite signed area, so they were not built by '
            + 'the same frame logic. ⚠ WEAK ON ITS OWN: a producer emitting the other winding '
            + 'convention trips this too. Trust it alongside DISPLACED, not by itself',
        );
    }
    return { ok: false, reflected, displaced, oversized, note: parts.join(' · ') };
}
