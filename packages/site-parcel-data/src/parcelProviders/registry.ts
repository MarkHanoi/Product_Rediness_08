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

import { trace, SpanStatusCode } from '@opentelemetry/api';
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
    SPAIN_BBOX,
    FRANCE_BBOX,
    NETHERLANDS_BBOX,
    NORWAY_BBOX,
    NRW_BBOX,
    GERMANY_BBOX,
    SWITZERLAND_BBOX,
    DENMARK_BBOX,
    SAUDI_ARABIA_BBOX,
} from './countryBbox.js';
// L-650 Phase-4 batch — the new cadastral predicates live in their own provider modules (each
// provider owns its bbox + WFS/CRS knowledge, so the predicate ships beside the parser it gates).
// Imported here for ROUTING (the predicate) AND for SPECIFICITY (the bbox → area, so the smallest
// enclosing box wins the per-point priority resolver below — no manual tie-break order).
import { isInItaly, ITALY_BBOX } from './agenziaEntrateParcelProvider.js';
import { isInFlanders, FLANDERS_BBOX } from './flandersGrbParcelProvider.js';
import { isInNYC, NYC_BBOX } from './nycPlutoParcelProvider.js';
import { isInFinland, FINLAND_BBOX } from './mmlParcelProvider.js';
import { isInEngland, ENGLAND_BBOX } from './gbOsInspireParcelProvider.js';
// L-651 Phase-5 batch — the SIX providers that were BUILT + UNIT-TESTED but never registered here,
// so nothing routed to them and every click in their territory silently fell to OSM. Wiring them is
// this file's whole job: a provider with no registry row is inert code, and its own unit tests can
// never notice (they call the provider directly and never exercise reachability). See the per-row
// `note` for each one's LIVE-PROBE verdict (2026-07-31) — three resolve real parcels, three do not.
import { isInPortugal, PORTUGAL_BBOX } from './dgtParcelProvider.js';
import { isInSF, SF_BBOX } from './sfParcelProvider.js';
import { isInChicago, CHICAGO_BBOX } from './chicagoParcelProvider.js';
import { isInBrussels, BRUSSELS_BBOX } from './brusselsParcelProvider.js';
import { isInWallonia, WALLONIA_BBOX } from './walloniaParcelProvider.js';
import { isInScotland, SCOTLAND_BBOX } from './scotlandRosParcelProvider.js';

const _tracer = trace.getTracer('pryzm.parcel');

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
 * ROW ORDER IS NO LONGER LOAD-BEARING (L-650 fix). The dispatch below (`resolveParcelCandidates` /
 * `resolveParcelWithFallback`) is a per-point PRIORITY-FALLBACK resolver, not first-match: it finds
 * EVERY jurisdiction whose `contains` is true, orders them by SPECIFICITY (smallest bbox area first
 * — `parcelJurisdictionSpecificity`, derived from the row's bbox, never a manual order), then tries
 * them in that order and falls THROUGH to the next candidate whenever a provider yields null / no
 * parcel / an unreachable proxy. The most-specific enclosing box therefore wins, and a proxy-pending
 * NEW provider transparently yields to the enclosing LIVE cadastre.
 *
 * This eliminates the coarse-bbox border regressions the Phase-4 batch (56d6970f) introduced — the
 * overlaps below are now RESOLVED, not merely tolerated:
 *   • NRW ⊂ NL ⊂ Germany: Düsseldorf's smallest box is NRW → ALKIS wins; a Twente miss falls
 *     through to NL, no wasted dead-end.
 *   • CH ⊂ Germany: Zürich's smallest box is CH → swisstopo AV wins.
 *   • FI ⊂ NO: Helsinki's smallest box is FI → MML wins; NE Finnmark (Kirkenes) sits in FI∩NO, and
 *     when the FI proxy returns null the resolver falls THROUGH to NO → the live Kartverket cadastre.
 *   • BE-Flanders ⊂ NL+FR: Antwerp/Ghent's smallest box is Flanders → GRB wins; the Dutch SE strip
 *     (Eindhoven/Maastricht) sits in BE∩NL, and when the (proxy-pending) BE provider yields null the
 *     resolver falls THROUGH to NL → the live PDOK cadastre.
 *   • GB-England ⊂ FR: London/Brighton's smallest box is England; Calais sits in GB∩FR, and when the
 *     (proxy-pending) GB provider yields null the resolver falls THROUGH to FR → the live IGN cadastre.
 *   • IT ⊂ (near CH/FR): Italy's interior is IT; a NW border point (Turin strip / Bern / Nice) whose
 *     smaller enclosing box is CH or FR is tried first and self-corrects on the containing cadastre.
 *   • US-NYC has NO overlap with any box (Western hemisphere).
 * A misroute to a neighbour's CADASTRAL proxy remains self-correcting (that proxy returns null for a
 * point outside its territory → fall through), and every unmatched point ends at the universal
 * footprint. Rows stay ADDITIVE — order is purely cosmetic now; specificity decides everything.
 */
