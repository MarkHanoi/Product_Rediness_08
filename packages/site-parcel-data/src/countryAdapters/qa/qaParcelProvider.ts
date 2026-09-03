// LANE ME-OPEN — QATAR · the KEYLESS parcel leg: CadastrePlots ArcGIS query at a WGS84 point →
// FetchOutcome<QaCadastrePlot>. Field shapes are the MEASURED live response of 2026-09-02 (transcript
// audit/intl-parcels/2026-09-02/transcripts-me-open/qa-cadastreplots-doha.json): the national plot
// identifier is PIN (== CDST_KEY on the probed plot), the survey drawing reference is PD_NO, and the
// plot area PDAREA rides the same feature. Geometry returns as WGS84 rings.
//
// ⚠ SURVEYED ≠ NORMATIVE: PDAREA is the surveyed plot area, not a zoning/GFA figure. The FAR/height
// numbers live behind the Zoning service's RULEID in the MME zoning-regulation PDFs (Europe-class F
// extraction, me-sweep §4) — nothing normative is minted here.
//
// FetchOutcome end-to-end (C57 §1.5): a sea/empty point is `absent`; a network/HTTP/ArcGIS-error
// failure is `transient`.

import { fetchAbsent, fetchFound, type FetchOutcome } from '@pryzm/schemas';
import { qaCadastreQueryAtWgs84Point, type QaFetchDeps } from './qaCadastreClient.js';

/** One WGS84 vertex of a plot ring. */
export interface QaRingPoint {
    readonly lat: number;
    readonly lon: number;
}

/** One cadastral plot as CadastrePlots serves it — verbatim national identifiers. */
export interface QaCadastrePlot {
    /** PIN — the national plot identifier (`1010028`), as a string to preserve leading forms. */
    readonly pin: string;
    /** CDST_KEY — the cadastre key (equals PIN on the probed plot), or null. */
    readonly cdstKey: string | null;
    /** PD_NO — plot-drawing / survey reference (`"PD/4693/2019"`), or null. */
    readonly pdNo: string | null;
    /** PDAREA — surveyed plot area (m²), or null. NOT a GFA/zoning figure. */
    readonly plotAreaM2: number | null;
    /** GFCODE — feature class code (`"PDGVCDST"`), or null. */
    readonly gfCode: string | null;
    /** GLOBALID — the ArcGIS global id, or null. */
    readonly globalId: string | null;
    /** The plot's outer ring in WGS84, or null when the service returned no geometry. */
    readonly ring: readonly QaRingPoint[] | null;
    /** Always `'qa-gisqatar-cadastre-plots'`. */
    readonly source: 'qa-gisqatar-cadastre-plots';
}

function numOrNull(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return null;
}

function strOrNull(v: unknown): string | null {
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    return null;
}

/** Parse an Esri polygon `rings` outer ring to WGS84 points. Returns null when absent/degenerate. */
function parseOuterRing(geometry: unknown): readonly QaRingPoint[] | null {
    const rings = (geometry as { rings?: unknown })?.rings;
    if (!Array.isArray(rings) || rings.length === 0) return null;
    const outer = rings[0];
    if (!Array.isArray(outer) || outer.length < 3) return null;
    const pts: QaRingPoint[] = [];
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
 * PURE parser: the CadastrePlots query body → a QaCadastrePlot, or `null` when the body carries no
 * feature (an empty/sea point). Throws NEVER; a body without a PIN returns null.
 */
export function parseQaCadastrePlot(body: unknown): QaCadastrePlot | null {
    const features = (body as { features?: unknown })?.features;
    if (!Array.isArray(features) || features.length === 0) return null;
    const first = features[0] as { attributes?: Record<string, unknown>; geometry?: unknown };
    const attrs = first?.attributes;
    if (attrs === null || typeof attrs !== 'object') return null;
    const pin = strOrNull(attrs['PIN']);
    if (pin === null) return null; // no plot identity ⇒ not a plot feature
    return {
        pin,
        cdstKey: strOrNull(attrs['CDST_KEY']),
        pdNo: strOrNull(attrs['PD_NO']),
        plotAreaM2: numOrNull(attrs['PDAREA']),
        gfCode: strOrNull(attrs['GFCODE']),
        globalId: strOrNull(attrs['GLOBALID']),
        ring: parseOuterRing(first?.geometry),
        source: 'qa-gisqatar-cadastre-plots',
    };
}

/**
 * Resolve the cadastral plot at a WGS84 point via the keyless CadastrePlots service.
 *   • found    → the plot covering the point (PIN + ring)
 *   • absent   → the service answered 200 with no feature (no plot here — durable)
 *   • transient→ endpoint did not answer / non-JSON / ArcGIS error body
 */
export async function resolveQaCadastrePlotAtWgs84Point(
    lat: number,
    lon: number,
    deps: QaFetchDeps = {},
): Promise<FetchOutcome<QaCadastrePlot>> {
    const got = await qaCadastreQueryAtWgs84Point(lat, lon, deps);
    if (got.status !== 'found') return got as FetchOutcome<QaCadastrePlot>;
    const plot = parseQaCadastrePlot(got.value);
    if (plot === null) {
        return fetchAbsent(`no-plot: CadastrePlots @ ${lat},${lon}`);
    }
    return fetchFound(plot);
}
