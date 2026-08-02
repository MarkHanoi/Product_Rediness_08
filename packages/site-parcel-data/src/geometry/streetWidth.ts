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
// `dissolveParcelsToBlockRing` needs a conforming tiling, and its failure mode is `open-or-disjoint`.
//
// ⚠⚠ THE RATES QUOTED HERE WERE A THREE-BLOCK SAMPLE AND ONE OF THEM WAS WRONG BY 77 POINTS.
// This line read "success BCN 2/2, Madrid 2/4, **Córdoba 0/3** — SPAIN-CADASTRAL-DISSOLVE-PROBE",
// and that 0/3 was carried into `CLOSURE-REGISTER.md` blocker 20 as a ceiling that "can make the
// ≈31 % envelope unrealisable". **Re-measured 2026-08-01 at scale, in BOTH lineages
// (`tools/cordoba-dissolve-probe/`), Córdoba dissolves:**
//     CATASTRO INSPIRE (the lineage the production parcel path fetches) — **20/26 = 76.9 %**,
//         0 transport failures, all 6 failures `open-or-disjoint`.
//     COACo `vcatastro_urbanismo` (the publisher's own copy) — **354/400 = 88.5 %**
//         (Manzana Cerrada 88.5 % · Colonia Tradicional Popular 83.7 % · Ordenación Abierta 96.9 %).
// Two independent digitisation lineages agree that Córdoba's fabric dissolves for roughly three
// blocks in four. **The 0/3 was a three-sample accident, not a property of the city**, and no
// Córdoba envelope ceiling may be justified by it. ⚠ n=3 is not a rate; if a number like this is
// load-bearing anywhere, re-measure it before you build a ceiling on it.
//
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

/**
 * §AMPLADA-ART-238 (L-591) — THE ORDINANCE SAYS **MINIMUM**, AND WE WERE RETURNING THE MEDIAN.
 *
 * PGM **Art. 238.1** defines *amplada de vial* — the parameter that selects the height band in
 * Art. 327 (13a), Art. 328 (13b), Art. 342.5 (20a) and Art. 350.c (22a) — in three parts:
 *
 *   **a.** If the *alineacions de vialitat* are parallel with a **constant** distance along a whole
 *          stretch between two cross-streets, that distance IS the amplada de vial.
 *   **b.** If they are not parallel, or show *"eixamplaments, estrenyiments i altres irregularitats"*,
 *          take **for each SIDE of a segment between two cross-streets the MINIMUM *amplada
 *          puntual*** on that side and segment.
 *   **c.** *"S'entén per amplada puntual de vial per a un punt d'una alineació de vialitat **la menor
 *          de les distàncies** entre aquest punt i els punts de l'alineació oposada del mateix
 *          vial."*
 *
 * ⚠ **WHY THE MEDIAN WAS THE WRONG STATISTIC, AND WHY IT WAS WRONG IN THE DANGEROUS DIRECTION.**
 * The median was chosen so a single stray ray — into a chamfered corner, a porch, a gap between two
 * opposing parcels — could not move the answer. Sound instinct, wrong quantity: `median ≥ min`, so we
 * reported a **wider** street than Art. 238 prescribes, selected a **higher** band, and **over-stated
 * permitted height**. That is the direction C58 §1.4 forbids, and the same class as the L-586
 * over-statement. An edge is accepted while its spread is ≤ `maxSpread_m` (3.0 m), so the median
 * could sit over a metre above the minimum — comfortably enough to cross the 8, 11, 15 or 20 m band
 * edges and grant a storey the ordinance does not.
 *
 * ⚠ **AND THE ROBUSTNESS CONCERN DOES NOT SURVIVE INSPECTION.** Taking the minimum of NOISY samples
 * is not the same as the minimum of the TRUE geometry, so in principle one spuriously short ray
 * could now dominate. In practice it cannot do harm: the spread gate already REFUSES any edge whose
 * samples disagree by more than 3 m, so every surviving edge is one where min and median differ by
 * little — and where they do differ, the minimum is both the ordinance's answer and the
 * conservative one. **We would rather under-state a height than over-state it.**
 *
 * ⚠ **AND THE ROBUSTNESS CONCERN IS PINNED, NOT ONLY ARGUED.** `ampladaArt238Minimum.test.ts` holds
 * the honest failure mode as an executable fixture: a 2,5 m deep setback niche that one ray enters
 * becomes the width, turning a 20 m street into 17,5 m. Art. 238.1.c genuinely says *"la menor de
 * les distàncies"*, but our five sample points are arbitrary places on a cadastral edge rather than
 * the ordinance's continuous infimum over a *tram*, so a niche we happen to hit is over-weighted and
 * one we happen to miss is invisible. It is tolerated because it errs LOW and because `maxSpread_m`
 * bounds it at 3 m — and it is recorded rather than left to be rediscovered.
 *
 * ⚠ **NOT IMPLEMENTED, DELIBERATELY — four things Art. 238 requires that this does NOT satisfy:**
 *   0. **The alignments themselves.** Art. 238.1.c measures between a point of an *alineació de
 *      vialitat* and *"els punts de l'alineació oposada"*, and Art. 236.3.a defines that alignment as
 *      *"la línia que estableix límits a l'edificació al llarg dels vials"* — the PLANNING line. We
 *      measure between **cadastral parcel boundaries**, which are a third thing: neither the built
 *      façade nor a guaranteed copy of the official alignment. Under this ordination type the two
 *      normally coincide (the building sits ON the alignment, Art. 237.1), so the substitution is
 *      usually exact — but it is NOT exact wherever a *reculada* is permitted (Art. 237.2) or an
 *      alignment has been modified on paper and not yet executed on the ground. Barcelona publishes
 *      an official alignment layer only as a WMS raster with no queryable geometry, so the
 *      substitution cannot currently be removed; it is priced by `BAND_EDGE_GUARD_M`'s 0.5 m
 *      allowance and carried in the tier as `measured-cadastral`, never as an *ample oficial*.
 *   1. **238.1.b's partition.** The minimum is required per side per ***tram* between two
 *      cross-streets**. We take it per CADASTRAL EDGE, which is a different partition — one edge may
 *      span several *trams*, and one *tram* several edges.
 *   2. **238.1.d's averaging.** *"Quan … resultin amplades de vial diferents per a frontals oposats
 *      … s'ha de prendre com a amplada de vial l'amplada mitjana que asseguri un nombre màxim de
 *      plantes uniforme."* Where opposite frontages of same-zoned land disagree, the ordinance
 *      AVERAGES to force a uniform storey count — which cuts the OPPOSITE way to the minimum.
 *   3. **238.2's *"real afectació a l'ús públic"*.** Only effectively urbanised public streets are a
 *      valid parameter; we measure any gap between frontages, so a private gap or interior courtyard
 *      still counts as a vial.
 *
 * Each needs data we do not yet have (a *tram* partition; the opposing block's zoning; a public-way
 * layer). **Taking the minimum is strictly closer to Art. 238 than the median was, and errs
 * conservative where it still diverges** — which is why it ships now rather than waiting for all
 * three.
 */
function governingPunctualWidth(sorted: ReadonlyArray<number>): number {
    return sorted[0]!;
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
            // §AMPLADA-ART-238 (L-591) — the ordinance's MINIMUM punctual width, not the median.
            width_m: governingPunctualWidth(sorted),
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
