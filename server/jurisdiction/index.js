/**
 * server/jurisdiction/index.js
 * ============================================================================
 * THE JURISDICTION-PROXY BOUNDED CONTEXT — one router, one mount line.
 *
 * WHAT THIS IS
 * ------------
 * Every per-jurisdiction zoning / cadastre / planning-instrument proxy the
 * product serves lives in THIS directory and is mounted through THIS router.
 * They are a genuine bounded context: they share **nothing** with project
 * persistence, auth, billing or collaboration. Verified before the extraction —
 * across all of them the only intra-`server/` import is
 * `mucInstrumentProxy.js → mucZoningProxy.js` (both inside this directory), and
 * `server.js` referenced their exports in exactly one place: the mount block.
 *
 * The only thing they need from the monolith is the shared rate limiter, which
 * is INJECTED (`createJurisdictionRouter({ apiLimiter })`) rather than imported,
 * so this directory has a single, explicit inbound dependency.
 *
 * WHY IT LIVES UNDER `server/` AND NOT IN `packages/*` OR `apps/api-gateway`
 * -------------------------------------------------------------------------
 * ⛔ It CANNOT live there today without breaking production. `Dockerfile`
 * §L-442 copies ONLY `server.js`, `server/`, `dist/`, `public/` and the
 * manifests into the runtime stage — `packages/`, `apps/`, `plugins/` and
 * `tools/` are explicitly NOT copied (Dockerfile lines ~226-227 and the §L-442
 * comment above them), and `scripts/build/check-server-deps.mjs` FAILS THE
 * BUILD if `server.js` or `server/**` grows any `@pryzm/*` specifier that is
 * not precompiled. A proxy moved to `packages/` would therefore either fail the
 * build gate or die at boot with ERR_MODULE_NOT_FOUND in the runtime image.
 * `apps/api-gateway` is additionally NOT DEPLOYED at all.
 *
 * So this is the largest structural win that is reachable TODAY: a single
 * bounded directory with a single exported router, instead of ~20 siblings
 * hand-wired one route at a time in the monolith.
 *
 * WHAT A FUTURE INDEPENDENT DEPLOYMENT STILL NEEDS
 * ------------------------------------------------
 *   1. A `Dockerfile` COPY line for the new location (build-agent owned).
 *   2. A workspace `package.json` + a `pnpm-lock.yaml` regeneration.
 *   3. `apps/api-gateway` actually deployed, plus a routing rule so the live
 *      origin still answers these exact paths (they are same-origin BY DESIGN —
 *      the CSP is `connect-src 'self'`, so a different host is a CSP change and
 *      a CORS problem, not just a config change).
 *   4. A home for the per-module `_cache` Maps (C66 §3.3 category B today:
 *      N instances cost N× cold misses, never incorrect). Untouched here.
 *
 * REACHABILITY CONTRACT
 * ---------------------
 * The route list this router registers is asserted by
 * `server/__tests__/jurisdictionRouter.test.ts`. Every path, method, and the
 * DK-before-`:cc` ordering are part of that contract: changing them changes the
 * live HTTP surface.
 *
 * @see docs/02-decisions/contracts/C57-PARCEL-DATA-LAYER.md
 * @see docs/02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md
 * ============================================================================
 */

import express from 'express';

