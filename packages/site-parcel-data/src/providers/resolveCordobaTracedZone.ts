// Córdoba (INE 14021) — the TRACED-ZONE resolver: a point-in-polygon lookup against PRYZM's OWN
// hand-traced reading of the PGOU-2001 CUS calificación sheets, for the ≈92 % of Córdoba's urban
// fabric that sits OUTSIDE the COACo two-district (Sur + Noroeste) pilot `resolveCordobaSubzone`
// answers. See `docs/04-reference/jurisdictions/es/es-an/14021-cordoba/findings/
// TRACED-ZONE-SERVICE-2026-08-05.md` for the full design note and the "how to add a polygon"
// instructions for a future tracing pass.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS, AND — LOUDLY — WHAT IT IS NOT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `resolveCordobaSubzone.ts` binds a parcel to its subzone via a LIVE query against the COACo
// GeoServer's own vectorised `coaco:ordenanzas` layer — published, authoritative-in-its-own-scope
// geometry, just narrow in COVERAGE (2 districts). This module is the OPPOSITE trade: it widens
// coverage by substituting PRYZM's OWN eyeball-traced reading of a scanned zoning sheet
// (`END-TO-END-PROOF-2026-08-04.md`) for a polygon the publisher has not vectorised. That is a
// materially WEAKER source than a WFS answer — no municipal service stands behind a single vertex
// of `./data/cordobaTracedZones.json` — and the honesty apparatus in this file exists entirely to
// keep that difference visible all the way to the dispatcher and the eventual UI copy.
//
// ⚠⚠ THIS DOES NOT INHERIT `CORDOBA_ENVELOPE_VERIFIED`. That flag (`esCordobaZoneClassification.ts`)
// was signed 2026-08-03 for a DIFFERENT claim: that the OCR transcription of the PGOU-2001's NUMERIC
// ordinance tables (setbacks, FAR, coverage, height) matches the source PDFs. It says nothing about
// whether a hand-traced GEOMETRY reading of a scanned map is trustworthy — a different skill, a
// different failure mode (the END-TO-END-PROOF doc's own §Stage 3 records a real near-miss: the
// first cluster picked by eye was the WRONG zone family, caught only by RGB-sampling the legend
// swatch), and a claim nobody has certified. `CORDOBA_TRACED_ZONES_VERIFIED` below is therefore a
// SEPARATE, independently-owned gate, default `false`, and nothing in this codebase may read the
// OTHER flag as authorization for this capability. Piggy-backing the two gates would let a human's
// sign-off on ONE claim ("the numbers are transcribed correctly") silently authorize a totally
// different, unreviewed claim ("the geometry is traced correctly") — exactly the kind of
// scope-creeping gate the whole §CONTEXT-DATA-HONESTY discipline exists to prevent.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS IS AN OFFLINE STATIC-DATA JOIN, NOT A LIVE FETCH (mirrors `resolveTeldeZone.ts`)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// There is no service to query — the whole point of this module is that COACo/GMU do NOT publish
// vector geometry for this land. The traced polygons are committed data
// (`./data/cordobaTracedZones.json`, WGS84 lon/lat — see that file's header for the CRS derivation
// and provenance string). At today's scale (ONE polygon) a plain linear scan over every record is
// the entire "index" — see `resolveCordobaTracedZoneFromRecords` below for the explicit note on
// when that stops being fine.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THREE HONESTY PROPERTIES (mirrors `resolveCordobaSubzone` / `resolveTeldeZone`)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   1. IT NEVER THROWS. A malformed point, an unloadable dataset, or a point outside every traced
//      polygon all return a typed refusal.
//   2. IT DOES NOT DECIDE TO RENDER. It resolves the zone CODE + polygon only; the dispatcher
//      (`applyCordobaTracedZoneThenFallback` in `siteDispatch.ts`) decides, gated on
//      `CORDOBA_TRACED_ZONES_VERIFIED` (default OFF — see the gate's own header below).
//   3. IT NEVER SILENTLY WIDENS A MATCH. `pointInRingEvenOdd` is a plain even-odd test against the
//      EXACT traced ring — no buffering, no "nearest polygon within N metres". A miss is a miss.
//
// PURITY: L2-pure. `resolveCordobaTracedZoneFromRecords` is a pure function of its inputs; the only
// impure seam is `loadCordobaTracedZoneRecords`'s static JSON import (mirrors `resolveTeldeZone.ts`'s
// `§BROWSER-SAFE-DATA-LOAD` note — a static `import ... with { type: 'json' }`, never `fs.readFile`,
// so this module stays reachable from the Vite client bundle). OTel span
// `pryzm.zoning.resolveCordobaTracedZone` (C58 §1.10 / P8).
//
// Strategic context — resolveCordobaSubzone.ts, resolveTeldeZone.ts (the pattern this file follows),
// cordobaBbox.ts (`isInCordobaMunicipality`, the outer coverage gate), esCordobaPGOU2001.ts
// (`CORDOBA_PGOU2001_ZONE_CODES` — the closed vocabulary a traced `zoneCode` must belong to before a
// caller trusts it), findings/END-TO-END-PROOF-2026-08-04.md, findings/TRACED-ZONE-SERVICE-2026-08-05.md,
// C58 §1.4/§1.5/§1.9/§1.10, §CONTEXT-DATA-HONESTY.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { isInCordobaMunicipality } from './cordobaBbox.js';
// §BROWSER-SAFE-DATA-LOAD — a STATIC import, not `fs.readFileSync` (see `resolveTeldeZone.ts`'s
// identical note). This module is reachable from the client bundle
// (`siteDispatch.ts`'s `applyCordobaTracedZoneThenFallback`), and Vite's browser build stubs
// `node:fs` — a runtime `readFileSync` call here would be a hard build failure there.
import cordobaTracedZonesData from './data/cordobaTracedZones.json' with { type: 'json' };

