// §L-12912 — PARCEL SIZE REVIEW: a data-justified plausibility check on a FETCHED parcel's area.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────
//
// Belverde (Seixal, Portugal), founder screenshot 2026-09-05: "I select my house — but the plot
// takes a massive village — this is not correct." The DGT SNIC cadastre answered the click with a
// REAL cadastral parcel — `AAA000091722`, registry area 7 662 344 m² (766 ha), 500 vertices, one
// prédio covering the whole urbanisation — because Belverde's own lots are not in the published
// cadastre (probe: docs/04-reference/jurisdictions/pt/findings/belverde-parcel-probe.mjs). Nothing
// upstream was wrong: the register said what it holds. What was wrong was the PRODUCT — the card
// presented a 766 ha holding as "your parcel" with "Use this parcel" as the primary action, and
// there was no place in the parcel path where the SIZE of what came back was ever looked at.
//
// ── WHAT THIS IS, AND WHAT IT IS NOT ────────────────────────────────────────────
//
// It is NOT a change to `confidence.match`. C57 §2.4 forbids a calibrated numeric cutoff inside
// the tier, and rightly: the Belverde ring is a HIGH-confidence match to a real cadastral parcel.
// The problem is not confidence in the parcel, it is that the parcel is not the lot the user
// clicked. So this is a SEPARATE, categorical review flag — `within` / `oversize` — carried beside
// the tier, rendered as its own banner, and it changes which ACTION is primary. It never disables
// the commit: an honest rural cadastre (a 227 ha Charneca de Caparica holding, a 30 ha farm) is
// still one deliberate click away, with both numbers in front of the user (C83 §1.2 — the
// refusal is the product and it carries BOTH numbers; C63 — the denominator is the land the user
// can actually build on, which a village-sized ring is not).
//
// ── WHERE THE NUMBER COMES FROM (not a guess) ───────────────────────────────────
//
// The ceiling is derived from the one measured distribution this repo holds of parcels a cadastre
// serves at an URBAN click: PARCEL-SELECT-COVERAGE.md, lane PARCEL-REACH round 4, 2026-09-04 —
// 53 wired jurisdictions, one city-centre control point each, the served parcel's area recorded
// verbatim. That corpus is embedded below so the constant can be re-derived and so a test asserts
// ZERO false refusals over it. Nearest-rank p95 = 104 348 m² (Roma, a STRADA road parcel); p99 =
// max = 184 734 m² (Mainz, de-rp). The ceiling is the corpus maximum rounded UP to one significant
// figure, so every honest urban answer the estate has ever measured passes it, while Belverde
// (7 662 344 m²) is 41× the largest of them and the neighbouring Sesimbra prédio (34 707 890 m²)
// is 188×. Re-derive, never re-tune: if the corpus grows a larger honest urban parcel, move the
// corpus row and the constant in the same commit.
//
// PURE (no THREE / Cesium / DOM / network).

import type { ParcelCardModel } from './parcelCard.js';

/**
 * The measured corpus: (jurisdiction code, served parcel area in m²) at each wired row's urban
 * control point — PARCEL-SELECT-COVERAGE.md "Live probe" column, 2026-09-04. 53 rows.
 */
export const PARCEL_SIZE_CORPUS_AREAS_M2: ReadonlyArray<readonly [string, number]> = [
    ['au-tas', 29], ['lu', 123], ['pt', 195], ['de-th', 226], ['de-sl', 346], ['fr', 385],
    ['de-mv', 571], ['es', 625], ['de-nrw', 736], ['tr', 816], ['sk', 832], ['no', 1075],
    ['au-sa', 1613], ['de-he', 2198], ['ie', 2446], ['de-sn', 3724], ['au-vic', 3864],
    ['de-sh', 4067], ['us-fl', 4199], ['de-bw', 4364], ['de-st', 4450], ['gb', 4730],
    ['au-qld', 5022], ['us-wa-king', 5510], ['lv', 5768], ['us-tx-harris', 5828],
    ['be-vlg', 8011], ['bg', 8110], ['us-nyc', 9031], ['nl', 9402], ['au-nsw', 10335],
    ['gr', 10840], ['de-ni', 10938], ['ee', 11445], ['ch', 12653], ['hr', 13850], ['cz', 15869],
    ['pl', 15880], ['at', 16424], ['au-act', 16615], ['de-hb', 17844], ['de-hh', 18098],
    ['lt', 18159], ['us-sf', 18229], ['si', 19141], ['us-chi', 21542], ['us-ma', 22632],
    ['de-bb', 23421], ['de-be', 24572], ['dk', 64981], ['it', 104348], ['qa', 183494],
    ['de-rp', 184734],
];

/** Provenance of the corpus the ceiling is derived from — rendered in the banner. */
export const PARCEL_SIZE_CORPUS = {
    measuredOn: '2026-09-04',
    rows: PARCEL_SIZE_CORPUS_AREAS_M2.length,
    /** The largest parcel any wired cadastre served at its urban control point. */
    maxAreaM2: Math.max(...PARCEL_SIZE_CORPUS_AREAS_M2.map(([, a]) => a)),
    maxRow: 'Mainz (de-rp, 073701017000540010)',
    source: 'docs/04-reference/jurisdictions/PARCEL-SELECT-COVERAGE.md',
} as const;

