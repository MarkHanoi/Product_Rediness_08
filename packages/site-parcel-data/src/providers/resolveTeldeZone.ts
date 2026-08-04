// Telde (INE 35026, Gran Canaria) — the SIPU `EDIF` per-point zone resolver.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS IS AN OFFLINE SHAPEFILE JOIN, NOT A LIVE WFS CALL (rewritten 2026-08-04)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The ORIGINAL version of this file was written like `resolveZaragozaZone` / `resolveCordobaSubzone`
// — an injectable same-origin proxy fetch — because IDECanarias' live WFS was measured
// administratively disabled and no `server/telde*Proxy.js` existed to stand behind. That is a real,
// still-true fact about IDECanarias. But it was the WRONG DEPENDENCY: Telde's own SIPU package —
// the EXACT zip already cited in `esTeldePgo2003.ts`
// (`030319-pgo-ad-itpu-150323-210504-sipu.zip`, `opendata.sitcan.es`, 9 081 608 bytes, downloaded
// and verified 2026-08-04) — ships `02SIST/EDIF.shp` + `02SIST/EDIF.dbf` (the zone-polygon
// GEOMETRY, ESRI shapefile, 2 643 records / 46 distinct `ETIQUETA` codes) in the SAME archive as
// `02SIST/TMP/EDIF.mdb` (the numeric attributes `esTeldePgo2003.ts` already transcribed). IDECanarias
// was never actually load-bearing for the zone-code lookup — only for a service PRYZM does not need,
// because the publisher ships the geometry as a static download already in hand.
//
// This resolver is therefore now the El Sauzal pattern (`resolveElSauzalZone.ts`), not the
// Zaragoza/Córdoba one: an OFFLINE point-in-polygon join against a committed extract
// (`./data/teldeEdif.json`, 2 643 records, produced by a byte-level DBF/SHP parse — the SAME
// container `sipuShapefile.ts` implements — of the real downloaded `EDIF.shp`/`EDIF.dbf` pair,
// coordinates rounded to 0.1 m). `EDIF.prj` states the identical CRS parameters El Sauzal's
// `ZUSO.prj` does (`WGS_1984_UTM_Zone_28N`, EPSG:32628, `Central_Meridian -15.0`,
// `Scale_Factor 0.9996`, `False_Easting 500000.0`) — confirmed byte-for-byte identical text, not
// assumed — so this file REUSES `wgs84ToUtm28N` / `pointInRingsEvenOdd` from
// `resolveElSauzalZone.ts` rather than re-deriving the same projection.
//
// ⚠⚠ WHAT THIS FILE DOES **NOT** GIVE YOU: `EDIF.shp`/`EDIF.dbf`'s field list is
// `ETIQUETA, CODIGO, ETIPLAN, TXTPLAN, OBS, PDF, ORIG_FID, CODIGO_, CAPA` — geometry + zone CODE
// only, verified against the real DBF header this session. It carries NONE of `SepMinFr` /
// `PMaxOcup` / `EdifMax` / `AltMaxPl` / `DispObl` / `FonMaxEdm` — those live in `EDIF.mdb`
// (a different file format, not parsed by this module) and are the numbers `esTeldePgo2003.ts`
// already transcribed PER ZONE CODE. That is not a gap for this resolver's actual job: the
// dispatcher (`applyTeldeZoningThenFallback` in `siteDispatch.ts`) only ever reads a resolved
// `zoneCode` off this module — every number it might one day render comes from the PACK, keyed by
// that code, never from a per-parcel attribute this file would have to supply. The one thing this
// file's row content COULD have told the dispatcher — whether a zone is `DispObl = GRF` (graphed) —
// is ALSO invariant per zone code (a typology property, not a per-polygon one), so
// `esTeldePgo2003.ts`'s `TELDE_GRAPHED_ZONE_CODES` (derived from the same `TELDE_UNPACKED_ZONES`
// citations, not re-guessed here) supplies it statically instead.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THREE HONESTY PROPERTIES (mirrors `resolveElSauzalZone` / `resolveCordobaSubzone`)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   1. IT NEVER THROWS. A malformed point, an unloadable dataset, or a point outside every EDIF
//      polygon all return a typed refusal.
//   2. IT DOES NOT DECIDE TO RENDER. It resolves the zone CODE only; the dispatcher decides,
//      gated on `CANARIAS_ENVELOPE_VERIFIED` (default OFF, still false, still a founder-only flip).
//   3. IT NEVER SILENTLY DROPS A MATCHED-BUT-UNPACKED CODE. A real hit on e.g. `A1` or `INDEF`
//      resolves `ok: true` with that code; whether it is packed is `esTeldePgo2003.ts`'s
//      `TELDE_PGO2003_ZONE_CODES` question, answered by the DISPATCHER, not discarded here.
//
// PURITY: the projection + point-in-polygon core (`resolveTeldeZoneFromRecords`) is L2-pure — no
// I/O, no clock, no RNG. `loadTeldeEdifRecords` is the ONE impure seam (a bundled static import),
// injectable via `deps.records` so tests never depend on the packaged asset. OTel span
// `pryzm.zoning.resolveTeldeZone` (C58 §1.10 / P8).
//
// Strategic context — esCanariasSipu.ts, esTeldePgo2003.ts, canariasSipuProvider.ts,
// resolveElSauzalZone.ts (the pattern this file now follows), containers/sipuShapefile.ts (the
// parser used to PRODUCE `./data/teldeEdif.json`, offline, not at runtime), teldeBbox.ts,
// C58 §1.4/§1.5/§1.9/§1.10, §CONTEXT-DATA-HONESTY.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { wgs84ToUtm28N, pointInRingsEvenOdd, type Utm28NPoint } from './resolveElSauzalZone.js';
// §BROWSER-SAFE-DATA-LOAD — a STATIC import, not `fs.readFileSync`. This module is reachable from
// the client bundle (`siteDispatch.ts`'s `applyTeldeZoningThenFallback`), and Vite's browser build
// stubs `node:fs` — a runtime `readFileSync` call here would be a hard build failure there. A
// static import lets the bundler (Vite client-side, tsx/Node server-side) embed the 2 643-record
// extract as ordinary bundled data in either environment, mirroring `elSauzalZuso.json`'s load.
import teldeEdifData from './data/teldeEdif.json' with { type: 'json' };

