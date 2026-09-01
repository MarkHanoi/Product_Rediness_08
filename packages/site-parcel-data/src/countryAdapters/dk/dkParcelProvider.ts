// LANE DK · the KEYLESS parcel leg: DAWA `jordstykker` at a WGS84 point →
// FetchOutcome<DkJordstykke>. Field shapes are the MEASURED response of 2026-09-01
// (transcripts: audit/europe-site-intel/2026-08-31/impl/lane-dk-transcripts/dawa-*.json):
// matrikelnr, ejerlav{kode,navn}, kommune{kode,navn}, bfenummer (the Danish property
// spine), registreretareal (m²), vejareal (m² — the Aarhus baseline 7000ad is a ROAD
// parcel: vejareal == registreretareal, mirrored so a consumer can see it).
//
// ⚠ DAWA's `bygninger` endpoint is NOT used — lane 2 §DK-4 measured it answering
// 200-EMPTY at two central-CPH points (an unreliable empty is worse than a gate);
// buildings come from BBR/GeoDanmark behind the Datafordeler key (sourceRegistry/dk.ts).

import { fetchAbsent, fetchFound, fetchTransient, type FetchOutcome } from '@pryzm/schemas';
import { buildDkDawaJordstykkeUrl, dkGetJson, type DkFetchDeps } from './dkPlandataClient.js';

/** One cadastral parcel (jordstykke) as DAWA serves it — verbatim national identifiers. */
export interface DkJordstykke {
    /** Cadastral number within the ejerlav (`"4801"`, `"7000ad"`). */
    readonly matrikelnr: string;
    /** Cadastral district code + name (`2000173`, `"Udenbys Klædebo Kvarter, København"`). */
    readonly ejerlavKode: number | null;
    readonly ejerlavNavn: string | null;
    /** Municipality (`"0101"` København). */
    readonly kommuneKode: string | null;
    readonly kommuneNavn: string | null;
    /** BFE number — the Danish property spine (`6021259`), or null where not served. */
    readonly bfe: number | null;
    /** Registered parcel area in m² (`registreretareal`), or null. */
    readonly registreretArealM2: number | null;
    /** Road area in m² (`vejareal`) — 7000ad serves vejareal == registreretareal. */
    readonly vejArealM2: number | null;
}

function numOrNull(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return null;
}

function strOrNull(v: unknown): string | null {
    return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

/**
 * Resolve the cadastral parcel at a WGS84 point via keyless DAWA.
 *   • found    → the (first) jordstykke covering the point
 *   • absent   → DAWA answered 200 with an empty array (no parcel here — durable)
 *   • transient→ endpoint did not answer / non-JSON (empty ≠ failure, C57 §1.5)
 */
export async function resolveDkJordstykkeAtWgs84Point(
    lat: number,
    lon: number,
    deps: DkFetchDeps = {},
): Promise<FetchOutcome<DkJordstykke>> {
    const url = buildDkDawaJordstykkeUrl(lat, lon);
    const got = await dkGetJson(url, `dawa jordstykker @ ${lat},${lon}`, deps);
    if (got.status !== 'found') return got as FetchOutcome<DkJordstykke>;
    const body = got.value;
    if (!Array.isArray(body)) {
        return fetchTransient(`upstream-failed: expected a JSON array from ${url}`);
    }
    if (body.length === 0) {
        return fetchAbsent(`no-parcel: dawa jordstykker @ ${lat},${lon}`);
    }
    const raw = body[0] as Record<string, unknown>;
    const matrikelnr = strOrNull(raw['matrikelnr']);
    if (matrikelnr === null) {
        return fetchTransient(`upstream-failed: jordstykke without matrikelnr from ${url}`);
    }
    const ejerlav = (raw['ejerlav'] ?? null) as { kode?: unknown; navn?: unknown } | null;
    const kommune = (raw['kommune'] ?? null) as { kode?: unknown; navn?: unknown } | null;
    return fetchFound({
        matrikelnr,
        ejerlavKode: numOrNull(ejerlav?.kode),
        ejerlavNavn: strOrNull(ejerlav?.navn),
        kommuneKode: strOrNull(kommune?.kode),
        kommuneNavn: strOrNull(kommune?.navn),
        bfe: numOrNull(raw['bfenummer']),
        registreretArealM2: numOrNull(raw['registreretareal']),
        vejArealM2: numOrNull(raw['vejareal']),
    });
}
