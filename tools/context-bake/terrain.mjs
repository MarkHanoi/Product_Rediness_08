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
// national DTM arrives keyless over WCS as a GeoTIFF (see `dtmWcsUrl()` + `--fetch-nl`, live-
// verified); everything after is Node. Deps install STANDALONE (a separate artefact, NOT the
// pnpm workspace — `workspace:*` would choke a subdir `npm i`; mirror bake.mjs's Docker-image
// property). In a scratch dir:  npm i geotiff@2 @mapbox/martini@0.2
//   geotiff         — read the DTM GeoTIFF (national CRS)
//   @mapbox/martini — RTIN error-bounded raster→TIN (Mapbox's MARTINI; pydelatin-equivalent)
//   (the quantized-mesh encoder is implemented in-file — no npm encoder exists that renders;
//    it is verified by an INDEPENDENT decode round-trip in terrain.verify.mjs.)
//
// USAGE:
//   node terrain.mjs --list                         # print the per-country DTM source registry
//   node terrain.mjs --regions                       # print the 25 per-city REGIONS (bakeable vs blocked)
//   node terrain.mjs --probe                         # live-probe every source (HTTP + Content-Type)
//   node terrain.mjs --fetch-nl amsterdam.tif        # keyless WCS GetCoverage → an AHN DTM GeoTIFF
//   node terrain.mjs --tif <file> --country nl \     # compile ONE GeoTIFF → quantized-mesh tileset
//        --out out/terrain/<city>                    #   (needs geotiff + @mapbox/martini installed)
//
// Cross-refs: CONTEXT-DATA-TERRAIN.md (per-country sourcing) · globeGroundAnchor.ts (the datum
// boundary) · CesiumViewport.ts (runtime wiring, §9 below) · CONTEXT-3D-PERFORMANCE-ARCHITECTURE.md.
// ─────────────────────────────────────────────────────────────────────────────
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
    country: 'Denmark', dataset: 'DHM/Terræn (Datafordeler / Dataforsyningen)',
    protocol: 'WCS/WMS behind Datafordeler apikey', coverageId: 'dhm_terraen',
    endpoint: 'https://services.datafordeler.dk/ (DHM services)',
    resolutionM: 0.4, horizCrs: 'ETRS89 UTM32 (EPSG:25832)', vertDatum: 'DVR90 (EPSG:5799)',
    compoundCrs: 'EPSG:4258+5799', geoidSepM: 40.0, // Copenhagen
    license: 'free for most uses — verify commercial clause', commercialOk: null,
    // ⚠ 2026 auth: Datafordeler Basic Auth (username/password) is RETIRED (commit 1fc5bc8b,
    // DENMARK-DATAFORDELER-AUTH-2026.md). Same pattern as the DK Matrikel proxy fix: append
    // `&apikey=<DATAFORDELER_API_KEY>` to the DHM WCS/WFS request; mint the key at
    // portal.datafordeler.dk. Env var: DATAFORDELER_API_KEY (reuse the Matrikel one).
    auth: 'apikey (&apikey=<DATAFORDELER_API_KEY>; Basic Auth retired 2026 — see DENMARK-DATAFORDELER-AUTH-2026.md)',
    probe: { url: 'https://dataforsyningen.dk/data/930', verdict: 'token',
      evidence: 'Registration portal HTTP 200 (dataforsyningen.dk). Datafordeler DHM service paths 404/401 WITHOUT credentials — TOKEN-GATED. Matches commit 1fc5bc8b "Datafordeler Basic Auth RETIRED → apikey=" — the DHM GetCoverage needs &apikey=<DATAFORDELER_API_KEY>. Copenhagen therefore needs a key in env; Amsterdam is the keyless one-city proof instead' },
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
  { name: 'amsterdam',    source: 'nl', bbox: [4.83, 52.34, 4.97, 52.42] },
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
  { name: 'madrid',       source: 'es', bbox: [-3.80, 40.33, -3.58, 40.52] },
  { name: 'barcelona',    source: 'es', bbox: [2.09, 41.32, 2.23, 41.47] },
  { name: 'cordoba',      source: 'es', bbox: [-4.85, 37.84, -4.72, 37.94] },
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