const tracer = trace.getTracer('pryzm.zoning');

/** A WGS84 point — the frame the resolver queries the EDIF zone by. */
export interface TeldeLngLat {
    readonly lat: number;
    readonly lon: number;
}

/** One `EDIF.dbf` `ETIQUETA` record, as committed in `./data/teldeEdif.json`. */
export interface TeldeEdifRecord {
    /** The real zone code (`EDIF.dbf` `ETIQUETA`), e.g. `E`, `D1`, `INDEF`. */
    readonly etiqueta: string;
    /** Polygon rings in EPSG:32628 metres, `[[ [x,y], [x,y], … ], …]` — shell(s) + holes, mixed. */
    readonly rings: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
}

/** Injectable dependencies so the adapter is unit-testable without the packaged asset. */
export interface TeldeZoneDeps {
    /** Override the EDIF record set (tests inject a tiny fixture; production loads the real file). */
    readonly records?: ReadonlyArray<TeldeEdifRecord>;
}

/** Why a Telde `EDIF` zone resolution refused. Closed vocabulary — operationally distinct. */
export type TeldeZoneRefusalReason =
    /** No usable WGS84 point was supplied — nothing to intersect the EDIF layer by. */
    | 'no-point'
    /** The record set could not be loaded/parsed (a packaging defect, not a user condition). */
    | 'data-unavailable'
    /** The point-in-polygon test matched no `EDIF` record at this point. */
    | 'no-zone';

