// §RESI-ORCH-MASSING-SHAPES (lane PL-MASSING-OPTIONS, 2026-09-06) — STR §25.3, the ONE slice the
// founder flagged as build-not-wire: *"THIS NEEDS TO BE BUILT WITHIN PRYZM."*
//
// The acceptance sentence, verbatim: *"I want initially as a value attribute 180 sqm brut in ground
// floor – ideally L shape – south facing oriented – and pryzm will create a logical TO-BE BUILT
// ENVELOPE. SAME FOR FIRST FLOOR."* — so this module takes a TARGET GROUND-FLOOR AREA and a shape
// vocabulary (I · L · U · L-non-90°) and returns real rings inside the buildable footprint, each
// carrying the numbers it was chosen by.
//
// ── ⛔ WHAT THIS SUPERSEDES, AND WHY THE OLD SENTENCE WAS RIGHT WHEN IT WAS WRITTEN ──────────
// `massingOptionModel.ts` says, in its header: *"an 'L-shaped option' produced by eroding a
// rectangle is a rectangle with a label on it"*, and lists L/U/non-orthogonal under
// `MASSING_FAMILIES_NOT_YET_SOLVED` because *"this repo has no polygon boolean layer to produce
// them on a real parcel"*. That was TRUE of the tree it was written against. It is no longer true:
// **`@pryzm/geometry-kernel`'s `intersectPolygons2D` (§C73-POLY-BOOLEAN / GE-05) ships an
// oracle-pinned concave∩concave intersection**, and an intersection is exactly the operation a
// shape family needs — because `template ∩ buildableFootprint ⊆ buildableFootprint` **by
// construction**, so a shape produced this way can never over-state what may be built. That
// containment is the whole safety argument, and it is a property of the operator, not of a check
// someone remembered to write.
//
// ⭐ SO THE SHAPES ARE REAL SHAPES. Nothing here erodes a rectangle and calls it an L. An L is two
// wings of a stated depth meeting at a corner of the plot's own bounding frame; a U is three; a
// non-orthogonal L is the same two wings built on the plot's OWN two dominant edge directions —
// which is why it is REFUSED, by name, on a plot whose edges are orthogonal (§NON-ORTHO-REFUSAL
// below). Inventing a 73° corner on a rectangular plot would be the [[fake-more-capable-than-real]]
// defect wearing the founder's own vocabulary.
//
// ── ⛔ EVERY REASON IS A COMPUTED NUMBER. THAT IS THE POINT OF THE LANE ──────────────────────
// The brief: *"a reason must be computed, not decorative: if you rank by sun exposure, the number
// behind the ranking must be the solar engine's real output."* So:
//
//   • **sun-facade**   — `computeSunIntensitiesForProbes` (`apps/editor/src/workers/solarCodec.ts`),
//                        THE pure sun-hours raycast the ground heatmaps and the façade study both
//                        run, against the REAL OSM neighbour prisms. Not a proxy for it.
//   • **south-facade** — length-weighted share of the perimeter whose OUTWARD normal lies within
//                        ±45° of due south, in the scene frame where `z = −North`
//                        (`boundaryProjection.ts`). Pure geometry; this is what *"south facing
//                        oriented"* means as a measurement.
//   • **overlooking**  — share of the façade with a real neighbour building of KNOWN height in
//                        front of it within 25 m. Neighbours whose height is unknown are EXCLUDED
//                        AND COUNTED, never defaulted (see `MassingNeighbour.heightM`).
//   • **open-outlook** — share of the outward 180° view arc clear of buildings within 60 m.
//   • **street-frontage** — façade metres addressing a `'front'` boundary edge.
//   • **forecourt**    — open ground between the building and the street edge, in m² and in bays.
//
// Each of those is `null` — never `0` — when its input is absent, and the option then carries the
// limitation that says which input was missing. `0` and "not derived" are the SAME VALUE only in
// products that have not yet been bitten; this repo has been (§CONTEXT-DATA-HONESTY).
//
// ── ⛔ WHAT IS *NOT* MEASURED, SAID OUT LOUD (C57 §1.9) ──────────────────────────────────────
// The founder's criteria include *"orientation to sea view or open view"*. `open-outlook` measures
// the BUILDING half. **The SEA half is not measured**: `contextWater.buildSeaMaskFromCoastline`
// exists but its only consumers are the renderers, so no coastline geometry reaches any score in
// this repo. Every option that carries `open-outlook` also carries `sea-view-not-scored`, so a
// reader learns about the gap from the product rather than from its absence.
//
// PURE: no store, no DOM, no THREE, no I/O, no clock, no RNG. Deterministic. Never throws.
// Contracts: C58 §1.1 (deterministic, no LLM), §1.9 (pure), §1.10 (spans), §1.13 (a refusal is a
// positive answer); C114 §12 (refusals are typed and carry their numbers).

import { trace } from '@opentelemetry/api';
import type { Pt, ParcelEdgeClassification } from '@pryzm/schemas';
import { intersectPolygons2D } from '@pryzm/geometry-kernel';
import { classifyEdges } from './boundaryProjection';
import {
    computeSunIntensitiesForProbes,
    type MetricFootprint,
    type SunProbe,
} from '../../workers/solarCodec';

const _tracer = trace.getTracer('pryzm.site.massingShapeOptions');

// ─────────────────────────────────────────────────────────────────────────────
// THE VOCABULARY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The shape families STR §25.3 names — *"I · L · U · L non-90-degree · etc."*
 *
 * CLOSED. A fifth family is added HERE with its builder, its label and its meaning, and the type
 * error at every table is the feature.
 */
export type MassingShapeFamily = 'bar-i' | 'ell' | 'ell-non-orthogonal' | 'u-court';

export const MASSING_SHAPE_FAMILIES: readonly MassingShapeFamily[] = Object.freeze([
    'bar-i', 'ell', 'ell-non-orthogonal', 'u-court',
] as const);

export const MASSING_SHAPE_LABEL: Readonly<Record<MassingShapeFamily, string>> = Object.freeze({
    'bar-i': 'I — single bar',
    'ell': 'L — two wings',
    'ell-non-orthogonal': 'L — non-orthogonal wings',
    'u-court': 'U — three wings round a court',
});

export const MASSING_SHAPE_MEANING: Readonly<Record<MassingShapeFamily, string>> = Object.freeze({
    'bar-i':
        'One straight bar. The simplest to build and the cheapest envelope per m², and the shape '
        + 'that gives every room the same aspect — for better or worse.',
    'ell':
        'Two wings meeting at a corner. Buys a sheltered outdoor corner and lets two elevations face '
        + 'different directions, at the cost of a longer, more expensive envelope.',
    'ell-non-orthogonal':
        'Two wings meeting at the angle the PLOT itself makes, not at 90°. It follows an irregular '
        + 'boundary instead of fighting it, which usually recovers footprint a square building loses.',
    'u-court':
        'Three wings around a court. The most sheltered outdoor space and the most façade — the most '
        + 'daylight, and the most envelope to pay for and to heat.',
});

/** The axes this engine computes. Every one of them is a measurement, not a label. */
export type MassingShapeAxisKey =
    | 'south-facade'
    | 'sun-facade'
    | 'overlooking'
    | 'open-outlook'
    | 'street-frontage'
    | 'forecourt';

/** One computed reason. Same shape as `MassingScoreAxis` so the shipped card renders it unchanged. */
export interface MassingShapeReason {
    readonly key: MassingShapeAxisKey;
    readonly label: string;
    /** 0..1 for a bar, or `null` when the input was absent. ⛔ NEVER 0 as a stand-in for unknown. */
    readonly normalised: number | null;
    /** The real figure in its own units, or `null`. */
    readonly display: string | null;
    readonly meaning: string;
}

/** A coded caveat on one shape. Mirrors `MassingLimitation`; a renderer keys on `code`, never prose. */
export interface MassingShapeNote {
    readonly code:
        /** The template had to be cut back hard to stay inside the buildable footprint. */
        | 'clipped-hard'
        /** No site lat/lon reached the engine, so the real sun raycast was not run. */
        | 'sun-not-computed'
        /** Neighbour footprints were captured but N of them carry no height, so they were excluded. */
        | 'neighbour-heights-missing'
        /** No neighbour footprints at all — overlooking and outlook are unmeasured, not zero. */
        | 'no-neighbour-data'
        /** ⭐ The sea/open-view half of §25.3's criterion has no data path into scoring. */
        | 'sea-view-not-scored'
        /** `'front'` came from the compass heuristic, not from a road. */
        | 'frontage-is-heuristic'
        /** The wing depth is a study assumption this engine states rather than a rule it read. */
        | 'wing-depth-assumed'
        /**
         * The built wing is thinner than a habitable room depth SOMEWHERE along its length —
         * MEASURED on the clipped ring (§WING-WIDTH-MEASURED), not read off the assumed depth.
         */
        | 'wings-thin'
        /**
         * §WING-DEPTH-LADDER — the ASSUMED depth itself is below MIN_WING_M (an input problem).
         * A sliver PRODUCED BY CLIPPING is a different fact and is a REFUSAL of the whole family
         * (`family-wings-sliver`), never a note on a shipped shape.
         */
        | 'wings-sliver'
        /**
         * ⭐ §LARGEST-FIT (L-13037) — no ground-floor area was named, so this shape is the
         * LARGEST of its family that fits the permitted footprint at the stated wing depth.
         * That is the family's own ceiling — a computed geometric fact, exactly as "Full plate"
         * is the coverage family's — and NOT a default number PRYZM chose. Both figures travel
         * with it, and the action that sizes it is named.
         */
        | 'sized-to-largest-fit'
        /**
         * §WING-WIDTH-MEASURED — N placements of this family reached the area but were
         * excluded because clipping to the outline thinned a wing below MIN_WING_M. Printed so
         * an exclusion is a stated finding, not a silent shrink of the candidate list.
         */
        | 'sliver-placements-excluded';
    readonly severity: 'error' | 'warning';
    readonly text: string;
}

