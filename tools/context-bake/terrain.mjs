#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// PRYZM terrain compiler — Phase 3 of the Context Scene-Compiler + Terrain North Star
// (docs/04-reference/CONTEXT-SCENE-COMPILER-AND-TERRAIN-NORTH-STAR.md §6.3).
//
// WHAT: national DTM raster (GeoTIFF, bare-earth) → clip to a city bbox → error-bounded
// TIN (MARTINI) → LOD pyramid → Cesium **quantized-mesh** (.terrain) tiles + layer.json →
// object storage (R2), mirroring the PMTiles bake's static-tile delivery. The browser
// consumes it through `CesiumTerrainProvider` — it never touches a GIS format (§0 reframe).
//
// STANDALONE — this does NOT edit or import bake.mjs's building core. bake.mjs owns the
// footprint/PMTiles pipeline; terrain.mjs owns the elevation/quantized-mesh pipeline. They
// meet only at the shared tile-key scheme and the shared vertical datum (§L-584 below).
//
// ⚠ THE DATUM RULE (L-584 / C12 §1.4 / globeGroundAnchor.ts):
//   Terrain, context buildings, and the parcel envelope MUST share ONE vertical datum:
//   WGS-84 **ellipsoidal** metres (what Cesium's placement APIs consume). National DTMs are
//   published **orthometric** (height above a national tide-gauge geoid: NAP / DVR90 / LN02 /
//   NGF-IGN69 / EVRF2007…). This compiler lifts orthometric → ellipsoidal by adding the local
//   geoid separation (a per-tile constant to cm accuracy over a 256 m tile — see geoidSepM).
//   The SAME lifted DTM is sampled for the site origin and the envelope rasant, so nothing
//   floats or buries. This is the fix for L-584's single-point-at-block-centroid sampling:
//   `fitFootprintGroundPlane()` samples the DTM around the footprint perimeter and fits a
//   plane, giving the rasant AT THE FAÇADE instead of one point at the block centre.
//
// TOOLCHAIN: pure-JS, no GDAL/PDAL (the repo box has neither — this file needs neither). The
// national DTM arrives keyless over WCS/WMS/STAC as a GeoTIFF (see §8b + --sample-city, live-
// verified); everything after is Node. Deps install STANDALONE (a separate artefact, NOT the
// pnpm workspace — `workspace:*` would choke a subdir `npm i`; mirror bake.mjs's Docker-image
// property). In a scratch dir:  npm i geotiff@2 @mapbox/martini@0.2 proj4@2
//   geotiff         — read the DTM GeoTIFF (native CRS)
//   @mapbox/martini — RTIN error-bounded raster→TIN (Mapbox's MARTINI; pydelatin-equivalent)
//   proj4           — the ONE shared horizontal reprojection (reproject.mjs) for every non-NL city
//   (the quantized-mesh encoder is implemented in-file — no npm encoder exists that renders;
//    it is verified by an INDEPENDENT decode round-trip in terrain.verify.mjs.)
//
// USAGE:
//   node terrain.mjs --regions                       # print the per-city REGIONS (bakeable vs blocked)
//   node terrain.mjs --selftest                      # proj4 reprojection self-test (control points)
//   node terrain.mjs --probe                         # live-probe every source (HTTP + Content-Type)
//   node terrain.mjs --sample-city barcelona         # fetch real DTM + print control-point elevations
//   node terrain.mjs --bake-city barcelona \         # fetch national DTM → reproject → quantized-mesh
//        --out out/terrain/barcelona                 #   (ES/FR/CH/NO/DE/IT/GB wired; NL closed-form)
//   node terrain.mjs --fetch-nl amsterdam.tif        # keyless AHN WCS GetCoverage → a DTM GeoTIFF
//   node terrain.mjs --tif <file> --country <cc> \   # compile ONE local GeoTIFF → quantized-mesh
//        --out out/terrain/<city>
//
// Cross-refs: CONTEXT-DATA-TERRAIN.md (per-country sourcing) · globeGroundAnchor.ts (the datum
// boundary) · CesiumViewport.ts (runtime wiring, §9 below) · CONTEXT-3D-PERFORMANCE-ARCHITECTURE.md.
// ─────────────────────────────────────────────────────────────────────────────
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getProjector, selfTest as reprojectSelfTest } from './reproject.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// ═════════════════════════════════════════════════════════════════════════════
// §1 — PER-COUNTRY DTM SOURCE REGISTRY  (mirrors bake.mjs REGIONS / CONTEXT-DATA-TERRAIN.md)
//
// Every row's `probe.url` was LIVE-PROBED (node fetch) 2026-07-24 AND re-probed 2026-07-25 from
// this machine. `verdict` ∈ 'keyless' (HTTP 200 + real coverage/data), 'token' (auth required),
// 'unverified' (host up but exact coverage route not yet pinned). `geoidSepM` is the orthometric→
// ellipsoidal lift at the country's principal city (used by the datum fix; a per-tile EGM2008
// lookup should replace the constant when a geoid grid is wired — the constant is cm-accurate over
// one 256 m tile). NEVER silently use a licence-gated or non-commercial DTM: `license` +
// `commercialOk` are carried so a caller can refuse. FABDEM (global bare-earth fallback) is
// CC-BY-NC — flagged commercialOk:false.
// ═════════════════════════════════════════════════════════════════════════════
export const TERRAIN_SOURCES = {
  nl: {
    country: 'Netherlands', dataset: 'AHN (Actueel Hoogtebestand Nederland) DTM',
    protocol: 'WCS 2.0.1 GetCoverage', coverageId: 'dtm_05m',
    endpoint: 'https://service.pdok.nl/rws/ahn/wcs/v1_0',
    resolutionM: 0.5, horizCrs: 'EPSG:28992 (RD New)', vertDatum: 'NAP (EPSG:5709)',
    compoundCrs: 'EPSG:7415', geoidSepM: 43.0, // NAP→WGS84 ellipsoidal at Amsterdam
    license: 'CC0', commercialOk: true, auth: 'none',
    probe: { url: 'https://service.pdok.nl/rws/ahn/wcs/v1_0?request=GetCapabilities&service=WCS', verdict: 'keyless',
      evidence: 'HTTP 200 text/xml wcs:Capabilities, coverages dsm_05m + dtm_05m; dtm range −8..322 m "hoogte t.o.v NAP". '
        + 'GetCoverage LIVE-VERIFIED keyless 2026-07-25: dtm_05m FORMAT=image/tiff → HTTP 200 image/tiff, 351,985 B, TIFF magic 49492a00. '
        + 'This IS the reproducible one-city proof source (Amsterdam) — see --fetch-nl.' },
  },
  ch: {
    country: 'Switzerland', dataset: 'swissALTI3D DTM',
    protocol: 'STAC → GeoTIFF assets', coverageId: 'ch.swisstopo.swissalti3d',
    endpoint: 'https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissalti3d',
    resolutionM: 0.5, horizCrs: 'EPSG:2056 (LV95)', vertDatum: 'LN02 (EPSG:5728)',
    compoundCrs: 'EPSG:9518', geoidSepM: 49.5, // LN02→ellipsoidal at Zurich
    license: 'swisstopo open (BGDI)', commercialOk: true, auth: 'none',
    probe: { url: 'https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissalti3d', verdict: 'keyless',
      evidence: 'HTTP 200 application/json, STAC collection live, "surface … without vegetation and dev[elopment]" (bare-earth), GeoTIFF asset tiles at public data.geo.admin.ch URLs (per-tile STAC items)' },
  },
  fr: {
    country: 'France', dataset: 'RGE ALTI (IGN) — LiDAR HD MNT where available',
    protocol: 'Géoplateforme WMS-r / WCS', coverageId: 'ELEVATION.ELEVATIONGRIDCOVERAGE',
    endpoint: 'https://data.geopf.fr/wms-r/wms',
    resolutionM: 1.0, horizCrs: 'RGF93 / Lambert-93 (EPSG:2154)', vertDatum: 'NGF-IGN69',
    compoundCrs: 'EPSG:9794', geoidSepM: 45.0, // NGF-IGN69→ellipsoidal at Paris
    license: 'IGN open (etalab 2.0)', commercialOk: true, auth: 'none (free reg for bulk)',
    probe: { url: 'https://data.geopf.fr/wms-r/wms?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0', verdict: 'keyless',
      evidence: 'HTTP 200 application/xml, WMS_Capabilities incl. elevation layers (the /wcs/ows route 404s — use wms-r or the pinned WCS coverage path). The alti REST calc endpoint (data.geopf.fr/altimetrie) also returns keyless z per lon/lat' },
  },
  es: {
    country: 'Spain', dataset: 'PNOA MDT (IGN/CNIG); ICGC MET for Catalonia',
    protocol: 'INSPIRE Elevation WMS / CNIG download', coverageId: 'EL.ElevationGridCoverage',
    endpoint: 'https://servicios.idee.es/wms-inspire/mdt',
    resolutionM: 5.0, horizCrs: 'ETRS89 UTM (EPSG:258xx)', vertDatum: 'EVRF2007 / REDNAP',
    compoundCrs: 'EPSG:7423', geoidSepM: 51.0, // Madrid; ~49 m Barcelona
    license: 'CC-BY 4.0 (PNOA-LiDAR)', commercialOk: true, auth: 'none',
    probe: { url: 'https://servicios.idee.es/wms-inspire/mdt?SERVICE=WMS&REQUEST=GetCapabilities', verdict: 'keyless',
      evidence: 'HTTP 200 text/xml WMS_Capabilities MDT (national INSPIRE elevation). ICGC contextmaps host up (200) but the ICGC elevation WCS route needs pinning — national IGN PNOA already covers Catalonia. Reuses the Spain height (nDSM) DTM per CONTEXT-DATA-TERRAIN.md' },
  },
  no: {
    country: 'Norway', dataset: 'NDH / Nasjonal høydemodell DTM (Kartverket)',
    protocol: 'WCS 1.1 GetCoverage (Geonorge)', coverageId: 'hoyde-dtm-nhm-25833',
    endpoint: 'https://wcs.geonorge.no/skwms1/wcs.hoyde-dtm-nhm-25833',
    resolutionM: 1.0, horizCrs: 'ETRS89 UTM33 (EPSG:25833)', vertDatum: 'NN2000 (EPSG:5941)',
    compoundCrs: 'EPSG:25833+5941', geoidSepM: 41.0, // Oslo
    license: 'Kartverket open (NLOD/CC-BY)', commercialOk: true, auth: 'none',
    probe: { url: 'https://wcs.geonorge.no/skwms1/wcs.hoyde-dtm-nhm-25833?service=WCS&request=GetCapabilities', verdict: 'keyless',
      evidence: 'HTTP 200 text/xml WCS 1.1 Capabilities live (this endpoint is Replit-blocked per the plan doc; reachable from THIS machine). Kartverket also exposes a keyless punkt-elevation REST at ws.geonorge.no/hoydedata' },
  },
  de: {
    country: 'Germany (per-Land; NRW here)', dataset: 'DGM1 NRW (Geobasis NRW)',
    protocol: 'WCS 2.0.1 GetCoverage', coverageId: 'nw_dgm',
    endpoint: 'https://www.wcs.nrw.de/geobasis/wcs_nw_dgm',
    resolutionM: 1.0, horizCrs: 'ETRS89 UTM32 (EPSG:25832)', vertDatum: 'DHHN2016 (EPSG:7837)',
    compoundCrs: 'EPSG:25832+7837', geoidSepM: 45.5, // Cologne
    license: 'dl-de/by-2-0 (attribution)', commercialOk: true, auth: 'none',
    probe: { url: 'https://www.wcs.nrw.de/geobasis/wcs_nw_dgm?SERVICE=WCS&REQUEST=GetCapabilities&VERSION=2.0.1', verdict: 'keyless',
      evidence: 'HTTP 200 text/xml wcs:Capabilities live (the opengeodata.nrw XYZ directory 404s — the WCS is the wireable route). ⚠ Germany = 16 per-Land portals; NRW proven, the other 15 are separate adapters (mirror the L-511 German building state-router)' },
  },
  dk: {
    country: 'Denmark', dataset: 'DHM/Terræn (Danmarks Højdemodel — Datafordeler / Klimadatastyrelsen)',
    protocol: 'WCS 1.0.0 GetCoverage behind Datafordeler apikey', coverageId: 'dhm_terraen',
    endpoint: 'https://wcs.datafordeler.dk/DHMNedboer/dhm_wcs/1.0.0/WCS',
    resolutionM: 0.4, horizCrs: 'ETRS89 UTM32 (EPSG:25832)', vertDatum: 'DVR90 (EPSG:5799)',
    compoundCrs: 'EPSG:4258+5799', geoidSepM: 36.5, // Copenhagen DVR90→WGS84 ellipsoidal (EGM2008 ~36–37 m; was a stale 40.0)
    license: 'free for most uses — verify commercial clause', commercialOk: null,
    // ⚠ 2026 auth: Datafordeler Basic Auth (username/password) is RETIRED (commit 1fc5bc8b,
    // DENMARK-DATAFORDELER-AUTH-2026.md). Same pattern as the DK Matrikel proxy fix: append
    // `&apikey=<DATAFORDELER_API_KEY>` to the DHM WCS request; mint the key at
    // portal.datafordeler.dk. Env var: DATAFORDELER_API_KEY (reuse the Matrikel one).
    auth: 'apikey (&apikey=<DATAFORDELER_API_KEY>; Basic Auth retired 2026 — see DENMARK-DATAFORDELER-AUTH-2026.md)',
    probe: { url: 'https://api.dataforsyningen.dk/dhm_wcs_DAF?service=WCS&request=GetCapabilities&token=', verdict: 'token',
      evidence: 'LIVE-PROBED 2026-07-25: the Datafordeler WCS host (wcs.datafordeler.dk/DHMNedboer/dhm_wcs/1.0.0/WCS) '
        + 'returns HTTP 401 WITHOUT a key — apikey-GATED (GetCoverage needs &apikey=<DATAFORDELER_API_KEY>). '
        + 'INDEPENDENT keyless confirmation of the coverage names: the Dataforsyningen mirror '
        + '(api.dataforsyningen.dk/dhm_wcs_DAF, token empty) serves GetCapabilities HTTP 200 text/xml WCS 1.0.0, '
        + 'service "DTM", coverages dhm_terraen (terrain/DTM — what we bake) + dhm_overflade (surface/DSM). '
        + 'DescribeCoverage + GetCoverage on the mirror are token-gated (403 "User not authorized"). Native EPSG:25832, '
        + 'DVR90 orthometric, FORMAT=GTiff (per the official DHM WCS doc page). Copenhagen skips loudly until the key is in env.' },
  },
  us: {
    country: 'United States', dataset: '3DEP 1 m DEM (USGS / The National Map)',
    protocol: 'TNM products API → S3 GeoTIFF', coverageId: 'Digital Elevation Model (DEM) 1 meter',
    endpoint: 'https://tnmaccess.nationalmap.gov/api/v1/products',
    resolutionM: 1.0, horizCrs: 'per-state UTM (NAD83)', vertDatum: 'NAVD88 (GEOID18)',
    compoundCrs: 'read from GeoTIFF', geoidSepM: -32.0, // CONUS is NEGATIVE (geoid ABOVE ellipsoid)
    license: 'public domain', commercialOk: true, auth: 'none',
    probe: { url: 'https://tnmaccess.nationalmap.gov/api/v1/products?datasets=Digital%20Elevation%20Model%20(DEM)%201%20meter&bbox=-87.65,41.87,-87.62,41.90&max=3', verdict: 'keyless',
      evidence: 'HTTP 200 application/json, "total":1 item "USGS 1 Meter … IL_4_County_QL1_LiDAR_2016", downloadURL on prd-tnm.s3.amazonaws.com. ⚠ geoidSepM is NEGATIVE in CONUS' },
  },
  // ─── L-6xx Phase-3 extension: the countries LIVE-PROBED 2026-07-25 for the multi-city bake ───
  it: {
    country: 'Italy', dataset: 'TINITALY/01 DEM (INGV) — national 10 m bare-earth',
    protocol: 'WMS GetMap → GeoTIFF (GeoServer)', coverageId: 'tinitaly_dem',
    endpoint: 'http://tinitaly.pi.ingv.it/TINItaly_1_1/wms',
    resolutionM: 10.0, horizCrs: 'ETRS89 UTM32/33 (EPSG:258xx)', vertDatum: 'orthometric (Italian geoid)',
    compoundCrs: 'read from GeoTIFF', geoidSepM: 48.0, // Rome/Milan (~46–49 m over Italy)
    license: 'CC-BY 4.0 (cite Tarquini et al. / INGV)', commercialOk: true, auth: 'none',
    probe: { url: 'http://tinitaly.pi.ingv.it/TINItaly_1_1/wms?service=WMS&request=GetCapabilities', verdict: 'keyless',
      evidence: 'LIVE 2026-07-25: HTTP 200 text/xml WMS_Capabilities (214 KB), layer <Name>tinitaly_dem</Name> '
        + '"TINITALY, a digital elevation model of Italy with a 10 meter…", AccessConstraints=none. GeoServer WMS → '
        + 'GetMap FORMAT=image/geotiff yields a real GeoTIFF for a bbox. ⚠ 10 m grid (coarser than the 0.5–1 m '
        + 'national DTMs elsewhere) but a genuine national bare-earth model; covers Rome + Milan.' },
  },
  gb: {
    country: 'United Kingdom (England)', dataset: 'EA LIDAR Composite DTM 1 m (Environment Agency)',
    protocol: 'WCS 2.0.1 GetCoverage', coverageId: '13787b9a-26a4-4775-8523-806d13af58fc__Lidar_Composite_Elevation_DTM_1m',
    endpoint: 'https://environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m/wcs',
    resolutionM: 1.0, horizCrs: 'OSGB36 / British National Grid (EPSG:27700)', vertDatum: 'ODN (Newlyn)',
    compoundCrs: 'EPSG:27700+5701', geoidSepM: 46.0, // London ODN→WGS84 ellipsoid
    license: 'Open Government Licence v3', commercialOk: true, auth: 'none',
    probe: { url: 'https://environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m/wcs?service=WCS&request=GetCapabilities', verdict: 'keyless',
      evidence: 'LIVE 2026-07-25: HTTP 200 application/xml WCS 2.0.1 Capabilities (7.4 KB), CoverageId '
        + '"…__Lidar_Composite_Elevation_DTM_1m" Title "Lidar_Composite_Elevation_DTM_1m", ServiceTypeVersion 2.0.1/1.1.x. '
        + 'OGL v3 → commercial OK. England coverage includes London (Scotland/Wales are separate portals).' },
  },
  se: {
    country: 'Sweden', dataset: 'Lantmäteriet Markhöjdmodell / höjddata grid 1+',
    protocol: 'Lantmäteriet download/OGC API (free consumer key)', coverageId: 'markhojdmodell',
    endpoint: 'https://api.lantmateriet.se/ (Höjddata Nedladdning)',
    resolutionM: 1.0, horizCrs: 'SWEREF99 TM (EPSG:3006)', vertDatum: 'RH2000 (EPSG:5613)',
    compoundCrs: 'EPSG:3006+5613', geoidSepM: 26.0, // Stockholm RH2000→WGS84 ellipsoid
    license: 'CC0 (open data since 2022)', commercialOk: true, auth: 'apikey (free Lantmäteriet consumer key)',
    probe: { url: 'https://api.lantmateriet.se/distribution/produkter/hojdgrid/v1/', verdict: 'token',
      evidence: 'LIVE 2026-07-25: HTTP 404 on the unauthenticated distribution route + 404 on the OGC-features '
        + 'guess — the elevation IS open (CC0) but delivered through Lantmäteriet\'s account-gated download/API, so it '
        + 'needs a FREE registered consumer key (LANTMATERIET_API_KEY), like DK\'s Datafordeler apikey. Pin the exact '
        + 'GeoTIFF/tiff download route once the key is minted.' },
  },
  fi: {
    country: 'Finland', dataset: 'NLS/Maanmittauslaitos Korkeusmalli 2 m (KM2)',
    protocol: 'WCS 2.0 GetCoverage (avoin-karttakuva, API key)', coverageId: 'korkeusmalli_2m',
    endpoint: 'https://avoin-karttakuva.maanmittauslaitos.fi/ortokuvat-ja-korkeusmallit/wcs/v2',
    resolutionM: 2.0, horizCrs: 'ETRS-TM35FIN (EPSG:3067)', vertDatum: 'N2000 (EPSG:5717)',
    compoundCrs: 'EPSG:3067+5717', geoidSepM: 19.0, // Helsinki N2000→WGS84 ellipsoid
    license: 'CC-BY 4.0 (NLS open data)', commercialOk: true, auth: 'apikey (free NLS open-data key)',
    probe: { url: 'https://avoin-karttakuva.maanmittauslaitos.fi/ortokuvat-ja-korkeusmallit/wcs/v2?service=WCS&request=GetCapabilities', verdict: 'token',
      evidence: 'LIVE 2026-07-25: HTTP 401 without a key — the NLS elevation WCS is CC-BY 4.0 open data but '
        + 'requires a FREE API key (MML_API_KEY, register at asiointi.maanmittauslaitos.fi). Keyless everywhere else '
        + 'in Nordics except this one; add the key as a CI secret to bake Helsinki.' },
  },
  pt: {
    country: 'Portugal', dataset: '(no open national bare-earth DTM found)',
    protocol: 'n/a', coverageId: null,
    endpoint: 'https://www.dgterritorio.gov.pt/ (DGT)',
    resolutionM: null, horizCrs: 'ETRS89 / PT-TM06 (EPSG:3763)', vertDatum: 'Cascais 1938',
    compoundCrs: null, geoidSepM: 53.0, // Lisbon (for when a source is found)
    license: 'BLOCKED — no open commercial DTM located', commercialOk: null, auth: 'none',
    probe: { url: 'https://cartografia.dgterritorio.gov.pt/wcs/ELEVATION?service=WCS&request=GetCapabilities', verdict: 'blocked',
      evidence: 'LIVE 2026-07-25: HTTP 404 text/html on the guessed DGT elevation WCS; DGT publishes cartography '
        + 'but NO open national high-res bare-earth DTM WCS/tiles. Only fallback is Copernicus (EU-DEM 25 m deprecated, '
        + 'or GLO-30 which is a DSM not bare-earth) — neither is an acceptable commercial national drape. BLOCKED: '
        + 'needs a founder-sourced DGT DTM licence or a Copernicus-DEM commercial-clearance decision.' },
  },
  be: {
    country: 'Belgium (region-split; Brussels-Capital here)', dataset: '(no keyless national DTM; Brussels DTM unsourced)',
    protocol: 'regional WCS (per region)', coverageId: null,
    endpoint: 'https://geoservices-urbis.irisnet.be/geoserver/ows (URBIS — reference, not elevation)',
    resolutionM: null, horizCrs: 'Lambert 2008 (EPSG:3812)', vertDatum: 'TAW/DNG (Ostend)',
    compoundCrs: null, geoidSepM: 45.0, // Brussels
    license: 'BLOCKED — Brussels-Capital DTM route not located', commercialOk: null, auth: 'none',
    probe: { url: 'https://geoservices-urbis.irisnet.be/geoserver/ows?service=WCS&request=GetCapabilities', verdict: 'blocked',
      evidence: 'LIVE 2026-07-25: URBIS GeoServer OWS answers (HTTP 200 xml) but exposes NO elevation coverage '
        + '(WCS 2.0.1 + 1.0.0 both return a ~500-byte empty/exception doc). Belgium has NO national DTM — it is '
        + 'REGION-split (Flanders DHMV, Wallonia MNT LiDAR both open) but Brussels-Capital is an enclaved separate '
        + 'region neither reliably covers. BLOCKED for Brussels until the Brussels-Capital (Bruxelles '
        + 'Environnement / CIRB) DTM service + licence are pinned. Mirror the DE per-Land router.' },
  },
  sa: {
    country: 'Saudi Arabia', dataset: '(no open national DTM found)',
    protocol: 'n/a', coverageId: null,
    endpoint: 'https://www.geosa.gov.sa/ (GEOSA — national geospatial authority)',
    resolutionM: null, horizCrs: 'MTM / Ain el Abd or ETRS-like', vertDatum: 'unknown',
    compoundCrs: null, geoidSepM: null,
    license: 'BLOCKED — no open DEM/DSM service', commercialOk: null, auth: 'unknown',
    probe: { url: 'https://www.geosa.gov.sa/', verdict: 'blocked',
      evidence: 'GEOSA is the national authority but publishes NO open DEM/DSM WCS/WMS/tile service. No keyless '
        + 'national bare-earth DTM exists (matches the Saudi OSM building-desert finding — the whole country is '
        + 'data-scarce and gov-gated). BLOCKED: founder must ask a GEOSA/MOMRAH contact for a DEM service + licence. '
        + 'FABDEM (30 m global, CC-BY-NC) exists here but is NON-COMMERCIAL — must NOT be shipped as a drape.' },
  },
  // Global bare-earth fallback for everywhere with no national open DTM (CONTEXT-DATA-TERRAIN.md).
  _fabdem: {
    country: 'GLOBAL FALLBACK', dataset: 'FABDEM (Forest And Buildings removed Copernicus DEM)',
    protocol: 'tiled GeoTIFF download', coverageId: 'FABDEM_V1-2',
    endpoint: 'https://data.bris.ac.uk/data/dataset/25wfy0f9ukoge2gs7a5mqpq2j7',
    resolutionM: 30.0, horizCrs: 'EPSG:4326', vertDatum: 'EGM2008 (bare-earth)',
    compoundCrs: 'EPSG:4326+3855', geoidSepM: 0.0, // EGM2008-referenced; near-geoid
    license: 'CC-BY-NC-SA 4.0', commercialOk: false, auth: 'none',
    probe: { url: 'https://data.bris.ac.uk/data/dataset/25wfy0f9ukoge2gs7a5mqpq2j7', verdict: 'unverified',
      evidence: '⚠ NON-COMMERCIAL licence (CC-BY-NC-SA). MUST NOT ship as a drape surface for a commercial product without clearing the clause. Bare-earth (correct choice over raw GLO-30 DSM) but flagged, not silently used' },
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// §1b — PER-CITY TERRAIN REGIONS  (mirrors bake.mjs REGIONS — the 25 jurisdiction cities)
//
// Each city maps to a country DTM `source` (a TERRAIN_SOURCES key) + a city-centre `bbox`
// [minLon,minLat,maxLon,maxLat]. Bboxes mirror bake.mjs's building REGIONS 1:1 (the three Spanish
// cities are pinned here because the BUILDING bake uses one national `spain` region, but TERRAIN is
// per-city — a whole-Spain DTM tiling is far too large, so we clip PNOA MDT per city). A city whose
// `source` is BLOCKED (no open commercial DTM) is carried with `blocked:true` + the reason, and the
// CLI / CI SKIPS it with a loud note — never a silent omission. The client's terrainCoverage.ts
// lists exactly the non-blocked slugs, so an un-baked/blocked city keeps flat ground (no regression).
// ═════════════════════════════════════════════════════════════════════════════
export const REGIONS = [
  // slug          source  bbox [W,S,E,N]                          note
  // §NL-NATIONWIDE — NL terrain stays PER-CITY (keyless AHN). ⚠ This deliberately DIVERGES from
  // bake.mjs's building REGIONS, which now bakes the WHOLE `netherlands` (buildings are cheap OSM
  // tiles). Whole-country AHN quantized-mesh is a HEAVY bake (see the terrain follow-up note), so we
  // cover the demo cities per-city and leave the country-wide DTM as a scoped follow-up.
  { name: 'amsterdam',    source: 'nl', bbox: [4.83, 52.34, 4.97, 52.42] },
  { name: 'rotterdam',    source: 'nl', bbox: [4.42, 51.88, 4.55, 51.96] },
  { name: 'utrecht',      source: 'nl', bbox: [5.06, 52.06, 5.16, 52.12] },
  { name: 'thehague',     source: 'nl', bbox: [4.25, 52.04, 4.35, 52.10] },
  { name: 'eindhoven',    source: 'nl', bbox: [5.42, 51.40, 5.52, 51.48] },
  { name: 'paris',        source: 'fr', bbox: [2.22, 48.80, 2.47, 48.91] },
  { name: 'lyon',         source: 'fr', bbox: [4.78, 45.70, 4.92, 45.80] },
  { name: 'rome',         source: 'it', bbox: [12.40, 41.83, 12.60, 41.99] },
  { name: 'milan',        source: 'it', bbox: [9.10, 45.40, 9.28, 45.55] },
  { name: 'london',       source: 'gb', bbox: [-0.20, 51.44, 0.02, 51.55] },
  { name: 'copenhagen',   source: 'dk', bbox: [12.50, 55.63, 12.65, 55.72] }, // apikey (DATAFORDELER_API_KEY)
  { name: 'oslo',         source: 'no', bbox: [10.66, 59.88, 10.83, 59.96] },
  { name: 'stockholm',    source: 'se', bbox: [17.98, 59.28, 18.14, 59.37] }, // apikey (LANTMATERIET_API_KEY)
  { name: 'helsinki',     source: 'fi', bbox: [24.88, 60.14, 25.02, 60.20] }, // apikey (MML_API_KEY)
  { name: 'zurich',       source: 'ch', bbox: [8.45, 47.34, 8.62, 47.43] },
  { name: 'geneva',       source: 'ch', bbox: [6.09, 46.17, 6.18, 46.25] },
  { name: 'bern',         source: 'ch', bbox: [7.40, 46.93, 7.48, 46.99] },
  // Köln is the NRW-covered German city (Geobasis NRW DGM1) — the DE terrain reference. Berlin/Munich
  // stay BLOCKED below (different Länder, separate portals), mirroring the L-511 German state-router.
  { name: 'koln',         source: 'de', bbox: [6.85, 50.88, 7.02, 50.99] },
  { name: 'madrid',       source: 'es', bbox: [-3.80, 40.33, -3.58, 40.52] },
  { name: 'barcelona',    source: 'es', bbox: [2.09, 41.32, 2.23, 41.47] },
  { name: 'valencia',     source: 'es', bbox: [-0.43, 39.40, -0.30, 39.52] }, // ~0.13°/0.12° span → z10 like Barcelona; same PNOA MDT source
  { name: 'toledo',       source: 'es', bbox: [-4.08, 39.82, -3.95, 39.91] }, // DRAMATIC desnivel: old city on a granite promontory in the Tagus gorge (~100 m cliffs) — the relief-shading showcase
  { name: 'cordoba',      source: 'es', bbox: [-4.85, 37.84, -4.72, 37.94] },
  // Costa del Sol (Málaga→Marbella) — big desnivel: coastal cities under the Sierra de Mijas / Sierra
  // Blanca (La Concha 1215 m). Each ≤22 km (ES maxExtentM cap) so the whole bbox is fetched unclamped.
  { name: 'malaga',       source: 'es', bbox: [-4.52, 36.66, -4.38, 36.78] }, // city + Gibralfaro + Montes de Málaga foothills
  { name: 'benalmadena',  source: 'es', bbox: [-4.62, 36.56, -4.48, 36.66] }, // coast → Benalmádena Pueblo up the hill (~280 m)
  { name: 'fuengirola',   source: 'es', bbox: [-4.70, 36.49, -4.56, 36.63] }, // coast → Mijas Pueblo on the sierra (~430 m) + Sierra de Mijas
  { name: 'marbella',     source: 'es', bbox: [-4.95, 36.47, -4.82, 36.59] }, // coast → La Concha / Sierra Blanca (1215 m towering over the town)
  // §ES-ALL-CAPITALS (L-636) — all Spanish provincial capitals + Balearics + Canaries + big non-capitals.
  // Same keyless PNOA MDT source; each bbox is a formulaic ~0.14°×0.12° centre box (≤22 km ES cap → z10).
  { name: 'sevilla',        source: 'es', bbox: [-6.0545, 37.3291, -5.9145, 37.4491] },
  { name: 'zaragoza',       source: 'es', bbox: [-0.9591, 41.5888, -0.8191, 41.7088] },
  { name: 'murcia',         source: 'es', bbox: [-1.2007, 37.9322, -1.0607, 38.0522] },
  { name: 'palma',          source: 'es', bbox: [2.5802, 39.5096, 2.7202, 39.6296] },
  { name: 'laspalmas',      source: 'es', bbox: [-15.5063, 28.0635, -15.3663, 28.1835] },
  { name: 'bilbao',         source: 'es', bbox: [-3.005, 43.203, -2.865, 43.323] },
  { name: 'alicante',       source: 'es', bbox: [-0.551, 38.2852, -0.411, 38.4052] },
  { name: 'valladolid',     source: 'es', bbox: [-4.7945, 41.5923, -4.6545, 41.7123] },
  { name: 'vigo',           source: 'es', bbox: [-8.7907, 42.1806, -8.6507, 42.3006] },
  { name: 'gijon',          source: 'es', bbox: [-5.7311, 43.4722, -5.5911, 43.5922] },
  { name: 'acoruna',        source: 'es', bbox: [-8.4815, 43.3023, -8.3415, 43.4223] },
  { name: 'vitoria',        source: 'es', bbox: [-2.7416, 42.7867, -2.6016, 42.9067] },
  { name: 'granada',        source: 'es', bbox: [-3.6686, 37.1173, -3.5286, 37.2373] },
  { name: 'elche',          source: 'es', bbox: [-0.7826, 38.2099, -0.6426, 38.3299] },
  { name: 'oviedo',         source: 'es', bbox: [-5.9194, 43.3019, -5.7794, 43.4219] },
  { name: 'santacruztenerife', source: 'es', bbox: [-16.3218, 28.4036, -16.1818, 28.5236] },
  { name: 'cartagena',      source: 'es', bbox: [-1.0666, 37.5657, -0.9266, 37.6857] },
  { name: 'jerez',          source: 'es', bbox: [-6.1961, 36.625, -6.0561, 36.745] },
  { name: 'alcaladehenares', source: 'es', bbox: [-3.4335, 40.422, -3.2935, 40.542] },
  { name: 'pamplona',       source: 'es', bbox: [-1.7158, 42.7525, -1.5758, 42.8725] },
  { name: 'almeria',        source: 'es', bbox: [-2.5337, 36.774, -2.3937, 36.894] },
  { name: 'sansebastian',   source: 'es', bbox: [-2.0512, 43.2583, -1.9112, 43.3783] },
  { name: 'santander',      source: 'es', bbox: [-3.88, 43.4023, -3.74, 43.5223] },
  { name: 'castellon',      source: 'es', bbox: [-0.1213, 39.9264, 0.0187, 40.0464] },
  { name: 'burgos',         source: 'es', bbox: [-3.7669, 42.2839, -3.6269, 42.4039] },
  { name: 'albacete',       source: 'es', bbox: [-1.9285, 38.9343, -1.7885, 39.0543] },
  { name: 'logrono',        source: 'es', bbox: [-2.5149, 42.4027, -2.3749, 42.5227] },
  { name: 'lalaguna',       source: 'es', bbox: [-16.3859, 28.4274, -16.2459, 28.5474] },
  { name: 'badajoz',        source: 'es', bbox: [-7.0407, 38.8194, -6.9007, 38.9394] },
  { name: 'salamanca',      source: 'es', bbox: [-5.7335, 40.9101, -5.5935, 41.0301] },
  { name: 'huelva',         source: 'es', bbox: [-7.0147, 37.2014, -6.8747, 37.3214] },
  { name: 'lleida',         source: 'es', bbox: [0.55, 41.5576, 0.69, 41.6776] },
  { name: 'tarragona',      source: 'es', bbox: [1.1745, 41.0589, 1.3145, 41.1789] },
  { name: 'leon',           source: 'es', bbox: [-5.6371, 42.5387, -5.4971, 42.6587] },
  { name: 'cadiz',          source: 'es', bbox: [-6.3586, 36.4671, -6.2186, 36.5871] },
  { name: 'jaen',           source: 'es', bbox: [-3.8549, 37.7196, -3.7149, 37.8396] },
  { name: 'ourense',        source: 'es', bbox: [-7.9339, 42.2758, -7.7939, 42.3958] },
  { name: 'girona',         source: 'es', bbox: [2.7514, 41.9194, 2.8914, 42.0394] },
  { name: 'lugo',           source: 'es', bbox: [-7.6259, 42.9521, -7.4859, 43.0721] },
  { name: 'caceres',        source: 'es', bbox: [-6.4424, 39.4153, -6.3024, 39.5353] },
  { name: 'santiago',       source: 'es', bbox: [-8.6148, 42.8182, -8.4748, 42.9382] },
  { name: 'guadalajara',    source: 'es', bbox: [-3.2337, 40.5697, -3.0937, 40.6897] },
  { name: 'pontevedra',     source: 'es', bbox: [-8.7144, 42.371, -8.5744, 42.491] },
  { name: 'palencia',       source: 'es', bbox: [-4.5988, 41.9496, -4.4588, 42.0696] },
  { name: 'ciudadreal',     source: 'es', bbox: [-3.9976, 38.9248, -3.8576, 39.0448] },
  { name: 'zamora',         source: 'es', bbox: [-5.8146, 41.4433, -5.6746, 41.5633] },
  { name: 'avila',          source: 'es', bbox: [-4.7512, 40.5965, -4.6112, 40.7165] },
  { name: 'cuenca',         source: 'es', bbox: [-2.2074, 40.0104, -2.0674, 40.1304] },
  { name: 'segovia',        source: 'es', bbox: [-4.1788, 40.8829, -4.0388, 41.0029] },
  { name: 'soria',          source: 'es', bbox: [-2.549, 41.7066, -2.409, 41.8266] },
  { name: 'teruel',         source: 'es', bbox: [-1.1765, 40.2856, -1.0365, 40.4056] },
  { name: 'huesca',         source: 'es', bbox: [-0.4789, 42.0801, -0.3389, 42.2001] },
  // §ES-ALL-MUNI (L-636) — all Spanish municipalities >10k pop (GeoNames, 6km-deduped). Same es/PNOA source.
  { name: 'lhospitaletdellobregat',source: 'es', bbox: [2.0303, 41.2997, 2.1703, 41.4197] },
  { name: 'latina',       source: 'es', bbox: [-3.8157, 40.329, -3.6757, 40.449] },
  { name: 'fuencarral',   source: 'es', bbox: [-3.7533, 40.44, -3.6133, 40.56] },
  { name: 'terrassa',     source: 'es', bbox: [1.9467, 41.5067, 2.0867, 41.6267] },
  { name: 'badalona',     source: 'es', bbox: [2.1774, 41.39, 2.3174, 41.51] },
  { name: 'sabadell',     source: 'es', bbox: [2.0394, 41.4833, 2.1794, 41.6033] },
  { name: 'mostoles',     source: 'es', bbox: [-3.935, 40.2623, -3.795, 40.3823] },
  { name: 'fuenlabrada',  source: 'es', bbox: [-3.8641, 40.2242, -3.7241, 40.3442] },
  { name: 'sanblascanillejas',source: 'es', bbox: [-3.6854, 40.3789, -3.5454, 40.4989] },
  { name: 'mataro',       source: 'es', bbox: [2.3745, 41.4821, 2.5145, 41.6021] },
  { name: 'telde',        source: 'es', bbox: [-15.4891, 27.9324, -15.3491, 28.0524] },
  { name: 'doshermanas',  source: 'es', bbox: [-5.9909, 37.2229, -5.8509, 37.3429] },
  { name: 'algeciras',    source: 'es', bbox: [-5.5205, 36.0733, -5.3805, 36.1933] },
  { name: 'torrejondeardoz',source: 'es', bbox: [-3.5397, 40.3954, -3.3997, 40.5154] },
  { name: 'alcobendas',   source: 'es', bbox: [-3.712, 40.4875, -3.572, 40.6075] },
  { name: 'reus',         source: 'es', bbox: [1.0369, 41.0961, 1.1769, 41.2161] },
  { name: 'orihuela',     source: 'es', bbox: [-1.014, 38.0248, -0.874, 38.1448] },
  { name: 'lasrozasdemadrid',source: 'es', bbox: [-3.9437, 40.4329, -3.8037, 40.5529] },
  { name: 'sanfernando',  source: 'es', bbox: [-6.2682, 36.4159, -6.1282, 36.5359] },
  { name: 'roquetasdemar',source: 'es', bbox: [-2.6847, 36.7042, -2.5447, 36.8242] },
  { name: 'lorca',        source: 'es', bbox: [-1.7717, 37.6112, -1.6317, 37.7312] },
  { name: 'talaveradelareina',source: 'es', bbox: [-4.9008, 39.9035, -4.7608, 40.0235] },
  { name: 'elpuertodesantamaria',source: 'es', bbox: [-6.303, 36.5339, -6.163, 36.6539] },
  { name: 'melilla',      source: 'es', bbox: [-3.0083, 35.2337, -2.8683, 35.3537] },
  { name: 'elejido',      source: 'es', bbox: [-2.8846, 36.7163, -2.7446, 36.8363] },
  { name: 'chiclanadelafrontera',source: 'es', bbox: [-6.2137, 36.3598, -6.0737, 36.4798] },
  { name: 'ceuta',        source: 'es', bbox: [-5.3904, 35.8292, -5.2504, 35.9492] },
  { name: 'algorta',      source: 'es', bbox: [-3.0794, 43.2893, -2.9394, 43.4093] },
  { name: 'torrevieja',   source: 'es', bbox: [-0.7522, 37.9187, -0.6122, 38.0387] },
  { name: 'pozuelodealarcon',source: 'es', bbox: [-3.8834, 40.3729, -3.7434, 40.4929] },
  { name: 'santcugatdelvalles',source: 'es', bbox: [2.0161, 41.4106, 2.1561, 41.5306] },
  { name: 'aviles',       source: 'es', bbox: [-5.9948, 43.4947, -5.8548, 43.6147] },
  { name: 'arona',        source: 'es', bbox: [-16.751, 28.0396, -16.611, 28.1596] },
  { name: 'torrent',      source: 'es', bbox: [-0.5355, 39.377, -0.3955, 39.4971] },
  { name: 'manresa',      source: 'es', bbox: [1.754, 41.6682, 1.894, 41.7882] },
  { name: 'valdemoro',    source: 'es', bbox: [-3.7489, 40.1308, -3.6089, 40.2508] },
  { name: 'velezmalaga',  source: 'es', bbox: [-4.1727, 36.7211, -4.0327, 36.8411] },
  { name: 'gandia',       source: 'es', bbox: [-0.2533, 38.9067, -0.1133, 39.0267] },
  { name: 'santalucia',   source: 'es', bbox: [-15.6107, 27.8517, -15.4707, 27.9717] },
  { name: 'benidorm',     source: 'es', bbox: [-0.201, 38.4782, -0.061, 38.5982] },
  { name: 'alcaladeguadaira',source: 'es', bbox: [-5.9095, 37.2779, -5.7695, 37.3979] },
  { name: 'ponferrada',   source: 'es', bbox: [-6.6662, 42.4866, -6.5262, 42.6066] },
  { name: 'rivasvaciamadrid',source: 'es', bbox: [-3.5809, 40.2661, -3.4409, 40.3861] },
  { name: 'sanlucardebarrameda',source: 'es', bbox: [-6.4215, 36.7181, -6.2815, 36.8381] },
  { name: 'campina',      source: 'es', bbox: [-3.0507, 38.159, -2.9107, 38.279] },
  { name: 'estepona',     source: 'es', bbox: [-5.2159, 36.3676, -5.0759, 36.4876] },
  { name: 'ferrol',       source: 'es', bbox: [-8.3029, 43.4245, -8.1629, 43.5445] },
  { name: 'castelldefels',source: 'es', bbox: [1.9003, 41.2179, 2.0403, 41.3379] },
  { name: 'sagunto',      source: 'es', bbox: [-0.3367, 39.6233, -0.1967, 39.7433] },
  { name: 'vilanovailageltru',source: 'es', bbox: [1.6551, 41.1639, 1.7951, 41.2839] },
  { name: 'villadevallecas',source: 'es', bbox: [-3.6715, 40.307, -3.5315, 40.427] },
  { name: 'lalineadelaconcepcion',source: 'es', bbox: [-5.4178, 36.1081, -5.2778, 36.2281] },
  { name: 'molinadesegura',source: 'es', bbox: [-1.2776, 37.9946, -1.1376, 38.1146] },
  { name: 'paterna',      source: 'es', bbox: [-0.5108, 39.4426, -0.3708, 39.5626] },
  { name: 'colladovillalba',source: 'es', bbox: [-4.0749, 40.5751, -3.9349, 40.6951] },
  { name: 'irun',         source: 'es', bbox: [-1.8594, 43.279, -1.7194, 43.399] },
  { name: 'alcoy',        source: 'es', bbox: [-0.5443, 38.6454, -0.4043, 38.7655] },
  { name: 'arrecife',     source: 'es', bbox: [-13.6177, 28.903, -13.4777, 29.023] },
  { name: 'granollers',   source: 'es', bbox: [2.2177, 41.548, 2.3577, 41.668] },
  { name: 'motril',       source: 'es', bbox: [-3.5879, 36.6907, -3.4479, 36.8107] },
  { name: 'merida',       source: 'es', bbox: [-6.4129, 38.858, -6.2729, 38.978] },
  { name: 'linares',      source: 'es', bbox: [-3.706, 38.0352, -3.566, 38.1552] },
  { name: 'sanvicentdelraspeig',source: 'es', bbox: [-0.5955, 38.3364, -0.4555, 38.4564] },
  { name: 'torrelavega',  source: 'es', bbox: [-4.1179, 43.2894, -3.9779, 43.4094] },
  { name: 'elda',         source: 'es', bbox: [-0.8616, 38.4178, -0.7216, 38.5378] },
  { name: 'aranjuez',     source: 'es', bbox: [-3.6725, 39.9711, -3.5325, 40.0911] },
  { name: 'boadilladelmonte',source: 'es', bbox: [-3.9483, 40.345, -3.8083, 40.465] },
  { name: 'utrera',       source: 'es', bbox: [-5.8509, 37.1252, -5.7109, 37.2452] },
  { name: 'molletdelvalles',source: 'es', bbox: [2.1431, 41.4803, 2.2831, 41.6003] },
  { name: 'puertollano',  source: 'es', bbox: [-4.1773, 38.6271, -4.0373, 38.7471] },
  { name: 'calvia',       source: 'es', bbox: [2.4362, 39.5057, 2.5762, 39.6257] },
  { name: 'arganda',      source: 'es', bbox: [-3.5072, 40.2408, -3.3672, 40.3608] },
  { name: 'vilareal',     source: 'es', bbox: [-0.1709, 39.8783, -0.0309, 39.9983] },
  { name: 'ibiza',        source: 'es', bbox: [1.363, 38.8488, 1.503, 38.9688] },
  { name: 'figueres',     source: 'es', bbox: [2.8916, 42.2064, 3.0316, 42.3265] },
  { name: 'mairenadelaljarafe',source: 'es', bbox: [-6.1339, 37.2846, -5.9939, 37.4046] },
  { name: 'antequera',    source: 'es', bbox: [-4.6312, 36.9594, -4.4912, 37.0794] },
  { name: 'alzira',       source: 'es', bbox: [-0.5033, 39.09, -0.3633, 39.21] },
  { name: 'mieres',       source: 'es', bbox: [-5.8367, 43.19, -5.6967, 43.31] },
  { name: 'colmenarviejo',source: 'es', bbox: [-3.8376, 40.5991, -3.6976, 40.7191] },
  { name: 'manacor',      source: 'es', bbox: [3.1396, 39.5096, 3.2796, 39.6296] },
  { name: 'lucena',       source: 'es', bbox: [-4.5552, 37.3488, -4.4152, 37.4688] },
  { name: 'trescantos',   source: 'es', bbox: [-3.7781, 40.5409, -3.6381, 40.6609] },
  { name: 'laorotava',    source: 'es', bbox: [-16.5931, 28.3308, -16.4531, 28.4508] },
  { name: 'denia',        source: 'es', bbox: [0.0357, 38.7808, 0.1757, 38.9008] },
  { name: 'alcantarilla', source: 'es', bbox: [-1.2871, 37.9094, -1.1471, 38.0294] },
  { name: 'plasencia',    source: 'es', bbox: [-6.1584, 39.9712, -6.0184, 40.0912] },
  { name: 'blanes',       source: 'es', bbox: [2.7204, 41.6142, 2.8604, 41.7342] },
  { name: 'granadilladeabona',source: 'es', bbox: [-16.646, 28.0588, -16.506, 28.1788] },
  { name: 'sama',         source: 'es', bbox: [-5.7542, 43.2357, -5.6142, 43.3557] },
  { name: 'ecija',        source: 'es', bbox: [-5.1526, 37.4822, -5.0126, 37.6022] },
  { name: 'vic',          source: 'es', bbox: [2.1849, 41.8701, 2.3249, 41.9901] },
  { name: 'sanfernandodehenares',source: 'es', bbox: [-3.6026, 40.3639, -3.4626, 40.4839] },
  { name: 'mirandadeebro',source: 'es', bbox: [-3.0169, 42.6265, -2.877, 42.7465] },
  { name: 'igualada',     source: 'es', bbox: [1.5472, 41.521, 1.6872, 41.641] },
  { name: 'errenteria',   source: 'es', bbox: [-1.9723, 43.252, -1.8323, 43.372] },
  { name: 'rincondelavictoria',source: 'es', bbox: [-4.3458, 36.6571, -4.2058, 36.7772] },
  { name: 'vilafrancadelpenedes',source: 'es', bbox: [1.6271, 41.2862, 1.7671, 41.4062] },
  { name: 'ripollet',     source: 'es', bbox: [2.0874, 41.4369, 2.2274, 41.5569] },
  { name: 'losrosales',   source: 'es', bbox: [-3.7585, 40.2957, -3.6186, 40.4157] },
  { name: 'ontinyent',    source: 'es', bbox: [-0.676, 38.7619, -0.536, 38.8819] },
  { name: 'vilagarciadearousa',source: 'es', bbox: [-8.8343, 42.5363, -8.6943, 42.6563] },
  { name: 'andujar',      source: 'es', bbox: [-4.1208, 37.9792, -3.9808, 38.0992] },
  { name: 'donbenito',    source: 'es', bbox: [-5.9316, 38.8963, -5.7916, 39.0163] },
  { name: 'ronda',        source: 'es', bbox: [-5.2371, 36.6823, -5.0971, 36.8023] },
  { name: 'lospalaciosyvillafranca',source: 'es', bbox: [-5.9943, 37.1018, -5.8543, 37.2218] },
  { name: 'marratxi',     source: 'es', bbox: [2.6553, 39.5614, 2.7953, 39.6814] },
  { name: 'arucas',       source: 'es', bbox: [-15.5932, 28.0598, -15.4532, 28.1798] },
  { name: 'tomelloso',    source: 'es', bbox: [-3.0916, 39.0976, -2.9516, 39.2176] },
  { name: 'llucmajor',    source: 'es', bbox: [2.8211, 39.4309, 2.9611, 39.5509] },
  { name: 'maspalomas',   source: 'es', bbox: [-15.656, 27.7006, -15.516, 27.8206] },
  { name: 'realejoalto',  source: 'es', bbox: [-16.6557, 28.3165, -16.5157, 28.4365] },
  { name: 'larinconada',  source: 'es', bbox: [-6.0509, 37.4261, -5.9109, 37.5461] },
  { name: 'elvendrell',   source: 'es', bbox: [1.4633, 41.1567, 1.6033, 41.2767] },
  { name: 'puertodelrosario',source: 'es', bbox: [-13.9327, 28.4404, -13.7927, 28.5604] },
  { name: 'torrepacheco', source: 'es', bbox: [-1.024, 37.6829, -0.884, 37.8029] },
  { name: 'oleiros',      source: 'es', bbox: [-8.3867, 43.2733, -8.2467, 43.3933] },
  { name: 'villena',      source: 'es', bbox: [-0.9357, 38.5773, -0.7957, 38.6973] },
  { name: 'mazarron',     source: 'es', bbox: [-1.3849, 37.5392, -1.2449, 37.6592] },
  { name: 'tortosa',      source: 'es', bbox: [0.4516, 40.7525, 0.5916, 40.8725] },
  { name: 'alhaurindelatorre',source: 'es', bbox: [-4.6314, 36.604, -4.4914, 36.724] },
  { name: 'yecla',        source: 'es', bbox: [-1.1847, 38.5537, -1.0447, 38.6737] },
  { name: 'sanpedroalcantara',source: 'es', bbox: [-5.0612, 36.4284, -4.9212, 36.5484] },
  { name: 'cieza',        source: 'es', bbox: [-1.4899, 38.18, -1.3499, 38.3] },
  { name: 'tudela',       source: 'es', bbox: [-1.6745, 42.0017, -1.5345, 42.1217] },
  { name: 'azuquecadehenares',source: 'es', bbox: [-3.3375, 40.5057, -3.1975, 40.6257] },
  { name: 'ubeda',        source: 'es', bbox: [-3.4405, 37.9533, -3.3005, 38.0733] },
  { name: 'aguilas',      source: 'es', bbox: [-1.6529, 37.3463, -1.5129, 37.4663] },
  { name: 'villajoyosa',  source: 'es', bbox: [-0.3035, 38.4475, -0.1635, 38.5675] },
  { name: 'olot',         source: 'es', bbox: [2.4201, 42.121, 2.5601, 42.241] },
  { name: 'almendralejo', source: 'es', bbox: [-6.4775, 38.6232, -6.3375, 38.7432] },
  { name: 'arandadeduero',source: 'es', bbox: [-3.7592, 41.6104, -3.6192, 41.7304] },
  { name: 'cambrils',     source: 'es', bbox: [0.9895, 41.01, 1.1295, 41.13] },
  { name: 'castrourdiales',source: 'es', bbox: [-3.2904, 43.3228, -3.1504, 43.4429] },
  { name: 'galapagar',    source: 'es', bbox: [-4.0743, 40.5183, -3.9343, 40.6383] },
  { name: 'santapola',    source: 'es', bbox: [-0.6358, 38.1317, -0.4958, 38.2517] },
  { name: 'sanjavier',    source: 'es', bbox: [-0.9074, 37.7463, -0.7674, 37.8663] },
  { name: 'arroyomolinos',source: 'es', bbox: [-3.9895, 40.2095, -3.8495, 40.3295] },
  { name: 'santaeulariadesriu',source: 'es', bbox: [1.4641, 38.9246, 1.6041, 39.0446] },
  { name: 'carballo',     source: 'es', bbox: [-8.761, 43.153, -8.621, 43.273] },
  { name: 'arcosdelafrontera',source: 'es', bbox: [-5.8806, 36.6907, -5.7406, 36.8108] },
  { name: 'valdepenas',   source: 'es', bbox: [-3.4548, 38.7021, -3.3148, 38.8221] },
  { name: 'hellin',       source: 'es', bbox: [-1.771, 38.4506, -1.631, 38.5706] },
  { name: 'alcazardesanjuan',source: 'es', bbox: [-3.2783, 39.3301, -3.1383, 39.4501] },
  { name: 'coriadelrio',  source: 'es', bbox: [-6.1241, 37.2277, -5.9841, 37.3477] },
  { name: 'camargo',      source: 'es', bbox: [-3.955, 43.3474, -3.815, 43.4674] },
  { name: 'puentegenil',  source: 'es', bbox: [-4.8369, 37.3294, -4.6969, 37.4494] },
  { name: 'culleredo',    source: 'es', bbox: [-8.4586, 43.2279, -8.3186, 43.3479] },
  { name: 'atamaria',     source: 'es', bbox: [-0.8768, 37.5399, -0.7368, 37.6599] },
  { name: 'puertodelcarmen',source: 'es', bbox: [-13.7358, 28.8631, -13.5958, 28.9831] },
  { name: 'arteixo',      source: 'es', bbox: [-8.5775, 43.2448, -8.4375, 43.3648] },
  { name: 'xativa',       source: 'es', bbox: [-0.5885, 38.9304, -0.4485, 39.0504] },
  { name: 'ingenio',      source: 'es', bbox: [-15.5043, 27.8586, -15.3643, 27.9786] },
  { name: 'inca',         source: 'es', bbox: [2.8409, 39.6611, 2.9809, 39.7811] },
  { name: 'galdakao',     source: 'es', bbox: [-2.9129, 43.1707, -2.7729, 43.2907] },
  { name: 'totana',       source: 'es', bbox: [-1.5723, 37.7088, -1.4323, 37.8288] },
  { name: 'redondela',    source: 'es', bbox: [-8.6796, 42.2234, -8.5396, 42.3434] },
  { name: 'ciutadella',   source: 'es', bbox: [3.7714, 39.9411, 3.9114, 40.0611] },
  { name: 'mao',          source: 'es', bbox: [4.1958, 39.8285, 4.3358, 39.9485] },
  { name: 'crevillente',  source: 'es', bbox: [-0.8797, 38.1899, -0.7397, 38.3099] },
  { name: 'sueca',        source: 'es', bbox: [-0.3811, 39.1426, -0.2411, 39.2626] },
  { name: 'rota',         source: 'es', bbox: [-6.43, 36.5636, -6.29, 36.6836] },
  { name: 'carmona',      source: 'es', bbox: [-5.7161, 37.4112, -5.5761, 37.5313] },
  { name: 'oliva',        source: 'es', bbox: [-0.1894, 38.8597, -0.0493, 38.9797] },
  { name: 'vinaros',      source: 'es', bbox: [0.4056, 40.4103, 0.5456, 40.5303] },
  { name: 'durango',      source: 'es', bbox: [-2.7038, 43.1112, -2.5638, 43.2312] },
  { name: 'javea',        source: 'es', bbox: [0.0967, 38.7233, 0.2367, 38.8433] },
  { name: 'santvicencdelshorts',source: 'es', bbox: [1.9369, 41.3332, 2.0769, 41.4532] },
  { name: 'elcampello',   source: 'es', bbox: [-0.4677, 38.3688, -0.3277, 38.4889] },
  { name: 'martorell',    source: 'es', bbox: [1.8606, 41.414, 2.0006, 41.534] },
  { name: 'morondelafrontera',source: 'es', bbox: [-5.524, 37.0608, -5.384, 37.1808] },
  { name: 'almunecar',    source: 'es', bbox: [-3.7617, 36.6725, -3.6217, 36.7925] },
  { name: 'sitges',       source: 'es', bbox: [1.7419, 41.1751, 1.8819, 41.2951] },
  { name: 'ribeira',      source: 'es', bbox: [-8.5111, 42.6781, -8.3711, 42.7981] },
  { name: 'eibar',        source: 'es', bbox: [-2.5416, 43.1249, -2.4016, 43.2449] },
  { name: 'premiademar',  source: 'es', bbox: [2.2952, 41.4321, 2.4352, 41.5521] },
  { name: 'novelda',      source: 'es', bbox: [-0.8377, 38.3248, -0.6977, 38.4448] },
  { name: 'santauxiaderibeira',source: 'es', bbox: [-9.0609, 42.4935, -8.9209, 42.6135] },
  { name: 'catarroja',    source: 'es', bbox: [-0.47, 39.34, -0.33, 39.46] },
  { name: 'salou',        source: 'es', bbox: [1.0716, 41.0166, 1.2116, 41.1366] },
  { name: 'pinedademar',  source: 'es', bbox: [2.6189, 41.5676, 2.7589, 41.6876] },
  { name: 'benicarlo',    source: 'es', bbox: [0.3571, 40.3565, 0.4971, 40.4765] },
  { name: 'villarrobledo',source: 'es', bbox: [-2.6712, 39.2099, -2.5312, 39.3299] },
  { name: 'nijar',        source: 'es', bbox: [-2.2759, 36.9065, -2.136, 37.0266] },
  { name: 'lebrija',      source: 'es', bbox: [-6.1453, 36.8608, -6.0053, 36.9808] },
  { name: 'caravaca',     source: 'es', bbox: [-1.9334, 38.0456, -1.7934, 38.1656] },
  { name: 'marin',        source: 'es', bbox: [-8.7714, 42.3314, -8.6314, 42.4515] },
  { name: 'lepe',         source: 'es', bbox: [-7.2743, 37.1948, -7.1343, 37.3148] },
  { name: 'laoliva',      source: 'es', bbox: [-13.9991, 28.5505, -13.8591, 28.6705] },
  { name: 'almonte',      source: 'es', bbox: [-6.5867, 37.2047, -6.4467, 37.3247] },
  { name: 'jumilla',      source: 'es', bbox: [-1.395, 38.4192, -1.255, 38.5392] },
  { name: 'valls',        source: 'es', bbox: [1.1799, 41.2261, 1.3199, 41.3461] },
  { name: 'onda',         source: 'es', bbox: [-0.3304, 39.905, -0.1904, 40.025] },
  { name: 'calahorra',    source: 'es', bbox: [-2.0352, 42.2451, -1.8952, 42.3651] },
  { name: 'martos',       source: 'es', bbox: [-4.0426, 37.6611, -3.9026, 37.7811] },
  { name: 'almansa',      source: 'es', bbox: [-1.1671, 38.8092, -1.0271, 38.9292] },
  { name: 'adra',         source: 'es', bbox: [-3.0908, 36.6883, -2.9508, 36.8083] },
  { name: 'candelaria',   source: 'es', bbox: [-16.4427, 28.2948, -16.3027, 28.4148] },
  { name: 'galdar',       source: 'es', bbox: [-15.7202, 28.087, -15.5802, 28.207] },
  { name: 'cullera',      source: 'es', bbox: [-0.32, 39.1067, -0.18, 39.2267] },
  { name: 'ibi',          source: 'es', bbox: [-0.6422, 38.5653, -0.5023, 38.6853] },
  { name: 'castellardelvalles',source: 'es', bbox: [2.0133, 41.5567, 2.1533, 41.6767] },
  { name: 'icoddelosvinos',source: 'es', bbox: [-16.7819, 28.3124, -16.6419, 28.4324] },
  { name: 'altea',        source: 'es', bbox: [-0.1215, 38.5388, 0.0185, 38.6588] },
  { name: 'tacoronte',    source: 'es', bbox: [-16.4802, 28.4169, -16.3402, 28.5369] },
  { name: 'losbarrios',   source: 'es', bbox: [-5.5621, 36.1248, -5.4221, 36.2448] },
  { name: 'baza',         source: 'es', bbox: [-2.8426, 37.4307, -2.7026, 37.5507] },
  { name: 'calp',         source: 'es', bbox: [-0.0255, 38.5847, 0.1145, 38.7047] },
  { name: 'alhaurinelgrande',source: 'es', bbox: [-4.7573, 36.583, -4.6173, 36.703] },
  { name: 'olesademontserrat',source: 'es', bbox: [1.8241, 41.4837, 1.9641, 41.6037] },
  { name: 'ponteareas',   source: 'es', bbox: [-8.574, 42.1148, -8.434, 42.2348] },
  { name: 'montilla',     source: 'es', bbox: [-4.708, 37.5263, -4.568, 37.6463] },
  { name: 'lliria',       source: 'es', bbox: [-0.6678, 39.5689, -0.5278, 39.6889] },
  { name: 'vicar',        source: 'es', bbox: [-2.7127, 36.7716, -2.5727, 36.8916] },
  { name: 'alcalalareal', source: 'es', bbox: [-3.993, 37.4014, -3.853, 37.5214] },
  { name: 'zarautz',      source: 'es', bbox: [-2.2399, 43.2244, -2.0999, 43.3444] },
  { name: 'priegodecordoba',source: 'es', bbox: [-4.2652, 37.3781, -4.1252, 37.4981] },
  { name: 'barbate',      source: 'es', bbox: [-5.9919, 36.1324, -5.8519, 36.2524] },
  { name: 'conildelafrontera',source: 'es', bbox: [-6.1585, 36.2172, -6.0185, 36.3372] },
  { name: 'palafrugell',  source: 'es', bbox: [3.0931, 41.8574, 3.2331, 41.9774] },
  { name: 'ciempozuelos', source: 'es', bbox: [-3.691, 40.0991, -3.551, 40.2191] },
  { name: 'arrasatemondragon',source: 'es', bbox: [-2.5598, 43.0044, -2.4198, 43.1244] },
  { name: 'ribarrojadelturia',source: 'es', bbox: [-0.6407, 39.4859, -0.5007, 39.606] },
  { name: 'santfeliudeguixols',source: 'es', bbox: [2.9633, 41.7233, 3.1033, 41.8433] },
  { name: 'moncada',      source: 'es', bbox: [-0.4655, 39.4855, -0.3255, 39.6056] },
  { name: 'coin',         source: 'es', bbox: [-4.8264, 36.5995, -4.6864, 36.7195] },
  { name: 'santantonideportmany',source: 'es', bbox: [1.2336, 38.9207, 1.3736, 39.0407] },
  { name: 'nerja',        source: 'es', bbox: [-3.9444, 36.6928, -3.8044, 36.8128] },
  { name: 'torrelodones', source: 'es', bbox: [-3.9966, 40.5165, -3.8566, 40.6365] },
  { name: 'lagunadeduero',source: 'es', bbox: [-4.7933, 41.5215, -4.6533, 41.6415] },
  { name: 'mogan',        source: 'es', bbox: [-15.7954, 27.8239, -15.6554, 27.9439] },
  { name: 'navalcarnero', source: 'es', bbox: [-4.082, 40.2291, -3.942, 40.3491] },
  { name: 'loja',         source: 'es', bbox: [-4.2213, 37.1089, -4.0813, 37.2289] },
  { name: 'medinadelcampo',source: 'es', bbox: [-4.9841, 41.2524, -4.8441, 41.3724] },
  { name: 'pilardelahoradada',source: 'es', bbox: [-0.8626, 37.8059, -0.7226, 37.9259] },
  { name: 'cabra',        source: 'es', bbox: [-4.5121, 37.4125, -4.3721, 37.5325] },
  { name: 'islacristina', source: 'es', bbox: [-7.3867, 37.14, -7.2467, 37.26] },
  { name: 'cartama',      source: 'es', bbox: [-4.703, 36.6507, -4.563, 36.7707] },
  { name: 'illescas',     source: 'es', bbox: [-3.917, 40.0621, -3.777, 40.1821] },
  { name: 'amposta',      source: 'es', bbox: [0.5086, 40.6499, 0.6486, 40.77] },
  { name: 'palmadelrio',  source: 'es', bbox: [-5.3512, 37.6402, -5.2112, 37.7602] },
  { name: 'baena',        source: 'es', bbox: [-4.3924, 37.5567, -4.2524, 37.6767] },
  { name: 'ayamonte',     source: 'es', bbox: [-7.4781, 37.1533, -7.3381, 37.2733] },
  { name: 'pajara',       source: 'es', bbox: [-14.1776, 28.2904, -14.0376, 28.4104] },
  { name: 'betera',       source: 'es', bbox: [-0.5315, 39.5311, -0.3915, 39.6511] },
  { name: 'aestrada',     source: 'es', bbox: [-8.5584, 42.6291, -8.4184, 42.7491] },
  { name: 'manlleu',      source: 'es', bbox: [2.2148, 41.9423, 2.3548, 42.0623] },
  { name: 'almoradi',     source: 'es', bbox: [-0.862, 38.0488, -0.722, 38.1688] },
  { name: 'guiadeisora',  source: 'es', bbox: [-16.8495, 28.1515, -16.7095, 28.2715] },
  { name: 'rojales',      source: 'es', bbox: [-0.7954, 38.028, -0.6554, 38.148] },
  { name: 'mairenadelalcor',source: 'es', bbox: [-5.8195, 37.313, -5.6795, 37.433] },
  { name: 'requena',      source: 'es', bbox: [-1.1704, 39.4283, -1.0304, 39.5483] },
  { name: 'algete',       source: 'es', bbox: [-3.5674, 40.5371, -3.4274, 40.6571] },
  { name: 'losllanosdearidane',source: 'es', bbox: [-17.9882, 28.5985, -17.8482, 28.7185] },
  { name: 'lalin',        source: 'es', bbox: [-8.1828, 42.6009, -8.0428, 42.7209] },
  { name: 'calatayud',    source: 'es', bbox: [-1.7132, 41.2935, -1.5732, 41.4135] },
  { name: 'alhamademurcia',source: 'es', bbox: [-1.4951, 37.791, -1.3551, 37.911] },
  { name: 'alcudia',      source: 'es', bbox: [3.0514, 39.7932, 3.1914, 39.9132] },
  { name: 'picassent',    source: 'es', bbox: [-0.5295, 39.3035, -0.3895, 39.4235] },
  { name: 'marchena',     source: 'es', bbox: [-5.4868, 37.269, -5.3468, 37.389] },
  { name: 'banyoles',     source: 'es', bbox: [2.6967, 42.0567, 2.8367, 42.1767] },
  { name: 'moguer',       source: 'es', bbox: [-6.9085, 37.2156, -6.7685, 37.3356] },
  { name: 'elarahal',     source: 'es', bbox: [-5.6153, 37.2027, -5.4753, 37.3227] },
  { name: 'monfortedelemos',source: 'es', bbox: [-7.5842, 42.4617, -7.4442, 42.5817] },
  { name: 'teguise',      source: 'es', bbox: [-13.634, 29.0005, -13.494, 29.1205] },
  { name: 'chipiona',     source: 'es', bbox: [-6.507, 36.6766, -6.367, 36.7966] },
  { name: 'loradelrio',   source: 'es', bbox: [-5.5975, 37.599, -5.4575, 37.719] },
  { name: 'roses',        source: 'es', bbox: [3.1069, 42.202, 3.2469, 42.322] },
  { name: 'manzanares',   source: 'es', bbox: [-3.4399, 38.9392, -3.2999, 39.0592] },
  { name: 'benavente',    source: 'es', bbox: [-5.7483, 41.9425, -5.6083, 42.0625] },
  { name: 'pucol',        source: 'es', bbox: [-0.37, 39.5567, -0.23, 39.6767] },
  { name: 'zubia',        source: 'es', bbox: [-3.654, 37.0591, -3.514, 37.1791] },
  { name: 'boiro',        source: 'es', bbox: [-8.9546, 42.5873, -8.8146, 42.7073] },
  { name: 'bailen',       source: 'es', bbox: [-3.8479, 38.0364, -3.7079, 38.1564] },
  { name: 'guadix',       source: 'es', bbox: [-3.2092, 37.2393, -3.0692, 37.3593] },
  { name: 'daimiel',      source: 'es', bbox: [-3.685, 39.01, -3.545, 39.13] },
  { name: 'sanbartolome', source: 'es', bbox: [-13.683, 28.9409, -13.543, 29.0609] },
  { name: 'santabrigida', source: 'es', bbox: [-15.5742, 27.972, -15.4342, 28.092] },
  { name: 'llodio',       source: 'es', bbox: [-3.032, 43.0832, -2.892, 43.2032] },
  { name: 'felanitx',     source: 'es', bbox: [3.0783, 39.4096, 3.2183, 39.5296] },
  { name: 'sanmartindelavega',source: 'es', bbox: [-3.6406, 40.1473, -3.5006, 40.2674] },
  { name: 'archena',      source: 'es', bbox: [-1.3704, 38.0563, -1.2304, 38.1763] },
  { name: 'tavernesdelavalldigna',source: 'es', bbox: [-0.3362, 39.012, -0.1962, 39.132] },
  { name: 'tarifa',       source: 'es', bbox: [-5.677, 35.9539, -5.5369, 36.0739] },
  { name: 'benicassim',   source: 'es', bbox: [-0.0033, 39.99, 0.1367, 40.11] },
  { name: 'tolosa',       source: 'es', bbox: [-2.148, 43.0748, -2.008, 43.1948] },
  { name: 'nigran',       source: 'es', bbox: [-8.8766, 42.0815, -8.7366, 42.2015] },
  { name: 'aljaraque',    source: 'es', bbox: [-7.0931, 37.2099, -6.9531, 37.3299] },
  { name: 'callosadesegura',source: 'es', bbox: [-0.9482, 38.065, -0.8082, 38.185] },
  { name: 'palamos',      source: 'es', bbox: [3.0591, 41.7884, 3.1991, 41.9084] },
  { name: 'sanlorenzodeelescorial',source: 'es', bbox: [-4.2174, 40.5314, -4.0774, 40.6514] },
  { name: 'lanucia',      source: 'es', bbox: [-0.1969, 38.5537, -0.0569, 38.6737] },
  { name: 'osuna',        source: 'es', bbox: [-5.1731, 37.1776, -5.0331, 37.2976] },
  { name: 'oria',         source: 'es', bbox: [-2.0887, 43.1954, -1.9487, 43.3154] },
  { name: 'amorebieta',   source: 'es', bbox: [-2.8033, 43.1567, -2.6633, 43.2767] },
  { name: 'teo',          source: 'es', bbox: [-8.618, 42.735, -8.478, 42.855] },
  { name: 'launion',      source: 'es', bbox: [-0.948, 37.5591, -0.808, 37.6792] },
  { name: 'utebo',        source: 'es', bbox: [-1.0692, 41.6483, -0.9292, 41.7683] },
  { name: 'pozoblanco',   source: 'es', bbox: [-4.9183, 38.3191, -4.7783, 38.4391] },
  { name: 'guimar',       source: 'es', bbox: [-16.4828, 28.2512, -16.3428, 28.3712] },
  { name: 'huercalovera', source: 'es', bbox: [-2.013, 37.3292, -1.873, 37.4492] },
  { name: 'porrino',      source: 'es', bbox: [-8.6898, 42.1016, -8.5498, 42.2216] },
  { name: 'ejeadeloscaballeros',source: 'es', bbox: [-1.2072, 42.0663, -1.0672, 42.1863] },
  { name: 'vilaseca',     source: 'es', bbox: [2.1853, 42.0017, 2.3253, 42.1217] },
  { name: 'tui',          source: 'es', bbox: [-8.7143, 41.9871, -8.5743, 42.1071] },
  { name: 'pollenca',     source: 'es', bbox: [2.9463, 39.8168, 3.0863, 39.9368] },
  { name: 'navalmoraldelamata',source: 'es', bbox: [-5.6106, 39.8316, -5.4706, 39.9516] },
  { name: 'sanxenxo',     source: 'es', bbox: [-8.877, 42.34, -8.737, 42.46] },
  { name: 'berga',        source: 'es', bbox: [1.7763, 42.0443, 1.9163, 42.1643] },
  { name: 'albolote',     source: 'es', bbox: [-3.7251, 37.1709, -3.5851, 37.2909] },
  { name: 'monzon',       source: 'es', bbox: [0.1241, 41.8508, 0.2641, 41.9708] },
  { name: 'ubrique',      source: 'es', bbox: [-5.516, 36.6178, -5.376, 36.7378] },
  { name: 'mula',         source: 'es', bbox: [-1.5601, 37.981, -1.4201, 38.101] },
  { name: 'bermeo',       source: 'es', bbox: [-2.7915, 43.3609, -2.6515, 43.4809] },
  { name: 'barbastro',    source: 'es', bbox: [0.0569, 41.9756, 0.1969, 42.0957] },
  { name: 'torrox',       source: 'es', bbox: [-4.0223, 36.6979, -3.8823, 36.8179] },
  { name: 'caldesdemontbui',source: 'es', bbox: [2.0967, 41.5733, 2.2367, 41.6933] },
  { name: 'santceloni',   source: 'es', bbox: [2.4197, 41.6292, 2.5597, 41.7492] },
  { name: 'balaguer',     source: 'es', bbox: [0.7409, 41.7312, 0.8809, 41.8512] },
  { name: 'villanuevadelacanada',source: 'es', bbox: [-4.0743, 40.3869, -3.9343, 40.5069] },
  { name: 'cardedeu',     source: 'es', bbox: [2.2874, 41.5798, 2.4274, 41.6998] },
  { name: 'tarrega',      source: 'es', bbox: [1.0696, 41.587, 1.2096, 41.707] },
  { name: 'zafra',        source: 'es', bbox: [-6.4873, 38.3654, -6.3473, 38.4854] },
  { name: 'alcaniz',      source: 'es', bbox: [-0.2033, 40.99, -0.0633, 41.11] },
  { name: 'lascabezasdesanjuan',source: 'es', bbox: [-6.0093, 36.9238, -5.8693, 37.0438] },
  { name: 'lasgabias',    source: 'es', bbox: [-3.7403, 37.0755, -3.6003, 37.1955] },
  { name: 'guardamardelsegura',source: 'es', bbox: [-0.7256, 38.0303, -0.5856, 38.1503] },
  { name: 'yaiza',        source: 'es', bbox: [-13.8353, 28.8968, -13.6953, 29.0168] },
  { name: 'baeza',        source: 'es', bbox: [-3.541, 37.9338, -3.401, 38.0538] },
  { name: 'gernikalumo',  source: 'es', bbox: [-2.7533, 43.2567, -2.6133, 43.3767] },
  { name: 'viveiro',      source: 'es', bbox: [-7.6634, 43.6023, -7.5234, 43.7223] },
  { name: 'montijo',      source: 'es', bbox: [-6.6878, 38.8484, -6.5478, 38.9684] },
  { name: 'sesena',       source: 'es', bbox: [-3.7679, 40.0447, -3.6279, 40.1647] },
  { name: 'mungia',       source: 'es', bbox: [-2.9152, 43.2946, -2.7752, 43.4146] },
  { name: 'laroda',       source: 'es', bbox: [-2.2272, 39.1473, -2.0872, 39.2674] },
  { name: 'santacruzdelapalma',source: 'es', bbox: [-17.8342, 28.6235, -17.6942, 28.7435] },
  { name: 'losalcazares', source: 'es', bbox: [-0.9204, 37.6843, -0.7804, 37.8043] },
  { name: 'tarancon',     source: 'es', bbox: [-3.0773, 39.9485, -2.9373, 40.0685] },
  { name: 'carlet',       source: 'es', bbox: [-0.5914, 39.1666, -0.4514, 39.2866] },
  { name: 'lasolana',     source: 'es', bbox: [-3.3081, 38.8842, -3.1681, 39.0042] },
  { name: 'santcarlesdelarapita',source: 'es', bbox: [0.53, 40.5567, 0.67, 40.6767] },
  { name: 'santafe',      source: 'es', bbox: [-3.7889, 37.1286, -3.6489, 37.2486] },
  { name: 'piera',        source: 'es', bbox: [1.6808, 41.4623, 1.8208, 41.5823] },
  { name: 'tordera',      source: 'es', bbox: [2.6489, 41.6391, 2.7889, 41.7591] },
  { name: 'santomera',    source: 'es', bbox: [-1.1188, 38.0015, -0.9788, 38.1215] },
  { name: 'arenysdemar',  source: 'es', bbox: [2.4794, 41.5219, 2.6194, 41.6419] },
  { name: 'lacarolina',   source: 'es', bbox: [-3.6853, 38.2156, -3.5453, 38.3356] },
  { name: 'torredembarra',source: 'es', bbox: [1.3286, 41.085, 1.4686, 41.2051] },
  { name: 'berja',        source: 'es', bbox: [-3.0197, 36.7869, -2.8797, 36.9069] },
  { name: 'bejar',        source: 'es', bbox: [-5.8334, 40.3264, -5.6934, 40.4464] },
  { name: 'campodecriptana',source: 'es', bbox: [-3.1949, 39.3446, -3.0549, 39.4646] },
  { name: 'lagarriga',    source: 'es', bbox: [2.2133, 41.6233, 2.3533, 41.7433] },
  { name: 'puertolumbreras',source: 'es', bbox: [-1.8797, 37.5033, -1.7397, 37.6233] },
  { name: 'huercaldealmeria',source: 'es', bbox: [-2.5076, 36.8251, -2.3676, 36.9451] },
  { name: 'vecindario',   source: 'es', bbox: [-15.5145, 27.7864, -15.3745, 27.9064] },
  { name: 'guadarrama',   source: 'es', bbox: [-4.1595, 40.6127, -4.0195, 40.7327] },
  { name: 'azpeitia',     source: 'es', bbox: [-2.3369, 43.1225, -2.1969, 43.2425] },
  { name: 'puntaumbria',  source: 'es', bbox: [-7.036, 37.1221, -6.896, 37.2421] },
  { name: 'bergara',      source: 'es', bbox: [-2.4875, 43.0551, -2.3475, 43.1751] },
  { name: 'mos',          source: 'es', bbox: [-7.6132, 43.1012, -7.4732, 43.2212] },
  { name: 'torredelcampo',source: 'es', bbox: [-3.9673, 37.7105, -3.8273, 37.8305] },
  { name: 'teulada',      source: 'es', bbox: [0.0338, 38.6694, 0.1738, 38.7894] },
  { name: 'cangasdelnarcea',source: 'es', bbox: [-6.62, 43.1233, -6.48, 43.2433] },
  { name: 'arnedo',       source: 'es', bbox: [-2.1708, 42.168, -2.0308, 42.288] },
  { name: 'villaviciosa', source: 'es', bbox: [-5.5057, 43.4213, -5.3657, 43.5413] },
  { name: 'paracuellosdejarama',source: 'es', bbox: [-3.5977, 40.4435, -3.4577, 40.5635] },
  { name: 'mollerussa',   source: 'es', bbox: [0.83, 41.5733, 0.97, 41.6933] },
  { name: 'fraga',        source: 'es', bbox: [0.2789, 41.4629, 0.4189, 41.5829] },
  { name: 'estellalizarra',source: 'es', bbox: [-2.1023, 42.6118, -1.9623, 42.7318] },
  { name: 'vilalba',      source: 'es', bbox: [-7.7513, 43.2381, -7.6113, 43.3581] },
  { name: 'chiva',        source: 'es', bbox: [-0.7867, 39.4067, -0.6467, 39.5267] },
  { name: 'fene',         source: 'es', bbox: [-8.22, 43.39, -8.08, 43.51] },
  { name: 'bollullospardelcondado',source: 'es', bbox: [-6.6097, 37.2813, -6.4697, 37.4013] },
  { name: 'ciudadrodrigo',source: 'es', bbox: [-6.6033, 40.54, -6.4633, 40.66] },
  { name: 'vallirana',    source: 'es', bbox: [1.8621, 41.3268, 2.0021, 41.4468] },
  { name: 'soller',       source: 'es', bbox: [2.6452, 39.7062, 2.7852, 39.8262] },
  { name: 'vera',         source: 'es', bbox: [-1.929, 37.1835, -1.789, 37.3035] },
  { name: 'llanera',      source: 'es', bbox: [-5.9208, 43.3796, -5.7808, 43.4996] },
  { name: 'canals',       source: 'es', bbox: [-0.6544, 38.9025, -0.5144, 39.0225] },
  { name: 'ocarballino',  source: 'es', bbox: [-8.149, 42.3716, -8.009, 42.4916] },
  { name: 'aguadulce',    source: 'es', bbox: [-2.6423, 36.7541, -2.5024, 36.8741] },
  { name: 'verin',        source: 'es', bbox: [-7.5081, 41.8815, -7.3681, 42.0015] },
  { name: 'manilva',      source: 'es', bbox: [-5.3203, 36.3164, -5.1803, 36.4365] },
  { name: 'cambados',     source: 'es', bbox: [-8.8831, 42.4522, -8.7431, 42.5722] },
  { name: 'betanzos',     source: 'es', bbox: [-8.2847, 43.2204, -8.1447, 43.3404] },
  { name: 'llanes',       source: 'es', bbox: [-4.8249, 43.3598, -4.6848, 43.4798] },
  { name: 'tuineje',      source: 'es', bbox: [-14.1172, 28.2637, -13.9772, 28.3837] },
  { name: 'corralejo',    source: 'es', bbox: [-13.9375, 28.6708, -13.7975, 28.7908] },
  { name: 'beasain',      source: 'es', bbox: [-2.2709, 42.9902, -2.1309, 43.1102] },
  { name: 'pinospuente',  source: 'es', bbox: [-3.8197, 37.1911, -3.6797, 37.3111] },
  { name: 'aguilar',      source: 'es', bbox: [-4.7272, 37.4548, -4.5872, 37.5748] },
  { name: 'sarria',       source: 'es', bbox: [-7.4843, 42.7215, -7.3443, 42.8415] },
  { name: 'nules',        source: 'es', bbox: [-0.2264, 39.7936, -0.0864, 39.9136] },
  { name: 'obarcodevaldeorras',source: 'es', bbox: [-7.06, 42.3564, -6.92, 42.4764] },
  { name: 'jaca',         source: 'es', bbox: [-0.6199, 42.509, -0.4799, 42.629] },
  { name: 'pilas',        source: 'es', bbox: [-6.371, 37.2434, -6.231, 37.3634] },
  { name: 'villafrancadelosbarros',source: 'es', bbox: [-6.4081, 38.5014, -6.2681, 38.6214] },
  { name: 'tomino',       source: 'es', bbox: [-8.825, 41.9277, -8.685, 42.0477] },
  { name: 'sanagustindelguadalix',source: 'es', bbox: [-3.6864, 40.6188, -3.5464, 40.7388] },
  { name: 'alginet',      source: 'es', bbox: [-0.5367, 39.2067, -0.3967, 39.3267] },
  { name: 'lacarlota',    source: 'es', bbox: [-5.0012, 37.6136, -4.8612, 37.7336] },
  { name: 'socuellamos',  source: 'es', bbox: [-2.862, 39.2258, -2.7221, 39.3458] },
  { name: 'torrijos',     source: 'es', bbox: [-4.3535, 39.9219, -4.2135, 40.042] },
  { name: 'cuevasdelalmanzora',source: 'es', bbox: [-1.9522, 37.2368, -1.8122, 37.3568] },
  { name: 'vejerdelafrontera',source: 'es', bbox: [-6.0372, 36.1921, -5.8972, 36.3121] },
  { name: 'alora',        source: 'es', bbox: [-4.7758, 36.7636, -4.6357, 36.8836] },
  { name: 'montroigdelcamp',source: 'es', bbox: [0.8893, 41.0268, 1.0293, 41.1468] },
  { name: 'coria',        source: 'es', bbox: [-6.606, 39.9241, -6.466, 40.0441] },
  { name: 'valverdedelcamino',source: 'es', bbox: [-6.8243, 37.5151, -6.6843, 37.6351] },
  { name: 'sapobla',      source: 'es', bbox: [2.9539, 39.7092, 3.0939, 39.8292] },
  { name: 'sanlucarlamayor',source: 'es', bbox: [-6.2735, 37.3276, -6.1335, 37.4476] },
  { name: 'salobrena',    source: 'es', bbox: [-3.6572, 36.6828, -3.5172, 36.8028] },
  { name: 'quintanardelaorden',source: 'es', bbox: [-3.1116, 39.5337, -2.9717, 39.6537] },
  { name: 'santanyi',     source: 'es', bbox: [3.0591, 39.2946, 3.1991, 39.4146] },
  { name: 'espartinas',   source: 'es', bbox: [-6.1958, 37.3215, -6.0558, 37.4415] },
  { name: 'estepa',       source: 'es', bbox: [-4.949, 37.2326, -4.809, 37.3526] },
  { name: 'ordes',        source: 'es', bbox: [-8.479, 43.0165, -8.339, 43.1365] },
  { name: 'poladesiero',  source: 'es', bbox: [-5.7334, 43.3323, -5.5933, 43.4523] },
  { name: 'villamartin',  source: 'es', bbox: [-5.7148, 36.7998, -5.5748, 36.9198] },
  { name: 'bullas',       source: 'es', bbox: [-1.7423, 37.9867, -1.6023, 38.1067] },
  { name: 'bolanosdecalatrava',source: 'es', bbox: [-3.7334, 38.8469, -3.5934, 38.9669] },
  { name: 'brenes',       source: 'es', bbox: [-5.9414, 37.4894, -5.8014, 37.6094] },
  { name: 'utiel',        source: 'es', bbox: [-1.27, 39.5067, -1.13, 39.6267] },
  { name: 'bueu',         source: 'es', bbox: [-8.855, 42.2646, -8.715, 42.3846] },
  { name: 'cunit',        source: 'es', bbox: [1.5664, 41.1383, 1.7065, 41.2583] },
  { name: 'haro',         source: 'es', bbox: [-2.9176, 42.5163, -2.7776, 42.6363] },
  { name: 'gibraleon',    source: 'es', bbox: [-7.0389, 37.3163, -6.8989, 37.4363] },
  { name: 'santsadurnidanoia',source: 'es', bbox: [1.7152, 41.3656, 1.8552, 41.4856] },
  { name: 'sonservera',   source: 'es', bbox: [3.2901, 39.5607, 3.4301, 39.6807] },
  { name: 'monovar',      source: 'es', bbox: [-0.9106, 38.3781, -0.7706, 38.4981] },
  { name: 'jodar',        source: 'es', bbox: [-3.4226, 37.7806, -3.2826, 37.9006] },
  { name: 'castellodempuries',source: 'es', bbox: [3.0045, 42.1967, 3.1445, 42.3167] },
  { name: 'astorga',      source: 'es', bbox: [-6.126, 42.3988, -5.986, 42.5188] },
  { name: 'santiagodelteide',source: 'es', bbox: [-16.8862, 28.234, -16.7462, 28.354] },
  { name: 'laseudurgell', source: 'es', bbox: [1.3914, 42.2988, 1.5314, 42.4188] },
  { name: 'olivenza',     source: 'es', bbox: [-7.1705, 38.6227, -7.0305, 38.7427] },
  { name: 'antigua',      source: 'es', bbox: [-14.0838, 28.3631, -13.9438, 28.4831] },
  { name: 'capdepera',    source: 'es', bbox: [3.3653, 39.6424, 3.5053, 39.7624] },
  { name: 'penarroyapueblonuevo',source: 'es', bbox: [-5.3367, 38.24, -5.1967, 38.36] },
  { name: 'deltebre',     source: 'es', bbox: [0.6384, 40.6594, 0.7784, 40.7794] },
  { name: 'albatera',     source: 'es', bbox: [-0.9406, 38.119, -0.8006, 38.239] },
  { name: 'santacolomadefarners',source: 'es', bbox: [2.5967, 41.8067, 2.7367, 41.9267] },
  { name: 'arroyodelaencomienda',source: 'es', bbox: [-4.8669, 41.5496, -4.7269, 41.6696] },
  { name: 'andratx',      source: 'es', bbox: [2.3502, 39.5155, 2.4902, 39.6355] },
  { name: 'medinasidonia',source: 'es', bbox: [-5.9972, 36.3969, -5.8572, 36.517] },
  { name: 'torroellademontgri',source: 'es', bbox: [3.057, 41.9825, 3.197, 42.1025] },
  { name: 'santona',      source: 'es', bbox: [-3.5276, 43.3839, -3.3876, 43.5039] },
  { name: 'santamargalida',source: 'es', bbox: [3.0322, 39.6414, 3.1721, 39.7614] },
  { name: 'loscorralesdebuelna',source: 'es', bbox: [-4.1426, 43.2036, -4.0026, 43.3236] },
  { name: 'aspontesdegarciarodriguez',source: 'es', bbox: [-7.9218, 43.3927, -7.7818, 43.5127] },
  { name: 'madridejos',   source: 'es', bbox: [-3.602, 39.4082, -3.462, 39.5282] },
  { name: 'tafalla',      source: 'es', bbox: [-1.7445, 42.4669, -1.6045, 42.5869] },
  { name: 'laracha',      source: 'es', bbox: [-8.6553, 43.1937, -8.5153, 43.3138] },
  { name: 'villacarrillo',source: 'es', bbox: [-3.1548, 38.0556, -3.0148, 38.1756] },
  { name: 'sonseca',      source: 'es', bbox: [-4.0445, 39.6175, -3.9045, 39.7375] },
  { name: 'tarazona',     source: 'es', bbox: [-1.7968, 41.8448, -1.6568, 41.9648] },
  { name: 'villarrubiadelosojos',source: 'es', bbox: [-3.678, 39.1608, -3.538, 39.2809] },
  { name: 'albox',        source: 'es', bbox: [-2.2195, 37.3286, -2.0795, 37.4486] },
  { name: 'alberic',      source: 'es', bbox: [-0.5867, 39.0567, -0.4467, 39.1767] },
  { name: 'tineo',        source: 'es', bbox: [-6.4845, 43.2776, -6.3445, 43.3977] },
  { name: 'alcaudete',    source: 'es', bbox: [-4.1524, 37.5309, -4.0124, 37.6509] },
  { name: 'pego',         source: 'es', bbox: [-0.1871, 38.783, -0.0471, 38.9031] },
  { name: 'guillena',     source: 'es', bbox: [-6.1263, 37.4826, -5.9863, 37.6026] },
  { name: 'poladelena',   source: 'es', bbox: [-5.8988, 43.1009, -5.7588, 43.2209] },
  { name: 'ripoll',       source: 'es', bbox: [2.1203, 42.1406, 2.2603, 42.2606] },
  { name: 'labaneza',     source: 'es', bbox: [-5.9677, 42.2403, -5.8277, 42.3603] },
  { name: 'valdemorillo', source: 'es', bbox: [-4.1371, 40.4406, -3.9971, 40.5606] },
  { name: 'lapuebladecazalla',source: 'es', bbox: [-5.3815, 37.1616, -5.2415, 37.2816] },
  { name: 'puertorico',   source: 'es', bbox: [-15.7804, 27.7294, -15.6404, 27.8494] },
  { name: 'manchareal',   source: 'es', bbox: [-3.6823, 37.7263, -3.5423, 37.8463] },
  { name: 'fuensalida',   source: 'es', bbox: [-4.2772, 39.9929, -4.1372, 40.1129] },
  { name: 'consuegra',    source: 'es', bbox: [-3.678, 39.4025, -3.538, 39.5225] },
  { name: 'onate',        source: 'es', bbox: [-2.48, 42.9726, -2.34, 43.0926] },
  { name: 'fuentepalmera',source: 'es', bbox: [-5.1696, 37.6449, -5.0296, 37.7649] },
  { name: 'santaponsa',   source: 'es', bbox: [2.4066, 39.4487, 2.5466, 39.5687] },
  { name: 'villacanas',   source: 'es', bbox: [-3.4081, 39.5637, -3.2681, 39.6837] },
  { name: 'cantillana',   source: 'es', bbox: [-5.8947, 37.5503, -5.7547, 37.6703] },
  { name: 'rute',         source: 'es', bbox: [-4.4383, 37.2669, -4.2983, 37.3869] },
  { name: 'mora',         source: 'es', bbox: [-3.8439, 39.6249, -3.7039, 39.7449] },
  { name: 'santacomba',   source: 'es', bbox: [-8.8793, 42.9731, -8.7392, 43.0931] },
  { name: 'illora',       source: 'es', bbox: [-3.9511, 37.2277, -3.8111, 37.3477] },
  { name: 'lalcora',      source: 'es', bbox: [-0.27, 40.0067, -0.13, 40.1267] },
  { name: 'luanco',       source: 'es', bbox: [-5.8634, 43.5552, -5.7234, 43.6752] },
  { name: 'lescala',      source: 'es', bbox: [3.0626, 42.0656, 3.2026, 42.1856] },
  { name: 'labisbaldemporda',source: 'es', bbox: [2.98, 41.89, 3.12, 42.01] },
  { name: 'sabinanigo',   source: 'es', bbox: [-0.4361, 42.4592, -0.2961, 42.5792] },
  { name: 'miajadas',     source: 'es', bbox: [-5.9784, 39.0913, -5.8384, 39.2113] },
  { name: 'caudete',      source: 'es', bbox: [-1.0572, 38.6468, -0.9172, 38.7668] },
  { name: 'castalla',     source: 'es', bbox: [-0.7421, 38.5369, -0.6021, 38.6569] },
  { name: 'reinosa',      source: 'es', bbox: [-4.208, 42.9396, -4.068, 43.0596] },
  { name: 'amurrio',      source: 'es', bbox: [-3.07, 42.99, -2.93, 43.11] },
  { name: 'jerezdeloscaballeros',source: 'es', bbox: [-6.8426, 38.2606, -6.7026, 38.3806] },
  { name: 'sarenal',      source: 'es', bbox: [2.68, 39.44, 2.82, 39.56] },
  { name: 'calasparra',   source: 'es', bbox: [-1.7699, 38.17, -1.6299, 38.29] },
  { name: 'xinzodelimia', source: 'es', bbox: [-7.7946, 42.0035, -7.6546, 42.1235] },
  { name: 'bembibre',     source: 'es', bbox: [-6.4854, 42.5577, -6.3454, 42.6777] },
  { name: 'villanuevadecordoba',source: 'es', bbox: [-4.6987, 38.2628, -4.5587, 38.3828] },
  { name: 'sax',          source: 'es', bbox: [-0.8878, 38.4773, -0.7478, 38.5973] },
  { name: 'caldasdereis', source: 'es', bbox: [-8.7123, 42.5447, -8.5723, 42.6647] },
  { name: 'elcasar',      source: 'es', bbox: [-5.9951, 38.4709, -5.8551, 38.5909] },
  { name: 'playablanca',  source: 'es', bbox: [-13.8981, 28.8043, -13.7581, 28.9243] },
  { name: 'lamangadelmarmenor',source: 'es', bbox: [-0.7865, 37.5813, -0.6465, 37.7013] },
  { name: 'newyork',      source: 'us', bbox: [-74.03, 40.70, -73.91, 40.82] },
  { name: 'sanfrancisco', source: 'us', bbox: [-122.52, 37.70, -122.36, 37.83] },
  // ── BLOCKED cities (no open commercial DTM) — carried explicitly, SKIPPED with a reason ──
  { name: 'lisbon',       source: 'pt', bbox: [-9.23, 38.68, -9.08, 38.80], blocked: 'PT — no open national bare-earth DTM (DGT). See coverage doc.' },
  { name: 'porto',        source: 'pt', bbox: [-8.70, 41.12, -8.55, 41.20], blocked: 'PT — no open national bare-earth DTM (DGT).' },
  { name: 'brussels',     source: 'be', bbox: [4.30, 50.80, 4.42, 50.90], blocked: 'BE — region-split; Brussels-Capital DTM route/licence unsourced.' },
  { name: 'berlin',       source: 'de', bbox: [13.28, 52.44, 13.55, 52.58], blocked: 'DE — per-Land; only NRW is sourced. Berlin=Geoportal Berlin DGM1 (separate adapter).' },
  { name: 'munich',       source: 'de', bbox: [11.44, 48.09, 11.66, 48.20], blocked: 'DE — per-Land; only NRW is sourced. Munich=Bayern DGM1 (separate adapter).' },
  { name: 'riyadh',       source: 'sa', bbox: [46.60, 24.58, 46.83, 24.80], blocked: 'SA — no open national DTM (GEOSA). Founder-gated.' },
  { name: 'jeddah',       source: 'sa', bbox: [39.10, 21.45, 39.28, 21.62], blocked: 'SA — no open national DTM (GEOSA). Founder-gated.' },
];

/** Cities we CAN bake now (source not blocked). CI iterates these; blocked ones print a note. */
export const BAKEABLE_REGIONS = REGIONS.filter((r) => !r.blocked);

// ═════════════════════════════════════════════════════════════════════════════
// §2 — DTM RASTER INGEST
// ═════════════════════════════════════════════════════════════════════════════
// GeoTIFF nodata: AHN encodes voids (canals) as Float32-max (~3.4e38). Treat |v|>1e6 as nodata.
const NODATA_MAG = 1e6;
const isNodata = (v) => !Number.isFinite(v) || Math.abs(v) > NODATA_MAG;

/** Read a DTM GeoTIFF → { width,height, values(Float32Array, row-major, top row first),
 *  bboxNative:[minX,minY,maxX,maxY], resX,resY }. Values are the NATIVE orthometric heights. */
export async function readDtmGeoTIFF(path, geotiffMod) {
  const { fromFile } = geotiffMod;
  const tiff = await fromFile(path);
  const img = await tiff.getImage();
  const [values] = await img.readRasters();
  const [minX, minY, maxX, maxY] = img.getBoundingBox();
  const [resX, resY] = img.getResolution();
  return {
    width: img.getWidth(), height: img.getHeight(),
    values: Float32Array.from(values),
    bboxNative: [minX, minY, maxX, maxY], resX: Math.abs(resX), resY: Math.abs(resY),
  };
}

/** Read a DTM GeoTIFF already in memory (ArrayBuffer/Buffer) → same shape as readDtmGeoTIFF.
 *  Used by the per-country WCS/WMS/STAC fetchers, which stream the coverage rather than write a
 *  temp file first. Some servers (e.g. GeoServer FORMAT=image/tiff) omit the geo-transform; those
 *  callers must request the GEO-keyed flavour (image/geotiff) — verified per source in §8b. */
export async function readDtmFromBuffer(arrayBuffer, geotiffMod) {
  const { fromArrayBuffer } = geotiffMod;
  const ab = arrayBuffer instanceof ArrayBuffer ? arrayBuffer
    : arrayBuffer.buffer.slice(arrayBuffer.byteOffset, arrayBuffer.byteOffset + arrayBuffer.byteLength);
  const tiff = await fromArrayBuffer(ab);
  const img = await tiff.getImage();
  const [values] = await img.readRasters();
  const [minX, minY, maxX, maxY] = img.getBoundingBox();
  const [resX, resY] = img.getResolution();
  return {
    width: img.getWidth(), height: img.getHeight(),
    values: Float32Array.from(values),
    bboxNative: [minX, minY, maxX, maxY], resX: Math.abs(resX), resY: Math.abs(resY),
  };
}

/** Fill nodata cells by nearest-valid neighbour sweep so the TIN has no 3.4e38 spikes. */
export function fillNodata(values, width, height) {
  const out = Float32Array.from(values);
  const idx = (x, y) => y * width + x;
  for (let pass = 0; pass < 8; pass++) {
    let filled = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (!isNodata(out[idx(x, y)])) continue;
      let s = 0, n = 0;
      if (x > 0 && !isNodata(out[idx(x - 1, y)])) { s += out[idx(x - 1, y)]; n++; }
      if (x < width - 1 && !isNodata(out[idx(x + 1, y)])) { s += out[idx(x + 1, y)]; n++; }
      if (y > 0 && !isNodata(out[idx(x, y - 1)])) { s += out[idx(x, y - 1)]; n++; }
      if (y < height - 1 && !isNodata(out[idx(x, y + 1)])) { s += out[idx(x, y + 1)]; n++; }
      if (n > 0) { out[idx(x, y)] = s / n; filled++; }
    }
    if (filled === 0) break;
  }
  let sum = 0, cnt = 0;
  for (const v of out) if (!isNodata(v)) { sum += v; cnt++; }
  const mean = cnt ? sum / cnt : 0;
  for (let i = 0; i < out.length; i++) if (isNodata(out[i])) out[i] = mean;
  return out;
}

/** Bilinear-resample a row-major grid to gridSize×gridSize (MARTINI needs 2^k+1). */
export function resampleSquare(values, width, height, gridSize) {
  const out = new Float32Array(gridSize * gridSize);
  for (let gy = 0; gy < gridSize; gy++) {
    const fy = (gy / (gridSize - 1)) * (height - 1);
    const y0 = Math.floor(fy), y1 = Math.min(y0 + 1, height - 1), ty = fy - y0;
    for (let gx = 0; gx < gridSize; gx++) {
      const fx = (gx / (gridSize - 1)) * (width - 1);
      const x0 = Math.floor(fx), x1 = Math.min(x0 + 1, width - 1), tx = fx - x0;
      const a = values[y0 * width + x0], b = values[y0 * width + x1];
      const c = values[y1 * width + x0], d = values[y1 * width + x1];
      out[gy * gridSize + gx] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
  }
  return out;
}

// ═════════════════════════════════════════════════════════════════════════════
// §3 — THE L-584 DATUM FIX  (orthometric→ellipsoidal + footprint ground plane)
// ═════════════════════════════════════════════════════════════════════════════
/** Lift national orthometric heights to WGS-84 ellipsoidal by the local geoid separation.
 *  ONE datum for terrain, buildings and envelope (globeGroundAnchor.ts GroundDatum). */
export const napToEllipsoidal = (h, geoidSepM) => h + geoidSepM;

/** Bilinear DTM sample at a fractional grid cell (row-major, top row = maxY). CLAMP the fractional
 *  position to the grid so a sample OUTSIDE the raster returns the nearest EDGE value (flat), never a
 *  runaway extrapolation — essential now that a TMS tile can extend past the fetched DTM extent (the
 *  coarse ancestor tiles), where the old index-only clamp left tx/ty at ±thousands and blew heights up. */
function sampleGrid(values, width, height, fx, fy) {
  fx = Math.max(0, Math.min(width - 1, fx));
  fy = Math.max(0, Math.min(height - 1, fy));
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const a = values[y0 * width + x0], b = values[y0 * width + x1];
  const c = values[y1 * width + x0], d = values[y1 * width + x1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

/** Native-CRS (X,Y) → fractional grid cell for a raster with bboxNative + res. */
function nativeToCell(X, Y, r) {
  const [minX, minY, maxX, maxY] = r.bboxNative;
  return { fx: (X - minX) / (maxX - minX) * (r.width - 1), fy: (maxY - Y) / (maxY - minY) * (r.height - 1) };
}

// ── §3b — THE WARP (native projected/geographic raster → a WGS-84 lon/lat-aligned grid) ─────────
// WHY THIS IS THE CORRECTNESS FIX for non-NL countries: a Cesium quantized-mesh tile stores each
// vertex only as (u,v) — a normalised position inside the tile's rectangular lon/lat extent — plus a
// height. Cesium reconstructs the vertex at lerp(west,east,u)×lerp(south,north,v). So a rotated
// projected grid (UTM/Lambert grid-north ≠ true-north; grid convergence) CANNOT be represented by
// just reprojecting the tile CORNERS and keeping native pixels — the interior would shear. The fix
// is to RESAMPLE onto a regular lon/lat grid: for each (lon,lat) post, forward-project to native
// (X,Y) and bilinear-sample the raster. The rotation/scale is absorbed into the resample, so the
// encoder's linear (u,v)↔lon/lat is then exact. For a geographic raster (ES/FR served in 4326) the
// forward projector is the identity and this degenerates to a plain lon/lat resample.

/** Inscribed WGS-84 rectangle that is guaranteed to lie INSIDE the (possibly rotated) native raster
 *  footprint — so every warp sample hits real data, never the clamped edge. */
export function inscribedWgs84Extent(raster, projector) {
  const [minX, minY, maxX, maxY] = raster.bboxNative;
  const c = {
    sw: projector.inverse(minX, minY), se: projector.inverse(maxX, minY),
    nw: projector.inverse(minX, maxY), ne: projector.inverse(maxX, maxY),
  };
  const w = Math.max(c.sw[0], c.nw[0]);
  const e = Math.min(c.se[0], c.ne[0]);
  const s = Math.max(c.sw[1], c.se[1]);
  const n = Math.min(c.nw[1], c.ne[1]);
  return [w, s, e, n];
}

/** Warp a native raster to a gridSize×gridSize WGS-84 grid over tileWsen=[w,s,e,n] (degrees).
 *  Row-major, top row = north (gy=0 → lat=n), matching the encoder's v convention. */
export function resampleToGeographicGrid(raster, forward, tileWsen, gridSize) {
  const [w, s, e, n] = tileWsen;
  const out = new Float32Array(gridSize * gridSize);
  const W = raster.width, H = raster.height;
  for (let gy = 0; gy < gridSize; gy++) {
    const lat = n - (n - s) * (gy / (gridSize - 1));
    for (let gx = 0; gx < gridSize; gx++) {
      const lon = w + (e - w) * (gx / (gridSize - 1));
      const [X, Y] = forward(lon, lat);
      const { fx, fy } = nativeToCell(X, Y, raster);
      // §COARSE-TILE-SEALEVEL (L-639) — samples OUTSIDE the city DTM extent (the coarse ancestor tiles
      // that span far beyond the city) must sit at SEA LEVEL (0 orthometric), NOT edge-clamped to the
      // city's ~900 m. A coarse half-earth tile floating at 900 m gets HORIZON-CULLED by Cesium (proven
      // via the L0-TILES probe: L0(0,0) is DONE+renderable but not rendered) → refinement blocked →
      // interior cities render 0 terrain tiles (white). Sea-level fill makes coarse tiles earth-hugging
      // like the coastal tiles that render fine. The fine city tiles are fully inside the DTM → unchanged.
      out[gy * gridSize + gx] = (fx < 0 || fx > W - 1 || fy < 0 || fy > H - 1)
        ? 0
        : sampleGrid(raster.values, W, H, fx, fy);
    }
  }
  return out;
}

/**
 * §L-584 — THE RASANT FIX. The ordinance measures building/envelope height from the ground at
 * the FAÇADE, not one point at the block centroid. Sample the DTM around the footprint perimeter
 * (native CRS) and fit a least-squares plane z = a·X + b·Y + c. Returns the ellipsoidal ground
 * elevation at the footprint centroid PLUS the plane (so a sloped site is handled), replacing the
 * single-point sample that L-584 named a legal defect.
 *
 * @param footprintNative Array<[X,Y]> ring in the raster's native CRS.
 * @returns { groundEllipsoidalM, groundOrthometricM, slopePctMax, plane:{a,b,c}, samples }
 *          — groundEllipsoidalM already has the geoid lift applied.
 */
export function fitFootprintGroundPlane(raster, footprintNative, geoidSepM) {
  const pts = [];
  for (let i = 0; i < footprintNative.length; i++) {
    const [x0, y0] = footprintNative[i];
    const [x1, y1] = footprintNative[(i + 1) % footprintNative.length];
    for (const t of [0, 0.5]) {
      const X = x0 + (x1 - x0) * t, Y = y0 + (y1 - y0) * t;
      const { fx, fy } = nativeToCell(X, Y, raster);
      const z = sampleGrid(raster.values, raster.width, raster.height, fx, fy);
      if (!isNodata(z)) pts.push([X, Y, z]);
    }
  }
  if (pts.length < 3) return null;
  let Sxx = 0, Sxy = 0, Sx = 0, Syy = 0, Sy = 0, Sn = pts.length, Sxz = 0, Syz = 0, Sz = 0;
  for (const [X, Y, Z] of pts) { Sxx += X * X; Sxy += X * Y; Sx += X; Syy += Y * Y; Sy += Y; Sxz += X * Z; Syz += Y * Z; Sz += Z; }
  const M = [[Sxx, Sxy, Sx], [Sxy, Syy, Sy], [Sx, Sy, Sn]];
  const sol = solve3(M, [Sxz, Syz, Sz]) ?? [0, 0, Sz / Sn];
  const [a, b, c] = sol;
  let cx = 0, cy = 0; for (const [X, Y] of pts) { cx += X; cy += Y; } cx /= pts.length; cy /= pts.length;
  const groundOrtho = a * cx + b * cy + c;
  const slopePctMax = Math.hypot(a, b) * 100;
  return { groundEllipsoidalM: groundOrtho + geoidSepM, groundOrthometricM: groundOrtho, slopePctMax, plane: { a, b, c }, samples: pts.length };
}

function solve3(M, r) {
  const m = M.map((row, i) => [...row, r[i]]);
  for (let c = 0; c < 3; c++) {
    let piv = c; for (let i = c + 1; i < 3; i++) if (Math.abs(m[i][c]) > Math.abs(m[piv][c])) piv = i;
    if (Math.abs(m[piv][c]) < 1e-12) return null;
    [m[c], m[piv]] = [m[piv], m[c]];
    for (let i = 0; i < 3; i++) if (i !== c) { const f = m[i][c] / m[c][c]; for (let j = c; j <= 3; j++) m[i][j] -= f * m[c][j]; }
  }
  return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
}

// ═════════════════════════════════════════════════════════════════════════════
// §4 — HORIZONTAL REPROJECTION (native CRS → WGS-84 lon/lat)
// Production uses the single C12 proj4 projector. For the NL prototype (RD New) we ship the
// Schreutelkamp & Strang van Hees closed-form inverse (cm-accurate over NL) so the prototype is
// dependency-free and validatable. Other countries: wire proj4 with the row's `horizCrs`.
// ═════════════════════════════════════════════════════════════════════════════
export function rdToWgs84(X, Y) {
  const dX = (X - 155000) * 1e-5, dY = (Y - 463000) * 1e-5;
  const Kpq = [[0, 1, 3235.65389], [2, 0, -32.58297], [0, 2, -0.24750], [2, 1, -0.84978],
    [0, 3, -0.06550], [2, 2, -0.01709], [1, 0, -0.00738], [4, 0, 0.00530], [2, 3, 0.00033],
    [4, 1, -0.00012], [0, 4, 0.00010]];
  const Lpq = [[1, 0, 5261.30656], [1, 1, 105.94684], [1, 2, 2.45656], [3, 0, -0.81885],
    [1, 3, 0.05594], [3, 1, -0.05607], [0, 1, 0.01199], [3, 2, -0.00256], [1, 4, 0.00128],
    [0, 2, 0.00022], [2, 0, -0.00022], [5, 0, 0.00026]];
  let lat = 52.15517440, lon = 5.38720621;
  for (const [p, q, cc] of Kpq) lat += (cc * Math.pow(dX, p) * Math.pow(dY, q)) / 3600;
  for (const [p, q, cc] of Lpq) lon += (cc * Math.pow(dX, p) * Math.pow(dY, q)) / 3600;
  return [lon, lat];
}

// ═════════════════════════════════════════════════════════════════════════════
// §5 — WGS-84 ELLIPSOID GEODESY (lon/lat/h → ECEF; scaled-space horizon occlusion)
// ═════════════════════════════════════════════════════════════════════════════
const WGS84_A = 6378137.0, WGS84_B = 6356752.314245179;
const E2 = 1 - (WGS84_B * WGS84_B) / (WGS84_A * WGS84_A);
const ONE_OVER_RADII = [1 / WGS84_A, 1 / WGS84_A, 1 / WGS84_B];
const _RADII = [WGS84_A, WGS84_A, WGS84_B];
const D2R = Math.PI / 180;

export function ecefFromLonLatH(lon, lat, h) {
  const cl = Math.cos(lat * D2R), sl = Math.sin(lat * D2R);
  const co = Math.cos(lon * D2R), so = Math.sin(lon * D2R);
  const N = WGS84_A / Math.sqrt(1 - E2 * sl * sl);
  return [(N + h) * cl * co, (N + h) * cl * so, (N * (1 - E2) + h) * sl];
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.sqrt(dot(a, a));

/** Cesium EllipsoidalOccluder.computeHorizonCullingPoint (scaled-space), for the tile header. */
export function horizonOcclusionPoint(positions, boundingCenter) {
  const dtpScaled = boundingCenter.map((v, i) => v * ONE_OVER_RADII[i]);
  const dl = len(dtpScaled);
  // Degenerate centre (all-vertices-at-geocentre) — never horizon-cull.
  if (!(dl > 0)) return [0, 0, HORIZON_OCC_NEVER_CULL];
  const dtp = dtpScaled.map((v) => v / dl);
  let resultMag = 0;
  let wideAngle = false; // a vertex fell past the horizon-grazing cone (denom ≤ 0)
  for (const p of positions) {
    const sp = [p[0] * ONE_OVER_RADII[0], p[1] * ONE_OVER_RADII[1], p[2] * ONE_OVER_RADII[2]];
    let magSq = dot(sp, sp); let mag = Math.sqrt(magSq);
    const dir = [sp[0] / mag, sp[1] / mag, sp[2] / mag];
    magSq = Math.max(1, magSq); mag = Math.max(1, mag);
    const cosAlpha = dot(dir, dtp);
    const sinAlpha = len(cross(dir, dtp));
    const cosBeta = 1 / mag;
    const sinBeta = Math.sqrt(magSq - 1) * cosBeta;
    const denom = cosAlpha * cosBeta - sinAlpha * sinBeta;
    if (!(denom > 0)) { wideAngle = true; continue; } // vertex >90° from centroid → single-point cull invalid
    const candidate = 1 / denom;
    if (Number.isFinite(candidate) && candidate > resultMag) resultMag = candidate;
  }
  // §HORIZON-OCC-DEGENERATE (L-639) — THE interior-city white-terrain root cause, proven by Cesium's own
  // computeTileVisibility=NONE + §CULL-PROBE occPtMag=0. Our per-city tile pyramid's coarse ancestor tiles
  // (z0 spans a full HEMISPHERE) are flat filler that MARTINI reduces to CORNER vertices, every one >90°
  // from the tile centroid → every `denom ≤ 0` → resultMag stays 0 → the stored occludee is (0,0,0) = the
  // geocentre, which Cesium treats as ALWAYS below the horizon → the ROOT tile is culled → refinement never
  // starts → 0 tiles render → white. A single occludee point provably CANNOT horizon-cull a >hemisphere
  // tile (Cesium returns undefined here). So for wide-angle / degenerate tiles, place the occludee HIGH in
  // the centroid direction (magnitude ≫ 1 = far above the ellipsoid) so the tile is NEVER wrongly
  // horizon-culled. Safe: a per-city bake has no far-side geometry to over-render, and the camera is always
  // AT the city. Narrow (fine) city tiles keep the exact cone result — their culling stays correct.
  if (wideAngle || !(resultMag > 0)) return dtp.map((v) => v * HORIZON_OCC_NEVER_CULL);
  // §HORIZON-OCC-SCALE — the header stores the occludee in ELLIPSOID-SCALED ECEF (÷radius, magnitude ~1);
  // Cesium reads it AS scaled-space. (The old code multiplied back by RADII → full ECEF ~6.4e6.)
  return dtp.map((v) => v * resultMag);
}
// A scaled-space magnitude far above the ellipsoid — an occludee here is above every near-tile camera's
// horizon, so Cesium never horizon-culls the tile. Used only for wide-angle/degenerate coarse ancestor tiles.
const HORIZON_OCC_NEVER_CULL = 1e4;

// ═════════════════════════════════════════════════════════════════════════════
// §6 — MESHING (MARTINI RTIN) + LOD PYRAMID
// ═════════════════════════════════════════════════════════════════════════════
/** Build an error-bounded TIN over a gridSize×gridSize elevation grid.
 *  @returns { vertices:Uint16Array[gx,gy…], triangles:Uint32Array, gridSize } */
export function meshTile(gridValues, gridSize, maxErrorM, MartiniCtor) {
  const martini = new MartiniCtor(gridSize);
  const tile = martini.createTile(gridValues);
  const mesh = tile.getMesh(maxErrorM);
  return { vertices: mesh.vertices, triangles: mesh.triangles, gridSize };
}

/** LOD pyramid: coarser maxError → fewer triangles. Near tiles small error, far tiles large. */
export const DEFAULT_LOD_ERRORS_M = [0.5, 1.5, 4.0, 12.0]; // level 0 (finest) → 3 (coarsest)

// ═════════════════════════════════════════════════════════════════════════════
// §7 — QUANTIZED-MESH ENCODER  (Cesium terrain .terrain — self-contained, no npm encoder)
// Spec: https://github.com/CesiumGS/quantized-mesh — header(88B) + zigzag uvh + HWM indices +
// per-edge index lists. Verified by decode round-trip (see terrain.verify.mjs).
// ═════════════════════════════════════════════════════════════════════════════
const zigzag = (n) => (n << 1) ^ (n >> 15); // 16-bit zigzag

// §TERRAIN-NORMALS (L-636) — Oct-Encoded Per-Vertex Normals extension (quantized-mesh extension id 1).
// WHY: without per-vertex normals the Cesium globe can only shade terrain by the ellipsoid normal, so
// `globe.enableLighting` paints every slope the SAME flat baseColor → high-relief cities (Madrid/Zürich)
// render as a featureless near-white "mask" while flat cities look fine. Emitting normals here + rendering
// with `enableLighting=true` + `requestVertexNormals=true` is the three-part fix (all three required).
// Oct16: a unit vec3 → 2×snorm8 via the standard octahedron mapping (matches Cesium AttributeCompression).
const _snorm8 = (v) => Math.round((Math.max(-1, Math.min(1, v)) * 0.5 + 0.5) * 255) & 0xff;
const _sign1 = (v) => (v < 0 ? -1 : 1);
function octEncodeNormal(n) {
  const l1 = Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2]) || 1;
  let x = n[0] / l1, y = n[1] / l1;
  if (n[2] < 0) { const ox = (1 - Math.abs(y)) * _sign1(x); const oy = (1 - Math.abs(x)) * _sign1(y); x = ox; y = oy; }
  return [_snorm8(x), _snorm8(y)];
}
/** Area-weighted per-vertex normals in ECEF (accumulate un-normalised face normals, then normalise). */
function computeVertexNormalsEcef(ecef, triangles, nV) {
  const nx = new Float64Array(nV), ny = new Float64Array(nV), nz = new Float64Array(nV);
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t], b = triangles[t + 1], c = triangles[t + 2];
    const fn = cross(sub(ecef[b], ecef[a]), sub(ecef[c], ecef[a])); // magnitude ∝ 2×area → area weighting
    nx[a] += fn[0]; ny[a] += fn[1]; nz[a] += fn[2];
    nx[b] += fn[0]; ny[b] += fn[1]; nz[b] += fn[2];
    nx[c] += fn[0]; ny[c] += fn[1]; nz[c] += fn[2];
  }
  const oct = new Uint8Array(nV * 2);
  for (let i = 0; i < nV; i++) {
    let x = nx[i], y = ny[i], z = nz[i];
    const l = Math.sqrt(x * x + y * y + z * z);
    if (l > 0) { x /= l; y /= l; z /= l; } else { const g = len(ecef[i]) || 1; x = ecef[i][0] / g; y = ecef[i][1] / g; z = ecef[i][2] / g; }
    // Orient OUTWARD (away from the earth centre). Triangle winding is not guaranteed, so a face normal
    // can point into the ellipsoid → the globe would light terrain from below. The ECEF position vector
    // points from the centre to the vertex (≈ local up), so a negative dot means "inward" → flip.
    if (x * ecef[i][0] + y * ecef[i][1] + z * ecef[i][2] < 0) { x = -x; y = -y; z = -z; }
    const e = octEncodeNormal([x, y, z]);
    oct[2 * i] = e[0]; oct[2 * i + 1] = e[1];
  }
  return oct;
}

/**
 * @param mesh          from meshTile(): vertices(Uint16 gx,gy), triangles(Uint32)
 * @param gridSize      2^k+1
 * @param tile          { west,south,east,north } radians of the tile extent
 * @param heightAt(gx,gy) → ellipsoidal metres at that grid vertex
 * @returns { buffer:Buffer, stats }
 */
export function encodeQuantizedMesh(mesh, gridSize, tile, heightAt) {
  const nV = mesh.vertices.length / 2;
  const hs = new Float64Array(nV);
  // §TERRAIN-NAN-GUARD (L-636) — NoData/NaN heights (a DTM masks its rivers/gorges, e.g. Toledo's Tagus)
  // must NEVER reach the tile: a single NaN makes minH/maxH NaN → the header is NaN → Cesium crashes at
  // render ("Cannot read properties of undefined (reading 'height')") even though the @here decoder reads
  // it. Pre-pass a finite fallback (the tile's finite mean) and substitute it for any non-finite height.
  // Fill NoData with the tile's LOWEST real height, not the mean: NoData in the ES DTM is overwhelmingly
  // WATER (Atlantic rías, estuaries, river gorges, reservoirs) masked as NaN — the open Mediterranean is
  // real 0-values, so it is fine. Filling water to the tile min (≈ shore/valley/water level) renders it
  // FLAT at water level; the mean would bulge a ría into a raised plateau (Vigo minH 66.6 vs sea ~51).
  let minF = Infinity, cntF = 0;
  for (let i = 0; i < nV; i++) { const h = heightAt(mesh.vertices[2 * i], mesh.vertices[2 * i + 1]); if (Number.isFinite(h)) { if (h < minF) minF = h; cntF++; } }
  const fallbackH = cntF > 0 ? minF : 0;
  let minH = Infinity, maxH = -Infinity;
  const ecef = [];
  for (let i = 0; i < nV; i++) {
    const gx = mesh.vertices[2 * i], gy = mesh.vertices[2 * i + 1];
    const u = gx / (gridSize - 1), v = gy / (gridSize - 1); // gy=0 top(north)
    const lonDeg = (tile.west + (tile.east - tile.west) * u) / D2R;
    const latDeg = (tile.north - (tile.north - tile.south) * v) / D2R;
    const hRaw = heightAt(gx, gy);
    const h = Number.isFinite(hRaw) ? hRaw : fallbackH; // NoData → tile-mean, never NaN
    hs[i] = h;
    if (h < minH) minH = h; if (h > maxH) maxH = h;
    ecef.push(ecefFromLonLatH(lonDeg, latDeg, h));
  }
  if (!Number.isFinite(minH)) minH = 0;   // whole tile was NoData (all-NaN) → flat 0, never a NaN header
  if (!Number.isFinite(maxH)) maxH = 0;
  // §BOUNDING-CENTRE-RECT (L-639) — use the tile's GEOMETRIC rectangle centre (a real point ON the
  // ellipsoid), NOT the vertex centroid. A coarse z0 tile spans lat[-90,90]; MARTINI reduces its flat
  // filler to the 4 CORNERS, which sit at the POLES (lat ±90) → their average is (0,0,0) = the GEOCENTRE.
  // That garbage centre was written to the header AND fed to horizonOcclusionPoint (dtp undefined →
  // occludee (0,0,0) → tile always horizon-culled → interior-city white terrain). The rectangle centre
  // is always a valid on-ellipsoid point, so the header centre is sane and the occlusion cone has a real
  // direction to work from (wide-angle corners then trip the never-cull path in horizonOcclusionPoint).
  const lonCdeg = ((tile.west + tile.east) / 2) / D2R;
  const latCdeg = ((tile.north + tile.south) / 2) / D2R;
  const c = ecefFromLonLatH(lonCdeg, latCdeg, (minH + maxH) / 2);
  let radius = 0; for (const p of ecef) radius = Math.max(radius, len(sub(p, c)));
  const occ = horizonOcclusionPoint(ecef, c);

  const U = new Uint16Array(nV), V = new Uint16Array(nV), H = new Uint16Array(nV);
  const hRange = maxH - minH || 1;
  const west = [], south = [], east = [], north = [];
  for (let i = 0; i < nV; i++) {
    const gx = mesh.vertices[2 * i], gy = mesh.vertices[2 * i + 1];
    const qu = Math.round((gx / (gridSize - 1)) * 32767);
    const qv = Math.round(((gridSize - 1 - gy) / (gridSize - 1)) * 32767); // v=0 south
    const qh = Math.round(((hs[i] - minH) / hRange) * 32767);
    U[i] = qu; V[i] = qv; H[i] = qh;
    if (qu === 0) west.push(i); if (qu === 32767) east.push(i);
    if (qv === 0) south.push(i); if (qv === 32767) north.push(i);
  }

  const encDelta = (arr) => { const out = new Uint16Array(nV); let prev = 0; for (let i = 0; i < nV; i++) { out[i] = zigzag(arr[i] - prev) & 0xffff; prev = arr[i]; } return out; };
  const uZ = encDelta(U), vZ = encDelta(V), hZ = encDelta(H);

  if (nV > 65536) throw new Error(`quantized-mesh uint16 index path needs <65536 verts (got ${nV}); use 32-bit extension`);
  const tris = mesh.triangles; const idx = new Uint16Array(tris.length);
  let highest = 0;
  for (let i = 0; i < tris.length; i++) { const code = highest - tris[i]; idx[i] = code & 0xffff; if (code === 0) highest++; }

  // §TERRAIN-NORMALS (L-636) — the Oct-Encoded Per-Vertex Normals extension, appended after the edge
  // index lists. Extension record = uint8 extensionId(=1) + uint32 extensionLength(=nV*2) + oct bytes.
  const octNormals = computeVertexNormalsEcef(ecef, tris, nV);
  const xBytes = 1 + 4 + octNormals.length;

  const headerSize = 88;
  const vBytes = 4 + nV * 2 * 3;
  const iBytes = 4 + idx.length * 2;
  const eBytes = 4 * 4 + (west.length + south.length + east.length + north.length) * 2;
  const buf = Buffer.alloc(headerSize + vBytes + iBytes + eBytes + xBytes);
  let o = 0;
  buf.writeDoubleLE(c[0], o); o += 8; buf.writeDoubleLE(c[1], o); o += 8; buf.writeDoubleLE(c[2], o); o += 8;
  buf.writeFloatLE(minH, o); o += 4; buf.writeFloatLE(maxH, o); o += 4;
  buf.writeDoubleLE(c[0], o); o += 8; buf.writeDoubleLE(c[1], o); o += 8; buf.writeDoubleLE(c[2], o); o += 8;
  buf.writeDoubleLE(radius, o); o += 8;
  buf.writeDoubleLE(occ[0], o); o += 8; buf.writeDoubleLE(occ[1], o); o += 8; buf.writeDoubleLE(occ[2], o); o += 8;
  buf.writeUInt32LE(nV, o); o += 4;
  for (let i = 0; i < nV; i++) { buf.writeUInt16LE(uZ[i], o); o += 2; }
  for (let i = 0; i < nV; i++) { buf.writeUInt16LE(vZ[i], o); o += 2; }
  for (let i = 0; i < nV; i++) { buf.writeUInt16LE(hZ[i], o); o += 2; }
  buf.writeUInt32LE(idx.length / 3, o); o += 4;
  for (let i = 0; i < idx.length; i++) { buf.writeUInt16LE(idx[i], o); o += 2; }
  for (const list of [west, south, east, north]) {
    buf.writeUInt32LE(list.length, o); o += 4;
    for (const vi of list) { buf.writeUInt16LE(vi, o); o += 2; }
  }
  // §TERRAIN-NORMALS (L-636) — Oct-Encoded Per-Vertex Normals extension record.
  buf.writeUInt8(1, o); o += 1;                       // extensionId = 1 (octvertexnormals)
  buf.writeUInt32LE(octNormals.length, o); o += 4;    // extensionLength = nV * 2
  for (let i = 0; i < octNormals.length; i++) { buf.writeUInt8(octNormals[i], o); o += 1; }
  return { buffer: buf, stats: { vertices: nV, triangles: idx.length / 3, minH, maxH, radius,
    hasVertexNormals: true,
    edges: { west: west.length, south: south.length, east: east.length, north: north.length } } };
}

// ── §7b — GEOGRAPHIC-TMS TILING  (the paths + layer.json MUST agree — this was the render-flat bug) ──
// Cesium's CesiumTerrainProvider reads layer.json then requests `{z}/{x}/{y}.terrain`, and it PLACES
// every vertex at lerp(tileRect.west,east,u)×lerp(south,north,v) where tileRect = the TMS tile's OWN
// geographic rectangle (computed from z/x/y — NOT from anything stored in the tile). So a tile is only
// correct if it was ENCODED over that exact rectangle. The old bake wrote flat `<lod>.terrain` files
// and a layer.json that declared GLOBAL TMS ranges → Cesium asked for `0/1/0.terrain` (404) and, even
// if it had loaded, would have stretched a city-extent mesh across a quarter-globe tile. THE FIX
// (scheme A): emit, for each zoom z, the ONE real TMS tile that contains the city, encoded over THAT
// tile's rectangle, and declare exactly those tiles. Cesium then requests precisely what we wrote and
// drapes it in the right place. Geographic scheme: level z has 2^(z+1) tiles across 360° lon × 2^z
// across 180° lat; tiles are SQUARE in degrees (side = 180/2^z). x from lon=-180, y from lat=-90 (TMS,
// south-origin — the convention layer.json `scheme:'tms'` + `available` use; Cesium flips y internally).
export const tmsTileSideDeg = (z) => 180 / 2 ** z;

/** The single geographic-TMS tile (z,x,y) containing (lon,lat) + its rectangle [w,s,e,n] in degrees. */
export function tmsTileForLonLat(lon, lat, z) {
  const side = tmsTileSideDeg(z);
  const nx = 2 ** (z + 1), ny = 2 ** z;
  const x = Math.min(nx - 1, Math.max(0, Math.floor((lon + 180) / side)));
  const y = Math.min(ny - 1, Math.max(0, Math.floor((lat + 90) / side))); // TMS y: 0 at south
  const west = -180 + x * side, south = -90 + y * side;
  return { z, x, y, rectDeg: [west, south, west + side, south + side] };
}

/** The rectangle [w,s,e,n]° of a specific geographic-TMS tile (z,x,y). */
export function tmsTileRectDeg(z, x, y) {
  const side = tmsTileSideDeg(z);
  const west = -180 + x * side, south = -90 + y * side;
  return [west, south, west + side, south + side];
}

/** Every geographic-TMS tile at level z whose rectangle intersects the city bbox → {xMin,xMax,yMin,yMax}
 *  (clamped to the level's grid). Usually 1 tile at coarse z, a 1–4 tile block near the finest. */
export function tmsTileRangeForBbox(cityWsen, z) {
  const side = tmsTileSideDeg(z);
  const nx = 2 ** (z + 1), ny = 2 ** z;
  const [w, s, e, n] = cityWsen;
  const cx = (v) => Math.min(nx - 1, Math.max(0, v)), cy = (v) => Math.min(ny - 1, Math.max(0, v));
  return {
    xMin: cx(Math.floor((w + 180) / side)), xMax: cx(Math.floor((e + 180) / side)),
    yMin: cy(Math.floor((s + 90) / side)), yMax: cy(Math.floor((n + 90) / side)),
  };
}

/** Finest zoom to emit: the deepest level whose tile side is still ≥ the city's larger span, so the
 *  bbox lands in a small (≤2×2) block at the finest level — real per-post resolution AND full coverage,
 *  without the straddle-fragility of demanding one centre-tile contain the whole bbox. */
export function tmsMaxZoomForBbox(cityWsen, cap = 18) {
  const [w, s, e, n] = cityWsen;
  const spanDeg = Math.max(e - w, n - s) || 1e-4;
  const z = Math.floor(Math.log2(180 / spanDeg)); // 180/2^z ≥ spanDeg  ⇒  z ≤ log2(180/span)
  return Math.max(0, Math.min(cap, z));
}

/** Cesium layer.json for a city-block terrain drape. `available` lists EXACTLY the emitted tiles (the
 *  real TMS x/y block at each level) and `bounds` is the city bbox — so Cesium requests only what
 *  exists on disk (no 404 → flat) and refines from the level-0 tile down to the finest block. */
export function layerJson(cityWsen, available) {
  return {
    tilejson: '2.1.0', name: 'PRYZM terrain', format: 'quantized-mesh-1.0',
    scheme: 'tms', tiles: ['{z}/{x}/{y}.terrain'],
    projection: 'EPSG:4326', bounds: cityWsen, extent: cityWsen,
    minzoom: 0, maxzoom: available.length - 1, available,
    // §TERRAIN-NORMALS (L-636) — every tile carries the Oct-Encoded Per-Vertex Normals extension, so
    // Cesium requests it (requestVertexNormals:true) and can slope-shade relief under enableLighting.
    // Without this the globe flat-lights terrain → high-relief cities render as a white mask.
    extensions: ['octvertexnormals'],
  };
}

/**
 * Emit the root→finest pyramid of real TMS tiles that drape a city, + a matching layer.json. Shared by
 * every compile path (NL closed-form + the generalized warp). At each level z (0..maxZoom) it emits
 * every TMS tile intersecting the bbox — a proper nested refinement path (each tile's parent also
 * intersects the bbox, so it too is emitted). The caller supplies `gridForRect`: given a TMS tile
 * rectangle [w,s,e,n]°, return a gridSize×gridSize row-major (gy=0 = north) Float32 grid of ELLIPSOIDAL
 * heights sampled over THAT rectangle (edge-clamped outside the DTM — coarse ancestor tiles are mostly
 * the site's border height, honest real data, never a fabricated datum). Each tile is ENCODED over its
 * OWN rectangle, so Cesium's linear (u,v)↔lon/lat is exact and every tile lands where the site is.
 */
export function emitTileChain({ cityWsen, gridForRect, gridSize, outDir, Martini, baseErrM = 0.5 }) {
  const maxZoom = tmsMaxZoomForBbox(cityWsen);
  mkdirSync(outDir, { recursive: true });
  const available = [];
  const tiles = [];
  for (let z = 0; z <= maxZoom; z++) {
    const { xMin, xMax, yMin, yMax } = tmsTileRangeForBbox(cityWsen, z);
    available.push([{ startX: xMin, startY: yMin, endX: xMax, endY: yMax }]);
    const errM = baseErrM * 2 ** (maxZoom - z); // finest (baseErrM) at maxZoom, coarser going up
    for (let x = xMin; x <= xMax; x++) for (let y = yMin; y <= yMax; y++) {
      const rectDeg = tmsTileRectDeg(z, x, y);
      const grid = gridForRect(rectDeg);
      const tileRad = { west: rectDeg[0] * D2R, south: rectDeg[1] * D2R, east: rectDeg[2] * D2R, north: rectDeg[3] * D2R };
      const heightAt = (gx, gy) => grid[gy * gridSize + gx];
      const mesh = meshTile(grid, gridSize, errM, Martini);
      const enc = encodeQuantizedMesh(mesh, gridSize, tileRad, heightAt);
      mkdirSync(resolve(outDir, String(z), String(x)), { recursive: true });
      writeFileSync(resolve(outDir, String(z), String(x), `${y}.terrain`), enc.buffer);
      tiles.push({ z, x, y, path: `${z}/${x}/${y}.terrain`, errM: +errM.toFixed(2), ...enc.stats, bytes: enc.buffer.length });
      console.log(`  z${String(z).padStart(2)} → ${`${z}/${x}/${y}.terrain`.padEnd(24)} err=${errM.toFixed(2).padStart(7)}m  ${String(enc.stats.triangles).padStart(6)} tris ${String(enc.stats.vertices).padStart(6)}v  h[${enc.stats.minH.toFixed(1)}..${enc.stats.maxH.toFixed(1)}]m  ${(enc.buffer.length / 1024).toFixed(1)}KB`);
    }
  }
  writeFileSync(resolve(outDir, 'layer.json'), JSON.stringify(layerJson(cityWsen, available), null, 2));
  console.log(`layer.json (scheme tms · bounds ${cityWsen.map((v) => v.toFixed(4)).join(',')} · z0..${maxZoom} · ${tiles.length} tiles) → ${outDir}`);
  return { cityWsen, maxZoom, available, tiles };
}

// ═════════════════════════════════════════════════════════════════════════════
// §8 — KEYLESS DTM FETCH (NL AHN WCS GetCoverage — the reproducible one-city proof source)
// ═════════════════════════════════════════════════════════════════════════════
/** Build the live-verified keyless AHN WCS 2.0.1 GetCoverage URL for an RD-New bbox → GeoTIFF.
 *  bboxRD = [minX,minY,maxX,maxY] in EPSG:28992. LIVE-VERIFIED 2026-07-25 (HTTP 200 image/tiff). */
export function dtmWcsUrl(bboxRD, { coverageId = 'dtm_05m' } = {}) {
  const [minX, minY, maxX, maxY] = bboxRD;
  return `${TERRAIN_SOURCES.nl.endpoint}?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage`
    + `&COVERAGEID=${coverageId}&FORMAT=image/tiff`
    + `&SUBSET=x(${minX},${maxX})&SUBSET=y(${minY},${maxY})`
    + `&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/28992`;
}

async function fetchToFile(url, dest, timeoutMs = 60000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get('content-type') || '';
    if (!res.ok || !/tif/i.test(ct)) throw new Error(`HTTP ${res.status} ct=${ct} (body head: ${buf.slice(0, 200).toString('utf8')})`);
    writeFileSync(dest, buf);
    return { bytes: buf.length, ct, magic: buf.slice(0, 4).toString('hex') };
  } finally { clearTimeout(t); }
}