export interface TeldeZoneResolution {
    /** The raw `ETIQUETA` value, verbatim (e.g. `E`, `D1`, `INDEF`). */
    readonly zoneCode: string;
}

export type TeldeZoneResult =
    | { readonly ok: true; readonly resolution: TeldeZoneResolution }
    | { readonly ok: false; readonly reason: TeldeZoneRefusalReason };

/**
 * The committed `teldeEdif.json` extract (2 643 records, 46 distinct `ETIQUETA` codes), statically
 * bundled — see the §BROWSER-SAFE-DATA-LOAD import note above. Throws only if the packaged asset is
 * malformed (a packaging bug, not a runtime/user condition); `resolveTeldeZone` wraps every call to
 * this in a try/catch and turns any throw into a typed refusal.
 */
export function loadTeldeEdifRecords(): TeldeEdifRecord[] {
    return teldeEdifData as unknown as TeldeEdifRecord[];
}

/**
 * PURE core: resolve a WGS84 point against an ALREADY-LOADED record set. Exported separately from
 * `resolveTeldeZone` so tests exercise the geometry against a tiny fixture OR the real committed
 * data, without needing the module's static import to be swapped out.
 */
export function resolveTeldeZoneFromRecords(
    point: TeldeLngLat | null | undefined,
    records: ReadonlyArray<TeldeEdifRecord>,
): TeldeZoneResult {
    if (
        !point ||
        typeof point.lat !== 'number' ||
        typeof point.lon !== 'number' ||
        !Number.isFinite(point.lat) ||
        !Number.isFinite(point.lon)
    ) {
        return { ok: false, reason: 'no-point' };
    }

    const projected: Utm28NPoint = wgs84ToUtm28N(point.lat, point.lon);
    for (const rec of records) {
        if (pointInRingsEvenOdd(projected, rec.rings)) {
            const zoneCode = rec.etiqueta.trim();
            if (zoneCode === '') continue;
            return { ok: true, resolution: { zoneCode } };
        }
    }
    return { ok: false, reason: 'no-zone' };
}

/**
 * Resolve a Telde parcel's SIPU `EDIF` zone code (`ES_TELDE_PGO2003_PACK` covers 31 of its 46
 * codes) at a WGS84 point, against the committed offline shapefile extract
 * (`030319-pgo-ad-itpu-150323-210504-sipu.zip`'s `EDIF.shp`/`EDIF.dbf`, `opendata.sitcan.es`).
 * NEVER throws — every failure is a typed refusal (three honesty properties in the header).
 *
 * Kept `async` (trivially resolving) to preserve the call-site shape shared with
 * `resolveZaragozaZone` / `resolveCordobaSubzone` — the dispatcher's `await` does not need to
 * change even though this resolver's own work is now synchronous.
 *
 * @param point  the parcel query point (WGS84).
 * @param deps   injectable record set (tests only; production loads the real committed extract).
 */
export async function resolveTeldeZone(
    point: TeldeLngLat | null | undefined,
    deps: TeldeZoneDeps = {},
): Promise<TeldeZoneResult> {
    const span = tracer.startSpan('pryzm.zoning.resolveTeldeZone');
    span.setAttribute('provider', 'sipu-edif-telde-offline');
    try {
        let records: ReadonlyArray<TeldeEdifRecord>;
        try {
            records = deps.records ?? loadTeldeEdifRecords();
        } catch (err) {
            console.warn('[telde-zone] data load failed (non-fatal):', (err as Error)?.message ?? err);
            span.setAttribute('resultFields', 'data-unavailable');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'data-unavailable' };
        }

        const result = resolveTeldeZoneFromRecords(point, records);
        span.setAttribute('resultFields', result.ok ? 'ok' : result.reason);
        if (result.ok) span.setAttribute('zoneCode', result.resolution.zoneCode);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
    } catch (err) {
        // Defensive: the whole path is best-effort — never throw into the caller.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn('[telde-zone] unexpected error (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false, reason: 'data-unavailable' };
    } finally {
        span.end();
    }
}
