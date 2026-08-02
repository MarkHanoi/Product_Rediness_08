// ─────────────────────────────────────────────────────────────────────────────
// STAGE 0 — DATASET DISCOVERY · THE PURE CLASSIFIER, SCORER AND LOCALITY GATE
//
// Everything in this file is a TOTAL FUNCTION of its arguments. No fetch, no fs, no clock. That is
// what makes the scorer testable against captured fixtures, and it is the same discipline C63 §1.1
// imposes on the city-completion scorecard: a number nobody can recompute is not a measurement.
//
// THE THREE THINGS THIS FILE REFUSES TO DO
// ----------------------------------------
//  1. ⚠ IT NEVER MERGES MACHINE-READABILITY WITH LEGAL AUTHORITY (ADR-0288). They are computed by
//     two functions that share no input, and `assertScoresNotMerged()` + its unit test exist purely
//     to make a future "just add them for a single quality score" refactor fail CI.
//  2. ⚠ IT NEVER EMITS A PUBLICATION VERDICT. Every record carries
//     `publishable: 'not-assessed-by-discovery'`, a constant. Discovery answers *can we read it*;
//     ADR-0283/0288 answer *may we publish from it*, and this tool is structurally incapable of the
//     second question.
//  3. ⚠ IT NEVER CONVERTS A FAILED PROBE INTO A ZERO (L-422/457/467/469 · PROBE-DISCIPLINE R5). An
//     unrun or errored probe leaves its bit `null`, the score is reported as a LOWER BOUND, and the
//     gap is named in `probeGaps`.
// ─────────────────────────────────────────────────────────────────────────────
import {
    PLANNING_TERMS, DEMOTION_TERMS, INSTRUMENT_MARKERS, CITATION_ATTRIBUTE_MARKERS,
    NON_SEMANTIC_ATTRIBUTES, PLANNING_VARIABLES, EDITION_SUFFIX_RE, normaliseText,
} from './taxonomy.mjs';

/** The constant this tool emits in place of a publication verdict. See §2 above. */
export const PUBLISHABLE_NOT_ASSESSED = 'not-assessed-by-discovery';

export const CLASSIFIER_VERSION = '1.0';

// ═════════════════════════════════════════════════════════════════════════════
// §GEODESY — THE ACRONYM-COLLISION GATE
//
// `GMU_Services` looked like Gerencia Municipal de Urbanismo Córdoba. It was George Mason
// University, Virginia, 6,148 km away, and the ONLY thing that caught it was reprojecting
// `fullExtent` from EPSG:3857 and measuring the distance. A name is not evidence of locality.
//
// ⚠ THE CRITICAL ASYMMETRY: an extent we CANNOT reproject is `unknown`, never `far`. Refusing to
// verify and declaring a collision are different findings, and only one of them is honest.
// ═════════════════════════════════════════════════════════════════════════════

const EARTH_R_KM = 6371.0088;

export function haversineKm(a, b) {
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const s = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_R_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** EPSG:3857 / 102100 (Web Mercator) → WGS84. The projection the GMU extent was published in. */
export function webMercatorToWgs84(x, y) {
    const lon = (x / 20037508.34) * 180;
    let lat = (y / 20037508.34) * 180;
    lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2);
    return { lon, lat };
}

/**
 * ETRS89 / UTM (EPSG:258xx, the Spanish national grid) → WGS84, via the standard inverse
 * transverse-Mercator series on GRS80. Accurate to well under a metre, which is four orders of
 * magnitude better than the question being asked ("is this service in the right country?").
 */
export function utmEtrs89ToWgs84(easting, northing, zone, southern = false) {
    const a = 6378137.0, f = 1 / 298.257222101;
    const k0 = 0.9996, e2 = f * (2 - f), e1sq = e2 / (1 - e2);
    const x = easting - 500000;
    const y = southern ? northing - 10000000 : northing;
    const m = y / k0;
    const mu = m / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256));
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const phi1 = mu
        + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu)
        + ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu)
        + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu);
    const sinP = Math.sin(phi1), cosP = Math.cos(phi1), tanP = Math.tan(phi1);
    const n1 = a / Math.sqrt(1 - e2 * sinP * sinP);
    const t1 = tanP * tanP, c1 = e1sq * cosP * cosP;
    const r1 = (a * (1 - e2)) / (1 - e2 * sinP * sinP) ** 1.5;
    const d = x / (n1 * k0);
    const lat = phi1 - ((n1 * tanP) / r1) * ((d * d) / 2
        - ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * e1sq) * d ** 4) / 24
        + ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * e1sq - 3 * c1 * c1) * d ** 6) / 720);
    const lon = (d - ((1 + 2 * t1 + c1) * d ** 3) / 6
        + ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * e1sq + 24 * t1 * t1) * d ** 5) / 120) / cosP;
    const lon0 = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);
    return { lat: (lat * 180) / Math.PI, lon: ((lon + lon0) * 180) / Math.PI };
}