// ═════════════════════════════════════════════════════════════════════════════
// §8b — PER-COUNTRY DTM FETCH ADAPTERS  (the keyless multi-city bake — the point of this task)
//
// Each bakeable non-NL source has ONE descriptor here saying how to pull a real bare-earth DTM for
// a WGS-84 bbox. `nativeCrs` is the CRS the returned GeoTIFF is IN — the ONLY per-country projection
// knowledge, and it flows straight into the shared reproject.mjs projector for the §3b warp. Every
// URL below was LIVE-VERIFIED 2026-07-25 from this machine (see the task report / the --sample-city
// proof): sampled elevations match ground truth AND the correct vertical datum after the geoid lift.
//
//   kind 'wcs2-geo'  — OGC WCS 2.0.1, coverage already served in EPSG:4326 (no horizontal reproj).
//   kind 'wcs2'      — OGC WCS 2.0.1 in a projected CRS; SUBSET in native E/N; SCALESIZE if allowed.
//   kind 'wcs1'      — OGC WCS 1.0.0 (ArcGIS dialect): COVERAGE + CRS + BBOX + WIDTH/HEIGHT.
//   kind 'wms'       — OGC WMS 1.3.0 GetMap FORMAT=image/geotiff (geographic CRS:84 or projected).
//   kind 'stac-cog'  — swisstopo STAC: per-1km cloud-optimised GeoTIFF tiles, stitched client-side.
//
// `maxExtentM` caps the fetched box (centred on the site) so one request stays bounded — some hosts
// cap area (GB EA) or serve static per-km tiles (CH). A capped city still gives the site its real
// local relief + datum; a full-city mosaic pyramid is the documented follow-up, NOT a wrong tileset.
// ═════════════════════════════════════════════════════════════════════════════
export const DTM_FETCH = {
  es: { kind: 'wcs2-geo', endpoint: 'https://servicios.idee.es/wcs-inspire/mdt',
    coverageId: 'Elevacion4258_25', axisLat: 'lat', axisLon: 'long', nativeCrs: 'EPSG:4326',
    maxExtentM: 22000, note: 'IGN PNOA MDT25 via INSPIRE WCS 2.0.1 — served in EPSG:4326 (geographic).' },
  fr: { kind: 'wms', endpoint: 'https://data.geopf.fr/wms-r/wms', layer: 'ELEVATION.ELEVATIONGRIDCOVERAGE',
    format: 'image/geotiff', requestCrs: 'CRS:84', nativeCrs: 'EPSG:4326', maxPx: 1200, maxExtentM: 30000,
    note: 'IGN RGE ALTI via Géoplateforme WMS GetMap CRS:84 image/geotiff (geographic).' },
  de: { kind: 'wcs2', endpoint: 'https://www.wcs.nrw.de/geobasis/wcs_nw_dgm', coverageId: 'nw_dgm',
    axisX: 'x', axisY: 'y', nativeCrs: 'EPSG:25832', scaleSize: true, maxPx: 1100, maxExtentM: 30000,
    note: 'Geobasis NRW DGM1 via WCS 2.0.1 (SUBSETTINGCRS 25832 + SCALESIZE). NRW only — other Länder = separate adapters.' },
  no: { kind: 'wcs1', endpoint: 'https://wcs.geonorge.no/skwms1/wcs.hoyde-dtm-nhm-25833', coverageId: 'nhm_dtm_topo_25833',
    nativeCrs: 'EPSG:25833', maxPx: 1100, maxExtentM: 30000,
    note: 'Kartverket NHM DTM via ArcGIS WCS 1.0.0 (COVERAGE+CRS+BBOX+WIDTH/HEIGHT, FORMAT=GeoTIFF).' },
  // DK — apikey-GATED (DATAFORDELER_API_KEY). bakeCity SKIPS LOUDLY before reaching here when the key
  // is absent (see APIKEY_SOURCES + the ::warning:: skip path); with a key the apikey rides on the URL
  // via `apikeyEnv`, and the returned `url` is REDACTED so the secret never lands in a CI log. WCS 1.0.0
  // like NO, but FORMAT=GTiff (Datafordeler's spelling) not GeoTIFF, so `format` is overridden per-source.
  dk: { kind: 'wcs1', endpoint: 'https://wcs.datafordeler.dk/DHMNedboer/dhm_wcs/1.0.0/WCS', coverageId: 'dhm_terraen',
    nativeCrs: 'EPSG:25832', format: 'GTiff', apikeyEnv: 'DATAFORDELER_API_KEY', apikeyParam: 'apikey',
    maxPx: 1100, maxExtentM: 12000,
    note: 'DHM Terræn (Danmarks Højdemodel 0.4 m) via Datafordeler WCS 1.0.0 (apikey). Native EPSG:25832 (UTM32N), '
      + 'DVR90 orthometric → +36.5 m ellipsoidal lift. Coverage names confirmed keyless on the Dataforsyningen mirror; '
      + 'GetCoverage is apikey-gated (HTTP 401 without a key). Copenhagen is low/flat (~0–40 m orthometric).' },
  it: { kind: 'wms', endpoint: 'http://tinitaly.pi.ingv.it/TINItaly_1_1/wms', layer: 'tinitaly_dem',
    format: 'image/geotiff', requestCrs: 'EPSG:32632', nativeCrs: 'EPSG:32632', maxPx: 1100, maxExtentM: 30000,
    note: 'INGV TINITALY 10 m national mosaic via GeoServer WMS GetMap (EPSG:32632). image/geotiff (image/tiff lacks geo-transform).' },
  gb: { kind: 'wcs2', endpoint: 'https://environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m/wcs',
    coverageId: '13787b9a-26a4-4775-8523-806d13af58fc__Lidar_Composite_Elevation_DTM_1m',
    axisX: 'E', axisY: 'N', nativeCrs: 'EPSG:27700', scaleSize: false, maxExtentM: 3000,
    note: 'EA LIDAR Composite DTM 1 m via WCS 2.0.1. ⚠ server REJECTS SCALESIZE + caps request area — bounded centre box only; full-city GB needs a tiled mosaic (follow-up).' },
  ch: { kind: 'stac-cog', endpoint: 'https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissalti3d',
    resToken: '_2_2056_', nativeCrs: 'EPSG:2056', maxExtentM: 4000, maxTiles: 25,
    note: 'swissALTI3D via STAC — per-1km 2 m COG GeoTIFF tiles (EPSG:2056), stitched over a centre block; full-city needs a mosaic job (follow-up).' },
};