const tracer = trace.getTracer('pryzm.zoning');

// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE HONESTY GATE — INDEPENDENT OF `CORDOBA_ENVELOPE_VERIFIED`, DEFAULT CLOSED
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ⚠⚠⚠ THE HONESTY GATE FOR THIS CAPABILITY ONLY. **UNSIGNED — stays `false` until a human explicitly
 * certifies the traced-zone GEOMETRY (not the ordinance numbers; see the file header for why those
 * are different claims).** While `false`, `applyCordobaTracedZoneThenFallback` in `siteDispatch.ts`
 * never dispatches a computed envelope from this source — a matched traced polygon still falls
 * through to whatever Córdoba would otherwise show a point outside the COACo pilot (today: the
 * §L-663 estimate-suppression refusal, via the registered `CORDOBA_MUNICIPAL_JURISDICTION_ID`
 * coverage). Flipping this to `true` is a FOUNDER/authorized-signer decision, per the same L-449
 * discipline `CORDOBA_ENVELOPE_VERIFIED`'s header documents — it is not something a future edit or
 * an agent may do as part of "finishing" this feature.
 *
 * WHAT A SIGN-OFF ON THIS FLAG SHOULD MEAN (the QA methodology named, not built — this is the next
 * gate, per `TRACED-ZONE-SERVICE-2026-08-05.md`): an independent human re-derivation of at least the
 * corner/grid-tick coordinates and the legend-swatch RGB match for EVERY polygon in
 * `./data/cordobaTracedZones.json` — the same two failure modes the END-TO-END-PROOF doc names as
 * real, demonstrated risks (an extrapolated corner, a colour-confused zone family) — not merely a
 * visual "does this pentagon look plausible on the map" check.
 *
 * (Typed `boolean`, not the literal `false`, so a consumer's `if (CORDOBA_TRACED_ZONES_VERIFIED)`
 * compute branch stays a real runtime check, mirroring `CORDOBA_ENVELOPE_VERIFIED`'s identical note.)
 */
export const CORDOBA_TRACED_ZONES_VERIFIED: boolean = false;

// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE STORE — a committed extract, WGS84 lon/lat (see `./data/cordobaTracedZones.json`'s header)
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** A WGS84 point — the frame this resolver queries the traced-zone store by. */
export interface CordobaTracedZoneLngLat {
    readonly lat: number;
    readonly lon: number;
}

/**
 * One hand-traced zone polygon, as committed in `./data/cordobaTracedZones.json`. See that file's
 * `provenance` field (carried verbatim into `CordobaTracedZoneResolution.provenance`) for the
 * per-record derivation. `ring` is a single outer ring, `[lon, lat]` pairs, WGS84 (EPSG:4326) —
 * PRYZM's own reprojection of the UTM(EPSG:25830) trace via `geometry/nativeCrs.ts`'s
 * `nativeToWgs84`, chosen over shipping the UTM figures directly so this file stays readable by a
 * human or a generic GeoJSON tool without a projection library.
 */
export interface CordobaTracedZoneRecord {
    /** Must be a code the pack actually carries (`CORDOBA_PGOU2001_ZONE_CODES`) — see the header. */
    readonly zoneCode: string;
    /** The CUS calificación sheet this polygon was traced off, e.g. `CUS20W.jpg`. */
    readonly sourceSheet: string;
    /** ISO date the trace was made (not when this file was edited). */
    readonly tracedDate: string;
    /** Full provenance sentence — machine-traced-unverified, never presented as municipal data. */
    readonly provenance: string;
    /** Outer ring only, `[lon, lat]` pairs, WGS84. Not necessarily closed (first ≠ last is fine). */
    readonly ring: ReadonlyArray<readonly [number, number]>;
}

/** Injectable dependencies so the adapter is unit-testable without the packaged asset. */
export interface CordobaTracedZoneDeps {
    /** Override the traced-zone record set (tests inject a tiny fixture; production loads the real file). */
    readonly records?: ReadonlyArray<CordobaTracedZoneRecord>;
}

/** Why a Córdoba traced-zone resolution refused. Closed vocabulary — operationally distinct. */
export type CordobaTracedZoneRefusalReason =
    /** No usable WGS84 point was supplied — nothing to intersect the traced store by. */
    | 'no-point'
    /** The point falls outside even the loose Córdoba MUNICIPAL bbox — not this store's business. */
    | 'out-of-cordoba'
    /** The record set could not be loaded/parsed (a packaging defect, not a user condition). */
    | 'data-unavailable'
    /** In Córdoba municipality, but no committed traced polygon covers this point. */
    | 'no-traced-zone-here';

export interface CordobaTracedZoneResolution {
    /** The zone code the matched polygon carries, e.g. `PAS-2`. */
    readonly zoneCode: string;
    /** The matched polygon's outer ring, `[lon, lat]` pairs, WGS84 — for parcel-boundary construction. */
    readonly ring: ReadonlyArray<readonly [number, number]>;
    readonly sourceSheet: string;
    readonly tracedDate: string;
    /** ⚠ Always state this verbatim next to any number this resolution feeds — see the file header. */
    readonly provenance: string;
}

export type CordobaTracedZoneResult =
    | { readonly ok: true; readonly resolution: CordobaTracedZoneResolution }
    | { readonly ok: false; readonly reason: CordobaTracedZoneRefusalReason };

/**
 * The committed `cordobaTracedZones.json` extract, statically bundled (see the
 * §BROWSER-SAFE-DATA-LOAD import note above). Throws only if the packaged asset is malformed (a
 * packaging bug, not a runtime/user condition); `resolveCordobaTracedZone` wraps every call to this
 * in a try/catch and turns any throw into a typed refusal.
 */
export function loadCordobaTracedZoneRecords(): CordobaTracedZoneRecord[] {
    return cordobaTracedZonesData as unknown as CordobaTracedZoneRecord[];
}

/**
 * Even-odd (ray-casting) point-in-polygon test against a single WGS84-degree ring. PURE.
 *
 * ⚠ DEGREES, NOT A PROJECTED METRIC CRS — deliberately, and unlike `geometry/nativeCrs.ts`'s
 * §NATIVE-CRS-MEASUREMENT discipline for street-WIDTH measurement. That discipline exists because a
 * 4-decimal-degree serialisation loses metres on a DISTANCE calculation; a point-in-polygon
 * containment test has no such failure mode at Córdoba's latitude and this polygon's size (a
 * ~75 m-across pentagon) — the degree distortion here is many orders of magnitude below the
 * traced geometry's own georeferencing uncertainty (the END-TO-END-PROOF doc's own top-edge-northing
 * caveat is metres, not millimetres). Reprojecting to UTM for this containment test would add
 * complexity without adding accuracy.
 */
function pointInRingEvenOdd(
    lon: number, lat: number, ring: ReadonlyArray<readonly [number, number]>,
): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]!;
        const [xj, yj] = ring[j]!;
        const intersects =
            yi > lat !== yj > lat &&
            lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
        if (intersects) inside = !inside;
    }
    return inside;
}