/**
 * The review ceiling: the corpus maximum (184 734 m²) rounded UP to one significant figure.
 * Above it a fetched parcel is shown as a CANDIDATE with both numbers, and Draw becomes the
 * primary action. It is not a refusal and it does not touch `confidence.match`.
 */
export const URBAN_PARCEL_AREA_CEILING_M2 = 200_000;

export type ParcelSizeStatus =
    /** The figure judged is at or under the ceiling — nothing to say. */
    | 'within'
    /** Above the ceiling — shown as a candidate, Draw primary, commit still possible. */
    | 'oversize'
    /** No area of any basis is available to judge — an unknown, never a zero. */
    | 'unknown'
    /** A hand-drawn ring: its size is the user's intent, not a fetched fact to review. */
    | 'not-applicable';

export interface ParcelSizeReview {
    readonly status: ParcelSizeStatus;
    /** The figure judged: the registry area when published, else the ring area. */
    readonly areaM2: number | null;
    readonly basis: 'registry-declared' | 'derived-from-ring' | null;
    readonly ceilingM2: number;
    /** `areaM2 / corpus max`, one decimal — the "how many times the largest urban parcel" number. */
    readonly multiple: number | null;
}

/** The `data-testid` on the size-review banner. */
export const PARCEL_SIZE_REVIEW_TESTID = 'parcel-size-review';

type SizeInput = Pick<ParcelCardModel, 'kind' | 'areaOfficialM2' | 'areaSigM2' | 'areaSource' | 'label'>;

/**
 * Judge the size of a card model's parcel against the ceiling. The registry figure is judged when
 * the source published one (it is the legal area); the ring figure otherwise. A user-drawn ring is
 * `not-applicable`; a model with neither area is `unknown`.
 */
export function assessParcelSize(m: SizeInput): ParcelSizeReview {
    const ceilingM2 = URBAN_PARCEL_AREA_CEILING_M2;
    if (m.kind === 'user-drawn') {
        return { status: 'not-applicable', areaM2: null, basis: null, ceilingM2, multiple: null };
    }
    const official = m.areaOfficialM2 !== null && Number.isFinite(m.areaOfficialM2) && m.areaOfficialM2 > 0
        ? m.areaOfficialM2 : null;
    const sig = m.areaSigM2 !== null && Number.isFinite(m.areaSigM2) && m.areaSigM2 > 0 ? m.areaSigM2 : null;
    const areaM2 = official ?? sig;
    if (areaM2 === null) {
        return { status: 'unknown', areaM2: null, basis: null, ceilingM2, multiple: null };
    }
    const basis = official !== null ? 'registry-declared' : 'derived-from-ring';
    const multiple = Math.round((areaM2 / PARCEL_SIZE_CORPUS.maxAreaM2) * 10) / 10;
    return {
        status: areaM2 > ceilingM2 ? 'oversize' : 'within',
        areaM2,
        basis,
        ceilingM2,
        multiple,
    };
}

function m2(n: number): string {
    // No locale separators — a legal read-out must be the same string in a screenshot and a test.
    return `${Math.round(n)} m²`;
}

/**
 * The banner for an `oversize` review. Carries BOTH numbers (the ring's and the ceiling's, plus
 * the corpus maximum it was derived from), the basis of each, and the source label — so the
 * statement can be checked, not merely believed (C83 §1.2). Returns null for any other status.
 */
export function parcelSizeReviewText(review: ParcelSizeReview, m: SizeInput): string | null {
    if (review.status !== 'oversize' || review.areaM2 === null) return null;
    const ha = Math.round(review.areaM2 / 10_000);
    const judged = review.basis === 'registry-declared'
        ? `${m2(review.areaM2)} (${ha} ha) registry-declared`
        : `${m2(review.areaM2)} (${ha} ha) computed from the ring`;
    const other = review.basis === 'registry-declared' && m.areaSigM2 !== null && Number.isFinite(m.areaSigM2)
        ? `; ${m2(m.areaSigM2)} from the ring`
        : '';
    const times = review.multiple !== null ? `${review.multiple}×` : 'many times';
    return (
        `⚠ Very large parcel — ${judged}${other}. That is ${times} the largest urban parcel any of the `
        + `${PARCEL_SIZE_CORPUS.rows} wired cadastres served at its city-centre control point `
        + `(${m2(PARCEL_SIZE_CORPUS.maxAreaM2)}, ${PARCEL_SIZE_CORPUS.maxRow}, probed ${PARCEL_SIZE_CORPUS.measuredOn}) `
        + `and above the ${m2(review.ceilingM2)} review ceiling. If you clicked a house, this is almost certainly `
        + `the underlying land holding the cadastre publishes here — your lot is not in the published cadastre. `
        + `Draw your lot instead, or use this parcel deliberately. Source: ${m.label}.`
    );
}