const PARCEL_JURISDICTIONS: readonly ParcelJurisdiction[] = [
    {
        // PT BEFORE ES: PORTUGAL_BBOX (36.9–42.2°N, −9.6..−6.1°E) sits ENTIRELY INSIDE SPAIN_BBOX
        // (Catastro's box reaches −18.5°E for the Canaries), so Lisbon/Porto/Faro would first-match
        // Spain without this precedence. The specificity resolver reaches the same verdict on its own
        // (PT ≈ 18.6 deg² ≪ ES ≈ 378 deg²); the row order only keeps the LEGACY single-verdict
        // `resolveParcelJurisdiction` honest for coverage/inspection callers. The reverse casualty is
        // the Spanish strip west of −6.1°E (Badajoz), which self-corrects: the SNIC WFS returns no
        // feature outside Portugal → fall through to Catastro.
        regionCode: 'PT',
        countryName: 'Portugal (Continente)',
        providerId: 'dgt-cadastro-predial',
        label: 'Cadastro Predial (Portugal · DGT / SNIC)',
        proxyPath: '/api/parcel/pt',
        kind: 'cadastral',
        contains: isInPortugal,
        note: 'DGT SNIC INSPIRE WFS 2.0 snicws.dgterritorio.gov.pt/geoserver/inspire/ows, typeName inspire:cadastralparcel, native EPSG:3763 → srsName=EPSG:4326 honoured server-side. VERIFIED-LIVE 2026-07-31 by this wiring pass: HTTP 200 application/json, real WGS84 MultiPolygon (feature cadastralparcel.1108210701 @ −7.5566,39.6702), CC BY 4.0 declared on GetCapabilities. Survey-grade, so `high` confidence IS earned on a point-in-parcel fact — but national coverage is INCOMPLETE (mainland only; built out per-município), so an unmapped município returns an honest no-parcel-here → footprint, NEVER a fabricated ring. Geometry-only: no ownership, no FAR, no height.',
    },
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
        // ══════════════════════════════════════════════════════════════════════════════════════
        // BELGIUM — THREE REGIONAL PREDICATES, NOT ONE `isInBelgium`. The argument (L-651).
        // ══════════════════════════════════════════════════════════════════════════════════════
        // The ROI tracker floated "Wallonia/Brussels next behind one `isInBelgium`". That shape is
        // WRONG here, and the live probe (2026-07-31) is what settles it:
        //
        //  1. ONE PREDICATE FORCES ONE ROW, AND A ROW CARRIES ONE VERDICT. A `ParcelJurisdiction`
        //     has exactly one `providerId`, one `proxyPath`, one `kind` and one `note`. The three
        //     Belgian regions do NOT share any of those: Flanders GRB is a live keyless WFS
        //     (`cadastral`), while Brussels and Wallonia are — as probed below — NOT reachable at
        //     all (`footprint-fallback`). Collapsing them would have to pick ONE verdict for all
        //     three, which necessarily lies about two of them. That is the C58 §1.4 false-provenance
        //     failure, and it is exactly the "failure and absence collapse into one value" bug
        //     (§CONTEXT-DATA-HONESTY, L-422/457/467/469) this registry exists to prevent.
        //  2. THE ENCLAVE IS ALREADY SOLVED, BY MEASUREMENT NOT BY ORDERING. Brussels-Capital is an
        //     enclave inside Flemish Brabant, so BRUSSELS_BBOX ⊂ FLANDERS_BBOX and a naïve router
        //     WOULD hand Brussels clicks to GRB. The L-650 specificity resolver already prevents it
        //     without any manual tie-break: BRUSSELS_BBOX ≈ 0.038 deg² vs FLANDERS_BBOX ≈ 2.87 deg²,
        //     a 75× ratio, so Brussels always ranks first for its own points. Proven by test
        //     ("Brussels-Capital is NOT claimed by Flanders"), which fails if this row is removed.
        //  3. THE THREE REGIONS ARE DIFFERENT LEGAL SYSTEMS ANYWAY (VCRO / CoBAT / CoDT) with
        //     different portals, licences and blockers. The per-region `note` is what makes the C63
        //     DATA-SOURCES axis scorable per region; one merged row would erase that granularity.
        //  4. IT IS NOT EVEN THE CHEAPER PATH. The "one Belgium" efficiency was premised on the
        //     FEDERAL CADMAP/CadGIS service serving all three regions at once. PROBED 2026-07-31 and
        //     it does NOT: eservices.minfin.fgov.be/geoservices/inspire/wfs answers HTTP 302 to
        //     idp.iamfas.belgium.be (the Belgian federal FAS/SAML identity provider) and
        //     ccff02.minfin.fgov.be answers 403. The federal cadastre is IDENTITY-BOOTSTRAP-GATED —
        //     the same access class as SE BankID / DK MitID — so there is no single endpoint to put
        //     behind a single predicate. When federal access is ever obtained it should be added as
        //     a FOURTH, coarse `isInBelgium` row owning `/api/parcel/be`; being the largest box it
        //     sorts LAST by specificity and becomes the natural cross-region fall-through UNDER the
        //     three regional rows. Additive, not a replacement — which is only possible because the
        //     regions were kept separate.
        //
        // BE-BRU FIRST (tightest enclave first), then BE-VLG, then BE-WAL.
        regionCode: 'BE-BRU',
        countryName: 'Belgium (Brussels-Capital Region)',
        providerId: 'brussels-cadastre',
        label: 'Building footprint (OSM)',
        proxyPath: null,
        kind: 'footprint-fallback',
        contains: isInBrussels,
        note: 'Brussels-Capital has NO reachable keyless parcel endpoint — PROBED 2026-07-31, four surfaces, all negative: (a) gis.urban.brussels/geoserver ADVERTISES layer GAPD:AGDP_CAPA (Title "Cadastral parcels", DefaultCRS urn:ogc:def:crs:EPSG::31370) in GetCapabilities but every GetFeature form — WFS 2.0 + 1.1.0, global + workspace-scoped endpoint, bare `EPSG:4326` + `urn:ogc:def:crs:EPSG::4326` + native 31370 bbox — returns ExceptionReport "Feature type GAPD:AGDP_CAPA unknown", i.e. catalogued-but-not-served; (b) data.mobility.brussels/geoserver is live with 273 layers but its bm_urbis:urbadm_* set is addresses/municipalities/streets only, NO parcel layer; (c) geoservices-urbis.irisnet.be/geoserver needs a workspace and UrbAdm/UrbisAdm 404; (d) the FEDERAL CADMAP fallback is identity-gated (see the Belgium block comment above). datastore.brussels IS reachable (HTTP 200) but publishes the UrbIS "Parcels and buildings" product as a DOWNLOADABLE GeoPackage, which cannot serve a per-click point query — wiring it needs a nightly GPKG→PostGIS sync job, i.e. INFRASTRUCTURE, not a proxy line. STATUS = to-build (sync-first), deliberately NOT a dead `cadastral` row: this registers as a footprint so the C63 DATA-SOURCES axis reads an honest "no source wired" instead of a false "measured".',
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
        // BE-WAL AFTER BE-VLG: the two boxes overlap in Walloon Brabant (50.67–50.85°N), where
        // Flanders' smaller box wins and self-corrects on a GRB miss. Wallonia does NOT enclose the
        // Brussels enclave (Brussels is enclaved in Flemish Brabant, north of the Walloon border),
        // so BE-BRU vs BE-WAL is a partial overlap only and Brussels still wins its own points.
        regionCode: 'BE-WAL',
        countryName: 'Belgium (Walloon Region)',
        providerId: 'wallonia-cadastre',
        label: 'Building footprint (OSM)',
        proxyPath: null,
        kind: 'footprint-fallback',
        contains: isInWallonia,
        note: "Wallonia's DOCUMENTED cadastral endpoint DOES NOT EXIST — PROBED 2026-07-31 and this is the finding, not a timeout: geoservices.wallonie.be/geoserver/wfs answers a valid HTTP 200 GetCapabilities (104 KB) that advertises exactly 18 layers, ALL of them in the `Orthos` workspace (orthophoto mosaics) — there is NO cadastral/parcel layer, so the provider's documented typeName `CP:CadastralParcel` cannot resolve and would have returned silently empty forever. Workspace sweep cp / inspire_cp / cadastre / CADMAP all 404 (inspire_lu exists but is land-USE, not parcels); the ArcGIS REST tree (geoservices.wallonie.be/arcgis/rest/services) lists 26 folders and neither DONNEES_BASE nor LIMITES carries a cadastral MapServer. The FEDERAL CADMAP fallback is identity-gated (see the Belgium block comment above). STATUS = access-deferred: the SPW cadastral redistribution is either not public or lives on a surface not yet identified; needs a sourcing pass against the Géoportail de Wallonie catalogue, not a code change. Registered as a footprint so a Walloon click is honestly labelled, never silently attributed to a cadastre that does not answer.",
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
        // GB-SCT AFTER GB-ENG. ⚠ SPECIFICITY NEAR-TIE, read before reordering: SCOTLAND_BBOX ≈ 50.4
        // deg² is FRACTIONALLY SMALLER than ENGLAND_BBOX ≈ 51.2 deg², so in the Anglo-Scottish border
        // band (54.6–55.9°N, where both boxes overlap) Scotland is ranked FIRST by area even though
        // this row sits second. That is HARMLESS here and only because this row is a
        // `footprint-fallback` with `proxyPath: null`: the priority resolver calls it, the editor's
        // fetchFor returns null immediately (there is no proxy to call), and it falls THROUGH to the
        // live HMLR England cadastre. Asserted by the "Newcastle still resolves England" test. If a
        // real Scottish proxy is ever wired this row becomes `cadastral` and that near-tie turns into
        // a REAL border regression — at which point the right fix is a kind-aware sort (a
        // footprint-fallback must never outrank a cadastral candidate), NOT a hand-tuned bbox.
        // Flagged to the orchestrator rather than changed here, because the sort is shared state.
        regionCode: 'GB-SCT',
        countryName: 'United Kingdom (Scotland)',
        providerId: 'gb-sct-ros',
        label: 'Building footprint (OSM)',
        proxyPath: null,
        kind: 'footprint-fallback',
        contains: isInScotland,
        note: 'Registers of Scotland Cadastral Map has NO reachable keyless endpoint — PROBED 2026-07-31: inspire.ros.gov.uk and cagemap.ros.gov.uk DO NOT RESOLVE (DNS failure, not a timeout), www.ros.gov.uk answers HTTP 403 (bot-blocked), api.ros.gov.uk 404, and the Scottish Government ArcGIS host maps.gov.scot serves only NRS / ScotGov / Testing / Utilities folders with no cadastral service. The RoS Cadastral Map is delivered through ScotLIS as a LICENSED/subscription product, so this is an access + licence gate, not an outage. STATUS = access-deferred; NEEDS A CREDENTIAL — a Registers of Scotland / ScotLIS data agreement plus (once granted) a ROS_SCOTLIS_API_KEY carried server-side by the proxy. ⚠ Even once wired it is OWNERSHIP with GENERAL BOUNDARIES (Land Registration etc. (Scotland) Act 2012) — confidence capped MEDIUM (generalBoundary:true), NEVER survey-grade like FR/ES/PT/DK/CH — and registered land ≠ the whole landscape (the Sasine→Land-Register migration is incomplete), so a Sasine-only click is an honest no-parcel, not a defect.',
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
        // US-SF — no overlap with any other registered box (Western hemisphere, and far from NYC).
        regionCode: 'US-CA-SF',
        countryName: 'United States (San Francisco)',
        providerId: 'sf-datasf',
        label: 'Assessor parcels (San Francisco · DataSF)',
        proxyPath: '/api/parcel/us-sf',
        kind: 'cadastral',
        contains: isInSF,
        note: "DataSF assessor parcels (Socrata resource acdm-wktn) — VERIFIED-LIVE 2026-07-31 by this wiring pass: a SoQL spatial point query returns the real lot under the click (blklot 3584032, 3976 19TH ST) with a WGS84 MultiPolygon. ⚠ PROVIDER-DOC CORRECTION FOUND BY THE PROBE: the geometry column is `shape`, NOT `the_geom` as sfParcelProvider.ts documents — a query against `the_geom` is rejected, so this would have been a silently-empty wire. The live rows ALSO carry zoning_code/zoning_district inline (e.g. RH-2), which the parser surfaces only as an optional DRAFT lead. SF governs by height-and-bulk district, NOT a citywide FAR (ADR-0270), so NO farRatio is ever emitted. Area is geometry-derived (the upstream area field has ambiguous units), which is a geometry fact, not a legal claim.",
    },
    {
        // US-CHI — no overlap with any other registered box.
        regionCode: 'US-IL-CHI',
        countryName: 'United States (Chicago / Cook County)',
        providerId: 'chicago-cook',
        label: 'Parcels (Chicago · Cook County Assessor)',
        proxyPath: '/api/parcel/us-chi',
        kind: 'cadastral',
        contains: isInChicago,
        note: "Cook County parcel fabric — VERIFIED-LIVE 2026-07-31 by this wiring pass, but ONLY AFTER ROUTING AROUND BOTH DOCUMENTED ENDPOINTS, which are dead: gis.cookcountyil.gov/traditional/.../MapServer/44/query does not respond at all (connection timeout, and the gis12 alternate too), and the Chicago zoning companion data.cityofchicago.org/resource/5s3e-9pji is HTTP 404 (retired resource id). The WORKING surfaces are datacatalog.cookcountyil.gov/resource/77tz-riq7 (Socrata; SoQL intersects(the_geom,…) returned real PIN 0101100119 with a WGS84 MultiPolygon) and, for zoning, data.cityofchicago.org/resource/dj47-wfun. Parcel identity is the 10-digit PIN; area is geometry-derived. Zoning is a DRAFT lead only — Chicago's FAR/height live in the Zoning Ordinance, never inferred here.",
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
 * SPECIFICITY — the degree² area of a jurisdiction's coarse routing bbox (the row's own box, keyed
 * by `regionCode` so the two `footprint` rows — DE / SA — stay distinct). SMALLER = more specific =
 * higher priority. Derived from the bbox constants each provider already exports; NEVER a hand-kept
 * order. The exclusion holes (Åland, Trentino) shrink the effective territory but not the outer box,
 * which is exactly the right relative signal for "the smallest enclosing box wins". The universal
 * fallback (and any unmapped region) sorts LAST (`+Infinity`).
 */