/** apikey-gated sources: env var + a human hint. Wired but skip loudly until the founder adds the key. */
export const APIKEY_SOURCES = {
  dk: { env: 'DATAFORDELER_API_KEY', hint: 'mint at portal.datafordeler.dk (reuse the Matrikel key)' },
  se: { env: 'LANTMATERIET_API_KEY', hint: 'free Lantmäteriet consumer key' },
  fi: { env: 'MML_API_KEY', hint: 'free NLS open-data key (asiointi.maanmittauslaitos.fi)' },
};

const M_PER_DEG_LAT = 111320;
const mPerDegLon = (lat) => 111320 * Math.cos(lat * D2R);

/** Shrink a WGS-84 bbox to a maxExtentM-metre box centred on the same point (only if it exceeds it). */
export function clampExtentM(bboxWsen, maxExtentM) {
  if (!maxExtentM) return bboxWsen;
  const [w, s, e, n] = bboxWsen;
  const cLon = (w + e) / 2, cLat = (s + n) / 2;
  const wM = (e - w) * mPerDegLon(cLat), hM = (n - s) * M_PER_DEG_LAT;
  const halfLon = Math.min((e - w) / 2, (maxExtentM / 2) / mPerDegLon(cLat));
  const halfLat = Math.min((n - s) / 2, (maxExtentM / 2) / M_PER_DEG_LAT);
  if (wM <= maxExtentM && hM <= maxExtentM) return bboxWsen;
  return [cLon - halfLon, cLat - halfLat, cLon + halfLon, cLat + halfLat];
}

