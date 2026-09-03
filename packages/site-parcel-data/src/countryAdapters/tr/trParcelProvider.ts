// LANE ME-OPEN — TURKEY · the KEYLESS parcel leg: TKGM point→parcel GeoJSON at a WGS84 point →
// FetchOutcome<TrParsel>. Field shapes are the MEASURED live response of 2026-09-02 (transcript
// audit/intl-parcels/2026-09-02/transcripts-me-open/tr-tkgm-istanbul-kadikoy.json): the national key
// is ada (adaNo / block) + parsel (parselNo / parcel); province/district/quarter, sheet, area and the
// `nitelik` character string ride the same feature, and the WGS84 ring is served inline.
//
// ⭐ THE `nitelik` STOREY SIGNAL — extracted, but as a HINT, never a normative height. For a
// condominium parcel `nitelik` reads e.g. "11 Katli Betonarme Mesken,Ofis,Işyeri Ve Arsasi" — the
// "11 Katli" ("11-storey") is a probe-verified extractable floor count. It is a DESCRIPTION of what
// stands on the parcel, NOT a planning limit (SURVEYED ≠ NORMATIVE): carried as `storeyHint` with the
// raw `nitelik` beside it so a consumer can see it is derived from a free-text description, never a
// zoning right. The İmar (zoning) limit is a separate, document/e-Devlet-gated channel (me-sweep §10).
//
// FetchOutcome end-to-end (C57 §1.5): a no-parcel point is `absent` (TKGM's semantic 404, classified
// in trTkgmClient.ts); a network/HTTP failure is `transient`.

import { fetchFound, fetchTransient, type FetchOutcome } from '@pryzm/schemas';
import { trTkgmParselAtWgs84Point, type TrFetchDeps } from './trTkgmClient.js';

/** One WGS84 vertex of a parcel ring. */
export interface TrRingPoint {
    readonly lat: number;
    readonly lon: number;
}

/** One cadastral parcel as TKGM serves it — verbatim national identifiers. */
export interface TrParsel {
    /** adaNo — block number (`"3106"`), the first half of the national key. */
    readonly adaNo: string;
    /** parselNo — parcel number within the block (`"258"`). */
    readonly parselNo: string;
    /** İl — province (`"Istanbul"`), or null. */
    readonly il: string | null;
    /** İlçe — district (`"Kadiköy"`), or null. */
    readonly ilce: string | null;
    /** Mahalle — quarter/neighbourhood (`"Tuğlaci Başi"`), or null. */
    readonly mahalle: string | null;
    /** alan — parcel area (m²), or null. Served as a string by TKGM; parsed here. */
    readonly alanM2: number | null;
    /** pafta — cadastral sheet (`"151"`), or null. */
    readonly pafta: string | null;
    /** zeminKmdurum — tenure/condominium status (`"Kat Mülkiyet"`), or null. */
    readonly zeminKmdurum: string | null;
    /** nitelik — the raw character/quality description, verbatim (SURVEYED, not normative). */
    readonly nitelik: string | null;
    /**
     * Storey count extracted from `nitelik` ("N Katli" → N), or null when the description carries
     * none. A HINT derived from a free-text description — NEVER a planning/İmar height limit.
     */
    readonly storeyHint: number | null;
    /** The parcel's outer ring in WGS84, or null when no geometry was served. */
    readonly ring: readonly TrRingPoint[] | null;
    /** Always `'tr-tkgm-parsel'`. */
    readonly source: 'tr-tkgm-parsel';
}

function strOrNull(v: unknown): string | null {
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    return null;
}

function alanToNumber(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
        // TKGM serves alan like "816.27" or "57,509.00" — strip thousands separators, keep the dot.
        const n = Number(v.replace(/,/g, ''));
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

/** "11 Katli …" → 11. Turkish "Kat"/"Katlı" = storey. Returns null when the text carries no count. */
export function extractStoreyHintFromNitelik(nitelik: string | null): number | null {
    if (nitelik === null) return null;
    // Match a leading integer immediately before "Kat" (case-insensitive; tolerate Katli/Katlı).
    const m = /(\d+)\s*Kat/i.exec(nitelik);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isInteger(n) && n > 0 && n < 200 ? n : null;
}

/** Parse a GeoJSON Polygon/MultiPolygon outer ring to WGS84 points. Returns null when degenerate. */
function parseGeoJsonOuterRing(geometry: unknown): readonly TrRingPoint[] | null {
    const type = (geometry as { type?: unknown })?.type;
    const coords = (geometry as { coordinates?: unknown })?.coordinates;
    if (!Array.isArray(coords)) return null;
    let outer: unknown;
    if (type === 'Polygon') outer = coords[0];
    else if (type === 'MultiPolygon') outer = (coords[0] as unknown[] | undefined)?.[0];
    else return null;
    if (!Array.isArray(outer) || outer.length < 3) return null;
    const pts: TrRingPoint[] = [];
    for (const pair of outer) {
        if (Array.isArray(pair) && pair.length >= 2) {
            const lon = Number(pair[0]);
            const lat = Number(pair[1]);
            if (Number.isFinite(lon) && Number.isFinite(lat)) pts.push({ lat, lon });
        }
    }
    return pts.length >= 3 ? pts : null;
}

/**
 * PURE parser: the TKGM GeoJSON Feature body → a TrParsel, or `null` when the body carries no
 * ada/parsel identity. Throws NEVER.
 */
export function parseTrParselFeature(body: unknown): TrParsel | null {
    const props = (body as { properties?: unknown })?.properties;
    if (props === null || typeof props !== 'object') return null;
    const p = props as Record<string, unknown>;
    const adaNo = strOrNull(p['adaNo']);
    const parselNo = strOrNull(p['parselNo']);
    if (adaNo === null || parselNo === null) return null; // no parcel identity ⇒ not a parcel feature
    const nitelik = strOrNull(p['nitelik']);
    return {
        adaNo,
        parselNo,
        il: strOrNull(p['ilAd']),
        ilce: strOrNull(p['ilceAd']),
        mahalle: strOrNull(p['mahalleAd']),
        alanM2: alanToNumber(p['alan']),
        pafta: strOrNull(p['pafta']),
        zeminKmdurum: strOrNull(p['zeminKmdurum']),
        nitelik,
        storeyHint: extractStoreyHintFromNitelik(nitelik),
        ring: parseGeoJsonOuterRing((body as { geometry?: unknown })?.geometry),
        source: 'tr-tkgm-parsel',
    };
}

/**
 * Resolve the cadastral parcel at a WGS84 point via keyless TKGM.
 *   • found    → the ada/parsel parcel covering the point (with the WGS84 ring)
 *   • absent   → TKGM's semantic 404 (no parcel here — durable)
 *   • transient→ endpoint did not answer / non-JSON / 200-body without an ada/parsel identity
 */
export async function resolveTrParselAtWgs84Point(
    lat: number,
    lon: number,
    deps: TrFetchDeps = {},
): Promise<FetchOutcome<TrParsel>> {
    const got = await trTkgmParselAtWgs84Point(lat, lon, deps);
    if (got.status !== 'found') return got as FetchOutcome<TrParsel>;
    const parsel = parseTrParselFeature(got.value);
    if (parsel === null) {
        // A 200 body we cannot read as a parcel is a source-shape failure, not "no parcel here".
        return fetchTransient(`upstream-failed: TKGM 200 body without adaNo/parselNo @ ${lat},${lon}`);
    }
    return fetchFound(parsel);
}