// §PARCEL-PROXY (L-380): same-origin Catastro parcel proxy + shared cache (select-real-parcel)
import {
    CATASTRO_PARCEL_PATH, catastroParcelHandler,
    CATASTRO_BLOCK_PATH, catastroBlockHandler,
    // C57 §1.14 (lane CADASTRAL) — the AREA query: every Catastro parcel in a window, for the
    // §5.5 cadastral-boundaries overlay. Same bbox machine as the manzana route, wider window.
    CATASTRO_PARCELS_PATH, catastroParcelsAreaHandler,
} from './parcelZoningProxy.js';
// §MUC-ZONING-PROXY (L-480) — the Catalan clau lookup: the ONE missing input that keeps
// Barcelona envelopes at 'estimated'. Probed live before it was written (L-473's lesson).
import { MUC_ZONING_PATH, mucZoningHandler } from './mucZoningProxy.js';
// §MUC-INSTRUMENT-PROXY (L-658) — WHICH planning instrument governs a point, anywhere in Catalonia.
// Same keyless Generalitat host as the zoning proxy above; resolves the RPUC expedient + deep link.
import { MUC_INSTRUMENT_PATH, mucInstrumentHandler } from './mucInstrumentProxy.js';
// §BCN-REFOS-OV-PROXY — the AMB Refós `OV_Trames` seam for Barcelona clau 18 (*ordenació en
// volumetria específica*, 17.5 % of private buildable land). PGM Art. 306 states NO envelope — it
// points at a per-site approved volumetric ordering — but the AMB publishes those orderings as
// queryable geometry (footprint + PLANTES storey count). ⚠ Rendering is STILL gated on
// `BCN_REFOS_OV_CERTIFIED` (default OFF, L-449).
import { BCN_REFOS_OV_PATH, bcnRefosOvHandler } from './bcnRefosOvProxy.js';
// §PLANDATA-ZONING-PROXY (L-399a): same-origin KEYLESS Denmark zoning proxy + cache (real DK envelope)
import {
    PLANDATA_ZONING_PATH,
    plandataZoningHandler,
    PLANDATA_BYGGEFELT_PATH,
    plandataByggefeltHandler,
} from './plandataZoningProxy.js';
// §L-441 Tier B — Spain's NATIONAL clasificacion-del-suelo (SIU). Same cache/forward/
// fallback shape as the Plandata proxy.
import { SIU_CLASSIFICATION_PATH, siuClassificationHandler } from './siuClassificationProxy.js';
// §MADRID-CONDICIONES-PROXY (L-608) — the Madrid PGOUM-97 NZ 1 buildable-footprint (explicit-area)
// same-origin lookup. Client consumer: @pryzm/site-parcel-data → resolveMadridNZ1Ring.
import { MADRID_CONDICIONES_PATH, madridCondicionesHandler } from './madridCondicionesProxy.js';
// §MADRID-NORMAS-ZONALES-PROXY — the Madrid PGOUM-97 **zone-code** lookup (parcel point → Norma
// Zonal `AMB_TX_ETIQ`). A SECOND Madrid service, not a flag on the first: the condiciones plane
// answers "what footprint?", this one answers "which Norma Zonal?" — and `SOURCES.md` §0.3 states
// the grado must be taken from `NORMAS_ZONALES.AMB_TX_ETIQ`, never from `COND_EDIF`.
// Client consumer: @pryzm/site-parcel-data → resolveMadridNormaZonal.
import {
    MADRID_NORMAS_ZONALES_PATH,
    madridNormasZonalesHandler,
} from './madridNormasZonalesProxy.js';
// §NL-BESTEMMINGSPLAN-PROXY (L-609 / §NL-NATIONWIDE) — the Netherlands bestemmingsplan bouwvlak +
// maatvoering lookup, NATIONWIDE + KEYLESS via the PDOK "Ruimtelijke plannen" WMS (GetFeatureInfo).
// Client consumer: @pryzm/site-parcel-data → resolveNlBestemmingsplan.
import { NL_BESTEMMINGSPLAN_PATH, nlBestemmingsplanHandler } from './nlBestemmingsplanProxy.js';
// §CORDOBA-ZONING-PROXY (WIRING-TODO 5) — the COACo PGOU-2001 subzone + refcat-join same-origin
// lookup. Client consumer: @pryzm/site-parcel-data → resolveCordobaSubzone. ⚠ Renders NO number
// while CORDOBA_ENVELOPE_VERIFIED is false — the DATA path that turns on with the L-449 sign-off.
// §COR-MANZANA-PROXY (2026-08-04) — the idecordoba (Ayuntamiento IDE) `idecordoba:manzana` published
// block-ring layer, live-verified at `ide.cordoba.es` (NOT `idecordoba.cordoba.es`, which does not
// resolve). Client consumer: @pryzm/site-parcel-data → resolveCordobaStreetWidth. Carries no zoning
// — base cartography only — feeding Art. 13.5.3.1's MC per-street-width height table.
import {
    CORDOBA_ORDENANZAS_PATH, cordobaOrdenanzasHandler,
    CORDOBA_VCATASTRO_PATH, cordobaVcatastroHandler,
    CORDOBA_MANZANA_PATH, cordobaManzanaHandler,
} from './cordobaZoningProxy.js';
// §ZARAGOZA-ZONING-PROXY — the IDEZar `urbanismo:Calificaciones_Urbanas` calificación lookup.
// Client consumer: @pryzm/site-parcel-data → resolveZaragozaZone. ⚠ Renders NO number while
// ZARAGOZA_ENVELOPE_VERIFIED is false — the DATA path that turns on with a future L-449 sign-off.
import {
    ZARAGOZA_CALIFICACIONES_PATH, zaragozaCalificacionesHandler,
} from './zaragozaZoningProxy.js';
// §MURCIA-PGOU-PROXY (INE 30030) — the municipal GeoServer calificación (`Murcia:pgou_alineaciones`)
// + ámbito (`Murcia:pgou_sectores`) point lookup. Client consumer: @pryzm/site-parcel-data →
// resolveMurciaZoning. ⚠ Returns IDENTITY only — neither layer publishes altura/edificabilidad/
// ocupación/retranqueo, so the client's honest output is a CITED REFUSAL (PGOU Arts. 6.6.1–6.6.2 /
// 5.24.5 remit the ordering to a prior instrument). This route makes that refusal SPECIFIC.
import { MURCIA_PGOU_PATH, murciaPgouHandler } from './murciaPgouProxy.js';
// §BALEARS-MUIB-PROXY (L-680) — the Illes Balears zone + normative *fitxa* point lookup. Client
// consumer: @pryzm/site-parcel-data → resolveBalearsMuib. ⚠ TWO upstreams, ONE route: the ArcGIS
// zoning layer (which our OWN CSP allowlist blocks, despite the remote sending CORS) and the fitxa
// page (no CORS, and published as plain http:// = mixed content). Both measured before the proxy was
// written — `tools/balears-muib-probe/r1-reachability.mjs`. Returns what the Govern publishes;
// authorises nothing (BALEARS_ENVELOPE_VERIFIED is false).
import { BALEARS_MUIB_PATH, balearsMuibHandler } from './balearsMuibProxy.js';
// SWITZERLAND: same-origin KEYLESS national Nutzungsplanung WFS proxy (geodienste.ch) — returns the
// zone-identification GML so the client renders the real zone; the buildable envelope refuses (Outcome B).
import { CH_GRUNDNUTZUNG_PATH, chGrundnutzungHandler } from './chGrundnutzungProxy.js';
// §ZURICH-BZO-PROXY (BFS-Nr 261) — the CITY-of-Zürich BZO zone-ID lookup, finer than the national
// Grundnutzung above. Client consumer: @pryzm/site-parcel-data → resolveZurichBzoZone. ⚠ THIS ROUTE
// WAS MISSING: the client resolver and the §L-616 computed-envelope dispatch both shipped without
// it, so every Zürich parcel resolved `endpoint-unreachable` and fell to the national refusal.
import { CH_ZURICH_BZO_PATH, zurichBzoHandler } from './chZurichBzoProxy.js';
// §PARIS-PLU-PROXY — the Ville-de-Paris PLU bioclimatique zone (GPU zone_urba) + numeric hauteur
// plafond (opendata plub_hauteur) same-origin lookup. Client consumer: resolveParisPluZone. Zone +
// height RENDER; the buildable envelope refuses unless FR_PARIS_PLU_CERTIFIED is signed (emprise PDF-bound).
import { PARIS_PLU_PATH, parisPluHandler } from './parisPluProxy.js';
// L-613 — the open, keyless non-Spain cadastres (FR/NL/NO/DE-NRW) under /api/parcel/:cc.
import { EU_PARCEL_PATH, euParcelHandler, euParcelsAreaHandler } from './euCadastreProxy.js';
// L-613 (Denmark slice) — the Danish Matrikel cadastral proxy (credential-gated Datafordeler).
import { DK_PARCEL_PATH, dkParcelHandler, DK_PARCEL_AREA_PATH, dkParcelsAreaHandler } from './dkMatrikelProxy.js';
// §CA-BC-PARCEL-PROXY (2026-09-06, lane MEXICO-CANADA) — ParcelMap BC on the BC Data Catalogue's
// keyless public WFS. Canada has NO national parcel fabric (land titles are provincial), so this is
// a per-PROVINCE route, not a `/api/parcel/ca`: BC is the province that answers keylessly, and the
// module header carries the exact HTTP answer of every other Canadian and Mexican door probed the
// same day (Ontario bulk-only + unspecified licence, Québec endpoint not found, Alberta commercial,
// CDMX point-without-polygon, datos.gob.mx HTTP 403). Client consumer: a future resolveCaBcParcel.
// ⚠ Returns IDENTITY + surveyed area only. BC zoning is MUNICIPAL and is NOT in this layer, so no
// buildable envelope may be derived from it.
import { CA_BC_PARCEL_PATH, caBcParcelHandler } from './caBcParcelProxy.js';
// §KR-PARCEL-KEYED-LEG (2026-09-06, lane KOREA-FROM-NOTHING) — South Korea's cadastral map via
// V-World. A KEYED leg (dkMatrikelProxy precedent): with no `VWORLD_API_KEY` it answers
// { parcel: null, reason: 'kr-no-credential' } and NEVER a fabricated polygon.
import { KR_PARCEL_PATH, krParcelHandler } from './krParcelProxy.js';