/** Normalise the many spellings of a CRS reference to a bare EPSG code, or null. */
export function epsgCodeOf(crs) {
    if (!crs) return null;
    const s = String(crs);
    const m = s.match(/(?:EPSG:{1,2}|EPSG\/0\/|^)\s*(\d{4,6})\s*$/i) || s.match(/EPSG:{1,2}(\d{4,6})/i);
    if (m) return Number(m[1]);
    if (/CRS:?84/i.test(s)) return 4326;
    return null;
}

/**
 * Reproject a native bbox to WGS84 lon/lat, or return `null` with a reason. Supported: 4326/CRS84,
 * 3857/102100/900913, and ETRS89-UTM 25828–25831 (Spain) / 23029–23031 (ED50-UTM, treated as UTM —
 * the ~200 m datum shift is irrelevant to a "which continent" test and is stated in `note`).
 */
export function bboxToWgs84(bbox, crs) {
    const code = epsgCodeOf(crs);
    const [minx, miny, maxx, maxy] = bbox;
    if (code === 4326 || code === 4258) return { bbox: [minx, miny, maxx, maxy], via: `EPSG:${code}` };
    if (code === 3857 || code === 102100 || code === 900913 || code === 3785) {
        const a = webMercatorToWgs84(minx, miny), b = webMercatorToWgs84(maxx, maxy);
        return { bbox: [a.lon, a.lat, b.lon, b.lat], via: `EPSG:${code}` };
    }
    const utm = (code >= 25828 && code <= 25838) ? code - 25800
        : (code >= 23028 && code <= 23038) ? code - 23000
            : (code >= 32601 && code <= 32660) ? code - 32600 : null;
    if (utm) {
        const a = utmEtrs89ToWgs84(minx, miny, utm), b = utmEtrs89ToWgs84(maxx, maxy, utm);
        return {
            bbox: [a.lon, a.lat, b.lon, b.lat],
            via: `EPSG:${code} (UTM z${utm})`,
            note: code >= 23028 && code <= 23038 ? 'ED50 treated as ETRS89; ~200 m datum shift, immaterial to a locality test' : undefined,
        };
    }
    return null;
}

/**
 * §BBOX-SANITY — the guard that stops the locality gate producing FALSE NEGATIVES.
 *
 * ⚠⚠ FOUND ON THE FIRST LIVE MURCIA RUN, AND IT NEARLY COST A REAL PGOU LAYER.
 * `Murcia:pgou_mpg` publishes `<ows:WGS84BoundingBox>653533.6 4177460.7 … </>` — those are
 * **EPSG:25830 metres inside the element the OGC spec defines as WGS84 degrees**. Taken literally
 * they reproject to 11 955 km away, so the naive gate quarantined a genuine *modificaciones
 * puntuales del PGOU* layer as an acronym collision. That is a **false negative**, which ADR-0290
 * names as the most expensive error this tool can make — it would send an engineer to build a
 * derived solution while the authoritative dataset sits published.
 *
 * `Murcia:tranvia_lineas` is the other shape: an extent at (−7.49, −0.000009) — **Null Island**, the
 * classic empty/degenerate sentinel. That is an ABSENT extent, not a distant one.
 *
 * Both resolve to `unknown`. Neither may resolve to `far`. The asymmetry is deliberate: declaring a
 * collision requires positive evidence, and mislabelled metadata is not evidence of location.
 */
export function sanitiseWgs84Bbox(bbox, nativeCrs) {
    if (!bbox || bbox.some((v) => !Number.isFinite(v))) return { bbox: null, reason: 'no usable extent published' };
    const [minx, miny, maxx, maxy] = bbox;
    const outOfRange = Math.abs(minx) > 180 || Math.abs(maxx) > 180 || Math.abs(miny) > 90 || Math.abs(maxy) > 90;
    if (outOfRange) {
        // The publisher labelled it WGS84 and served something else. Try the layer's declared native
        // CRS — the only other thing it plausibly is.
        const rp = nativeCrs ? bboxToWgs84(bbox, nativeCrs) : null;
        if (rp) {
            return {
                bbox: rp.bbox,
                repaired: true,
                reason: `publisher declared WGS84 but served ${nativeCrs} ordinates; reinterpreted via ${rp.via} `
                    + '(a publisher metadata defect, NOT a location finding)',
            };
        }
        return { bbox: null, reason: `extent is out of WGS84 range and no reprojectable native CRS was declared — UNKNOWN, never "far"` };
    }
    // Null-Island / point-sized degenerate extents. Both are the empty sentinel, not a location.
    //   • `Murcia:tranvia_lineas` publishes [−7.48875, −0.0000090, −7.48874, 0] — an extent ~1 m
    //     across sitting on the equator. Read literally it is 4 274 km away; in fact it is an empty
    //     or never-computed bbox.
    //   • The threshold is 1e-4° ≈ 11 m. A layer whose ENTIRE published extent is 11 m across is
    //     telling us nothing about where it is, whatever its coordinates say.
    const nearNull = Math.abs(minx) < 1 && Math.abs(miny) < 1 && Math.abs(maxx) < 1 && Math.abs(maxy) < 1;
    const pointSized = Math.abs(maxx - minx) < 1e-4 && Math.abs(maxy - miny) < 1e-4;
    if (nearNull || pointSized) {
        return {
            bbox: null,
            reason: nearNull
                ? 'Null-Island extent — the empty sentinel, an ABSENT extent, not a distant one'
                : 'point-sized extent (< ~11 m across) — an empty or never-computed bbox, which evidences no location',
        };
    }
    return { bbox, repaired: false, reason: null };
}