/** Bilinear DTM sample at a fractional grid cell (row-major, top row = maxY). */
function sampleGrid(values, width, height, fx, fy) {
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(fy)));
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
const RADII = [WGS84_A, WGS84_A, WGS84_B];
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
  const dl = len(dtpScaled); const dtp = dtpScaled.map((v) => v / dl);
  let resultMag = 0;
  for (const p of positions) {
    const sp = [p[0] * ONE_OVER_RADII[0], p[1] * ONE_OVER_RADII[1], p[2] * ONE_OVER_RADII[2]];
    let magSq = dot(sp, sp); let mag = Math.sqrt(magSq);
    const dir = [sp[0] / mag, sp[1] / mag, sp[2] / mag];
    magSq = Math.max(1, magSq); mag = Math.max(1, mag);
    const cosAlpha = dot(dir, dtp);
    const sinAlpha = len(cross(dir, dtp));
    const cosBeta = 1 / mag;
    const sinBeta = Math.sqrt(magSq - 1) * cosBeta;
    const candidate = 1 / (cosAlpha * cosBeta - sinAlpha * sinBeta);
    if (Number.isFinite(candidate) && candidate > resultMag) resultMag = candidate;
  }
  const scaled = dtp.map((v) => v * resultMag);
  return [scaled[0] * RADII[0], scaled[1] * RADII[1], scaled[2] * RADII[2]];
}

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
  let minH = Infinity, maxH = -Infinity;
  const ecef = [];
  for (let i = 0; i < nV; i++) {
    const gx = mesh.vertices[2 * i], gy = mesh.vertices[2 * i + 1];
    const u = gx / (gridSize - 1), v = gy / (gridSize - 1); // gy=0 top(north)
    const lonDeg = (tile.west + (tile.east - tile.west) * u) / D2R;
    const latDeg = (tile.north - (tile.north - tile.south) * v) / D2R;
    const h = heightAt(gx, gy);
    hs[i] = h;
    if (h < minH) minH = h; if (h > maxH) maxH = h;
    ecef.push(ecefFromLonLatH(lonDeg, latDeg, h));
  }
  const c = [0, 0, 0]; for (const p of ecef) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  c[0] /= nV; c[1] /= nV; c[2] /= nV;
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

  const headerSize = 88;
  const vBytes = 4 + nV * 2 * 3;
  const iBytes = 4 + idx.length * 2;
  const eBytes = 4 * 4 + (west.length + south.length + east.length + north.length) * 2;
  const buf = Buffer.alloc(headerSize + vBytes + iBytes + eBytes);
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
  return { buffer: buf, stats: { vertices: nV, triangles: idx.length / 3, minH, maxH, radius,
    edges: { west: west.length, south: south.length, east: east.length, north: north.length } } };
}