/**
 * The routes this router owns, in registration order, as `[method, path]`.
 *
 * Exported so the reachability test can assert the live surface without booting
 * the whole monolith. ORDER IS PART OF THE CONTRACT (Express matches in
 * registration order; a specific path registered after a `:param` catch-all on
 * the same prefix is dead).
 *
 * @type {ReadonlyArray<readonly [string, string]>}
 */
export const JURISDICTION_ROUTES = Object.freeze([
    ['get', CATASTRO_PARCEL_PATH],
    ['get', CATASTRO_BLOCK_PATH],
    ['get', CATASTRO_PARCELS_PATH],
    ['get', MUC_ZONING_PATH],
    ['get', MUC_INSTRUMENT_PATH],
    ['get', BCN_REFOS_OV_PATH],
    ['get', PLANDATA_ZONING_PATH],
    ['get', PLANDATA_BYGGEFELT_PATH],
    ['get', SIU_CLASSIFICATION_PATH],
    ['get', MADRID_CONDICIONES_PATH],
    ['get', MADRID_NORMAS_ZONALES_PATH],
    ['get', NL_BESTEMMINGSPLAN_PATH],
    ['get', CORDOBA_ORDENANZAS_PATH],
    ['get', CORDOBA_VCATASTRO_PATH],
    ['get', CORDOBA_MANZANA_PATH],
    ['get', ZARAGOZA_CALIFICACIONES_PATH],
    ['get', MURCIA_PGOU_PATH],
    ['get', BALEARS_MUIB_PATH],
    ['get', CH_GRUNDNUTZUNG_PATH],
    ['get', CH_ZURICH_BZO_PATH],
    ['get', PARIS_PLU_PATH],
    ['get', CA_BC_PARCEL_PATH],
    ['get', KR_PARCEL_PATH],
    ['get', DK_PARCEL_AREA_PATH],
    ['get', DK_PARCEL_PATH],
    ['get', `${EU_PARCEL_PATH}/:cc/area`],
    ['get', `${EU_PARCEL_PATH}/:cc`],
]);