/**
 * WGS84 → ETRS89/UTM forward projection, so the axis/CRS matrix can issue a bbox in the layer's
 * NATIVE coordinates rather than WGS84 degrees wearing a native CRS label (which is a malformed
 * request and proves nothing when it returns 0).
 *
 * ⚠ THIS EXISTS BECAUSE OF CORRECTION 1: *"a negative resting on an untested axis order, unverified
 * CRS, or unexercised alternate parameterisation is not a negative."* Without a forward projection
 * the CRS half of that matrix could not be exercised at all.
 */
export function wgs84ToUtmEtrs89(lat, lon, zone) {
    const a = 6378137.0, f = 1 / 298.257222101;
    const k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
    const toRad = Math.PI / 180;
    const phi = lat * toRad;
    const lon0 = ((zone - 1) * 6 - 180 + 3) * toRad;
    const dl = lon * toRad - lon0;
    const n = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
    const t = Math.tan(phi) ** 2;
    const c = ep2 * Math.cos(phi) ** 2;
    const A = Math.cos(phi) * dl;
    const M = a * ((1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256) * phi
        - ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * phi)
        + ((15 * e2 * e2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * phi)
        - ((35 * e2 ** 3) / 3072) * Math.sin(6 * phi));
    const easting = k0 * n * (A + ((1 - t + c) * A ** 3) / 6
        + ((5 - 18 * t + t * t + 72 * c - 58 * ep2) * A ** 5) / 120) + 500000;
    const northing = k0 * (M + n * Math.tan(phi) * ((A * A) / 2
        + ((5 - t + 9 * c + 4 * c * c) * A ** 4) / 24
        + ((61 - 58 * t + t * t + 600 * c - 330 * ep2) * A ** 6) / 720));
    return { easting, northing };
}

/** The UTM zone for a longitude, used to build a native-CRS bbox. */
export function utmZoneFor(lon) { return Math.floor((lon + 180) / 6) + 1; }

// ═════════════════════════════════════════════════════════════════════════════
// §TEMPORAL-VALIDITY — CORRECTION 2.
//
// Murcia's planning layers carry `f_inicial` / `f_fin`, with `f_fin = 2999-12-30Z` as the
// "still in force" SENTINEL. If a publisher ever serves superseded geometry ALONGSIDE current
// geometry in one layer, and the compiler does not filter on the end date, it computes an envelope
// from a REPEALED alignment. That OVER-GRANTS — the L-616 direction, the unsafe one.
//
// ⚠ Detection is the deliverable here, not the filter. Stage 0 flags that a temporal filter is
// REQUIRED; it never decides what the filter should be, because which edition is in force is a
// legal question (ADR-0284: derived law is forbidden).
// ═════════════════════════════════════════════════════════════════════════════

/** Attribute-name patterns that indicate a validity END date — the one that can over-grant. */
export const VALIDITY_END_PATTERNS = [
    /^f_?fin(al)?$/i, /^fecha_?fin/i, /^fin_?vigen/i, /^valid_?(to|until|end)$/i,
    /^date_?end$/i, /^end_?date$/i, /^hasta$/i, /^baja$/i, /^fecha_?baja$/i, /^t_?end$/i,
];
/** Attribute-name patterns that indicate a validity START date. */
export const VALIDITY_START_PATTERNS = [
    /^f_?ini(cial)?$/i, /^fecha_?ini/i, /^ini_?vigen/i, /^valid_?(from|start)$/i,
    /^date_?start$/i, /^start_?date$/i, /^desde$/i, /^alta$/i, /^fecha_?alta$/i, /^t_?start$/i,
];
/** Weaker signals — a date field whose role is unstated. Recorded, but does not force the flag. */
export const VALIDITY_AMBIGUOUS_PATTERNS = [/fecha/i, /vigen/i, /^f_\w+$/i, /date/i];

