// L-537 — MEASURING the *amplada de vial* (street width) from cadastral block geometry.
//
// WHY THIS EXISTS
// ---------------
// PGM Art. 327.2 keys the *alçada reguladora* on the width of the street a façade fronts, and
// `bcnAlcadaReguladora.ts` turns a width into a height. Nothing produced the width except a
// hand-curated allow-list of ~26 Barcelona streets (`bcnOfficialStreetWidths.ts`), so every other
// street in the city resolved NO height and the massing path drew a 0.5 m footprint slab. Coverage
// was the defect. There is no national — and, as of the 2026-07-21 probe, no Barcelona —
// machine-readable declared-width dataset, so the width has to be CONSTRUCTED from authoritative
// geometry and cited as constructed. That is exactly the precedent ADR-0271 set for the
// *profunditat edificable*, which is likewise absent from the published record and derived from
// the block ring.
//
// WHAT IT MEASURES, AND WHY IT COSTS NO NETWORK
// ---------------------------------------------
// A street width is the FRONTAGE-TO-FRONTAGE distance: from our block's perimeter edge, across
// the carriageway, to the perimeter of the block opposite. The block route's existing bbox fetch
// (`BLOCK_BBOX_HALF_DEG = 0.002`, ~±220 m) already returns every parcel within ~444 m — which
// includes the blocks across every surrounding street. The opposing frontage is therefore ALREADY
// IN MEMORY; this module only does arithmetic on it. No new HTTP request (C12 §8), and one
// measurement per *manzana* is cached upstream, so it is O(1) per parcel after the first.
//
// WHY WE SHOOT AT RAW PARCEL RINGS AND NOT AT DISSOLVED OPPOSING BLOCKS
// ---------------------------------------------------------------------
// `dissolveParcelsToBlockRing` needs a conforming tiling and fails on most non-Barcelona blocks
// (`open-or-disjoint`; success BCN 2/2, Madrid 2/4, Córdoba 0/3 — SPAIN-CADASTRAL-DISSOLVE-PROBE).
// Requiring the OPPOSITE block to dissolve too would square that failure probability for no gain:
// the first thing a perpendicular ray meets across the street is a parcel boundary, and that
// boundary IS the opposing frontage whether or not its block dissolves. So we intersect against
// the raw foreign parcel rings. We still need OUR block's ring (it is the frontage line we measure
// from), so this remains downstream of the dissolve — no ring ⇒ no width ⇒ no height ⇒ the
// footprint slab, honestly. Fixing the dissolve is a separate, deliberately unattempted task.
//
// WHY MULTIPLE SAMPLES PER EDGE AND A SPREAD TEST
// -----------------------------------------------
// A single ray from an edge midpoint can hit a chamfered corner, a setback porch, a gap between
// two opposing parcels, or nothing at all. Sampling across the edge and taking the MEDIAN makes a
// stray hit harmless, and the SPREAD across samples is the measurement's own honest error bar: a
// tight spread means two parallel frontages (a real street of constant width), a wide spread means
// the opposing geometry is not parallel and the "width" is not a single number. We refuse the
// latter rather than average it, because the value feeds a banded height table where a metre is a
// storey. That spread is also what the quantisation step in `resolveAmpladaDeVial` is allowed to
// snap within — the tolerance is the measurement's own error, never a tuned constant.
//
// ⚠ WHAT THIS IS NOT. It is a MEASURED width, not the *ample oficial* (the declared figure in a
// municipal planning street database). Under C58 §1.4 it is `estimated`, and the caller must carry
// it that way — see `StreetWidthProvenance` in `bcnOfficialStreetWidths.ts` for the tier order.
// L-459 is what happens when a constructed number is presented like a surveyed one.
//
// REGIONAL SCOPE — DELIBERATELY NONE
// ----------------------------------
// Nothing in this module is Barcelona-specific: it takes rings and returns metres. A new region
// supplies (a) its own parcel/block source that can produce a block ring, (b) its own height table
// keyed on street width, and (c) optionally its own declared-width override list — none of which
// touch this file. Madrid (PGOUM-1997 *normas zonales*) and Córdoba are blocked on (a), not on
// this module.
//
// PURE + deterministic (C58 §1.1/§1.9). No I/O, no THREE, no DOM, no clock, no RNG.