/** aspect-correct pixel dims for a projected-metre box, capped at maxPx on the long side. */
function pxDims(widthM, heightM, maxPx) {
  const long = Math.max(widthM, heightM);
  const scale = long > maxPx ? maxPx / long : 1;
  return { width: Math.max(2, Math.round(widthM * scale)), height: Math.max(2, Math.round(heightM * scale)) };
}

// ── apikey threading (DK Datafordeler &apikey=; future SE/FI) — NEVER hardcode a key, NEVER log one.
/** Build the `&<param>=<key>` auth suffix for an apikey-gated DTM source, or '' when none is needed.
 *  bakeCity already SKIPS LOUDLY when the env var is unset, so reaching here without a key is only
 *  possible via a direct fetch (e.g. --sample-city) — we refuse honestly rather than fetch keyless. */
export function dtmAuthSuffix(cfg, env = process.env) {
  if (!cfg.apikeyEnv) return '';
  const key = env[cfg.apikeyEnv];
  if (!key) throw new Error(`DTM source needs ${cfg.apikeyEnv} — not set (skip loudly upstream; no fake tile).`);
  return `&${cfg.apikeyParam ?? 'apikey'}=${encodeURIComponent(key)}`;
}
/** Redact any secret query param so a fetched URL is safe to log / return (defense-in-depth). */
export const redactKey = (u) => String(u).replace(/([?&](?:apikey|token|username|password)=)[^&]*/gi, '$1<redacted>');

