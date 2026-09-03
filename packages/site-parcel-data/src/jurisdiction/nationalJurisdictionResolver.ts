// L-12871 — WHICH COUNTRY CLAIMS THIS POINT? The national-jurisdiction resolver.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE DEFECT THIS CLOSES
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// `parcelProviders/registry.ts` routes a click by SMALLEST ENCLOSING BBOX. A bbox is a RECTANGLE,
// not a border, and the rectangles overlap. MEASURED 2026-09-01 across all 25 routing boxes in this
// package (25 boxes, 300 pairs): **42 interior overlaps and 1 edge touch — 23 of them
// NATIONAL × NATIONAL.** L-12871 named three; there are twenty-three. Under smallest-box:
//
//   • Suwałki (54.1017, 22.9308) and Sejny (54.1069, 23.3489) are POLISH and sit inside
//     LITHUANIA_BBOX, which is smaller than POLAND_BBOX → routed to Lithuania.
//   • Marijampolė (54.5589, 23.3542) is LITHUANIAN and sits inside POLAND_BBOX.
//   • The whole German bank of the Oder/Neisse (Frankfurt (Oder), Görlitz) sits in
//     GERMANY_BBOX ∩ POLAND_BBOX, and POLAND_BBOX is the smaller box → German territory routed
//     to the Polish cadastre.
//
// ⛔ A SMALLEST-BOX TIEBREAK IS NOT A BUG TO BE TUNED, IT IS THE WRONG QUESTION. Area has no
// relationship to sovereignty. This module replaces it.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHY GEOMETRY AND NOT A DECLARED PRECEDENCE TABLE — FALSIFIED, NOT ASSUMED
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The obvious cheap fix is an ordered per-pair precedence table ("when PL and LT both match, prefer
// X"). **It cannot work, and the proof is a pair of witnesses inside each contested pair.** Every
// contested national pair in this package has territory of BOTH countries inside the OTHER's box:
//
//   DE × PL   Frankfurt (Oder) 52.3412,14.5506 (DE)  ↔  Słubice     52.3506,14.5701 (PL)
//   LT × PL   Marijampolė      54.5589,23.3542 (LT)  ↔  Suwałki     54.1017,22.9308 (PL)
//   SE × NO   Røros            62.5744,11.3842 (NO)  ↔  Kiruna      67.8558,20.2253 (SE)
//   SE × DK   København        55.6761,12.5683 (DK)  ↔  Malmö       55.6050,13.0038 (SE)
//   SE × FI   Tornio           65.8482,24.1467 (FI)  ↔  Haparanda   65.8356,24.1345 (SE)
//
// No single ordering of a pair can be right for both members of that pair. A pair-level declaration
// is therefore not "honest but coarse" — it is UNSATISFIABLE. Any declaration fine enough to
// separate these towns is already a description of the border, i.e. geometry. So: geometry.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// AND WHY THE GEOMETRY IS NOT TRUSTED BLINDLY — ALSO MEASURED
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// "Point-in-polygon makes the answer correct by construction" is FALSE for a coarse polygon set,
// and this lane measured exactly how false. Against the shipped ne_10m coverage:
//
//   Görlitz  (51.1548, 14.9884) is GERMAN  — ne_10m puts it 398 m INSIDE POLAND.
//   Tornio   (65.8482, 24.1467) is FINNISH — ne_10m puts it 255 m INSIDE SWEDEN.
//   København(55.6761, 12.5683) is DANISH  — ne_10m puts it 140 m OUTSIDE DENMARK, in the sea.
//
// A containment-only resolver would answer all three CONFIDENTLY AND WRONGLY, which is strictly
// worse than the bbox it replaced, because it would carry a citation. So containment is not the
// verdict: **the verdict is containment PLUS the margin to the nearest rival, checked against the
// dataset's own MEASURED positional tolerance** (1500 m; the p95 boundary displacement against
// official German ADM0 geometry — see `data/nationalBoundaries.json`.positionalToleranceBasis).
// Inside that band the honest answer is a NAMED REFUSAL, never a pick (E4 control 9: UNKNOWN is
// distinct from zero and from no-restriction).
//
// ⭐ THE TOLERANCE IS A PROPERTY OF THE DATA, NOT OF THIS RESOLVER. Ship a country's official
// boundary in place of the coarse one and its tolerance falls with it, converting refusals into
// claims with no change to the logic below.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE CONTRACT
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//   1. THE BBOX IS A PRE-FILTER, NEVER THE DECIDER. It only narrows the candidate set; a candidate
//      still has to be claimed by geometry. Casablanca is inside SPAIN_BBOX and is refused;
//      Kaliningrad is inside both LITHUANIA_BBOX and POLAND_BBOX and is refused.
//   2. EVERY ANSWER CARRIES ITS BASIS — which dataset, which rule, and the measured margin.
//   3. EVERY NON-ANSWER IS A NAMED REFUSAL from a closed vocabulary. There is no silent pick and
//      no "smallest box" anywhere in this file.
//   4. A REFUSAL IS NOT A DEAD CLICK. It says "do not ASSERT a nationality here"; the caller may
//      still try each candidate cadastre and let the SERVICE's own answer decide — the established
//      priority-fallback behaviour of `resolveParcelWithFallback`.
//   5. L-12887 — UN-MODELLED NEIGHBOURS ARE REFUSAL-ONLY MEMBERS. The land neighbours of the 16
//      claimable countries (CZE/SVK/AUT/LIE/SVN/SMR/VAT/MCO/AND/GIB/BEL/LVA/BLR/UKR/RUS/MAR) ship
//      as `neighbours` in the boundary set: they participate as rivals in every tolerance check
//      and a containment by one of them refuses `claimed-by-unmodelled-neighbour`, naming the true
//      owner. Before they existed, the nearest-polygon rescue annexed Vaduz to CHE, Monaco to FRA,
//      Athus to LUX, Ivangorod to EST, Sovetsk to LTU, Fnideq to ESP — and the absent rival even
//      let a displaced CONTAINMENT claim through (Český Těšín → POL). Ten wrong claims, all found
//      by driving points, all now red-pinned in the test suite.
//
// PURE. No I/O, no clock, no RNG; the polygon set is statically bundled (the `elSauzalZuso.json`
// precedent). Never throws. OTel span `pryzm.jurisdiction.resolveNationalJurisdiction` (P8).

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { pointInRingsEvenOdd } from '../geometry/pointInRingsEvenOdd.js';
import boundaryData from './data/nationalBoundaries.json' with { type: 'json' };

// ── THE CANDIDATE PRE-FILTER — the EXISTING predicates, never a re-declared box ────────────────
// Every predicate below is IMPORTED from the module that already owns it. This file declares no
// bbox of its own: re-spelling a routing box here would be recurrence six of the drift the E7
// verdict logged (`countryBbox.ts`'s CountryBbox + within() duplicated into ee/lt/pl).
import {
    isInSpain,
    isInFrance,
    isInNetherlands,
    isInNorway,
    isInGermany,
    isInSwitzerland,
    isInDenmark,
    isInSaudiArabia,
} from '../parcelProviders/countryBbox.js';
import { isInItaly } from '../parcelProviders/agenziaEntrateParcelProvider.js';
import { isInPortugal } from '../parcelProviders/dgtParcelProvider.js';
import { isInFinland } from '../parcelProviders/mmlParcelProvider.js';
import { isInEstonia } from '../countryAdapters/ee/eeJurisdiction.js';
import { isInLithuania } from '../countryAdapters/lt/ltJurisdiction.js';
import { isInLuxembourg } from '../countryAdapters/lu/luJurisdiction.js';
import { isInPoland } from '../countryAdapters/pl/plJurisdiction.js';
import { isInSweden } from '../countryAdapters/se/seJurisdiction.js';
// LANE ME-GULF (2026-09-02) — the four Gulf (GCC) countries added to the boundary set as
// claimable rivals to Saudi (SAUDI_ARABIA_BBOX covers Dubai/Abu Dhabi/Kuwait/Bahrain, so before
// this SAU was their only candidate and a UAE/KW/BH point could be nearest-polygon-annexed to
// Saudi or footprint-labelled Saudi). All four are DEFERRALS at the parcel axis; the CLAIM is used
// only to route + to refuse a border band, exactly as for LU/SE.
import { isInUAE, isInKuwait, isInBahrain, isInOman } from '../countryAdapters/gulf/gulfJurisdiction.js';
// LANE BOUNDARY-WAVE (2026-09-03) — the six dormant-adapter countries promoted to claimable.
// LVA/SVK/SVN were refusal-only neighbours (promoted rings verbatim); HRV/GRC/BGR are new members
// (same pinned ne_10m source, re-verified byte-identical). Every one of the six carries a
// LIVE-PROVEN keyless parcel channel (Rīga / Bratislava / Ljubljana / Zagreb / Athens / Sofia —
// per-lane transcripts under audit/europe-adapters-2/2026-09-02/). Their land neighbours
// HUN/SRB/BIH/MNE/ALB/MKD/ROU/TUR entered the set as refusal-only members in the same commit —
// promoting a country without its rivals is the L-12887 annexation defect.
import { isInLatvia } from '../countryAdapters/lv/lvJurisdiction.js';
import { isInSlovakia } from '../countryAdapters/sk/skJurisdiction.js';
import { isInSlovenia } from '../countryAdapters/si/siJurisdiction.js';
import { isInCroatia } from '../countryAdapters/hr/hrJurisdiction.js';
import { isInGreece } from '../countryAdapters/gr/grJurisdiction.js';
import { isInBulgaria } from '../countryAdapters/bg/bgJurisdiction.js';

const _tracer = trace.getTracer('pryzm.jurisdiction');

type Ring = ReadonlyArray<readonly [number, number]>;

interface CountryGeometry {
    readonly regionCode: string;
    readonly rings: readonly Ring[];
}

/**
 * L-12887 — a REFUSAL-ONLY member: the boundary of an UN-MODELLED land neighbour (CZE, BEL, AUT,
 * LIE, RUS, BLR, AND, MCO, SMR, MAR + the same-class UKR, GIB, VAT, and — since the 2026-09-03
 * boundary wave — HUN, SRB, BIH, MNE, ALB, MKD, ROU, TUR; LVA/SVK/SVN were PROMOTED out of this
 * set to claimable countries by that wave). A neighbour
 * can never be CLAIMED — no cadastre is registered for it — it exists so that a point on its
 * territory is refused BY NAME instead of annexed to the nearest modelled country. Without these,
 * the nearest-polygon coastal rescue had no rival to lose to wherever the true owner was absent
 * (Vaduz → CHE, Monaco → FRA, Athus → LUX, Ivangorod → EST …), and an absent rival disarmed the
 * tolerance band even for a CONTAINMENT claim (Český Těšín → POL).
 */
interface NeighbourGeometry {
    readonly rings: readonly Ring[];
    /** Set where a large neighbour (RUS/UKR/BLR/MAR) is clipped — see the JSON's neighboursNote. */
    readonly clippedToWindow?: {
        readonly minLat: number;
        readonly maxLat: number;
        readonly minLon: number;
        readonly maxLon: number;
    };
}

/** The shape of `data/nationalBoundaries.json`. */
export interface NationalBoundarySet {
    readonly dataset: string;
    readonly sourceUrl: string;
    readonly sourceSha256: string;
    readonly retrieved: string;
    readonly licence: string;
    readonly licenceUrl: string;
    readonly simplifiedToleranceM: number;
    /** MEASURED boundary displacement of this dataset (m). See the JSON's `positionalToleranceBasis`. */
    readonly positionalToleranceM: number;
    readonly coastalToleranceM: number;
    readonly countries: Readonly<Record<string, CountryGeometry>>;
    /** L-12887 refusal-only neighbours. Optional so an injected 16-country test set still types. */
    readonly neighbours?: Readonly<Record<string, NeighbourGeometry>>;
    readonly neighboursNote?: string;
    readonly neighboursRetrieved?: string;
}

/** The statically bundled national polygon set (public domain — see the JSON's own licence fields). */
export const NATIONAL_BOUNDARY_SET = boundaryData as unknown as NationalBoundarySet;

/**
 * The ISO 3166-1 alpha-3 → bbox predicate table. ONE row per country that owns a NATIONAL routing
 * bbox in this package. Sub-national boxes (NRW, Flanders, Brussels, Wallonia, England, Scotland,
 * and the US city boxes) are deliberately ABSENT: this resolver answers "which SOVEREIGN STATE
 * claims this point", and the registry's existing specificity walk handles the within-country
 * refinement underneath that answer. Widening this to sub-national routing is a separate lane
 * (E4 control 10 — recorded, not actioned).
 */
const CANDIDATE_PREFILTERS: ReadonlyArray<readonly [string, (lat: number, lon: number) => boolean]> = [
    ['ESP', isInSpain],
    ['FRA', isInFrance],
    ['NLD', isInNetherlands],
    ['NOR', isInNorway],
    ['DEU', isInGermany],
    ['CHE', isInSwitzerland],
    ['SAU', isInSaudiArabia],
    ['DNK', isInDenmark],
    ['ITA', isInItaly],
    ['PRT', isInPortugal],
    ['FIN', isInFinland],
    ['EST', isInEstonia],
    ['LTU', isInLithuania],
    ['LUX', isInLuxembourg],
    ['POL', isInPoland],
    ['SWE', isInSweden],
    // LANE ME-GULF (2026-09-02) — ARE/KWT/BHR/OMN. Each pre-filter overlaps SAUDI_ARABIA_BBOX, so
    // at a Gulf point SAU is co-present as the RIVAL for the tolerance check; the ne_10m geometry
    // then claims the true owner or refuses at the border. (QAT is deliberately NOT here — Qatar is
    // the QA lane's keyless-cadastre jurisdiction; its boundary is added when that row lands.)
    ['ARE', isInUAE],
    ['KWT', isInKuwait],
    ['BHR', isInBahrain],
    ['OMN', isInOman],
    // LANE BOUNDARY-WAVE (2026-09-03) — pre-filters ONLY; countries.<ISO3> geometry decides.
    ['LVA', isInLatvia],
    ['SVK', isInSlovakia],
    ['SVN', isInSlovenia],
    ['HRV', isInCroatia],
    ['GRC', isInGreece],
    ['BGR', isInBulgaria],
];

/** Why a national-jurisdiction resolution refused. Closed vocabulary — operationally distinct. */
export type NationalJurisdictionRefusalReason =
    /** The supplied point was not a finite WGS84 pair. */
    | 'non-finite-point'
    /** No national routing bbox contains the point at all — the universal footprint owns it. */
    | 'no-national-candidate'
    /** Two or more candidate polygons claim the point (only possible with a non-coverage dataset). */
    | 'overlapping-boundary-claims'
    /**
     * L-12887 — an UN-MODELLED land neighbour's polygon holds this point (or is decisively its
     * nearest boundary). No modelled cadastre may claim it; the detail names the true owner.
     */
    | 'claimed-by-unmodelled-neighbour'
    /**
     * Inside exactly one polygon, but a RIVAL candidate's polygon is closer than the dataset's
     * measured positional tolerance — the border could be on the other side of this point.
     */
    | 'within-dataset-tolerance-of-rival'
    /** Outside every candidate polygon by more than the coastal-generalisation tolerance. */
    | 'outside-every-candidate-polygon'
    /** Outside every polygon and the two nearest candidates are not separable at this tolerance. */
    | 'ambiguous-nearest-polygon';

/** How a CLAIM was reached. Both kinds name the dataset and the measured margin. */
export type NationalJurisdictionBasis =
    | {
          readonly kind: 'polygon-containment';
          readonly dataset: string;
          readonly sourceSha256: string;
          readonly licence: string;
          /** Nearest rival candidate, or null when the point had no rival candidate at all. */
          readonly nearestRivalIso3: string | null;
          /** Distance to that rival's polygon (m). `Infinity` when there was no rival. */
          readonly nearestRivalDistanceM: number;
          readonly toleranceM: number;
      }
    | {
          readonly kind: 'nearest-polygon';
          readonly dataset: string;
          readonly sourceSha256: string;
          readonly licence: string;
          /** How far OUTSIDE the claimed country's polygon the point fell (coastline generalisation). */
          readonly offsetM: number;
          readonly nextNearestIso3: string | null;
          readonly nextNearestDistanceM: number;
          readonly toleranceM: number;
      };

export interface NationalJurisdictionClaim {
    readonly ok: true;
    readonly iso3: string;
    /** ISO 3166-1 alpha-2, matching `ParcelJurisdiction.regionCode` for the registered rows. */
    readonly regionCode: string;
    readonly basis: NationalJurisdictionBasis;
    /** Every candidate the bbox pre-filter produced, for auditability. */
    readonly candidates: readonly string[];
}

export interface NationalJurisdictionRefusal {
    readonly ok: false;
    readonly reason: NationalJurisdictionRefusalReason;
    readonly candidates: readonly string[];
    /** Human-readable, number-carrying explanation. Never empty. */
    readonly detail: string;
}

export type NationalJurisdictionVerdict = NationalJurisdictionClaim | NationalJurisdictionRefusal;

const DEG2RAD = Math.PI / 180;
const M_PER_DEG_LAT = 110574.0;
const M_PER_DEG_LON_EQ = 111319.49;

/** Point-to-segment distance, with the query point already translated to the local origin. */
function segmentDistanceM(ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : (-ax * dx + -ay * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    return Math.hypot(cx, cy);
}

/**
 * Distance (m) from the query point to the nearest edge of `rings`. Local equirectangular metres
 * about the query point — exact enough at the sub-kilometre scale this resolver reasons about, and
 * deliberately NOT a geodesic: the tolerance it is compared against is itself 1500 m.
 */
function nearestEdgeDistanceM(lat: number, lon: number, rings: readonly Ring[]): number {
    const kx = Math.cos(lat * DEG2RAD) * M_PER_DEG_LON_EQ;
    const ky = M_PER_DEG_LAT;
    let best = Number.POSITIVE_INFINITY;
    for (const ring of rings) {
        if (ring.length < 2) continue;
        // Cheap per-ring reject: skip a ring whose own bbox is already farther than the best hit.
        if (Number.isFinite(best)) {
            let mnx = Number.POSITIVE_INFINITY;
            let mxx = Number.NEGATIVE_INFINITY;
            let mny = Number.POSITIVE_INFINITY;
            let mxy = Number.NEGATIVE_INFINITY;
            for (const c of ring) {
                if (c[0] < mnx) mnx = c[0];
                if (c[0] > mxx) mxx = c[0];
                if (c[1] < mny) mny = c[1];
                if (c[1] > mxy) mxy = c[1];
            }
            const padLon = best / Math.max(1, kx);
            const padLat = best / ky;
            if (lon < mnx - padLon || lon > mxx + padLon || lat < mny - padLat || lat > mxy + padLat) {
                continue;
            }
        }
        for (let i = 0; i < ring.length - 1; i++) {
            const d = segmentDistanceM(
                (ring[i]![0] - lon) * kx,
                (ring[i]![1] - lat) * ky,
                (ring[i + 1]![0] - lon) * kx,
                (ring[i + 1]![1] - lat) * ky,
            );
            if (d < best) best = d;
        }
    }
    return best;
}

/** Injectable so a test can drive a tiny synthetic world instead of the 16-country bundle. */
export interface NationalJurisdictionDeps {
    readonly boundaries?: NationalBoundarySet;
    readonly prefilters?: ReadonlyArray<readonly [string, (lat: number, lon: number) => boolean]>;
}

/**
 * Resolve a WGS84 point to AT MOST ONE sovereign state, with the basis named — or refuse.
 *
 * ⛔ Never returns a "best guess". Read `ok` first: a refusal means *do not assert a nationality
 * here*, NOT "no parcel here". Pure; never throws.
 */
export function resolveNationalJurisdiction(
    lat: number,
    lon: number,
    deps: NationalJurisdictionDeps = {},
): NationalJurisdictionVerdict {
    const span = _tracer.startSpan('pryzm.jurisdiction.resolveNationalJurisdiction');
    try {
        const set = deps.boundaries ?? NATIONAL_BOUNDARY_SET;
        const prefilters = deps.prefilters ?? CANDIDATE_PREFILTERS;
        const tolM = set.positionalToleranceM;
        const coastM = set.coastalToleranceM;

        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            span.setStatus({ code: SpanStatusCode.OK });
            return {
                ok: false,
                reason: 'non-finite-point',
                candidates: [],
                detail: `lat/lon must both be finite (got ${String(lat)}, ${String(lon)}).`,
            };
        }

        // 1. PRE-FILTER (cheap, inclusive, NEVER the decider).
        const candidates: string[] = [];
        for (const [iso3, contains] of prefilters) {
            if (contains(lat, lon) && set.countries[iso3]) candidates.push(iso3);
        }
        span.setAttribute('pryzm.jurisdiction.candidateCount', candidates.length);
        span.setAttribute('pryzm.jurisdiction.candidates', candidates.join(','));
        if (candidates.length === 0) {
            span.setStatus({ code: SpanStatusCode.OK });
            return {
                ok: false,
                reason: 'no-national-candidate',
                candidates: [],
                detail:
                    'No national routing bbox contains this point; the universal footprint fallback owns it.',
            };
        }

        // 2. GEOMETRY (the decider) — containment + distance-to-edge for every candidate.
        const measured = candidates.map((iso3) => {
            const rings = set.countries[iso3]!.rings;
            return {
                iso3,
                inside: pointInRingsEvenOdd({ x: lon, y: lat }, rings),
                edgeM: nearestEdgeDistanceM(lat, lon, rings),
            };
        });
        const containing = measured.filter((m) => m.inside);

        // 2b. L-12887 — the REFUSAL-ONLY neighbours, measured exactly like candidates. They are
        //     rivals everywhere below, and a containment by one of them is an immediate refusal:
        //     before they existed, the rescue in 3c annexed Vaduz to CHE and Ivangorod to EST,
        //     and the missing rival even let a displaced CONTAINMENT claim through (Český Těšín).
        const neighbourEntries = Object.entries(set.neighbours ?? {});
        const neighbours = neighbourEntries.map(([iso3, g]) => ({
            iso3,
            inside: pointInRingsEvenOdd({ x: lon, y: lat }, g.rings),
            edgeM: nearestEdgeDistanceM(lat, lon, g.rings),
        }));
        const holdingNeighbour = neighbours.filter((n) => n.inside);
        if (holdingNeighbour.length > 0) {
            const owner = holdingNeighbour.map((n) => n.iso3).join(' and ');
            const alsoClaimed =
                containing.length > 0
                    ? ` (${set.dataset}'s displaced ${containing.map((c) => c.iso3).join('/')} boundary also covers it)`
                    : '';
            span.setStatus({ code: SpanStatusCode.OK });
            return {
                ok: false,
                reason: 'claimed-by-unmodelled-neighbour',
                candidates,
                detail:
                    `${owner} holds this point in ${set.dataset}${alsoClaimed}, and ${owner} is an ` +
                    `UN-MODELLED neighbour — no cadastre is registered for it. Refusing rather than ` +
                    `annexing it to a modelled country (L-12887).`,
            };
        }

        // 3a. Two polygons claim it — impossible for a true single coverage, possible for any
        //     per-country sourced set. Refuse rather than pick; picking here is how a
        //     mixed-provenance upgrade would silently reintroduce the defect this module removes.
        if (containing.length > 1) {
            span.setStatus({ code: SpanStatusCode.OK });
            return {
                ok: false,
                reason: 'overlapping-boundary-claims',
                candidates,
                detail: `${containing.map((c) => c.iso3).join(' and ')} both claim this point in ${set.dataset}.`,
            };
        }

        // 3b. Exactly one polygon claims it — accept ONLY if no rival is inside the tolerance band.
        //     Rivals include the refusal-only neighbours (L-12887): a displaced containment on a
        //     CZE/LVA/RUS/… border must refuse exactly as it does on a modelled border.
        if (containing.length === 1) {
            const hit = containing[0]!;
            const rivals = measured
                .filter((m) => m !== hit)
                .concat(neighbours)
                .sort((a, b) => a.edgeM - b.edgeM);
            const nearest = rivals[0] ?? null;
            if (nearest && nearest.edgeM <= tolM) {
                span.setStatus({ code: SpanStatusCode.OK });
                return {
                    ok: false,
                    reason: 'within-dataset-tolerance-of-rival',
                    candidates,
                    detail:
                        `${hit.iso3} contains this point in ${set.dataset}, but ${nearest.iso3}'s boundary is ` +
                        `${nearest.edgeM.toFixed(0)} m away and that dataset's measured positional tolerance ` +
                        `is ${tolM} m — the border could be on the other side of this point. Refusing to ` +
                        `assert a nationality; try each candidate's cadastre and let the service's own ` +
                        `answer decide.`,
                };
            }
            span.setAttribute('pryzm.jurisdiction.claimed', hit.iso3);
            span.setAttribute('pryzm.jurisdiction.basis', 'polygon-containment');
            span.setStatus({ code: SpanStatusCode.OK });
            return {
                ok: true,
                iso3: hit.iso3,
                regionCode: set.countries[hit.iso3]!.regionCode,
                candidates,
                basis: {
                    kind: 'polygon-containment',
                    dataset: set.dataset,
                    sourceSha256: set.sourceSha256,
                    licence: set.licence,
                    nearestRivalIso3: nearest ? nearest.iso3 : null,
                    nearestRivalDistanceM: nearest ? nearest.edgeM : Number.POSITIVE_INFINITY,
                    toleranceM: tolM,
                },
            };
        }

        // 3c. No polygon claims it. Coastline/island generalisation puts real addresses just
        //     offshore of their own country (København is 140 m outside ne_10m Denmark). Attribute
        //     to the nearest candidate ONLY when it is close enough AND decisively nearer — and
        //     (L-12887) only when the nearest boundary is not an un-modelled neighbour's: a point
        //     140 m off the Danish coast is Danish, but a point 200 m across the Narva river is
        //     RUSSIAN, and only the neighbour geometry can tell those two apart.
        const byDistance = measured.concat(neighbours).sort((a, b) => a.edgeM - b.edgeM);
        const nearest = byDistance[0]!;
        const runnerUp = byDistance[1] ?? null;
        const neighbourSet = new Set(neighbours);
        if (nearest.edgeM > coastM) {
            span.setStatus({ code: SpanStatusCode.OK });
            return {
                ok: false,
                reason: 'outside-every-candidate-polygon',
                candidates,
                detail:
                    `Inside ${candidates.join('/')} bbox(es) but outside every candidate polygon; nearest ` +
                    `is ${nearest.iso3} at ${nearest.edgeM.toFixed(0)} m, beyond the ${coastM} m coastal ` +
                    `tolerance. The bbox was a pre-filter, not a claim.`,
            };
        }
        if (neighbourSet.has(nearest)) {
            // The nearest boundary within coastal range is an un-modelled neighbour's — the point
            // is on (or just off) FOREIGN territory. Never claimed, never handed to the runner-up.
            span.setStatus({ code: SpanStatusCode.OK });
            return {
                ok: false,
                reason: 'claimed-by-unmodelled-neighbour',
                candidates,
                detail:
                    `Outside every candidate polygon and the nearest boundary is ${nearest.iso3}'s at ` +
                    `${nearest.edgeM.toFixed(0)} m — an UN-MODELLED neighbour with no registered ` +
                    `cadastre. Refusing rather than annexing it to a modelled country (L-12887).`,
            };
        }
        if (runnerUp && runnerUp.edgeM - nearest.edgeM <= tolM) {
            span.setStatus({ code: SpanStatusCode.OK });
            return {
                ok: false,
                reason: 'ambiguous-nearest-polygon',
                candidates,
                detail:
                    `Outside every candidate polygon and not separable: ${nearest.iso3} at ` +
                    `${nearest.edgeM.toFixed(0)} m vs ${runnerUp.iso3} at ${runnerUp.edgeM.toFixed(0)} m, ` +
                    `within the ${tolM} m tolerance of each other.`,
            };
        }
        span.setAttribute('pryzm.jurisdiction.claimed', nearest.iso3);
        span.setAttribute('pryzm.jurisdiction.basis', 'nearest-polygon');
        span.setStatus({ code: SpanStatusCode.OK });
        return {
            ok: true,
            iso3: nearest.iso3,
            regionCode: set.countries[nearest.iso3]!.regionCode,
            candidates,
            basis: {
                kind: 'nearest-polygon',
                dataset: set.dataset,
                sourceSha256: set.sourceSha256,
                licence: set.licence,
                offsetM: nearest.edgeM,
                nextNearestIso3: runnerUp ? runnerUp.iso3 : null,
                nextNearestDistanceM: runnerUp ? runnerUp.edgeM : Number.POSITIVE_INFINITY,
                toleranceM: tolM,
            },
        };
    } catch (err) {
        // Defensive: a malformed bundled dataset is a packaging defect, never a user condition.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error)?.message ?? 'unknown' });
        return {
            ok: false,
            reason: 'no-national-candidate',
            candidates: [],
            detail: `National boundary set unusable: ${(err as Error)?.message ?? 'unknown error'}.`,
        };
    } finally {
        span.end();
    }
}

/** One-line human summary of a verdict — for the parcel info card and for test failure messages. */
export function describeNationalJurisdiction(v: NationalJurisdictionVerdict): string {
    if (!v.ok) return `REFUSED (${v.reason}): ${v.detail}`;
    if (v.basis.kind === 'polygon-containment') {
        const rival = v.basis.nearestRivalIso3 ?? 'no rival';
        const gap = Number.isFinite(v.basis.nearestRivalDistanceM)
            ? `${v.basis.nearestRivalDistanceM.toFixed(0)} m`
            : 'no rival in range';
        return (
            `${v.iso3} (${v.regionCode}) — inside its boundary in ${v.basis.dataset}; nearest rival ` +
            `${rival} at ${gap} (tolerance ${v.basis.toleranceM} m).`
        );
    }
    return (
        `${v.iso3} (${v.regionCode}) — ${v.basis.offsetM.toFixed(0)} m outside its own coastline in ` +
        `${v.basis.dataset}, nearest by ${v.basis.nextNearestDistanceM.toFixed(0)} m over ` +
        `${v.basis.nextNearestIso3 ?? 'no rival'}.`
    );
}
