// Córdoba (INE 14021) — the RASTER-CLASSIFIED-ZONE resolver: a point-in-parcel lookup against zone
// FAMILIES reconstructed from the PGOU-2001 CUS calificación sheets by colour classification snapped
// to Catastro parcel geometry, for land OUTSIDE both the COACo two-district vectorised pilot
// (`resolveCordobaSubzone`) and PRYZM's own hand-traced store (`resolveCordobaTracedZone`).
//
// Method + measurements: findings/RASTER-PARCEL-ZONING-FEASIBILITY-2026-08-05.md (the feasibility
// study and its §12 cross-sheet validation) and findings/RASTER-CLASSIFIER-SAFE-SUBSET-IMPLEMENTATION-2026-08-05.md
// (this implementation pass: what was rebuilt, re-measured, and why the safe set shrank).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE SOURCE HIERARCHY — THIS IS THE WEAKEST RUNG, AND IT GETS ITS OWN GATE
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   coaco:ordenanzas WFS   >   PRYZM hand-trace        >   THIS pipeline            >   refusal
//   (published geometry)       (a human read the map)      (machine-derived, no
//                                                           human in the loop)
//
// `resolveCordobaTracedZone.ts`'s header is already explicit that a hand-trace is "a materially
// WEAKER source than a WFS answer". A machine-derived label is weaker still: nobody looked at it.
// It therefore carries `CORDOBA_RASTER_CLASSIFIED_ZONES_VERIFIED` below — a THIRD, independently
// owned gate, default `false`. It must never read `CORDOBA_ENVELOPE_VERIFIED` (signed 2026-08-03 for
// OCR transcription of the ordinance NUMBER tables) nor `CORDOBA_TRACED_ZONES_VERIFIED` (unsigned,
// for hand-traced GEOMETRY). Three different claims, three different failure modes, three gates.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠⚠⚠ WHAT THIS RESOLVES IS A FAMILY. A FAMILY BINDS NO NUMBER.
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The CUS sheets encode the ordenanza by COLOUR, and the legend has one swatch per FAMILY. The
// SUBZONE — the digit that actually selects the parameters — is printed on the map as a bare bold
// numeral at the block's own rotation, and it is NOT machine-recoverable (measured, see the findings
// doc §OCR: a real general OCR engine detects zero of them across six sheets, and the most common
// subzone digit "1" is typographically indistinguishable from map linework).
//
// That matters because the subzones are NOT interchangeable in `esCordobaPGOU2001.ts`:
//     OA-1  FAR 1.4, front setback null      vs  OA-2  FAR 1.6, front setback 0
//     UAD-1 FAR 1.0 / cov 0.60 / front 4 m   vs  UAD-2 FAR 0.7 / cov 0.40 / front 5 m
//     MC-1…MC-4 differ, and MC's footprint is structurally unresolved anyway
//                                            (`CORDOBA_MC_FONDO_UNRESOLVED_RING`).
// So a resolution from this module can only ever make a REFUSAL more specific — "this land reads as
// Manzana Cerrada on sheet CUS41W, and PRYZM cannot determine which MC subzone applies" — it can
// never authorise a number. `evidence.subzoneResolved` is `false` on every record by construction,
// and a record claiming otherwise is rejected as malformed. This is the §CONTEXT-DATA-HONESTY and
// [[envelope-solid-overstates-partial-data]] discipline applied at the source: an UNKNOWN constraint
// must not be drawn as a bounded one.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THE SAFE SET IS {MC, OA} AND NOT {MC, OA, UAD}
// ══════════════════════════════════════════════════════════════════════════════════════════════
// §12.4 of the feasibility study establishes the governing rule: per-class precision is NOT a
// property of a class, it is a property of (class × the classes co-present on the sheet). Its
// worked example is `Colonia Tradicional Popular`, certified at 100 % precision on two sheets and
// then measured at 86.3 % on CUS25W the moment its collider `Unifamiliar Adosada` (legend swatches
// ~74–78 Chebyshev apart) appeared. A class cannot be observed failing against a collider that is
// absent, so single-sheet precision is systematically optimistic.
//
// Applying that rule to the three families the brief proposed, using the legend swatch distances
// recomputed from §3.1 in this pass:
//   • MC  — nearest colliders `Prot. Tipológica / Campo de la Verdad` (58) and `Uso Comercial` (70).
//           BOTH were co-present with MC on validated sheets, and MC still measured 99.2–100 % on
//           all five. Its one sub-100 % sheet (CUS34W, 99.2 %) is exactly the sheet where PT-CV has
//           ground truth — the collision is real, measured, and small. ✅ MEASURED SAFE.
//   • OA  — one collider within 80: `Elemento protegido` at 42, the TIGHTEST pair in the whole
//           legend. EP has 53 ground-truth parcels on CUS41W and OA still measured 100 % precision
//           there. Its errors run the safe direction (OA truth → predicted EP = recall loss, not a
//           false OA). ✅ MEASURED SAFE against its worst case.
//   • UAD — colliders `Unifamiliar Aislada` (77) and CTP (~74–84). UAD measured 100 % on two sheets
//           — but `Unifamiliar Aislada` appears in the ENTIRE COACo vectorised corpus exactly ONCE
//           (1 polygon, 0.003 km², live-counted this pass) and never on a sheet where UAD was
//           scored. So UAD's 100 % is a two-sheet number taken with its nearest collider absent:
//           structurally the SAME situation that certified CTP at 100 % before CUS25W falsified it,
//           at the SAME swatch separation that produced that failure. ⛔ DROPPED — not because UAD
//           was measured bad, but because it was never measured against the thing that would make
//           it bad, and the brief's own instruction is to drop rather than force such a case.
//
// Everything outside {MC, OA} — including every class the study measured as unreliable
// (`Uso Comercial` 23.4 % pooled precision, `Uso Industrial` 0.9 %, `Elemento protegido` 61.7 %,
// `CTP1-Campo de la Verdad` 68.9 %) and every class it never measured at all — refuses.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THERE IS NO `classification_confidence` FLOAT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// §4 recorded errors at `classification_confidence = 1.000`; §12.3 found that recurs on EVERY sheet
// at 25–41 % of each sheet's errors (35.2 % pooled) and that gating on the score is NON-MONOTONIC —
// on CUS26W a 0.95 threshold is WORSE than no gating at all (80.0 % vs 89.4 %). A single aggregate
// float would therefore be a number that looks like a safety mechanism and is not one. `evidence`
// below carries only quantities that were actually MEASURED for that parcel: pixel counts, the
// nearest-legend Chebyshev distance, the runner-up family, and the sheet's georeference residual.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THREE HONESTY PROPERTIES (mirrors `resolveCordobaTracedZone` / `resolveCordobaSubzone`)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   1. IT NEVER THROWS. Bad point, unloadable dataset, malformed record, no match — all typed refusals.
//   2. IT DOES NOT DECIDE TO RENDER. The dispatcher does, gated on the flag below.
//   3. IT NEVER SILENTLY WIDENS A MATCH. Plain even-odd containment against the exact committed
//      parcel ring — no buffering, no nearest-parcel-within-N-metres. A miss is a miss.
//
// PURITY: L2-pure; the only impure seam is the static JSON import (§BROWSER-SAFE-DATA-LOAD, as in
// `resolveCordobaTracedZone.ts` — this module is reachable from the Vite client bundle, so a
// `node:fs` read here would be a hard browser build failure). OTel span
// `pryzm.zoning.resolveCordobaRasterClassifiedZone` (C58 §1.10 / P8).
//
// Strategic context: resolveCordobaTracedZone.ts (the pattern this file follows), resolveCordobaSubzone.ts,
// cordobaBbox.ts (`isInCordobaMunicipality`), esCordobaPGOU2001.ts (`CORDOBA_PGOU2001_ZONE_CODES`),
// C58 §1.4/§1.5/§1.9/§1.10, §CONTEXT-DATA-HONESTY.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { isInCordobaMunicipality } from './cordobaBbox.js';
// §BROWSER-SAFE-DATA-LOAD — a STATIC import, never `fs.readFileSync`. See the header.
import cordobaRasterClassifiedZonesData from './data/cordobaRasterClassifiedZones.json' with { type: 'json' };