async function fetchBuffer(url, { timeoutMs = 90000, accept } = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: accept ? { Accept: accept } : {} });
    const ct = res.headers.get('content-type') || '';
    const ab = await res.arrayBuffer();
    if (!res.ok) throw new Error(`HTTP ${res.status} ct=${ct} body="${Buffer.from(ab.slice(0, 180)).toString('utf8').replace(/\s+/g, ' ')}"`);
    return { ab, ct, status: res.status };
  } finally { clearTimeout(t); }
}

/** Forward-project the 4 WGS-84 corners → the bounding native box that covers them, padded. */
function nativeBoxForBbox(bboxWsen, projector, padM = 200) {
  const [w, s, e, n] = bboxWsen;
  const pts = [projector.forward(w, s), projector.forward(e, s), projector.forward(w, n), projector.forward(e, n)];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [Math.min(...xs) - padM, Math.min(...ys) - padM, Math.max(...xs) + padM, Math.max(...ys) + padM];
}

const crsUri = (epsg) => `http://www.opengis.net/def/crs/EPSG/0/${epsg.replace('EPSG:', '')}`;

/**
 * Fetch a real DTM for a WGS-84 bbox from a source's national service → { raster, nativeCrs, url }.
 * `raster` is the readDtm* shape. Throws on a non-raster response (honest failure — never a fake tile).
 */