/**
 * PURE core: resolve a WGS84 point against an ALREADY-LOADED traced-zone record set. Exported
 * separately from `resolveCordobaTracedZone` so tests exercise the geometry against a tiny fixture
 * OR the real committed data, without needing the module's static import to be swapped out.
 *
 * ⚠ SCALE NOTE — SHOULD-DO, NOT A BLOCKER TODAY. This is a plain O(n) linear scan over every
 * record's ring. Fine at today's scale (ONE polygon; the docstring in
 * `TRACED-ZONE-SERVICE-2026-08-05.md` sizes a realistic future store at "dozens to low-hundreds").
 * If a future tracing pass grows this file into the thousands of polygons, replace the scan with a
 * real spatial index (e.g. an R-tree keyed on each ring's bbox, checked before the exact even-odd
 * test) — do NOT reach for that machinery pre-emptively for one polygon.
 */
export function resolveCordobaTracedZoneFromRecords(
    point: CordobaTracedZoneLngLat | null | undefined,
    records: ReadonlyArray<CordobaTracedZoneRecord>,
): CordobaTracedZoneResult {
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
        if (pointInRingEvenOdd(point.lon, point.lat, rec.ring)) {
            return {
                ok: true,
                resolution: {
                    zoneCode: rec.zoneCode,
                    ring: rec.ring,
                    sourceSheet: rec.sourceSheet,
                    tracedDate: rec.tracedDate,
                    provenance: rec.provenance,
                },
            };
        }
    }
    return { ok: false, reason: 'no-traced-zone-here' };
}