export function detectTemporalValidity(attributes) {
    if (!attributes) {
        return {
            probed: false, detected: null, endFields: null, startFields: null, ambiguousFields: null,
            // ⚠ NOT PROBED ≠ NOT PRESENT. Without a schema this is UNKNOWN, and the flag says so.
            temporalFilteringRequired: null,
            note: 'schema not retrieved — temporal validity UNKNOWN, not absent',
        };
    }
    const names = attributes.map((a) => String(a.name));
    const endFields = names.filter((n) => VALIDITY_END_PATTERNS.some((re) => re.test(n)));
    const startFields = names.filter((n) => VALIDITY_START_PATTERNS.some((re) => re.test(n)));
    const ambiguousFields = names.filter((n) => !endFields.includes(n) && !startFields.includes(n)
        && VALIDITY_AMBIGUOUS_PATTERNS.some((re) => re.test(n)));
    const detected = endFields.length > 0 || startFields.length > 0;
    return {
        probed: true,
        detected,
        endFields, startFields, ambiguousFields,
        // The flag turns on for an END date specifically: a start date alone cannot over-grant.
        temporalFilteringRequired: endFields.length > 0,
        note: endFields.length > 0
            ? `⚠ TEMPORAL FILTER REQUIRED. Validity end field(s) ${endFields.join(', ')} present. Querying this `
                + 'layer WITHOUT filtering them risks computing from REPEALED geometry, which OVER-GRANTS '
                + '(L-616 direction). Sentinel end-dates such as 2999-12-30 mean "in force" — a naive '
                + 'date comparison must handle them. MEASURE whether expired rows are actually served '
                + 'before sizing the risk: Murcia serves none (all 23,066 alineaciones are in force).'
            : startFields.length > 0
                ? `validity START field(s) ${startFields.join(', ')} present but no end field — cannot over-grant on its own`
                : ambiguousFields.length > 0
                    ? `no explicit validity fields; date-like field(s) ${ambiguousFields.join(', ')} recorded as ambiguous`
                    : 'no validity fields detected in the retrieved schema',
    };
}

export const LOCALITY_NEAR_KM = 60;
export const LOCALITY_REGION_KM = 300;
/** A bbox wider than this in either axis contains the city without being ABOUT the city. */
export const LOCALITY_BROAD_SPAN_DEG = 12;

/**
 * THE GMU GATE. Returns one of:
 *   `local`             — the extent contains, or sits within LOCALITY_NEAR_KM of, the municipality.
 *   `regional`          — within LOCALITY_REGION_KM. Plausible (a provincial/regional publisher).
 *   `contains-but-broad`— contains the city but spans a continent. Locality UNPROVEN by extent alone.
 *   `far`               — ⛔ THE GMU CASE. Reprojected, measured, and not here.
 *   `unknown`           — no extent, or a CRS we cannot reproject. NOT a negative (PROBE-DISCIPLINE R5).
 */
export function verifyLocality(bboxWgs84, centroid, opts = {}) {
    if (!bboxWgs84 || bboxWgs84.some((v) => !Number.isFinite(v))) {
        return { verdict: 'unknown', reason: 'no usable extent published', distanceKm: null, spanDeg: null };
    }
    const [minx, miny, maxx, maxy] = bboxWgs84;
    const spanDeg = Math.max(Math.abs(maxx - minx), Math.abs(maxy - miny));
    const inside = centroid.lon >= minx && centroid.lon <= maxx && centroid.lat >= miny && centroid.lat <= maxy;
    // Distance to the nearest point of the bbox (0 when inside).
    const nx = Math.min(Math.max(centroid.lon, minx), maxx);
    const ny = Math.min(Math.max(centroid.lat, miny), maxy);
    const distanceKm = haversineKm(centroid, { lon: nx, lat: ny });
    const broadSpan = opts.broadSpanDeg ?? LOCALITY_BROAD_SPAN_DEG;
    if (inside && spanDeg > broadSpan) {
        return {
            verdict: 'contains-but-broad', distanceKm: 0, spanDeg,
            reason: `extent spans ${spanDeg.toFixed(1)}° — contains the municipality but does not evidence it is ABOUT it`,
        };
    }
    if (distanceKm <= (opts.nearKm ?? LOCALITY_NEAR_KM)) return { verdict: 'local', distanceKm, spanDeg, reason: null };
    if (distanceKm <= (opts.regionKm ?? LOCALITY_REGION_KM)) {
        return { verdict: 'regional', distanceKm, spanDeg, reason: 'plausible regional/provincial publisher — confirm the publisher, not the name' };
    }
    return {
        verdict: 'far', distanceKm, spanDeg,
        reason: `⛔ ACRONYM-COLLISION SUSPECT — reprojected extent is ${Math.round(distanceKm)} km from the municipality (the GMU_Services failure mode)`,
    };
}

// ═════════════════════════════════════════════════════════════════════════════
// §MACHINE-READABILITY — five bits, about ACCESS ONLY.
//
// A bit is `true`, `false` (probed and negative) or `null` (not probed / probe errored). `null`
// never becomes `false`. The score is `trueBits / TOTAL`, always reported alongside `isLowerBound`,
// so a partially-probed layer can never be quoted as a measured ceiling.
// ═════════════════════════════════════════════════════════════════════════════

export const MR_BITS = [
    { id: 'advertised', label: 'advertised in a capabilities document' },
    { id: 'featureQueryable', label: 'queryable as FEATURES (WFS/OGC-API/ArcGIS query), not WMS-only' },
    { id: 'schemaRetrievable', label: 'schema retrievable (DescribeFeatureType / layer JSON)' },
    { id: 'featuresReturn', label: 'features actually return (> 0 after the axis-order ladder)' },
    { id: 'semanticAttributes', label: 'carries typed attributes beyond an id/geometry column' },
];