interface RectBbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}
const REGION_BBOX: Readonly<Record<string, RectBbox>> = {
    ES: SPAIN_BBOX,
    FR: FRANCE_BBOX,
    NL: NETHERLANDS_BBOX,
    NO: NORWAY_BBOX,
    'DE-NW': NRW_BBOX,
    DE: GERMANY_BBOX,
    CH: SWITZERLAND_BBOX,
    DK: DENMARK_BBOX,
    SA: SAUDI_ARABIA_BBOX,
    IT: ITALY_BBOX,
    'BE-VLG': FLANDERS_BBOX,
    'GB-ENG': ENGLAND_BBOX,
    FI: FINLAND_BBOX,
    'US-NY-NYC': NYC_BBOX,
    // L-651 Phase-5 batch. ⚠ A row MISSING from this map scores +Infinity and therefore sorts LAST
    // among its candidates — which for an enclave like Brussels would silently hand its points to the
    // enclosing Flanders row and undo the whole point of registering it. Every new row needs an entry
    // here; `parcelRegistryWiring.test.ts` asserts that invariant for ALL rows so it cannot regress.
    PT: PORTUGAL_BBOX,
    'BE-BRU': BRUSSELS_BBOX,
    'BE-WAL': WALLONIA_BBOX,
    'GB-SCT': SCOTLAND_BBOX,
    'US-CA-SF': SF_BBOX,
    'US-IL-CHI': CHICAGO_BBOX,
};