export async function fetchDtmRaster(sourceKey, bboxWsen, { geotiffMod, env = process.env } = {}) {
  const cfg = DTM_FETCH[sourceKey];
  if (!cfg) throw new Error(`no DTM fetch adapter for source '${sourceKey}'`);
  const bbox = clampExtentM(bboxWsen, cfg.maxExtentM);
  const [w, s, e, n] = bbox;

  if (cfg.kind === 'wcs2-geo') {
    const url = `${cfg.endpoint}?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=${cfg.coverageId}`
      + `&FORMAT=image/tiff&SUBSET=${cfg.axisLat}(${s},${n})&SUBSET=${cfg.axisLon}(${w},${e})`
      + `&SUBSETTINGCRS=${crsUri('EPSG:4326')}&OUTPUTCRS=${crsUri('EPSG:4326')}`;
    const { ab } = await fetchBuffer(url, { accept: 'image/tiff' });
    return { raster: await readDtmFromBuffer(ab, geotiffMod), nativeCrs: cfg.nativeCrs, url };
  }

  if (cfg.kind === 'wms') {
    const proj = getProjector(cfg.requestCrs);
    let W, H, order;
    if (proj.geographic) {
      order = [w, s, e, n]; // WMS 1.3.0 CRS:84 → lon,lat
      const dims = pxDims((e - w) * mPerDegLon((s + n) / 2), (n - s) * M_PER_DEG_LAT, cfg.maxPx);
      W = dims.width; H = dims.height;
    } else {
      const nb = nativeBoxForBbox(bbox, proj, 0); order = nb; // projected → minx,miny,maxx,maxy
      const dims = pxDims(nb[2] - nb[0], nb[3] - nb[1], cfg.maxPx); W = dims.width; H = dims.height;
    }
    const url = `${cfg.endpoint}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${cfg.layer}&STYLES=`
      + `&CRS=${cfg.requestCrs}&BBOX=${order.map((v) => v.toFixed(3)).join(',')}`
      + `&WIDTH=${W}&HEIGHT=${H}&FORMAT=${encodeURIComponent(cfg.format)}`;
    const { ab } = await fetchBuffer(url, { accept: cfg.format });
    return { raster: await readDtmFromBuffer(ab, geotiffMod), nativeCrs: cfg.nativeCrs, url };
  }

  if (cfg.kind === 'wcs2') {
    const proj = getProjector(cfg.nativeCrs);
    const [x0, y0, x1, y1] = nativeBoxForBbox(bbox, proj, 100);
    let url = `${cfg.endpoint}?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=${cfg.coverageId}`
      + `&FORMAT=image/tiff&SUBSET=${cfg.axisX}(${x0.toFixed(0)},${x1.toFixed(0)})&SUBSET=${cfg.axisY}(${y0.toFixed(0)},${y1.toFixed(0)})`
      + `&SUBSETTINGCRS=${crsUri(cfg.nativeCrs)}`;
    if (cfg.scaleSize) {
      const dims = pxDims(x1 - x0, y1 - y0, cfg.maxPx);
      url += `&SCALESIZE=${cfg.axisX}(${dims.width}),${cfg.axisY}(${dims.height})`;
    }
    const { ab } = await fetchBuffer(url, { accept: 'image/tiff' });
    return { raster: await readDtmFromBuffer(ab, geotiffMod), nativeCrs: cfg.nativeCrs, url };
  }

  if (cfg.kind === 'wcs1') {
    const proj = getProjector(cfg.nativeCrs);
    const [x0, y0, x1, y1] = nativeBoxForBbox(bbox, proj, 100);
    // ⚠ SQUARE request. The Kartverket ArcGIS WCS emits a MALFORMED tiled GeoTIFF (tile-offset table
    // longer than the data → geotiff "Offset outside DataView") for some non-square WIDTH/HEIGHT
    // (1100×1041 fails; 1100×1100 + 900×852 read fine — live-isolated 2026-07-25). A square raster is
    // geometrically correct because the BBOX still georeferences it: the (anisotropic) pixels are
    // resolved by native X,Y in nativeToCell during the §3b warp, so no distortion reaches the mesh.
    const dim = cfg.maxPx;
    // FORMAT is per-source: NO ArcGIS wants 'GeoTIFF', DK Datafordeler wants 'GTiff'. apikey (DK) rides
    // on the URL via dtmAuthSuffix; the returned `url` is REDACTED so the key never reaches a log.
    const url = `${cfg.endpoint}?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage&COVERAGE=${cfg.coverageId}`
      + `&CRS=${cfg.nativeCrs}&BBOX=${x0.toFixed(0)},${y0.toFixed(0)},${x1.toFixed(0)},${y1.toFixed(0)}`
      + `&WIDTH=${dim}&HEIGHT=${dim}&FORMAT=${cfg.format ?? 'GeoTIFF'}${dtmAuthSuffix(cfg, env)}`;
    const { ab } = await fetchBuffer(url, { accept: 'image/tiff' });
    return { raster: await readDtmFromBuffer(ab, geotiffMod), nativeCrs: cfg.nativeCrs, url: redactKey(url) };
  }

  if (cfg.kind === 'stac-cog') {
    return await fetchSwissAltiStac(cfg, bbox, geotiffMod);
  }

  throw new Error(`unknown fetch kind '${cfg.kind}' for ${sourceKey}`);
}

