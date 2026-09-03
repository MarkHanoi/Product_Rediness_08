// LANE ME-OPEN — ISRAEL · the KEYLESS parcel leg: govmap `IdentifyByXY` at a WGS84 point →
// FetchOutcome<IlParcel>. Field shapes are the MEASURED live response of 2026-09-02 (transcript
// audit/intl-parcels/2026-09-02/transcripts-me-open/il-govmap-telaviv.json): the national cadastral
// identifier is gush (מספר גוש / block) + helka (חלקה / parcel); the registered area and the
// registration status (מוסדר / regulated) ride the same identify. The parcel POLYGON is NOT in the
// identify body (govmap returns only `centroid` + `extent` for the parcel; the ring needs a separate
// PARCEL_ALL feature query — recorded as a follow-up in the source row, never fabricated here).
//
// ⚠ SURVEYED ≠ NORMATIVE, and the SOURCE says so itself: the identify carries a registrar disclaimer
// ("הנתון שטח רשום כאן אינו מהווה אסמכתה…" — the registered area here is not a legal reference; for a
// legal figure apply to the Land Registry at the Ministry of Justice). That disclaimer travels
// VERBATIM on `areaDisclaimer` so a consumer can never read the area as a legal fact.
//
// FetchOutcome end-to-end (C57 §1.5): empty and failure are DIFFERENT values — a sea/empty point is
// `absent`; a network/HTTP/error-code failure is `transient`.

import { fetchAbsent, fetchFound, type FetchOutcome } from '@pryzm/schemas';
import { ilGovmapIdentifyAtWgs84Point, type IlFetchDeps } from './ilGovmapClient.js';
import { itmToWgs84 } from './ilItm.js';

/** One cadastral parcel as govmap's identify serves it — verbatim national identifiers. */
export interface IlParcel {
    /** גוש — cadastral block number (`"6952"`), the first half of the national parcel key. */
    readonly gush: string;
    /** חלקה — parcel number within the block (`"139"`). */
    readonly helka: string;
    /** תת גוש — sub-block, or null when the source says "אין מידע" (no info). */
    readonly subBlock: string | null;
    /** שטח רשום — registered area (m²), or null when not served. NOT a legal figure (see below). */
    readonly registeredAreaM2: number | null;
    /** The registrar disclaimer that ships with the area, verbatim — SURVEYED ≠ NORMATIVE. */
    readonly areaDisclaimer: string | null;
    /** סטטוס — registration status (`"מוסדר"` = regulated / settled), or null. */
    readonly status: string | null;
    /** Parcel centroid in WGS84 (projected from the ITM centroid the identify returns). */
    readonly centroidWgs84: { readonly lat: number; readonly lon: number } | null;
    /** Parcel bounding box in WGS84 (projected from the ITM `extent`) — a footprint hint, not the ring. */
    readonly bboxWgs84: {
        readonly minLat: number;
        readonly maxLat: number;
        readonly minLon: number;
        readonly maxLon: number;
    } | null;
    /** govmap objectId (the SDE.PARCEL_ALL OBJECTID), for a follow-up ring query. */
    readonly objectId: number | null;
    /** Always `'PARCEL_ALL'` — the layer this identity came from. */
    readonly source: 'il-govmap-parcel-all';
}

interface IlField {
    readonly FieldName?: unknown;
    readonly FieldValue?: unknown;
}

function fieldValue(fields: readonly IlField[], predicate: (name: string) => boolean): string | null {
    for (const f of fields) {
        if (typeof f?.FieldName === 'string' && predicate(f.FieldName)) {
            const v = f.FieldValue;
            if (typeof v === 'string' && v.trim().length > 0) return v.trim();
        }
    }
    return null;
}

/** "אין מידע" (no info) is the source's own "unknown" sentinel — mapped to null, never carried. */
function nullIfNoInfo(v: string | null): string | null {
    if (v === null) return null;
    return v === 'אין מידע' ? null : v;
}