/** Why a family could not be produced. CLOSED — every arm carries the numbers it was decided from. */
export type MassingShapeRefusalReason =
    /** The buildable ring is degenerate — nothing to place a shape inside. */
    | 'no-buildable-footprint'
    /** The target area was absent, not a number, or not positive. */
    | 'no-target-area'
    /** The target exceeds the buildable footprint. Both numbers travel with it. */
    | 'target-exceeds-buildable'
    /**
     * ⭐ §NON-ORTHO-REFUSAL. The plot has no second dominant edge direction far enough from the
     * first for a non-orthogonal L to be DERIVED from it. Refused rather than invented — a 73°
     * corner PRYZM chose on a rectangular plot is a decision wearing the founder's vocabulary.
     */
    | 'no-non-orthogonal-frame'
    /** No placement of this family reached the target area inside this footprint. */
    | 'family-cannot-reach-target'
    /** Every placement clipped into disjoint pieces — the family does not fit this outline. */
    | 'family-does-not-fit'
    /**
     * ⛔ §WING-WIDTH-MEASURED (L-13037: *"COHERENT SHAPES … never ship a sliver"*). Every
     * placement that reached the area did so only because clipping to the outline left a wing
     * thinner than MIN_WING_M somewhere along its body. The narrowest measured width, the
     * minimum, and the wing it was measured on all travel with the refusal (C58 §1.13).
     */
    | 'family-wings-sliver'
    /**
     * ⛔ §NOT-A-RECTANGLE-WEARING-THE-LETTER — every L / U placement that fits clipped to a ring
     * with NO re-entrant corner: on this outline the family collapses to the bar. The bar family
     * already offers that ring; listing it again under another letter would be the exact defect
     * `massingOptionModel`'s header was written to prevent.
     */
    | 'family-collapses-to-bar';

/** How a candidate's SIZE was decided. See `MassingShapeInputs.whenNoTarget`. */
export type MassingShapeSizing = 'target' | 'largest-fit';

export interface MassingShapeCandidate {
    readonly family: MassingShapeFamily;
    readonly label: string;
    /** The footprint, scene-XZ metres. ⊆ the buildable ring by construction (intersection). */
    readonly ring: readonly Pt[];
    readonly areaM2: number;
    /**
     * The area the user NAMED, or `null` when the shape was sized to its largest fit because
     * none was named. ⛔ Never the achieved area standing in for an unnamed target — "asked for
     * 320" and "the biggest that fits happened to be 320" are different facts.
     */
    readonly targetAreaM2: number | null;
    readonly sizedBy: MassingShapeSizing;
    /**
     * §WING-WIDTH-MEASURED — the narrowest wing width found on the CLIPPED ring, metres,
     * measured at stations along each wing's body (tip zones excluded). `null` only when no
     * station could be measured (a wing shorter than one station), never 0 for "not measured".
     */
    readonly narrowestWingM: number | null;
    /** Placements that reached the area but were EXCLUDED as slivers. Printed, never silent. */
    readonly sliverPlacementsExcluded: number;
    /** The wing / bar depth used, metres. Disclosed because it is an assumption (see the note). */
    readonly wingDepthM: number;
    /** Which corner / side the shape was anchored on, in plain words. */
    readonly placementLabel: string;
    /** How many placements of this family were tried before this one won. */
    readonly placementsConsidered: number;
    /**
     * The south-facing façade fraction of the RUNNER-UP placement, or `null` when there was only
     * one. Printed so the choice between placements is legible rather than asserted.
     */
    readonly runnerUpSouthFraction: number | null;
    readonly reasons: readonly MassingShapeReason[];
    readonly notes: readonly MassingShapeNote[];
    /** Plain language: what it is, where it sits, and the ONE number it leads on. */
    readonly statement: string;
}

export type MassingShapeOutcome =
    | { readonly ok: true; readonly candidate: MassingShapeCandidate }
    | {
          readonly ok: false;
          readonly family: MassingShapeFamily;
          readonly reason: MassingShapeRefusalReason;
          readonly text: string;
      };

/** One neighbouring building, in the SCENE-XZ frame (x = east, z = −north). */
export interface MassingNeighbour {
    readonly ring: readonly Pt[];
    /**
     * ⛔ `null` MEANS UNKNOWN AND IS NEVER SUBSTITUTED. A neighbour with no height is excluded
     * from the solar occluder set and from the overlooking test, and the exclusion is COUNTED and
     * PRINTED (`neighbour-heights-missing`). Defaulting it to 9 m — the shape this repo has
     * shipped before — makes an assumption indistinguishable from a measurement (L-616).
     */
    readonly heightM: number | null;
}

/** Everything about the SITE that the shapes are scored against. */
export interface MassingSitingContext {
    /** Site latitude/longitude. `null` ⇒ the real sun raycast is not run and says so. */
    readonly latDeg: number | null;
    readonly lngDeg: number | null;
    /** ⛔ EMPTY vs NEVER-CAPTURED are different facts and are carried separately. */
    readonly neighbours: readonly MassingNeighbour[];
    readonly neighbourSnapshotTaken: boolean;
    /** Where the lat/lon came from, for the statement. */
    readonly originLabel: string | null;
}

export interface MassingShapeInputs {
    /** `BuildableEnvelope.insetPolygon` — the permitted footprint, scene-XZ metres. */
    readonly buildableRing: readonly Pt[];
    /** The card's ONE producer of this figure. Never re-derived here (C06 §13.3). */
    readonly buildableAreaM2: number;
    /**
     * ⭐ The founder's *"180 sqm brut in ground floor"*. `null` ⇒ see `whenNoTarget`: by default
     * every family refuses, by name.
     */
    readonly targetAreaM2: number | null;
    /**
     * ⭐ §LARGEST-FIT (L-13037) — what to do when NO ground-floor area has been named.
     *
     *   • `'refuse'` (default) — every family refuses with `no-target-area`. The engine's
     *     original contract, kept so no existing caller changes behaviour by omission.
     *   • `'largest-fit'` — each family is solved at the LARGEST outline of that family that
     *     fits the permitted footprint at the stated wing depth (scale 1 of the plot extent,
     *     clipped). That is the family's own ceiling — the same fact "Full plate" states for
     *     the coverage family — so a user can choose a SHAPE before choosing a SIZE, which is
     *     the order an architect works in. ⛔ It is NOT a default area: the candidate says
     *     `sizedBy: 'largest-fit'`, carries `targetAreaM2: null`, and its `sized-to-largest-fit`
     *     note names the number and the action that sizes it.
     */
    readonly whenNoTarget?: 'refuse' | 'largest-fit';
    /** Site facts. `null` ⇒ shapes are still generated; the siting axes report `null`, not 0. */
    readonly siting: MassingSitingContext | null;
    /** Override the assumed wing depth (metres). Omit for {@link DEFAULT_WING_DEPTH_M}. */
    readonly wingDepthM?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE NAMED CONSTANTS. Every one of them is an assumption, so every one of them has a name, a
// value and a sentence. A magic number inside a scoring function is an undisclosed decision.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The wing / bar depth, metres. A habitable wing is a room plus circulation; 8 m is the depth at
 * which a room can be daylit from one side and still leave a corridor. ⛔ IT IS A STUDY
 * ASSUMPTION, NOT A RULE PRYZM READ, and every candidate carries `wing-depth-assumed` saying so.
 */
export const DEFAULT_WING_DEPTH_M = 8;

/** Below this a "wing" is a corridor, not accommodation. A warning, not a refusal — see the note. */
const THIN_WING_M = 4.5;

/**
 * Below this the shape is a sliver and the family is refused outright.
 *
 * ⭐ §WING-WIDTH-MEASURED (L-13037) — applied to the CLIPPED ring, not only to the assumed depth.
 * A template wing is `wingDepth` deep by construction; the wing that is actually BUILT is that
 * wing ∩ the permitted outline, and on an irregular plot the outline cuts across it, tapering an
 * 8 m wing to nothing. That taper is exactly the *"slivers, re-entrant corners narrower than a
 * room, and wings too thin to build"* the founder named, and no check on the input depth can see
 * it. So every solved placement's wings are measured at stations along their bodies, and a
 * placement thinner than this anywhere in a wing's body is excluded — the family is refused when
 * none survives, with the narrowest width printed.
 */
const MIN_WING_M = 2;

/** Stations along a wing's body are this far apart, metres. */
const WING_STATION_M = 2;

/** Each station measures the wing across a slice this long along the wing, metres. */
const WING_SLICE_M = 1;

/**
 * The tip zone: the last `wingDepth` metres at each end of a wing are NOT measured. A wing may
 * end in a splay or a diagonal where the outline cuts it — squaring that off is a detailing
 * decision, not a sliver — but its BODY must hold the minimum width. One wing depth is the
 * length of the corner block a wing shares with its neighbour, so the rule has a shape to it.
 */
const WING_TIP_TOLERANCE_FACTOR = 1;

/** Façade probes are spaced no further apart than this along the perimeter. */
const FACADE_SAMPLE_SPACING_M = 3;

/** Probe height above ground — a ground-floor window head, the storey the target area describes. */
const FACADE_PROBE_HEIGHT_M = 1.5;

/** Half-arc, degrees, within which a façade counts as "south facing". */
const SOUTH_ARC_HALF_DEG = 45;

/** A neighbour nearer than this, in front of a façade, overlooks it. */
const OVERLOOK_RADIUS_M = 25;

/** A neighbour shorter than this has no upper window to overlook from. */
const OVERLOOK_MIN_HEIGHT_M = 3;

/** Outlook is measured against buildings within this radius. */
const VIEW_RADIUS_M = 60;

/** The outward 180° arc is sampled every this many degrees. */
const VIEW_ARC_STEP_DEG = 10;

/** A façade within this distance of a `'front'` edge is addressing the street. */
const ENTRANCE_BAND_M = 15;

/** The depth of the strip, measured in from the front boundary, that counts as the forecourt. */
const FORECOURT_BAND_M = 12;

/** One parking bay: 2.5 × 5.0 m. ⚠ EXCLUDES the aisle, and the display says so. */
const PARKING_BAY_M2 = 12.5;

/** Sun-sample cadence for the façade raycast, minutes — the same default the heatmaps use. */
const SUN_STEP_MINUTES = 15;

/** Bisection budget for the area solve. Exits on tolerance long before this. */
const MAX_BISECTION_STEPS = 48;

/** Two axes are within this cosine of parallel ⇒ the frame is degenerate. ~11.5°. */
const MIN_FRAME_DET = 0.2;

/**
 * A non-orthogonal L needs the plot's two dominant directions to be at least this far from
 * perpendicular; otherwise it IS the orthogonal L and would be a duplicate wearing a new name.
 */
const NON_ORTHO_MIN_DEVIATION_DEG = 8;

// ─────────────────────────────────────────────────────────────────────────────
// PURE GEOMETRY (local — this module must stay dependency-light, and each formula has one form)
// ─────────────────────────────────────────────────────────────────────────────

type Vec = { readonly x: number; readonly z: number };

/** Shoelace SIGNED area (m²) in XZ, with the SAME sign convention `boundaryProjection` uses. */
function signedAreaXZ(ring: readonly Pt[]): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return a / 2;
}