const tracer = trace.getTracer('pryzm.zoning');

// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE HONESTY GATE — INDEPENDENT OF EVERY OTHER CÓRDOBA FLAG, DEFAULT CLOSED
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ⚠⚠⚠ THE HONESTY GATE FOR THIS CAPABILITY ONLY. **UNSIGNED — stays `false` until a human explicitly
 * certifies machine-derived zone FAMILIES for the specific sheets whose records are committed.**
 * While `false`, `applyCordobaRasterClassifiedZoneThenFallback` in `siteDispatch.ts` never dispatches
 * anything sourced from this module — a matched parcel falls through to whatever Córdoba shows a
 * point outside the pilot today (the §L-663 estimate-suppression refusal). Flipping this is a
 * FOUNDER/authorized-signer decision, per the same L-449 discipline `CORDOBA_ENVELOPE_VERIFIED`'s
 * header documents; it is not something a future edit or an agent may do as part of "finishing" this.
 *
 * ⚠ WHAT A SIGN-OFF ON THIS FLAG CANNOT MEAN, stated because it is the trap this capability sets.
 * It cannot mean "the classifier was validated", because the validation and the deployment
 * populations are DISJOINT: all 453 COACo ground-truth polygons lie inside the pilot bbox
 * (live-counted this pass), which the dispatcher routes to the live COACo path BEFORE this resolver
 * is consulted. This module is reachable only on land where no ground truth exists. A signer is
 * therefore accepting a METHOD whose error rate was measured on other land, not records anyone has
 * checked — and §12.4 proved the error rate is a property of each sheet's class composition, which
 * is unknown for the 43 unvectorised sheets. Sign only with that in view.
 *
 * (Typed `boolean`, not the literal `false`, so a consumer's `if (...)` branch stays a real runtime
 * check — mirrors `CORDOBA_ENVELOPE_VERIFIED` / `CORDOBA_TRACED_ZONES_VERIFIED`.)
 */