/** The routing-bbox area (degree²) of a jurisdiction — its specificity metric. Smaller = wins first. */
export function parcelJurisdictionSpecificity(jur: ParcelJurisdiction): number {
    const b = REGION_BBOX[jur.regionCode];
    if (!b) return Number.POSITIVE_INFINITY;
    return (b.maxLat - b.minLat) * (b.maxLon - b.minLon);
}

/**
 * Every jurisdiction whose coarse bbox CONTAINS the point, ordered MOST-SPECIFIC first (smallest
 * bbox area), with the registration order as a stable tie-break. The candidate list a per-point
 * priority-fallback resolver walks: try the tightest enclosing cadastre first, fall through to the
 * next when it yields nothing. PURE + never throws; a non-finite / unmatched point yields `[]`.
 */
export function resolveParcelCandidates(lat: number, lon: number): readonly ParcelJurisdiction[] {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    const matches: ParcelJurisdiction[] = [];
    for (const j of PARCEL_JURISDICTIONS) {
        if (j.contains(lat, lon)) matches.push(j);
    }
    return matches.sort((a, b) => {
        const d = parcelJurisdictionSpecificity(a) - parcelJurisdictionSpecificity(b);
        if (d !== 0) return d;
        // Deterministic tie-break: earlier registration wins (never a coin-flip on equal areas).
        return PARCEL_JURISDICTIONS.indexOf(a) - PARCEL_JURISDICTIONS.indexOf(b);
    });
}