export function scoreMachineReadability(evidence) {
    const bits = {};
    for (const b of MR_BITS) bits[b.id] = evidence[b.id] ?? null;
    const known = Object.values(bits).filter((v) => v !== null);
    const trueBits = Object.values(bits).filter((v) => v === true).length;
    const gaps = MR_BITS.filter((b) => bits[b.id] === null).map((b) => b.id);
    return {
        axis: 'machine-readability',
        score: Number((trueBits / MR_BITS.length).toFixed(3)),
        bits,
        probedBits: known.length,
        totalBits: MR_BITS.length,
        // ⚠ THE HONESTY FLAG. With any bit unprobed the score is a FLOOR, not a measurement.
        isLowerBound: gaps.length > 0,
        probeGaps: gaps,
    };
}

// ═════════════════════════════════════════════════════════════════════════════
// §LEGAL-AUTHORITY — five bits, about STANDING ONLY. Shares no input with the above.
//
// ⚠⚠ THIS AXIS DOES NOT AUTHORISE ANYTHING. A 5/5 here means "this looks like the publisher's own
// depiction of an in-force instrument, with a per-feature citation". It does NOT mean the instrument
// GRANTS the determination we want to publish — ADR-0288 condition 2, the exact inference Madrid's
// `PG_ANALISIS_EDIFICACION` is frozen on.
// ═════════════════════════════════════════════════════════════════════════════

export const LA_BITS = [
    { id: 'competentPublisher', label: 'publisher is a competent planning authority for this municipality' },
    { id: 'namedInstrument', label: 'layer is attributed to a named planning instrument' },
    { id: 'instrumentDated', label: 'an edition/date/version of the instrument is asserted' },
    { id: 'normativeObject', label: 'depicts a normative object, not base cartography or an inventory' },
    { id: 'featureLevelCitation', label: 'an attribute carries a per-feature legal reference' },
];

export function scoreLegalAuthority(evidence) {
    const bits = {};
    for (const b of LA_BITS) bits[b.id] = evidence[b.id] ?? null;
    const trueBits = Object.values(bits).filter((v) => v === true).length;
    const gaps = LA_BITS.filter((b) => bits[b.id] === null).map((b) => b.id);
    return {
        axis: 'legal-authority',
        score: Number((trueBits / LA_BITS.length).toFixed(3)),
        bits,
        probedBits: Object.values(bits).filter((v) => v !== null).length,
        totalBits: LA_BITS.length,
        isLowerBound: gaps.length > 0,
        probeGaps: gaps,
        // The constant that keeps ADR-0288 in the payload rather than in a reviewer's memory.
        publishable: PUBLISHABLE_NOT_ASSESSED,
        publishableNote: 'ADR-0288: machine-readable is not publishable, and neither is a high legal-authority '
            + 'score. Publication requires a separate finding that the instrument GRANTS the determination.',
    };
}

/**
 * ⚠ THE GUARD. `assertScoresNotMerged` exists so that the moment someone adds a combined score, a
 * test fails and they must read ADR-0288 before proceeding. It is cheap; the failure it prevents is
 * the one the founder named as the most likely future mistake.
 */
export function assertScoresNotMerged(record) {
    const forbidden = ['overallScore', 'qualityScore', 'combinedScore', 'score', 'confidence', 'rating'];
    for (const k of forbidden) {
        if (Object.prototype.hasOwnProperty.call(record, k)) {
            throw new Error(
                `ADR-0288 VIOLATION: a discovery record must not carry a merged \`${k}\`. `
                + 'Machine-readability and legal authority are separate axes and stay separate.',
            );
        }
    }
    if (record.machineReadability?.score === undefined || record.legalAuthority?.score === undefined) {
        throw new Error('ADR-0288: a discovery record must carry BOTH axes, separately.');
    }
    return true;
}

// ═════════════════════════════════════════════════════════════════════════════
// §CLASSIFY
// ═════════════════════════════════════════════════════════════════════════════

// ⚠ NO TRAILING `\b`. GML types are CamelCase compounds — `gml:SurfacePropertyType`,
// `gml:MultiCurvePropertyType` — so a trailing word boundary never fires and every polygon layer
// silently reported `geometryKind: null`. Caught on the first live Córdoba run.
const GEOMETRY_KIND_RE = [
    { re: /multi[_\s-]?surface|multi[_\s-]?polygon|polygon|surface/i, kind: 'polygon' },
    { re: /multi[_\s-]?curve|multi[_\s-]?line|line[_\s]?string|curve/i, kind: 'line' },
    { re: /multi[_\s-]?point|point/i, kind: 'point' },
    { re: /geometrycollection|geometry/i, kind: 'mixed' },
    { re: /raster|coverage/i, kind: 'raster' },
];

export function geometryKindOf(typeString) {
    if (!typeString) return null;
    for (const g of GEOMETRY_KIND_RE) if (g.re.test(typeString)) return g.kind;
    return null;
}

function isNonSemantic(attrName) {
    const n = String(attrName).toLowerCase();
    return NON_SEMANTIC_ATTRIBUTES.some((re) => re.test(n));
}

/**
 * Classify one enumerated layer.
 *
 * @param layer    {{ name, title?, abstract?, keywords?[], crs?[], bboxWgs84?, service, endpoint,
 *                    publisher?, geometryType?, attributes?[], featureCount?, featureCountStatus? }}
 * @param ctx      {{ centroid?: any, municipality?: any, publisherRegistry?: any, serviceLocality?: any }}
 */