export const CORDOBA_RASTER_CLASSIFIED_ZONES_VERIFIED: boolean = false;

// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE CLOSED SAFE SET
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The ONLY zone families this pipeline may ever emit. See the file header for the per-family
 * derivation. ⚠ Do not extend this set without re-deriving the SAME cross-sheet, collider-present
 * stability proof §12.4 demands — a class measured only where its collider is absent has not been
 * measured at all.
 */
export const CORDOBA_RASTER_SAFE_ZONE_FAMILIES = ['MC', 'OA'] as const;

export type CordobaRasterZoneFamily = (typeof CORDOBA_RASTER_SAFE_ZONE_FAMILIES)[number];

function isSafeFamily(v: unknown): v is CordobaRasterZoneFamily {
    return typeof v === 'string' &&
        (CORDOBA_RASTER_SAFE_ZONE_FAMILIES as readonly string[]).includes(v);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE RECORD SHAPE
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** A WGS84 point — the frame this resolver is queried by. */
export interface CordobaRasterClassifiedZoneLngLat {
    readonly lat: number;
    readonly lon: number;
}

/**
 * The measured evidence behind one classified parcel. **Every field is a quantity that was actually
 * observed for THIS parcel or THIS sheet** — there is deliberately no aggregate confidence float
 * (see the file header for why the study's own `classification_confidence` was rejected).
 */
export interface CordobaRasterClassificationEvidence {
    /** How the family was derived. Colour is the only method that resolves on this sheet series. */
    readonly method: 'raster_colour_classification';
    /**
     * ⭐ MANDATORY. The CUS sheets' printed UTM grid is **ED50 / UTM 30N**, not ETRS89. Reading them
     * as EPSG:25830 misplaces every feature by ≈ 234 m while looking entirely self-consistent
     * (§2.2 — it would have affected 100 % of sheets and is invisible downstream). Without this
     * field the record is unreproducible.
     */
    readonly sourceCrs: 'EPSG:23030';
    /** Non-rejected pixels inside the 2 m-eroded parcel that voted. Zero ⇒ abstain, never a guess. */
    readonly classifiedPixels: number;
    /** Votes for the winning family. Must be ≤ `classifiedPixels`. */
    readonly winningPixels: number;
    /** Pixels dropped as linework / near-white / off-palette (~51 % sheet-wide, §8b). */
    readonly rejectedPixels: number;
    /** Chebyshev RGB distance from the parcel's mean classified colour to the winning legend swatch. */
    readonly nearestLegendChebyshev: number;
    /** The second-place family, or `null` if the vote was unanimous. Names the real collision risk. */
    readonly runnerUpFamily: string | null;
    /** Measured georeference residual for this sheet, in pixels ≈ metres (§2.2/§12.1: ≤ 5 px). */
    readonly georefResidualPx: number;
    /**
     * A zone-code label read off the map by OCR, if any. **`null` on every record produced from the
     * CUS series** — measured this pass across six sheets: a real OCR engine finds 150–177 text
     * boxes per sheet and NOT ONE is an ordenanza zone code (they are planning-instrument and
     * dotacional labels: PERI, PA, PP, SUP, SG, SGEL, ED, SS-n, MA-n). The field exists so the
     * corroboration rule below is real code rather than a comment, and so a future sheet series that
     * DOES print codes plugs in without a redesign.
     */
    readonly ocrZoneLabel: string | null;
    /** ALWAYS `false`. The subzone digit is not machine-recoverable — see the file header. */
    readonly subzoneResolved: false;
    readonly derived: true;
    readonly official: false;
}

/** One classified Catastro parcel, as committed in `./data/cordobaRasterClassifiedZones.json`. */
export interface CordobaRasterClassifiedZoneRecord {
    /** The zone FAMILY (not a pack zone code — see the header). Must be in the closed safe set. */
    readonly zoneFamily: CordobaRasterZoneFamily;
    /** The Catastro parcel this label is snapped to, e.g. `3632807UG4933S`. */
    readonly refcat: string;
    /** The parcel's outer ring, `[lon, lat]` pairs, WGS84. Not necessarily closed. */
    readonly ring: ReadonlyArray<readonly [number, number]>;
    /** The CUS sheet the colour was read from, e.g. `CUS41W`. */
    readonly sourceSheet: string;
    /** ISO date the classification run was made. */
    readonly classifiedDate: string;
    readonly evidence: CordobaRasterClassificationEvidence;
    /** Full provenance sentence — machine-derived-unverified, never presented as municipal data. */
    readonly provenance: string;
}

/** Injectable dependencies so the adapter is unit-testable without the packaged asset. */
export interface CordobaRasterClassifiedZoneDeps {
    readonly records?: ReadonlyArray<CordobaRasterClassifiedZoneRecord>;
}

/** Why a resolution refused. Closed vocabulary — every member is operationally distinct. */
export type CordobaRasterClassifiedZoneRefusalReason =
    /** No usable WGS84 point was supplied. */
    | 'no-point'
    /** Outside even the loose Córdoba MUNICIPAL bbox — not this store's business. */
    | 'out-of-cordoba'
    /** The record set could not be loaded/parsed (a packaging defect, not a user condition). */
    | 'data-unavailable'
    /** A parcel matched but its family is not in the closed safe set — the §12.4 guard. */
    | 'family-not-in-safe-set'
    /** A parcel matched but its evidence record is internally inconsistent. */
    | 'malformed-record'
    /** A parcel matched but its OCR label and its colour family disagree — never pick a winner. */
    | 'evidence-conflict'
    /** In Córdoba municipality, but no classified parcel covers this point. */
    | 'no-classified-zone-here';

export interface CordobaRasterClassifiedZoneResolution {
    /** ⚠ A FAMILY, not a pack zone code. Binds NO numeric parameter — see the file header. */
    readonly zoneFamily: CordobaRasterZoneFamily;
    readonly refcat: string;
    readonly ring: ReadonlyArray<readonly [number, number]>;
    readonly sourceSheet: string;
    readonly classifiedDate: string;
    readonly evidence: CordobaRasterClassificationEvidence;
    /** ⚠ State this verbatim next to anything this resolution feeds. */
    readonly provenance: string;
}

export type CordobaRasterClassifiedZoneResult =
    | { readonly ok: true; readonly resolution: CordobaRasterClassifiedZoneResolution }
    | { readonly ok: false; readonly reason: CordobaRasterClassifiedZoneRefusalReason };

/**
 * The committed extract, statically bundled. Throws only if the packaged asset is malformed (a
 * packaging bug); `resolveCordobaRasterClassifiedZone` wraps this in try/catch and turns any throw
 * into a typed refusal.
 */
export function loadCordobaRasterClassifiedZoneRecords(): CordobaRasterClassifiedZoneRecord[] {
    return cordobaRasterClassifiedZonesData as unknown as CordobaRasterClassifiedZoneRecord[];
}

/**
 * Even-odd (ray-casting) point-in-polygon against a WGS84-degree ring. PURE.
 *
 * Degrees, not a projected metric CRS — deliberately, and for the identical reason
 * `resolveCordobaTracedZone.ts` documents: containment has no distance term, so the degree
 * distortion at Córdoba's latitude is orders of magnitude below the georeferencing uncertainty the
 * record itself declares (`georefResidualPx`, metres). Reprojecting would add complexity, not accuracy.
 */
function pointInRingEvenOdd(
    lon: number, lat: number, ring: ReadonlyArray<readonly [number, number]>,
): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i];
        const b = ring[j];
        if (!a || !b) continue;
        const [xi, yi] = a;
        const [xj, yj] = b;
        const intersects =
            yi > lat !== yj > lat &&
            lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
        if (intersects) inside = !inside;
    }
    return inside;
}