/** CH swissALTI3D: STAC items over the bbox → per-1km 2 m COG GeoTIFFs → stitched native (2056) raster. */
async function fetchSwissAltiStac(cfg, bbox, geotiffMod) {
  const [w, s, e, n] = bbox;
  const itemsUrl = `${cfg.endpoint}/items?bbox=${w},${s},${e},${n}&limit=100`;
  const { ab } = await fetchBuffer(itemsUrl, { accept: 'application/json' });
  const json = JSON.parse(Buffer.from(ab).toString('utf8'));
  const feats = json.features ?? [];
  const hrefs = [];
  for (const f of feats) {
    const asset = Object.values(f.assets ?? {}).find((a) => typeof a.href === 'string' && a.href.includes(cfg.resToken) && /\.tif$/i.test(a.href));
    if (asset) hrefs.push(asset.href);
    if (hrefs.length >= cfg.maxTiles) break;
  }
  if (hrefs.length === 0) throw new Error(`swissALTI3D: STAC returned no ${cfg.resToken} COG tiles for bbox ${bbox.join(',')}`);
  // Read each tile; accumulate the union native bbox + a common resolution.
  const tiles = [];
  for (const href of hrefs) {
    const { ab: tb } = await fetchBuffer(href, { accept: 'image/tiff', timeoutMs: 120000 });
    tiles.push(await readDtmFromBuffer(tb, geotiffMod));
  }
  const res = tiles[0].resX;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const t of tiles) {
    minX = Math.min(minX, t.bboxNative[0]); minY = Math.min(minY, t.bboxNative[1]);
    maxX = Math.max(maxX, t.bboxNative[2]); maxY = Math.max(maxY, t.bboxNative[3]);
  }
  const width = Math.round((maxX - minX) / res), height = Math.round((maxY - minY) / res);
  const values = new Float32Array(width * height).fill(3.4e38); // nodata sentinel
  for (const t of tiles) {
    for (let ty = 0; ty < t.height; ty++) {
      const Y = t.bboxNative[3] - (ty + 0.5) * t.resY; // native N of this row
      const gy = Math.floor((maxY - Y) / res);
      if (gy < 0 || gy >= height) continue;
      for (let tx = 0; tx < t.width; tx++) {
        const X = t.bboxNative[0] + (tx + 0.5) * t.resX;
        const gx = Math.floor((X - minX) / res);
        if (gx < 0 || gx >= width) continue;
        const v = t.values[ty * t.width + tx];
        if (!isNodata(v)) values[gy * width + gx] = v;
      }
    }
  }
  const raster = { width, height, values, bboxNative: [minX, minY, maxX, maxY], resX: res, resY: res };
  return { raster, nativeCrs: cfg.nativeCrs, url: itemsUrl, tiles: hrefs.length };
}

// ═════════════════════════════════════════════════════════════════════════════
// §8c — GENERALIZED WARP COMPILE  (native raster + shared projector → quantized-mesh tileset)
// This is compileTifToTileset's non-NL sibling: it uses the §3b geographic warp so ANY projected or
// geographic national DTM produces a correct WGS-84-ellipsoidal quantized-mesh tileset. Same LOD
// pyramid + layer.json + datum lift as the NL path — the ONLY new machinery is the reproject warp.
// ═════════════════════════════════════════════════════════════════════════════
export function compileWarpToTileset({ raster, nativeCrs, geoidSepM, outDir, gridSize = 257, Martini, tileWsen }) {
  const proj = getProjector(nativeCrs);
  const cityWsen = tileWsen ?? inscribedWgs84Extent(raster, proj);
  const rasterFilled = { ...raster, values: fillNodata(raster.values, raster.width, raster.height) };
  // Per-tile warp: resample the native DTM onto THIS TMS tile's rectangle, then lift ortho→ellipsoidal.
  const gridForRect = (rectDeg) =>
    Float32Array.from(resampleToGeographicGrid(rasterFilled, proj.forward, rectDeg, gridSize),
      (h) => napToEllipsoidal(h, geoidSepM));
  const res = emitTileChain({ cityWsen, gridForRect, gridSize, outDir, Martini });
  return { tileWsen: cityWsen, ...res };
}