/**
 * Route a WGS84 click-point to a SINGLE primary parcel jurisdiction (legacy first-match by row
 * order), or the universal OSM footprint when nothing matches. NEVER throws and ALWAYS returns a
 * verdict, so a click is never dead (C58 §1.4). Kept for coverage/inspection callers.
 *
 * ⚠ This is a COARSE single verdict — with overlapping boxes it cannot know which provider actually
 * ANSWERS (a Barcelona click is inside FRANCE_BBOX too, but only Catastro serves it). Callers doing
 * the real fetch MUST use `resolveParcelWithFallback`, which walks EVERY enclosing box most-specific
 * first and falls THROUGH on a miss — that is the path that fixes the border regressions.
 */
export function resolveParcelJurisdiction(lat: number, lon: number): ParcelJurisdiction {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return UNIVERSAL_FOOTPRINT_JURISDICTION;
    for (const j of PARCEL_JURISDICTIONS) {
        if (j.contains(lat, lon)) return j;
    }
    return UNIVERSAL_FOOTPRINT_JURISDICTION;
}

/** A successful priority-fallback resolution: the parcel and the jurisdiction whose provider yielded it. */
export interface ParcelFallbackHit<T> {
    readonly jurisdiction: ParcelJurisdiction;
    readonly parcel: T;
}