/** Minimal Cesium layer.json for a quantized-mesh tileset served from R2. */
export function layerJson(tile, maxZoom) {
  const toDeg = (r) => r / D2R;
  const available = [];
  for (let z = 0; z <= maxZoom; z++) available.push([{ startX: 0, startY: 0, endX: (1 << (z + 1)) - 1, endY: (1 << z) - 1 }]);
  return {
    tilejson: '2.1.0', name: 'PRYZM terrain', format: 'quantized-mesh-1.0',
    scheme: 'tms', tiles: ['{z}/{x}/{y}.terrain'],
    projection: 'EPSG:4326', bounds: [-180, -90, 180, 90],
    extent: [toDeg(tile.west), toDeg(tile.south), toDeg(tile.east), toDeg(tile.north)],
    minzoom: 0, maxzoom: maxZoom, available,
  };
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
// ⚠ Reprojection: NL uses the closed-form RD inverse (rdToWgs84). Other countries need proj4 for
// their native horizCrs — until that adapter lands, only source 'nl' is wired end-to-end (§9).
// ═════════════════════════════════════════════════════════════════════════════
export async function compileTifToTileset(tifPath, country, outDir, gridSize, geotiffMod, Martini) {
  const src = TERRAIN_SOURCES[country];
  const raster = await readDtmGeoTIFF(tifPath, geotiffMod);
  const filled = fillNodata(raster.values, raster.width, raster.height);
  const grid = resampleSquare(filled, raster.width, raster.height, gridSize);
  const gridEll = grid.map((h) => napToEllipsoidal(h, src.geoidSepM));
  const [minX, minY, maxX, maxY] = raster.bboxNative;
  if (country !== 'nl') {
    throw new Error(`reproject adapter not wired for ${country} (${src.horizCrs}) — only NL RD-New today`);
  }
  const [wLon, sLat] = rdToWgs84(minX, minY), [eLon, nLat] = rdToWgs84(maxX, maxY);
  const tile = { west: wLon * D2R, south: sLat * D2R, east: eLon * D2R, north: nLat * D2R };
  const heightAt = (gx, gy) => gridEll[gy * gridSize + gx];
  mkdirSync(outDir, { recursive: true });
  for (let lod = 0; lod < DEFAULT_LOD_ERRORS_M.length; lod++) {
    const mesh = meshTile(gridEll, gridSize, DEFAULT_LOD_ERRORS_M[lod], Martini);
    const { buffer, stats } = encodeQuantizedMesh(mesh, gridSize, tile, heightAt);
    const p = resolve(outDir, `${lod}.terrain`);
    writeFileSync(p, buffer);
    console.log(`LOD${lod} err=${DEFAULT_LOD_ERRORS_M[lod]}m → ${stats.triangles} tris, ${stats.vertices} verts, ${(buffer.length / 1024).toFixed(1)} KB → ${p}`);
  }
  writeFileSync(resolve(outDir, 'layer.json'), JSON.stringify(layerJson(tile, DEFAULT_LOD_ERRORS_M.length - 1), null, 2));
  console.log(`layer.json + ${DEFAULT_LOD_ERRORS_M.length} LOD tiles → ${outDir}`);
}

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
  // Fetch this city's national DTM → compile → out/terrain/<city>/. HONEST: only source 'nl'
  // (keyless AHN, RD-New) is wired end-to-end today; every other city SKIPS loudly (exit 0) with
  // its registry probe verdict, so CI keeps going and never emits a wrong-datum tileset. As each
  // per-country fetch/reproject adapter lands, its branch is added here and the city lights up.
  if (flag('--bake-city')) {
    const name = val('--bake-city');
    const region = REGIONS.find((r) => r.name === name);
    if (!region) { console.error(`unknown city '${name}' (see --regions)`); process.exit(1); }
    if (region.blocked) { console.log(`SKIP ${name}: BLOCKED — ${region.blocked}`); return; }
    const src = TERRAIN_SOURCES[region.source];
    const outDir = val('--out') || resolve(HERE, 'out/terrain', name);
    if (region.source !== 'nl') {
      console.log(`SKIP ${name} (${region.source.toUpperCase()}): fetch/reproject adapter not yet wired `
        + `(needs proj4 for ${src.horizCrs}; probe=${src.probe.verdict}). No tileset emitted — see CONTEXT-TERRAIN-COVERAGE.md.`);
      return;
    }
    const geotiffMod = await import('geotiff');
    const Martini = (await import('@mapbox/martini')).default;
    mkdirSync(outDir, { recursive: true });
    const tifPath = resolve(outDir, `${name}_dtm.tif`);
    // Amsterdam-centre 256 m RD-New tile — the reproducible keyless proof box (§8/--fetch-nl).
    const bboxRD = (val('--bbox-rd') || '120900,486900,121156,487156').split(',').map(Number);
    const url = dtmWcsUrl(bboxRD);
    console.log(`bake ${name}: fetch keyless AHN DTM → ${tifPath}\n  ${url}`);
    const fr = await fetchToFile(url, tifPath);
    console.log(`  ✔ ${fr.bytes} B ${fr.ct} TIFF magic ${fr.magic}`);
    await compileTifToTileset(tifPath, region.source, outDir, Number(val('--grid') || 257), geotiffMod, Martini);
    console.log(`✓ ${name} → ${outDir}`);
    return;
  }

  printRegistry();
}

if (process.argv[1]?.endsWith('terrain.mjs')) {
  main().catch((e) => { console.error('terrain.mjs failed:', e); process.exit(1); });
}