// ═════════════════════════════════════════════════════════════════════════════
// §9 — RUNTIME WIRING (the Cesium terrain-provider + the L-584 datum fix).
//
// ✅ SHIPPED (Phase 3, 2026-07-25). The wiring documented below is now IMPLEMENTED in the client:
//   • apps/editor/src/ui/geospatial/terrainCoverage.ts — cityForLonLat() + terrainTilesetUrl():
//       resolve a site lon/lat → baked-terrain city slug → `${contextTilesBaseUrl()}terrain/<city>`.
//   • apps/editor/src/ui/geospatial/CesiumViewport.ts — maybeAttachTerrainProvider(): called from
//       loadContextBuildings() (every location change / pan), it awaits CesiumTerrainProvider.fromUrl,
//       assigns viewer.terrainProvider on success, then drops formaTerrainSampledAt and re-runs
//       clampTerrainThenReplace so the massing re-seats on real ground. GUARDED: unknown city or a
//       404 layer.json (un-baked / blocked) keeps the flat EllipsoidTerrainProvider — no regression.
//
// CesiumViewport.ts already had the whole machinery; it just never had a real terrain provider
// (`terrainProviderHasElevationData()` returns false for the default EllipsoidTerrainProvider, so
// `clampTerrainThenReplace()` clamps to flat base 0). Phase 3 attaches the R2 tileset — no new
// dependency (Cesium ships CesiumTerrainProvider):
//
//   // (a) after the viewer is built, attach the baked terrain instead of the bare ellipsoid:
//   const provider = await Cesium.CesiumTerrainProvider.fromUrl(
//       `${CONTEXT_TILES_BASE}terrain/${city}`,          // R2 layout mirrors <layer>.pmtiles: terrain/<city>/{layer.json,{z}/{x}/{y}.terrain}
//       { requestVertexNormals: false });
//   viewer.terrainProvider = provider;                    // now terrainProviderHasElevationData()===true
//
//   // (b) NOTHING else changes for the SITE ORIGIN: clampTerrainThenReplace() already samples
//   //     sampleTerrainMostDetailed(provider, [centroidCarto]) → formaTerrainBaseHeight. Because the
//   //     tileset heights are ELLIPSOIDAL (napToEllipsoidal lift baked in), the sample already agrees
//   //     with the building/envelope datum → nothing floats or buries. That is the datum-share.
//
// The L-584 rasant fix (per-building base, not one block-centroid sample) is fitFootprintGroundPlane():
// at bake time each context building's base Z is set to the plane-fit ground under ITS footprint
// (perimeter samples), and the envelope solver reads the SAME plane for the façade rasant. In the
// client this is the per-building `base` in the extrusion loop (CesiumViewport renderFormaMassing),
// which currently uses the single `formaTerrainBaseHeight`; Phase 3 replaces it per footprint with
// `sampleTerrainMostDetailed(provider, [perFootprintCentroid])` (or the baked per-building ground).
// ONE vertical datum throughout (C12 §1.4): terrain mesh, building base, envelope rasant.
// ═════════════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════════════
// §9b — COMPILE ONE DTM GeoTIFF → a Cesium quantized-mesh tileset dir (shared by --tif + --bake-city)
// NL keeps its dependency-free closed-form RD inverse (rdToWgs84) — the already-shipped, founder-
// verified Amsterdam path, left byte-for-byte unchanged. EVERY other country routes through the
// §8c shared warp (reproject.mjs proj4 + resampleToGeographicGrid) — no per-country projection code.
// ═════════════════════════════════════════════════════════════════════════════
export async function compileTifToTileset(tifPath, country, outDir, gridSize, geotiffMod, Martini) {
  const src = TERRAIN_SOURCES[country];
  const raster = await readDtmGeoTIFF(tifPath, geotiffMod);
  if (country !== 'nl') {
    // Non-NL GeoTIFF: warp from its native CRS. `--tif` callers pass --native-crs; else fall back to
    // the source's DTM_FETCH nativeCrs. Honest: refuse rather than guess if neither is known.
    const nativeCrs = (DTM_FETCH[country] && DTM_FETCH[country].nativeCrs);
    if (!nativeCrs) throw new Error(`compileTifToTileset: no nativeCrs for '${country}' — pass a wired source or use compileWarpToTileset({nativeCrs}) directly`);
    return compileWarpToTileset({ raster, nativeCrs, geoidSepM: src.geoidSepM, outDir, gridSize, Martini });
  }
  // NL closed-form: build the ellipsoidal city grid once (RD-New inverse for the corners — unchanged
  // datum math), then serve it into the shared per-level TMS emitter via a box-linear sampler. The grid
  // spans the WGS-84 quad of the raster corners (gy=0 = north); samples outside it clamp to the edge.
  const filled = fillNodata(raster.values, raster.width, raster.height);
  const cityGrid = resampleSquare(filled, raster.width, raster.height, gridSize).map((h) => napToEllipsoidal(h, src.geoidSepM));
  const [minX, minY, maxX, maxY] = raster.bboxNative;
  const [wLon, sLat] = rdToWgs84(minX, minY), [eLon, nLat] = rdToWgs84(maxX, maxY);
  const cityWsen = [wLon, sLat, eLon, nLat];
  const sampleCityGrid = (lon, lat) => {
    const u = (lon - wLon) / (eLon - wLon), vN = (nLat - lat) / (nLat - sLat); // vN=0 at north
    const fx = Math.min(gridSize - 1, Math.max(0, u * (gridSize - 1)));
    const fy = Math.min(gridSize - 1, Math.max(0, vN * (gridSize - 1)));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(gridSize - 1, x0 + 1), y1 = Math.min(gridSize - 1, y0 + 1);
    const tx = fx - x0, ty = fy - y0;
    const a = cityGrid[y0 * gridSize + x0], b = cityGrid[y0 * gridSize + x1];
    const c = cityGrid[y1 * gridSize + x0], d = cityGrid[y1 * gridSize + x1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
  const gridForRect = ([rw, rs, re, rn]) => {
    const out = new Float32Array(gridSize * gridSize);
    for (let gy = 0; gy < gridSize; gy++) {
      const lat = rn - (rn - rs) * (gy / (gridSize - 1));
      for (let gx = 0; gx < gridSize; gx++) out[gy * gridSize + gx] = sampleCityGrid(rw + (re - rw) * (gx / (gridSize - 1)), lat);
    }
    return out;
  };
  return emitTileChain({ cityWsen, gridForRect, gridSize, outDir, Martini });
}

// ═════════════════════════════════════════════════════════════════════════════
// §9c — BAKE ONE CITY end-to-end (fetch national DTM → warp compile) + SAMPLE (verification).
// The honest core of the multi-city bake: resolve city → source → fetch real DTM → warp → tileset.
// Skips (never fakes) for apikey-gated sources without a key and for BLOCKED cities.
// ═════════════════════════════════════════════════════════════════════════════
export async function bakeCity(region, { outDir, gridSize = 257, geotiffMod, Martini, env = process.env, bboxOverride } = {}) {
  const src = TERRAIN_SOURCES[region.source];
  const bbox = bboxOverride ?? region.bbox;
  if (region.source === 'nl') {
    // NL stays on the shipped closed-form proof path (see the --bake-city CLI branch).
    throw new Error('bakeCity: NL uses the dedicated closed-form path in the CLI, not the generic adapter');
  }
  const apikey = APIKEY_SOURCES[region.source];
  if (apikey && !env[apikey.env]) {
    return { status: 'skip-apikey', reason: `${region.source.toUpperCase()} needs ${apikey.env} (${apikey.hint}) — not set; skipping loudly (no fake tile).` };
  }
  if (!DTM_FETCH[region.source]) {
    return { status: 'skip-unwired', reason: `no DTM fetch adapter for source '${region.source}'.` };
  }
  const { raster, nativeCrs, url, tiles } = await fetchDtmRaster(region.source, bbox, { geotiffMod, env });
  console.log(`  fetched DTM: ${raster.width}x${raster.height}px native ${nativeCrs}${tiles ? ` (${tiles} STAC tiles)` : ''}\n  via ${url}`);
  const res = compileWarpToTileset({ raster, nativeCrs, geoidSepM: src.geoidSepM, outDir, gridSize, Martini });
  return { status: 'ok', ...res, nativeCrs, url };
}

/** Fetch a coarse DTM for a city and print elevations at named control points — the placement +
 *  datum proof (reproducible in CI). Returns the sampled rows so a caller/CI can assert them. */
export async function sampleCity(region, probes, { geotiffMod, env = process.env } = {}) {
  const src = TERRAIN_SOURCES[region.source];
  const { raster, nativeCrs, url } = await fetchDtmRaster(region.source, region.bbox, { geotiffMod, env });
  const [minX, minY, maxX, maxY] = raster.bboxNative;
  const proj = getProjector(nativeCrs);
  let mn = Infinity, mx = -Infinity, sum = 0, cnt = 0;
  for (const v of raster.values) if (!isNodata(v)) { if (v < mn) mn = v; if (v > mx) mx = v; sum += v; cnt++; }
  const rows = [];
  for (const [name, lon, lat] of probes) {
    const [X, Y] = proj.forward(lon, lat);
    const { fx, fy } = nativeToCell(X, Y, raster);
    const ortho = sampleGrid(raster.values, raster.width, raster.height, fx, fy);
    rows.push({ name, lon, lat, orthoM: isNodata(ortho) ? null : +ortho.toFixed(1), ellipsoidalM: isNodata(ortho) ? null : +(ortho + src.geoidSepM).toFixed(1) });
  }
  return { url, nativeCrs, geoidSepM: src.geoidSepM, raster: { w: raster.width, h: raster.height, bboxNative: [minX, minY, maxX, maxY] },
    stats: { minOrtho: +mn.toFixed(1), meanOrtho: +(sum / cnt).toFixed(1), maxOrtho: +mx.toFixed(1), valid: cnt, total: raster.values.length }, rows };
}

/** A few well-known control points per city for --sample-city (coast/valley → hill spread). */
export const SAMPLE_PROBES = {
  barcelona: [['Port/beach', 2.19, 41.375], ['Montjuïc', 2.155, 41.363], ['Tibidabo', 2.118, 41.422], ['Eixample', 2.163, 41.39]],
  valencia: [['Port/beach', -0.325, 39.46], ['Ciutat Vella', -0.375, 39.475], ['Túria park', -0.36, 39.47], ['Airport W', -0.42, 39.49]],
  toledo: [['Alcázar/old city', -4.021, 39.858], ['Tagus gorge', -4.030, 39.853], ['North plain', -4.020, 39.900], ['SW hills', -4.055, 39.845]],
  malaga: [['Port', -4.417, 36.713], ['Gibralfaro', -4.410, 36.724], ['Montes N', -4.44, 36.76]],
  benalmadena: [['Coast/Arroyo', -4.516, 36.600], ['Benalmádena Pueblo', -4.573, 36.596], ['Sierra N', -4.58, 36.64]],
  fuengirola: [['Coast', -4.625, 36.540], ['Mijas Pueblo', -4.637, 36.596], ['Sierra de Mijas', -4.66, 36.61]],
  marbella: [['Coast', -4.885, 36.508], ['Old town', -4.885, 36.516], ['La Concha foot', -4.90, 36.54]],
  madrid: [['Puerta del Sol', -3.703, 40.417], ['Retiro', -3.683, 40.415], ['North M-30', -3.69, 40.50]],
  cordoba: [['Mezquita', -4.779, 37.879], ['Guadalquivir', -4.78, 37.875], ['North hills', -4.80, 37.93]],
  paris: [['Île de la Cité', 2.348, 48.854], ['Montmartre', 2.343, 48.887], ['Bois de Boulogne', 2.25, 48.86]],
  lyon: [['Presqu’île', 4.833, 45.758], ['Fourvière', 4.822, 45.762], ['Rhône bank', 4.85, 45.75]],
  zurich: [['Hauptbahnhof', 8.540, 47.378], ['Zürichberg', 8.573, 47.383], ['Lake shore', 8.545, 47.365]],
  geneva: [['Old town', 6.148, 46.201], ['Lake', 6.15, 46.21], ['Salève foot', 6.16, 46.18]],
  bern: [['Old town', 7.447, 46.948], ['Aare', 7.45, 46.95], ['Gurten foot', 7.44, 46.93]],
  oslo: [['Fjord/Opera', 10.75, 59.907], ['Central', 10.74, 59.914], ['Inland N', 10.76, 59.955]],
  london: [['Thames/City', -0.098, 51.508], ['Westminster', -0.1276, 51.5072], ['Hampstead', -0.178, 51.556]],
  rome: [['Colosseum', 12.492, 41.890], ['Tiber', 12.472, 41.895], ['Monte Mario', 12.446, 41.925]],
  milan: [['Duomo', 9.190, 45.464], ['Navigli', 9.175, 45.448], ['North', 9.2, 45.53]],
};

// ═════════════════════════════════════════════════════════════════════════════
// §10 — CLI
// ═════════════════════════════════════════════════════════════════════════════
function printRegistry() {
  console.log('PRYZM terrain — per-country DTM source registry (live-probed 2026-07-24, re-probed 2026-07-25)\n');
  for (const [code, s] of Object.entries(TERRAIN_SOURCES)) {
    console.log(`■ ${code.toUpperCase().padEnd(8)} ${s.dataset}`);
    console.log(`    endpoint  : ${s.endpoint}`);
    console.log(`    grid/CRS  : ${s.resolutionM} m · ${s.horizCrs} + ${s.vertDatum} (compound ${s.compoundCrs})`);
    const lift = s.geoidSepM == null ? 'n/a' : `${s.geoidSepM >= 0 ? '+' : ''}${s.geoidSepM} m`;
    console.log(`    datum lift: ${lift} orthometric→ellipsoidal · licence ${s.license} · commercialOk=${s.commercialOk} · auth ${s.auth}`);
    console.log(`    PROBE     : ${s.probe.verdict.toUpperCase()} — ${s.probe.evidence}`);
    console.log('');
  }
}

/** Print the per-city terrain REGIONS (the 25 jurisdiction cities), grouped bakeable vs blocked. */
function printRegions() {
  console.log(`PRYZM terrain — ${REGIONS.length} jurisdiction cities (mirrors bake.mjs REGIONS)\n`);
  console.log(`  BAKEABLE (${BAKEABLE_REGIONS.length}):`);
  for (const r of BAKEABLE_REGIONS) {
    const s = TERRAIN_SOURCES[r.source];
    console.log(`    ✔ ${r.name.padEnd(13)} ${r.source.toUpperCase().padEnd(3)} ${s.probe.verdict.padEnd(8)} bbox ${r.bbox.join(',')}`);
  }
  const blocked = REGIONS.filter((r) => r.blocked);
  console.log(`\n  BLOCKED (${blocked.length}) — skipped with reason, NOT silently dropped:`);
  for (const r of blocked) {
    console.log(`    ✖ ${r.name.padEnd(13)} ${r.source.toUpperCase().padEnd(3)} — ${r.blocked}`);
  }
  console.log('');
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (n) => args.includes(n);
  const val = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);

  if (flag('--regions')) { printRegions(); return; }

  if (flag('--selftest')) {
    const { pass, rows } = reprojectSelfTest();
    for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.epsg.padEnd(11)} ctrlΔ=${r.ctrlErrM}m roundtripΔ=${r.roundTripErrM}m`);
    console.log(pass ? '✅ reproject self-test PASS' : '❌ reproject self-test FAILED');
    process.exit(pass ? 0 : 1);
  }

  // §SAMPLE-CITY — the placement + datum PROOF. Fetch a city's real DTM and print elevations at
  // known control points (coast/valley → hill). Reproducible in CI; no tileset written.
  if (flag('--sample-city')) {
    const name = val('--sample-city');
    const region = REGIONS.find((r) => r.name === name);
    if (!region) { console.error(`unknown city '${name}' (see --regions)`); process.exit(1); }
    if (region.blocked) { console.log(`SKIP ${name}: BLOCKED — ${region.blocked}`); return; }
    if (region.source === 'nl') { console.log('use --fetch-nl for the NL proof (RD-New closed form).'); return; }
    const apk = APIKEY_SOURCES[region.source];
    if (apk && !process.env[apk.env]) {
      console.log(`::warning::SKIP ${name}: ${region.source.toUpperCase()} needs ${apk.env} (${apk.hint}) — not set; cannot sample keyless (no fake).`);
      return;
    }
    const geotiffMod = await import('geotiff');
    const probes = SAMPLE_PROBES[name] || [['centroid', (region.bbox[0] + region.bbox[2]) / 2, (region.bbox[1] + region.bbox[3]) / 2]];
    const r = await sampleCity(region, probes, { geotiffMod });
    console.log(`═══ SAMPLE ${name} (${region.source.toUpperCase()} ${r.nativeCrs}, geoid lift +${r.geoidSepM} m) ═══`);
    console.log(`  DTM query: ${r.url}`);
    console.log(`  raster ${r.raster.w}x${r.raster.h}px · orthometric min/mean/max = ${r.stats.minOrtho}/${r.stats.meanOrtho}/${r.stats.maxOrtho} m (valid ${r.stats.valid}/${r.stats.total})`);
    for (const row of r.rows) {
      console.log(`    · ${row.name.padEnd(18)} (${row.lon},${row.lat}) → ${row.orthoM == null ? 'nodata' : `${row.orthoM} m orthometric → ${row.ellipsoidalM} m ellipsoidal`}`);
    }
    return;
  }

  if (flag('--probe')) {
    for (const [code, s] of Object.entries(TERRAIN_SOURCES)) {
      if (code.startsWith('_')) continue;
      try {
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 25000);
        const r = await fetch(s.probe.url, { signal: ctrl.signal }); clearTimeout(t);
        console.log(`${code.toUpperCase().padEnd(8)} HTTP ${r.status}  ${r.headers.get('content-type')}  [${s.probe.verdict}]`);
      } catch (e) { console.log(`${code.toUpperCase().padEnd(8)} ERR ${e.name}  [${s.probe.verdict}]`); }
    }
    return;
  }

  if (flag('--fetch-nl')) {
    // Amsterdam-centre 256×256 m RD-New tile — the exact box the one-city proof uses.
    const dest = val('--fetch-nl') || resolve(HERE, 'out/amsterdam_ahn_dtm05.tif');
    const bboxRD = (val('--bbox-rd') || '120900,486900,121156,487156').split(',').map(Number);
    const url = dtmWcsUrl(bboxRD);
    mkdirSync(dirname(dest), { recursive: true });
    console.log(`fetching keyless AHN DTM → ${dest}\n  ${url}`);
    const r = await fetchToFile(url, dest);
    console.log(`  ✔ ${r.bytes} B  ${r.ct}  TIFF magic ${r.magic}`);
    return;
  }

  if (flag('--tif')) {
    const geotiffMod = await import('geotiff');
    const Martini = (await import('@mapbox/martini')).default;
    const country = val('--country') || 'nl';
    const outDir = val('--out') || resolve(HERE, 'out/terrain', country);
    const gridSize = Number(val('--grid') || 257);
    await compileTifToTileset(val('--tif'), country, outDir, gridSize, geotiffMod, Martini);
    return;
  }

  // §TERRAIN-BAKE-CITY — the CI entry point (terrain-bake.yml iterates BAKEABLE_REGIONS).
  // Fetch this city's national DTM → warp-compile → out/terrain/<city>/. NL uses its shipped closed-
  // form proof path; ES/FR/CH/NO/DE/IT/GB use the §8b keyless per-country adapters + §8c shared warp.
  // apikey-gated (DK/SE/FI) and BLOCKED cities SKIP LOUDLY (exit 0) — CI keeps going, never a fake tile.
  if (flag('--bake-city')) {
    const name = val('--bake-city');
    const region = REGIONS.find((r) => r.name === name);
    if (!region) { console.error(`unknown city '${name}' (see --regions)`); process.exit(1); }
    if (region.blocked) { console.log(`SKIP ${name}: BLOCKED — ${region.blocked}`); return; }
    const outDir = val('--out') || resolve(HERE, 'out/terrain', name);
    const gridSize = Number(val('--grid') || 257);
    const geotiffMod = await import('geotiff');
    const Martini = (await import('@mapbox/martini')).default;

    if (region.source === 'nl') {
      // Shipped, founder-verified Amsterdam path — unchanged (dependency-free RD-New closed form).
      mkdirSync(outDir, { recursive: true });
      const tifPath = resolve(outDir, `${name}_dtm.tif`);
      const bboxRD = (val('--bbox-rd') || '120900,486900,121156,487156').split(',').map(Number);
      const url = dtmWcsUrl(bboxRD);
      console.log(`bake ${name}: fetch keyless AHN DTM → ${tifPath}\n  ${url}`);
      const fr = await fetchToFile(url, tifPath);
      console.log(`  ✔ ${fr.bytes} B ${fr.ct} TIFF magic ${fr.magic}`);
      await compileTifToTileset(tifPath, region.source, outDir, gridSize, geotiffMod, Martini);
      console.log(`✓ ${name} → ${outDir}`);
      return;
    }

    const bboxOverride = val('--bbox') ? val('--bbox').split(',').map(Number) : undefined;
    console.log(`bake ${name} (${region.source.toUpperCase()}): ${DTM_FETCH[region.source]?.note ?? ''}`);
    const res = await bakeCity(region, { outDir, gridSize, geotiffMod, Martini, bboxOverride });
    if (res.status !== 'ok') {
      // apikey-gated / unwired sources SKIP LOUDLY (::warning:: → visible CI annotation) but exit 0 so
      // the multi-city bake carries on (never a fake tile). Copenhagen lands here without the key.
      const loud = res.status === 'skip-apikey' || res.status === 'skip-unwired';
      console.log(`${loud ? '::warning::' : ''}SKIP ${name}: ${res.reason}`);
      return;
    }
    const fine = res.tiles[res.tiles.length - 1];
    console.log(`✓ ${name} → ${outDir}  (z0..${res.maxZoom}, finest ${fine.path} h ${fine.minH.toFixed(1)}..${fine.maxH.toFixed(1)} m ellipsoidal)`);
    return;
  }

  printRegistry();
}

if (process.argv[1]?.endsWith('terrain.mjs')) {
  main().catch((e) => { console.error('terrain.mjs failed:', e); process.exit(1); });
}
