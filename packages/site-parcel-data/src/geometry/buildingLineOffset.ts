// DK-ENVELOPE-REALISM (§L-619, gap #6/#10) — BYGGELINJER (building lines) → PARCEL-EDGE matching.
//
// WHY THIS EXISTS
// ---------------
// A Danish lokalplan draws BYGGELINJER — building lines the façade must sit on/behind — as a
// SEPARATE geometry layer (Plandata WFS), not as front/rear/side numbers. A byggelinje is therefore
// a GEOMETRY CONSTRAINT, and its BINDING (which face of the building it governs — front/rear/side)
// is NOT published: a Copenhagen karré parcel's frontage may point any direction, so `front = north`
// is a fabrication. This module matches a building line to the parcel edge it constrains by GEOMETRY
// alone — direction (parallelism) + proximity — so the match is invariant to the parcel's orientation.
//
// ⚠ HONESTY (non-negotiable, the whole point). A `BuildingLineConstraint` carries `binding: 'unknown'`
// and `distanceM: null` — we NEVER invent a front/rear/side distance from "a byggelinje exists". When
// the line's GEOMETRY is held, measuring its perpendicular offset to a parcel edge is a geometric fact,
// not a fabrication; that measured offset is what this module returns. The DK resolver then decides,
// from the plan's own geometry, what the offset MEANS — it does not stamp a legal binding here.
//
// PURE (C58 §1.9) — no THREE, no DOM, no I/O, no RNG, no clock. Scene-XZ metres in, metres out.
// Deterministic (C58 §1.1). Never throws — a degenerate line/parcel yields `null`, not an exception.
//
// Strategic context — docs/04-reference/jurisdictions/dk/DENMARK-GAP-ROADMAP.md (#6 courtyard, #10
// byggelinjer), C58 §1.4/§1.11, ADR-0270 (GeometricRule union), ADR-0271 (block-derived depth).

import { trace } from '@opentelemetry/api';
import type { Pt, ParcelEdgeClassification } from '@pryzm/schemas';
import { EPSILON_ZERO, RECOMPUTE_IDENTITY_M } from '@pryzm/geometry-kernel';

const tracer = trace.getTracer('pryzm.zoning.dk');

/**
 * A byggelinje (building line) as an HONEST geometry constraint.
 *
 * ⚠ `binding` is a literal `'unknown'` and `distanceM` is `null` BY CONTRACT — the published dataset
 * states neither which face this line governs nor a legal distance. Fabricating either is the exact
 * §CONTEXT-DATA-HONESTY failure this type exists to prevent. The GEOMETRY is the fact; the meaning is
 * resolved downstream from the geometry, never asserted here.
 */
export interface BuildingLineConstraint {
    /** The line's vertices, scene-XZ metres (≥ 2 points — a polyline is allowed; its overall
     *  first→last direction is used for matching). */
    readonly geometry: readonly Pt[];
    /** ALWAYS `'unknown'` — the dataset does not publish which building face this line binds. */
    readonly binding: 'unknown';
    /** ALWAYS `null` — no legal front/rear/side distance is asserted (only the geometry is a fact). */
    readonly distanceM: null;
}

/** The result of matching one building line to the parcel edge it most plausibly constrains. */
export interface BuildingLineEdgeMatch {
    /** Index of the matched parcel edge (`edge i` = `parcelRing[i] → parcelRing[i+1]`). */
    readonly edgeIndex: number;
    /** Perpendicular distance (m) from that edge's supporting line to the building line — the MEASURED
     *  offset. A geometric fact, NOT a legal setback. */
    readonly offsetM: number;
    /** 0 = perpendicular, 1 = perfectly parallel. How parallel the line is to the matched edge. */
    readonly parallelism: number;
}

export interface MatchBuildingLineOptions {
    /**
     * Maximum angle (radians) between the building line and a parcel edge for the edge to be a
     * candidate. Default 20° — a byggelinje runs along a frontage, so a near-perpendicular edge is
     * never the one it governs. A line parallel to no edge (within this tolerance) matches nothing.
     */
    readonly maxAngleRad?: number;
}

const DEFAULT_MAX_ANGLE_RAD = (20 * Math.PI) / 180;

function sub(a: Pt, b: Pt): Pt {
    return { x: a.x - b.x, z: a.z - b.z };
}
function cross(a: Pt, b: Pt): number {
    return a.x * b.z - a.z * b.x;
}
function length(v: Pt): number {
    return Math.hypot(v.x, v.z);
}
/** Unit direction from `a` to `b`, or null when they are (near-)coincident. */
function unitDir(a: Pt, b: Pt): Pt | null {
    const v = sub(b, a);
    const len = length(v);
    if (len < EPSILON_ZERO) return null;
    return { x: v.x / len, z: v.z / len };
}
/** Average of a point set (representative point of a polyline). */
function centroidOf(pts: readonly Pt[]): Pt {
    let x = 0;
    let z = 0;
    for (const p of pts) {
        x += p.x;
        z += p.z;
    }
    return { x: x / pts.length, z: z / pts.length };
}

/**
 * Perpendicular distance from point `p` to the INFINITE line through `a` with unit direction `u`.
 * `|(p − a) × u|` — exact, winding-agnostic.
 */
function pointToLineDistance(p: Pt, a: Pt, u: Pt): number {
    return Math.abs(cross(sub(p, a), u));
}