export function classifyLayer(layer, ctx = {}) {
    const hay = normaliseText([
        layer.name, layer.title, layer.abstract, ...(layer.keywords || []),
    ].filter(Boolean).join(' '));

    // ── term hits ────────────────────────────────────────────────────────────────────────────────
    const termHits = PLANNING_TERMS.filter((t) => t.re.test(hay)).map((t) => ({
        term: t.id, weight: t.weight, kind: t.kind, variables: t.variables,
        caveat: t.caveat || null, note: t.note || null,
    }));

    const demotions = DEMOTION_TERMS.filter((d) => d.re.test(hay)).map((d) => d.id);

    // ── kind. A normative term always wins over a demotion: `catastro_pgou_textos` matches both
    //    `toponymy` furniture and the `pgou` instrument, and dropping it would be the Madrid
    //    "assessed on the wrong artefact" defect in miniature. ─────────────────────────────────────
    let kind = 'unknown';
    if (termHits.some((h) => h.kind === 'normative')) kind = 'normative';
    else if (termHits.some((h) => h.kind === 'geometry')) kind = 'geometry';
    else if (demotions.length) {
        kind = DEMOTION_TERMS.find((d) => demotions.includes(d.id)).kind;
    } else if (termHits.length) kind = termHits[0].kind;

    // ── candidate variables (deduped, each with its provenance and caveats) ──────────────────────
    const varMap = new Map();
    for (const h of termHits) {
        for (const v of h.variables) {
            const prev = varMap.get(v) || { variable: v, label: PLANNING_VARIABLES[v]?.label ?? v, viaTerms: [], caveats: [], adr0285: !!PLANNING_VARIABLES[v]?.adr0285 };
            prev.viaTerms.push(h.term);
            if (h.caveat) prev.caveats.push(h.caveat);
            varMap.set(v, prev);
        }
    }
    const candidateVariables = [...varMap.values()].map((v) => ({
        ...v,
        // ⚠ THE WORD THAT MAKES THIS TOOL SAFE. Never `resolved`, never `source`.
        status: 'candidate',
        disposition: 'A human + the ordinance dispose. Discovery only proposes.',
        adr0285Test: v.adr0285
            ? {
                part1_criterionStatedByOrdinance: 'HUMAN — read the instrument',
                part2_methodUnprescribed: 'HUMAN — read the instrument',
                part3_authoritativePublishedGeometry: 'PARTIAL — see legalAuthority.bits, and the locality verdict',
                part4_reproducible: 'ENGINEERING — pin by test over a captured fixture',
            }
            : null,
    }));

    // ── instrument markers → legal authority inputs ──────────────────────────────────────────────
    const instruments = INSTRUMENT_MARKERS.filter((m) => m.re.test(hay)).map((m) => m.instrument);
    const editionSuffix = EDITION_SUFFIX_RE.exec(normaliseText(layer.name).replace(/\s+/g, '_'));
    const datedInText = /\b(19|20)\d{2}\b/.test(hay);

    // ── attributes ───────────────────────────────────────────────────────────────────────────────
    const attrs = layer.attributes ?? null;
    const semanticAttrs = attrs ? attrs.filter((a) => !isNonSemantic(a.name) && !/geom/i.test(a.type || '')) : null;
    const citationAttrs = semanticAttrs
        ? semanticAttrs.filter((a) => CITATION_ATTRIBUTE_MARKERS.some((re) => re.test(String(a.name).toLowerCase()))).map((a) => a.name)
        : null;

    const temporalValidity = detectTemporalValidity(attrs);

    const geometryKind = geometryKindOf(layer.geometryType)
        ?? (attrs ? geometryKindOf(attrs.find((a) => /geom/i.test(a.type || '') || /geom/i.test(a.name))?.type) : null);

    // ── locality ─────────────────────────────────────────────────────────────────────────────────
    const san = sanitiseWgs84Bbox(layer.bboxWgs84 ?? null, layer.defaultCrs ?? layer.bboxNativeCrs ?? null);
    let locality = ctx.centroid
        ? san.bbox
            ? { ...verifyLocality(san.bbox, ctx.centroid), ...(san.repaired ? { extentRepaired: san.reason } : {}) }
            : { verdict: 'unknown', reason: san.reason, distanceKm: null, spanDeg: null }
        : { verdict: 'unknown', reason: 'no municipality centroid supplied', distanceKm: null, spanDeg: null };

    // ⚠ §EXTENT-CONTRADICTS-SERVICE. A LAYER whose extent reads `far` inside a service whose OWN
    // extent is local is overwhelmingly a stale or degenerate published bbox — not a collision. The
    // GMU case was a whole SERVICE: foreign extent, foreign owner, empty description. Quarantining a
    // single layer on publisher metadata alone would manufacture false negatives, so the verdict is
    // downgraded to a flag and the layer stays visible for a human.
    if (locality.verdict === 'far' && ctx.serviceLocality
        && (ctx.serviceLocality.verdict === 'local' || ctx.serviceLocality.verdict === 'regional')) {
        locality = {
            ...locality, verdict: 'extent-contradicts-service',
            reason: `layer extent reads ${Math.round(locality.distanceKm)} km away inside a service whose own extent is `
                + `${ctx.serviceLocality.verdict} — almost certainly a stale/degenerate published bbox. NOT quarantined; verify before use.`,
        };
    }

    // ── the two axes ─────────────────────────────────────────────────────────────────────────────
    const machineReadability = scoreMachineReadability({
        advertised: true, // it came out of a capabilities document — that IS the evidence
        featureQueryable: layer.service === 'WFS' || layer.service === 'OGCAPI' || layer.service === 'ArcGIS'
            ? true
            : layer.service === 'WMS' ? false : null,
        schemaRetrievable: attrs ? attrs.length > 0 : null,
        featuresReturn: layer.featureCountStatus === 'measured'
            ? layer.featureCount > 0
            : layer.featureCountStatus === 'zero-all-forms' ? false : null,
        semanticAttributes: semanticAttrs ? semanticAttrs.length > 0 : null,
    });

    const publisherRec = ctx.publisherRegistry?.[layer.publisher] ?? null;
    const legalAuthority = scoreLegalAuthority({
        // ⚠ NOT inferred from the hostname. A declared registry, or `null` — because "the URL looks
        // municipal" is exactly the reasoning that produced George Mason University.
        competentPublisher: publisherRec ? publisherRec.competentForPlanning : null,
        namedInstrument: instruments.length > 0,
        instrumentDated: (editionSuffix || datedInText) ? true : false,
        normativeObject: kind === 'normative',
        featureLevelCitation: citationAttrs ? citationAttrs.length > 0 : null,
    });

    // ── reusable geometry — the Córdoba `manzana` insight, promoted to a first-class flag ────────
    // A layer can authorise NOTHING and still be the best available geometry for the compiler's
    // scaffolding. Under ADR-0283 published geometry outranks geometry we reconstruct ourselves.
    const reusableGeomVars = ['block-ring', 'parcel-boundary', 'building-footprint', 'admin-boundary', 'street-surface', 'terrain-rasante'];
    const reusableGeometry = {
        flag: (geometryKind === 'polygon' || geometryKind === 'line' || geometryKind === null)
            && candidateVariables.some((v) => reusableGeomVars.includes(v.variable))
            && locality.verdict !== 'far',
        forVariables: candidateVariables.filter((v) => reusableGeomVars.includes(v.variable)).map((v) => v.variable),
        note: 'Reusable geometry is a SUPPLY fact, not an authority fact (ADR-0284: derived geometry '
            + 'is permissible, derived law is not). Under ADR-0283 published geometry outranks a '
            + 'reconstruction we perform ourselves.',
    };

    // ── §RANK-IS-NOT-A-SCORE ─────────────────────────────────────────────────────────────────────
    // `triageRank` orders WHAT A HUMAN SHOULD LOOK AT FIRST. It is deliberately a function of
    // planning relevance × machine-readability and CONTAINS NO LEGAL-AUTHORITY TERM — merging those
    // is the ADR-0288 failure. It never enters a publication decision, a coverage number or a C63
    // axis. It exists because a 212-layer GeoServer is unreadable unsorted.
    const relevance = Math.min(9, termHits.reduce((s, h) => s + h.weight, 0));
    const kindMult = { normative: 1, geometry: 0.8, basemap: 0.35, inventory: 0.25, imagery: 0.15, unknown: 0.5 }[kind];
    // `far` (a proven collision) zeroes the rank. `extent-contradicts-service` only demotes — see
    // §EXTENT-CONTRADICTS-SERVICE above; zeroing it is how a real PGOU layer disappears.
    const localityMult = locality.verdict === 'far' ? 0
        : locality.verdict === 'contains-but-broad' ? 0.6
            : locality.verdict === 'extent-contradicts-service' ? 0.7 : 1;
    const triageRank = Number(
        (relevance * kindMult * localityMult * (0.5 + 0.5 * machineReadability.score)).toFixed(3),
    );

    const flags = [];
    if (editionSuffix) {
        flags.push({
            id: 'superseded-edition-suspect',
            detail: `name ends in an edition suffix (${editionSuffix[0].slice(1)}). A historic edition `
                + 'publishes REPEALED law if bound. Confirm which edition is in force before use.',
        });
    }
    if (locality.verdict === 'far') flags.push({ id: 'acronym-collision-suspect', detail: locality.reason });
    if (locality.verdict === 'extent-contradicts-service') flags.push({ id: 'published-extent-defect', detail: locality.reason });
    if (locality.extentRepaired) flags.push({ id: 'published-extent-mislabelled', detail: locality.extentRepaired });
    if (locality.verdict === 'contains-but-broad') flags.push({ id: 'extent-too-broad-to-prove-locality', detail: locality.reason });
    if (layer.featureCountStatus && layer.featureCountStatus !== 'measured' && layer.featureCountStatus !== 'zero-all-forms') {
        flags.push({ id: 'feature-count-unknown', detail: `count probe outcome: ${layer.featureCountStatus} — UNKNOWN, not zero (L-422/457/467/469)` });
    }
    if (temporalValidity.temporalFilteringRequired) {
        flags.push({ id: 'temporal-filtering-required', detail: temporalValidity.note });
    }
    for (const h of termHits) if (h.caveat) flags.push({ id: `caveat:${h.term}`, detail: h.caveat });

    const record = {
        layer: layer.name,
        title: layer.title ?? null,
        service: layer.service,
        endpoint: layer.endpoint,
        publisher: layer.publisher ?? null,
        kind,
        geometryType: layer.geometryType ?? null,
        geometryKind,
        attributeCount: attrs ? attrs.length : null,
        semanticAttributeCount: semanticAttrs ? semanticAttrs.length : null,
        citationAttributes: citationAttrs,
        temporalValidity,
        // ⚠ Hoisted to the top level so a consumer cannot miss it. `null` = schema not probed =
        // UNKNOWN, which is NOT the same as `false`.
        temporalFilteringRequired: temporalValidity.temporalFilteringRequired,
        featureCount: layer.featureCount ?? null,
        featureCountStatus: layer.featureCountStatus ?? 'not-probed',
        instruments,
        termHits: termHits.map((h) => h.term),
        candidateVariables,
        locality,
        machineReadability,
        legalAuthority,
        reusableGeometry,
        triageRank,
        triageRankNote: '§RANK-IS-NOT-A-SCORE — human triage order only. Contains no legal-authority term. '
            + 'Never a publication input.',
        flags,
        suggestedIntegration: suggestIntegration({ kind, candidateVariables, reusableGeometry, machineReadability, locality }),
    };
    assertScoresNotMerged(record);
    return record;
}