import type { Pt } from '@pryzm/schemas';
import { pointInPolygon, pointSegmentDistance } from '@pryzm/site-validators';

/** Why one block edge yielded no usable width. Reported per-edge so a caller can say WHICH. */
export type StreetWidthRejection =
    /** The edge is shorter than `minEdgeLength_m` — a corner chamfer, not a frontage. */
    | 'edge-too-short'
    /** No foreign parcel within `maxSearch_m` across this edge — block face on open ground. */
    | 'no-opposing-frontage'
    /** A foreign parcel ABUTS this edge (< `minStreetWidth_m` away): no street here at all. */
    | 'abutting-not-street'
    /** Samples along the edge disagreed by more than `maxSpread_m` — not a constant-width street. */
    | 'inconsistent';

export interface StreetWidthMeasurement {
    /** Index of the block-ring edge measured — edge `i` spans vertex `i → i+1` (C19 §2.3). */
    readonly edgeIndex: number;
    /** Median frontage-to-frontage distance across the samples, metres. */
    readonly width_m: number;
    /**
     * Max − min across the samples, metres. THE ERROR BAR — the caller must not treat `width_m` as
     * tighter than this, and the quantiser may only snap within it.
     */
    readonly spread_m: number;
    /** How many rays actually found an opposing frontage (≥ 2 for a reported measurement). */
    readonly sampleCount: number;
    readonly edgeLength_m: number;
}

export interface RejectedEdge {
    readonly edgeIndex: number;
    readonly reason: StreetWidthRejection;
    readonly edgeLength_m: number;
}

export interface MeasureStreetWidthsOptions {
    /**
     * How far to look across a street before giving up, metres. 80 m: wider than any Cerdà artery
     * (Passeig de Gràcia ~60 m) with margin, and short enough that a ray escaping through a gap
     * between two opposing parcels cannot claim a block two streets away as the frontage.
     */
    readonly maxSearch_m?: number;
    /**
     * Rays cast per edge, evenly spaced strictly INSIDE it (endpoints excluded — a corner vertex
     * looks down two streets at once). 5 gives a median that survives one bad hit either side.
     */
    readonly samplesPerEdge?: number;
    /**
     * Max acceptable max−min across an edge's samples, metres. 3.0 m: below the narrowest Art. 327
     * band (3 m) so a spread this large could never be silently absorbed by one band, and wide
     * enough to tolerate the porches and shallow setbacks real façade lines carry.
     */
    readonly maxSpread_m?: number;
    /** Edges shorter than this are chamfers/returns, not frontages, metres. */
    readonly minEdgeLength_m?: number;
    /**
     * Below this the "gap" is a party wall or a cadastral sliver between two abutting manzanas,
     * not a street, metres. 3 m is the bottom of the Art. 327.2 table's first band.
     */
    readonly minStreetWidth_m?: number;
}

export interface StreetWidthMeasurementResult {
    readonly measurements: ReadonlyArray<StreetWidthMeasurement>;
    readonly rejected: ReadonlyArray<RejectedEdge>;
}

const DEFAULT_MAX_SEARCH_M = 80;
const DEFAULT_SAMPLES_PER_EDGE = 5;
const DEFAULT_MAX_SPREAD_M = 3.0;
const DEFAULT_MIN_EDGE_LENGTH_M = 8;
const DEFAULT_MIN_STREET_WIDTH_M = 3;

/** Drop a trailing vertex repeating the first — rings arrive both closed and open. */
function openRing(ring: ReadonlyArray<Pt>): ReadonlyArray<Pt> {
    if (ring.length < 2) return ring;
    const a = ring[0]!;
    const b = ring[ring.length - 1]!;
    return Math.hypot(a.x - b.x, a.z - b.z) < 1e-9 ? ring.slice(0, -1) : ring;
}

/**
 * Nearest positive-t hit of the ray `origin + t·dir` (dir UNIT) against segment `a→b`, or
 * `Infinity`. Parallel rays are treated as a miss: a ray running along a frontage measures
 * nothing, and the perpendicular sample next to it will do the real work.
 */