/**
 * The family a printed zone-code label implies, or `null` if the string is not a code this
 * jurisdiction's pack recognises. Used ONLY for corroboration — an unrecognised string is treated as
 * a MISREAD (and so refuses), never as evidence of a zone the pack has never heard of. This is the
 * guard against the real hazard measured on these sheets: OCR readily returns plausible-looking
 * planning-instrument codes such as `MA-4`, `LE-2` and `B-6`, which are one character away from
 * looking like an ordenanza code.
 */
function familyOfZoneLabel(label: string): string | null {
    const m = /^([A-Z]{2,3})-?\d?$/i.exec(label.trim());
    if (!m || !m[1]) return null;
    const fam = m[1].toUpperCase();
    // The closed pack vocabulary (`CORDOBA_PGOU2001_ZONE_CODES`), by family prefix.
    return ['PAS', 'OA', 'UAD', 'CTP', 'MC', 'PTC', 'UAS'].includes(fam) ? fam : null;
}

/**
 * Validate one record's internal consistency. Returns a refusal reason, or `null` when the record is
 * usable. Split out so the rules are individually readable and individually testable.
 */
function refusalForRecord(
    rec: CordobaRasterClassifiedZoneRecord,
): CordobaRasterClassifiedZoneRefusalReason | null {
    if (!isSafeFamily(rec.zoneFamily)) return 'family-not-in-safe-set';

    const ev = rec.evidence;
    if (!ev || typeof ev !== 'object') return 'malformed-record';
    if (ev.subzoneResolved !== false) return 'malformed-record';
    if (ev.derived !== true || ev.official !== false) return 'malformed-record';
    if (ev.sourceCrs !== 'EPSG:23030') return 'malformed-record';
    if (!Number.isFinite(ev.classifiedPixels) || ev.classifiedPixels <= 0) return 'malformed-record';
    if (!Number.isFinite(ev.winningPixels) || ev.winningPixels <= 0) return 'malformed-record';
    if (ev.winningPixels > ev.classifiedPixels) return 'malformed-record';

    // §MULTI-EVIDENCE — where two independent signals exist they must AGREE. Never prefer one.
    if (ev.ocrZoneLabel != null) {
        const fam = familyOfZoneLabel(ev.ocrZoneLabel);
        if (fam == null || fam !== rec.zoneFamily) return 'evidence-conflict';
    }
    return null;
}