function areaToNumber(v: string | null): number | null {
    if (v === null) return null;
    // Registered areas are served plain (`"7404"`); tolerate a thousands separator just in case.
    const n = Number(v.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
}

/**
 * PURE parser: the govmap identify body → an IlParcel, or `null` when the body carries no PARCEL_ALL
 * result (an empty/sea point). Throws NEVER; a malformed body returns null (the caller classifies the
 * fetch layer's outcome, this layer only interprets a found body).
 *
 * Field matching is by Hebrew FieldName: `מספר גוש` (block), `חלקה` (parcel — matched EXACTLY so the
 * sub-block field `תת גוש`, which also contains גוש, is never mistaken for it), `שטח רשום` (area,
 * prefix), `סטטוס` (status), and the הערה (note) row carries the registrar disclaimer.
 */
export function parseIlGovmapParcel(body: unknown): IlParcel | null {
    const data = (body as { data?: unknown })?.data;
    if (!Array.isArray(data)) return null;
    const layer = data.find(
        (d) => (d as { LayerName?: unknown })?.LayerName === 'PARCEL_ALL',
    ) as { Result?: unknown } | undefined;
    const results = layer?.Result;
    if (!Array.isArray(results) || results.length === 0) return null;
    const first = results[0] as {
        tabs?: unknown;
        centroid?: { x?: unknown; y?: unknown };
        extent?: { xmin?: unknown; ymin?: unknown; xmax?: unknown; ymax?: unknown };
        objectId?: unknown;
    };
    const tabs = Array.isArray(first?.tabs) ? first.tabs : [];
    const fields: IlField[] = [];
    for (const tab of tabs) {
        const fs = (tab as { fields?: unknown })?.fields;
        if (Array.isArray(fs)) fields.push(...(fs as IlField[]));
    }

    const gush = fieldValue(fields, (n) => n === 'מספר גוש');
    const helka = fieldValue(fields, (n) => n === 'חלקה');
    if (gush === null || helka === null) return null; // no parcel identity ⇒ not a parcel result

    const subBlock = nullIfNoInfo(fieldValue(fields, (n) => n === 'תת גוש'));
    const registeredAreaM2 = areaToNumber(fieldValue(fields, (n) => n.startsWith('שטח רשום')));
    const areaDisclaimer = fieldValue(fields, (n) => n === 'הערה');
    const status = nullIfNoInfo(fieldValue(fields, (n) => n === 'סטטוס'));

    const cx = Number(first?.centroid?.x);
    const cy = Number(first?.centroid?.y);
    const centroidWgs84 =
        Number.isFinite(cx) && Number.isFinite(cy) ? itmToWgs84(cx, cy) : null;

    let bboxWgs84: IlParcel['bboxWgs84'] = null;
    const e = first?.extent;
    const xmin = Number(e?.xmin);
    const ymin = Number(e?.ymin);
    const xmax = Number(e?.xmax);
    const ymax = Number(e?.ymax);
    if ([xmin, ymin, xmax, ymax].every(Number.isFinite)) {
        const sw = itmToWgs84(xmin, ymin);
        const ne = itmToWgs84(xmax, ymax);
        if (sw && ne) {
            bboxWgs84 = {
                minLat: Math.min(sw.lat, ne.lat),
                maxLat: Math.max(sw.lat, ne.lat),
                minLon: Math.min(sw.lon, ne.lon),
                maxLon: Math.max(sw.lon, ne.lon),
            };
        }
    }

    const objectId = Number.isFinite(Number(first?.objectId)) ? Number(first?.objectId) : null;

    return {
        gush,
        helka,
        subBlock,
        registeredAreaM2,
        areaDisclaimer,
        status,
        centroidWgs84,
        bboxWgs84,
        objectId,
        source: 'il-govmap-parcel-all',
    };
}

/**
 * Resolve the cadastral parcel at a WGS84 point via keyless govmap.
 *   • found    → the gush/helka parcel covering the point
 *   • absent   → govmap answered 200 with no PARCEL_ALL result (no parcel here — durable)
 *   • transient→ un-projectable point / endpoint did not answer / non-JSON / errorCode ≠ 0
 */
export async function resolveIlParcelAtWgs84Point(
    lat: number,
    lon: number,
    deps: IlFetchDeps = {},
): Promise<FetchOutcome<IlParcel>> {
    const got = await ilGovmapIdentifyAtWgs84Point(lat, lon, deps);
    if (got.status !== 'found') return got as FetchOutcome<IlParcel>;
    const parcel = parseIlGovmapParcel(got.value);
    if (parcel === null) {
        return fetchAbsent(`no-parcel: govmap PARCEL_ALL @ ${lat},${lon}`);
    }
    return fetchFound(parcel);
}