/**
 * Build the jurisdiction-proxy router.
 *
 * @param {object} deps
 * @param {import('express').RequestHandler} deps.apiLimiter
 *   The monolith's shared per-IP API limiter (60 req/min). INJECTED, not
 *   imported: it is the ONE thing this bounded context needs from core, and
 *   naming it in the signature is what keeps the boundary honest. Every route
 *   below was behind it before the extraction and still is.
 * @returns {import('express').Router}
 */
export function createJurisdictionRouter({ apiLimiter }) {
    if (typeof apiLimiter !== 'function') {
        // Fail loud at wiring time. A silently-missing limiter would turn every
        // keyless upstream gov endpoint into an open forwarder — a security
        // regression that no test asserting "the route answers 200" would catch.
        throw new TypeError(
            '[jurisdiction] createJurisdictionRouter requires an `apiLimiter` middleware.',
        );
    }

    const router = express.Router();

    // §PARCEL-PROXY (L-380 P0) — same-origin Catastro cadastral-parcel proxy + SHARED
    // server-side cache for the "select a real parcel" map mode. Public + unauthenticated
    // (cadastral geometry is public gov data, not user-specific). GET /api/catastro/parcel
    // ?lon=&lat= → the server reverse-geocodes the click to a referencia catastral (OVC
    // Consulta_RCCOOR_Distancia, keyless), then fetches the parcel polygon (INSPIRE WFS
    // GetParcel by REFCAT — the WFS has no BBOX), NORMALISES GML → a WGS84 lat/lon ring,
    // and caches by refcat (7-day TTL, bounded) so repeat clicks / demo reloads are instant
    // and gentle on the shared gov endpoints. apiLimiter (60 req/min/IP) guards abuse.
    // Same-origin → connect-src 'self' already covers it (NO CSP change). Never crashes:
    // no parcel / upstream failure → 200 { parcel: null } so the client falls back to draw.
    router.get(CATASTRO_PARCEL_PATH, apiLimiter, catastroParcelHandler);
    // ADR-0271 P4b §CATASTRO-BLOCK — the manzana ring the block-derived depth needs. Same limiter
    // and same posture as the parcel route: resolves to null on any doubt, never fabricates.
    router.get(CATASTRO_BLOCK_PATH, apiLimiter, catastroBlockHandler);
    // C57 §1.14 §CADASTRAL-AREA-IS-A-DECLARED-CAPABILITY — GET /api/catastro/parcels
    // ?lat=&lon=&radiusM= → EVERY Catastro parcel in the box enclosing that circle, for the §5.5
    // neighbours overlay. Reuses `buildParcelBboxUrl` + `parseParcelCollectionGml` (the manzana
    // route's own machine) with a wider window and an explicit count cap, so a truncated answer is
    // KNOWN rather than guessed. Same limiter, same posture: an outage is `outcome:'unreachable'`
    // + no-store, never an empty finding about the land.
    router.get(CATASTRO_PARCELS_PATH, apiLimiter, catastroParcelsAreaHandler);
    router.get(MUC_ZONING_PATH, apiLimiter, mucZoningHandler);
    router.get(MUC_INSTRUMENT_PATH, apiLimiter, mucInstrumentHandler);
    // §BCN-REFOS-OV-PROXY — the clau-18 volumetric-ordering lookup. Same posture as the MUC route:
    // same-origin (so `connect-src 'self'` already covers it — NO CSP change), keyless public AMB data,
    // never crashes. 200 { features: [...] } (possibly empty = a genuine "no OV published here") vs 502
    // (upstream outage) are DELIBERATELY distinct — §CONTEXT-DATA-HONESTY.
    router.get(BCN_REFOS_OV_PATH, apiLimiter, bcnRefosOvHandler);

    // §PLANDATA-ZONING-PROXY (L-399a) — same-origin KEYLESS Denmark zoning proxy for the
    // FIRST genuine-data jurisdiction of the compliance pilot (C58 §1.2 fidelity 1). Public
    // + unauthenticated (Plandata.dk plan data is open gov data). GET /api/plandata/zoning
    // ?lat=&lon= → the server queries the Plandata GeoServer WFS for the applicable plan
    // (lokalplan, else kommuneplan-ramme) at the point and returns its RAW attributes, cached
    // by coordinate (24-h TTL, bounded). The pure Danish-field → C58 ZoningRecord mapping runs
    // client-side (@pryzm/site-parcel-data). apiLimiter (60 req/min/IP) guards abuse. Same-origin
    // → connect-src 'self' already covers it (NO CSP change). Never crashes: out-of-Denmark /
    // no plan / upstream failure → 200 { zoning: null } so the client falls back to the estimated
    // default pack (the envelope is never broken).
    router.get(PLANDATA_ZONING_PATH, apiLimiter, plandataZoningHandler);
    // §BYGGEFELT-PROXY (DK G3/G6 tier 1) — GET /api/plandata/byggefelt?minx=&miny=&maxx=&maxy=&crs=
    // &count=&startIndex=&binding= → the adopted BUILDING-FIELD polygons intersecting the bbox.
    //
    // ⚠ THIS ROUTE EXISTS BECAUSE `User-Agent` IS A FORBIDDEN BROWSER HEADER. A browser calling
    // geoserver.plandata.dk directly is an anonymous client on a public, taxpayer-funded endpoint that
    // Erhvervsstyrelsen cannot attribute or contact (and CORS + CSP `connect-src 'self'` block it
    // anyway). Going through our origin makes the identifying UA and the rate limit real, once for the
    // product rather than once per tab. It takes a BBOX, never a URL or a CQL filter, so it cannot be
    // turned into an open forwarder. Public + unauthenticated, exactly like the zoning route above.
    // STRUCTURAL-SEAM-4: upstream failure → 502 (never 200 with an empty collection, which the client
    // would read as a durable "no byggefelt at this parcel"); a clean empty → 200 with 0 features.
    router.get(PLANDATA_BYGGEFELT_PATH, apiLimiter, plandataByggefeltHandler);
    // §L-441 — SIU national land classification (urbano / urbanizable / rustico) by point.
    router.get(SIU_CLASSIFICATION_PATH, apiLimiter, siuClassificationHandler);
    // §MADRID-CONDICIONES-PROXY (L-608) — Madrid PGOUM-97 NZ 1 buildable footprint (explicit-area) at a
    // point. Same posture as the proxies around it: same-origin (no CSP change), apiLimiter, never
    // crashes — upstream OK → 200 { features }, upstream failure → 502 (distinct from an empty answer,
    // so the client returns endpoint-unreachable, never no-feature).
    router.get(MADRID_CONDICIONES_PATH, apiLimiter, madridCondicionesHandler);
    // §MADRID-NORMAS-ZONALES-PROXY — GET /api/madrid/normas-zonales?lat=&lon= → { features } carrying
    // AMB_TX_ETIQ (one of the 34 live Norma-Zonal codes) + AMB_TX_DENOM. Same honesty split as the
    // condiciones proxy: upstream OK incl. genuinely zero features → 200, upstream failure → 502.
    router.get(MADRID_NORMAS_ZONALES_PATH, apiLimiter, madridNormasZonalesHandler);
    // §NL-BESTEMMINGSPLAN-PROXY — GET /api/nl/bestemmingsplan?lat=&lon= → { plan, bestemmingsvlak,
    // bouwvlak, maatvoeringen } (keyless PDOK RP WMS, governing-plan picked). Empty → { plan: null };
    // upstream failure → 502 (distinct from empty, so the client returns endpoint-unreachable).
    router.get(NL_BESTEMMINGSPLAN_PATH, apiLimiter, nlBestemmingsplanHandler);
    // §CORDOBA-ZONING-PROXY (WIRING-TODO 5) — COACo PGOU-2001 subzone (spatial) + refcat-join (attrs +
    // derived-planning override). ⚠ Renders NO number while CORDOBA_ENVELOPE_VERIFIED is false; the DATA
    // path that turns on with the L-449 sign-off. Same-origin, apiLimiter, never crashes.
    router.get(CORDOBA_ORDENANZAS_PATH, apiLimiter, cordobaOrdenanzasHandler);
    router.get(CORDOBA_VCATASTRO_PATH, apiLimiter, cordobaVcatastroHandler);
    // §COR-MANZANA-PROXY — same-origin KEYLESS `idecordoba:manzana` published block-ring lookup at
    // `ide.cordoba.es` (the Ayuntamiento IDE GeoServer, a DIFFERENT host+publisher from COACo above).
    // GET /api/cordoba/manzana?lat=&lon= → { crs, manzanas, truncated }. Feeds resolveCordobaStreetWidth.
    router.get(CORDOBA_MANZANA_PATH, apiLimiter, cordobaManzanaHandler);
    // §ZARAGOZA-ZONING-PROXY — IDEZar `urbanismo:Calificaciones_Urbanas` spatial point lookup. ⚠
    // Renders NO number while ZARAGOZA_ENVELOPE_VERIFIED is false. Same-origin, apiLimiter, never crashes.
    router.get(ZARAGOZA_CALIFICACIONES_PATH, apiLimiter, zaragozaCalificacionesHandler);
    // §MURCIA-PGOU-PROXY — same-origin KEYLESS municipal GeoServer WFS point lookup.
    // GET /api/es/murcia-pgou?lat=&lon= → { calificaciones, sectores } (7-day coord cache). Each key is
    // `null` when THAT layer's upstream did not answer and `[]` when it answered empty — failure and
    // absence never collapse; both layers down → 502. Identity RENDERS in the refusal card; the
    // buildable envelope REFUSES (the numbers live in a prior, separately approved instrument).
    router.get(MURCIA_PGOU_PATH, apiLimiter, murciaPgouHandler);
    // §BALEARS-MUIB-PROXY — same-origin KEYLESS GOIB MUIB point lookup (ArcGIS REST + the fitxa page).
    // GET /api/es/balears-muib?lat=&lon= → { qualificacions, fitxa } (7-day coord cache).
    // `qualificacions: null` = the zoning layer did not answer (→ 502); `[]` = it answered and covers
    // nothing here; `fitxa: null` = the fitxa page did not load — three distinct facts, never one.
    // ⚠ The fitxa URL comes from the FEATURE, never from the request, and is host-allowlisted (SSRF).
    // Zone identity + the fitxa's own parameters RENDER in the refusal card; the buildable envelope
    // REFUSES — the reading is unsigned (L-449) and six constraint families are unmodelled (ADR-0293).
    router.get(BALEARS_MUIB_PATH, apiLimiter, balearsMuibHandler);
    // SWITZERLAND — same-origin KEYLESS national Nutzungsplanung WFS proxy (geodienste.ch, NOT
    // geo-blocked). GET /api/ch/grundnutzung?lat=&lon= → the zone GML at the point (24-h coord cache).
    // Zone RENDERS client-side; buildable envelope REFUSES (density/height model+PDF-bound — Outcome B).
    router.get(CH_GRUNDNUTZUNG_PATH, apiLimiter, chGrundnutzungHandler);
    // §ZURICH-BZO-PROXY — same-origin KEYLESS City-of-Zürich BZO WFS point lookup (BFS-Nr 261).
    // GET /api/ch/zurich-bzo?lat=&lon= → { gml } (7-day coord cache), the `bzo_zone_v` zone IDENTITY:
    // the municipal `typ` code + a DIRECT link to THIS parcel's BZO 700.100 ordinance. Returns NO
    // number (the layer publishes none); the AZ/height come from the owner-signed BZO transcription
    // client-side. Every upstream form failing → 502 (distinct from an empty answer, so the client
    // returns endpoint-unreachable, never a false "no BZO zone here"). Never crashes.
    router.get(CH_ZURICH_BZO_PATH, apiLimiter, zurichBzoHandler);
    // §PARIS-PLU-PROXY — same-origin KEYLESS GPU zone_urba WFS + opendata plub_hauteur point lookups.
    // GET /api/paris/plu?lat=&lon= → { zone, hauteur }. Zone + numeric height RENDER; buildable envelope
    // refuses (emprise au sol PDF-bound) unless FR_PARIS_PLU_CERTIFIED. Never crashes.
    router.get(PARIS_PLU_PATH, apiLimiter, parisPluHandler);
    // L-613 — Spain-parity "Select parcel" for the open cadastres. ⚠ Denmark's dedicated route MUST be
    // registered BEFORE the `:cc` catch-all (Express matches specific paths before params). DK carries a
    // server-side Datafordeler credential (Matrikel is not keyless); without it → { parcel: null } →
    // client OSM footprint. FR/NL/NO/DE-NRW are keyless under /api/parcel/:cc.
    // §CA-BC-PARCEL-PROXY — ParcelMap BC by point. Registered BEFORE the `:cc` catch-all for the same
    // reason Denmark is: `/api/ca/bc/parcel` is a distinct prefix today, but the ordering rule this
    // block already states ("specific before param") is the contract, and a future `/api/parcel/:cc`
    // widening must not be able to swallow it. Keyless, same-origin, never crashes: outside BC / no
    // parcel / upstream failure → 200 { parcel: null }.
    router.get(CA_BC_PARCEL_PATH, apiLimiter, caBcParcelHandler);
    // §KR-PARCEL-KEYED-LEG — South Korea by point. Registered BEFORE the `:cc` catch-all for the same
    // "specific before param" reason Denmark and BC are. ⚠ HONEST-DEFERRED, not wired-and-working:
    // V-World requires a free 인증키 that this server does not hold, AND its origin answered HTTP 502 /
    // curl exit 52 to seven probes on 2026-09-06 — so today every call returns { parcel: null } with a
    // named `reason` and the client falls back to the OSM footprint. Never crashes.
    router.get(KR_PARCEL_PATH, apiLimiter, krParcelHandler);
    // C57 §1.14 — Denmark's AREA query on the KEYLESS DAWA `cirkel` leg. ⚠ Registered BEFORE
    // `/api/parcel/dk` for the same "specific before param" reason the whole block states, and
    // before `/api/parcel/:cc/area` so the `:cc` form can never swallow it.
    router.get(DK_PARCEL_AREA_PATH, apiLimiter, dkParcelsAreaHandler);
    router.get(DK_PARCEL_PATH, apiLimiter, dkParcelHandler);
    // C57 §1.14 — the EU AREA query. ⚠ BEFORE the bare `:cc` route: `/api/parcel/fr/area` has a
    // different segment count so Express would not confuse them today, but the ordering rule this
    // block already states is the contract, not the current path shapes. A leg whose config does
    // not declare `areaQuery` answers `unsupported` and NAMES itself — never a blank draw.
    router.get(`${EU_PARCEL_PATH}/:cc/area`, apiLimiter, euParcelsAreaHandler);
    router.get(`${EU_PARCEL_PATH}/:cc`, apiLimiter, euParcelHandler);

    return router;
}