/**
 * PURE core: resolve a WGS84 point against an ALREADY-LOADED record set. Exported separately from
 * the async wrapper so tests exercise the geometry and the guards against a tiny fixture without
 * swapping the module's static import.
 *
 * ⚠ SCALE NOTE — SHOULD-DO, NOT A BLOCKER TODAY. A plain O(n) linear scan, exactly as
 * `resolveCordobaTracedZoneFromRecords` documents. If a future pass populates this file with the
 * ~55 750 parcels a citywide run would produce (§7), replace the scan with a bbox-keyed spatial
 * index BEFORE that lands — at that size the scan is the wrong shape, not merely slow.
 */
export function resolveCordobaRasterClassifiedZoneFromRecords(
    point: CordobaRasterClassifiedZoneLngLat | null | undefined,
    records: ReadonlyArray<CordobaRasterClassifiedZoneRecord>,
): CordobaRasterClassifiedZoneResult {
    if (
        !point ||
        typeof point.lat !== 'number' ||
        typeof point.lon !== 'number' ||
        !Number.isFinite(point.lat) ||
        !Number.isFinite(point.lon)
    ) {
        return { ok: false, reason: 'no-point' };
    }
    if (!isInCordobaMunicipality(point.lat, point.lon)) {
        return { ok: false, reason: 'out-of-cordoba' };
    }
    for (const rec of records) {
        if (!rec || !Array.isArray(rec.ring) || rec.ring.length < 3) continue;
        if (!pointInRingEvenOdd(point.lon, point.lat, rec.ring)) continue;

        // A parcel MATCHED. From here every exit is either this record's answer or this record's
        // refusal — we do NOT keep scanning for a more agreeable record underneath it. Falling
        // through to a second overlapping parcel after rejecting the first would silently convert a
        // guard into a search for something that passes.
        const bad = refusalForRecord(rec);
        if (bad) return { ok: false, reason: bad };
        return {
            ok: true,
            resolution: {
                zoneFamily: rec.zoneFamily,
                refcat: rec.refcat,
                ring: rec.ring,
                sourceSheet: rec.sourceSheet,
                classifiedDate: rec.classifiedDate,
                evidence: rec.evidence,
                provenance: rec.provenance,
            },
        };
    }
    return { ok: false, reason: 'no-classified-zone-here' };
}

