// L-613 — THE PARCEL-PROVIDER ROUTING REGISTRY (pure).
//
// WHAT IT REPLACES
// ----------------
// `apps/editor/src/ui/site/parcel/index.ts` hard-coded ONE provider:
//
//     export const defaultParcelProvider: ParcelProvider = catastroParcelProvider;
//
// So the map's "Select parcel" mode resolved a REAL parcel only in Spain (Catastro). A click
// in France / the Netherlands / Norway / anywhere else fell to the honest-but-empty "no parcel —
// draw" state. This registry inverts that exactly as `resolveZoneDisposition` inverted the zoning
// gate: the map asks *"which cadastre answers at this point?"* and gets a routing verdict, so
// adding a country is a DATA ADDITION here, not an edit to the L5 map UI.
//
// WHY THE VERDICT CARRIES `kind` AND NOT JUST A PROVIDER ID
// --------------------------------------------------------
// Three states must stay distinct, and a bare `providerId | null` collapses them:
//
//   • `cadastral`          — an OPEN, keyless national cadastre answers here (live-probed). Route
//                            to its same-origin proxy; on a miss fall to the footprint.
//   • `footprint-fallback` — a cadastre EXISTS for this country but is NOT reachable keylessly from
//                            our environment (token-gated / IP geo-fenced / per-canton licensed).
//                            We deliberately DO NOT try it; we go straight to the OSM footprint and
//                            label it honestly. `note` records the exact blocker.
//   • the UNIVERSAL default — no country matched. Still a footprint verdict, so selection works
//                             EVERYWHERE (Spain-parity globally), never a dead click.
//
// This is the SAME honesty distinction the zoning registry draws between `refusal` and
// `unregistered`: "we can't reach the legal source" and "there is no source" are different claims,
// and a footprint presented as a cadastral parcel would be the C58 §1.4 false-provenance failure.
//
// ROUTING PREDICATES: the national analogue of the city predicates the ZONING dispatch routes on
// (`countryBbox.ts`). PURE — data + a lookup, no I/O. The fetch lives in the editor proxies.
//
// LIVE-PROBE EVIDENCE (2026-07-24) is in docs/04-reference/jurisdictions/PARCEL-SELECT-COVERAGE.md.

import {
    isInSpain,
    isInFrance,
    isInNetherlands,
    isInNorway,
    isInNRW,
    isInGermany,
    isInSwitzerland,
    isInDenmark,
    isInSaudiArabia,
} from './countryBbox.js';

/** How a click resolves to parcel geometry. */
export type ParcelProviderKind = 'cadastral' | 'footprint-fallback';

/** One country's parcel-routing registration. */
export interface ParcelJurisdiction {
    /** ISO 3166-1 alpha-2 (or a Land suffix, e.g. `DE-NW`) of the covered area. */
    readonly regionCode: string;
    readonly countryName: string;
    /** Stable provider/provenance id (`catastro` · `ign-fr` · `pdok-nl` · `geonorge-no` · `alkis-nrw` · `footprint`). */
    readonly providerId: string;
    /** Human attribution for the parcel info card. */
    readonly label: string;
    /**
     * The same-origin proxy route the editor calls for this country's cadastre, or null for a
     * footprint-fallback jurisdiction (no keyless cadastre to proxy).
     */
    readonly proxyPath: string | null;
    readonly kind: ParcelProviderKind;
    /** The routing predicate — the national analogue of the zoning dispatch's city predicates. */
    readonly contains: (lat: number, lon: number) => boolean;
    /** One-line reachability verdict / blocker, verbatim from the live probe. */
    readonly note: string;
}

/**
 * ORDER MATTERS — first match wins, and these are COARSE rectangles that overlap at borders, so
 * the order encodes the tie-breaks:
 *   • NRW precedes NL so Düsseldorf (in both boxes) routes to the open ALKIS cadastre, not to the
 *     Dutch proxy (which would return null there → a wasted round-trip). Twente border towns are the
 *     inverse casualty and self-correct to footprint — acceptable for a proximity gate.
 *   • CH precedes the whole-Germany footprint entry so Zurich (which pokes into GERMANY_BBOX at
 *     47.37°N) is labelled Switzerland, not Germany. Both are footprint anyway, so no cadastre is
 *     lost either way — only the honest label.
 * A misroute to a neighbour's CADASTRAL proxy is self-correcting (that proxy returns null for a
 * point outside its territory → the client falls to the footprint), so the only hard requirement
 * is that each country's INTERIOR routes to its own cadastre — which the tightened boxes ensure.
 */