/**
 * The "suggested integrations" column the brief asks for. Every suggestion is an ACTION FOR A HUMAN
 * with an exit criterion (MACHINE-READABLE-EVIDENCE-REGISTER rule 4: *"Investigate further" is not
 * an action*). None of them is "bind it".
 */
export function suggestIntegration({ kind, candidateVariables, reusableGeometry, machineReadability, locality }) {
    const out = [];
    if (locality.verdict === 'far') {
        return [{
            action: 'DISCARD — verify the publisher identity before anything else',
            exit: 'the service is shown to belong to this municipality, or the row is Closed as a name collision',
            register: 'Closed',
        }];
    }
    if (reusableGeometry.flag) {
        out.push({
            action: `Evaluate as REUSABLE GEOMETRY for ${reusableGeometry.forVariables.join(', ')} — published geometry outranks our own reconstruction (ADR-0283)`,
            exit: 'coverage of the layer against the target frame is MEASURED, and the incumbent derivation is demoted to fallback or kept',
            register: 'Investigate',
        });
    }
    for (const v of candidateVariables) {
        if (kind !== 'normative') continue;
        out.push({
            action: `Candidate supply for ${v.label} — run the ADR-0285 four-part test`,
            exit: 'parts 1+2 answered from the instrument by a human; part 3 answered by publisher standing; part 4 pinned by a fixture test',
            register: 'Investigate',
            caveats: v.caveats,
        });
    }
    if (machineReadability.isLowerBound) {
        out.push({
            action: `Close the probe gaps (${machineReadability.probeGaps.join(', ')}) before quoting this layer's readability`,
            exit: 'every machine-readability bit is true or false, none null (PROBE-DISCIPLINE R5)',
            register: 'Investigating',
        });
    }
    if (!out.length) {
        out.push({
            action: 'Record in the inventory; no planning variable proposed',
            exit: 'none — a negative that is written down is the register\'s highest-value column',
            register: 'Closed',
        });
    }
    return out;
}