function rayHitSegment(origin: Pt, dirX: number, dirZ: number, a: Pt, b: Pt): number {
    const sx = b.x - a.x;
    const sz = b.z - a.z;
    const denom = dirX * sz - dirZ * sx;
    if (Math.abs(denom) < 1e-12) return Infinity;
    const qx = a.x - origin.x;
    const qz = a.z - origin.z;
    const t = (qx * sz - qz * sx) / denom;
    const u = (qx * dirZ - qz * dirX) / denom;
    if (t <= 0 || u < 0 || u > 1) return Infinity;
    return t;
}

/** Median of a non-empty numeric array. Even counts take the LOWER middle so the result is always
 *  an observed sample, never a constructed average — same discipline as the block-ring dissolve. */
function median(sorted: ReadonlyArray<number>): number {
    return sorted[Math.floor((sorted.length - 1) / 2)]!;
}

/**
 * Measure the street width across each edge of a block ring.
 *
 * PURE + deterministic. Never throws. Returns per-edge measurements plus an explicit rejection
 * list, so a caller can report WHICH frontage could not be measured rather than a bare absence.
 *
 * @param blockRing      OUR block's dissolved outline, in a metric XZ frame.
 * @param opposingRings  Parcel rings NOT belonging to this block, same frame. Rings of our own
 *   block must be excluded by the caller — a ray that hits our own parcels measures nothing.
 */
export function measureStreetWidths(
    blockRing: ReadonlyArray<Pt>,
    opposingRings: ReadonlyArray<ReadonlyArray<Pt>>,
    options: MeasureStreetWidthsOptions = {},
): StreetWidthMeasurementResult {
    const maxSearch = options.maxSearch_m ?? DEFAULT_MAX_SEARCH_M;
    const samplesPerEdge = Math.max(1, options.samplesPerEdge ?? DEFAULT_SAMPLES_PER_EDGE);
    const maxSpread = options.maxSpread_m ?? DEFAULT_MAX_SPREAD_M;
    const minEdgeLength = options.minEdgeLength_m ?? DEFAULT_MIN_EDGE_LENGTH_M;
    const minStreetWidth = options.minStreetWidth_m ?? DEFAULT_MIN_STREET_WIDTH_M;

    const ring = openRing(blockRing);
    const measurements: StreetWidthMeasurement[] = [];
    const rejected: RejectedEdge[] = [];
    if (ring.length < 3) return { measurements, rejected };

    // Pre-open the opposing rings once rather than per ray — this loop is O(edges × samples ×
    // segments) and the bbox routinely carries 200–500 parcels.
    const targets = opposingRings.map(openRing).filter((r) => r.length >= 2);

    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const ex = b.x - a.x;
        const ez = b.z - a.z;
        const len = Math.hypot(ex, ez);
        if (len < minEdgeLength) {
            rejected.push({ edgeIndex: i, reason: 'edge-too-short', edgeLength_m: len });
            continue;
        }

        // Outward normal, determined EMPIRICALLY rather than from a winding assumption: step a
        // little off the midpoint each way and keep the direction that leaves the polygon. Winding
        // is normalised by the dissolve today, but a silent winding flip upstream would otherwise
        // turn every measurement into a diagonal across our own block — a wrong number, which is
        // the one outcome this path must never produce.
        let nx = ez / len;
        let nz = -ex / len;
        const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
        const probe = { x: mid.x + nx * 0.05, z: mid.z + nz * 0.05 };
        if (pointInPolygon(probe, ring)) {
            nx = -nx;
            nz = -nz;
        }

        const hits: number[] = [];
        let abutting = false;
        for (let s = 0; s < samplesPerEdge; s++) {
            // Strictly interior parameters: (s+1)/(n+1) ∈ (0,1). Endpoints are corners.
            const f = (s + 1) / (samplesPerEdge + 1);
            const o = { x: a.x + ex * f, z: a.z + ez * f };
            let best = Infinity;
            for (const t of targets) {
                for (let j = 0; j < t.length; j++) {
                    const p = t[j]!;
                    const q = t[(j + 1) % t.length]!;
                    const d = rayHitSegment(o, nx, nz, p, q);
                    if (d < best) best = d;
                }
            }
            if (!Number.isFinite(best) || best > maxSearch) continue;
            if (best < minStreetWidth) {
                abutting = true;
                break;
            }
            hits.push(best);
        }

        if (abutting) {
            rejected.push({ edgeIndex: i, reason: 'abutting-not-street', edgeLength_m: len });
            continue;
        }
        // One lone hit is indistinguishable from a stray ray through a gap, so it cannot support a
        // spread test and is refused rather than reported without an error bar.
        if (hits.length < 2) {
            rejected.push({ edgeIndex: i, reason: 'no-opposing-frontage', edgeLength_m: len });
            continue;
        }
        const sorted = [...hits].sort((x, y) => x - y);
        const spread = sorted[sorted.length - 1]! - sorted[0]!;
        if (spread > maxSpread) {
            rejected.push({ edgeIndex: i, reason: 'inconsistent', edgeLength_m: len });
            continue;
        }
        measurements.push({
            edgeIndex: i,
            width_m: median(sorted),
            spread_m: spread,
            sampleCount: sorted.length,
            edgeLength_m: len,
        });
    }

    return { measurements, rejected };
}