const PARCEL_JURISDICTIONS: readonly ParcelJurisdiction[] = [
    {
        regionCode: 'ES',
        countryName: 'Spain',
        providerId: 'catastro',
        label: 'Catastro (Spain)',
        proxyPath: '/api/catastro/parcel',
        kind: 'cadastral',
        contains: isInSpain,
        note: 'OVC reverse-geocode + INSPIRE WFS GetParcel — keyless, live (the original L-380 pilot).',
    },
    {
        regionCode: 'FR',
        countryName: 'France',
        providerId: 'ign-fr',
        label: 'Cadastre (France · IGN PARCELLAIRE EXPRESS)',
        proxyPath: '/api/parcel/fr',
        kind: 'cadastral',
        contains: isInFrance,
        note: 'data.geopf.fr WFS CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle — HTTP 200 application/json, real MultiPolygon (idu 75104000AE0003 @ Paris), keyless.',
    },
    {
        // NRW BEFORE NL (Düsseldorf sits in both boxes) and before the whole-Germany footprint.
        regionCode: 'DE-NW',
        countryName: 'Germany (North Rhine-Westphalia)',
        providerId: 'alkis-nrw',
        label: 'ALKIS (Germany · NRW GeoBasis)',
        proxyPath: '/api/parcel/de-nrw',
        kind: 'cadastral',
        contains: isInNRW,
        note: 'wfs.nrw.de wfs_nw_alkis_vereinfacht ave:Flurstueck — HTTP 200 GML 3.2.1, real Flurstück (flstkennz 05311000400273, 2355 m² @ Düsseldorf), keyless. Other German Länder are per-Land licence-gated → footprint.',
    },
    {
        regionCode: 'NL',
        countryName: 'Netherlands',
        providerId: 'pdok-nl',
        label: 'Kadaster (Netherlands · PDOK BRK)',
        proxyPath: '/api/parcel/nl',
        kind: 'cadastral',
        contains: isInNetherlands,
        note: 'service.pdok.nl kadastralekaart WFS v5_0 kadastralekaart:Perceel — HTTP 200 application/json, real Polygon (perceel ASD04 F 6685 @ Amsterdam), keyless.',
    },
    {
        regionCode: 'NO',
        countryName: 'Norway',
        providerId: 'geonorge-no',
        label: 'Matrikkelen (Norway · Kartverket)',
        proxyPath: '/api/parcel/no',
        kind: 'cadastral',
        contains: isInNorway,
        note: 'wfs.geonorge.no matrikkelen-eiendomskart-teig app:Teig — HTTP 200 GML 3.2.1, real teig polygon (0301/208/644 @ Oslo), keyless.',
    },
    {
        // CH BEFORE the whole-Germany footprint entry (Zurich pokes into GERMANY_BBOX).
        regionCode: 'CH',
        countryName: 'Switzerland',
        providerId: 'footprint',
        label: 'Building footprint (OSM)',
        proxyPath: null,
        kind: 'footprint-fallback',
        contains: isInSwitzerland,
        note: 'geodienste.ch AV WFS GetCapabilities is keyless, but the amtliche-Vermessung data is per-canton PERMISSION-GATED (no Liegenschaft layer served free) and LV95 — not keylessly resolvable. Footprint fallback until a per-canton feed is wired.',
    },
    {
        regionCode: 'DE',
        countryName: 'Germany (other Länder)',
        providerId: 'footprint',
        label: 'Building footprint (OSM)',
        proxyPath: null,
        kind: 'footprint-fallback',
        contains: isInGermany,
        note: 'ALKIS outside NRW is per-Land licence-gated (no keyless national WFS). Footprint fallback until a per-Land open WFS or a licence is wired.',
    },
    {
        // L-613 Denmark slice — WIRED as a cadastral clone of Catastro, credential-gated. The
        // Matrikel is not keyless (all anonymous probes → HTTP 404, Datafordeler's unauthenticated
        // response; host reachable at 87.60.242.40), so `server/dkMatrikelProxy.js` carries a free
        // Datafordeler service-user server-side. With the credential set, a Copenhagen click returns
        // a REAL Danish parcel (same flow as a Spanish one); WITHOUT it the proxy returns null and
        // the client falls to the OSM footprint — graceful, never a crash, never a guess.
        regionCode: 'DK',
        countryName: 'Denmark',
        providerId: 'matrikel-dk',
        label: 'Matriklen (Denmark)',
        proxyPath: '/api/parcel/dk',
        kind: 'cadastral',
        contains: isInDenmark,
        note: 'Datafordeler Matrikel WFS (mat:Jordstykke), EPSG:25832 → WGS84. CREDENTIAL-GATED: needs a free Datafordeler service user (DATAFORDELER_USERNAME/PASSWORD) carried server-side by the proxy — not keyless (anonymous probes returned HTTP 404). Wired as a Catastro clone; resolves real parcels once the credential is set.',
    },
    {
        regionCode: 'SA',
        countryName: 'Saudi Arabia',
        providerId: 'footprint',
        label: 'Building footprint (OSM)',
        proxyPath: null,
        kind: 'footprint-fallback',
        contains: isInSaudiArabia,
        note: 'Balady / U-Maps cadastre is IP geo-fenced (WAF-blocks non-SA IPs, L-606). Not reachable from our environment → footprint fallback; a real SA parcel needs an in-SA proxy or a MOMRAH agreement.',
    },
];

/** The universal fallback verdict — no country matched, so select the OSM footprint. */
export const UNIVERSAL_FOOTPRINT_JURISDICTION: ParcelJurisdiction = {
    regionCode: '??',
    countryName: 'Unknown',
    providerId: 'footprint',
    label: 'Building footprint (OSM)',
    proxyPath: null,
    kind: 'footprint-fallback',
    contains: () => true,
    note: 'No cadastral provider covers this point — the OSM building footprint gives Spain-parity "click to select" everywhere, labelled as a footprint, never as a legal parcel.',
};

/**
 * Route a WGS84 click-point to the parcel jurisdiction that answers there. The ONE question the
 * editor's parcel registry asks. NEVER throws and ALWAYS returns a verdict: an unmatched point
 * yields `UNIVERSAL_FOOTPRINT_JURISDICTION`, so a click is never dead (C58 §1.4 — selection works
 * everywhere; the footprint is honestly labelled).
 */
export function resolveParcelJurisdiction(lat: number, lon: number): ParcelJurisdiction {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return UNIVERSAL_FOOTPRINT_JURISDICTION;
    for (const j of PARCEL_JURISDICTIONS) {
        if (j.contains(lat, lon)) return j;
    }
    return UNIVERSAL_FOOTPRINT_JURISDICTION;
}

/** Every registered parcel jurisdiction — read by the coverage doc / a future coverage globe. */
export function listParcelJurisdictions(): readonly ParcelJurisdiction[] {
    return PARCEL_JURISDICTIONS;
}