/**
 * PER-POINT PRIORITY-FALLBACK dispatch — the L-650 border-regression fix. Walks the point's
 * candidates most-specific first (`resolveParcelCandidates`) and calls the injected per-jurisdiction
 * `fetchFor` on each, returning the FIRST non-null parcel together with its jurisdiction. Falls
 * THROUGH to the next candidate whenever a provider returns null / no-parcel / an unreachable proxy
 * (or throws — swallowed, never propagated), so a proxy-pending NEW provider transparently yields to
 * the enclosing LIVE cadastre (Eindhoven BE→NL, Kirkenes FI→NO, Calais GB→FR). Returns `null` when
 * every candidate yields nothing — the caller then applies its universal footprint fallback.
 *
 * The impure fetch is INJECTED (`fetchFor`) so this stays pure of network I/O and unit-testable; the
 * editor passes a callback that hits each jurisdiction's same-origin cadastre proxy. NEVER throws.
 * P8 span: `pryzm.parcel.resolveParcelWithFallback`.
 */
export async function resolveParcelWithFallback<T>(
    lat: number,
    lon: number,
    fetchFor: (jurisdiction: ParcelJurisdiction) => Promise<T | null> | T | null,
): Promise<ParcelFallbackHit<T> | null> {
    const span = _tracer.startSpan('pryzm.parcel.resolveParcelWithFallback');
    try {
        const candidates = resolveParcelCandidates(lat, lon);
        span.setAttribute('pryzm.parcel.lat', Number.isFinite(lat) ? lat : Number.NaN);
        span.setAttribute('pryzm.parcel.lon', Number.isFinite(lon) ? lon : Number.NaN);
        span.setAttribute('pryzm.parcel.candidateCount', candidates.length);
        span.setAttribute(
            'pryzm.parcel.candidates',
            candidates.map((c) => c.providerId).join(','),
        );
        for (const jurisdiction of candidates) {
            let parcel: T | null = null;
            try {
                parcel = await fetchFor(jurisdiction);
            } catch (err) {
                // A provider that throws is treated as a miss — fall through, never propagate.
                console.warn(
                    `[parcel-registry] ${jurisdiction.providerId} threw (non-fatal) — falling through:`,
                    (err as Error)?.message ?? err,
                );
                parcel = null;
            }
            if (parcel != null) {
                span.setAttribute('pryzm.parcel.hit', true);
                span.setAttribute('pryzm.parcel.resolvedBy', jurisdiction.providerId);
                span.setAttribute('pryzm.parcel.region', jurisdiction.regionCode);
                span.setStatus({ code: SpanStatusCode.OK });
                return { jurisdiction, parcel };
            }
        }
        span.setAttribute('pryzm.parcel.hit', false);
        span.setStatus({ code: SpanStatusCode.OK });
        return null;
    } catch (err) {
        // Defensive: the whole path is best-effort — never throw into the caller.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        return null;
    } finally {
        span.end();
    }
}

/** Every registered parcel jurisdiction — read by the coverage doc / a future coverage globe. */
export function listParcelJurisdictions(): readonly ParcelJurisdiction[] {
    return PARCEL_JURISDICTIONS;
}