function ringAreaM2(ring: readonly Pt[]): number {
    return ring.length < 3 ? 0 : Math.abs(signedAreaXZ(ring));
}

/**
 * Does the ring have a RE-ENTRANT corner? An L or a U must; a ring without one is a bar however
 * it was templated. Cross-product sign at each vertex, both signs present ⇒ reflex somewhere.
 * Near-collinear vertices (|cross| below 0.05 m²) are ignored so a clipped edge that merely
 * bends by a hair cannot pass a rectangle off as an L.
 */
function hasReflexCorner(ring: readonly Pt[]): boolean {
    let pos = false;
    let neg = false;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const c = ring[(i + 2) % ring.length]!;
        const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
        if (cross > 0.05) pos = true;
        if (cross < -0.05) neg = true;
    }
    return pos && neg;
}

/** Distance from a point to a segment, metres. */
function distPointSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    if (len2 <= 1e-12) return Math.hypot(px - ax, pz - az);
    let t = ((px - ax) * dx + (pz - az) * dz) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/**
 * Sample a neighbour's BOUNDARY at ≤ this spacing, in metres.
 *
 * ⚠ WHY BOUNDARY SAMPLES AND NOT VERTICES. Both the overlooking test and the outlook sweep ask
 * "is a neighbouring building in this direction, at this range". Asked of VERTICES, a 60 m-long
 * wall standing 24 m away answers NO whenever both of its corners are further than the radius —
 * which is the common case for a long slab, and is exactly the geometry a user would call
 * overlooking. Sampling the boundary makes the test about the WALL, which is what looks back.
 */
const NEIGHBOUR_SAMPLE_SPACING_M = 4;

/** Boundary sample points for one neighbour ring. */
function sampleNeighbourBoundary(ring: readonly Pt[]): Pt[] {
    const out: Pt[] = [];
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        if (len < 1e-6) continue;
        const n = Math.max(1, Math.ceil(len / NEIGHBOUR_SAMPLE_SPACING_M));
        for (let k = 0; k <= n; k++) {
            const t = k / n;
            out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
        }
    }
    return out;
}

/**
 * `template ∩ buildable` through THE repo boolean (§C73-POLY-BOOLEAN). Returns the single positive
 * loop, or `null` when the result is empty, multi-region or holed.
 *
 * ⛔ MULTI-REGION IS A REFUSAL, NOT A "PICK THE BIGGEST". That is the same rule `explicitArea`'s
 * `'multi-region-on-parcel'` arm applies: picking the largest piece under-states the answer while
 * the number printed beside it describes something else.
 */
function clipToBuildable(template: readonly Pt[], buildable: readonly Pt[]): Pt[] | null {
    const res = intersectPolygons2D(
        template.map((p) => [p.x, p.z] as [number, number]),
        buildable.map((p) => [p.x, p.z] as [number, number]),
    );
    if (!res.ok) return null;
    const positive = res.loops.filter((loop) => {
        let a = 0;
        for (let i = 0; i < loop.length; i++) {
            const p = loop[i]!;
            const q = loop[(i + 1) % loop.length]!;
            a += p[0] * q[1] - q[0] * p[1];
        }
        return Math.abs(a / 2) > 0.5;
    });
    if (positive.length !== 1) return null;
    const loop = positive[0]!;
    if (loop.length < 3) return null;
    return loop.map(([x, z]) => ({ x, z }));
}

/** A planar frame: two unit directions. `w` need NOT be perpendicular to `u` (that is the point). */
interface Frame {
    readonly origin: Pt;
    readonly u: Vec;
    readonly w: Vec;
    readonly label: string;
}

function frameInverse(f: Frame): ((p: Pt) => { a: number; b: number }) | null {
    const det = f.u.x * f.w.z - f.u.z * f.w.x;
    if (Math.abs(det) < MIN_FRAME_DET) return null;
    return (p: Pt) => {
        const dx = p.x - f.origin.x;
        const dz = p.z - f.origin.z;
        return {
            a: (dx * f.w.z - dz * f.w.x) / det,
            b: (dz * f.u.x - dx * f.u.z) / det,
        };
    };
}

function frameForward(f: Frame, a: number, b: number): Pt {
    return {
        x: f.origin.x + a * f.u.x + b * f.w.x,
        z: f.origin.z + a * f.u.z + b * f.w.z,
    };
}

/** The plot's dominant edge directions, longest first, deduped by angle (mod 180°). */
function dominantDirections(ring: readonly Pt[]): Array<{ dir: Vec; lengthM: number }> {
    const buckets: Array<{ dir: Vec; lengthM: number }> = [];
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        const dx = q.x - p.x;
        const dz = q.z - p.z;
        const len = Math.hypot(dx, dz);
        if (len < 0.5) continue;
        // Canonicalise to a half-plane so an edge and its reverse are ONE direction.
        let ux = dx / len;
        let uz = dz / len;
        if (ux < 0 || (Math.abs(ux) < 1e-9 && uz < 0)) { ux = -ux; uz = -uz; }
        const hit = buckets.find((bk) => Math.abs(bk.dir.x * ux + bk.dir.z * uz) > Math.cos((5 * Math.PI) / 180));
        if (hit) {
            // Accumulate length onto the existing bucket (deterministic: direction is the FIRST seen).
            const idx = buckets.indexOf(hit);
            buckets[idx] = { dir: hit.dir, lengthM: hit.lengthM + len };
        } else {
            buckets.push({ dir: { x: ux, z: uz }, lengthM: len });
        }
    }
    // Deterministic order: longest first, then by angle, so equal lengths never depend on input order.
    buckets.sort((p, q) => (q.lengthM - p.lengthM) || (Math.atan2(p.dir.z, p.dir.x) - Math.atan2(q.dir.z, q.dir.x)));
    return buckets;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE TEMPLATES — built in frame coordinates, so an "L" follows the PLOT, not the compass.
// ─────────────────────────────────────────────────────────────────────────────

interface Extent { readonly aMin: number; readonly aMax: number; readonly bMin: number; readonly bMax: number; }

/**
 * One placement of one family: a pure function from a SCALE to a template ring, plus a name.
 * `scale` is the fraction of the plot extent the shape's legs span; the ring GROWS with it, which
 * is what makes the area solve a bisection on a monotone function rather than a search.
 */
interface Placement {
    readonly label: string;
    readonly frame: Frame;
    readonly build: (scale: number) => Pt[];
    /**
     * §WING-WIDTH-MEASURED — the wings this placement is made of, in FRAME coordinates, at the
     * same scale `build` uses. Each is the rectangle the template wing occupies; the width
     * check measures what the CLIPPED ring keeps of it.
     */
    readonly wings: (scale: number) => WingRect[];
}

/** One template wing in frame coordinates. `along` is the axis the wing runs down. */
interface WingRect {
    readonly label: string;
    readonly aMin: number;
    readonly aMax: number;
    readonly bMin: number;
    readonly bMax: number;
    readonly along: 'a' | 'b';
}

/**
 * A compass word for a scene-XZ direction. The scene frame is `x = east, z = −North`
 * (`boundaryProjection.latLonToSceneXZ`), so `+z` is due SOUTH — which is why this helper exists in
 * one place rather than being re-derived at each label site with a sign error waiting in it.
 */
function compassName(v: Vec): string {
    const len = Math.hypot(v.x, v.z) || 1;
    // Bearing clockwise from north, where north = −z.
    const deg = ((Math.atan2(v.x / len, -v.z / len) * 180) / Math.PI + 360) % 360;
    const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
    return names[Math.round(deg / 45) % 8]!;
}

function barPlacements(f: Frame, e: Extent, depth: number): Placement[] {
    const A = e.aMax - e.aMin;
    const B = e.bMax - e.bMin;
    const out: Placement[] = [];
    const negW = compassName({ x: -f.w.x, z: -f.w.z });
    const posW = compassName(f.w);
    const negU = compassName({ x: -f.u.x, z: -f.u.z });
    const posU = compassName(f.u);
    // Four sides: the bar hugs one boundary of the frame extent and grows along it.
    const sides: Array<{ label: string; at: (s: number) => [number, number, number, number] }> = [
        { label: `set against the ${negW} boundary`, at: (s) => [e.aMin, e.aMin + s * A, e.bMin, e.bMin + depth] },
        { label: `set against the ${posW} boundary`, at: (s) => [e.aMin, e.aMin + s * A, e.bMax - depth, e.bMax] },
        { label: `set against the ${negU} boundary`, at: (s) => [e.aMin, e.aMin + depth, e.bMin, e.bMin + s * B] },
        { label: `set against the ${posU} boundary`, at: (s) => [e.aMax - depth, e.aMax, e.bMin, e.bMin + s * B] },
    ];
    for (const side of sides) {
        out.push({
            label: `${f.label}, ${side.label}`,
            frame: f,
            build: (s: number) => {
                const [a0, a1, b0, b1] = side.at(s);
                return [
                    frameForward(f, a0, b0), frameForward(f, a1, b0),
                    frameForward(f, a1, b1), frameForward(f, a0, b1),
                ];
            },
            wings: (s: number) => {
                const [a0, a1, b0, b1] = side.at(s);
                // The bar runs down whichever of its two extents is the LONG one.
                const along = (a1 - a0) >= (b1 - b0) ? 'a' : 'b';
                return [{ label: `the bar ${side.label}`, aMin: a0, aMax: a1, bMin: b0, bMax: b1, along }];
            },
        });
    }
    return out;
}

