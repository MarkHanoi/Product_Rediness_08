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
//                            our environment (token-gated / IP geo-fenced / per-region licensed).
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
// L-650 Phase-4 batch — the new cadastral predicates live in their own provider modules (each
// provider owns its bbox + WFS/CRS knowledge, so the predicate ships beside the parser it gates).
// Imported here purely for ROUTING. ⚠ These coarse boxes DO overlap existing jurisdictions at
// borders — see the `// TODO: bbox-intersection + priority-fallback` note on PARCEL_JURISDICTIONS.
import { isInItaly } from './agenziaEntrateParcelProvider.js';
import { isInFlanders } from './flandersGrbParcelProvider.js';
import { isInNYC } from './nycPlutoParcelProvider.js';
import { isInFinland } from './mmlParcelProvider.js';
import { isInEngland } from './gbOsInspireParcelProvider.js';

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
 *     47.37°N) routes to the Swiss AV cadastre, not to the German footprint. Since L-627 CH is
 *     cadastral, so this ordering now genuinely protects a real cadastre (not just the label).
 * A misroute to a neighbour's CADASTRAL proxy is self-correcting (that proxy returns null for a
 * point outside its territory → the client falls to the footprint), so the only hard requirement
 * is that each country's INTERIOR routes to its own cadastre — which the tightened boxes ensure.
 *
 * ── L-650 Phase-4 batch (IT / BE-Flanders / GB-England / FI / US-NYC) — READ THE ORDERING ──────
 * The four European additions are COARSE rectangles that overlap the interiors of existing broad
 * boxes, so first-match order is load-bearing and they are placed to protect the NEW cadastre's core:
 *   • BE-Flanders, GB-England, FI are placed BEFORE FR/NL/NO because each is enclosed by one of them
 *     (FI sits ENTIRELY inside NORWAY_BBOX; Flanders inside NL+FR; England's south coast inside FR).
 *     Placing them first routes Antwerp/Ghent, London/Brighton and Helsinki to their OWN cadastre.
 *   • IT is placed AFTER CH (so Bern/Lugano keep swisstopo) and after FR (Nice keeps IGN); the NW
 *     Italian border strip west of 8.3°E (Turin) is the self-correcting casualty.
 *   • US-NYC has NO overlap with any box (Western hemisphere) — position is free.
 * ⚠ KNOWN BORDER REGRESSIONS from these coarse boxes (documented, self-correcting to the footprint,
 * NOT a real cadastre): the Dutch SE strip inside FLANDERS_BBOX (Eindhoven/Maastricht), the NE
 * Norwegian Finnmark inside FINLAND_BBOX (Kirkenes), and Calais inside ENGLAND_BBOX now route to the
 * NEW (proxy-pending) provider → null → footprint instead of their own live cadastre.
 * // TODO: bbox-intersection + priority-fallback — replace this first-match ordering with a real
 * // per-point priority resolver (try the most-specific cadastre, fall THROUGH to the next box on a
 * // null result instead of straight to the footprint) or polygon gates. Additive rows only for now.
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
        // BE-Flanders BEFORE FR + NL: Flanders' core (Antwerp/Ghent/Brussels enclave) sits inside
        // both FRANCE_BBOX and NETHERLANDS_BBOX, so this must win first to route them to GRB. The
        // Dutch SE strip (Eindhoven/Maastricht) is the documented self-correcting casualty.
        regionCode: 'BE-VLG',
        countryName: 'Belgium (Flemish Region)',
        providerId: 'flanders-grb',
        label: 'GRB (Belgium · Flanders · Digitaal Vlaanderen)',
        proxyPath: '/api/parcel/be-vlg',
        kind: 'cadastral',
        contains: isInFlanders,
        note: 'GRB Adp (administratieve percelen) — CAPAKEY + NIScode + geometry, EPSG:31370 → WGS84, open data (no key). FLANDERS ONLY: Brussels (CoBAT/UrbIS) + Wallonia (CoDT/PICC) are different systems; a Brussels/Wallonia click returns no ADP feature → footprint. ⚠ Proxy /api/parcel/be-vlg not yet wired server-side → resolves null → OSM footprint until then.',
    },
    {
        // GB-England BEFORE FR: England's south coast (Brighton/Portsmouth/Plymouth) sits inside
        // FRANCE_BBOX, so this must win first. Calais (inside ENGLAND_BBOX) is the reverse casualty.
        // `kind:'cadastral'` is for ROUTING only — the ownership general-boundary honesty + MEDIUM
        // confidence cap live in the parcel resolver (generalBoundary:true), NEVER scored HIGH.
        regionCode: 'GB-ENG',
        countryName: 'United Kingdom (England)',
        providerId: 'gb-os-inspire',
        label: 'HM Land Registry INSPIRE (England · ownership, general boundaries)',
        proxyPath: '/api/parcel/gb',
        kind: 'cadastral',
        contains: isInEngland,
        note: 'HMLR INSPIRE Index Polygons (freehold ownership INDEX extents, OGL v3), EPSG:27700 → WGS84. ⚠ OWNERSHIP with GENERAL BOUNDARIES (s.60 LRA 2002) — NOT a survey cadastre; confidence capped MEDIUM (generalBoundary:true), NEVER survey-grade like FR/ES/DK/CH. Per-LPA ATOM/GML download — proxy must aggregate/serve a point query. CONVERGENT-SECONDARY: endpoint + OGL redistribution NOT live-probed. ⚠ Proxy /api/parcel/gb not yet wired → null → OSM footprint until then.',
    },
    {
        // FI BEFORE NO: FINLAND_BBOX sits ENTIRELY inside NORWAY_BBOX (Kartverket's box reaches
        // 31.3°E), so Helsinki/Tampere/Rovaniemi would misroute to Norway without this precedence.
        // NE Norwegian Finnmark (Kirkenes) inside FINLAND_BBOX is the self-correcting casualty.
        regionCode: 'FI',
        countryName: 'Finland',
        providerId: 'mml',
        label: 'Kiinteistörekisteri (Finland · Maanmittauslaitos)',
        proxyPath: '/api/parcel/fi',
        kind: 'cadastral',
        contains: isInFinland,
        note: 'MML kiinteisto-avoin OGC API Features (PalstanSijaintitiedot), EPSG:3067 → WGS84. KEY-GATED (self-service): needs a free MML_API_KEY (create at omatili.maanmittauslaitos.fi) carried server-side by the proxy as HTTP Basic (key as username / blank password). Resolves real Finnish parcels once the key is set; else null → OSM footprint. Åland excluded.',
    },
    {
        // US-NYC — no overlap with any box (Western hemisphere); position is free. Ordered here
        // BEFORE any future coarser US/footprint entry, per the nycPlutoParcelProvider note.
        regionCode: 'US-NY-NYC',
        countryName: 'United States (New York City)',
        providerId: 'nyc-pluto',
        label: 'MapPLUTO (NYC · Dept. of Finance + City Planning)',
        proxyPath: '/api/parcel/us-nyc',
        kind: 'cadastral',
        contains: isInNYC,
        note: 'NYC DCP MapPLUTO lot FeatureServer (BBL) — tax-lot polygon + ZoneDist1 + ResidFAR/CommFAR/FacilFAR + LotArea, keyless. // PROBE: verify the ArcGIS FeatureServer path live before prod (Socrata 64uk-42ks probed 2026-07-24). ⚠ Proxy /api/parcel/us-nyc not yet wired → null → OSM footprint until then.',
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
        // L-627: flipped footprint → cadastral. The earlier "no keyless Liegenschaft layer" verdict
        // was about the geodienste.ch/av_0 WFS host; the FEDERAL geo.admin.ch identify service DOES
        // return the real Amtliche-Vermessung Grundstück keylessly (EGRID + parcel no. + canton),
        // all-canton, live-verified for ZH + GE 2026-07-26. Licence: geo.admin.ch FSDI terms — free,
        // commercial use permitted, fair-use bounded (~20 req/min avg), attribution "© swisstopo + canton".
        regionCode: 'CH',
        countryName: 'Switzerland',
        providerId: 'swisstopo-av',
        label: 'Amtliche Vermessung (Switzerland · swisstopo/cantons)',
        proxyPath: '/api/parcel/ch',
        kind: 'cadastral',
        contains: isInSwitzerland,
        note: 'api3.geo.admin.ch identify ch.kantone.cadastralwebmap-farbe → Esri-JSON rings; real Grundstück carrying egris_egrid (CH119192997709 @ Zürich), local number (AA8048), canton ak — keyless, all-canton (ZH + GE live-verified 2026-07-26). geo.admin.ch FSDI terms: free + commercial OK + fair-use (~20 req/min avg) + attribution © swisstopo + canton. See ch/findings/ZURICH-PARCEL-SOURCE.md.',
    },
    {
        // IT AFTER CH (Bern/Lugano keep swisstopo — ITALY_BBOX would otherwise swallow them) and
        // after FR (Nice keeps IGN). The NW Italian border strip west of 8.3°E (Turin) is the
        // self-correcting casualty. Italy's interior (lon > 8.3°E) routes here regardless of order.
        regionCode: 'IT',
        countryName: 'Italy',
        providerId: 'agenzia-entrate',
        label: 'Catasto (Italy · Agenzia delle Entrate)',
        proxyPath: '/api/parcel/it',
        kind: 'cadastral',
        contains: isInItaly,
        note: 'Agenzia delle Entrate INSPIRE Cartografia Catastale WFS 2.0 (CP:CadastralParcel), EPSG:6706 (ETRS89 ≈ WGS84 at BIM scale, no reprojection), keyless CC BY 4.0, verified-live 2026-07-24 (Rome/H501, Milan/F205, Turin/L219). AP Trento + Bolzano excluded (own Catasto tavolare / Libro Fondiario). ⚠ Proxy /api/parcel/it not yet wired server-side → resolves null → OSM footprint until then.',
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
        // L-449 (founder ruling 2026-07-30) — Denmark is now a DEFERRED STUB, not a credential-gated
        // clone. Bootstrapping a Datafordeler ADMIN account requires a Danish MitID identity (the same
        // access-gate class that blocks the Swedish BankID path), which PRYZM cannot obtain — so there
        // will be no live Matriklen parcel access. `dkMatrikelParcelProvider` conforms to the canonical
        // shape but NEVER attempts a live fetch and returns null → the registry falls to the OSM
        // footprint. The `// DEFERRED:` seam is a single-method swap the day an admin bootstrap exists.
        // (The OFFLINE legislation half — the Plandata → envelope mapping — is SIGNED and needs no data.)
        regionCode: 'DK',
        countryName: 'Denmark',
        providerId: 'matrikel-dk',
        label: 'Matriklen (Denmark)',
        proxyPath: '/api/parcel/dk',
        kind: 'cadastral',
        contains: isInDenmark,
        note: 'Datafordeler Matrikel WFS (mat:Jordstykke), EPSG:25832 → WGS84 — DEFERRED STUB (L-449, founder-ruled 2026-07-30): a Datafordeler admin bootstrap is MitID-gated (same class as SE BankID), unobtainable, so the provider never attempts live access and returns null → OSM footprint (graceful, honestly labelled a footprint, never a legal parcel). Single method-body swap-in when access lands. The signed OFFLINE legislation half (Plandata → buildable envelope) is separate and complete.',
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