/**
 * Draft rows for the MACHINE-READABLE EVIDENCE REGISTER. Stage 0 POPULATES that register; it never
 * writes to it — a human moves rows in, because rule 5 says a row does not change without evidence
 * and an agent's opinion is not evidence.
 *
 * ⚠ `Publishable` is emitted as the ADR-0288 constant. Discovery cannot fill that column, ever.
 */
export function toEvidenceRegisterRows(records, municipality) {
    return records.map((r) => ({
        city: municipality,
        dataset: `${r.publisher ?? r.service}: ${r.layer}`,
        machineReadable: r.machineReadability.isLowerBound
            ? `Partial/Unknown — ${r.machineReadability.score.toFixed(2)} floor; unprobed: ${r.machineReadability.probeGaps.join(', ')}`
            : r.machineReadability.score >= 0.8 ? 'Yes' : r.machineReadability.score === 0 ? 'No' : `Partial — ${r.machineReadability.score.toFixed(2)}`,
        publishable: PUBLISHABLE_NOT_ASSESSED,
        status: r.flags.some((f) => f.id === 'acronym-collision-suspect') ? 'Closed'
            : r.kind === 'normative' || r.reusableGeometry.flag ? 'Investigate' : 'Closed',
        nextAction: r.suggestedIntegration[0].action,
        exit: r.suggestedIntegration[0].exit,
    }));
}