/**
 * Which block-ring edges does THIS parcel actually front?
 *
 * WHY IT MATTERS. A manzana has several frontages of possibly different widths, and a parcel is on
 * one or two of them. Taking the narrowest street around the WHOLE block would penalise a parcel
 * that fronts only the wide artery — a compliance number wrong in the safe direction is still
 * wrong, and it would under-build the most valuable parcels in the city.
 *
 * A parcel edge and the block edge it lies on are (near-)coincident, because the block ring was
 * dissolved FROM these parcels — the same fact §L-515-FIX already relies on to classify parcel
 * frontages. So proximity of the block edge to the parcel ring is an exact test here, not a
 * heuristic. Returns indices in ascending order; empty means we could not tell, and the caller
 * should fall back to the whole block rather than pick arbitrarily.
 *
 * PURE + deterministic.
 */
export function blockEdgesFacingParcel(
    blockRing: ReadonlyArray<Pt>,
    parcelRing: ReadonlyArray<Pt>,
    /** How close a block edge's sample points must come to the parcel outline, metres. 2 m
     *  mirrors the tolerance §L-515-FIX already uses for the same coincidence test. */
    maxDistance_m = 2,
): number[] {
    const block = openRing(blockRing);
    const parcel = openRing(parcelRing);
    if (block.length < 3 || parcel.length < 3) return [];

    const out: number[] = [];
    for (let i = 0; i < block.length; i++) {
        const a = block[i]!;
        const b = block[(i + 1) % block.length]!;
        // Sample along the block edge rather than only at its midpoint: a block edge is typically
        // longer than one parcel, so a parcel at its end would be missed by a midpoint test.
        let touches = false;
        for (let s = 1; s <= 9 && !touches; s++) {
            const f = s / 10;
            const p = { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
            for (let j = 0; j < parcel.length; j++) {
                const q = parcel[j]!;
                const r = parcel[(j + 1) % parcel.length]!;
                if (pointSegmentDistance(p, q, r) <= maxDistance_m) {
                    touches = true;
                    break;
                }
            }
        }
        if (touches) out.push(i);
    }
    return out;
}

/**
 * Pick the measurement governing a PARCEL, given which block edges its façade sits on.
 *
 * ⚠ THIS IS A CHOICE, AND A CORNER PARCEL IS WHY. Art. 327 resolves height per façade, so a corner
 * parcel between a 20 m and a 30 m street has two answers. We take the NARROWEST measured street,
 * because that is the conservative one: it yields the lower height, and on a compliance path the
 * error that costs a redesign is always preferable to the one that costs an illegal building. The
 * curated allow-list resolves corners differently (by postal address street) — that divergence is
 * deliberate and flagged for L-528, which needs the ordinance text on per-façade height.
 */
export function governingStreetWidth(
    result: StreetWidthMeasurementResult,
    edgeIndices?: ReadonlyArray<number>,
): StreetWidthMeasurement | null {
    const pool =
        edgeIndices && edgeIndices.length > 0
            ? result.measurements.filter((m) => edgeIndices.includes(m.edgeIndex))
            : result.measurements;
    if (pool.length === 0) return null;
    return pool.reduce((lo, m) => (m.width_m < lo.width_m ? m : lo));
}