/** An L: two wings of `depth` meeting at one corner of the frame extent. Four corners. */
function ellPlacements(f: Frame, e: Extent, depth: number): Placement[] {
    const A = e.aMax - e.aMin;
    const B = e.bMax - e.bMin;
    const negW = compassName({ x: -f.w.x, z: -f.w.z });
    const posW = compassName(f.w);
    const negU = compassName({ x: -f.u.x, z: -f.u.z });
    const posU = compassName(f.u);
    const corners: Array<{ label: string; sa: 1 | -1; sb: 1 | -1 }> = [
        { label: `wings on the ${negU} and ${negW} boundaries`, sa: 1, sb: 1 },
        { label: `wings on the ${posU} and ${negW} boundaries`, sa: -1, sb: 1 },
        { label: `wings on the ${negU} and ${posW} boundaries`, sa: 1, sb: -1 },
        { label: `wings on the ${posU} and ${posW} boundaries`, sa: -1, sb: -1 },
    ];
    return corners.map((c) => {
        const geom = (s: number) => {
            const a0 = c.sa === 1 ? e.aMin : e.aMax;
            const b0 = c.sb === 1 ? e.bMin : e.bMax;
            return {
                a0, b0,
                la: c.sa * s * A, lb: c.sb * s * B,
                da: c.sa * depth, db: c.sb * depth,
            };
        };
        return {
            label: `${f.label}, ${c.label}`,
            frame: f,
            build: (s: number): Pt[] => {
                const { a0, b0, la, lb, da, db } = geom(s);
                // Corner at (a0,b0); one wing runs `la` along u with depth `db`, the other `lb` along
                // v with depth `da`. Written as a 6-gon so the re-entrant corner is explicit.
                return [
                    frameForward(f, a0, b0),
                    frameForward(f, a0 + la, b0),
                    frameForward(f, a0 + la, b0 + db),
                    frameForward(f, a0 + da, b0 + db),
                    frameForward(f, a0 + da, b0 + lb),
                    frameForward(f, a0, b0 + lb),
                ];
            },
            wings: (s: number): WingRect[] => {
                const { a0, b0, la, lb, da, db } = geom(s);
                const wingAlongU = `the wing along the ${c.sb === 1 ? negW : posW} boundary`;
                const wingAlongW = `the wing along the ${c.sa === 1 ? negU : posU} boundary`;
                return [
                    { label: wingAlongU, ...span(a0, a0 + la), ...spanB(b0, b0 + db), along: 'a' },
                    { label: wingAlongW, ...span(a0, a0 + da), ...spanB(b0, b0 + lb), along: 'b' },
                ];
            },
        };
    });
}

/** Ordered a-span, whichever way the wing was written. */
function span(p: number, q: number): { aMin: number; aMax: number } {
    return p <= q ? { aMin: p, aMax: q } : { aMin: q, aMax: p };
}

/** Ordered b-span, whichever way the wing was written. */
function spanB(p: number, q: number): { bMin: number; bMax: number } {
    return p <= q ? { bMin: p, bMax: q } : { bMin: q, bMax: p };
}