/**
 * Resolve a Córdoba parcel's zone code + polygon against PRYZM's own hand-traced CUS-sheet reading,
 * for land the COACo pilot (`resolveCordobaSubzone`) does not cover. NEVER throws — every failure is
 * a typed refusal (three honesty properties in the file header).
 *
 * Kept `async` (trivially resolving) to match the call-site shape shared with
 * `resolveCordobaSubzone` / `resolveTeldeZone` — no network I/O actually happens.
 *
 * @param point  the parcel query point (WGS84).
 * @param deps   injectable record set (tests only; production loads the real committed extract).
 */
export async function resolveCordobaTracedZone(
    point: CordobaTracedZoneLngLat | null | undefined,
    deps: CordobaTracedZoneDeps = {},
): Promise<CordobaTracedZoneResult> {
    const span = tracer.startSpan('pryzm.zoning.resolveCordobaTracedZone');
    span.setAttribute('provider', 'cordoba-traced-zone-offline');
    try {
        let records: ReadonlyArray<CordobaTracedZoneRecord>;
        try {
            records = deps.records ?? loadCordobaTracedZoneRecords();
        } catch (err) {
            console.warn('[cordoba-traced-zone] data load failed (non-fatal):', (err as Error)?.message ?? err);
            span.setAttribute('resultFields', 'data-unavailable');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'data-unavailable' };
        }

        const result = resolveCordobaTracedZoneFromRecords(point, records);
        span.setAttribute('resultFields', result.ok ? 'ok' : result.reason);
        if (result.ok) span.setAttribute('zoneCode', result.resolution.zoneCode);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
    } catch (err) {
        // Defensive: the whole path is best-effort — never throw into the caller.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn('[cordoba-traced-zone] unexpected error (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false, reason: 'data-unavailable' };
    } finally {
        span.end();
    }
}