/**
 * Match a building line to the parcel edge it most plausibly constrains — by GEOMETRY, never by an
 * assumed orientation (no `front = north`). The chosen edge is the most-parallel edge (within
 * `maxAngleRad`) that the line lies NEAREST to; ties on distance break toward greater parallelism.
 *
 * Returns `null` when the line or parcel is degenerate, or when NO edge is parallel enough — an
 * honest "this line governs no identifiable edge" rather than a forced, wrong match. PURE, never throws.
 *
 * P8 — emits `pryzm.zoning.dk.matchBuildingLineToParcelEdge` (default no-op tracer performs no I/O).
 */
export function matchBuildingLineToParcelEdge(
    parcelRing: readonly Pt[],
    line: readonly Pt[],
    opts: MatchBuildingLineOptions = {},
): BuildingLineEdgeMatch | null {
    const span = tracer.startSpan('pryzm.zoning.dk.matchBuildingLineToParcelEdge');
    try {
        if (parcelRing.length < 3 || line.length < 2) return null;
        const lineDir = unitDir(line[0]!, line[line.length - 1]!);
        if (!lineDir) return null;
        const lineMid = centroidOf(line);
        const maxAngle = opts.maxAngleRad ?? DEFAULT_MAX_ANGLE_RAD;
        const maxSin = Math.sin(maxAngle);

        let best: BuildingLineEdgeMatch | null = null;
        for (let i = 0; i < parcelRing.length; i++) {
            const a = parcelRing[i]!;
            const b = parcelRing[(i + 1) % parcelRing.length]!;
            const edgeDir = unitDir(a, b);
            if (!edgeDir) continue; // zero-length edge — skip
            // |sin θ| between the two unit directions; 0 ⇒ parallel.
            const sinTheta = Math.abs(cross(edgeDir, lineDir));
            if (sinTheta > maxSin) continue; // too oblique to be the edge this line governs
            const dist = pointToLineDistance(lineMid, a, edgeDir);
            const parallelism = 1 - sinTheta;
            // Two candidate offsets that agree to within float path noise (metres) are THE SAME
            // distance — the tie then breaks toward parallelism. Kernel role, not a private eps.
            if (
                best === null ||
                dist < best.offsetM - RECOMPUTE_IDENTITY_M ||
                (Math.abs(dist - best.offsetM) <= RECOMPUTE_IDENTITY_M && parallelism > best.parallelism)
            ) {
                best = { edgeIndex: i, offsetM: dist, parallelism };
            }
        }
        span.setAttribute('matched', best !== null);
        if (best) {
            span.setAttribute('edgeIndex', best.edgeIndex);
            span.setAttribute('offsetM', best.offsetM);
        }
        return best;
    } finally {
        span.end();
    }
}

/**
 * The inward unit normal of parcel edge `edgeIndex` (points INTO the parcel). Winding-agnostic: both
 * candidate normals are tested against the parcel centroid and the interior-pointing one wins.
 *
 * Exported for the DK resolver, which projects building lines onto this normal to recover the
 * façade-offset and the buildable depth. Returns `null` on a degenerate edge/parcel. PURE.
 */
export function inwardEdgeNormal(parcelRing: readonly Pt[], edgeIndex: number): Pt | null {
    if (parcelRing.length < 3) return null;
    const a = parcelRing[edgeIndex % parcelRing.length]!;
    const b = parcelRing[(edgeIndex + 1) % parcelRing.length]!;
    const dir = unitDir(a, b);
    if (!dir) return null;
    const n = { x: -dir.z, z: dir.x };
    const c = centroidOf(parcelRing);
    const toInterior = sub(c, a);
    return n.x * toInterior.x + n.z * toInterior.z >= 0 ? n : { x: -n.x, z: -n.z };
}

/**
 * Signed depth of a point along an edge's inward normal (0 on the edge line, positive INTO the parcel).
 * The primitive the DK resolver uses to locate byggelinjer as a façade line vs a rear/courtyard line.
 * PURE.
 */
export function signedDepthAlongNormal(p: Pt, edgeA: Pt, inwardNormal: Pt): number {
    return sub(p, edgeA).x * inwardNormal.x + sub(p, edgeA).z * inwardNormal.z;
}

/**
 * Is the building `line` roughly PARALLEL to parcel edge `edgeIndex` (within `maxAngleRad`)? The DK
 * resolver keeps only frontage-parallel lines when recovering the buildable DEPTH (a line crossing the
 * frontage is not a façade/rear line). PURE.
 */
export function lineParallelToEdge(
    parcelRing: readonly Pt[],
    edgeIndex: number,
    line: readonly Pt[],
    maxAngleRad = DEFAULT_MAX_ANGLE_RAD,
): boolean {
    if (parcelRing.length < 3 || line.length < 2) return false;
    const edgeDir = unitDir(parcelRing[edgeIndex % parcelRing.length]!, parcelRing[(edgeIndex + 1) % parcelRing.length]!);
    const lineDir = unitDir(line[0]!, line[line.length - 1]!);
    if (!edgeDir || !lineDir) return false;
    return Math.abs(cross(edgeDir, lineDir)) <= Math.sin(maxAngleRad);
}

/** Pick the first parcel edge classified `front`, or `null`. A tiny shared helper so the resolver and
 *  the matcher agree on "which edge is the frontage" when the classification is present. PURE. */
export function firstFrontEdgeIndex(
    edgeClassifications: readonly ParcelEdgeClassification[],
): number | null {
    const i = edgeClassifications.findIndex((c) => c === 'front');
    return i >= 0 ? i : null;
}