/** A U: three wings of `depth` round a court, open on one of the four sides. */
function uPlacements(f: Frame, e: Extent, depth: number): Placement[] {
    const A = e.aMax - e.aMin;
    const B = e.bMax - e.bMin;
    const opens: Array<{ label: string; sb: 1 | -1 }> = [
        { label: `court opening to the ${compassName(f.w)}`, sb: 1 },
        { label: `court opening to the ${compassName({ x: -f.w.x, z: -f.w.z })}`, sb: -1 },
    ];
    const out: Placement[] = [];
    for (const o of opens) {
        const geom = (s: number) => {
            const la = s * A;
            const lb = o.sb * s * B;
            const db = o.sb * depth;
            const a0 = e.aMin + (A - la) / 2; // centred on the frame extent
            const b0 = o.sb === 1 ? e.bMin : e.bMax;
            return { la, lb, db, a0, b0 };
        };
        out.push({
            label: `${f.label}, ${o.label}`,
            frame: f,
            build: (s: number): Pt[] => {
                const { la, lb, db, a0, b0 } = geom(s);
                return [
                    frameForward(f, a0, b0),
                    frameForward(f, a0 + la, b0),
                    frameForward(f, a0 + la, b0 + lb),
                    frameForward(f, a0 + la - depth, b0 + lb),
                    frameForward(f, a0 + la - depth, b0 + db),
                    frameForward(f, a0 + depth, b0 + db),
                    frameForward(f, a0 + depth, b0 + lb),
                    frameForward(f, a0, b0 + lb),
                ];
            },
            wings: (s: number): WingRect[] => {
                const { la, lb, db, a0, b0 } = geom(s);
                const base = `the closed side of the court (${compassName(o.sb === 1 ? { x: -f.w.x, z: -f.w.z } : f.w)})`;
                return [
                    { label: base, ...span(a0, a0 + la), ...spanB(b0, b0 + db), along: 'a' },
                    { label: `the ${compassName({ x: -f.u.x, z: -f.u.z })} wing of the court`, ...span(a0, a0 + depth), ...spanB(b0, b0 + lb), along: 'b' },
                    { label: `the ${compassName(f.u)} wing of the court`, ...span(a0 + la - depth, a0 + la), ...spanB(b0, b0 + lb), along: 'b' },
                ];
            },
        });
    }
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE AREA SOLVE — bisection on a monotone scale, to the SAME tolerance rule the §5 solver states.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⭐ THE TOLERANCE IS THE §5 SOLVER'S OWN RULE, RESTATED IN ONE PLACE.
 * `targetFootprintAreaSolver.toleranceFor` uses `max(0.25 m², 0.25 % of the target)` and says why:
 * a fixed epsilon demands impossible precision on a 20 m² plot and pointless precision on 4,000 m².
 * The same number is used here so an option and a hand-typed target of the same area agree about
 * whether they hit it.
 */
function toleranceFor(targetM2: number): number {
    return Math.max(0.25, targetM2 * 0.0025);
}

interface SolvedPlacement {
    readonly label: string;
    readonly ring: Pt[];
    readonly areaM2: number;
    readonly templateAreaM2: number;
    readonly scale: number;
}

/**
 * ⭐ §LARGEST-FIT — one placement at scale 1: the largest outline of its family that the
 * permitted footprint holds at this wing depth. No bisection — there is no target to hit; the
 * plot's extent IS the size. `null` when even the full-extent template clips to nothing usable.
 */
function solveLargest(placement: Placement, buildable: readonly Pt[]): SolvedPlacement | null {
    const tpl = placement.build(1);
    const clipped = clipToBuildable(tpl, buildable);
    if (clipped === null) return null;
    const areaM2 = ringAreaM2(clipped);
    if (!(areaM2 > 0.5)) return null;
    return { label: placement.label, ring: clipped, areaM2, templateAreaM2: ringAreaM2(tpl), scale: 1 };
}

// ─────────────────────────────────────────────────────────────────────────────
// §WING-WIDTH-MEASURED (L-13037) — is the wing that was BUILT still a wing?
// ─────────────────────────────────────────────────────────────────────────────

/** Area kept by `poly ∩ probe`, summed over every positive loop. 0 when the boolean fails. */
function keptAreaM2(probe: readonly Pt[], poly: readonly Pt[]): number {
    const res = intersectPolygons2D(
        probe.map((p) => [p.x, p.z] as [number, number]),
        poly.map((p) => [p.x, p.z] as [number, number]),
    );
    if (!res.ok) return 0;
    let total = 0;
    for (const loop of res.loops) {
        let a = 0;
        for (let i = 0; i < loop.length; i++) {
            const p = loop[i]!;
            const q = loop[(i + 1) % loop.length]!;
            a += p[0] * q[1] - q[0] * p[1];
        }
        total += Math.abs(a / 2);
    }
    return total;
}

interface WingWidthReading {
    readonly wingLabel: string;
    /** The narrowest body width measured on this wing, metres. */
    readonly minWidthM: number;
    /** Distance along the wing at which it was measured, metres from the wing's start. */
    readonly atM: number;
}

/**
 * Measure one wing of a solved placement on the CLIPPED ring.
 *
 * Stations every `WING_STATION_M` down the wing's long axis; at each, a slice `WING_SLICE_M`
 * long and the wing's full depth across is intersected with the clipped ring, and the kept
 * area ÷ slice length is the wing's mean width there. The tip zone at each end of the built
 * run is skipped (see `WING_TIP_TOLERANCE_FACTOR`); when the run is shorter than two tip zones
 * the single middle station is measured, so a short wing is still judged rather than skipped.
 *
 * Returns `null` when no station lands on built ring at all (the wing was clipped away), which
 * the caller treats as "this wing was not built", a different fact from "this wing is thin".
 */
function measureWing(
    frame: Frame,
    wing: WingRect,
    clipped: readonly Pt[],
    wingDepth: number,
): WingWidthReading | null {
    const alongMin = wing.along === 'a' ? wing.aMin : wing.bMin;
    const alongMax = wing.along === 'a' ? wing.aMax : wing.bMax;
    const length = alongMax - alongMin;
    if (!(length > WING_SLICE_M)) return null;
    // A hair of margin across, so a wing that exactly coincides with the outline is not lost to
    // an edge-on boolean; the margin lies OUTSIDE the wing, where the template has nothing.
    const acrossMin = (wing.along === 'a' ? wing.bMin : wing.aMin) - 0.05;
    const acrossMax = (wing.along === 'a' ? wing.bMax : wing.aMax) + 0.05;

    const stations: Array<{ atM: number; widthM: number }> = [];
    const n = Math.max(1, Math.floor((length - WING_SLICE_M) / WING_STATION_M));
    for (let k = 0; k <= n; k++) {
        const at = n === 0 ? length / 2 : WING_SLICE_M / 2 + (k * (length - WING_SLICE_M)) / n;
        const s0 = alongMin + at - WING_SLICE_M / 2;
        const s1 = alongMin + at + WING_SLICE_M / 2;
        const probe: Pt[] = wing.along === 'a'
            ? [
                frameForward(frame, s0, acrossMin), frameForward(frame, s1, acrossMin),
                frameForward(frame, s1, acrossMax), frameForward(frame, s0, acrossMax),
            ]
            : [
                frameForward(frame, acrossMin, s0), frameForward(frame, acrossMax, s0),
                frameForward(frame, acrossMax, s1), frameForward(frame, acrossMin, s1),
            ];
        // The frame need not be orthonormal (the non-orthogonal L), so the slice's true length
        // along the wing is measured in scene metres rather than assumed to be WING_SLICE_M.
        const p0 = wing.along === 'a' ? frameForward(frame, s0, 0) : frameForward(frame, 0, s0);
        const p1 = wing.along === 'a' ? frameForward(frame, s1, 0) : frameForward(frame, 0, s1);
        const sliceLenM = Math.hypot(p1.x - p0.x, p1.z - p0.z) || WING_SLICE_M;
        const kept = keptAreaM2(probe, clipped);
        stations.push({ atM: at, widthM: kept / sliceLenM });
    }

    // The BUILT run: the stations that actually landed on ring.
    const built = stations.filter((st) => st.widthM > 0.05);
    if (built.length === 0) return null;
    const runStart = built[0]!.atM;
    const runEnd = built[built.length - 1]!.atM;
    const tip = wingDepth * WING_TIP_TOLERANCE_FACTOR;
    let body = built.filter((st) => st.atM - runStart >= tip && runEnd - st.atM >= tip);
    if (body.length === 0) body = [built[Math.floor(built.length / 2)]!];

    let min = body[0]!;
    for (const st of body) if (st.widthM < min.widthM) min = st;
    return { wingLabel: wing.label, minWidthM: min.widthM, atM: min.atM };
}

interface WingWidthVerdict {
    /** The narrowest body width over every measured wing, or `null` when none could be measured. */
    readonly narrowestM: number | null;
    readonly narrowest: WingWidthReading | null;
    /** `true` when some wing's body is below MIN_WING_M — the placement is a sliver. */
    readonly sliver: boolean;
}

function judgeWings(placement: Placement, solved: SolvedPlacement, wingDepth: number): WingWidthVerdict {
    let narrowest: WingWidthReading | null = null;
    for (const w of placement.wings(solved.scale)) {
        const r = measureWing(placement.frame, w, solved.ring, wingDepth);
        if (r === null) continue;
        if (narrowest === null || r.minWidthM < narrowest.minWidthM) narrowest = r;
    }
    return {
        narrowestM: narrowest === null ? null : narrowest.minWidthM,
        narrowest,
        sliver: narrowest !== null && narrowest.minWidthM < MIN_WING_M,
    };
}

/** Solve one placement's scale so the CLIPPED area hits `target`. `null` when it cannot. */
function solvePlacement(
    placement: Placement,
    buildable: readonly Pt[],
    target: number,
): SolvedPlacement | null {
    const tol = toleranceFor(target);
    const measure = (s: number): { ring: Pt[]; areaM2: number; templateAreaM2: number } | null => {
        const tpl = placement.build(s);
        const clipped = clipToBuildable(tpl, buildable);
        if (clipped === null) return null;
        return { ring: clipped, areaM2: ringAreaM2(clipped), templateAreaM2: ringAreaM2(tpl) };
    };

    // The scale is a fraction of the plot extent; 1.0 spans it. Never search above 1 — a template
    // larger than the plot adds nothing once clipped, and searching there hides "does not fit".
    const top = measure(1);
    if (top === null || top.areaM2 < target - tol) return null;

    let lo = 0;
    let hi = 1;
    let best: SolvedPlacement | null = null;
    for (let i = 0; i < MAX_BISECTION_STEPS; i++) {
        const mid = (lo + hi) / 2;
        const probe = measure(mid);
        if (probe === null) {
            // A degenerate/multi-region clip at this scale — push the bracket up rather than
            // treating it as "too small", which would be a different fact.
            lo = mid;
            if (hi - lo < 1e-5) break;
            continue;
        }
        if (Math.abs(probe.areaM2 - target) <= tol) {
            best = { label: placement.label, ...probe, scale: mid };
            break;
        }
        if (probe.areaM2 < target) {
            lo = mid;
        } else {
            hi = mid;
            best = { label: placement.label, ...probe, scale: mid };
        }
        if (hi - lo < 1e-5) break;
    }
    return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE FAÇADE PROBES — one sampling, shared by every siting axis, so the axes cannot disagree
// about which façade they are describing.
// ─────────────────────────────────────────────────────────────────────────────

interface FacadeSample {
    readonly x: number;
    readonly z: number;
    /** Outward unit normal, scene XZ. */
    readonly nx: number;
    readonly nz: number;
    /** The perimeter length this sample stands for — every axis is LENGTH-WEIGHTED, not per-sample. */
    readonly lenM: number;
}

/**
 * Sample the ring's perimeter. The outward-normal formula is `boundaryProjection.classifyEdges`'s,
 * verbatim — `(ez, −ex) · sign(signedArea)` — so "which way does this façade face" has exactly one
 * answer in this repo (C84 EI-8a: one wording for one fact).
 */
function sampleFacade(ring: readonly Pt[]): FacadeSample[] {
    const sign = signedAreaXZ(ring) >= 0 ? 1 : -1;
    const out: FacadeSample[] = [];
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        const ex = q.x - p.x;
        const ez = q.z - p.z;
        const len = Math.hypot(ex, ez);
        if (len < 0.05) continue;
        const nx = (ez / len) * sign;
        const nz = (-ex / len) * sign;
        const n = Math.max(1, Math.ceil(len / FACADE_SAMPLE_SPACING_M));
        for (let k = 0; k < n; k++) {
            const t = (k + 0.5) / n;
            out.push({ x: p.x + ex * t, z: p.z + ez * t, nx, nz, lenM: len / n });
        }
    }
    return out;
}

function totalLength(samples: readonly FacadeSample[]): number {
    let s = 0;
    for (const f of samples) s += f.lenM;
    return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE SCORING AXES. Every one returns `null` rather than 0 when its input is absent.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SOUTH-FACING FAÇADE. In the scene frame `z = −North` (`boundaryProjection.latLonToSceneXZ`),
 * so due south is `+z`. Length-weighted share of the perimeter whose outward normal is within
 * ±45° of it. Pure geometry — no data source can be missing, so this axis is never `null`.
 */
function southFacadeFraction(samples: readonly FacadeSample[]): number {
    const total = totalLength(samples);
    if (total <= 0) return 0;
    const cosLimit = Math.cos((SOUTH_ARC_HALF_DEG * Math.PI) / 180);
    let south = 0;
    for (const f of samples) if (f.nz >= cosLimit) south += f.lenM;
    return south / total;
}

/**
 * ⭐ REAL SUN. `computeSunIntensitiesForProbes` is THE pure sun-hours raycast this repo runs for the
 * ground heatmaps and the façade study; it is called here with the SAME occluder shape and the same
 * frame convention. The result at index i is the fraction of above-horizon sun samples that reach
 * probe i unobstructed, so the length-weighted mean is a real lit-hour fraction, not a proxy.
 *
 * FRAME: probes and occluders are in site-ENU (`x = east`, `z = north`, per `toPrisms`), while this
 * module works in scene XZ (`x = east`, `z = −north`). Hence the `−z` on every north ordinate. A
 * sign error here would rotate the whole site 180° and silently swap north for south, which is why
 * it is written once, at this one boundary.
 */
function sunFacadeFraction(
    samples: readonly FacadeSample[],
    siting: MassingSitingContext | null,
): { value: number; probes: number; occluders: number } | null {
    if (siting === null || siting.latDeg === null || siting.lngDeg === null) return null;
    if (samples.length === 0) return null;
    const occluders: MetricFootprint[] = [];
    for (const n of siting.neighbours) {
        if (n.heightM === null || !(n.heightM > 0) || n.ring.length < 3) continue;
        occluders.push({ ring: n.ring.map((p) => ({ x: p.x, z: -p.z })), heightM: n.heightM });
    }
    const probes: SunProbe[] = samples.map((f) => ({
        east: f.x,
        north: -f.z,
        up: FACADE_PROBE_HEIGHT_M,
        normE: f.nx,
        normN: -f.nz,
    }));
    const intensities = computeSunIntensitiesForProbes(probes, occluders, {
        latDeg: siting.latDeg,
        lngDeg: siting.lngDeg,
        // EQUINOX, deliberately: the solstices are the extremes and flatter the answer in opposite
        // directions. The equinox is the day a designer compares schemes on.
        sunDay: 'equinox',
        stepMinutes: SUN_STEP_MINUTES,
    });
    const total = totalLength(samples);
    if (total <= 0) return null;
    let acc = 0;
    for (let i = 0; i < samples.length; i++) acc += (intensities[i] ?? 0) * samples[i]!.lenM;
    return { value: acc / total, probes: probes.length, occluders: occluders.length };
}

/** Neighbours tall enough to overlook, with a KNOWN height. */
function overlookers(siting: MassingSitingContext | null): MassingNeighbour[] {
    if (siting === null) return [];
    return siting.neighbours.filter(
        (n) => n.heightM !== null && n.heightM >= OVERLOOK_MIN_HEIGHT_M && n.ring.length >= 3,
    );
}

/**
 * OVERLOOKING — the founder's *"visibility from surrounding buildings"*. Length-weighted share of
 * the façade that has at least one real, height-known neighbour IN FRONT of it (outward hemisphere)
 * within 25 m.
 *
 * ⛔ `null` when no neighbour footprints were ever captured. NOT 0 — "nobody can see in" and "we
 * never looked" are the two readings §CONTEXT-DATA-HONESTY exists to keep apart.
 */
function overlookedFraction(
    samples: readonly FacadeSample[],
    siting: MassingSitingContext | null,
): number | null {
    if (siting === null || !siting.neighbourSnapshotTaken) return null;
    const nbrs = overlookers(siting).map((n) => sampleNeighbourBoundary(n.ring));
    const total = totalLength(samples);
    if (total <= 0) return null;
    let seen = 0;
    for (const f of samples) {
        let overlooked = false;
        for (const pts of nbrs) {
            // In FRONT of this façade, within range: tested against BOUNDARY SAMPLES, not vertices
            // — see `NEIGHBOUR_SAMPLE_SPACING_M` for the wall this distinction was found on.
            for (const v of pts) {
                const dx = v.x - f.x;
                const dz = v.z - f.z;
                const d = Math.hypot(dx, dz);
                if (d > OVERLOOK_RADIUS_M || d < 1e-6) continue;
                if ((dx * f.nx + dz * f.nz) / d > 0) { overlooked = true; break; }
            }
            if (overlooked) break;
        }
        if (overlooked) seen += f.lenM;
    }
    return seen / total;
}

/**
 * OPEN OUTLOOK — the share of the outward 180° arc, averaged over the façade, that is clear of
 * buildings within 60 m.
 *
 * ⛔ THIS IS NOT A SEA VIEW. STR §25.3 asks for *"orientation to sea view or open view"*; this
 * measures the BUILDING half only, because no coastline geometry reaches any score in this repo
 * (`contextWater.buildSeaMaskFromCoastline` is consumed by the renderers alone). Every candidate
 * carrying this axis also carries `sea-view-not-scored`.
 */
function openOutlookFraction(
    samples: readonly FacadeSample[],
    siting: MassingSitingContext | null,
): number | null {
    if (siting === null || !siting.neighbourSnapshotTaken) return null;
    const pts: Pt[] = [];
    for (const n of siting.neighbours) {
        if (n.ring.length >= 3) pts.push(...sampleNeighbourBoundary(n.ring));
    }
    const total = totalLength(samples);
    if (total <= 0) return null;
    const steps = Math.round(180 / VIEW_ARC_STEP_DEG);
    const sliceCos = Math.cos((VIEW_ARC_STEP_DEG * Math.PI) / 360);
    let acc = 0;
    for (const f of samples) {
        const base = Math.atan2(f.nz, f.nx);
        let clear = 0;
        for (let k = 0; k < steps; k++) {
            const ang = base - Math.PI / 2 + ((k + 0.5) * Math.PI) / steps;
            const dx = Math.cos(ang);
            const dz = Math.sin(ang);
            let blocked = false;
            for (const v of pts) {
                const vx = v.x - f.x;
                const vz = v.z - f.z;
                const d = Math.hypot(vx, vz);
                if (d > VIEW_RADIUS_M || d < 1e-6) continue;
                if ((vx * dx + vz * dz) / d > sliceCos) { blocked = true; break; }
            }
            if (!blocked) clear++;
        }
        acc += (clear / steps) * f.lenM;
    }
    return acc / total;
}

/** The `'front'` edges of the buildable ring, with their outward normals. */
interface FrontEdge { readonly a: Pt; readonly b: Pt; readonly nx: number; readonly nz: number; }

function frontEdgesOf(ring: readonly Pt[]): FrontEdge[] {
    let cls: ParcelEdgeClassification[];
    try {
        cls = classifyEdges(ring);
    } catch {
        return [];
    }
    const sign = signedAreaXZ(ring) >= 0 ? 1 : -1;
    const out: FrontEdge[] = [];
    for (let i = 0; i < ring.length; i++) {
        if (cls[i] !== 'front') continue;
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const ex = b.x - a.x;
        const ez = b.z - a.z;
        const len = Math.hypot(ex, ez) || 1;
        out.push({ a, b, nx: (ez / len) * sign, nz: (-ex / len) * sign });
    }
    return out;
}

/** Façade metres that address a `'front'` edge — the entrance-from-the-street criterion. */
function streetFrontageM(samples: readonly FacadeSample[], fronts: readonly FrontEdge[]): number | null {
    if (fronts.length === 0) return null;
    let m = 0;
    for (const f of samples) {
        for (const e of fronts) {
            if (distPointSeg(f.x, f.z, e.a.x, e.a.z, e.b.x, e.b.z) > ENTRANCE_BAND_M) continue;
            // The façade must LOOK at the street, not have its back to it.
            if (f.nx * e.nx + f.nz * e.nz > 0) { m += f.lenM; break; }
        }
    }
    return m;
}

/**
 * FORECOURT — open ground between the building and the street, in m².
 *
 * `area(buildable ∩ band) − area(option ∩ band)`, where the band is the 12 m strip inside the front
 * boundary. ⭐ BOTH TERMS ARE INTERSECTIONS, deliberately: `@pryzm/geometry-kernel` ships union and
 * intersection and states that DIFFERENCE is not oracle-pinned, so this is expressed with the two
 * operations that are. An unproven boolean silently corrupts every consumer downstream of it.
 */
function forecourtM2(
    optionRing: readonly Pt[],
    buildable: readonly Pt[],
    fronts: readonly FrontEdge[],
): number | null {
    if (fronts.length === 0) return null;
    // One band per front edge, unioned by taking the max — a plot with two frontages gets the
    // better of the two rather than a double count.
    let best: number | null = null;
    for (const e of fronts) {
        const ex = e.b.x - e.a.x;
        const ez = e.b.z - e.a.z;
        const len = Math.hypot(ex, ez);
        if (len < 0.5) continue;
        const ux = ex / len;
        const uz = ez / len;
        // A generous quad: the edge extended well past both ends, swept FORECOURT_BAND_M inward
        // (i.e. against the outward normal). Clipping against the buildable ring bounds it.
        const pad = 500;
        const inX = -e.nx * FORECOURT_BAND_M;
        const inZ = -e.nz * FORECOURT_BAND_M;
        const p0 = { x: e.a.x - ux * pad + e.nx * 1, z: e.a.z - uz * pad + e.nz * 1 };
        const p1 = { x: e.b.x + ux * pad + e.nx * 1, z: e.b.z + uz * pad + e.nz * 1 };
        const band: Pt[] = [p0, p1, { x: p1.x + inX, z: p1.z + inZ }, { x: p0.x + inX, z: p0.z + inZ }];
        const bandBuildable = clipToBuildable(band, buildable);
        if (bandBuildable === null) continue;
        const bandOption = clipToBuildable(band, optionRing);
        const open = ringAreaM2(bandBuildable) - (bandOption === null ? 0 : ringAreaM2(bandOption));
        const v = Math.max(0, open);
        if (best === null || v > best) best = v;
    }
    return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE ENUMERATOR
// ─────────────────────────────────────────────────────────────────────────────

function refusal(
    family: MassingShapeFamily,
    reason: MassingShapeRefusalReason,
    text: string,
): MassingShapeOutcome {
    return { ok: false, family, reason, text };
}

/**
 * THE shape enumerator. Pure; total; deterministic; never throws.
 *
 * One outcome per family, IN A FIXED ORDER — a refused family is RETURNED refused, never dropped,
 * because shipping three families where four were asked for makes an absence read as a design
 * decision (C58 §1.13: a refusal is a positive answer).
 */
export function enumerateMassingShapes(inputs: MassingShapeInputs): readonly MassingShapeOutcome[] {
    const span = _tracer.startSpan('pryzm.site.enumerateMassingShapes');
    try {
        const buildable = inputs.buildableRing;
        const buildableArea = Number.isFinite(inputs.buildableAreaM2) ? inputs.buildableAreaM2 : 0;

        if (buildable.length < 3 || !(buildableArea > 0)) {
            span.setAttribute('pryzm.massingShape.refusal', 'no-buildable-footprint');
            return MASSING_SHAPE_FAMILIES.map((f) =>
                refusal(f, 'no-buildable-footprint',
                    'PRYZM has not solved a buildable footprint for this parcel, so there is nothing to '
                    + 'place a shape inside. A shape needs an outline to be a shape within.'),
            );
        }

        const rawTarget = inputs.targetAreaM2;
        const hasTarget = rawTarget !== null && Number.isFinite(rawTarget) && rawTarget > 0;
        if (!hasTarget && inputs.whenNoTarget !== 'largest-fit') {
            span.setAttribute('pryzm.massingShape.refusal', 'no-target-area');
            return MASSING_SHAPE_FAMILIES.map((f) =>
                refusal(f, 'no-target-area',
                    `Type a target ground-floor area first — a shape needs an area to be a shape OF. The `
                    + `permitted buildable footprint here is ${buildableArea.toFixed(0)} m²; the founder's `
                    + `own worked example is 180 m² brut on the ground floor.`),
            );
        }
        // ⭐ §LARGEST-FIT — `null` from here on MEANS "size each family to its largest fit".
        const target: number | null = hasTarget ? rawTarget : null;
        span.setAttribute('pryzm.massingShape.sizedBy', target === null ? 'largest-fit' : 'target');
        const tol = target === null ? 0 : toleranceFor(target);
        if (target !== null && target > buildableArea + tol) {
            span.setAttribute('pryzm.massingShape.refusal', 'target-exceeds-buildable');
            return MASSING_SHAPE_FAMILIES.map((f) =>
                refusal(f, 'target-exceeds-buildable',
                    `You asked for ${target.toFixed(0)} m² on the ground floor. The permitted buildable `
                    + `footprint on this parcel is ${buildableArea.toFixed(0)} m² — `
                    + `${(target - buildableArea).toFixed(0)} m² less than you asked for. PRYZM will not `
                    + `propose a shape that exceeds it.`),
            );
        }

        const wingDepth = Number.isFinite(inputs.wingDepthM) && (inputs.wingDepthM as number) > 0
            ? (inputs.wingDepthM as number)
            : DEFAULT_WING_DEPTH_M;

        const dirs = dominantDirections(buildable);
        const primary = dirs[0]?.dir ?? { x: 1, z: 0 };
        const perp: Vec = { x: -primary.z, z: primary.x };
        const centroidX = buildable.reduce((s, p) => s + p.x, 0) / buildable.length;
        const centroidZ = buildable.reduce((s, p) => s + p.z, 0) / buildable.length;
        const origin: Pt = { x: centroidX, z: centroidZ };

        const plotFrame: Frame = { origin, u: primary, w: perp, label: 'aligned to the plot' };
        // A compass frame so *"south facing oriented"* can be satisfied by construction and not only
        // by luck: u = due east, w = due south (scene +z, because z = −North).
        const compassFrame: Frame = { origin, u: { x: 1, z: 0 }, w: { x: 0, z: 1 }, label: 'aligned to the compass' };

        // The plot's SECOND dominant direction — the one a non-orthogonal L is built on. It must be
        // far enough from perpendicular to the first, or the family is refused rather than invented.
        let nonOrthoFrame: Frame | null = null;
        for (let i = 1; i < dirs.length; i++) {
            const d = dirs[i]!.dir;
            const cos = Math.abs(primary.x * d.x + primary.z * d.z);
            const angleFromPrimary = (Math.acos(Math.min(1, cos)) * 180) / Math.PI;
            const deviationFromPerp = Math.abs(90 - angleFromPrimary);
            if (deviationFromPerp >= NON_ORTHO_MIN_DEVIATION_DEG && angleFromPrimary > 15) {
                nonOrthoFrame = {
                    origin,
                    u: primary,
                    w: d,
                    label: `on the plot's own ${angleFromPrimary.toFixed(0)}° corner`,
                };
                break;
            }
        }

        const extentIn = (f: Frame): Extent | null => {
            const inv = frameInverse(f);
            if (inv === null) return null;
            let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
            for (const p of buildable) {
                const { a, b } = inv(p);
                if (a < aMin) aMin = a;
                if (a > aMax) aMax = a;
                if (b < bMin) bMin = b;
                if (b > bMax) bMax = b;
            }
            if (!Number.isFinite(aMin) || aMax - aMin < 1 || bMax - bMin < 1) return null;
            return { aMin, aMax, bMin, bMax };
        };

        const fronts = frontEdgesOf(buildable);
        const out: MassingShapeOutcome[] = [];

        for (const family of MASSING_SHAPE_FAMILIES) {
            if (family === 'ell-non-orthogonal' && nonOrthoFrame === null) {
                // ⭐ §NON-ORTHO-REFUSAL — the honest arm. See `MassingShapeRefusalReason`.
                out.push(refusal(family, 'no-non-orthogonal-frame',
                    `This outline has no second boundary direction more than ${NON_ORTHO_MIN_DEVIATION_DEG}° `
                    + `off perpendicular to its longest edge, so there is no non-orthogonal corner in the `
                    + `PLOT for a non-orthogonal L to follow. PRYZM will not invent an angle and present it `
                    + `as one the site made — on this outline, the L above is the L.`));
                continue;
            }

            const frames: Frame[] = family === 'ell-non-orthogonal'
                ? [nonOrthoFrame!]
                : [plotFrame, compassFrame];

            const placements: Placement[] = [];
            for (const f of frames) {
                const e = extentIn(f);
                if (e === null) continue;
                if (family === 'bar-i') placements.push(...barPlacements(f, e, wingDepth));
                else if (family === 'u-court') placements.push(...uPlacements(f, e, wingDepth));
                else placements.push(...ellPlacements(f, e, wingDepth));
            }

            if (placements.length === 0) {
                out.push(refusal(family, 'family-does-not-fit',
                    `PRYZM could not build a usable frame on this outline for the ${MASSING_SHAPE_LABEL[family]} `
                    + `family — its bounding extent collapses. The buildable footprint is `
                    + `${buildableArea.toFixed(0)} m².`));
                continue;
            }

            const solved: Array<{ placement: Placement; s: SolvedPlacement }> = [];
            for (const p of placements) {
                const s = target === null ? solveLargest(p, buildable) : solvePlacement(p, buildable, target);
                if (s !== null) solved.push({ placement: p, s });
            }
            if (solved.length === 0) {
                out.push(target === null
                    ? refusal(family, 'family-does-not-fit',
                        `No placement of the ${MASSING_SHAPE_LABEL[family]} family fits inside this `
                        + `${buildableArea.toFixed(0)} m² buildable footprint at a ${wingDepth.toFixed(1)} m wing `
                        + `depth — every one broke into disjoint pieces or vanished when clipped to the outline.`)
                    : refusal(family, 'family-cannot-reach-target',
                        `No placement of the ${MASSING_SHAPE_LABEL[family]} family reaches ${target.toFixed(0)} m² `
                        + `inside this ${buildableArea.toFixed(0)} m² buildable footprint at a ${wingDepth.toFixed(1)} m `
                        + `wing depth — every one either fell short or broke into disjoint pieces when clipped to the `
                        + `outline. Try a smaller ground-floor area, or a different shape.`));
                continue;
            }

            // ⛔ §NOT-A-RECTANGLE-WEARING-THE-LETTER — an L or U whose clipped ring has no re-entrant
            // corner IS a bar. Such placements are dropped here; if none of the family survives, the
            // family is refused by name rather than listed as a second copy of the bar.
            const mustBeReentrant = family !== 'bar-i';
            const shaped = mustBeReentrant ? solved.filter((x) => hasReflexCorner(x.s.ring)) : solved;
            if (shaped.length === 0) {
                out.push(refusal(family, 'family-collapses-to-bar',
                    `Every ${MASSING_SHAPE_LABEL[family]} that ${target === null ? 'fits' : `reaches ${target.toFixed(0)} m²`} `
                    + `inside this ${buildableArea.toFixed(0)} m² outline clips to a plain bar — the outline leaves no `
                    + `room for a second wing at ${wingDepth.toFixed(1)} m depth. The I option already offers that `
                    + `ring; PRYZM will not list the same rectangle again under another letter.`));
                continue;
            }

            // ⛔ §WING-WIDTH-MEASURED — a placement that reached the area by leaving a wing thinner
            // than MIN_WING_M is NOT a candidate. It is measured on the clipped ring, excluded, and
            // COUNTED; when nothing survives the family is refused with the narrowest width printed.
            const judged = shaped.map((x) => ({ ...x, wings: judgeWings(x.placement, x.s, wingDepth) }));
            const usable = judged.filter((x) => !x.wings.sliver);
            const sliverCount = judged.length - usable.length;
            if (usable.length === 0) {
                let worst: WingWidthReading | null = null;
                for (const x of judged) {
                    const r = x.wings.narrowest;
                    if (r !== null && (worst === null || r.minWidthM < worst.minWidthM)) worst = r;
                }
                const where = worst === null
                    ? ''
                    : ` The narrowest is ${worst.minWidthM.toFixed(1)} m, on ${worst.wingLabel}, `
                      + `${worst.atM.toFixed(0)} m along it — below the ${MIN_WING_M} m minimum.`;
                out.push(refusal(family, 'family-wings-sliver',
                    `Every ${MASSING_SHAPE_LABEL[family]} that ${target === null ? 'fits' : `reaches ${target.toFixed(0)} m²`} `
                    + `inside this ${buildableArea.toFixed(0)} m² outline does so only by leaving a wing too thin to `
                    + `build where the outline cuts across it.${where} PRYZM will not ship a sliver and call it a `
                    + `wing: ${sliverCount} placement${sliverCount === 1 ? '' : 's'} refused. Try a different shape, `
                    + `or a smaller ground-floor area.`));
                continue;
            }

            // ⭐ RANKED BY THE CRITERION THE USER STATED, NOT BY A SCORE PRYZM INVENTED.
            // §25.3's worked instruction is *"ideally L shape – south facing oriented"*, so within a
            // family the placements are ordered by SOUTH-FACING FAÇADE — a measurement — and the
            // runner-up's figure is printed so the choice is legible rather than asserted. This is
            // NOT a ranking across families: `massingOptionModel`'s header explains why that one
            // stays the architect's.
            const ranked = usable
                .map((x) => ({ x, south: southFacadeFraction(sampleFacade(x.s.ring)) }))
                .sort((p, q) => (q.south - p.south) || (p.x.s.label < q.x.s.label ? -1 : 1));
            const winner = ranked[0]!;
            const runnerUp = ranked.length > 1 ? ranked[1]!.south : null;

            out.push({
                ok: true,
                candidate: buildCandidate({
                    family,
                    solved: winner.x.s,
                    southFraction: winner.south,
                    runnerUpSouthFraction: runnerUp,
                    placementsConsidered: usable.length,
                    sliverPlacementsExcluded: sliverCount,
                    narrowestWing: winner.x.wings.narrowest,
                    target,
                    buildableArea,
                    wingDepth,
                    buildable,
                    fronts,
                    siting: inputs.siting,
                }),
            });
        }

        span.setAttribute('pryzm.massingShape.count', out.length);
        span.setAttribute('pryzm.massingShape.refusedCount', out.filter((o) => !o.ok).length);
        return Object.freeze(out);
    } catch (err) {
        // TOTAL: a shape engine that throws inside a card render takes the whole envelope panel with
        // it. Every family comes back refused, naming the throw — an honest nothing, not a silence.
        span.setAttribute('pryzm.massingShape.threw', true);
        const detail = err instanceof Error ? err.message : String(err);
        return MASSING_SHAPE_FAMILIES.map((f) =>
            refusal(f, 'family-does-not-fit',
                `PRYZM's shape engine failed on this outline (${detail}). No shape is offered rather than `
                + `a shape nobody solved.`));
    } finally {
        span.end();
    }
}

function buildCandidate(args: {
    family: MassingShapeFamily;
    solved: SolvedPlacement;
    southFraction: number;
    runnerUpSouthFraction: number | null;
    placementsConsidered: number;
    sliverPlacementsExcluded: number;
    narrowestWing: WingWidthReading | null;
    target: number | null;
    buildableArea: number;
    wingDepth: number;
    buildable: readonly Pt[];
    fronts: readonly FrontEdge[];
    siting: MassingSitingContext | null;
}): MassingShapeCandidate {
    const { family, solved, target, wingDepth, buildable, fronts, siting } = args;
    const samples = sampleFacade(solved.ring);
    const perimeterM = totalLength(samples);
    const notes: MassingShapeNote[] = [];

    notes.push({
        code: 'wing-depth-assumed',
        severity: 'warning',
        text:
            `The wings are ${wingDepth.toFixed(1)} m deep. That is a STUDY ASSUMPTION PRYZM states, not a `
            + `dimension it read from a rule: it is the depth at which a room can be daylit from one side `
            + `and still leave circulation. Change it and every figure below changes with it.`,
    });

    if (target === null) {
        // ⭐ §LARGEST-FIT — both numbers, and the action that sizes it. Not a default.
        notes.push({
            code: 'sized-to-largest-fit',
            severity: 'warning',
            text:
                `No ground-floor area has been named, so this is the LARGEST ${MASSING_SHAPE_LABEL[family]} `
                + `that fits the ${args.buildableArea.toFixed(0)} m² permitted footprint at ${wingDepth.toFixed(1)} m `
                + `wings — ${solved.areaM2.toFixed(0)} m². It is this shape's ceiling, not a size PRYZM chose for `
                + `you. Type a ground-floor area in "Propose a ground floor" and generate again to size it.`,
        });
    }

    if (args.sliverPlacementsExcluded > 0) {
        notes.push({
            code: 'sliver-placements-excluded',
            severity: 'warning',
            text:
                `${args.sliverPlacementsExcluded} other placement${args.sliverPlacementsExcluded === 1 ? '' : 's'} `
                + `of this shape ${target === null ? 'fit' : 'reached the area'} only by leaving a wing thinner than `
                + `${MIN_WING_M} m where the outline cuts across it, and ${args.sliverPlacementsExcluded === 1 ? 'was' : 'were'} `
                + `excluded rather than offered. The one shown holds its width.`,
        });
    }

    const clipLoss = solved.templateAreaM2 > 0 ? 1 - solved.areaM2 / solved.templateAreaM2 : 0;
    if (clipLoss > 0.15) {
        notes.push({
            code: 'clipped-hard',
            severity: 'warning',
            text:
                `Fitting this shape inside the buildable outline removed ${(clipLoss * 100).toFixed(0)} % of `
                + `the template, so the built outline is only loosely the ${MASSING_SHAPE_LABEL[family]} it `
                + `started as. The ring drawn is what would be built; the family name describes where it came `
                + `from.`,
        });
    }

    // ── the axes ──
    const reasons: MassingShapeReason[] = [];

    reasons.push({
        key: 'south-facade',
        label: 'South-facing façade',
        normalised: args.southFraction,
        display: `${(args.southFraction * 100).toFixed(0)} % of ${perimeterM.toFixed(0)} m of façade`,
        meaning:
            `Share of the perimeter whose outward face lies within ±${SOUTH_ARC_HALF_DEG}° of due south, `
            + `measured in the site frame. This is the "south facing oriented" criterion as a number.`,
    });

    const sun = sunFacadeFraction(samples, siting);
    if (sun === null) {
        notes.push({
            code: 'sun-not-computed',
            severity: 'warning',
            text:
                'No site latitude/longitude reached the option engine, so PRYZM did NOT run the sun raycast '
                + 'for this shape. The sun figure is withheld rather than estimated — a daylight number '
                + 'divided out of a compass bearing would look exactly like one that was ray-traced.',
        });
    }
    reasons.push({
        key: 'sun-facade',
        label: 'Façade daylight (equinox)',
        normalised: sun === null ? null : sun.value,
        display: sun === null
            ? null
            : `${(sun.value * 100).toFixed(0)} % of equinox daylight reaches the façade `
              + `(${sun.probes} probes vs ${sun.occluders} neighbour ${sun.occluders === 1 ? 'building' : 'buildings'})`,
        meaning:
            'Mean fraction of above-horizon equinox sun that reaches the façade unobstructed, ray-traced '
            + 'against the real neighbouring buildings by the same engine that draws the site sun-hours map.',
    });

    const overlooked = overlookedFraction(samples, siting);
    const outlook = openOutlookFraction(samples, siting);
    if (siting === null || !siting.neighbourSnapshotTaken) {
        notes.push({
            code: 'no-neighbour-data',
            severity: 'warning',
            text:
                'No neighbouring-building footprints have been captured for this site, so overlooking and '
                + 'outlook are UNMEASURED — not zero, and not "clear". Open the 3-D Site or the 2-D map once '
                + 'so the context buildings load, then generate again.',
        });
    } else {
        const missing = siting.neighbours.filter((n) => n.heightM === null).length;
        if (missing > 0) {
            notes.push({
                code: 'neighbour-heights-missing',
                severity: 'warning',
                text:
                    `${missing} of ${siting.neighbours.length} neighbouring buildings carry no height, so they `
                    + `were EXCLUDED from the sun raycast and from the overlooking test rather than given an `
                    + `assumed height. The figures below describe the `
                    + `${siting.neighbours.length - missing} that do.`,
            });
        }
    }

    reasons.push({
        key: 'overlooking',
        label: 'Overlooked façade',
        normalised: overlooked,
        display: overlooked === null
            ? null
            : `${(overlooked * 100).toFixed(0)} % has a neighbour within ${OVERLOOK_RADIUS_M} m in front of it`,
        meaning:
            `Share of the façade with at least one real neighbouring building — of known height, at least `
            + `${OVERLOOK_MIN_HEIGHT_M} m tall — standing in front of it within ${OVERLOOK_RADIUS_M} m. `
            + `Lower means more private; PRYZM does not decide how much privacy this design needs.`,
    });

    reasons.push({
        key: 'open-outlook',
        label: 'Open outlook',
        normalised: outlook,
        display: outlook === null
            ? null
            : `${(outlook * 100).toFixed(0)} % of the outward view arc is clear within ${VIEW_RADIUS_M} m`,
        meaning:
            `Share of the outward 180° arc, averaged along the façade, with no building inside `
            + `${VIEW_RADIUS_M} m. Buildings only — see the sea-view caveat.`,
    });
    if (outlook !== null) {
        notes.push({
            code: 'sea-view-not-scored',
            severity: 'warning',
            text:
                'This is an outlook over BUILDINGS only. PRYZM holds coastline geometry but nothing joins it '
                + 'to scoring yet, so a SEA view specifically is not measured here and this figure must not '
                + 'be read as one.',
        });
    }

    const frontage = streetFrontageM(samples, fronts);
    if (fronts.length === 0) {
        notes.push({
            code: 'frontage-is-heuristic',
            severity: 'warning',
            text:
                'No boundary edge is classified as street frontage on this outline, so the entrance and '
                + 'forecourt figures are withheld. PRYZM classifies frontage by compass heuristic today; it '
                + 'has no join from road geometry to boundary edges.',
        });
    } else {
        notes.push({
            code: 'frontage-is-heuristic',
            severity: 'warning',
            text:
                `"Front" here is the ${fronts.length === 1 ? 'edge' : `${fronts.length} edges`} whose outward `
                + `face points most toward scene north — a COMPASS HEURISTIC, not a road. PRYZM fetches road `
                + `geometry but does not yet join it to boundary edges, so an entrance figure can be right `
                + `about the geometry and wrong about the street.`,
        });
    }
    reasons.push({
        key: 'street-frontage',
        label: 'Façade addressing the street',
        normalised: frontage === null || perimeterM <= 0 ? null : Math.min(1, frontage / perimeterM),
        display: frontage === null ? null : `${frontage.toFixed(0)} m of ${perimeterM.toFixed(0)} m`,
        meaning:
            `Façade metres within ${ENTRANCE_BAND_M} m of a front boundary edge AND facing it — where a front `
            + `door and the address can go.`,
    });

    const forecourt = forecourtM2(solved.ring, buildable, fronts);
    reasons.push({
        key: 'forecourt',
        label: 'Forecourt / parking',
        normalised: null,
        display: forecourt === null
            ? null
            : `${forecourt.toFixed(0)} m² between the building and the street `
              + `(≈ ${Math.floor(forecourt / PARKING_BAY_M2)} bays at ${PARKING_BAY_M2} m², aisle excluded)`,
        meaning:
            `Unbuilt buildable ground inside the ${FORECOURT_BAND_M} m strip behind the front boundary — the `
            + `land a car arrives across. Bays are 2.5 × 5.0 m and EXCLUDE the manoeuvring aisle, so the bay `
            + `count is an upper bound on a real layout.`,
    });

    // §WING-DEPTH-LADDER — two rungs, and the second one was DECLARED BUT NEVER WIRED. MIN_WING_M
    // carried the comment "below this the shape is a sliver and the family is refused outright" and
    // was then read by nothing, which `tsc` caught as TS6133 (declared but never read) — a promise in
    // a doc comment that the code did not keep. Deleting the constant would have silenced the compiler
    // by dropping the rule; wiring it keeps the rule and satisfies the compiler for the right reason.
    //
    // ⭐ §WING-WIDTH-MEASURED (L-13037) — the ladder now has a MEASURED rung. The ASSUMED depth is
    // judged here as before; the BUILT width (`narrowestWing`, measured on the clipped ring) is
    // judged below it. A placement whose built width fell under MIN_WING_M never reaches this
    // function — it was excluded in the enumerator — so the measured rung here can only be THIN.
    if (wingDepth < MIN_WING_M) {
        notes.push({
            code: 'wings-sliver',
            severity: 'error',
            text:
                `A ${wingDepth.toFixed(1)} m wing is below the ${MIN_WING_M} m minimum — this is a sliver, `
                + `not a buildable wing. The shape reaches the area asked for only on paper.`,
        });
    } else if (wingDepth < THIN_WING_M) {
        notes.push({
            code: 'wings-thin',
            severity: 'warning',
            text:
                `A ${wingDepth.toFixed(1)} m wing is shallower than a habitable room plus circulation. This `
                + `shape reaches the area asked for, but it would build as a corridor.`,
        });
    } else if (args.narrowestWing !== null && args.narrowestWing.minWidthM < THIN_WING_M) {
        notes.push({
            code: 'wings-thin',
            severity: 'warning',
            text:
                `Where the outline cuts across it, ${args.narrowestWing.wingLabel} narrows to `
                + `${args.narrowestWing.minWidthM.toFixed(1)} m (${args.narrowestWing.atM.toFixed(0)} m along it) — `
                + `above the ${MIN_WING_M} m minimum, but shallower than a habitable room plus circulation. `
                + `Measured on the built outline, not on the ${wingDepth.toFixed(1)} m template.`,
        });
    }

    const lead = sun !== null
        ? `${(sun.value * 100).toFixed(0)} % of equinox daylight reaches its façade`
        : `${(args.southFraction * 100).toFixed(0)} % of its façade faces south`;

    const sized = target === null
        ? `PRYZM solved the largest ${MASSING_SHAPE_LABEL[family]} that fits — a ${solved.areaM2.toFixed(0)} m² `
          + `footprint, no ground-floor area having been named — `
        : `PRYZM solved a ${solved.areaM2.toFixed(0)} m² footprint against your ${target.toFixed(0)} m² target, `;
    const statement =
        `${MASSING_SHAPE_MEANING[family]} `
        + sized
        + `${solved.label}, with ${wingDepth.toFixed(1)} m wings. `
        + `Chosen from ${args.placementsConsidered} placement${args.placementsConsidered === 1 ? '' : 's'} of this `
        + `shape that fit`
        + (args.sliverPlacementsExcluded > 0
            ? ` (${args.sliverPlacementsExcluded} more excluded as slivers)`
            : '')
        + `, by south-facing façade`
        + (args.runnerUpSouthFraction === null
            ? ''
            : ` — ${(args.southFraction * 100).toFixed(0)} % against ${(args.runnerUpSouthFraction * 100).toFixed(0)} % `
              + `for the next best`)
        + `. On the numbers below, ${lead}. A STUDY of what fits, not a permit.`;

    return Object.freeze({
        family,
        label: MASSING_SHAPE_LABEL[family],
        ring: Object.freeze(solved.ring.map((p) => ({ x: p.x, z: p.z }))),
        areaM2: solved.areaM2,
        targetAreaM2: target,
        sizedBy: target === null ? 'largest-fit' as const : 'target' as const,
        narrowestWingM: args.narrowestWing === null ? null : args.narrowestWing.minWidthM,
        sliverPlacementsExcluded: args.sliverPlacementsExcluded,
        wingDepthM: wingDepth,
        placementLabel: solved.label,
        placementsConsidered: args.placementsConsidered,
        runnerUpSouthFraction: args.runnerUpSouthFraction,
        reasons: Object.freeze(reasons),
        notes: Object.freeze(notes),
        statement,
    });
}