/**
 * Resolve a Córdoba parcel's zone FAMILY against the raster-classified store, for land neither the
 * COACo pilot nor the hand-traced store covers. NEVER throws — every failure is a typed refusal.
 *
 * Kept `async` (trivially resolving) to match the call-site shape shared with
 * `resolveCordobaSubzone` / `resolveCordobaTracedZone` — no network I/O actually happens.
 */
export async function resolveCordobaRasterClassifiedZone(
    point: CordobaRasterClassifiedZoneLngLat | null | undefined,
    deps: CordobaRasterClassifiedZoneDeps = {},
): Promise<CordobaRasterClassifiedZoneResult> {
    const span = tracer.startSpan('pryzm.zoning.resolveCordobaRasterClassifiedZone');
    span.setAttribute('provider', 'cordoba-raster-classified-zone-offline');
    try {
        let records: ReadonlyArray<CordobaRasterClassifiedZoneRecord>;
        try {
            records = deps.records ?? loadCordobaRasterClassifiedZoneRecords();
        } catch (err) {
            console.warn(
                '[cordoba-raster-zone] data load failed (non-fatal):', (err as Error)?.message ?? err,
            );
            span.setAttribute('resultFields', 'data-unavailable');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'data-unavailable' };
        }

        const result = resolveCordobaRasterClassifiedZoneFromRecords(point, records);
        span.setAttribute('resultFields', result.ok ? 'ok' : result.reason);
        if (result.ok) span.setAttribute('zoneFamily', result.resolution.zoneFamily);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn(
            '[cordoba-raster-zone] unexpected error (non-fatal):', (err as Error)?.message ?? err,
        );
        return { ok: false, reason: 'data-unavailable' };
    } finally {
        span.end();
    }
}
