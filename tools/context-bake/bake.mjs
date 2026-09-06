#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// PRYZM context tile bake — L-513a (see docs/04-reference/CONTEXT-3D-PERFORMANCE-ARCHITECTURE.md)
//
// WHY: the 3D-Site context (buildings/roads/water/parks) is fetched LIVE from public Overpass on
// every site visit, which is 406/45s/429/502-flaky (proven — L-513/L-523). A live public-Overpass
// hot-path CANNOT be made fast. This tool BAKES the context ONCE into static PMTiles that the client
// reads via HTTP range requests (<50 ms, cacheable, no rate limit). Deterministic + re-runnable.
//
// SOURCE: Geofabrik's Cataluña extract (the whole region OSM in ONE static ~266 MB .osm.pbf,
// daily-refreshed) — live-verified. NOT a live query.
//
// PIPELINE (per docs): download pbf → osmium clip to the Barcelona bbox → per layer:
//   osmium tags-filter → osmium export (GeoJSONSeq) → tippecanoe → <layer>.pmtiles → object storage.
//
// TOOLCHAIN: needs `osmium` + `tippecanoe`. This box has neither, so the tool AUTO-DETECTS: if the
// local binaries exist it uses them; otherwise it shells out to the bundled Docker image (see
// ./Dockerfile). The heavy run therefore happens anywhere Docker OR the tools exist (dev / CI / Fly).
//
// USAGE:
//   node bake.mjs --check      # print tool availability + the plan, then exit (safe; runs here)
//   node bake.mjs --dry-run    # print every command that WOULD run, execute nothing
//   node bake.mjs              # run the full bake (needs osmium+tippecanoe locally, or Docker)
//   node bake.mjs --layer buildings   # bake a single layer
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// §BEV-ALS-OSM-JOIN + §CUZK-NDSM-OSM-JOIN + §GURS-KN-OSM-JOIN (2026-09-05, lane HEIGHTS-AT-CZ-SI) — the Austrian (BEV ALS
// DSM − DTM 1 m COG windows), Czech (ČÚZK DMP 1G − DMR 5G exportImage) and Slovenian (GURS KN STAVBE register) stamps live
// in their OWN modules (the nl3dbagStamp precedent — heightSources.mjs is a many-lane file) and are imported here DIRECTLY,
// in the commit that declares the `austria` / `czechia` / `slovenia` rows' heightJoin — never "built, imported by nothing".
import { stampAtHeightsOnGeojsonseq, AT_CITY_BBOXES } from './heights/atHeightsStamp.mjs';
import { stampCzHeightsOnGeojsonseq, CZ_CITY_BBOXES } from './heights/czHeightsStamp.mjs';
import { stampSiHeightsOnGeojsonseq, SI_CITY_BBOXES } from './heights/siHeightsStamp.mjs';
// §ADSDI-NDSM-OVERTURE-JOIN (2026-09-05, lane ME-ABUDHABI-I3S) — Abu Dhabi's keyless 50 cm DSM3 − DTM stamp (catalogued
// Open Data, DGE; the I3S city model the brief named was REFUSED on the SDI Terms — heights/abudhabiNdsm.mjs header)
// lives in its OWN module and is imported here DIRECTLY, in the same commit that declares the `gccstates` row's
// heightJoin — never "built, imported by nothing" (L-12883 / L-12910). It stamps the row's OVERTURE footprints.
import { stampAdNdsmHeightsOnGeojsonseq, AD_CITY_BBOXES } from './heights/abudhabiNdsmStamp.mjs';
// §PHASE1-HEIGHTS (North Star §6.1) — national real-height join. `heightSources.mjs` is side-effect-
// free on import (its CLI is behind an isMain guard); `resolveHeights` never throws.
// §HEIGHTS-FR-SOLID (L-12910, 2026-09-05) — `stampMnhFrHeightsOnGeojsonseq` + `MNH_FR_CITY_BBOXES` were
// AUTHORED on 2026-09-04 (a75be0fb) and imported by NOTHING until this line: France baked honest OSM
// defaults while its measured-height channel sat one import away (the L-12883 shape, second country).
// §SWISS-OSM-JOIN (L-12883, wired 2026-09-05) — the swisstopo nDSM stamp had the SAME shape one day later:
// `stampSwissHeightsOnGeojsonseq` + `SWISS_CITY_BBOXES` built 2026-09-04, imported by nothing until here.
// §OFFICIAL-FOOTPRINTS (L-12939, 2026-09-05, lane ES-CATASTRO-FOOTPRINTS) — a region may declare
// `footprintSource`, replacing the OSM footprints under the national register's own (ES Catastro
// today; FR BD TOPO next). WIRED HERE DIRECTLY, in the same commit that declares the `spain` row's
// footprintSource — never "built, imported by nothing" (the L-12883 / L-12910 rule).
import { assertFootprintConfig, ES_CATASTRO_FOOTPRINTS } from './footprints/footprintMerge.mjs';
import { resolveHeights, stampMdsHeightsOnGeojsonseq, stampDhmHeightsOnGeojsonseq, stampLod2NrwHeightsOnGeojsonseq, stampMnhFrHeightsOnGeojsonseq, stampSwissHeightsOnGeojsonseq, stampAuOpenHeightsOnGeojsonseq, MDS_CITY_BBOXES, MDS_PRIORITY_BBOXES, MDS_NATIONAL_BBOXES, MDS_TILE_LAT_DEG, MDS_TILE_LON_DEG, MDS_SWATHE_ROWS, MDS_SWEEP_CONCURRENCY, DHM_CITY_BBOXES, MNH_FR_CITY_BBOXES, SWISS_CITY_BBOXES, AU_OPEN_CITY_BBOXES } from './heightSources.mjs';
// §NDH-NO-OSM-JOIN (lane HEIGHTS-NORDICS, 2026-09-05) — Norway's keyless Kartverket NHM DOM − DTM stamp lives in its
// OWN module (the heights/nl3dbagStamp.mjs precedent: heightSources.mjs is a many-lane file) and is imported here
// DIRECTLY, in the same commit that declares the `norway` row's heightJoin — never "built, imported by nothing".
import { stampNoNdhHeightsOnGeojsonseq, NO_NDH_CITY_BBOXES } from './heights/noHeightsStamp.mjs';
// §EE-ETAK-OSM-JOIN + §BE-DHMV-OSM-JOIN (2026-09-05, lane HEIGHTS-EE-PL-PT-BE) — Estonia's ETAK korgus_m vector stamp and
// Belgium's DHMV II DSM − DTM raster stamp live in their OWN modules (the same many-lane-file rule) and are imported here
// DIRECTLY, in the commit that declares the `estonia` / `belgium` rows' heightJoin — never "built, imported by nothing".
import { stampEeEtakHeightsOnGeojsonseq, EE_CITY_BBOXES } from './heights/eeHeightsStamp.mjs';
import { stampBeDhmvHeightsOnGeojsonseq, BE_CITY_BBOXES } from './heights/beHeightsStamp.mjs';
// §US-OPEN-HEIGHTS-OSM-JOIN (2026-09-05, lane HEIGHTS-US) — the US per-metro stamp lives in its OWN module
// (not heightSources.mjs — §SHARED-FILE-COLLISION) and is imported here DIRECTLY, so it cannot sit built-and-
// orphaned the way the FR/CH/AU stamps each did for a day. Its pure half carries the working set.
// §USAS-NATIONAL-HEIGHTS — ONE US stamp. `stampUsOpenHeightsOnGeojsonseq` (heights/usOpenHeightsStamp.mjs)
// was imported here until 2026-09-06 and is NOT any more: every US row declares heightJoin:'usas', and the
// national stamp reads the SAME three city adapters through usOpenChannelForPoint. US_OPEN_CITY_BBOXES is
// still imported because it is the CITY-FIRST working set the resolver and stampBboxesFor's audit read.
import { stampUsasNationalHeightsOnGeojsonseq } from './heights/usasNationalStamp.mjs';
import { US_NATIONAL_BBOXES, US_OPEN_CITY_BBOXES, USAS_SWATHE_ROWS } from './heights/usOpenHeights.mjs';
// §CA-OPEN-HEIGHTS-OSM-JOIN (2026-09-06, lane MEXICO-CANADA) — Canada's FIRST measured-height channel.
// Same shape as the US import above and for the same reason (§SHARED-FILE-COLLISION): the network half
// in its own module, the working set + every decision in the pure half, both imported here DIRECTLY in
// the commit that declares the `britishcolumbia` / `ontario` rows' heightJoin — never built-and-orphaned.
import { stampCaOpenHeightsOnGeojsonseq } from './heights/caOpenHeightsStamp.mjs';
import { CA_OPEN_CITY_BBOXES } from './heights/caOpenHeights.mjs';
// §NL-3DBAG-OSM-JOIN (2026-09-05, lane HEIGHTS-NL) — the Dutch stamp had the same shape one more time: REGION_SOURCE
// `netherlands` named the join as "the named follow-up" since 2026-07-26. Its network half lives in its OWN module
// (heights/nl3dbagStamp.mjs — the shared-file rule) and its working set in the pure half, so both are imported directly.
import { stampNl3dbagHeightsOnGeojsonseq } from './heights/nl3dbagStamp.mjs';
import { NL_3DBAG_CITY_BBOXES } from './heights/nl3dbag.mjs';
// §EA-LIDAR-GB-OSM-JOIN (2026-09-05, lane HEIGHTS-GB-IE) — England's Environment Agency First-Return DSM − DTM
// stamp (the differencing is OURS — the EA publishes no nDSM) lives in its OWN module and is imported here
// DIRECTLY, in the same commit that declares the `greatbritain` row's heightJoin. heightSources.mjs had said
// "documented … the owed build is the England nDSM stamp" since the whole-country rows landed (5faa71ba).
import { stampEaLidarGbHeightsOnGeojsonseq } from './heights/ealidarGbStamp.mjs';
import { EA_LIDAR_GB_CITY_BBOXES } from './heights/ealidarGb.mjs';
// §DE-LOD2-LAENDER-OSM-JOIN (2026-09-05, lane HEIGHTS-DE-LAENDER) — the per-Land LoD2-DE ROUTER + stamp: nine
// Länder doors (NW BB HH SH TH RP MV BE ST) behind ONE stamp, in its OWN module (heights/deLod2LaenderStamp.mjs;
// router table + working set in the pure heights/deLod2Laender.mjs), imported here DIRECTLY in the same commit
// that arms the `germany` row — the koln-only lod2nrw join above stays as the NRW reference implementation.
import { stampDeLod2LaenderHeightsOnGeojsonseq } from './heights/deLod2LaenderStamp.mjs';
import { DE_LOD2_CITY_BBOXES } from './heights/deLod2Laender.mjs';
// §PLATEAU-JP-OSM-JOIN (2026-09-06, lane JAPAN-FULL) — Japan's keyless MLIT Project PLATEAU LoD1 stamp: per-building
// `bldg:measuredHeight` read out of the SERVED 3D-Tiles b3dm batch tables by RANGE GET (no CityGML zip, no key), joined
// to bake's OWN OSM footprints by centroid. It lives in its OWN module (the heights/nl3dbagStamp.mjs precedent —
// heightSources.mjs is a many-lane file) and is imported here DIRECTLY, in the same commit that declares the `japan`
// row's heightJoin — never "built, imported by nothing" (L-12883 / L-12910).
import { stampJpPlateauHeightsOnGeojsonseq } from './heights/jpPlateauStamp.mjs';
import { JP_CITY_BBOXES } from './heights/jpPlateau.mjs';
// §FR-BDTOPO-FOOTPRINTS (L-12940) — the FOOTPRINT half of the French national context. It is a
// DIFFERENT KIND of source from every import above: those stamp a real height onto bake's OWN OSM
// footprints, this one REPLACES the footprints. The founder's two French complaints split exactly
// along that line — Sete "not true height" is a stamp problem (mnh_fr, already wired), and
// Jouy-en-Josas "not true size / not true shape" is a GEOMETRY problem no stamp can reach (that
// parcel is, additionally, inside no MNH stamp bbox at all). Probes, the WFS-vs-GeoParquet split and
// the LiDAR cross-check of `hauteur` live in the module header; __tests__/frBdtopo.spec.ts pins the
// decisions and __tests__/frBdtopoWiring.spec.ts pins this wiring.
import { FR_BDTOPO, FR_BDTOPO_CITY_BBOXES, footprintsModeFromArgv, mergeReplaceInBbox, writeBdtopoWorkingSet } from './footprints/frBdtopo.mjs';
// §EU-REGISTERS (lane EU-REG-WEST 2026-09-06; WIRED by lane EU-REGISTERS-WIRE the same day) — the
// Dutch, Belgian and Irish national building registers, as three more `footprintSource` rows. The
// module landed with its own commit message saying, in as many words, that it was "imported by
// NOTHING" — the L-12976 shape. This import and the three FOOTPRINT_SOURCES rows below are the
// close: euRegisters.mjs → FOOTPRINT_SOURCES → the `netherlands`/`belgium`/`ireland` region rows →
// applyNationalFootprints → mergeReplaceInBbox → the geojsonseq tippecanoe tiles. Pinned end to end
// by __tests__/euRegistersWiring.spec.ts, which SPAWNS the preflight rather than reading the text.
import { EU_FOOTPRINT_SOURCE_KEYS, IE_TAILTE_PRIORITY_BBOXES, euRegisterFootprintSource } from './footprints/euRegisters.mjs';
// §SEA-BAKE-POLYGONS (lane SEA-BAKE, 2026-09-05) — the sea as closed POLYGONS from the osmdata water-polygons
// product (osmcoastline output of the planet coastline, ODbL), clipped per region in ONE streaming pass.
// seaPolygons.mjs's header carries the why: coastline LINES in the water layer reach the client as tile-clipped
// fragments the §SEA-LEFT-HAND-WALK must refuse (L-12921 Sydney · L-12909 Marseille · L-807 Barcelona · Dubai),
// so the sea was ALWAYS the live Overpass supplement on a baked coastal city. Polygons survive clipping closed.
import { SEA_SOURCE, parseBboxCsv, extractSeaShapefile, clipWaterPolygonsToRegions } from './seaPolygons.mjs';
// §VEG-REAL-CANOPY-BAKE (L-12935, lane VEG-REAL-CANOPY-BAKE, 2026-09-05) — REAL canopy from MEASURED
// tree-cover rasters (Copernicus HRL TCD 2018 in Europe, NLCD TCC in the USA, Hansen GFC everywhere
// else). OPT-IN: `--layer canopy` only, so the default bake is byte-for-byte unchanged. canopy.mjs's
// header carries the probes, the honesty rules and the scope refusal.
import { bakeCanopyLayerForRegions, CANOPY_THRESHOLD_PCT, CANOPY_CELL_M } from './canopy.mjs';
import { getHeapStatistics } from 'node:v8';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, 'out');

// ── Config ──────────────────────────────────────────────────────────────────
// §BAKE-MULTI-REGION (L-607, 2026-07-24) — ⚠ THIS USED TO BE A SINGLE `REGION` (Barcelona only),
// which is WHY every non-Barcelona jurisdiction city rendered "No surrounding building data for
// this area" on the 3D Site: the client's PRIMARY context source is the baked PMTiles (L-513b/
// L-578, Overpass demoted to failure-fallback), and R2 only ever held Barcelona tiles.
//
// THE FIX, kept deliberately client-invisible: every region below is clipped from its Geofabrik
// country/comunidad extract, and ALL regions' per-layer GeoJSONSeq are fed into ONE `tippecanoe`
// call → ONE merged `<layer>.pmtiles`. The output filenames are UNCHANGED
// (`buildings/roads/water/parks.pmtiles`), so the flat `s3://pryzm-assets/tiles/…` URL and the
// client reader (`contextTiles.ts`) need NO change — PMTiles indexes by tile coordinate, so a
// single archive covering many disjoint city bboxes "just works" and a city with no baked tiles is
// simply absent from the index (the honesty case L-607 layer 2 tracks separately).
//
// TO ADD A CITY: append one entry. `pbfUrl` = the smallest Geofabrik extract that CONTAINS the
// city (a comunidad/country file, not the whole planet); `bbox` = a generous city clip
// (minlon,minlat,maxlon,maxlat, osmium -b order). Two cities in the SAME extract reuse the same
// download (keyed by `pbf` path). ⚠ CI disk/time: each extract is downloaded then clipped small;
// ~3 Spanish comunidades fit the runner's envelope. If this list grows past a handful of large
// countries, switch the workflow to bake per-region and `aws s3 sync` incrementally.
// ⚠ §BAKE-BY-REGION — this is the FULL list; the run's actual set is `REGIONS`, computed from
// `--region` after the args block below. Read `REGIONS`, never `ALL_REGIONS`, anywhere that asks
// "what is this run baking?" — the two differ exactly when the operator scoped the run.
const ALL_REGIONS = [
  {
    // L-607 — WHOLE SPAIN (national), founder-chosen 2026-07-24. Geofabrik's Spain extract is one
    // ~1.3 GB pbf; tiled whole it is ~1–2.5 GB of PMTiles across the four layers — comfortably under
    // R2's 10 GB free storage, and ONE country fits a single CI run (the cost cliff was whole-
    // CONTINENT, not one country). This national bbox covers EVERY Spanish jurisdiction — Barcelona,
    // Madrid, Córdoba — and anywhere a user drops a site on the mainland + Balearics, so a Spanish
    // site never shows "no surrounding building data" again. ⚠ Canary Islands (lon ~-18) fall
    // OUTSIDE this bbox — add a `canarias` entry from the same extract if a demo needs them.
    name: 'spain',
    pbfUrl: 'https://download.geofabrik.de/europe/spain-latest.osm.pbf',
    pbf: resolve(OUT, 'spain-latest.osm.pbf'),
    bbox: '-9.55,35.90,4.60,43.90',
    clipped: resolve(OUT, 'clip-spain.osm.pbf'),
    // §MDS-OSM-JOIN (L-6xx) — whole-country REAL heights. `resolveHeights('spain')` returns
    // `documented` (Catastro's per-tile WFS can't scan a nation), so the flat 9 m OSM guess would ship.
    // Instead stamp the keyless CNIG MDS Edificación raster (mdsn_e025) onto bake's OWN OSM footprints
    // (no Catastro, no double-draw, tiles only where footprints exist). See stampMdsHeightsOnGeojsonseq.
    heightJoin: 'mds',
    // §ES-CATASTRO-FOOTPRINTS (L-12939, 2026-09-05) — the FOOTPRINTS themselves now come from the
    // Dirección General del Catastro's INSPIRE Buildings feed when the run passes `--footprints
    // official`. The comment two lines up says "no Catastro" — that was true of the HEIGHT join and
    // still is: Catastro publishes storey COUNTS, not metres, so the MDS raster keeps supplying
    // Spain's measured heights. The two compose. The merge runs FIRST, so the MDS stamp lands on
    // CATASTRO footprints, and a 2020 house OSM never mapped can finally receive a measured height.
    // Working set = FOOTPRINT_SOURCES.es_catastro.defaultBboxes() = MDS_CITY_BBOXES.
    // ⚠ CORRECTED 2026-09-06 (L-12946): this used to add "so footprints and heights cover the SAME
    // ground". They no longer do, DELIBERATELY and in the SAFE direction — the MDS height sweep now
    // retains the WHOLE country (MDS_NATIONAL_BBOXES) while the Catastro footprint pull stays on the
    // nine metros, because a Catastro municipality costs ~250 s of GML parsing (§FOOTPRINT-BUDGET,
    // L-12939) and the whole feed is ~17 h. So heights are a SUPERSET of the official footprints,
    // never a subset: no city can get Catastro footprints with no measured heights.
    // (§MDS-BBOX-MUST-COVER-THE-REGION still holds and is pinned.) Absent `--footprints official`, this row bakes
    // EXACTLY as it did before — byte-identical, pinned by esCatastro.spec.ts.
    footprintSource: 'es_catastro',
    // §FOOTPRINT-SOURCE (L-12940) — the ONLY honest merge for a partial national set, and the same
    // one `france` uses: inside the covered bboxes Catastro wins outright and the OSM footprints
    // are dropped; outside them the OSM clip passes through byte for byte. A plain `replace` would
    // delete every Spanish municipality outside the working set — including all of the Basque
    // Country and Navarra, which Catastro does not publish AT ALL.
    footprintMerge: 'replace-in-bbox',
  },
  // §BAKE-DENMARK (L-6xx, 2026-07-26) — WHOLE DENMARK (national), mirrors `spain`. Geofabrik's Denmark
  // extract is one national pbf; the national bbox (incl. Bornholm at ~lon 15.2) covers EVERY Danish
  // jurisdiction so a DK site never shows "no surrounding building data". Buildings/roads/water/parks
  // come from OSM; REAL per-building heights come from the DHM nDSM OSM-footprint JOIN (heightJoin:
  // 'dhm', apikey-gated — see stampDhmHeightsOnGeojsonseq + the note there on why the OSM join, not a
  // higher-maxTiles tile grid, is the whole-country pattern). Without DATAFORDELER_API_KEY the join is
  // `blocked` and footprints keep the honest OSM default — never a fabricated height.
  {
    name: 'denmark',
    pbfUrl: 'https://download.geofabrik.de/europe/denmark-latest.osm.pbf',
    pbf: resolve(OUT, 'denmark-latest.osm.pbf'),
    bbox: '7.70,54.40,15.30,57.90',
    clipped: resolve(OUT, 'clip-denmark.osm.pbf'),
    heightJoin: 'dhm',
  },
  // ── L-607 multi-city, all 13 jurisdictions (founder-chosen 2026-07-24) ───────────────────────
  // ⚠ Each `pbfUrl` is the SMALLEST Geofabrik extract that contains the city; `bbox` is a generous
  // city-centre clip. Slugs + bboxes are best-effort and MUST be sanity-checked on the first CI
  // bake — the workflow's "Assert the tiles are real" step fails a layer that came back empty
  // (wrong slug / wrong bbox), which is exactly where a typo surfaces loudly instead of silently
  // shipping "no context". Cities in the same extract reuse one download (grouped by `pbf` path).
  // Portugal / Denmark / Belgium / Netherlands / Norway / Sweden / Finland have no Geofabrik
  // sub-regions, so the city clips come straight from the country extract.
  // ⚠ §BAKE-EUROPE-NATIONAL DEDUP (2026-09-02) — lisbon/porto/rome/milan/berlin/munich/london/
  // brussels/oslo/stockholm/helsinki/zurich/geneva/bern city rows were REMOVED here, exactly as
  // Copenhagen's was on 2026-07-26 (see that note below): each is fully contained in its new
  // whole-country region (§BAKE-EUROPE-NATIONAL block below), so keeping it would DOUBLE-BAKE the
  // city into the merged buildings.pmtiles. LOSSLESS by measurement, not assumption: every removed
  // row either had no REGION_SOURCE height mapping or mapped to a documented/blocked/no-source
  // entry (resolveHeights → keeps OSM), so no measured/live height is lost by the removal.
  // ⚠ THE THREE KEPT EXCEPTIONS — paris, lyon (bdtopo impl:'live' — resolveHeights fetches REAL
  // BD TOPO `hauteur` for those bboxes today) and koln (heightJoin:'lod2nrw' — the ONLY German
  // measured-height join; stampLod2NrwHeightsOnGeojsonseq refuses a national bbox at its own
  // maxSpanDeg=0.6° guard, so the join CANNOT ride the germany row yet). Removing them would
  // REGRESS real heights to 9 m defaults; keeping them double-bakes ONLY those three city bboxes
  // (identical OSM footprints carry the same §BAKE-UNIQUE-ID type_id in both regions, and the
  // client near-cap thins twins). Named follow-ups fold them in: the FR MNH national stamp and the
  // DE per-Land LoD2 router (context-everywhere-assessment.md §6) — when either lands, fold its
  // city row into the national row exactly like Copenhagen.
  { name: 'paris',      pbfUrl: 'https://download.geofabrik.de/europe/france/ile-de-france-latest.osm.pbf',           pbf: resolve(OUT, 'ile-de-france-latest.osm.pbf'),          bbox: '2.22,48.80,2.47,48.91',    clipped: resolve(OUT, 'clip-paris.osm.pbf') },
  { name: 'lyon',       pbfUrl: 'https://download.geofabrik.de/europe/france/rhone-alpes-latest.osm.pbf',             pbf: resolve(OUT, 'rhone-alpes-latest.osm.pbf'),            bbox: '4.78,45.70,4.92,45.80',    clipped: resolve(OUT, 'clip-lyon.osm.pbf') },
  // §BAKE-KOLN (2026-07-31) — ⚠ THE GAP THIS CLOSES. Köln already had a live cadastral parcel provider
  // (`alkis-nrw`, keyless, behind `isInNRW`), a live measured HEIGHT source (`fetchLod2DeNrw`,
  // impl:'live'), and a live TERRAIN region (terrain.mjs `koln` on the Geobasis NRW DGM1 WCS) — but NO
  // bake REGION, so it had NO baked context tiles at all. A Köln parcel therefore resolved, and then
  // rendered into an empty world ("No surrounding building data for this area" — the exact L-607 defect).
  //
  // bbox is BYTE-IDENTICAL to terrain.mjs's `koln` row (6.85,50.88,7.02,50.99) — deliberately, so the
  // baked context and the baked terrain cover exactly the same ground. A context extent wider than the
  // terrain extent is the "buildings floating off the edge of the DEM" defect; narrower is a visible
  // context cliff inside real terrain. One number, one place to change it.
  //
  // §LOD2-NRW-OSM-JOIN — Köln is the FIRST German region with REAL measured heights: `heightJoin:'lod2nrw'`
  // stamps LoD2-DE·NRW `bldg:measuredHeight` (keyless, DL-DE Zero 2.0, ~1 m accuracy) onto these OSM
  // footprints, exactly as `spain` does with MDS and `denmark` with DHM. Live-measured 2026-07-31: this
  // bbox is 182 NRW Kacheln / 3.90 GB, all present in the NRW index, ~18 MB/s → ~4 min of streaming.
  // Berlin/Munich do NOT get this — LoD2-DE is per-LAND and they are different Länder (see REGION_SOURCE).
  // ⚠ §BAKE-EUROPE-NATIONAL kept-exception (2026-09-02): koln is now CONTAINED in the `germany`
  // national row below, so its bbox is double-baked — deliberately, because deleting this row would
  // regress the only German measured heights (118,603/141,271 footprints stamped, run 30706761446)
  // and the lod2nrw join cannot ride the national row (its own maxSpanDeg=0.6° guard refuses a
  // 9.2°×7.9° bbox as `documented`, which the §MEASURED-HEIGHT-GATE counts as FAILED). Fold this row
  // into `germany` when the per-Land LoD2 router lands (context-everywhere-assessment.md §6).
  { name: 'koln',       pbfUrl: 'https://download.geofabrik.de/europe/germany/nordrhein-westfalen-latest.osm.pbf',    pbf: resolve(OUT, 'germany-nordrhein-westfalen-latest.osm.pbf'), bbox: '6.85,50.88,7.02,50.99', clipped: resolve(OUT, 'clip-koln.osm.pbf'), heightJoin: 'lod2nrw' },
  // ⚠ Copenhagen's own city region was REMOVED 2026-07-26 — the whole-`denmark` region above
  // (national bbox, same denmark-latest.osm.pbf) fully contains it, so a separate Copenhagen clip
  // would DOUBLE-BAKE the city into the merged buildings.pmtiles. Copenhagen now rides the national
  // region (OSM footprints + DHM nDSM heights via the heightJoin, apikey-gated).
  // §NL-NATIONWIDE (2026-07-26) — WHOLE NETHERLANDS (national), mirroring the `spain` whole-country
  // region. Geofabrik's Netherlands extract is one ~1.6 GB pbf; tiled whole it is well under R2's
  // 10 GB free storage, and ONE country fits a single CI run. This national bbox covers EVERY NL
  // jurisdiction — Amsterdam, Rotterdam, Utrecht, Groningen, and any rural site — so an NL site never
  // shows "no surrounding building data". (Replaces the Amsterdam-only clip.)
  // §NL-3DBAG-OSM-JOIN (2026-09-05, lane HEIGHTS-NL) — `heightJoin:'3dbag'` stamps 3D BAG (BAG × AHN LiDAR,
  // CC BY 4.0, keyless WFS BAG3D:lod12) measured heights onto the OSM footprints inside NL_3DBAG_CITY_BBOXES
  // (amsterdam · rotterdam · utrecht · thehague · eindhoven · groningen — the six "ready per-city bboxes" the
  // REGION_SOURCE note carried as free text); the rest of the country streams through with honest OSM tags.
  // Vectors, not a raster: height = (b3_h_70p ?? b3_h_50p) − b3_h_maaiveld per pand, area-weighted P90 over
  // the parts a footprint owns (heights/nl3dbag.mjs, live-pinned by nl3dbag.spec.ts). No NL city row exists
  // (the Amsterdam-only clip was folded into this row on 2026-07-26), so — unlike france's paris/lyon —
  // nothing double-bakes. Local proof 2026-09-05: 40/41 footprints measured in the Centraal cell, 0 errors.
  // §EU-REGISTERS — under `--footprints official` the Kadaster's own BAG `pand` outlines replace the
  // OSM ones (PDOK WFS 2.0, CC0 1.0, national `hits` 11,429,771 measured 2026-09-06). BAG publishes
  // NO height and NO storeys — the fields are identificatie/bouwjaar/status/gebruiksdoel/oppervlakte
  // — so the 3DBAG measured-height join above is UNCHANGED and still supplies every Dutch metre; the
  // two compose exactly as Catastro composes with the CNIG MDS raster. Absent the flag this row bakes
  // byte-identically. The village Bourtange returns 249 panden, which is the whole point.
  { name: 'netherlands', pbfUrl: 'https://download.geofabrik.de/europe/netherlands-latest.osm.pbf',                   pbf: resolve(OUT, 'netherlands-latest.osm.pbf'),            bbox: '3.30,50.75,7.30,53.70',    clipped: resolve(OUT, 'clip-netherlands.osm.pbf'), heightJoin: '3dbag', footprintSource: 'nl_bag', footprintMerge: 'replace-in-bbox' },
  // ─────────────────────────────────────────────────────────────────────────
  // §BAKE-EUROPE-NATIONAL (2026-09-02, lane REGIONS) — 25 whole-country rows, the founder's
  // "NOT ONLY BIG CITIES — EVERYWHERE POSSIBLE" directive executed at the row layer. Every row
  // follows the spain/denmark/netherlands whole-country shape and cites its verdict row in
  // audit/europe-site-intel/2026-08-31/impl/context-everywhere-assessment.md §2 ("ASSESS <CC>").
  //
  // HONESTY RULES APPLIED PER ROW (assessment + §MEASURED-HEIGHT-GATE):
  //   • NO row below declares a `heightJoin` — no wired stamp exists for any of these countries
  //     yet (the dispatch supports mds/dhm/lod2nrw only), and a declared join that produces
  //     nothing is a NON-ZERO EXIT by design. This is the `netherlands` precedent: a national row
  //     with honest OSM `assumed` defaults is legitimate and already shipped. Each row's height
  //     CLASS + the owed build is recorded in heightSources.mjs REGION_SOURCE (same country name),
  //     so resolveHeights() logs the true per-country reason at bake time instead of a generic gap.
  //   • buildingsSource stays OSM everywhere — the Overture flip needs the per-country
  //     OSM-vs-Overture count probe first (assessment §9; Europe default stays OSM per
  //     §BAKE-OVERTURE's own reasoning).
  //   • SIZE: scope pbf ≈ 30 GB → projected ~24–57 GB of PMTiles vs the 10 GB R2 free tier the
  //     spain note above cites — the budget decision + the per-region-bake/incremental-sync
  //     workflow switch (assessment §5) are PREREQUISITES for baking/publishing the full set.
  //     ⛔ Do NOT dispatch an UNSCOPED bake of this table: sequence `--region` runs per country.
  // Baltics — ASSESS EE → ⭐ WIRED 2026-09-05 (lane HEIGHTS-EE-PL-PT-BE, §EE-ETAK-OSM-JOIN): `heightJoin:'ee_etak'`
  // stamps the KEYLESS ETAK e_401_hoone_ka `korgus_m` (integer metres, ETAK_juhend2016 §3.5.3: height model or
  // stereo roof-edge — measured, never storeys × 3) onto these OSM footprints inside EE_CITY_BBOXES (tallinn =
  // the terrain.mjs row, tartu, pärnu, narva); dispatched via NATIONAL_STAMP_TABLE. The door is the Environment
  // Agency mirror gsavalik.envir.ee/geoserver/etak/ows (Maa-amet's own WFS/WCS hosts 404/302 — probed); it caps
  // EVERY request at 5,000 objects, so the stamp quarters a truncated cell. Local proof 2026-09-05: Tallinn Old
  // Town 594/607 footprints stamped, 594/594 equal to the building's own korgus_m. The Eesti 3D LoD2 CityGML the
  // August note named is a bulk order form, not a bbox service — ETAK is the same survey's per-building height.
  // ASSESS LT (mass-only: per-object floors is a PRICED RC product → X3-refused);
  // ASSESS LV (mass-only: VZD footprint attrs UNVERIFIED — UNKNOWN stays UNKNOWN, not zero).
  { name: 'estonia',    pbfUrl: 'https://download.geofabrik.de/europe/estonia-latest.osm.pbf',                        pbf: resolve(OUT, 'estonia-latest.osm.pbf'),                bbox: '21.60,57.50,28.30,59.80',  clipped: resolve(OUT, 'clip-estonia.osm.pbf'), heightJoin: 'ee_etak' },
  { name: 'lithuania',  pbfUrl: 'https://download.geofabrik.de/europe/lithuania-latest.osm.pbf',                      pbf: resolve(OUT, 'lithuania-latest.osm.pbf'),              bbox: '20.85,53.85,26.90,56.50',  clipped: resolve(OUT, 'clip-lithuania.osm.pbf') },
  { name: 'latvia',     pbfUrl: 'https://download.geofabrik.de/europe/latvia-latest.osm.pbf',                         pbf: resolve(OUT, 'latvia-latest.osm.pbf'),                 bbox: '20.90,55.60,28.30,58.10',  clipped: resolve(OUT, 'clip-latvia.osm.pbf') },
  // ASSESS PL — NATIONAL-DERIVED-HEIGHTS: BDOT10k OT_BUBD_A storey attribute (floors × 3.2 m,
  // DERIVED never measured) — gated on ONE owed DuckDB fill read over the probed national parquet;
  // until that probe lands this row bakes mass-only. 2.09 GB pbf (measured).
  { name: 'poland',     pbfUrl: 'https://download.geofabrik.de/europe/poland-latest.osm.pbf',                         pbf: resolve(OUT, 'poland-latest.osm.pbf'),                 bbox: '14.05,48.95,24.20,55.00',  clipped: resolve(OUT, 'clip-poland.osm.pbf') },
  // ASSESS LU — NATIONAL-NOW (mass-only): the cheapest whole-country row in Europe (47 MB pbf,
  // measured) — the REGIONS-lane calibration pick #1.
  { name: 'luxembourg', pbfUrl: 'https://download.geofabrik.de/europe/luxembourg-latest.osm.pbf',                     pbf: resolve(OUT, 'luxembourg-latest.osm.pbf'),             bbox: '5.70,49.40,6.60,50.20',    clipped: resolve(OUT, 'clip-luxembourg.osm.pbf') },
  // Nordics — ASSESS SE (mass-only; measured heights = a FREE Lantmäteriet download credential +
  // an nDSM stamp build — the context gate is the DK DATAFORDELER shape, NOT the NGP plan gate);
  // ASSESS FI (mass-only; FI Buildings-3D LoD2 is PARTIAL — status-map read owed before any join);
  // ASSESS NO → ⭐ WIRED 2026-09-05 (lane HEIGHTS-NORDICS, §NDH-NO-OSM-JOIN): `heightJoin:'ndh_no'` stamps
  // the KEYLESS Kartverket NHM nDSM (DOM − DTM, both 1 m WCS 1.0.0 on wcs.geonorge.no — the DTM one IS the
  // terrain.mjs `no` adapter) onto these OSM footprints inside NO_NDH_CITY_BBOXES (oslo = the terrain.mjs
  // row, bergen, trondheim); dispatched via NATIONAL_STAMP_TABLE. Probed 2026-09-05: DOM − DTM p90 24.2 m
  // Oslo · 21.2 m Bergen · 18.5 m Trondheim, 0 nodata cells. FKB surveyed height stays X3-refused;
  // Svalbard is outside this bbox on purpose. SE/FI stay mass-only — probed 2026-09-05 (heightSources.mjs
  // lidar_se / buildings3d_fi): SE's only DSM is a laz/copc point cloud behind a 401 host; FI NLS is 401
  // everywhere without MML_API_KEY and Helsinki's open register carries floors only (derived, not measured).
  { name: 'sweden',     pbfUrl: 'https://download.geofabrik.de/europe/sweden-latest.osm.pbf',                         pbf: resolve(OUT, 'sweden-latest.osm.pbf'),                 bbox: '10.90,55.20,24.20,69.10',  clipped: resolve(OUT, 'clip-sweden.osm.pbf') },
  { name: 'finland',    pbfUrl: 'https://download.geofabrik.de/europe/finland-latest.osm.pbf',                        pbf: resolve(OUT, 'finland-latest.osm.pbf'),                bbox: '19.00,59.70,31.60,70.10',  clipped: resolve(OUT, 'clip-finland.osm.pbf') },
  { name: 'norway',     pbfUrl: 'https://download.geofabrik.de/europe/norway-latest.osm.pbf',                         pbf: resolve(OUT, 'norway-latest.osm.pbf'),                 bbox: '4.50,57.90,31.20,71.20',   clipped: resolve(OUT, 'clip-norway.osm.pbf'), heightJoin: 'ndh_no' },
  // ASSESS DE — NATIONAL-NOW; heights staged per-Land. ⚠ 4.83 GB pbf (measured) —
  // Germany alone ≈ the whole R2 free tier; the §5 budget decision binds before its publish.
  // ⭐ §DE-LOD2-LAENDER-OSM-JOIN (2026-09-05, lane HEIGHTS-DE-LAENDER): `heightJoin:'lod2de'` dispatches the
  // per-Land LoD2-DE ROUTER (NATIONAL_STAMP_TABLE → heights/deLod2LaenderStamp.mjs). Working set =
  // DE_LOD2_CITY_BBOXES, ONE city per WIRED Land: berlin (BE, dl-de-zero) · hamburg (HH) · potsdam (BB) ·
  // kiel (SH) · erfurt (TH) · mainz (RP) · schwerin (MV) · magdeburg (ST, WFS) · koln (NW) · hannover (NI,
  // S3 prefix-probed — the LGLN index's own hrefs are stale → NoSuchKey, the bucket is listable). Every door is
  // KEYLESS and was probed the same day (heights/deLod2Laender.mjs header carries URL/HTTP/bytes/licence per
  // Land); SN (geocloud 503), HE (login-gated) are BLOCKED, BW/HB/SL UNPROBED, BY probed OPEN but UNARMED
  // (munich stays blocked per REGION_SOURCE — a founder decision). Local proof on real OSM footprints:
  // potsdam 1,832/2,012 · hamburg 636/729 · berlin 376/424 · hannover 658/722 (R2 buildings.pmtiles footprints).
  // ⚠ koln stays a separate city row (kept-exception above) → its bbox double-bakes (now with the SAME
  // NRW door twice) until the orchestrator folds it into `germany` via allow_region_removal.
  { name: 'germany',    pbfUrl: 'https://download.geofabrik.de/europe/germany-latest.osm.pbf',                        pbf: resolve(OUT, 'germany-latest.osm.pbf'),                bbox: '5.85,47.25,15.05,55.10',   clipped: resolve(OUT, 'clip-germany.osm.pbf'), heightJoin: 'lod2de' },
  // ASSESS FR — NATIONAL-NOW; the national height channel is the MNH LiDAR-HD PRE-COMPUTED nDSM
  // (⛔ never rebuild the differencing — E5 §G.1 A8). 5.07 GB pbf (measured — largest in scope; §5
  // budget decision binds). Metropolitan France + Corsica only — overseas départements fall outside
  // this bbox (mirrors the Canarias note on `spain`).
  // §MNH-FR-OSM-JOIN (L-12910, 2026-09-05) — `heightJoin:'mnh_fr'` stamps IGN LiDAR HD MNH heights
  // onto these OSM footprints exactly as `spain` does with MDS: working set + priority areas =
  // MNH_FR_CITY_BBOXES (heights/mnhFr.mjs; §HEIGHT-STAMP-BUDGET), everything outside them streams
  // through with its honest OSM tags. The stamp pre-checks IGN's dalle index per area and SKIPS an
  // unpublished one by name (lille = 0 dalles on 2026-09-05) — a missing dalle is ABSENT, never 0 m.
  // Founder 2026-09-05: French context rendered as translucent ghosts because the render rule
  // (§CTX-HEIGHT-FIDELITY-RENDER) is honest and the DATA was missing — this join is the data.
  // ⚠ paris/lyon stay separate city rows (kept-exception above): folding them in deletes two LIVE
  // regions from tileset-manifest.json, which the merge's no-loss gate refuses unless the publish
  // passes `allow_region_removal: paris,lyon` — an orchestrator decision, not a lane's. Until then
  // those two bboxes double-bake (identical type_ids; client near-cap thins twins).
  { name: 'france',     pbfUrl: 'https://download.geofabrik.de/europe/france-latest.osm.pbf',                         pbf: resolve(OUT, 'france-latest.osm.pbf'),                 bbox: '-5.15,41.30,9.60,51.10',   clipped: resolve(OUT, 'clip-france.osm.pbf'), heightJoin: 'mnh_fr',
    // §FR-BDTOPO-FOOTPRINTS (L-12940) — under `--footprints official`, IGN BD TOPO's own
    // photogrammetric outlines replace the OSM ones inside the working set below, carrying IGN's
    // measured `hauteur` with them. Absent that flag this row bakes EXACTLY as it did before.
    footprintSource: 'fr_bdtopo',
    footprintMerge: 'replace-in-bbox',
    // §FOOTPRINT-BUDGET — declared on the ROW, not derived, because a whole-France pull is 49.9 M
    // buildings / ~9,990 WFS pages / ~73 GB and cannot finish in a 180-minute job. This list is the
    // 13 MNH_FR_CITY_BBOXES cities (so footprints and heights cover the SAME ground) PLUS
    // jouy-en-josas, the founder's site, which is in no height working set at all.
    footprintBboxes: FR_BDTOPO_CITY_BBOXES.map((c) => c.bbox) },
  // ASSESS IT — NATIONAL-NOW (mass-only): no national open building-height product exists
  // (Piedmont-only regional layer; EUBUCCO/GBA excluded as authoritative per the E5 verdicts).
  // Replaces the rome+milan city rows (Copenhagen dedup). Incl. Sicily + Sardinia.
  { name: 'italy',      pbfUrl: 'https://download.geofabrik.de/europe/italy-latest.osm.pbf',                         pbf: resolve(OUT, 'italy-latest.osm.pbf'),                  bbox: '6.60,35.40,18.60,47.10',   clipped: resolve(OUT, 'clip-italy.osm.pbf') },
  // ASSESS GB — NATIONAL-NOW (mass-only) on OSM/ODbL alone — probe-verified: the keyless OS
  // OpenData catalogue holds NO building-height and no detailed-footprint product, so OS licensing
  // stays X3-refused and does NOT touch this row. EA LiDAR (OGL v3) nDSM = the owed stamp,
  // ENGLAND-ONLY heights when it lands. Replaces the london city row. ⚠ this extract carries NO
  // Northern Ireland data — the island of Ireland (incl. NI) rides the `ireland` row below, so the
  // bbox overlap bakes nothing twice.
  // ⭐ §EA-LIDAR-GB-OSM-JOIN (2026-09-05, lane HEIGHTS-GB-IE): `heightJoin:'ealidar_gb'` stamps EA LiDAR nDSM
  // (First-Return DSM 1 m − DTM 1 m, OGL v3, keyless — differenced by PRYZM) onto the OSM footprints inside
  // EA_LIDAR_GB_CITY_BBOXES (heights/ealidarGb.mjs: london / manchester / birmingham / leeds / bristol — ENGLAND
  // only; Edinburgh and Cardiff are EA_LIDAR_GB_ASSESSED no-source with the probe). Everything else streams through
  // with its OSM tags. Local proof (Trafalgar Square, 652 real OSM footprints): 594/606 retained measured, 4.6 s.
  { name: 'greatbritain', pbfUrl: 'https://download.geofabrik.de/europe/great-britain-latest.osm.pbf',                pbf: resolve(OUT, 'great-britain-latest.osm.pbf'),          bbox: '-8.20,49.90,1.80,60.90',   clipped: resolve(OUT, 'clip-greatbritain.osm.pbf'), heightJoin: 'ealidar_gb' },
  // ASSESS IE — NATIONAL-NOW (mass-only, honest-low OSM density): no cadastre by design; OSi
  // Prime2 commercial → X3-refused. The extract covers the WHOLE island incl. NI (see GB note).
  // §EU-REGISTERS — the ASSESS IE verdict above says "no cadastre by design; OSi Prime2 commercial →
  // X3-refused", and that is now HALF WRONG and corrected here rather than left to rot: Tailte
  // Éireann publishes the Prime2 Buildings layer as a PUBLIC ArcGIS Feature Service under CC BY 4.0
  // (item cd14d445bb6d4af586f4edcfa01da895, `access:"public"`, `where=1=1&returnCountOnly=true` →
  // 3,785,414, measured 2026-09-06). It is FOOTPRINTS ONLY — the field list is GUID · OBJECTID ·
  // Shape__Area · Shape__Length, no height and no storeys — so this row still declares NO heightJoin
  // and its buildings ride the honest `assumed` default. Shape first: that is the founder's
  // complaint. ⚠ The extract covers the WHOLE island; the layer holds the Republic only, so every
  // Northern Irish cell answers 200-with-zero and KEEPS its OSM (§COVERED-IS-PARSED).
  { name: 'ireland',    pbfUrl: 'https://download.geofabrik.de/europe/ireland-and-northern-ireland-latest.osm.pbf',   pbf: resolve(OUT, 'ireland-and-northern-ireland-latest.osm.pbf'), bbox: '-10.70,51.30,-5.30,55.50', clipped: resolve(OUT, 'clip-ireland.osm.pbf'), footprintSource: 'ie_tailte', footprintMerge: 'replace-in-bbox' },
  // ASSESS CH — NATIONAL-NOW, the cheapest measured-height national add in Europe (wire-not-build):
  // `stampSwissHeightsOnGeojsonseq` (heightSources.mjs, keyless swissSURFACE3D−swissALTI3D nDSM) is
  // ALREADY AUTHORED but NOT imported by this file — wiring it (import + dispatch branch + CH city
  // stamp list + the LV95 reproject leg) is the owed ~0.5-day build; until then this row bakes
  // honest OSM defaults and declares NO join (a declared join that produces nothing is a non-zero
  // exit). Replaces the zurich/geneva/bern city rows (Copenhagen dedup; lossless — their
  // REGION_SOURCE mapping is impl:'documented', no live height was fetched for them).
  // §SWISS-OSM-JOIN (L-12883, 2026-09-05) — `heightJoin:'swiss'` stamps swisstopo swissSURFACE3D nDSM heights
  // (STAC → LV95 COG, the pixel is height above ground) onto these OSM footprints exactly as `spain` does
  // with MDS and `france` with MNH: working set = SWISS_CITY_BBOXES (heights/swissNdsm.mjs — zurich / geneva /
  // bern, EQUAL to the terrain.mjs `ch` rows), everything outside streams through with its honest OSM tags.
  // No city rows exist for CH, so nothing double-bakes. Anything but a measured `ok` keeps the OSM default.
  { name: 'switzerland', pbfUrl: 'https://download.geofabrik.de/europe/switzerland-latest.osm.pbf',                   pbf: resolve(OUT, 'switzerland-latest.osm.pbf'),            bbox: '5.90,45.80,10.50,47.85',   clipped: resolve(OUT, 'clip-switzerland.osm.pbf'), heightJoin: 'swiss' },
  // ASSESS AT → ⭐ WIRED 2026-09-05 (lane HEIGHTS-AT-CZ-SI, §BEV-ALS-OSM-JOIN): `heightJoin:'bev_at'` stamps the KEYLESS
  // BEV ALS DSM − ALS DTM 1 m nDSM (CC BY 4.0; 55 COG BigTIFF tiles behind one INSPIRE ATOM feed, read by HTTP range —
  // heights/atHeightsStamp.mjs) onto the OSM footprints inside AT_CITY_BBOXES (vienna/graz/linz/salzburg/innsbruck);
  // NATIONAL_STAMP_TABLE dispatch. Local proof Stephansplatz: max 99.8 m (P90 massing) vs the 136.1 m tower kote.
  { name: 'austria',    pbfUrl: 'https://download.geofabrik.de/europe/austria-latest.osm.pbf',                        pbf: resolve(OUT, 'austria-latest.osm.pbf'),                bbox: '9.50,46.30,17.20,49.05',   clipped: resolve(OUT, 'clip-austria.osm.pbf'), heightJoin: 'bev_at' },
  // ASSESS CZ — NATIONAL-DERIVED-HEIGHTS: RUIAN `pocet podlazi` floors (× 3.2 m, DERIVED) — gated
  // on ONE owed VFR parse; until then mass-only.
  // → ⭐ WIRED 2026-09-05 (lane HEIGHTS-AT-CZ-SI, §CUZK-NDSM-OSM-JOIN): `heightJoin:'cuzk_cz'` stamps the KEYLESS ČÚZK
  // DMP 1G − DMR 5G nDSM (ImageServer exportImage, F32 GeoTIFF in EPSG:4326 — heights/czHeightsStamp.mjs) onto the OSM
  // footprints inside CZ_CITY_BBOXES (prague/brno/ostrava/plzen/olomouc); NATIONAL_STAMP_TABLE dispatch. RÚIAN floors stay
  // derived-levels and are NOT stamped. Local proof Prague Old Town: 316/321 real OSM footprints measured, 7.1 s.
  { name: 'czechia',    pbfUrl: 'https://download.geofabrik.de/europe/czech-republic-latest.osm.pbf',                 pbf: resolve(OUT, 'czech-republic-latest.osm.pbf'),         bbox: '12.05,48.50,18.90,51.10',  clipped: resolve(OUT, 'clip-czechia.osm.pbf'), heightJoin: 'cuzk_cz' },
  // ASSESS PT — NATIONAL-NOW (mass-only): replaces the lisbon+porto city rows (same pbf path —
  // one download, Copenhagen dedup). DGT LiDAR 2024–25 endpoint still uncaptured → heights owed.
  // ⭐ First country where the Mapterhorn switch (terrain.mjs --dtm-source mapterhorn, E3A)
  // removes a real terrain BLOCKER (lisbon/porto were terrain-BLOCKED on "no open national DTM").
  // Mainland only — Azores/Madeira fall outside this bbox (mirrors the Canarias note on `spain`).
  { name: 'portugal',   pbfUrl: 'https://download.geofabrik.de/europe/portugal-latest.osm.pbf',                       pbf: resolve(OUT, 'portugal-latest.osm.pbf'),               bbox: '-9.60,36.90,-6.10,42.20',  clipped: resolve(OUT, 'clip-portugal.osm.pbf') },
  // ASSESS BE — NATIONAL-NOW: replaces the brussels city row (same pbf path). Mapterhorn likewise unblocks the
  // Brussels terrain row (E3A). ⭐ HEIGHTS WIRED 2026-09-05 (lane HEIGHTS-EE-PL-PT-BE, §BE-DHMV-OSM-JOIN):
  // `heightJoin:'be_dhmv'` stamps the KEYLESS Digitaal Vlaanderen DHMV II nDSM (DHMVII_DSM_1m − DHMVII_DTM_1m,
  // WCS 2.0.1 multipart, EPSG:31370) onto these OSM footprints inside BE_CITY_BBOXES (antwerp, ghent, brussels =
  // the terrain.mjs row, leuven, bruges); dispatched via NATIONAL_STAMP_TABLE. The "regional trisection" the
  // August note assumed is wrong for the RASTER: DHMV II answers real data at Brussels Grand-Place (DSM p90 46.6 m
  // over DTM 21.4 m, 0 nodata — probed), so Brussels is stamped from the same model; Wallonia stays unstamped
  // (DHMV II ends at the regional border; the Walloon MNT/MNS was not probed). Local proof 2026-09-05: 800/819
  // GRB footprints at Antwerp Grote Markt measured, median 15.1 m, 0 tile errors.
  // §EU-REGISTERS — ONE footprint source, TWO doors, because Belgium's registers are REGIONAL and
  // this bake row is not: `be_registers` sweeps Digitaal Vlaanderen GRB `GRB:GBG` over Flanders and
  // SPW PICC layer 11 over Wallonia (both keyless, both measured 2026-09-06). Neither publishes a
  // height or storeys — PICC's `returnZ` rings carry ONE constant Z per object, which is a datum and
  // not a building height, so the adapter requests returnZ=false and emits none — and the DHMV II
  // measured-height join above is therefore unchanged.
  // ⛔ BRUSSELS HAS NO DOOR. UrbIS's GeoServer exposes exactly one type (`UrbisAdm:Pz`) and no
  // buildings, so every cell over the 19 communes answers 200 with zero features. Those cells produce
  // no footprints, are therefore ABSENT from the covered set, and their OSM footprints SURVIVE
  // (§COVERED-IS-PARSED — the rule that stopped Galicia being emptied, L-12952). A `belgium` bake
  // with official footprints must not blank the capital, and euRegisters.spec.ts proves it does not.
  { name: 'belgium',    pbfUrl: 'https://download.geofabrik.de/europe/belgium-latest.osm.pbf',                        pbf: resolve(OUT, 'belgium-latest.osm.pbf'),                bbox: '2.50,49.50,6.40,51.60',    clipped: resolve(OUT, 'clip-belgium.osm.pbf'), heightJoin: 'be_dhmv', footprintSource: 'be_registers', footprintMerge: 'replace-in-bbox' },
  // South-east — ASSESS HR / SI / GR / HU / RO / SK / BG. All NATIONAL-NOW mass-only; SI is the
  // stand-out upgrade path (GURS STAVBE register carries REAL METRES — a WFS-join stamp + a fill
  // probe are owed before any join is declared); HU/BG cadastre fee gates bind the CADASTRE, not
  // OSM context; RO registration is nationally INCOMPLETE (queryable ≠ complete — context rides
  // OSM regardless).
  { name: 'croatia',    pbfUrl: 'https://download.geofabrik.de/europe/croatia-latest.osm.pbf',                        pbf: resolve(OUT, 'croatia-latest.osm.pbf'),                bbox: '13.40,42.30,19.50,46.60',  clipped: resolve(OUT, 'clip-croatia.osm.pbf') },
  // ⭐ WIRED 2026-09-05 (lane HEIGHTS-AT-CZ-SI, §GURS-KN-OSM-JOIN): `heightJoin:'gurs_si'` stamps GURS KN STAVBE register
  // heights (H2 − H3, KEYLESS WFS on ipi.eprostor.gov.si, CC BY 4.0 — heights/siHeightsStamp.mjs) onto the OSM footprints
  // inside SI_CITY_BBOXES (ljubljana/maribor/celje/kranj/koper); NATIONAL_STAMP_TABLE dispatch. Written as `tagged`, NOT
  // measured-lidar (the register's own accuracy code is "unknown method" for 96 %). Local proof Ljubljana: 348/532 matched.
  { name: 'slovenia',   pbfUrl: 'https://download.geofabrik.de/europe/slovenia-latest.osm.pbf',                       pbf: resolve(OUT, 'slovenia-latest.osm.pbf'),               bbox: '13.30,45.40,16.60,46.90',  clipped: resolve(OUT, 'clip-slovenia.osm.pbf'), heightJoin: 'gurs_si' },
  { name: 'greece',     pbfUrl: 'https://download.geofabrik.de/europe/greece-latest.osm.pbf',                         pbf: resolve(OUT, 'greece-latest.osm.pbf'),                 bbox: '19.30,34.70,29.70,41.80',  clipped: resolve(OUT, 'clip-greece.osm.pbf') },
  { name: 'hungary',    pbfUrl: 'https://download.geofabrik.de/europe/hungary-latest.osm.pbf',                        pbf: resolve(OUT, 'hungary-latest.osm.pbf'),                bbox: '16.10,45.70,22.95,48.60',  clipped: resolve(OUT, 'clip-hungary.osm.pbf') },
  { name: 'romania',    pbfUrl: 'https://download.geofabrik.de/europe/romania-latest.osm.pbf',                        pbf: resolve(OUT, 'romania-latest.osm.pbf'),                bbox: '20.20,43.60,29.80,48.30',  clipped: resolve(OUT, 'clip-romania.osm.pbf') },
  { name: 'slovakia',   pbfUrl: 'https://download.geofabrik.de/europe/slovakia-latest.osm.pbf',                       pbf: resolve(OUT, 'slovakia-latest.osm.pbf'),               bbox: '16.80,47.70,22.60,49.65',  clipped: resolve(OUT, 'clip-slovakia.osm.pbf') },
  { name: 'bulgaria',   pbfUrl: 'https://download.geofabrik.de/europe/bulgaria-latest.osm.pbf',                       pbf: resolve(OUT, 'bulgaria-latest.osm.pbf'),               bbox: '22.30,41.20,28.70,44.25',  clipped: resolve(OUT, 'clip-bulgaria.osm.pbf') },
  // ─────────────────────────────────────────────────────────────────────────
  // §EU-EVERY-COUNTRY (2026-09-06, lane EU-EVERY-COUNTRY) — the founder's "complete Europe, ALL
  // VILLAGES, NO EXCEPTION" closed at the ROW layer. §BAKE-EUROPE-NATIONAL left Europe at 28
  // countries; the true gap was computed here from Geofabrik's own machine-readable catalogue
  // (`https://download.geofabrik.de/index-v1.json`, HTTP 200 application/json 3,790,471 B) rather
  // than from a memorised list: it has 53 children under `parent: "europe"`, of which four are
  // AGGREGATES (alps, britain-and-ireland, dach, united-kingdom) and 28 were already rows. The 17
  // rows below are the remainder that PRYZM actually owes a site.
  //
  // EVERY `pbfUrl` WAS RANGE-GET PROBED 2026-09-06 from this machine (`Range: bytes=0-0` → HTTP 206
  // + `Content-Range: bytes 0-0/<total>`, application/octet-stream). ⚠ A plain HEAD is NOT a probe
  // here: Geofabrik's download-proxy answered HEAD with 502/503 ERR_READ_ERROR for 18 of 21 URLs
  // while the very same URLs served 206 to a range GET on the first attempt. Sizes below are that
  // Content-Range total, in bytes, exactly as measured.
  //
  // ⛔ FOUR MICRO-STATES DELIBERATELY HAVE NO ROW, and the reason is MEASURED, not assumed. Geofabrik
  // publishes a `.poly` clip polygon per extract; point-in-polygon against the real polygon (controls
  // in the same run: Barcelona/Madrid/Málaga ∈ spain.poly, Paris/Nice/Bordeaux ∈ france.poly,
  // Rome ∈ italy.poly, Zurich/Buchs ∈ switzerland.poly) says:
  //     Monaco (7.4246,43.7396)      INSIDE france.poly   → already baked by the `france` row
  //     San Marino (12.4470,43.9356) INSIDE italy.poly    → already baked by the `italy` row
  //     Vatican City (12.4534,41.9029) INSIDE italy.poly  → already baked by the `italy` row
  //     Gibraltar (-5.3536,36.1408)  INSIDE spain.poly    → already baked by the `spain` row
  // and each of those four points is ALSO inside the covering row's bbox. A `monaco`/`sanmarino` row
  // would DOUBLE-BAKE the same OSM ways into buildings.pmtiles — the exact defect the Copenhagen
  // dedup note above exists to prevent. Andorra, Liechtenstein, the Isle of Man, the Channel Islands
  // and the Faroes measured OUTSIDE every neighbour's .poly, which is why they DO get a row.
  //
  // NO ROW BELOW DECLARES A `heightJoin` — no stamp is wired for any of these countries and a
  // declared join that produces nothing is a non-zero exit by design (§MEASURED-HEIGHT-GATE). Each
  // one's honest height class is recorded in heightSources.mjs REGION_SOURCE under the same name, so
  // resolveHeights() logs the true per-country reason instead of a generic gap. buildings stay OSM
  // (the Overture flip needs the per-country count probe first — §BAKE-OVERTURE's own rule).
  //
  // ⚠ ALL 17 CARRY `pending: true` (§PENDING-REGION, newzealandContext.spec.ts). merge-tiles.mjs
  // derives `expect=all` from THIS table: without the flag the next expect=all publish would REFUSE
  // BY NAME for seventeen regions that have never been live and therefore cannot have been lost.
  // Remove a row's flag once its region is published — a flag left on a LIVE region would let a later
  // publish drop it silently.
  //
  // BBOXES ARE MEASURED, NOT INVENTED: each is the bounding box of that extract's own `.poly` clip
  // polygon, rounded OUTWARD to 0.05°, so the bake bbox always CONTAINS the extract and nothing is
  // clipped away at the border. They are byte-identical to the terrain.mjs rows where one exists.
  // Overlap with a neighbour's bbox does NOT double-bake: a Geofabrik country extract holds only
  // that country (measured above), so the overlap strip carries HR data from the HR clip and RS data
  // from the RS clip — the §BAKE-AU-STATES reasoning, one border east.
  //
  // VILLAGES — the founder's actual test, answered from the LAYERS table below, not from hope. Every
  // filter is a TAG filter over the WHOLE national extract (`wr/building`, `w/highway`,
  // `nwr/natural=water|waterway`, `n/natural=tree`): there is no settlement filter, no population
  // threshold and no per-region feature cap anywhere in this file (the only caps are `maxTiles` on a
  // height JOIN, and no row here declares one). The client reads buildings/roads/water/parks/landuse/
  // rail/trees at z16 (contextTiles.ts LAYER_ZOOM), which is every land layer's `maxz`, so a hamlet
  // is present at the zoom actually requested. `--drop-densest-as-needed` drops from the DENSEST
  // tiles, i.e. city cores — a rural z16 tile is a few KB and is the last thing it touches. NAMED
  // EXCEPTIONS, so nobody reads the above as "everything renders": `canopy` is opt-in (`--layer
  // canopy` only) so a new country has NO canopy until that workflow runs for it; `furniture` is
  // optional and baked z15–16; `sea` is optional and clipped to region bboxes, so the landlocked
  // rows (serbia, kosovo, northmacedonia, belarus, moldova) correctly get none. And the honest
  // residual: OSM BUILDING density in rural AL/XK/MK/BA/UA/BY is thinner than in DE/NL — that is a
  // SOURCE fact, not a pipeline fact, and the owed calibration is the same per-country OSM-vs-Overture
  // count probe §BAKE-OVERTURE demands (the Riyadh rule). It is OWED, not done.
  //
  // Nordic + Atlantic islands
  { name: 'iceland',    pbfUrl: 'https://download.geofabrik.de/europe/iceland-latest.osm.pbf',                        pbf: resolve(OUT, 'iceland-latest.osm.pbf'),                bbox: '-25.70,62.80,-12.40,67.55', clipped: resolve(OUT, 'clip-iceland.osm.pbf'), pending: true },     // 64,729,720 B
  // Faroe Islands — a Danish autonomous country with its OWN extract. PROBED: Tórshavn (-6.7719,
  // 62.0079) is OUTSIDE denmark.poly (control: Copenhagen INSIDE), so the `denmark` row has never
  // carried it and this is not a double-bake.
  { name: 'faroeislands', pbfUrl: 'https://download.geofabrik.de/europe/faroe-islands-latest.osm.pbf',                pbf: resolve(OUT, 'faroe-islands-latest.osm.pbf'),          bbox: '-8.70,60.85,-5.50,62.95',  clipped: resolve(OUT, 'clip-faroeislands.osm.pbf'), pending: true },  // 7,730,526 B
  // Mediterranean
  { name: 'malta',      pbfUrl: 'https://download.geofabrik.de/europe/malta-latest.osm.pbf',                          pbf: resolve(OUT, 'malta-latest.osm.pbf'),                  bbox: '14.00,35.50,14.90,36.35',  clipped: resolve(OUT, 'clip-malta.osm.pbf'), pending: true },       // 8,907,969 B
  { name: 'cyprus',     pbfUrl: 'https://download.geofabrik.de/europe/cyprus-latest.osm.pbf',                         pbf: resolve(OUT, 'cyprus-latest.osm.pbf'),                 bbox: '31.95,34.20,35.00,36.05',  clipped: resolve(OUT, 'clip-cyprus.osm.pbf'), pending: true },      // 37,222,742 B — the WHOLE island (both communities + the SBAs)
  // Western Balkans — the largest single hole in §BAKE-EUROPE-NATIONAL: six countries, ~17.5 M people,
  // every one of them a Geofabrik national extract that simply had no row.
  { name: 'serbia',     pbfUrl: 'https://download.geofabrik.de/europe/serbia-latest.osm.pbf',                         pbf: resolve(OUT, 'serbia-latest.osm.pbf'),                 bbox: '18.80,42.20,23.05,46.20',  clipped: resolve(OUT, 'clip-serbia.osm.pbf'), pending: true },      // 239,255,977 B
  { name: 'bosniaherzegovina', pbfUrl: 'https://download.geofabrik.de/europe/bosnia-herzegovina-latest.osm.pbf',      pbf: resolve(OUT, 'bosnia-herzegovina-latest.osm.pbf'),     bbox: '15.70,42.55,19.65,45.30',  clipped: resolve(OUT, 'clip-bosniaherzegovina.osm.pbf'), pending: true }, // 160,666,211 B
  { name: 'montenegro', pbfUrl: 'https://download.geofabrik.de/europe/montenegro-latest.osm.pbf',                     pbf: resolve(OUT, 'montenegro-latest.osm.pbf'),             bbox: '18.15,41.60,20.40,43.60',  clipped: resolve(OUT, 'clip-montenegro.osm.pbf'), pending: true },  // 34,367,242 B
  // ⚠ Geofabrik's slug is the historical `macedonia`; the REGION is `northmacedonia` (the country's
  // name since 2019, and the slug the client + R2 path use). Slug ≠ upstream filename, deliberately.
  { name: 'northmacedonia', pbfUrl: 'https://download.geofabrik.de/europe/macedonia-latest.osm.pbf',                  pbf: resolve(OUT, 'macedonia-latest.osm.pbf'),              bbox: '20.40,40.80,23.05,42.40',  clipped: resolve(OUT, 'clip-northmacedonia.osm.pbf'), pending: true }, // 29,662,739 B
  { name: 'albania',    pbfUrl: 'https://download.geofabrik.de/europe/albania-latest.osm.pbf',                        pbf: resolve(OUT, 'albania-latest.osm.pbf'),                bbox: '18.85,39.60,21.10,42.70',  clipped: resolve(OUT, 'clip-albania.osm.pbf'), pending: true },     // 53,963,766 B
  // Kosovo — PROBED: Pristina (21.1655,42.6629) is OUTSIDE serbia.poly, so the `serbia` extract does
  // NOT carry it. Whatever one's view of the status question, the DATA question has one answer.
  { name: 'kosovo',     pbfUrl: 'https://download.geofabrik.de/europe/kosovo-latest.osm.pbf',                         pbf: resolve(OUT, 'kosovo-latest.osm.pbf'),                 bbox: '20.00,41.85,21.80,43.30',  clipped: resolve(OUT, 'clip-kosovo.osm.pbf'), pending: true },      // 30,731,946 B
  // Eastern Europe. ⚠ `ukraine` is the largest new extract by far (835 MB — bigger than Poland's
  // 2.09 GB only in tile count, not bytes) and Geofabrik's own name for it is "Ukraine (with Crimea)":
  // the extract includes Crimea (control: Simferopol INSIDE ukraine.poly) and this bbox does not
  // exclude it. That is the extract's editorial choice, recorded here rather than silently inherited.
  { name: 'ukraine',    pbfUrl: 'https://download.geofabrik.de/europe/ukraine-latest.osm.pbf',                        pbf: resolve(OUT, 'ukraine-latest.osm.pbf'),                bbox: '22.10,44.00,40.25,52.40',  clipped: resolve(OUT, 'clip-ukraine.osm.pbf'), pending: true },     // 876,115,930 B
  { name: 'belarus',    pbfUrl: 'https://download.geofabrik.de/europe/belarus-latest.osm.pbf',                        pbf: resolve(OUT, 'belarus-latest.osm.pbf'),                bbox: '23.15,51.20,32.80,56.20',  clipped: resolve(OUT, 'clip-belarus.osm.pbf'), pending: true },     // 348,686,686 B
  { name: 'moldova',    pbfUrl: 'https://download.geofabrik.de/europe/moldova-latest.osm.pbf',                        pbf: resolve(OUT, 'moldova-latest.osm.pbf'),                bbox: '26.60,45.45,30.20,48.50',  clipped: resolve(OUT, 'clip-moldova.osm.pbf'), pending: true },     // 101,087,543 B
  // Micro-states + Crown dependencies that are NOT inside any neighbour's clip (measured — see the
  // block header). These are the cheapest rows in the table: 3.3 + 3.3 + 3.9 + 6.1 MB of pbf, four
  // whole jurisdictions for less than one Spanish comunidad.
  { name: 'andorra',    pbfUrl: 'https://download.geofabrik.de/europe/andorra-latest.osm.pbf',                        pbf: resolve(OUT, 'andorra-latest.osm.pbf'),                bbox: '1.40,42.40,1.80,42.70',    clipped: resolve(OUT, 'clip-andorra.osm.pbf'), pending: true },     // 3,454,298 B
  { name: 'liechtenstein', pbfUrl: 'https://download.geofabrik.de/europe/liechtenstein-latest.osm.pbf',               pbf: resolve(OUT, 'liechtenstein-latest.osm.pbf'),          bbox: '9.45,47.00,9.65,47.30',    clipped: resolve(OUT, 'clip-liechtenstein.osm.pbf'), pending: true }, // 3,451,921 B
  // Guernsey + Jersey ship in ONE Geofabrik extract, so they are ONE region (`channelislands`) —
  // splitting them would download the same pbf twice for no gain, the paris/lyon anti-pattern.
  { name: 'channelislands', pbfUrl: 'https://download.geofabrik.de/europe/guernsey-jersey-latest.osm.pbf',            pbf: resolve(OUT, 'guernsey-jersey-latest.osm.pbf'),        bbox: '-3.60,49.00,-1.75,50.10',  clipped: resolve(OUT, 'clip-channelislands.osm.pbf'), pending: true }, // 3,887,927 B
  { name: 'isleofman',  pbfUrl: 'https://download.geofabrik.de/europe/isle-of-man-latest.osm.pbf',                    pbf: resolve(OUT, 'isle-of-man-latest.osm.pbf'),            bbox: '-5.45,53.70,-3.65,54.70',  clipped: resolve(OUT, 'clip-isleofman.osm.pbf'), pending: true },   // 6,058,050 B
  // ⛔ NAMED REFUSALS — Geofabrik `europe/` children this lane did NOT add, each with its reason, so
  // the omission is a decision on the record and not a quiet hole (C57 §1.9):
  //   • turkey (europe/turkey-latest.osm.pbf) — Geofabrik files it under europe and it holds real
  //     European territory (Thrace, including half of İstanbul), but it is TRANSCONTINENTAL and the
  //     scope call is the orchestrator's. ⭐ RESOLVED WHILE THIS LANE RAN: a Middle-East lane added
  //     `turkey` on 2026-09-06 with bbox 25.52,35.71,44.86,43.08 — which DOES include Thrace, so the
  //     European half is covered by that row and this lane must NOT add a second one.
  //   • georgia (europe/georgia-latest.osm.pbf, the COUNTRY) — transcontinental, same call as Turkey,
  //     and now carrying a HARD CONSTRAINT: ⚠ the slug `georgia` is ALREADY TAKEN in this table by the
  //     US STATE (north-america/us/georgia-latest.osm.pbf, added 2026-09-06). Terrain slugs are a flat
  //     namespace shared with the R2 path `terrain/<slug>/` and the client table, so whoever adds the
  //     country must pick a different slug (e.g. `georgiacountry`) or the two silently collide into
  //     one tileset. UNPROBED for size by this lane — do not quote one.
  //   • azores (europe/azores-latest.osm.pbf) — Portuguese autonomous region at lon ≈ −25…−31, OUTSIDE
  //     the `portugal` bbox exactly as the Canaries are outside `spain` and Svalbard is outside
  //     `norway`. The three island add-ons are ONE follow-up of the same shape, not three surprises.
  //   • russia (a TOP-LEVEL Geofabrik parent with 10 federal-district children, not a europe child) —
  //     out of scope for "complete Europe" as briefed; Kaliningrad measured OUTSIDE poland.poly.
  // ─────────────────────────────────────────────────────────────────────────
  // §BAKE-US-STATES (2026-09-06, lane USA-ALL-STATES; supersedes §BAKE-US-METROS of 2026-07-24 /
  // 2026-09-03) — 54 WHOLE-STATE rows, the AU analogue one ocean west. Founder 2026-09-06: "Also all
  // EEUU — I want complete country coverage." Every one of Geofabrik's 53 `north-america/us/` extracts
  // is a row (50 states + District of Columbia + Puerto Rico + US Virgin Islands), plus ONE extra row
  // (`alaskaaleutians`) that takes the second, EAST-OF-THE-ANTIMERIDIAN half of the Alaska extract.
  //
  // ⛔ THE SIX METRO ROWS ARE GONE, DELIBERATELY — newyork (Manhattan only, `-74.03,40.70,-73.91,40.82`),
  // sanfrancisco, chicago, austin, houston, boston. Each was a tiny clip cut out of the SAME state
  // extract its state row now takes whole, so keeping both would download the extract twice and bake
  // the same ground twice — the §NL-CITY-BBOX decoy shape (four Dutch cities publishing one Amsterdam
  // patch), here at state scale. `newyork` KEEPS ITS SLUG and widens Manhattan → the whole state, so
  // the live R2 prefix `newyork/` is replaced in place and no region is lost; the other five slugs
  // DISAPPEAR and a merge must name them in `--allow-region-removal` (the paris/lyon → france path).
  // Nothing measured is lost: the three metros with real heights keep them, because the join's working
  // set is US_OPEN_CITY_BBOXES (unchanged bytes) and only the ROW it hangs on moves to the state.
  //
  // ⚠ MEASURED, and this is the reason the metro rows could not be kept "just in case": under
  // §MOST-INTERIOR-BBOX-WINS (terrainCoverage.ts) a metro rectangle can never win against the state
  // rectangle that contains it — a Manhattan-sized box's best possible margin is ~0.05°, and New York
  // State's margin AT Manhattan is 0.31°. The metro terrain tilesets were already unreachable.
  //
  // BBOXES ARE THE EXTRACT'S OWN EXTENT, not a hand-drawn guess: each is the bbox of Geofabrik's own
  // `us/<state>.kml` polygon (the thing that defines what the extract contains), rounded OUTWARD to
  // 2 dp so the clip can never be smaller than the data. Every .kml and every .osm.pbf below was
  // fetched 2026-09-06 (HTTP 200; the trailing comment on each row is that extract's exact
  // Content-Length). Total download for a full sweep: 12,005,955,067 B ≈ 12.01 GB over 53 extracts —
  // one quarter of France's single 5,075,198,227 B extract per the largest state (california,
  // 1,326,860,797 B), so no state comes near the 330-minute job ceiling that France's bake spent 4 h
  // inside. The `alaska` and `alaskaaleutians` rows share ONE pbf path and therefore ONE download,
  // exactly as austin/houston shared texas.
  //
  // ⭐ THE ANTIMERIDIAN IS HANDLED, NOT SWALLOWED. Geofabrik's alaska.kml is TWO polygons: the mainland
  // + panhandle at [-180.00, 49.81 … -129.80, 72.99], and the western Aleutians (Near Islands — Attu,
  // Shemya) at [171.76, 51.11 … 180.00, 54.19]. `osmium extract -b` cannot express a wrapped box, so a
  // single row would either drop the Near Islands or, written as w>e, silently swallow the whole
  // Pacific. Two rows off one extract is the honest shape. Mapterhorn serves real relief there
  // (10/1004/334 → HTTP 200 image/webp 177,238 B, probed 2026-09-06), so the terrain row is not a
  // decoy either. HAWAII NEEDS NO SUCH SPLIT: its polygon stops at -179.60 and never crosses ±180 —
  // the archipelago rides ONE bbox that also contains Midway and the whole NW Hawaiian chain.
  //
  // TERRITORIES: `puertorico` and `usvirginislands` are IN, in the `usa` group, because they are US
  // jurisdictions with their own Geofabrik extracts (73,899,842 B / 3,121,695 B) and a PRYZM user in
  // San Juan is a US user. Guam / Northern Mariana / American Samoa are NOT here and this is a NAMED
  // REFUSAL, not an omission: Geofabrik has no per-territory extract for them — they sit inside
  // `australia-oceania/american-oceania-latest.osm.pbf` (5,365,697 B, probed 2026-09-06), whose own
  // polygon spans BOTH ~145 E (Guam/NMI) and ~-170 (American Samoa), i.e. two disjoint clusters that
  // need two more rows in an `oceania`-shaped group. That is a separate lane, not a US state row.
  //
  // HEIGHTS — ⭐ §USAS-NATIONAL-HEIGHTS (2026-09-06, lane USA-HEIGHTS-NATIONAL): **52 of the 54 rows
  // declare `heightJoin:'usas'`**, the FEMA/ORNL "USA Structures" join (135,321,228 structures, a
  // per-building HEIGHT in metres on the NGA LiDAR-derived subset, ONE keyless CC-BY-4.0
  // FeatureServer). heights/usOpenHeights.mjs §USAS-NATIONAL-HEIGHTS carries every URL, byte count and
  // per-state count.
  //   ⛔ THIS PARAGRAPH USED TO END "The other 51 rows declare NO heightJoin … until the USGS 3DEP nDSM
  //   stamp lands." Both halves are now false and the second was never reachable: 3DEP is a BARE-EARTH
  //   DTM and there is NO public CONUS DSM to subtract from it (the National Map's whole catalogue
  //   holds exactly one DSM product, ALASKA IFSAR, and its CONUS bbox query answers
  //   `{"total": 0, "items": []}` — probed 2026-09-06, verbatim in usOpenHeights.mjs). Waiting for it
  //   was waiting for a thing that does not exist.
  //   ⭐ AND `us_open` IS NO LONGER DECLARED BY ANY ROW. `newyork` / `california` / `massachusetts`
  //   moved to 'usas' too, because 'us_open' reaches ONLY its own metro bbox: it left Buffalo, Fresno,
  //   Sacramento and Worcester on the fabricated 9 m carpet inside three states that CLAIMED a height
  //   join — the §MDS-NATIONAL-SWEEP / Ciudad Real shape (L-12946) with a bigger denominator. The move
  //   is a strict SUPERSET, not a swap: `usOpenChannelForPoint` resolves the CITY channel FIRST per
  //   FOOTPRINT, so Manhattan still gets NYC's own height_roof (270.6 m in the Midtown cell, where USA
  //   Structures reads 170.5 m), SF still gets DataSF's LiDAR zonal max and Boston still gets the BPDA
  //   model — and everything else in those states now gets a measured metre instead of nothing.
  //   PROVED NON-ZERO BEFORE WIRING, count-only over 0.04–0.05° boxes, 2026-09-06, HTTP 200 each:
  //   Buffalo NY 8,837 · Fresno CA 13,046 · Sacramento CA 8,631 · Worcester MA 10,574 (and whole
  //   `massachusetts` 1,137,762 in 9.7 s). ⚠ Rochester NY answered **0** — a real SOURCE hole, named
  //   in usOpenHeights.mjs rather than hidden, and never a gate row.
  //   ⛔ The two rows that must NOT declare it are `alaskaaleutians` and `usvirginislands`: both are
  //   MEASURED-ZERO at the source (87 and 40,726 structures, ALL 'ORNL', 0 heights), and
  //   §MEASURED-HEIGHT-GATE exits 4 on a region that declares a join and stamps zero.
  //   Datum: NAVD88/GEOID18; terrain via
  // --dtm-source mapterhorn. ⚠ EGM2008 N is NOT uniformly negative across the US, as the old metro
  // comment implied: it is −35.5 … −13.1 m across CONUS but POSITIVE in Alaska (+8.04 at Anchorage,
  // +9.70 at Attu) and Hawaii (+15.81 at Honolulu) — every value GeoidEval-probed 2026-09-06.
  //
  // `pending: true` on 53 of the 54 (all but `newyork`, which is already live): merge-tiles.mjs
  // expects a pending row ONLY when it is staged, so adding 53 rows cannot make the next `expect=all`
  // publish refuse for regions that have never been live. Drop the flag as each goes live.
  { name: 'alabama',           pbfUrl: 'https://download.geofabrik.de/north-america/us/alabama-latest.osm.pbf',                pbf: resolve(OUT, 'us-alabama-latest.osm.pbf'),             bbox: '-88.49,29.95,-84.88,35.01',    clipped: resolve(OUT, 'clip-alabama.osm.pbf'), pending: true, heightJoin: 'usas' },   // 149,014,751 B
  { name: 'alaska',            pbfUrl: 'https://download.geofabrik.de/north-america/us/alaska-latest.osm.pbf',                 pbf: resolve(OUT, 'us-alaska-latest.osm.pbf'),              bbox: '-180.00,49.80,-129.79,72.99',  clipped: resolve(OUT, 'clip-alaska.osm.pbf'), pending: true, heightJoin: 'usas' },   // 143,908,577 B
  { name: 'alaskaaleutians',   pbfUrl: 'https://download.geofabrik.de/north-america/us/alaska-latest.osm.pbf',                 pbf: resolve(OUT, 'us-alaska-latest.osm.pbf'),              bbox: '171.76,51.11,180.00,54.20',    clipped: resolve(OUT, 'clip-alaskaaleutians.osm.pbf'), pending: true },   // 143,908,577 B
  { name: 'arizona',           pbfUrl: 'https://download.geofabrik.de/north-america/us/arizona-latest.osm.pbf',                pbf: resolve(OUT, 'us-arizona-latest.osm.pbf'),             bbox: '-114.83,31.32,-109.04,37.01',  clipped: resolve(OUT, 'clip-arizona.osm.pbf'), pending: true, heightJoin: 'usas' },   // 301,352,121 B
  { name: 'arkansas',          pbfUrl: 'https://download.geofabrik.de/north-america/us/arkansas-latest.osm.pbf',               pbf: resolve(OUT, 'us-arkansas-latest.osm.pbf'),            bbox: '-94.63,33.00,-89.63,36.52',    clipped: resolve(OUT, 'clip-arkansas.osm.pbf'), pending: true, heightJoin: 'usas' },   // 99,404,843 B
  { name: 'california',        pbfUrl: 'https://download.geofabrik.de/north-america/us/california-latest.osm.pbf',             pbf: resolve(OUT, 'us-california-latest.osm.pbf'),          bbox: '-125.90,32.48,-114.12,42.02',  clipped: resolve(OUT, 'clip-california.osm.pbf'), pending: true, heightJoin: 'usas' },   // 1,326,860,797 B
  { name: 'colorado',          pbfUrl: 'https://download.geofabrik.de/north-america/us/colorado-latest.osm.pbf',               pbf: resolve(OUT, 'us-colorado-latest.osm.pbf'),            bbox: '-109.07,36.98,-102.03,41.01',  clipped: resolve(OUT, 'clip-colorado.osm.pbf'), pending: true, heightJoin: 'usas' },   // 380,830,336 B
  { name: 'connecticut',       pbfUrl: 'https://download.geofabrik.de/north-america/us/connecticut-latest.osm.pbf',            pbf: resolve(OUT, 'us-connecticut-latest.osm.pbf'),         bbox: '-73.73,40.96,-71.78,42.06',    clipped: resolve(OUT, 'clip-connecticut.osm.pbf'), pending: true, heightJoin: 'usas' },   // 216,457,565 B
  { name: 'delaware',          pbfUrl: 'https://download.geofabrik.de/north-america/us/delaware-latest.osm.pbf',               pbf: resolve(OUT, 'us-delaware-latest.osm.pbf'),            bbox: '-75.79,38.45,-74.98,39.85',    clipped: resolve(OUT, 'clip-delaware.osm.pbf'), pending: true, heightJoin: 'usas' },   // 22,080,735 B
  { name: 'districtofcolumbia', pbfUrl: 'https://download.geofabrik.de/north-america/us/district-of-columbia-latest.osm.pbf',   pbf: resolve(OUT, 'us-district-of-columbia-latest.osm.pbf'), bbox: '-77.13,38.79,-76.90,39.00',    clipped: resolve(OUT, 'clip-districtofcolumbia.osm.pbf'), pending: true, heightJoin: 'usas' },   // 20,948,108 B
  { name: 'florida',           pbfUrl: 'https://download.geofabrik.de/north-america/us/florida-latest.osm.pbf',                pbf: resolve(OUT, 'us-florida-latest.osm.pbf'),             bbox: '-88.47,24.20,-79.43,31.01',    clipped: resolve(OUT, 'clip-florida.osm.pbf'), pending: true, heightJoin: 'usas' },   // 655,835,513 B
  { name: 'georgia',           pbfUrl: 'https://download.geofabrik.de/north-america/us/georgia-latest.osm.pbf',                pbf: resolve(OUT, 'us-georgia-latest.osm.pbf'),             bbox: '-85.61,30.35,-80.74,35.01',    clipped: resolve(OUT, 'clip-georgia.osm.pbf'), pending: true, heightJoin: 'usas' },   // 355,780,528 B
  { name: 'hawaii',            pbfUrl: 'https://download.geofabrik.de/north-america/us/hawaii-latest.osm.pbf',                 pbf: resolve(OUT, 'us-hawaii-latest.osm.pbf'),              bbox: '-179.60,15.92,-142.65,29.03',  clipped: resolve(OUT, 'clip-hawaii.osm.pbf'), pending: true, heightJoin: 'usas' },   // 26,951,996 B
  { name: 'idaho',             pbfUrl: 'https://download.geofabrik.de/north-america/us/idaho-latest.osm.pbf',                  pbf: resolve(OUT, 'us-idaho-latest.osm.pbf'),               bbox: '-117.25,41.98,-111.04,49.01',  clipped: resolve(OUT, 'clip-idaho.osm.pbf'), pending: true, heightJoin: 'usas' },   // 128,528,088 B
  { name: 'illinois',          pbfUrl: 'https://download.geofabrik.de/north-america/us/illinois-latest.osm.pbf',               pbf: resolve(OUT, 'us-illinois-latest.osm.pbf'),            bbox: '-91.52,36.96,-87.49,42.51',    clipped: resolve(OUT, 'clip-illinois.osm.pbf'), pending: true, heightJoin: 'usas' },   // 358,543,406 B
  { name: 'indiana',           pbfUrl: 'https://download.geofabrik.de/north-america/us/indiana-latest.osm.pbf',                pbf: resolve(OUT, 'us-indiana-latest.osm.pbf'),             bbox: '-88.11,37.76,-84.78,41.77',    clipped: resolve(OUT, 'clip-indiana.osm.pbf'), pending: true, heightJoin: 'usas' },   // 198,430,653 B
  { name: 'iowa',              pbfUrl: 'https://download.geofabrik.de/north-america/us/iowa-latest.osm.pbf',                   pbf: resolve(OUT, 'us-iowa-latest.osm.pbf'),                bbox: '-96.65,40.37,-90.13,43.51',    clipped: resolve(OUT, 'clip-iowa.osm.pbf'), pending: true, heightJoin: 'usas' },   // 133,125,489 B
  { name: 'kansas',            pbfUrl: 'https://download.geofabrik.de/north-america/us/kansas-latest.osm.pbf',                 pbf: resolve(OUT, 'us-kansas-latest.osm.pbf'),              bbox: '-102.06,36.99,-94.58,40.01',   clipped: resolve(OUT, 'clip-kansas.osm.pbf'), pending: true, heightJoin: 'usas' },   // 115,594,512 B
  { name: 'kentucky',          pbfUrl: 'https://download.geofabrik.de/north-america/us/kentucky-latest.osm.pbf',               pbf: resolve(OUT, 'us-kentucky-latest.osm.pbf'),            bbox: '-89.59,36.49,-81.95,39.15',    clipped: resolve(OUT, 'clip-kentucky.osm.pbf'), pending: true, heightJoin: 'usas' },   // 153,429,610 B
  { name: 'louisiana',         pbfUrl: 'https://download.geofabrik.de/north-america/us/louisiana-latest.osm.pbf',              pbf: resolve(OUT, 'us-louisiana-latest.osm.pbf'),           bbox: '-94.05,28.14,-88.66,33.03',    clipped: resolve(OUT, 'clip-louisiana.osm.pbf'), pending: true, heightJoin: 'usas' },   // 145,952,262 B
  { name: 'maine',             pbfUrl: 'https://download.geofabrik.de/north-america/us/maine-latest.osm.pbf',                  pbf: resolve(OUT, 'us-maine-latest.osm.pbf'),               bbox: '-71.09,42.85,-66.87,47.47',    clipped: resolve(OUT, 'clip-maine.osm.pbf'), pending: true, heightJoin: 'usas' },   // 90,724,876 B
  { name: 'maryland',          pbfUrl: 'https://download.geofabrik.de/north-america/us/maryland-latest.osm.pbf',               pbf: resolve(OUT, 'us-maryland-latest.osm.pbf'),            bbox: '-79.49,37.88,-74.95,39.73',    clipped: resolve(OUT, 'clip-maryland.osm.pbf'), pending: true, heightJoin: 'usas' },   // 214,022,414 B
  { name: 'massachusetts',     pbfUrl: 'https://download.geofabrik.de/north-america/us/massachusetts-latest.osm.pbf',          pbf: resolve(OUT, 'us-massachusetts-latest.osm.pbf'),       bbox: '-73.52,40.88,-68.73,42.89',    clipped: resolve(OUT, 'clip-massachusetts.osm.pbf'), pending: true, heightJoin: 'usas' },   // 309,938,097 B
  { name: 'michigan',          pbfUrl: 'https://download.geofabrik.de/north-america/us/michigan-latest.osm.pbf',               pbf: resolve(OUT, 'us-michigan-latest.osm.pbf'),            bbox: '-90.42,41.69,-82.06,48.36',    clipped: resolve(OUT, 'clip-michigan.osm.pbf'), pending: true, heightJoin: 'usas' },   // 312,212,383 B
  { name: 'minnesota',         pbfUrl: 'https://download.geofabrik.de/north-america/us/minnesota-latest.osm.pbf',              pbf: resolve(OUT, 'us-minnesota-latest.osm.pbf'),           bbox: '-97.25,43.49,-89.48,49.41',    clipped: resolve(OUT, 'clip-minnesota.osm.pbf'), pending: true, heightJoin: 'usas' },   // 284,816,865 B
  { name: 'mississippi',       pbfUrl: 'https://download.geofabrik.de/north-america/us/mississippi-latest.osm.pbf',            pbf: resolve(OUT, 'us-mississippi-latest.osm.pbf'),         bbox: '-91.66,30.04,-88.09,35.01',    clipped: resolve(OUT, 'clip-mississippi.osm.pbf'), pending: true, heightJoin: 'usas' },   // 94,080,881 B
  { name: 'missouri',          pbfUrl: 'https://download.geofabrik.de/north-america/us/missouri-latest.osm.pbf',               pbf: resolve(OUT, 'us-missouri-latest.osm.pbf'),            bbox: '-95.78,35.99,-89.08,40.62',    clipped: resolve(OUT, 'clip-missouri.osm.pbf'), pending: true, heightJoin: 'usas' },   // 194,739,836 B
  { name: 'montana',           pbfUrl: 'https://download.geofabrik.de/north-america/us/montana-latest.osm.pbf',                pbf: resolve(OUT, 'us-montana-latest.osm.pbf'),             bbox: '-116.06,44.35,-104.03,49.01',  clipped: resolve(OUT, 'clip-montana.osm.pbf'), pending: true, heightJoin: 'usas' },   // 100,022,190 B
  { name: 'nebraska',          pbfUrl: 'https://download.geofabrik.de/north-america/us/nebraska-latest.osm.pbf',               pbf: resolve(OUT, 'us-nebraska-latest.osm.pbf'),            bbox: '-104.06,40.00,-95.30,43.01',   clipped: resolve(OUT, 'clip-nebraska.osm.pbf'), pending: true, heightJoin: 'usas' },   // 100,196,685 B
  { name: 'nevada',            pbfUrl: 'https://download.geofabrik.de/north-america/us/nevada-latest.osm.pbf',                 pbf: resolve(OUT, 'us-nevada-latest.osm.pbf'),              bbox: '-120.01,35.00,-114.03,42.01',  clipped: resolve(OUT, 'clip-nevada.osm.pbf'), pending: true, heightJoin: 'usas' },   // 122,949,898 B
  { name: 'newhampshire',      pbfUrl: 'https://download.geofabrik.de/north-america/us/new-hampshire-latest.osm.pbf',          pbf: resolve(OUT, 'us-new-hampshire-latest.osm.pbf'),       bbox: '-72.56,42.69,-70.48,45.32',    clipped: resolve(OUT, 'clip-newhampshire.osm.pbf'), pending: true, heightJoin: 'usas' },   // 71,238,020 B
  { name: 'newjersey',         pbfUrl: 'https://download.geofabrik.de/north-america/us/new-jersey-latest.osm.pbf',             pbf: resolve(OUT, 'us-new-jersey-latest.osm.pbf'),          bbox: '-75.58,38.75,-73.67,41.36',    clipped: resolve(OUT, 'clip-newjersey.osm.pbf'), pending: true, heightJoin: 'usas' },   // 163,381,257 B
  { name: 'newmexico',         pbfUrl: 'https://download.geofabrik.de/north-america/us/new-mexico-latest.osm.pbf',             pbf: resolve(OUT, 'us-new-mexico-latest.osm.pbf'),          bbox: '-109.06,31.33,-102.99,37.01',  clipped: resolve(OUT, 'clip-newmexico.osm.pbf'), pending: true, heightJoin: 'usas' },   // 136,029,857 B
  { name: 'newyork',           pbfUrl: 'https://download.geofabrik.de/north-america/us/new-york-latest.osm.pbf',               pbf: resolve(OUT, 'us-new-york-latest.osm.pbf'),            bbox: '-79.77,40.43,-71.66,45.02',    clipped: resolve(OUT, 'clip-newyork.osm.pbf'), heightJoin: 'usas' },   // 495,982,594 B
  { name: 'northcarolina',     pbfUrl: 'https://download.geofabrik.de/north-america/us/north-carolina-latest.osm.pbf',         pbf: resolve(OUT, 'us-north-carolina-latest.osm.pbf'),      bbox: '-84.33,33.12,-73.73,36.59',    clipped: resolve(OUT, 'clip-northcarolina.osm.pbf'), pending: true, heightJoin: 'usas' },   // 427,872,491 B
  { name: 'northdakota',       pbfUrl: 'https://download.geofabrik.de/north-america/us/north-dakota-latest.osm.pbf',           pbf: resolve(OUT, 'us-north-dakota-latest.osm.pbf'),        bbox: '-104.06,45.93,-96.55,49.02',   clipped: resolve(OUT, 'clip-northdakota.osm.pbf'), pending: true, heightJoin: 'usas' },   // 127,788,199 B
  { name: 'ohio',              pbfUrl: 'https://download.geofabrik.de/north-america/us/ohio-latest.osm.pbf',                   pbf: resolve(OUT, 'us-ohio-latest.osm.pbf'),                bbox: '-84.83,38.40,-80.50,42.34',    clipped: resolve(OUT, 'clip-ohio.osm.pbf'), pending: true, heightJoin: 'usas' },   // 322,887,573 B
  { name: 'oklahoma',          pbfUrl: 'https://download.geofabrik.de/north-america/us/oklahoma-latest.osm.pbf',               pbf: resolve(OUT, 'us-oklahoma-latest.osm.pbf'),            bbox: '-103.01,33.61,-94.42,37.01',   clipped: resolve(OUT, 'clip-oklahoma.osm.pbf'), pending: true, heightJoin: 'usas' },   // 168,284,935 B
  { name: 'oregon',            pbfUrl: 'https://download.geofabrik.de/north-america/us/oregon-latest.osm.pbf',                 pbf: resolve(OUT, 'us-oregon-latest.osm.pbf'),              bbox: '-126.39,41.96,-116.45,46.31',  clipped: resolve(OUT, 'clip-oregon.osm.pbf'), pending: true, heightJoin: 'usas' },   // 253,351,822 B
  { name: 'pennsylvania',      pbfUrl: 'https://download.geofabrik.de/north-america/us/pennsylvania-latest.osm.pbf',           pbf: resolve(OUT, 'us-pennsylvania-latest.osm.pbf'),        bbox: '-80.53,39.66,-74.68,42.52',    clipped: resolve(OUT, 'clip-pennsylvania.osm.pbf'), pending: true, heightJoin: 'usas' },   // 346,220,783 B
  // ⛔ SLUG COLLISION, CAUGHT BY THE GATE AND RENAMED — NOT `puertorico`. `terrain.mjs` already has a
  // §1b CITY row `puertorico` at [-15.7804, 27.7294, -15.6404, 27.8494]: that is Puerto Rico de Gran
  // Canaria, a Spanish resort town, source 'es' (CNIG), with a LIVE tileset at `terrain/puertorico/`.
  // Two different places, one R2 path — `terrain.mjs --check-client-coverage` refused it by name
  // ("slug 'puertorico' is BOTH a client city and a client region"). The US Commonwealth takes
  // `puertoricousa`; the Canarian town keeps the slug it already publishes under.
  { name: 'puertoricousa',        pbfUrl: 'https://download.geofabrik.de/north-america/us/puerto-rico-latest.osm.pbf',            pbf: resolve(OUT, 'us-puerto-rico-latest.osm.pbf'),         bbox: '-68.32,17.51,-65.09,18.82',    clipped: resolve(OUT, 'clip-puertoricousa.osm.pbf'), pending: true, heightJoin: 'usas' },   // 73,899,842 B
  { name: 'rhodeisland',       pbfUrl: 'https://download.geofabrik.de/north-america/us/rhode-island-latest.osm.pbf',           pbf: resolve(OUT, 'us-rhode-island-latest.osm.pbf'),        bbox: '-71.92,40.99,-71.06,42.02',    clipped: resolve(OUT, 'clip-rhodeisland.osm.pbf'), pending: true, heightJoin: 'usas' },   // 52,091,340 B
  { name: 'southcarolina',     pbfUrl: 'https://download.geofabrik.de/north-america/us/south-carolina-latest.osm.pbf',         pbf: resolve(OUT, 'us-south-carolina-latest.osm.pbf'),      bbox: '-83.36,32.02,-78.51,35.22',    clipped: resolve(OUT, 'clip-southcarolina.osm.pbf'), pending: true, heightJoin: 'usas' },   // 163,161,761 B
  { name: 'southdakota',       pbfUrl: 'https://download.geofabrik.de/north-america/us/south-dakota-latest.osm.pbf',           pbf: resolve(OUT, 'us-south-dakota-latest.osm.pbf'),        bbox: '-104.06,42.47,-96.43,45.95',   clipped: resolve(OUT, 'clip-southdakota.osm.pbf'), pending: true, heightJoin: 'usas' },   // 48,780,228 B
  { name: 'tennessee',         pbfUrl: 'https://download.geofabrik.de/north-america/us/tennessee-latest.osm.pbf',              pbf: resolve(OUT, 'us-tennessee-latest.osm.pbf'),           bbox: '-90.32,34.98,-81.64,36.69',    clipped: resolve(OUT, 'clip-tennessee.osm.pbf'), pending: true, heightJoin: 'usas' },   // 188,952,243 B
  { name: 'texas',             pbfUrl: 'https://download.geofabrik.de/north-america/us/texas-latest.osm.pbf',                  pbf: resolve(OUT, 'us-texas-latest.osm.pbf'),               bbox: '-106.65,25.69,-93.01,36.53',   clipped: resolve(OUT, 'clip-texas.osm.pbf'), pending: true, heightJoin: 'usas' },   // 718,093,892 B
  { name: 'usvirginislands',   pbfUrl: 'https://download.geofabrik.de/north-america/us/us-virgin-islands-latest.osm.pbf',      pbf: resolve(OUT, 'us-us-virgin-islands-latest.osm.pbf'),   bbox: '-65.18,17.28,-63.95,18.49',    clipped: resolve(OUT, 'clip-usvirginislands.osm.pbf'), pending: true },   // 3,121,695 B
  { name: 'utah',              pbfUrl: 'https://download.geofabrik.de/north-america/us/utah-latest.osm.pbf',                   pbf: resolve(OUT, 'us-utah-latest.osm.pbf'),                bbox: '-114.06,36.99,-109.03,42.01',  clipped: resolve(OUT, 'clip-utah.osm.pbf'), pending: true, heightJoin: 'usas' },   // 168,166,581 B
  { name: 'vermont',           pbfUrl: 'https://download.geofabrik.de/north-america/us/vermont-latest.osm.pbf',                pbf: resolve(OUT, 'us-vermont-latest.osm.pbf'),             bbox: '-73.44,42.72,-71.46,45.03',    clipped: resolve(OUT, 'clip-vermont.osm.pbf'), pending: true, heightJoin: 'usas' },   // 45,855,328 B
  { name: 'virginia',          pbfUrl: 'https://download.geofabrik.de/north-america/us/virginia-latest.osm.pbf',               pbf: resolve(OUT, 'us-virginia-latest.osm.pbf'),            bbox: '-83.68,36.53,-74.29,39.47',    clipped: resolve(OUT, 'clip-virginia.osm.pbf'), pending: true, heightJoin: 'usas' },   // 427,195,858 B
  { name: 'washington',        pbfUrl: 'https://download.geofabrik.de/north-america/us/washington-latest.osm.pbf',             pbf: resolve(OUT, 'us-washington-latest.osm.pbf'),          bbox: '-126.75,45.53,-116.91,49.01',  clipped: resolve(OUT, 'clip-washington.osm.pbf'), pending: true, heightJoin: 'usas' },   // 362,671,564 B
  { name: 'westvirginia',      pbfUrl: 'https://download.geofabrik.de/north-america/us/west-virginia-latest.osm.pbf',          pbf: resolve(OUT, 'us-west-virginia-latest.osm.pbf'),       bbox: '-82.65,37.19,-77.71,40.65',    clipped: resolve(OUT, 'clip-westvirginia.osm.pbf'), pending: true, heightJoin: 'usas' },   // 98,660,968 B
  { name: 'wisconsin',         pbfUrl: 'https://download.geofabrik.de/north-america/us/wisconsin-latest.osm.pbf',              pbf: resolve(OUT, 'us-wisconsin-latest.osm.pbf'),           bbox: '-92.90,42.48,-86.20,47.42',    clipped: resolve(OUT, 'clip-wisconsin.osm.pbf'), pending: true, heightJoin: 'usas' },   // 292,438,555 B
  { name: 'wyoming',           pbfUrl: 'https://download.geofabrik.de/north-america/us/wyoming-latest.osm.pbf',                pbf: resolve(OUT, 'us-wyoming-latest.osm.pbf'),             bbox: '-111.06,40.98,-103.94,45.02',  clipped: resolve(OUT, 'clip-wyoming.osm.pbf'), pending: true, heightJoin: 'usas' },   // 93,093,666 B
  // ─────────────────────────────────────────────────────────────────────────
  // §BAKE-NORTHAMERICA (2026-09-06, lane MEXICO-CANADA) — MEXICO (one national row) + CANADA (13
  // province/territory rows). Both countries were absent from this table ENTIRELY until today, so a
  // site dropped anywhere in either rendered the exact L-607 defect ("No surrounding building data
  // for this area"). The shape of each half was decided by MEASUREMENT, not preference:
  //
  //   • CANADA IS SPLIT BY PROVINCE, the AU-states pattern one continent east — and it is not a
  //     judgement call: Geofabrik SERVES the split. index-v1.json (HTTP 200, 3,790,471 B,
  //     Last-Modified Sat 05 Sep 2026, probed 2026-09-06) lists `canada` with THIRTEEN children —
  //     alberta · british-columbia · manitoba · new-brunswick · newfoundland-and-labrador ·
  //     northwest-territories · nova-scotia · nunavut · ontario · prince-edward-island · quebec ·
  //     saskatchewan · yukon — each with its own `-latest.osm.pbf`. Cadastre, assessment and land-use
  //     planning are PROVINCIAL competencies in Canada exactly as they are STATE competencies in
  //     Australia (there is no national parcel fabric and no national planning scheme), so the
  //     "whole-country" row is a whole-PROVINCE row and the per-province extract is the cheap clip.
  //   • MEXICO IS ONE NATIONAL ROW, and that too is the index's answer, not a preference: the same
  //     index lists `mexico` with ZERO children. There is no per-state Geofabrik file to split on, so
  //     Mexico mirrors `spain`/`newzealand` — one national extract, one national bbox.
  //
  // ⚠ THE .osm.pbf ITSELF COULD NOT BE RANGE-GET'd FROM THIS MACHINE, and the honest record is that
  // this is NOT a wrong URL: every `*-latest.osm.pbf` on download.geofabrik.de answered
  // `HTTP/1.1 502 Bad Gateway · Server: squid/6.14 · X-Squid-Error: ERR_READ_ERROR 0 · Via: 1.1
  // download-proxy12` — INCLUDING europe/spain-latest.osm.pbf, a URL this file has baked daily for
  // months. What DID answer 200 is the md5 sidecar of each, and it names the dated file behind the
  // `-latest` alias: `north-america/canada-latest.osm.pbf.md5` → HTTP 200, 56 B, text/plain,
  // `X-Derived-From: north-america/canada-260904.osm.pbf.md5`; `north-america/mexico-latest.osm.pbf.md5`
  // → HTTP 200, 56 B, `X-Derived-From: north-america/mexico-260904.osm.pbf.md5`. So both extracts
  // EXIST and were rebuilt 2026-09-04. ⛔ SIZES ARE THEREFORE UNMEASURED, and are recorded as unknown
  // rather than guessed — the first CI bake of each row is where they surface (the workflow's "Assert
  // the tiles are real" step fails a layer that came back empty). Canada whole is a large extract;
  // that is one more reason the province split is the right shape here and not an optional nicety.
  //
  // BBOXES ARE LAND EXTENTS, not the Geofabrik cut polygons. The index's own polygon bbox for e.g.
  // `newfoundland-and-labrador` reaches lon −44.18 and `nunavut` reaches lat 85.04 — hundreds of km of
  // Atlantic and Arctic Ocean padding. A per-province pbf holds ONLY that province, so a land bbox
  // clips the whole province and nothing foreign, while the ocean padding would buy zero OSM
  // buildings and cost real terrain tiles (terrain.mjs uses these bboxes BYTE-IDENTICALLY — the koln
  // rule: a context extent wider than the terrain extent is the "buildings floating off the edge of
  // the DEM" defect, narrower is a visible context cliff).
  //
  // buildings = OSM everywhere here. ⚠ The Overture question is OPEN for Mexico and deliberately NOT
  // answered by guesswork: Mexico is plausibly an OSM building desert of the Riyadh/Jeddah kind
  // (5.3×/7.2× there), but `duckdb` is not installed on this machine (`which duckdb` → exit 127) and
  // the Overpass control read HTTP 504 from overpass-api.de and curl exit 28 (90 s timeout) from the
  // kumi mirror, so NEITHER side of the delta was measured. The rows therefore stay on OSM, the same
  // way line 436 above leaves the US rows: "owed calibration before any `--buildings-source overture`
  // flip — no probe forces one today". Flipping `mexico` on an unmeasured hunch is the one move that
  // would be worse than waiting.
  //
  // MEASURED HEIGHTS — §CA-OPEN-HEIGHTS (heights/caOpenHeights.mjs), probed 2026-09-06:
  //   • `britishcolumbia` declares heightJoin:'ca_open' — City of Vancouver "Building footprints 2009"
  //     (Opendatasoft, keyless, Open Government Licence – Vancouver, 124,181 records) publishes a
  //     LiDAR-derived per-ELEMENT topelev_m/baseelev_m/hgt_agl. Export probe over a downtown cell:
  //     HTTP 200, 28,342 B, 41 features, 0.57 s.
  //   • `ontario` declares heightJoin:'ca_open' — City of Toronto "Building Outline Polygon" on the
  //     city's own keyless ArcGIS (cot_geospatial3/MapServer/2) carries DERIVED_HEIGHT in metres
  //     above grade. Probe: HTTP 200, 41,568 B, 49 features, 0.67 s; real values 112.36 / 173.41 /
  //     116.9 / 15.26 m downtown.
  //   • EVERY OTHER Canadian row declares NO heightJoin, on evidence, and Montréal is the one that
  //     hurts: donnees.montreal.ca serves a REAL 1 m LiDAR MNS (CC BY 4.0) and CityGML LOD2 — but as
  //     32 per-borough GeoTIFF ZIPs and city-wide SHP/GPKG ZIPs, with no keyless WCS/COG to
  //     range-read. That is the ELVIS refusal shape, so `quebec` bakes honest OSM `assumed` defaults
  //     and Montréal is recorded as WIRABLE-BUT-UNWIRED in CA_OPEN_HEIGHTS_ASSESSED, never as absent.
  //   • MEXICO HAS NO MEASURED-HEIGHT ROW AT ALL, and every door was probed by name on 2026-09-06:
  //     gaia.inegi.org.mx/NLB/wms, .../NLB/mdm6/wms, .../NLB/mdm6/wms.php, .../mdm6/rest/services and
  //     www.inegi.org.mx/app/api/mapas/… all → HTTP 404; mapasrest.inegi.org.mx → curl exit 6
  //     (NXDOMAIN); datos.gob.mx/busca/api/3/action/package_search → HTTP 403 "Access Denied" (an edge
  //     block, 424 B). CDMX's own portal IS open and reachable (datos.cdmx.gob.mx CKAN, HTTP 200) and
  //     publishes "Información Catastral de la Ciudad de México" (CC-BY-4.0-ESP) — but its columns are
  //     codigo_postal · superficie_terreno · superficie_construccion · uso_construccion ·
  //     clave_rango_nivel · anio_construccion · … · latitud · longitud: a POINT with a CODED LEVEL
  //     RANGE ("RU", "10", "05"), not a polygon and not a floor COUNT. A coded range cannot honestly
  //     become metres — not measured, not even floors×N — so `mexico` bakes honest OSM `assumed`
  //     defaults, the netherlands/AU/NZ precedent, and the refusal is named rather than silent.
  //
  // Datum: NAD83(CSRS)/CGVD2013 in Canada, NAD27→ITRF/NAVD-equivalent in Mexico; the terrain rows lift
  // per post from the NGA EGM2008 COG (their geoidSepM constants were read from THAT SAME grid on
  // 2026-09-06 — see terrain.mjs). Terrain via --dtm-source mapterhorn, PROBED at z10 over all 16
  // points including the Arctic (Resolute 74.70 N → HTTP 200 image/webp 199,770 B) — there is no
  // high-latitude coverage hole.
  //
  // ⚠ `pending: true` on ALL FOURTEEN — §PENDING-REGION, the `newzealand` precedent. None of these is
  // staged yet, and `expect=all` in merge-tiles.mjs derives the expected set from THIS table: without
  // the flag the next expect=all publish would REFUSE BY NAME because fourteen regions have no staged
  // bake. Bake each with region=<slug> stage=true; the following expect=all merges it in. Remove the
  // flag once a region is live — a flag left on a live region would let a later publish DROP it
  // silently, the exact loss the gate exists to refuse (northAmericaContext.spec.ts pins both).
  { name: 'mexico',               pbfUrl: 'https://download.geofabrik.de/north-america/mexico-latest.osm.pbf',                             pbf: resolve(OUT, 'mexico-latest.osm.pbf'),                       bbox: '-118.50,14.50,-86.70,32.75',  clipped: resolve(OUT, 'clip-mexico.osm.pbf'), pending: true },
  { name: 'ontario',              pbfUrl: 'https://download.geofabrik.de/north-america/canada/ontario-latest.osm.pbf',                     pbf: resolve(OUT, 'ca-ontario-latest.osm.pbf'),                   bbox: '-95.20,41.60,-74.30,56.90',   clipped: resolve(OUT, 'clip-ontario.osm.pbf'), heightJoin: 'ca_open', pending: true },
  { name: 'quebec',               pbfUrl: 'https://download.geofabrik.de/north-america/canada/quebec-latest.osm.pbf',                      pbf: resolve(OUT, 'ca-quebec-latest.osm.pbf'),                    bbox: '-79.90,44.90,-56.90,62.70',   clipped: resolve(OUT, 'clip-quebec.osm.pbf'), pending: true },
  { name: 'britishcolumbia',      pbfUrl: 'https://download.geofabrik.de/north-america/canada/british-columbia-latest.osm.pbf',            pbf: resolve(OUT, 'ca-british-columbia-latest.osm.pbf'),          bbox: '-139.10,48.20,-114.00,60.10', clipped: resolve(OUT, 'clip-britishcolumbia.osm.pbf'), heightJoin: 'ca_open', pending: true },
  { name: 'alberta',              pbfUrl: 'https://download.geofabrik.de/north-america/canada/alberta-latest.osm.pbf',                     pbf: resolve(OUT, 'ca-alberta-latest.osm.pbf'),                   bbox: '-120.10,48.90,-109.90,60.10', clipped: resolve(OUT, 'clip-alberta.osm.pbf'), pending: true },
  { name: 'saskatchewan',         pbfUrl: 'https://download.geofabrik.de/north-america/canada/saskatchewan-latest.osm.pbf',                pbf: resolve(OUT, 'ca-saskatchewan-latest.osm.pbf'),              bbox: '-110.10,48.90,-101.30,60.10', clipped: resolve(OUT, 'clip-saskatchewan.osm.pbf'), pending: true },
  { name: 'manitoba',             pbfUrl: 'https://download.geofabrik.de/north-america/canada/manitoba-latest.osm.pbf',                    pbf: resolve(OUT, 'ca-manitoba-latest.osm.pbf'),                  bbox: '-102.10,48.90,-88.90,60.10',  clipped: resolve(OUT, 'clip-manitoba.osm.pbf'), pending: true },
  { name: 'newbrunswick',         pbfUrl: 'https://download.geofabrik.de/north-america/canada/new-brunswick-latest.osm.pbf',               pbf: resolve(OUT, 'ca-new-brunswick-latest.osm.pbf'),             bbox: '-69.10,44.50,-63.70,48.10',   clipped: resolve(OUT, 'clip-newbrunswick.osm.pbf'), pending: true },
  { name: 'novascotia',           pbfUrl: 'https://download.geofabrik.de/north-america/canada/nova-scotia-latest.osm.pbf',                 pbf: resolve(OUT, 'ca-nova-scotia-latest.osm.pbf'),               bbox: '-66.40,43.30,-59.60,47.10',   clipped: resolve(OUT, 'clip-novascotia.osm.pbf'), pending: true },
  { name: 'princeedwardisland',   pbfUrl: 'https://download.geofabrik.de/north-america/canada/prince-edward-island-latest.osm.pbf',        pbf: resolve(OUT, 'ca-prince-edward-island-latest.osm.pbf'),      bbox: '-64.50,45.90,-61.90,47.10',   clipped: resolve(OUT, 'clip-princeedwardisland.osm.pbf'), pending: true },
  { name: 'newfoundland',         pbfUrl: 'https://download.geofabrik.de/north-america/canada/newfoundland-and-labrador-latest.osm.pbf',   pbf: resolve(OUT, 'ca-newfoundland-and-labrador-latest.osm.pbf'), bbox: '-67.90,46.50,-52.50,60.50',   clipped: resolve(OUT, 'clip-newfoundland.osm.pbf'), pending: true },
  { name: 'yukon',                pbfUrl: 'https://download.geofabrik.de/north-america/canada/yukon-latest.osm.pbf',                       pbf: resolve(OUT, 'ca-yukon-latest.osm.pbf'),                     bbox: '-141.10,59.90,-123.70,69.70', clipped: resolve(OUT, 'clip-yukon.osm.pbf'), pending: true },
  { name: 'northwestterritories', pbfUrl: 'https://download.geofabrik.de/north-america/canada/northwest-territories-latest.osm.pbf',       pbf: resolve(OUT, 'ca-northwest-territories-latest.osm.pbf'),     bbox: '-136.60,59.90,-101.90,78.90', clipped: resolve(OUT, 'clip-northwestterritories.osm.pbf'), pending: true },
  { name: 'nunavut',              pbfUrl: 'https://download.geofabrik.de/north-america/canada/nunavut-latest.osm.pbf',                     pbf: resolve(OUT, 'ca-nunavut-latest.osm.pbf'),                   bbox: '-120.80,51.60,-61.00,83.20',  clipped: resolve(OUT, 'clip-nunavut.osm.pbf'), pending: true },
  // ─────────────────────────────────────────────────────────────────────────
  // §BAKE-AU-STATES (2026-09-03, lane CONTEXT-INTL) — 8 whole-state rows, the AU analogue of
  // §BAKE-EUROPE-NATIONAL. Cadastre + planning are STATE competencies in Australia (no national scheme),
  // so the "whole-country" row is a whole-STATE row. Each cites audit/geo-expansion/2026-09-02/
  // au-sweep.md §N and uses the per-state Geofabrik extract under australia-oceania/australia/ (all 8
  // range-GET-verified 2026-09-03, sizes in au-sweep §9.1 — 0.96 GB pbf for the whole continent, ~1/5
  // of Germany, so the §5 R2-budget concern is far smaller here). buildings = OSM everywhere: ACT ships
  // OPEN footprints (64,674 probed) and Melbourne serves REAL extrusions — both ride the OSM/derive
  // path; MS GlobalML stays EXCLUDED. ⭐ §AU-OPEN-HEIGHTS-OSM-JOIN (2026-09-05, lane HEIGHTS-AU): the
  // `victoria` row is the FIRST AU row to declare a heightJoin — 'au_open' stamps City of Melbourne's
  // open LoD1 footprint heights (CC BY 4.0, keyless, uncapped /exports/geojson per 0.01° cell) onto the
  // OSM footprints inside AU_OPEN_CITY_BBOXES (heights/auOpenHeights.mjs: melbourne only); the rest of
  // Victoria streams through unstamped. Every OTHER row still declares NO heightJoin, on evidence
  // re-probed the same day (AU_OPEN_HEIGHTS_ASSESSED): ACT's 64,674 footprints carry no height field,
  // NSW/GA/Vicmap-statewide serve none, and ELVIS is a bulk portal with no keyless raster — so the owed
  // nDSM build stays owed (heightSources REGION_SOURCE `elvis_au`) and those rows bake honest OSM
  // `assumed` defaults, the netherlands precedent. Datum: AHD (EPSG:5711; AHD-TAS on Tasmania), lifted PER-CAPITAL from
  // AUSGeoid2020 — the separation swings tens of metres W↔E so a single national geoidSepM is impossible
  // (au-sweep §9.2); terrain via --dtm-source mapterhorn (planet-wide, ADOPTED). ⚠ NT context bakes fine
  // (OSM) though its PARCELS are viewer/Cloudflare-gated — the Saudi precedent: geo-fenced parcels are
  // not a reason to omit a context row (that would recreate the exact L-607 "no surrounding building
  // data" defect). Whole-state bboxes fully CONTAIN each state; the per-state pbf holds only that state,
  // so a generous bbox clips to the whole state and nothing foreign.
  { name: 'newsouthwales',    pbfUrl: 'https://download.geofabrik.de/australia-oceania/australia/new-south-wales-latest.osm.pbf',    pbf: resolve(OUT, 'au-new-south-wales-latest.osm.pbf'),    bbox: '141.00,-37.60,153.70,-28.10', clipped: resolve(OUT, 'clip-newsouthwales.osm.pbf') },
  { name: 'victoria',         pbfUrl: 'https://download.geofabrik.de/australia-oceania/australia/victoria-latest.osm.pbf',          pbf: resolve(OUT, 'au-victoria-latest.osm.pbf'),          bbox: '140.90,-39.20,150.05,-33.90', clipped: resolve(OUT, 'clip-victoria.osm.pbf'), heightJoin: 'au_open' },
  { name: 'queensland',       pbfUrl: 'https://download.geofabrik.de/australia-oceania/australia/queensland-latest.osm.pbf',        pbf: resolve(OUT, 'au-queensland-latest.osm.pbf'),        bbox: '138.00,-29.20,153.60,-9.00',  clipped: resolve(OUT, 'clip-queensland.osm.pbf') },
  { name: 'westernaustralia', pbfUrl: 'https://download.geofabrik.de/australia-oceania/australia/western-australia-latest.osm.pbf', pbf: resolve(OUT, 'au-western-australia-latest.osm.pbf'), bbox: '112.90,-35.20,129.00,-13.50', clipped: resolve(OUT, 'clip-westernaustralia.osm.pbf') },
  { name: 'southaustralia',   pbfUrl: 'https://download.geofabrik.de/australia-oceania/australia/south-australia-latest.osm.pbf',   pbf: resolve(OUT, 'au-south-australia-latest.osm.pbf'),   bbox: '129.00,-38.10,141.05,-25.90', clipped: resolve(OUT, 'clip-southaustralia.osm.pbf') },
  { name: 'tasmania',         pbfUrl: 'https://download.geofabrik.de/australia-oceania/australia/tasmania-latest.osm.pbf',          pbf: resolve(OUT, 'au-tasmania-latest.osm.pbf'),          bbox: '143.80,-43.75,148.55,-39.40', clipped: resolve(OUT, 'clip-tasmania.osm.pbf') },
  { name: 'act',              pbfUrl: 'https://download.geofabrik.de/australia-oceania/australia/act-latest.osm.pbf',               pbf: resolve(OUT, 'au-act-latest.osm.pbf'),               bbox: '148.70,-35.95,149.40,-35.10', clipped: resolve(OUT, 'clip-act.osm.pbf') },
  { name: 'northernterritory', pbfUrl: 'https://download.geofabrik.de/australia-oceania/australia/northern-territory-latest.osm.pbf', pbf: resolve(OUT, 'au-northern-territory-latest.osm.pbf'), bbox: '128.90,-26.10,138.10,-10.90', clipped: resolve(OUT, 'clip-northernterritory.osm.pbf') },
  // ─────────────────────────────────────────────────────────────────────────
  // §BAKE-NEWZEALAND (2026-09-05, lane NZ-EVERYWHERE) — WHOLE NEW ZEALAND (national), the AU-states
  // pattern one country east. Geofabrik's australia-oceania/new-zealand-latest.osm.pbf is one national
  // extract; the bbox (166.0–178.7 E, 47.5–34.3 S) contains both main islands + Stewart Island and
  // stays WEST of the antimeridian (the Chathams at ~176.5 W are outside — a `chathams` row from the
  // same extract if a demo ever needs them). buildings = OSM. NO heightJoin, on evidence probed
  // 2026-09-05: LINZ Data Service layer 101290 "NZ Building Outlines" (3,236,141 features, CC BY 4.0,
  // EPSG:2193) carries NO height field — its 14 fields are enumerated in heightSources.mjs
  // REGION_SOURCE `newzealand`. LINZ DOES publish a national LiDAR 1 m DEM (121859) + DSM (122082),
  // so a DSM−DEM nDSM derive is the owed build — but EVERY LINZ service is API-key gated (WFS/WMTS
  // GetCapabilities keyless → HTTP 401), so there is no keyless raster to sample and this row bakes
  // honest OSM `assumed` defaults, the netherlands/AU precedent. Datum: NZVD2016, EGM2008 N = 34.11 m
  // at Auckland (terrain.mjs `newzealand`, GeoidEval-probed); terrain via --dtm-source mapterhorn
  // (z10 1009/624 over Auckland → HTTP 200 image/webp, 111,632 B, probed 2026-09-05).
  // ⚠ `pending: true` — §PENDING-REGION. This row is NOT yet staged, and `expect=all` in
  // merge-tiles.mjs derives the expected set from THIS table: without the flag, the next
  // expect=all publish (france+switzerland, hours away) would REFUSE BY NAME because newzealand has
  // no staged bake. A pending row is EXPECTED ONLY WHEN STAGED (merge-tiles.mjs `expectedRegions`):
  // bake it with region=newzealand stage=true, and the following expect=all merges it in; until
  // then it is listed as "pending, not expected" on every merge. Remove the flag once the region is
  // live — a flag left on a live region would let a later publish DROP it silently, the exact loss
  // the gate exists to refuse (newzealandContext.spec.ts pins the flag's presence AND its semantics).
  { name: 'newzealand',       pbfUrl: 'https://download.geofabrik.de/australia-oceania/new-zealand-latest.osm.pbf',                  pbf: resolve(OUT, 'new-zealand-latest.osm.pbf'),         bbox: '166.0,-47.5,178.7,-34.3',     clipped: resolve(OUT, 'clip-newzealand.osm.pbf'), pending: true },
  // Saudi — Geofabrik bundles it in the GCC-states extract (no standalone SA file). OSM/Geofabrik
  // is global + free, so context tiles bake fine here even though the LIVE gov parcel data is
  // geo-fenced (that gate is unrelated to OSM footprints).
  //
  // §BAKE-OVERTURE (L-6xx, 2026-07-24) — ⚠ Saudi (and the wider Gulf/Global-South) is an OSM
  // BUILDING DESERT. Live-probed at these two bboxes (VERIFIED 2026-07-24):
  //     Riyadh: OSM 56,278 buildings  ·  Overture 299,918  (5.3×)
  //     Jeddah: OSM 23,247 buildings  ·  Overture 167,766  (7.2×)
  // The bake is faithful; the SOURCE is the gap. Overture Maps is OSM ∪ Microsoft-ML ∪ Google ∪
  // Esri ∪ national cadastres, conflated — for Riyadh the extra ~244k footprints come from
  // "Microsoft ML Buildings", which OSM simply does not have. So these two cities flip their
  // BUILDINGS layer to Overture (`buildingsSource:'overture'`); their roads/water/parks stay on the
  // OSM clip (unchanged, still downloaded+clipped below). See docs/04-reference/
  // CONTEXT-BUILDING-SOURCE-EVALUATION.md for the full delta table + the height caveat: Overture
  // height is ~0% in Saudi (ML footprints carry none) but 73% in Barcelona (it folds OSM+IGN in),
  // which is why European regions stay on OSM by default and lose nothing.
  // ─────────────────────────────────────────────────────────────────────────
  // §ME-NATIONAL (2026-09-06, lane ME-NATIONAL) — the Middle East stops being five city boxes.
  //
  // THE DEFECT THIS RETIRES. Until this commit the whole region was four context rows — riyadh,
  // jeddah, dubai, abudhabi — each a ~0.2–0.5° rectangle. A site 30 km outside Dubai, anywhere in
  // Oman, anywhere in Turkey, Israel, Jordan or Lebanon, fell outside every row and got NO context
  // buildings at all: the L-607 "no surrounding building data" shape, at country scale.
  //
  // ONE ROW PER GEOFABRIK EXTRACT — and that is not a style choice, it is the invariant this table
  // already runs on. Rows that share a `pbf` MUST have DISJOINT bboxes (austin/houston share the
  // texas extract and do not overlap; riyadh/jeddah/dubai/abudhabi shared gcc-states and did not
  // overlap). The merge is a tile-join of per-region PMTiles with NO dedup, so two rows whose
  // rectangles overlap over the SAME extract publish the same building twice. Geofabrik serves NO
  // per-country BH/KW/OM/QA/SA/AE file — one `asia/gcc-states` extract is the whole peninsula — and
  // six country rectangles cut from it cannot be disjoint (Saudi's rectangle contains Qatar,
  // Bahrain, Kuwait and half the UAE; a rectangle cannot exclude a peninsula). So the six GCC
  // states are ONE row, `gccstates`, whose bbox is the extract's own `.poly` bbox. Turkey, Israel,
  // Jordan and Lebanon each have their own extract and therefore their own row.
  //
  // ⛔ THE FOUR CITY ROWS ARE REMOVED, NOT KEPT ALONGSIDE — §NL-CITY-BBOX's lesson (L-12942), one
  // region east. They add nothing `gccstates` does not: same extract, same Overture source, same
  // tippecanoe, same zooms; and the terrain half is worse than nothing, because
  // terrainCoverage.ts's `mostInterior` resolver scores by ABSOLUTE distance to the nearest bbox
  // edge, so the big national box BEATS the small metro box at every interior point (Dubai centre:
  // gccstates margin 0.95° vs dubai 0.15°). Left in place they would have been unreachable rows
  // that still cost a bake and still duplicated every building in the four densest metros in the
  // region. The measured-height stamp they anchored is NOT lost: `heightJoin: 'ad_ndsm'` moves to
  // `gccstates` with its working set unchanged (stampBboxesFor still resolves it to AD_CITY_BBOXES
  // — Abu Dhabi island only), so the same 50 cm DSM−DTM metres are stamped on the same footprints.
  //
  // EVERY EXTRACT RANGE-GET PROBED 2026-09-06 from this machine (`curl -sL -r 0-15` → HTTP 206 +
  // Content-Range; ⚠ a HEAD or a non-following GET is NOT a probe here — Geofabrik's download
  // proxy answered those with 502 ERR_READ_ERROR / 302 while the very same URLs served 206 to a
  // redirect-following range GET):
  //     asia/gcc-states-latest.osm.pbf           253,734,161 B   Last-Modified 2026-09-06 02:52:02 GMT
  //     europe/turkey-latest.osm.pbf             644,955,033 B   Last-Modified 2026-09-06 05:03:03 GMT
  //     asia/israel-and-palestine-latest.osm.pbf 119,275,457 B   Last-Modified 2026-09-06 02:41:40 GMT
  //     asia/jordan-latest.osm.pbf                31,017,866 B   Last-Modified 2026-09-06 02:29:19 GMT
  //     asia/lebanon-latest.osm.pbf               52,476,862 B   Last-Modified 2026-09-06 02:24:55 GMT
  //
  // BBOXES ARE MEASURED, NOT INVENTED: each is the bounding box of that extract's own `.poly` clip
  // polygon (fetched the same day, HTTP 200: gcc-states 1,627 B/52 verts · turkey 6,091 B/196 ·
  // israel-and-palestine 1,379 B/44 · jordan 7,300 B/235 · lebanon 3,363 B/108), rounded OUTWARD to
  // 0.01°, so the bake rectangle always CONTAINS the extract and nothing is clipped at the border.
  // Byte-identical to the terrain.mjs rows. Overlap with a NEIGHBOUR's row (gccstates × jordan,
  // turkey × greece/bulgaria) does not double-bake: a Geofabrik extract carries only its own
  // country, so the overlap strip gets JO data from the JO clip and nothing from the GCC clip —
  // the §BAKE-AU-STATES / §EU-EVERY-COUNTRY reasoning.
  //
  // ⚠ `israel` is the SLUG; the COVERAGE is Geofabrik's `israel-and-palestine` extract clipped to
  // its own poly bbox, so Israel, the West Bank and Gaza all bake and a site in Ramallah or Gaza
  // City gets context. The slug is the extract's short name, not a territorial statement; the
  // terrain regex in the client and the specs accepts `[a-z0-9]+` only, which is why the hyphenated
  // source name is not used verbatim.
  //
  // BUILDINGS. `gccstates` is OVERTURE (`buildingsSource:'overture'`) — it inherits the MEASURED
  // riyadh/jeddah finding verbatim (OSM 56,278 vs Overture 299,918 in Riyadh, 5.3×; 23,247 vs
  // 167,766 in Jeddah, 7.2×; VERIFIED 2026-07-24) and it is the same extract over the same desert.
  // turkey/israel/jordan/lebanon stay on OSM, the DEFAULT, because nobody has measured them: the
  // ME sweep (audit/geo-expansion/2026-09-02/me-sweep.md §12) has only extract SIZE as a proxy
  // (TR 615 MB dense · IL 114 MB dense · LB 50 MB · JO 30 MB thin). The owed calibration is a
  // per-country OSM-vs-Overture building count at one metro each — flipping a row on a size proxy
  // would be exactly the guess §BAKE-OVERTURE forbids.
  //
  // HEIGHTS. `gccstates` carries the ONE wired Gulf measured-height channel (ad_ndsm, Abu Dhabi
  // island). turkey/israel/jordan/lebanon declare NO heightJoin, on evidence probed 2026-09-06 and
  // recorded in the lane report: no national open DSM/nDSM or height-bearing footprint register was
  // reachable for any of them (IL data.gov.il q=DTM → 0 datasets, q=מבנים → 9, all municipal or
  // non-geometry; JO DLS_Layers_Service enumerates 15 parcel/boundary layers and NO height field;
  // QA's own webmap enumerates 13 imagery + 11 vector services with no DSM/DTM and no building
  // layer; TR's only extractable height signal is the TKGM parcel `nitelik` text — "11 Katli" =
  // floors×N, a per-click derivation on the parcel channel, NOT a bake-time raster). A declared
  // join that stamps nothing is a non-zero exit by design (§MEASURED-HEIGHT-GATE), so these rows
  // bake honest OSM `assumed` defaults — the netherlands/newzealand precedent, said by name.
  //
  // ⚠ ALL FIVE CARRY `pending: true` (§PENDING-REGION, newzealandContext.spec.ts): merge-tiles.mjs
  // derives `expect=all` from THIS table, so without the flag the next expect=all publish would
  // REFUSE BY NAME for five regions that have never been live. ⛔ ORDERING CONSTRAINT, because the
  // four city rows LEAVE in this same commit: `gccstates` must be baked+staged BEFORE the next
  // expect=all merge, or that merge publishes a tileset with no Gulf data at all. Drop each flag
  // once its region is live.
  //
  // Datum: me-sweep §13 names every local vertical datum in this lane as UNVERIFIED-DOC (SA Jeddah
  // 1969 · AE Dubai Municipality/AD separate · QA QND95 · KW/BH/OM MSL · IL Yafo MSL · JO Aqaba
  // MSL · LB MSL · TR TUDKA/Antalya) — leads, not facts; terrain via Mapterhorn, per-post EGM2008.
  { name: 'gccstates',  pbfUrl: 'https://download.geofabrik.de/asia/gcc-states-latest.osm.pbf',                       pbf: resolve(OUT, 'gcc-states-latest.osm.pbf'),             bbox: '34.43,15.24,60.95,32.20',  clipped: resolve(OUT, 'clip-gccstates.osm.pbf'), buildingsSource: 'overture', heightJoin: 'ad_ndsm', pending: true },
  { name: 'turkey',     pbfUrl: 'https://download.geofabrik.de/europe/turkey-latest.osm.pbf',                         pbf: resolve(OUT, 'turkey-latest.osm.pbf'),                 bbox: '25.52,35.71,44.86,43.08',  clipped: resolve(OUT, 'clip-turkey.osm.pbf'), pending: true },
  { name: 'israel',     pbfUrl: 'https://download.geofabrik.de/asia/israel-and-palestine-latest.osm.pbf',             pbf: resolve(OUT, 'israel-and-palestine-latest.osm.pbf'),   bbox: '33.99,29.43,35.92,33.46',  clipped: resolve(OUT, 'clip-israel.osm.pbf'), pending: true },
  { name: 'jordan',     pbfUrl: 'https://download.geofabrik.de/asia/jordan-latest.osm.pbf',                           pbf: resolve(OUT, 'jordan-latest.osm.pbf'),                 bbox: '34.86,29.18,39.32,33.38',  clipped: resolve(OUT, 'clip-jordan.osm.pbf'), pending: true },
  { name: 'lebanon',    pbfUrl: 'https://download.geofabrik.de/asia/lebanon-latest.osm.pbf',                          pbf: resolve(OUT, 'lebanon-latest.osm.pbf'),                bbox: '34.76,33.05,36.64,34.81',  clipped: resolve(OUT, 'clip-lebanon.osm.pbf'), pending: true },
  // ─────────────────────────────────────────────────────────────────────────
  // §BAKE-JAPAN (2026-09-06, lane JAPAN-FULL) — WHOLE JAPAN (national), the §BAKE-EUROPE-NATIONAL /
  // §BAKE-NEWZEALAND pattern. ONE Geofabrik extract, `asia/japan-latest.osm.pbf`.
  //   ⚠ SIZE / BAKE-TIME RISK, stated because this is one of the largest rows in the table. The pbf
  //   itself would NOT answer on 2026-09-06: Geofabrik's download proxy returned
  //   `HTTP/1.1 502 Bad Gateway · Server: squid/6.14 · X-Squid-Error: ERR_READ_ERROR 0` to a HEAD, to
  //   a `Range: bytes=0-1023` GET, and to the /asia/japan.html index page — three attempts, three
  //   502s. SO THE BYTE COUNT IS NOT MEASURED AND IS NOT QUOTED HERE. What IS measured, same minute:
  //   the sibling `asia/japan-latest.osm.pbf.md5` → HTTP 200 text/plain 55 B,
  //   `a9e4110c7aceb1e33634845536203ae5  japan-latest.osm.pbf`, header `X-Derived-From:
  //   asia/japan-260905.osm.pbf.md5`. The extract EXISTS and was rebuilt 2026-09-05; only the proxy
  //   leg was failing, and a bake would retry it. The row is therefore written UNSPLIT, exactly like
  //   `germany` and `france` (each a multi-GB single-extract country this workflow already bakes),
  //   and THE FIRST DISPATCH MUST BE A SCOPED `region=japan` RUN whose log is read before japan is
  //   ever folded into a multi-region wave. If that run exceeds the job ceiling, the split is BY
  //   ISLAND on the SAME extract (hokkaido / honshu / shikoku-kyushu / okinawa as four rows sharing
  //   one `pbf` path — the austin+houston "one download, several clips" precedent), never by
  //   re-downloading and never by a new mechanism.
  //   bbox 122.9,24.0,153.99,45.6 contains every prefecture: Yonaguni (122.93 E, the westernmost
  //   point) east to 153.99 E, Hateruma (24.05 N) north to Cape Sōya (45.52 N). It stays WEST of the
  //   antimeridian, so no wrap handling is needed.
  //   buildings = OSM. Japan is the OPPOSITE of the Gulf desert — OSM here carries the GSI 基盤地図情報
  //   building import; a 0.013°×0.009° Kanda/Akihabara rectangle held 4,285 OSM building ways
  //   (live Overpass, 2026-09-06). An OSM-vs-Overture density probe (the Riyadh rule) is the owed
  //   calibration before any `--buildings-source overture` flip; no probe forces one today.
  //   ⭐ HEIGHTS — §PLATEAU-JP-OSM-JOIN: `heightJoin:'plateau_jp'` stamps MLIT Project PLATEAU LoD1
  //   `bldg:measuredHeight` (a LiDAR point-cloud MEDIAN per building — `uro:lod1HeightType`
  //   点群から取得_中央値) onto the OSM footprints inside JP_CITY_BBOXES. It reads the SERVED 3D-Tiles
  //   b3dm batch tables by HTTP RANGE GET — never the 2.11 GB per-ward CityGML zip — and is KEYLESS
  //   (公共データ利用規約 PDL 1.0, stated by MLIT to be CC BY 4.0 compatible; attribution
  //   出典：国土交通省 PLATEAU). Every probe, the licence text and the measured match rate are in
  //   heights/jpPlateau.mjs's header.
  //   MEASURED END-TO-END 2026-09-06 over a real Kanda/Akihabara rectangle: 1,711 of 4,178 retained
  //   OSM footprints stamped (41.0 %; 1,601 forward + 110 reverse), median 18.6 m, max 145.5 m,
  //   46 MB fetched in 26.9 s, 0 tile errors, 214 buildings REFUSED as PLATEAU's own
  //   取得不可のため一律値（3m） "could not measure" default, and 35 `.glb` tiles refused BY NAME
  //   (台東区 ships 3D Tiles 1.1 — heights/jpPlateau.mjs `tileFormatOf`).
  //   Terrain via --dtm-source mapterhorn (z10 10/909/403 over Tokyo → HTTP 200 image/webp 264,074 B,
  //   PROBED 2026-09-06; terrain.mjs `japan`, the new `asia` group).
  //   ⚠ `pending: true` — §PENDING-REGION, the newzealand precedent. This row has NEVER been staged
  //   and `expect=all` derives its expected set from THIS table, so without the flag the next
  //   expect=all publish would REFUSE BY NAME. Bake it with region=japan stage=true; the following
  //   expect=all merges it in. REMOVE THE FLAG once the region is live — a flag left on a live region
  //   would let a later publish DROP it silently, the exact loss the gate exists to refuse.
  { name: 'japan',      pbfUrl: 'https://download.geofabrik.de/asia/japan-latest.osm.pbf',                            pbf: resolve(OUT, 'japan-latest.osm.pbf'),                  bbox: '122.9,24.0,153.99,45.6',   clipped: resolve(OUT, 'clip-japan.osm.pbf'), heightJoin: 'plateau_jp', pending: true },
];

// §BAKE-OVERTURE — the Overture buildings source. Overture publishes ONE global GeoParquet dataset
// per monthly release on a public, anonymous S3 bucket (no key, no rate limit) — the SAME "static
// bytes, no live query" property the whole L-513 architecture rests on. We read it with DuckDB
// (spatial + httpfs extensions), clip to the region bbox via the parquet's `bbox` row-group stats
// (pushdown — a bbox read scans only the covering row groups, not the planet), map the columns onto
// the OSM-style tags the client reader consumes (`building`, `height`, `building:levels`), and write
// GeoJSONSeq — the EXACT format tippecanoe already ingests from the OSM path, so it merges into the
// same `buildings.pmtiles` with NO client change. ⚠ Pin the release deliberately (a bake must be
// reproducible); bump it on Overture's monthly cadence (list `s3://overturemaps-us-west-2/release/`).
// Latest live-verified: 2026-07-22.0.
const OVERTURE_RELEASE = '2026-07-22.0';
const OVERTURE_BUILDINGS = `s3://overturemaps-us-west-2/release/${OVERTURE_RELEASE}/theme=buildings/type=building/*.parquet`;

// Global override: `--buildings-source overture` forces EVERY region's buildings to Overture (a
// clean global switch — Overture ⊇ OSM everywhere, so it never regresses density); `--buildings-
// source osm` forces the legacy OSM path everywhere (ignoring per-region `buildingsSource`).
// Default: honour each region's own field (OSM unless it opts into 'overture').
const BUILDINGS_SOURCE_OVERRIDE = (() => {
  const i = process.argv.indexOf('--buildings-source');
  return i >= 0 ? process.argv[i + 1] : null;
})();
function buildingsSourceFor(region) {
  if (BUILDINGS_SOURCE_OVERRIDE === 'overture' || BUILDINGS_SOURCE_OVERRIDE === 'osm') return BUILDINGS_SOURCE_OVERRIDE;
  return region.buildingsSource === 'overture' ? 'overture' : 'osm';
}

// Per-layer: the osmium tags-filter expression + tippecanoe zoom range. Attributes (building
// height / building:levels, highway class, etc.) ride along in the GeoJSON — osmium export keeps
// all tags — so the client can style + badge them (provenance-in-tile, C23).
//
// §BAKE-GEOMETRY-TYPES (L-513b, 2026-07-21) — ⚠ `geom` IS NOT OPTIONAL. A live probe of the FIRST
// bake found, in one Gòtic z16 tile:
//     LineString 362 features (all building=*) · Polygon 362 (IDENTICAL tags) · Point 678
// `osmium export` defaults to `--geometry-types=point,linestring,polygon`, so it emitted EVERY
// closed building way TWICE — once as the way (LineString) and once as the assembled area
// (Polygon) — and additionally exported the tagged `entrance=*` NODES that `tags-filter` drags in
// as referenced objects. That triples the tile bytes, double-counts every footprint for anything
// that measures built density, and would extrude a cloud of doorways. Pinning the geometry type
// per layer is the fix at source. (The client reader stays defensive about this anyway — tiles are
// a separately-deployed artefact and can be older than the code reading them.)
//
// §BAKE-UNIQUE-ID — `--add-unique-id=type_id` carries the real OSM id into the tile, so the client
// can stop minting synthetic ids and can dedupe a footprint across tile boundaries properly.
const LAYERS = [
  // §BAKE-BUILDING-RELATIONS (L-580, 2026-07-22) — ⚠ `w/building` (WAYS ONLY) SILENTLY DROPPED
  // EVERY MULTIPOLYGON-RELATION BUILDING. Measured against OSM for the Gòtic far extent:
  //     ways 3,872  ·  relations 1,973   (total 5,845)
  // i.e. ~34% of buildings in Barcelona's dense historic fabric are mapped as RELATIONS — the
  // courtyard blocks with interior voids, which is precisely the shape that needs a relation. The
  // baked tiles held 79% of ground truth there against 96–98% in Eixample/Vila Olímpica, and this
  // is the whole difference. `wr/` takes ways AND relations; `tags-filter` pulls in their member
  // ways automatically, and `osmium export` assembles them into MultiPolygons that the client
  // reader already handles (one feature per outer ring).
  //
  // ⚠ NOT `nwr/` — that would additionally admit NODES tagged `building`, which carry no footprint
  // and would be discarded by `--geometry-types polygon` anyway, after costing a pass over them.
  { id: 'buildings', filter: ['wr/building'],                                    geom: 'polygon',            minz: 12, maxz: 16, extra: ['--drop-densest-as-needed'] },
  { id: 'roads',     filter: ['w/highway'],                                       geom: 'linestring',         minz: 10, maxz: 16, extra: ['--drop-densest-as-needed'] },
  // Water is genuinely MIXED — lakes/basins are areas, streams/rivers are ways. Both are wanted,
  // and `contextWater.ts` already splits them, so this is the one layer that keeps two types.
  // §L-637 SEA — `w/natural=coastline` (ways) rides in the water layer so the sea flows through the
  // BAKED path: the client `waterFromTileFeatures` reads the coastline ways and `buildSeaMaskFromCoastline`
  // (L-185, §FEAT-FORMA-SEA-CONTEXT) stitches + closes them into blue sea polygons — zero Overpass. Until
  // a re-bake propagates this, `CesiumViewport.fetchSeaMaskViaOverpass` supplies the coastline live (it
  // self-disables once the baked `collection.sea` is non-empty).
  { id: 'water',     filter: ['nwr/natural=water', 'nwr/waterway', 'w/water', 'w/natural=coastline'],   geom: 'polygon,linestring', minz: 8,  maxz: 16, extra: ['--drop-densest-as-needed'] }, // §WATER-TILE-CAP (2026-09-02): run 33622434617 died at z8 tile 8/136/80 — DK+NL water merged in ONE grouped bake exceeded 500KB and tippecanoe wrote NO zoom levels; every other layer already degrades. The flag engages only where the alternative is death.
  { id: 'parks',     filter: ['nwr/leisure=park', 'nwr/landuse=grass,forest,recreation_ground', 'nwr/natural=wood'], geom: 'polygon', minz: 10, maxz: 16, extra: ['--drop-densest-as-needed'] }, // §WATER-TILE-CAP sibling — same class, pre-empted
  // §FORMA-CTX-LANDUSE (founder 2026-07-29) — colour the TERRAIN by land use: grey urban / brown rural.
  // The `landuse` TAG rides along (osmium keeps it, tippecanoe stores it as a feature attribute), so the
  // client (`contextLanduse.ts`) classifies each polygon urban↔rural and drapes the matching colour. Green
  // (parks) + blue (water) already have their own layers; this fills the URBAN grey + RURAL brown ground.
  // ⚠ The tag list MUST stay a SUPERSET of the client classifier's URBAN∪RURAL sets
  // (apps/editor/src/ui/geospatial/contextLanduse.ts) — any tag the client classifies but the bake
  // omits can only ever arrive via the DEGRADED Overpass fallback, never the baked path, so the
  // grey/brown drape would be silently incomplete for it. `garages`/`harbour` (urban) +
  // `animal_keeping` (rural) were classified client-side but not emitted here; added to match.
  { id: 'landuse',   filter: ['nwr/landuse=residential,commercial,industrial,retail,garages,farmland,meadow,orchard,vineyard,farmyard,allotments,greenhouse_horticulture,plant_nursery,animal_keeping,quarry,brownfield,construction,railway,port,harbour'], geom: 'polygon', minz: 9, maxz: 16, extra: ['--drop-densest-as-needed'] },
  // §FORMA-CTX-RAIL (L-642 Phase C — SPEC-3D-SITE-PRODUCTION-CONTEXT §2). Rail lines are the T1
  // near-ring's transport skeleton: heavy rail, light rail, subway/metro, trams. `w/railway` (WAYS
  // ONLY) takes the linear track ways; `--geometry-types linestring` keeps them as strands (mirrors
  // the `roads` layer exactly — the client draws them as thin dark ground ribbons, distinct from the
  // pale road grid). NOT `nwr/` — `railway=*` NODES (level_crossings, buffer_stops, signals) carry no
  // line and would be dropped by `--geometry-types linestring` after costing a pass. The client
  // (contextRail.ts) keeps only the active rail classes (rail/light_rail/subway/tram/…) and skips
  // platform/construction/abandoned/disused. Cheap linework — same zoom range + drop-densest as roads.
  { id: 'rail',      filter: ['w/railway'],                                       geom: 'linestring',         minz: 10, maxz: 16, extra: ['--drop-densest-as-needed'] },
  // §FORMA-CTX-TREES (L-642 Phase C — SPEC §2). Individually-mapped street/park trees as POINTS
  // (`n/natural=tree` — NODES ONLY; `--geometry-types point`). Canopy AREAS (natural=wood /
  // landuse=forest) already ride the `parks` layer, so this layer is strictly the point trees the
  // client instances as capped low-poly canopy blobs (ADR-0094: one Primitive, nearest-first cap —
  // trees are the most numerous element, so instancing is mandatory). NOT `nwr/` — only nodes carry a
  // `natural=tree` point. Trees only read at close zoom, so bake z14–16 (not z10) to bound tile bytes,
  // and `--drop-densest-as-needed` caps a pathologically tree-dense tile at source (the client also
  // caps nearest-first, so a dropped far tree is never visible). Point geometry: the tile reader
  // (contextTiles.ts, LAYER_IS_POINT) carries single-vertex features for this layer only.
  { id: 'trees',     filter: ['n/natural=tree'],                                  geom: 'point',              minz: 14, maxz: 16, extra: ['--drop-densest-as-needed'] },
  // §STREET-LIFE (L-12936, founder 2026-09-05: "would it be possible to add everywhere pedestrians but
  // also street lighting etc?") — STREET FURNITURE as POINTS. The 3D Site draws the street lamps as
  // instanced 6 m posts; benches, bus stops and bicycle parking ride along because they come free from
  // the same pass and are what a "street life" layer means next.
  //
  // WHY THE LAYER EXISTS AT ALL, given the client also SYNTHESISES lamps along the road ribbons: the
  // synthesised ones are SCENERY and are labelled so (§CONTEXT-DATA-HONESTY, C57 §1.5/§1.9). Where OSM
  // actually maps the lighting — and much of northern Europe does, node by node — the REAL positions
  // must win, and `placeLamps` gives them the way: a road with a mapped lamp within 60 m gets no
  // synthesis at all. Without this layer the client could only ever guess, everywhere, with no way to
  // tell a guess from a fact.
  //
  // `n/` (NODES only) — street furniture is mapped as nodes; a `nwr/` filter would drag in the shelter
  // WAYS around bus stops and the bicycle-parking areas, which `--geometry-types point` then discards
  // after paying for them. z15–16 (finer than trees' z14): a 6 m post is only ever read at close zoom,
  // and the tile bytes stay bounded. `--drop-densest-as-needed` caps a pathologically furnished tile at
  // source; the client caps nearest-first as well.
  //
  // ⚠ optional: true — AND THIS IS LOAD-BEARING, not tidiness. `merge-tiles.mjs` step 3 refuses the
  // WHOLE merge, by name, when any EXPECTED region has no staged set for a NON-optional layer, because
  // the R2 publish is a sync that REPLACES the archive and an absent region is a deleted region. A new
  // layer is absent for all 49 staged regions on the day it is added, so shipping `furniture` as
  // non-optional would have refused every merge until a full re-bake landed — the §PENDING-HEIGHTS
  // shape (L-12937), where two regions' missing rows stranded twelve regions' heights in staging.
  // Optional makes the gap NAMED AND SKIPPED instead: regions bake it as they are re-baked, and the
  // client's absent-layer path (contextFurniture `state: 'absent'`) is already an honest EMPTY that
  // still synthesises lighting off the roads. Drop `optional` only once every region has staged it.
  { id: 'furniture', filter: ['n/highway=street_lamp', 'n/amenity=bench', 'n/highway=bus_stop', 'n/amenity=bicycle_parking'], geom: 'point', minz: 15, maxz: 16, optional: true, extra: ['--drop-densest-as-needed'] },
  // §SEA-BAKE-POLYGONS (lane SEA-BAKE, 2026-09-05) — the SEA as closed POLYGONS, its own layer + archive.
  // `source` (not `filter`): this layer is NOT cut from the Geofabrik pbf. It is the osmdata
  // "water-polygons-split-4326" product (osmcoastline's closed planet coastline, split on a grid, WGS 84,
  // ODbL, ~904 MB zip — SEA_SOURCE in seaPolygons.mjs carries the probe), downloaded ONCE per run, clipped
  // to every region's bbox in ONE streaming pass by clipWaterPolygonsToRegions, and tippecanoe'd as
  // polygons. The client (contextWater.ts) reads `sea` polygons DIRECTLY when the layer exists — no
  // coastline walk, no live Overpass supplement — and keeps the walk + supplement only as the fallback
  // when the layer is absent. `w/natural=coastline` stays in the water layer for that fallback.
  //   • z8–z14: the client reads the sea over CONTEXT_SEA_HALF_DEG (0.10°, ~11 km) at ≤ 64 tiles, so z14
  //     is the finest it ever asks for; z16 would only multiply near-empty ocean tiles.
  //   • --buffer=0: the reader draws every per-tile piece as its own polygon; a zero buffer makes the
  //     pieces abut exactly instead of overlapping by the default 5/4096 of a tile (a same-height,
  //     same-colour overlap strip z-fights). --no-tiny-polygon-reduction: never replace a small sea
  //     sliver with a dot. --drop-densest-as-needed: the §WATER-TILE-CAP class — a z8 fjord tile must
  //     degrade, not kill the run.
  //   • optional: true — a landlocked region (switzerland, austria, czechia, …) yields ZERO polygons
  //     and NO sea.pmtiles; stage-manifest records it under `optionalLayersNotProduced` and merge-tiles
  //     names it and skips it instead of refusing. "No sea here" is an absence, never an empty artefact.
  { id: 'sea',       source: 'osmdata-water-polygons',                            geom: 'polygon',            minz: 8,  maxz: 14, optional: true, extra: ['--drop-densest-as-needed', '--no-tiny-polygon-reduction', '--buffer=0'] },
  // §VEG-REAL-CANOPY-BAKE (L-12935, founder 2026-09-05: "real vegetation everywhere in Europe + USA +
  // Australia + NZ + Middle East, not only OSM-mapped trees"). One POINT per ~12 m cell where a
  // MEASURED tree-cover raster reads ≥ 30 % crown cover — Copernicus HRL Tree Cover Density 2018
  // (10 m, EEA39), NLCD Tree Canopy Cover 2021 (30 m, USA), Hansen/UMD Global Forest Change 2023
  // treecover2000 (30 m, everywhere else). `source` (not `filter`): nothing here is cut from the
  // Geofabrik pbf, so a `--layer canopy` run needs NO country extract at all.
  //
  // ⚠ `optIn: true` — this layer is NEVER in the default bake. It is a THIRD vegetation source
  // alongside `trees` (mapped OSM nodes) and contextCanopySynth's woods fill, its per-region cost is
  // large, and its scope is bounded (canopy.mjs refuses a region over 2,500 km² by name rather than
  // baking a fraction). Ask for it explicitly: `--layer canopy --region paris`.
  //
  // z13–16, not z14: canopy reads at the same distance as parks, one zoom wider than `trees`, and a
  // sampled point set degrades gracefully. `--drop-densest-as-needed` is mandatory here, not
  // precautionary — a closed-canopy tile is ~60 points/ha by construction.
  { id: 'canopy',    source: 'canopy-raster',                                     geom: 'point',              minz: 13, maxz: 16, optional: true, optIn: true, extra: ['--drop-densest-as-needed'] },
];

// ── args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const DRY = args.includes('--dry-run');
// §SYNC-SWITCH (2026-09-02) — `--regions-json`: print the region/layer tables as ONE machine-readable
// JSON object on stdout and exit, running NOTHING. Consumed by merge-tiles.mjs (the per-region-bake +
// merge/publish switch this file's own §BAKE-MULTI-REGION comment designed) so the merge job resolves
// "expect=all" from THIS table — the single source of truth — instead of a hand-copied list that rots
// (the CLAUDE.md count/range lesson, applied to regions). Composes with `--region` (the resolved
// subset is reported in `regions`) and with `--layer`.
const REGIONS_JSON = args.includes('--regions-json');
// §OFFICIAL-FOOTPRINTS (L-12939) — `--footprints official` swaps the buildings layer's FOOTPRINTS
// for the national register's, for every region that declares a `footprintSource`. The default
// 'osm' is the path every run has always taken and is byte-identical: `footprintMergeMode` returns
// 'osm' and the merge module is never entered. Mirrors the workflow's `footprints` input.
const FOOTPRINTS = (() => {
  const i = args.indexOf('--footprints');
  if (i < 0) return 'osm';
  const raw = args[i + 1];
  if (raw !== 'osm' && raw !== 'official') {
    console.error(`✖ --footprints must be 'osm' or 'official' (got ${raw ?? 'nothing'})`);
    process.exit(2);
  }
  return raw;
})();
const ONE = args.includes('--layer') ? args[args.indexOf('--layer') + 1] : null;
// §VEG-REAL-CANOPY-BAKE — an `optIn` layer (today: `canopy`) is EXCLUDED from the default bake and
// reachable only by naming it in `--layer`. The default run is therefore unchanged by its existence.
const layers = ONE ? LAYERS.filter((l) => l.id === ONE) : LAYERS.filter((l) => !l.optIn);

// ─────────────────────────────────────────────────────────────────────────────
// §BAKE-BY-REGION (2026-08-01) — `--region <a,b,c>`: bake a SUBSET of REGIONS.
//
// WHY THIS EXISTS, measured rather than assumed. Run 30706761446 (`--layer buildings`, whole world)
// was CANCELLED at the 180-minute job timeout with tippecanoe at **99.9 %** on the national tiling.
// Everything after `Bake` — the measured-height gate, the artifact upload, the R2 publish — was
// SKIPPED, so ~4 hours produced ZERO published tiles. The work was essentially done and thrown away
// at the last step.
//
// ⚠ AND THE LOSS WAS REAL, NOT HYPOTHETICAL: that same run's height joins had ALREADY SUCCEEDED —
// denmark stamped 257,829/320,931 footprints and koln 118,603/141,271 — and every one of those
// measured heights died with the job.
//
// `--layer` was the only existing scope lever and it was already at its narrowest (`buildings`).
// The bake is a LOOP OVER REGIONS, so the region axis is the one that actually divides the work:
// a per-country run publishes in minutes instead of racing a timeout across the whole planet.
//
// ⚠ PARTIAL-PUBLISH SEMANTICS — READ BEFORE USING. The R2 publish is an `aws s3 sync` of
// `tools/context-bake/out`, and each layer is ONE global `.pmtiles` file, NOT one per region. A
// region-scoped run therefore produces a tileset containing ONLY those regions, and syncing it
// REPLACES the published one. That is correct for a rebuild sequence, and WRONG as a casual partial
// run: baking `--region spain` alone and publishing would delete Köln and Copenhagen from the map.
// Sequence per-region runs and publish only the final, complete artifact — or accept the replacement
// deliberately. The measured-height gate still applies to whatever subset ran.
const REGION_FILTER = (() => {
  const i = args.indexOf('--region');
  if (i < 0) return null;
  const raw = args[i + 1];
  if (!raw || raw.startsWith('--')) {
    console.error('✖ --region needs a value, e.g. --region spain or --region spain,denmark');
    process.exit(2);
  }
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
})();

/** The regions THIS run bakes. Unfiltered ⇒ every region, i.e. byte-identical to the old behaviour. */
const REGIONS = (() => {
  if (!REGION_FILTER) return ALL_REGIONS;
  const known = new Set(ALL_REGIONS.map((r) => r.name));
  // ⚠ FAIL LOUD ON A TYPO. A silently-empty region set would bake nothing, publish an EMPTY tileset
  // over the good one, and report success — the §SIZE-IS-NOT-PROVENANCE failure with a new cause.
  const unknown = REGION_FILTER.filter((n) => !known.has(n));
  if (unknown.length > 0) {
    console.error(`✖ --region: unknown region(s) [${unknown.join(', ')}].`);
    console.error(`  known: ${[...known].join(', ')}`);
    process.exit(2);
  }
  const picked = ALL_REGIONS.filter((r) => REGION_FILTER.includes(r.name));
  if (!REGIONS_JSON) { // §SYNC-SWITCH — keep stdout pure JSON in --regions-json mode.
    console.log(`▶ §BAKE-BY-REGION — scoped to ${picked.length}/${ALL_REGIONS.length} region(s): ${picked.map((r) => r.name).join(', ')}`);
    console.log('  ⚠ the published tileset will contain ONLY these regions (one global .pmtiles per layer,');
    console.log('    and the R2 publish is an s3 sync that REPLACES it). Do not publish a partial run unless');
    console.log('    you intend to replace the whole map with this subset.');
  }
  return picked;
})();
// §MEASURED-HEIGHT-GATE (L-658) — escape hatch for the gate below. Use ONLY when you deliberately
// want a tileset with no measured heights (e.g. bisecting a bake); never in CI.
const ALLOW_UNMEASURED = args.includes('--allow-unmeasured');

// §MEASURED-HEIGHT-GATE — every region that DECLARES a `heightJoin` records its outcome here, and
// `assertMeasuredHeights()` turns "the join produced nothing" into a NON-ZERO EXIT.
//
// WHY THIS EXISTS. The 2026-08-01 whole-layer bake (run 30687958478) reported SUCCESS — every step
// green, including "Assert the tiles are real" — while shipping a buildings.pmtiles in which
// Barcelona, Köln AND Copenhagen carried ZERO measured heights. That assertion only checked the
// tileset's SIZE (>50 KB) and its PMTiles magic header, so a 2.3 GB file full of fabricated 9 m
// defaults sailed straight through. Size is not provenance. This gate asserts the thing the bake
// actually exists to produce: MEASURED heights on the regions that claim them.
const heightJoinOutcomes = [];

// ─────────────────────────────────────────────────────────────────────────────
// §HEIGHT-STAMP-BUDGET (L-659, 2026-08-01) — WHERE a region's height join is allowed to hold
// footprints in memory, and the PREFLIGHT that refuses to start a bake that cannot finish.
//
// WHY. Run 30693132326 (sha bb92b276) burned 23 minutes and then died with
//   `FATAL ERROR: Ineffective mark-compacts near heap limit — JavaScript heap out of memory` (exit 134)
// on the whole-Spain height join. Nothing before that moment said anything was wrong: the plan step
// was green, 23 of 24 regions clipped, and the crash's native stack named no region. The measured
// cost is ~1.26 kB of V8 heap per parsed OSM footprint, so a national footprint set needs >10 GB —
// which is why `--max-old-space-size` alone is a PALLIATIVE, not a fix (see heightSources.mjs
// §JOIN-BOUNDED-WORKING-SET). The fix is to declare, per region, the bboxes the join will actually
// stamp; everything outside streams through with its honest OSM tags and never touches the heap.
//
// A whole-country region MUST therefore declare a stamp list. `assertHeightStampBudget()` below
// checks that in ~2 ms, in the `--check` step, BEFORE a single byte is downloaded.
const WHOLE_COUNTRY_DEG2 = 4.0;          // a region bigger than ~2°×2° is national scale, not a city.
// §MDS-NATIONAL-SWEEP (L-12946) — the declared wall-clock slice of the 330-minute job the Spanish
// national height sweep may spend. Override with MDS_SWEEP_BUDGET_MIN on the dispatch. It is a
// BUDGET, not an estimate: when it runs out the sweep stops in ORDER and says exactly where, in km²
// and in a resume cursor. Measured per-cell cost 2026-09-06: one 0.115°×0.09° GetCoverage is
// ~28 MB and 1.8–7.8 s from a domestic link (17.6 MB / 1.8–7.8 s at 0.08° square), decoded in
// 0.2–3.1 s — so 4-way concurrency buys ~4× and Spain's ~5–7k populated cells still do not fit a
// serial run. Do NOT raise this past what leaves tippecanoe its share; a job that dies at 330 min
// publishes nothing at all.
const MDS_SWEEP_BUDGET_MIN = Number(process.env.MDS_SWEEP_BUDGET_MIN ?? 120) || 120;
const HEAP_BYTES_PER_FOOTPRINT = 1256;   // MEASURED — geojsonseqRead.spec.ts §heap-budget.
const HEAP_FLOOR_MB_NATIONAL = 6000;     // headroom for the retained metro set + tippecanoe's host.

/**
 * The bboxes a region's height join may HOLD footprints for. `null` → the whole region bbox
 * (correct and unchanged for every city-sized region). A whole-country region resolves to its
 * source's city list, so the join's working set is bounded by the cities, not the nation.
 */
function stampBboxesFor(r) {
  if (Array.isArray(r.heightStampBboxes)) return r.heightStampBboxes;
  if (r.heightJoin === 'bev_at') return AT_CITY_BBOXES.map((c) => c.bbox);    // §BEV-ALS-OSM-JOIN (HEIGHTS-AT-CZ-SI) — whole `austria`, five cities
  if (r.heightJoin === 'cuzk_cz') return CZ_CITY_BBOXES.map((c) => c.bbox);   // §CUZK-NDSM-OSM-JOIN (HEIGHTS-AT-CZ-SI) — whole `czechia`, five cities
  if (r.heightJoin === 'gurs_si') return SI_CITY_BBOXES.map((c) => c.bbox);   // §GURS-KN-OSM-JOIN (HEIGHTS-AT-CZ-SI) — whole `slovenia`, five cities
  if (r.heightJoin === 'ad_ndsm') return AD_CITY_BBOXES.map((c) => c.bbox);   // §ADSDI-NDSM-OVERTURE-JOIN (ME-ABUDHABI-I3S) — `gccstates` row since §ME-NATIONAL, island core only (≈ 55 s per populated cell)
  // §MDS-NATIONAL-SWEEP (L-12946, 2026-09-06) — `spain` retains the WHOLE COUNTRY, not a city list.
  // This row used to read `MDS_CITY_BBOXES.map(...)`, and that WAS the defect the founder hit at
  // Ciudad Real: the nine metros were the only ground in Spain that could ever be measured, and a
  // footprint outside them shipped an honest `assumed` 9 m that is indistinguishable on the map from
  // "no data here". The heap is bounded now by SWATHE PASSES inside the join (one band of tile rows
  // held at a time — heights/mdsNational.mjs §MDS-SWATHE), not by narrowing where we are allowed to
  // measure. `MDS_PRIORITY_BBOXES` keeps the metros stamped FIRST and UNCAPPED.
  if (r.heightJoin === 'mds') return MDS_NATIONAL_BBOXES;
  if (r.heightJoin === 'dhm') return DHM_CITY_BBOXES.map((c) => c.bbox);
  if (r.heightJoin === 'mnh_fr') return MNH_FR_CITY_BBOXES.map((c) => c.bbox); // §MNH-FR (L-12910) — whole `france`
  if (r.heightJoin === 'swiss') return SWISS_CITY_BBOXES.map((c) => c.bbox);   // §SWISS-OSM-JOIN (L-12883) — whole `switzerland`
  if (r.heightJoin === 'au_open') return AU_OPEN_CITY_BBOXES.map((c) => c.bbox); // §AU-OPEN-HEIGHTS-OSM-JOIN — whole `victoria`, Melbourne LGA only
  if (r.heightJoin === 'ealidar_gb') return EA_LIDAR_GB_CITY_BBOXES.map((c) => c.bbox); // §EA-LIDAR-GB-OSM-JOIN — whole `greatbritain`, England working set
  if (r.heightJoin === '3dbag') return NL_3DBAG_CITY_BBOXES.map((c) => c.bbox);   // §NL-3DBAG-OSM-JOIN — whole `netherlands`, six cities
  if (r.heightJoin === 'ndh_no') return NO_NDH_CITY_BBOXES.map((c) => c.bbox);   // §NDH-NO-OSM-JOIN (HEIGHTS-NORDICS) — whole `norway`
  if (r.heightJoin === 'ee_etak') return EE_CITY_BBOXES.map((c) => c.bbox);      // §EE-ETAK-OSM-JOIN (HEIGHTS-EE-PL-PT-BE) — whole `estonia`, four cities
  if (r.heightJoin === 'be_dhmv') return BE_CITY_BBOXES.map((c) => c.bbox);      // §BE-DHMV-OSM-JOIN (HEIGHTS-EE-PL-PT-BE) — whole `belgium`, five cities
  // (`us_open` had a branch here until 2026-09-06 — `US_OPEN_CITY_BBOXES.filter((c) => c.region === r.name)`,
  // the metro's OWN box. No row declares that key now; the three CITY channels are served per footprint by
  // the `usas` stamp instead, which is why US_OPEN_CITY_BBOXES is still imported above.)
  // §USAS-NATIONAL-SWEEP (2026-09-06, lane USA-HEIGHTS-NATIONAL) — `usas` retains the WHOLE COUNTRY,
  // not a city list, for exactly the reason `mds` does above: a retain set narrower than the ground a
  // user can drop a site on is a PERMANENT, SILENT hole, because an unstamped footprint ships an
  // honest `assumed` 9 m that is indistinguishable from "the source has no data here" (L-12946 /
  // L-12947). Four boxes — CONUS, Alaska, Hawai'i, Puerto Rico — each chosen to CONTAIN every
  // §BAKE-US-STATES row it serves, so no baked US ground is outside the join's reach. The two rows
  // deliberately left out (`alaskaaleutians`, `usvirginislands`) are measured-zero at the source and
  // must not declare this join — see US_NATIONAL_NO_HEIGHT_ROWS in heights/usOpenHeights.mjs.
  if (r.heightJoin === 'usas') return US_NATIONAL_BBOXES.map((c) => c.bbox);
  if (r.heightJoin === 'ca_open') return CA_OPEN_CITY_BBOXES.filter((c) => c.region === r.name).map((c) => c.bbox); // §CA-OPEN-HEIGHTS-OSM-JOIN — the PROVINCE's own city (britishcolumbia→vancouver, ontario→toronto); filtered like us_open because the two jurisdictions sit in DIFFERENT bake rows
  if (r.heightJoin === 'lod2de') return DE_LOD2_CITY_BBOXES.map((c) => c.bbox);   // §DE-LOD2-LAENDER-OSM-JOIN — whole `germany`, one city per WIRED Land
  if (r.heightJoin === 'plateau_jp') return JP_CITY_BBOXES.map((c) => c.bbox);    // §PLATEAU-JP-OSM-JOIN (JAPAN-FULL) — whole `japan`, ten cities (38 PLATEAU municipalities cover them, MEASURED 2026-09-06)
  return null;
}

// §FOOTPRINT-BUDGET (L-12939) — the working set a region's OFFICIAL FOOTPRINT pull covers lives on
// the FOOTPRINT_SOURCES row (`defaultBboxes`), NOT in a resolver here. It was briefly both: a
// `footprintBboxesFor(r)` twin sat here, called by nothing, while the preflight and the pull each
// read the table — two rival answers to "which bboxes", one of them dead, exactly the split this
// lane's own header warns about. Deleted 2026-09-06; the table is the single source.
//
// The reason a bounded set exists at all is unchanged, and is the §HEIGHT-STAMP-BUDGET lesson:
// Córdoba's municipality ZIP alone inflates to 597 MB of GML and parses in ~250 s, and the whole
// Spanish feed is 5.66 GB of ZIP across 7,597 municipalities (HEAD-swept 2026-09-05) — ~17 h
// against this workflow's 330-minute ceiling. An unbounded whole-country pull is not a cost to
// discover at hour four of a bake. ⚠ SPAIN DELIBERATELY REUSES MDS_CITY_BBOXES rather than
// declaring a second list: if the footprint set and the measured-height set could drift apart, a
// city would get Catastro footprints with no MDS heights (or the reverse) and nothing would say so.

// §NATIONAL-STAMP-TABLE (2026-09-05, lane HEIGHTS-NORDICS) — joins wired AFTER the dispatch chain in
// pushBuildingsWithNationalHeights froze. That chain has NO free insertion point any more:
// auOpenHeightsWiring.spec.ts pins its front (`if (r.heightJoin === 'au_open' || 'mds' || 'dhm'`),
// mnhFr.spec.ts its middle and swissWiring.spec.ts its `'swiss')` end — a seventh key breaks one pin
// whichever side it goes on (04b0330b's `'3dbag' ||` at the front broke the AU pin; it is a row here now). Newer joins are therefore rows
// here (stamp function + the city working set stampBboxesFor returns for the key) and dispatch BEFORE
// the chain through the SAME outcome bookkeeping (recordNationalStampOutcome), so the
// §MEASURED-HEIGHT-GATE sees them exactly as it sees mds/dhm/swiss. Retained working set = the city
// list, uncapped (the swiss/au_open guarantee), so no priority list is needed.
const NATIONAL_STAMP_TABLE = {
  // §NL-3DBAG-OSM-JOIN — whole `netherlands`: one keyless WFS GetFeature per populated 0.01° cell (a 2,443-pand
  // Amsterdam cell answers whole, 1.9 MB / 0.6 s), joined to bake's footprints by majority-inside / centroid-in-part
  // (heights/nl3dbagStamp.mjs). §CI-GREEN 2026-09-05: 04b0330b had prepended `'3dbag' ||` to the pinned chain and
  // broke auOpenHeightsWiring.spec.ts's front pin; the key moved here, where the retained working set
  // (NL_3DBAG_CITY_BBOXES, ~10² populated cells against maxTiles 20000) is stamped uncapped without a priority list.
  '3dbag': { stamp: stampNl3dbagHeightsOnGeojsonseq, bboxes: NL_3DBAG_CITY_BBOXES },
  // §BEV-ALS-OSM-JOIN — whole `austria`: BEV ALS DSM − DTM 1 m COG windows, keyless (heights/atHeightsStamp.mjs).
  bev_at: { stamp: stampAtHeightsOnGeojsonseq, bboxes: AT_CITY_BBOXES },
  // §CUZK-NDSM-OSM-JOIN — whole `czechia`: ČÚZK DMP 1G − DMR 5G exportImage, keyless (heights/czHeightsStamp.mjs).
  cuzk_cz: { stamp: stampCzHeightsOnGeojsonseq, bboxes: CZ_CITY_BBOXES },
  // §GURS-KN-OSM-JOIN — whole `slovenia`: GURS KN STAVBE H2 − H3 register heights, keyless WFS (heights/siHeightsStamp.mjs).
  gurs_si: { stamp: stampSiHeightsOnGeojsonseq, bboxes: SI_CITY_BBOXES },
  // §ADSDI-NDSM-OVERTURE-JOIN — the `gccstates` row (was `abudhabi` until §ME-NATIONAL; the WORKING SET is unchanged —
  // AD_CITY_BBOXES, Abu Dhabi island): DGE 50 cm DSM3 − DTM exportImage, keyless, catalogued Open Data
  // (heights/abudhabiNdsmStamp.mjs). Photogrammetric, not LiDAR — named in heightSource. The I3S city model is NOT read.
  ad_ndsm: { stamp: stampAdNdsmHeightsOnGeojsonseq, bboxes: AD_CITY_BBOXES },
  // §NDH-NO-OSM-JOIN — whole `norway`: Kartverket NHM DOM − DTM, keyless (heights/noHeightsStamp.mjs).
  ndh_no: { stamp: stampNoNdhHeightsOnGeojsonseq, bboxes: NO_NDH_CITY_BBOXES },
  // §EE-ETAK-OSM-JOIN — whole `estonia`: ETAK e_401_hoone_ka korgus_m per OSM footprint, keyless WFS (heights/eeHeightsStamp.mjs).
  ee_etak: { stamp: stampEeEtakHeightsOnGeojsonseq, bboxes: EE_CITY_BBOXES },
  // §BE-DHMV-OSM-JOIN — whole `belgium`: DHMV II DSM 1 m − DTM 1 m per 500 m Lambert-72 tile, keyless WCS (heights/beHeightsStamp.mjs).
  be_dhmv: { stamp: stampBeDhmvHeightsOnGeojsonseq, bboxes: BE_CITY_BBOXES },
  // ⛔ THE `us_open` KEY WAS REMOVED HERE 2026-09-06 (lane USA-HEIGHTS-NATIONAL) — NOT as tidying, and the
  // three CITY channels it named are NOT gone. NYC height_roof (ft), DataSF hgt_maxcm (LiDAR zonal max, cm)
  // and Boston BPDA BLDG_HGT_2010 (ft) are all still read, VERBATIM, from the SAME adapters in
  // heights/usOpenHeights.mjs — the `usas` stamp below resolves them FIRST per footprint
  // (`usOpenChannelForPoint`). What went is the KEY, because a row declaring it reached only its own metro
  // box and left the rest of that state on the 9 m carpet. ⚠ heights/usOpenHeightsStamp.mjs is therefore
  // now imported by NOTHING: a NAMED orphan, not a hidden one. Its 171 lines are superseded by
  // heights/usasNationalStamp.mjs (which is the same stamp plus an ordered sweep, a resume cursor and
  // bounded-heap swathes); deleting it belongs to the lane that wrote it (HEIGHTS-US), not to this one.
  // §USAS-NATIONAL-HEIGHTS — the WHOLE UNITED STATES: FEMA/ORNL "USA Structures" HEIGHT (metres, the NGA
  // LiDAR-derived subset of 135,321,228 structures), ONE keyless CC-BY-4.0 ArcGIS FeatureServer, swept in
  // deterministic south→north order at 0.02° with a resume cursor (USAS_SWEEP_CURSOR) and loud truncation
  // (heights/usasNationalStamp.mjs). A height implies SOURCE='NGA' and the ORNL half NEVER carries one, so an
  // unmeasured footprint gets NOTHING — never a modelled number (Overture's and Microsoft's US heights are
  // ESTIMATES that saturate at ~34.7 m and are deliberately NOT wired; US_NATIONAL_ASSESSED carries the exact
  // HTTP answers). NYC / SF / Boston keep their OWN city channel inside their own bboxes
  // (usOpenChannelForPoint), because USA Structures under-reads tall towers — same Midtown cell, NYC 270.6 m
  // vs USAS 170.5 m. ⭐ CLOSED THE SAME DAY IT WAS OPENED: this comment used to end "⚠ OWED … the three rows
  // that declare heightJoin:'us_open' (newyork / california / massachusetts) still reach ONLY their city
  // bbox … Left to the lane that owns those rows." This IS that lane, and leaving a founder-visible hole
  // ("all EEUU — I want complete country coverage") as an owed note inside the commit that could close it
  // would have been the §AUTHORED-BUT-UNWIRED shape. All three moved to 'usas'; the city channels still win
  // per footprint; Buffalo / Fresno / Sacramento / Worcester were count-probed non-zero first.
  // ⚠ THE HEAP BOUND IS PART OF THE WIRING, not an optimisation: `usas` retains the whole COUNTRY, so a
  // whole-STATE row is streamed one §USAS-SWATHE band at a time. Without it California's retain pass is the
  // 4.04 GB abort of run 30693132326 with a bigger input, and an `error` here EXITS 4.
  usas: { stamp: stampUsasNationalHeightsOnGeojsonseq, bboxes: US_NATIONAL_BBOXES, opts: { swatheRows: USAS_SWATHE_ROWS } },
  // §EA-LIDAR-GB-OSM-JOIN — whole `greatbritain`: EA First-Return DSM − DTM per OS 1 km square, England working set
  // (heights/ealidarGbStamp.mjs). Scotland squares are refused before any request (outside the served envelope);
  // Wales answers zero-fill and is counted as VOID, never ground.
  ealidar_gb: { stamp: stampEaLidarGbHeightsOnGeojsonseq, bboxes: EA_LIDAR_GB_CITY_BBOXES },
  // §DE-LOD2-LAENDER-OSM-JOIN — whole `germany`: the per-Land LoD2-DE router (ten keyless doors — 1 km / 2 km
  // CityGML tiles in UTM32/33 as plain gml, zips, range-read entries of Hamburg's one archive, Sachsen-Anhalt's
  // WFS, and Niedersachsen's S3-listed bucket) behind ONE NRW-shaped stamp; a Land whose index is down is named as BLOCKED for the run while
  // the others still stamp (heights/deLod2LaenderStamp.mjs). Working set DE_LOD2_CITY_BBOXES = wired Länder only.
  lod2de: { stamp: stampDeLod2LaenderHeightsOnGeojsonseq, bboxes: DE_LOD2_CITY_BBOXES },
  // §PLATEAU-JP-OSM-JOIN — whole `japan`: MLIT Project PLATEAU LoD1 `bldg:measuredHeight` read out of the SERVED
  // 3D-Tiles b3dm BATCH TABLES by HTTP range GET (28 B header, then the attribute prefix — no glTF, no texture, and
  // never the 2.11 GB per-ward CityGML zip), joined to bake's OWN OSM footprints by building centroid. Keyless
  // (PDL 1.0, CC BY 4.0 compatible). Working set JP_CITY_BBOXES = ten cities; 38 PLATEAU municipalities cover them
  // (MEASURED 2026-09-06: 2,571 b3dm leaf tiles across 37 of them, mean attribute prefix 2.52 MB → ~6.5 GB for the
  // whole working set, bounded by `maxBytesMB` and read at concurrency 6). ⛔ 台東区 (13106) ships 3D Tiles 1.1
  // `.glb` and is a NAMED REFUSAL with a count, never a silent skip (heights/jpPlateau.mjs `tileFormatOf`).
  plateau_jp: { stamp: stampJpPlateauHeightsOnGeojsonseq, bboxes: JP_CITY_BBOXES },
  // §CA-OPEN-HEIGHTS-OSM-JOIN — the `britishcolumbia` + `ontario` rows: City of Vancouver's 2009 LiDAR
  // element stack (topelev_m − baseelev_m, Opendatasoft, no row cap) and City of Toronto's DERIVED_HEIGHT
  // (the city's own ArcGIS, maxRecordCount 2000 — a truncated 200 is counted as an ERROR, never a partial
  // success), one metre per OSM footprint from the elements it contains (heights/caOpenHeightsStamp.mjs).
  // stampBboxesFor filters CA_OPEN_CITY_BBOXES to the row's OWN province, exactly as us_open does.
  ca_open: { stamp: stampCaOpenHeightsOnGeojsonseq, bboxes: CA_OPEN_CITY_BBOXES },
};

/**
 * §MEASURED-HEIGHT-GATE — record a national stamp's outcome BEFORE degrading, so a silent fallback still
 * fails; then push either the stamped file (REPLACE) or the plain OSM clip (honest default). Shared by
 * the pinned dispatch chain and NATIONAL_STAMP_TABLE so both paths feed the gate identically.
 */
function recordNationalStampOutcome(r, res, stamped, baseGeo, geos) {
  heightJoinOutcomes.push({
    region: r.name, join: r.heightJoin, status: res.status,
    measuredCount: res.measuredCount ?? 0, footprintCount: res.footprintCount ?? 0, reason: res.reason ?? null,
    // §SOURCE-OUTAGE-VS-PIPELINE-DEFECT (L-659) — the gate below needs these to tell "the remote
    // raster service refused every request" from "our join is broken". They are different failures
    // with different owners, and collapsing them is the §CONTEXT-DATA-HONESTY mistake one level up.
    tilesProcessed: res.tilesProcessed ?? 0, tileErrors: res.tileErrors ?? 0,
    // §ABORT-IS-NOT-A-CAP — a join that THREW mid-sweep still returns `ok` with whatever it
    // stamped, so without this the gate below sees `measuredCount > 0` and passes it green. That
    // is how Spain shipped 16 tiles of heights while reporting a benign 20,000-tile cap.
    sweepAborted: res.sweepAborted === true, sweepAbortReason: res.sweepAbortReason ?? null,
    retainedFootprints: res.retainedFootprints ?? null, passedThroughFootprints: res.passedThroughFootprints ?? null,
    peakHeapUsedMB: res.peakHeapUsedMB ?? null,
  });
  if (res.status === 'ok' && res.measuredCount > 0) {
    geos.push(stamped); // REPLACE the plain OSM clip with the height-stamped SAME footprints.
    console.log(`\n▶ national heights · ${r.name}: ${r.heightJoin.toUpperCase()} join — ${res.measuredCount}/${res.footprintCount} ` +
      `OSM footprint(s) stamped (tagged), ${res.tilesProcessed} tile(s) → REPLACE. ${res.note}`);
  } else {
    geos.push(baseGeo);
    console.log(`\n▶ national heights · ${r.name}: ${r.heightJoin.toUpperCase()} join ${res.status}` +
      `${res.reason ? ' — ' + res.reason : ''} (keeps OSM, honest assumed default)`);
  }
}
const bboxDeg2 = (bbox) => {
  const [w, s, e, n] = bbox.split(',').map(Number);
  return Math.abs((e - w) * (n - s));
};

/**
 * §HEIGHT-STAMP-BUDGET preflight — fail in SECONDS on the class of defect that used to fail in
 * 23 MINUTES with an undiagnosable V8 abort. Two assertions, both static:
 *   1. every whole-country region that declares a height join also declares a bounded stamp area;
 *   2. the Node heap is big enough for the retained set those bboxes imply.
 * Runs inside `--check`, so CI's cheap "Plan" step is the thing that catches it.
 */
function assertHeightStampBudget() {
  // §SEA-BAKE-POLYGONS (lane SEA-BAKE, 2026-09-05) — the national height stamp runs in exactly ONE
  // place: the `buildings` layer's push (`pushBuildingsWithNationalHeights`, "if (l.id ===
  // 'buildings')"). A run scoped AWAY from buildings — `--layer sea`, `--layer roads`, … — never
  // reaches it, so its heap floor cannot apply. It did anyway: `--layer sea --region france` exited 5
  // with "Node heap limit is 2349 MB … needs at least 6000 MB", refusing a run that allocates nothing
  // per footprint. A preflight that refuses a bake it is not describing is not a safety net, it is a
  // false refusal — and it would have blocked the FIRST sea dispatch. Scope it, by name.
  if (!layers.some((l) => l.id === 'buildings')) {
    console.log(`\n  height-stamp budget: SKIPPED — [${layers.map((l) => l.id).join(', ')}] does not include 'buildings',`
      + ' and the national height stamp runs only on that layer. No footprints are retained by this run.');
    return;
  }
  const joins = REGIONS.filter((r) => r.heightJoin);
  if (joins.length === 0) return;
  const heapLimitMB = Math.round(getHeapStatistics().heap_size_limit / 1e6);
  const problems = [];
  console.log('\n  height-stamp budget:');
  for (const r of joins) {
    const areas = stampBboxesFor(r);
    const national = bboxDeg2(r.bbox) > WHOLE_COUNTRY_DEG2;
    // §MDS-SWATHE-IS-THE-BOUND (L-12946) — one region now declares a stamp area as large as itself
    // (`spain` retains the whole country) and bounds its heap with SWATHE PASSES inside the join
    // instead. Printing "1 stamp bbox(es)" for that would read like a tight working set and be the
    // §SIZE-IS-NOT-PROVENANCE mistake in reverse, so the line says which bound is actually holding.
    const areaDeg2 = (areas ?? []).reduce((a, b) => a + Math.abs((b[2] - b[0]) * (b[3] - b[1])), 0);
    const wholeCountryRetain = areas !== null && areaDeg2 >= bboxDeg2(r.bbox) * 0.95;
    const scope = !areas ? 'WHOLE REGION bbox'
      : wholeCountryRetain ? `WHOLE-COUNTRY retain (${areaDeg2.toFixed(1)} deg²) — heap bounded by swathe passes, not by bbox`
        : `${areas.length} stamp bbox(es)`;
    console.log(`    · ${r.name.padEnd(11)} join:${String(r.heightJoin).padEnd(8)} ${bboxDeg2(r.bbox).toFixed(1)} deg²  → ${scope}`);
    if (national && !areas) {
      problems.push(`${r.name}: whole-country region (${bboxDeg2(r.bbox).toFixed(1)} deg²) declares heightJoin '${r.heightJoin}' `
        + 'but NO stamp bboxes. Its join would hold every footprint in the country in the V8 heap and abort the bake '
        + `(~${HEAP_BYTES_PER_FOOTPRINT} B/footprint — millions of them). Add a city list to stampBboxesFor(), or set `
        + 'heightStampBboxes on the region.');
    }
  }
  console.log(`    heap limit  : ${heapLimitMB} MB (~${Math.round((heapLimitMB * 1e6) / HEAP_BYTES_PER_FOOTPRINT / 1e6)} M footprints at ${HEAP_BYTES_PER_FOOTPRINT} B each)`);
  const anyNational = joins.some((r) => bboxDeg2(r.bbox) > WHOLE_COUNTRY_DEG2);
  if (anyNational && heapLimitMB < HEAP_FLOOR_MB_NATIONAL) {
    problems.push(`Node heap limit is ${heapLimitMB} MB but a whole-country height join is declared, which needs at least `
      + `${HEAP_FLOOR_MB_NATIONAL} MB of headroom. Set NODE_OPTIONS=--max-old-space-size=12288 on the bake job `
      + '(.github/workflows/context-bake.yml) — the default ~4 GB old-space is what run 30693132326 died at.');
  }
  if (problems.length === 0) { console.log('    ✔ every height join has a bounded working set and enough heap.'); return; }
  console.error('\n✖ HEIGHT-STAMP BUDGET FAILED — this bake would crash or hang partway through:');
  for (const p of problems) console.error(`  ✖ ${p}`);
  console.error('\n  Refusing to start. (This check exists because the SAME defect previously burned 23 minutes\n'
    + '  of runner time and died with a V8 heap abort that named nothing.)');
  process.exit(5);
}

// ── tool detection ─────────────────────────────────────────────────────────
function has(bin) {
  // (`probe`/`cmd` locals used to be computed here and then ignored — the real
  // invocation below builds its own argv. Dropped rather than left dangling.)
  try {
    const r = spawnSync(process.platform === 'win32' ? 'where' : 'sh',
      process.platform === 'win32' ? [bin] : ['-c', `command -v ${bin}`],
      { stdio: 'ignore' });
    return r.status === 0;
  } catch { return false; }
}
const LOCAL = { osmium: has('osmium'), tippecanoe: has('tippecanoe'), duckdb: has('duckdb') };
const DOCKER = has('docker');
const USE_LOCAL = LOCAL.osmium && LOCAL.tippecanoe;
const IMAGE = 'pryzm-context-bake';

// §BAKE-OVERTURE — is the Overture buildings path actually runnable? It needs DuckDB (local or in
// the Docker image, which the Dockerfile now bundles). If any region wants Overture but no DuckDB is
// reachable, we FAIL LOUD rather than silently baking a Barcelona-shaped hole where Riyadh should be.
const OVERTURE_RUNNABLE = USE_LOCAL ? LOCAL.duckdb : DOCKER; // Docker image carries duckdb (see Dockerfile)

// Wrap a toolchain command so it runs locally if the binaries exist, else in the Docker image
// with the out/ dir mounted at /work.
function tool(bin, argv) {
  if (USE_LOCAL) return { cmd: bin, argv };
  // Docker: mount OUT as /work; paths inside must be /work-relative.
  const rel = (p) => (p.startsWith(OUT) ? '/work' + p.slice(OUT.length).replace(/\\/g, '/') : p);
  return { cmd: 'docker', argv: ['run', '--rm', '-v', `${OUT}:/work`, IMAGE, bin, ...argv.map(rel)] };
}

function run(step, { cmd, argv }) {
  const line = `${cmd} ${argv.join(' ')}`;
  console.log(`\n▶ ${step}\n  ${line}`);
  if (DRY) return;
  execFileSync(cmd, argv, { stdio: 'inherit' });
}

// §BAKE-OVERTURE — build the DuckDB invocation that reads Overture buildings for one region's bbox
// and writes GeoJSONSeq mapped onto the OSM-style tags the client reader keys on. The output file is
// under OUT; in Docker mode OUT is mounted at /work, and the path is embedded INSIDE the `-c` SQL
// string (not a standalone argv), so `tool()`'s automatic OUT→/work rewrite does NOT reach it — we
// rewrite it here to the in-container path ourselves. The remote S3 URL is identical in both modes.
//
// COLUMN MAPPING (Overture → OSM tag the client reads, contextTiles.ts + contextBuildings.ts):
//   COALESCE(subtype,'yes') → `building`        — belongsToLayer() requires a `building` tag present.
//   height                  → `height`          — resolveHeight() reads `height` first → 'tagged'.
//   num_floors              → `building:levels`  — resolveHeight() falls back to it → 'derived-levels'.
// The bbox filter uses INTERSECTION (keeps footprints straddling the edge, matching Overpass bbox
// semantics + the client's ringIntersectsBbox). NOTE: the delta-table COUNTS in the eval doc used
// the simpler containment filter (`bbox.xmin/ymin BETWEEN …`); this intersection form is a small
// edge-margin superset (<1%). `--drop-densest-as-needed` on the tippecanoe side handles the extra.
function overtureBuildingsCmd(region, geoAbs) {
  const geoPath = USE_LOCAL
    ? geoAbs
    : '/work/' + geoAbs.slice(OUT.length + 1).replace(/\\/g, '/');
  const [minx, miny, maxx, maxy] = region.bbox.split(',').map(Number);
  const sql = [
    'INSTALL spatial; INSTALL httpfs; LOAD spatial; LOAD httpfs;',
    // Force ANONYMOUS S3 (public bucket) so a runner's ambient AWS creds are never used.
    "SET s3_region='us-west-2'; SET s3_access_key_id=''; SET s3_secret_access_key='';",
    `COPY (SELECT COALESCE(subtype,'yes') AS "building", height AS "height", num_floors AS "building:levels", geometry`
      + ` FROM read_parquet('${OVERTURE_BUILDINGS}', hive_partitioning=1)`
      + ` WHERE bbox.xmin <= ${maxx} AND bbox.xmax >= ${minx} AND bbox.ymin <= ${maxy} AND bbox.ymax >= ${miny})`
      + ` TO '${geoPath}' WITH (FORMAT GDAL, DRIVER 'GeoJSONSeq', SRS 'EPSG:4326');`,
  ].join(' ');
  return tool('duckdb', ['-c', sql]);
}

// §PHASE1-HEIGHTS (North Star §6.1) — join national REAL heights into the buildings layer, modularly
// and next to the Overture change (they co-locate here by design). `baseGeo` is the OSM/Overture
// buildings GeoJSONSeq already produced for region `r`. Per the dedup policy (CONTEXT-LOD-BUILD-PLAN
// §3), a FULL national source REPLACES the OSM clip (no double-draw at 9 m + real height); a PARTIAL
// source APPENDS. Anything other than an `ok` national result keeps the OSM/Overture footprints at the
// honest `assumed` default — never a fabricated height. Never throws; a source failure degrades to OSM.
// ─────────────────────────────────────────────────────────────────────────────
// §FOOTPRINT-SOURCE (L-12940) — the shared driver for a region row's `footprintSource`.
//
// A national FOOTPRINT source is not a national HEIGHT source and this file must not treat them as
// one. `heightJoin` keeps bake's OSM geometry and adds a measured `height` to it; `footprintSource`
// REPLACES the geometry with the national mapping agency's own. Only the second can answer "the
// buildings are not true size / not true shape" (L-12940, Jouy-en-Josas; L-12939, Cordoba).
//
// ONE DRIVER, ONE TABLE. footprints/footprintMerge.mjs documents the return shape both countries'
// writers produce, precisely so ES and FR cannot drift into private branches. Adding a country is
// adding a row here; it is never adding a code path.
//
// ⚠ `footprintMerge` HAS TO BE `replace-in-bbox`, and the two simpler modes are both WRONG:
//   • `replace`  — swaps the whole-country OSM clip for the covered cities and DELETES the rest of
//                  the country. The §BDTOPO-CAP-TRUNCATE lesson: completeness loss beats a missing
//                  attribute every time. (For Spain it would also delete the Basque Country and
//                  Navarra outright, which Catastro does not publish at all.)
//   • `append`   — draws every covered building TWICE, the register's true outline z-fighting with
//                  OSM's approximate one. That is the reported defect made worse, not better.
//
// ORDER: this runs AFTER pushBuildingsWithNationalHeights, on whatever file that pushed. The height
// join keeps working exactly as it does today, and inside the covered bboxes BD TOPO's own `hauteur`
// — cross-checked against the LiDAR MNH raster to a median |delta| of 0.73 m over the founder's two
// parcels — takes over, carrying `pryzm:height_src=measured-lidar` so the §MEASURED-HEIGHT-GATE
// still counts it.
//
// A FAILURE HERE IS NEVER SILENT AND NEVER FABRICATES: any status other than a real write leaves the
// height-joined file exactly as it was and says so BY NAME (§CONTEXT-DATA-HONESTY — an empty result
// and a refused endpoint are different values).
// ─────────────────────────────────────────────────────────────────────────────
// §OFFICIAL-FOOTPRINTS — resolved by frBdtopo.mjs so this lane adds no second `--footprints` parser.
// Default 'osm' = the path every run has always taken, byte-identical: the table is never entered.
const FR_FOOTPRINTS_MODE = footprintsModeFromArgv(args);

const FOOTPRINT_SOURCES = {
  fr_bdtopo: {
    label: 'IGN BD TOPO® batiment (Licence Ouverte)',
    defaultBboxes: () => FR_BDTOPO_CITY_BBOXES.map((c) => c.bbox),
    attribution: FR_BDTOPO.attribution,
    write: (outPath, bboxes, onArea) => writeBdtopoWorkingSet(outPath, bboxes, { onArea }),
  },
  // §ES-CATASTRO-FOOTPRINTS (L-12939) — Spain's row. ⚠ RESTORED 2026-09-06: this table and the
  // `spain` region row were written by two lanes an hour apart, and the ES row was MISSING from the
  // table while `ES_CATASTRO_FOOTPRINTS` sat imported-by-nothing at the top of this file — the
  // "authored-but-unwired" shape, but worse, because the §FOOTPRINT-BUDGET preflight below reads
  // this table and so refused `spain` for an EMPTY working set. The bake never got the chance to
  // ship OSM-with-a-hole; it refused to start at all, on the DEFAULT path, which would have failed
  // the Plan step of every context bake. esCatastroWiring.spec.ts now pins the row and runs the
  // preflight for real, because a table a human has to remember to update is the thing that failed.
  // The working set is MDS_CITY_BBOXES so footprints and measured heights cover the SAME ground.
  es_catastro: {
    ...ES_CATASTRO_FOOTPRINTS,
    defaultBboxes: () => MDS_CITY_BBOXES.map((c) => c.bbox),
  },
  // §EU-REGISTERS — the three Western-European register rows, built by ONE factory over a door
  // table rather than three adapters, and reaching this table in the SAME commit that declares
  // their region rows (the rule the ES row's note above was written to enforce).
  //
  // ⭐ WHAT THE `priorityBboxes` ARGUMENT IS AND IS NOT. Under the national default these sweeps
  // cover the WHOLE country — NL 11,429,771 buildings, IE 3,785,414, Wallonia 3,887,403, Flanders
  // UNKNOWN because its server saturates `hits` at the literal 10000 (all measured 2026-09-06).
  // The list below is an ORDERING: what a budget-truncated run reaches first. NL and BE reuse the
  // working sets their measured-height joins already use, so official footprints and measured
  // metres land on the same ground first and neither list is copied. Ireland has no height join at
  // all, so its list is new (and is the only one this lane invented).
  nl_bag: euRegisterFootprintSource('nl_bag', { priorityBboxes: NL_3DBAG_CITY_BBOXES.map((c) => c.bbox) }),
  be_registers: euRegisterFootprintSource('be_registers', { priorityBboxes: BE_CITY_BBOXES.map((c) => c.bbox) }),
  ie_tailte: euRegisterFootprintSource('ie_tailte', { priorityBboxes: IE_TAILTE_PRIORITY_BBOXES.map((c) => c.bbox) }),
};
const footprintOutcomes = [];

async function applyNationalFootprints(r, geos) {
  if (FR_FOOTPRINTS_MODE !== 'official') return;
  const spec = FOOTPRINT_SOURCES[r.footprintSource];
  if (!spec) return;
  if (r.footprintMerge !== 'replace-in-bbox') {
    console.warn(`\n▶ national footprints · ${r.name}: unsupported footprintMerge "${r.footprintMerge}" — skipped (keeps the height-joined file)`);
    return;
  }
  const bboxes = Array.isArray(r.footprintBboxes) && r.footprintBboxes.length ? r.footprintBboxes : spec.defaultBboxes();
  const baseGeo = geos[geos.length - 1];
  if (DRY) {
    console.log(`\n▶ national footprints · ${r.name}: ${spec.label} would REPLACE OSM footprints inside ${bboxes.length} bbox(es) (skipped in --dry-run)`);
    return;
  }
  const fpSeq = resolve(OUT, `${r.name}-buildings-${r.footprintSource}.geojsonseq`);
  const merged = resolve(OUT, `${r.name}-buildings-footprints.geojsonseq`);
  let res;
  try {
    res = await spec.write(fpSeq, bboxes, (name, area) => {
      console.log(`  · ${r.footprintSource} · ${name}: ${area.status} — ${area.kept} kept `
        + `(${area.measured} measured / ${area.floorsDerived} floors×3.0 / ${area.unknown} unknown), `
        + `${area.dropped ?? 0} dropped, ${area.cellsFailed}/${area.cells} cell(s) failed`);
    });
  } catch (e) {
    res = { status: 'error', reason: String(e?.message ?? e) };
  }
  if (res.status === 'error' || !res.written) {
    footprintOutcomes.push({ region: r.name, source: r.footprintSource, status: 'error', reason: res.reason ?? 'no footprints written' });
    console.warn(`\n▶ national footprints · ${r.name}: ${spec.label} FAILED — ${res.reason ?? 'no footprints written'} (keeps the height-joined footprints)`);
    return;
  }
  const mres = mergeReplaceInBbox(baseGeo, merged, bboxes, null, { seqPath: fpSeq });
  if (mres.status !== 'ok') {
    footprintOutcomes.push({ region: r.name, source: r.footprintSource, status: 'error', reason: mres.reason });
    console.warn(`\n▶ national footprints · ${r.name}: merge FAILED — ${mres.reason} (keeps the height-joined footprints)`);
    return;
  }
  footprintOutcomes.push({
    region: r.name, source: r.footprintSource, status: res.status,
    written: res.written, measured: res.measured, floorsDerived: res.floorsDerived, unknown: res.unknown,
    osmDropped: mres.osmDropped, osmKept: mres.osmKept, cellsFailed: res.cellsFailed,
    areas: (res.areas ?? []).map((a) => `${a.area}:${a.kept}`).join(' '),
  });
  geos[geos.length - 1] = merged;
  console.log(`\n▶ national footprints · ${r.name}: ${spec.label} — ${mres.bdtopoWritten} footprint(s) `
    + `(${res.measured} measured / ${res.floorsDerived} floors×3.0 / ${res.unknown} unknown) REPLACED `
    + `${mres.osmDropped} OSM footprint(s) inside ${bboxes.length} bbox(es); ${mres.osmKept} OSM footprint(s) outside kept. `
    + `${res.status === 'partial' ? `⚠ ${res.cellsFailed} cell(s) failed — those areas are HOLES, not empty. ` : ''}`
    + `Attribution: ${spec.attribution}`);
}

async function pushBuildingsWithNationalHeights(r, baseGeo, geos) {
  if (DRY) {
    const how = r.heightJoin ? `stamp ${r.heightJoin.toUpperCase()} heights onto OSM footprints` : `resolveHeights(${r.name})`;
    console.log(`\n▶ national heights · ${r.name}: ${how} would run (skipped in --dry-run)`);
    geos.push(baseGeo);
    return;
  }

  // §NATIONAL-STAMP-TABLE (HEIGHTS-NORDICS) — table-dispatched joins go FIRST (see the table beside
  // stampBboxesFor for why the chain below admits no new key). Same stamped path, same bookkeeping.
  const tableStamp = NATIONAL_STAMP_TABLE[r.heightJoin];
  if (tableStamp) {
    const stamped = resolve(OUT, `${r.name}-buildings-stamped.geojsonseq`);
    const wsen = r.bbox.split(',').map(Number);
    const retainBboxes = stampBboxesFor(r); // §HEIGHT-STAMP-BUDGET — the table's city list, never the nation
    let res;
    // §USAS-SWATHE — `opts` is how a table row declares options the shared call cannot guess. Only `usas`
    // uses it today, and what it declares is its HEAP BOUND: its retain set is the whole COUNTRY, so a
    // whole-STATE row must be streamed one band of tile rows at a time or the partition holds every
    // footprint in the state (~1,256 B each) and the join returns `error`, which EXITS 4.
    try { res = await tableStamp.stamp(baseGeo, stamped, wsen, { maxTiles: 20000, retainBboxes, ...(tableStamp.opts ?? {}) }); }
    catch (e) { res = { status: 'error', reason: e.message }; }
    recordNationalStampOutcome(r, res, stamped, baseGeo, geos);
    return;
  }

  // §MDS-OSM-JOIN / §DHM-OSM-JOIN / §LOD2-NRW-OSM-JOIN / §MNH-FR-OSM-JOIN — regions whose authoritative
  // height source can't be enumerated per-tile as FOOTPRINTS (spain/denmark: the national register
  // refuses a whole-country query; koln: LoD2-DE is per-Land CityGML, and replacing the OSM clip would
  // desync the buildings from the roads/water/landuse baked from that SAME clip; france: BD TOPO's WFS
  // caps at 5,000 rows against ~30 M buildings — §BDTOPO-CAP-TRUNCATE — while the MNH raster is one
  // GetMap per populated cell). All four therefore STAMP real heights onto bake's OWN OSM footprints
  // (baseGeo). The stamped file has the SAME footprints with `height` added → a REPLACE input (no
  // double-draw). Anything other than a measured `ok` keeps baseGeo at the honest OSM default — never
  // a fabricated height.
  // §AU-OPEN-HEIGHTS-OSM-JOIN — `au_open` is listed FIRST, not last: mnhFr.spec.ts pins `'mds' || 'dhm' || 'lod2nrw' || 'mnh_fr'`
  // and swissWiring.spec.ts pins `'mnh_fr' || 'swiss')` as contiguous text, so the only insertion point that breaks neither is the front.
  if (r.heightJoin === 'au_open' || r.heightJoin === 'mds' || r.heightJoin === 'dhm' || r.heightJoin === 'lod2nrw' || r.heightJoin === 'mnh_fr' || r.heightJoin === 'swiss') {
    const stamped = resolve(OUT, `${r.name}-buildings-stamped.geojsonseq`);
    const wsen = r.bbox.split(',').map(Number);
    // §MDS = whole `spain` (many populated raster tiles); §DHM = whole `denmark`. Give the national bbox
    // a generous tile cap so coverage is broad; a cap hit leaves the rest at the OSM default (honest).
    // §LOD2-NRW is a CITY bbox over 1 km CityGML Kacheln at ~20 MB each — 400 is ~2× the live-measured
    // 182 Köln Kacheln, i.e. real headroom, while still stopping a mis-set bbox from downloading tens of
    // GB before anyone notices (the join refuses a >0.6° span outright for the same reason).
    const maxTiles = r.heightJoin === 'lod2nrw' ? 400 : 20000;
    // §PHASE-4 (es/RATE-IMPLEMENTATION-PLAN §Phase A) — stamp the MDS-capable metro capitals FIRST so
    // each is GUARANTEED measured heights (`pryzm:height_src=measured-lidar`) on re-bake, exactly like
    // Barcelona, even if the national maxTiles cap is reached mid-sweep. The whole-`spain` mds join has
    // capitals, and so does the whole-`france` mnh_fr join (§MNH-FR-CITY-BBOXES — the SAME list is its
    // retained working set, so every held footprint is stamped uncapped); the DK dhm + DE lod2nrw
    // joins pass none.
    // §MDS-LIST-IS-PRIORITY-ONLY (L-12946) — for `mds` this is now the ONLY job MDS_CITY_BBOXES has
    // in the height sweep: an ORDER, not a boundary. MDS_PRIORITY_BBOXES = the nine metros (same
    // order) + the two founder-named gate cities the CI rows measure (ciudadreal, toledo).
    const priorityBboxes = r.heightJoin === 'mds' ? MDS_PRIORITY_BBOXES.map((c) => c.bbox)
      : r.heightJoin === 'mnh_fr' ? MNH_FR_CITY_BBOXES.map((c) => c.bbox)
        : [];
    // §HEIGHT-STAMP-BUDGET (L-659) — the bboxes the join may HOLD footprints for. `null` keeps the
    // whole region (city-sized regions: unchanged). A whole-country region gets its city list, so the
    // join's heap tracks the cities, not the nation — the fix for run 30693132326's OOM. Footprints
    // outside these bboxes are streamed through with their ORIGINAL OSM tags, never fabricated.
    const retainBboxes = stampBboxesFor(r);
    let res;
    try {
      // §MDS-NATIONAL-SWEEP (L-12946) — the whole-country options. Every one of them is a MEASURED
      // number or an explicit budget, never a preference:
      //   tileSpanLon/LatDeg — the service's own MAXSIZE=4096 ceiling, probed 2026-09-06 at 36.0 N,
      //     39.0 N and 43.5 N (0.095° served, 0.100° refused, identical bytes ⇒ a fixed °/px grid).
      //     Rectangular on purpose: latitude binds at 0.0973°, longitude has 29 % more headroom.
      //   swatheRows — the HEAP bound. Whole-Spain retained in one pass is the 4.04 GB abort of run
      //     30693132326 (~1,256 B/footprint × millions); one band of 6 tile rows at a time is not.
      //   budgetMs — the wall clock. The job ceiling is 330 min for EVERY region plus tippecanoe, so
      //     the Spanish sweep gets a declared slice of it and TRUNCATES LOUDLY (ordered, with the
      //     km² stamped vs skipped and a resume cursor) rather than taking the job down.
      //   startCursor — MDS_SWEEP_CURSOR resumes the ordered sweep at a cell ord. ⚠ Successive runs
      //     do NOT accumulate into one tileset today (each bake regenerates the stamped file); the
      //     cursor stamps a DIFFERENT slice. Named in the join's header, not pretended away.
      if (r.heightJoin === 'mds') res = await stampMdsHeightsOnGeojsonseq(baseGeo, stamped, wsen, {
        maxTiles, priorityBboxes, retainBboxes,
        tileSpanLonDeg: MDS_TILE_LON_DEG, tileSpanLatDeg: MDS_TILE_LAT_DEG,
        swatheRows: MDS_SWATHE_ROWS, concurrency: MDS_SWEEP_CONCURRENCY,
        budgetMs: MDS_SWEEP_BUDGET_MIN * 60_000,
        startCursor: Number(process.env.MDS_SWEEP_CURSOR ?? 0) || 0,
      });
      else if (r.heightJoin === 'dhm') res = await stampDhmHeightsOnGeojsonseq(baseGeo, stamped, wsen, { maxTiles, retainBboxes });
      // §MNH-FR-OSM-JOIN (L-12910) — keyless IGN Géoplateforme; the pixel IS the height above ground
      // (never MNS−MNT here — E5 §G.1 A8). Same option shape as mds: priority = retained = city list.
      else if (r.heightJoin === 'mnh_fr') res = await stampMnhFrHeightsOnGeojsonseq(baseGeo, stamped, wsen, { maxTiles, priorityBboxes, retainBboxes });
      // §SWISS-OSM-JOIN (L-12883) — the stamp takes no priority list: its retained working set IS the city list,
      // so every held footprint is stamped uncapped (the same guarantee mds/mnh_fr get from priorityBboxes).
      else if (r.heightJoin === 'swiss') res = await stampSwissHeightsOnGeojsonseq(baseGeo, stamped, wsen, { maxTiles, retainBboxes });
      // §AU-OPEN-HEIGHTS-OSM-JOIN — vectors, not a raster: per populated 0.01° cell, one UNCAPPED export of City of
      // Melbourne's LoD1 components, collapsed to one metre per OSM footprint. Retained working set = AU_OPEN_CITY_BBOXES,
      // so every held footprint is visited (no priority list needed, as swiss).
      else if (r.heightJoin === 'au_open') res = await stampAuOpenHeightsOnGeojsonseq(baseGeo, stamped, wsen, { maxTiles, retainBboxes });
      else res = await stampLod2NrwHeightsOnGeojsonseq(baseGeo, stamped, wsen, { maxTiles });
    } catch (e) {
      res = { status: 'error', reason: e.message };
    }
    // §MEASURED-HEIGHT-GATE — record the outcome BEFORE degrading (recordNationalStampOutcome, shared
    // with NATIONAL_STAMP_TABLE), so a silent fallback still fails.
    recordNationalStampOutcome(r, res, stamped, baseGeo, geos);
    return;
  }

  let nat;
  try {
    nat = await resolveHeights(r.name, { bbox: r.bbox.split(',').map(Number) });
  } catch (e) {
    nat = { status: 'error', reason: e.message };
  }
  if (nat.status === 'ok' && nat.geojsonseq) {
    if (nat.mode === 'replace') {
      // Full national source: use it INSTEAD of the OSM/Overture clip for this region.
      geos.push(nat.geojsonseq);
      console.log(`\n▶ national heights · ${r.name}: REPLACE with ${nat.source} — ${nat.count} bldg(s), ${nat.provenance}`);
    } else {
      // Partial source: keep OSM/Overture AND append the national heights; client near-cap thins twins.
      geos.push(baseGeo, nat.geojsonseq);
      console.log(`\n▶ national heights · ${r.name}: APPEND ${nat.source} — ${nat.count} bldg(s), ${nat.provenance}`);
    }
    return;
  }
  geos.push(baseGeo);
  console.log(`\n▶ national heights · ${r.name}: ${nat.status}${nat.reason ? ' — ' + nat.reason : ''} (keeps OSM/Overture, honest ${'assumed'} default)`);
}

// ── §SEA-BAKE-POLYGONS — the `sea` layer: osmdata water polygons → per-region GeoJSONSeq ──────────
/**
 * Download the osmdata zip once (skipped when the .shp is already extracted), extract the shapefile
 * (CRS asserted WGS 84 from its .prj), clip it to EVERY region in one streaming pass, and return the
 * GeoJSONSeq paths of the regions that yielded ≥ 1 polygon. A region with none gets NO file and is
 * named as such — landlocked, or no OSM coastline inside its bbox; the layer is OPTIONAL downstream
 * (stage-manifest + merge-tiles both know). In --dry-run only the plan is printed, nothing is fetched.
 */
async function bakeSeaLayer(l, regions) {
  const zip = resolve(OUT, SEA_SOURCE.zipName);
  const shp = resolve(OUT, SEA_SOURCE.shpName);
  const plan = regions.map((r) => ({ name: r.name, bbox: parseBboxCsv(r.bbox), out: resolve(OUT, `${r.name}-${l.id}.geojsonseq`) }));
  console.log(`\n▶ sea polygons · ${SEA_SOURCE.product} (${SEA_SOURCE.licence}) → ${plan.length} region(s) in one pass`);
  if (existsSync(shp)) {
    console.log(`  ${SEA_SOURCE.shpName} already extracted (${(statSync(shp).size / 1e6).toFixed(0)} MB) — skipping the download`);
  } else {
    await download(SEA_SOURCE.url, zip);
    if (DRY) {
      console.log(`  extract ${SEA_SOURCE.shpName} (+ .prj, WGS 84 asserted) from ${zip}`);
    } else {
      const ex = await extractSeaShapefile(zip, OUT);
      console.log(`  extracted ${ex.entry} → ${ex.shp} (${(ex.bytes / 1e6).toFixed(0)} MB; .prj: ${ex.wkt.slice(0, 40)}…)`);
      if (!args.includes('--keep-pbf')) {
        const { unlinkSync } = await import('node:fs');
        unlinkSync(zip);
        console.log(`  ↳ reclaimed ${SEA_SOURCE.zipName} to save disk (pass --keep-pbf to retain)`);
      }
    }
  }
  if (DRY) {
    for (const p of plan) console.log(`  clip sea · ${p.name} (${p.bbox.join(',')}) → ${p.out}`);
    return plan.map((p) => p.out);
  }
  const t0 = Date.now();
  const { regions: res, stats } = clipWaterPolygonsToRegions(shp, plan);
  console.log(`  walked ${stats.records} record(s) · ${stats.touched} touching a region · ${stats.outers} outer ring(s) (${stats.outersCw} clockwise = ESRI convention) · ${stats.holesDropped} unhosted hole(s) dropped · ${stats.features} feature(s) written in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  for (const r of res) {
    if (r.polygons > 0) console.log(`  ✔ sea · ${r.name.padEnd(16)} ${r.polygons} polygon(s), ${r.holes} hole(s), ${r.vertices} vertices → ${r.out}`);
    else console.log(`  · sea · ${r.name.padEnd(16)} 0 polygons — landlocked, or no OSM coastline inside its bbox (no file; the layer is optional)`);
  }
  return res.filter((r) => r.polygons > 0).map((r) => r.out);
}

// ── download (Node, no toolchain needed) ─────────────────────────────────────
async function download(url, dest) {
  if (existsSync(dest)) {
    console.log(`\n▶ download (skip — exists ${(statSync(dest).size / 1e6).toFixed(0)} MB): ${dest}`);
    return;
  }
  console.log(`\n▶ download ${url}\n  → ${dest}`);
  if (DRY) return;
  const { createWriteStream, unlinkSync } = await import('node:fs');
  const { Readable } = await import('node:stream');
  const { pipeline } = await import('node:stream/promises');
  // Geofabrik is intermittently 429/500/502/503/504 (L-513/L-523). A single transient upstream
  // hiccup must NOT abort a whole staged bake — a Latvia 502 aborted the entire 34-group staging
  // chain (§STAGE-CHAIN) — so retry with exponential backoff. A non-transient 4xx (a genuinely
  // wrong URL) still throws immediately; retrying it would only waste the runner's minutes.
  const TRANSIENT = new Set([408, 425, 429, 500, 502, 503, 504]);
  const MAX = 5;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) {
        if (TRANSIENT.has(res.status) && attempt < MAX) {
          const wait = Math.min(60, 5 * 2 ** (attempt - 1));
          console.warn(`  ⚠ download HTTP ${res.status} (attempt ${attempt}/${MAX}) — retrying in ${wait}s`);
          await new Promise((r) => setTimeout(r, wait * 1000));
          continue;
        }
        throw new Error(`download failed: HTTP ${res.status}`);
      }
      await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
      console.log(`  done — ${(statSync(dest).size / 1e6).toFixed(0)} MB`);
      return;
    } catch (e) {
      const permanent = /HTTP 4\d\d/.test(String(e && e.message));
      if (permanent || attempt >= MAX) throw e;
      const wait = Math.min(60, 5 * 2 ** (attempt - 1));
      console.warn(`  ⚠ download error "${e && e.message}" (attempt ${attempt}/${MAX}) — retrying in ${wait}s`);
      try { if (existsSync(dest)) unlinkSync(dest); } catch { /* best-effort: the partial
        download is about to be overwritten by the retry anyway, and a failure to unlink it
        must not mask the download error being retried. */ }
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
  }
}

// ── plan / check ─────────────────────────────────────────────────────────────
function printPlan() {
  console.log('PRYZM context tile bake — L-513a / L-607 (multi-region)');
  console.log(`  regions     : ${REGIONS.length} — ${REGIONS.map((r) => r.name).join(', ')}`);
  for (const r of REGIONS) {
    const src = buildingsSourceFor(r);
    console.log(`    · ${r.name.padEnd(10)} bbox ${r.bbox}  buildings:${src.toUpperCase()}  ← ${src === 'overture' ? `Overture ${OVERTURE_RELEASE}` : r.pbfUrl.split('/').pop()}`);
  }
  const overtureRegions = REGIONS.filter((r) => buildingsSourceFor(r) === 'overture');
  console.log(`  out dir     : ${OUT}`);
  console.log(`  layers      : ${layers.map((l) => l.id).join(', ')} (each merged across ALL regions → one .pmtiles)`);
  if (layers.some((l) => l.source === 'osmdata-water-polygons')) {
    console.log(`  sea         : ${SEA_SOURCE.url} (${SEA_SOURCE.licence.split(' — ')[0]}; no Geofabrik extract needed; clipped per region in one pass)`);
  }
  console.log(`  buildings   : ${overtureRegions.length} region(s) via Overture ${OVERTURE_RELEASE}${overtureRegions.length ? ` — ${overtureRegions.map((r) => r.name).join(', ')}` : ''}; the rest via OSM`);
  console.log('  toolchain   :');
  console.log(`    osmium     ${LOCAL.osmium ? 'LOCAL' : 'missing'}`);
  console.log(`    tippecanoe ${LOCAL.tippecanoe ? 'LOCAL' : 'missing'}`);
  console.log(`    duckdb     ${LOCAL.duckdb ? 'LOCAL' : (DOCKER ? 'via Docker image' : 'missing')}${overtureRegions.length ? (OVERTURE_RUNNABLE ? '  ✓ Overture runnable' : '  ✖ Overture NOT runnable — install duckdb or build the Docker image') : ''}`);
  console.log(`    docker     ${DOCKER ? 'available' : 'missing'}`);
  const mode = USE_LOCAL ? 'LOCAL binaries' : DOCKER ? `Docker image "${IMAGE}"` : 'NONE';
  console.log(`  → run mode  : ${mode}`);
  if (!USE_LOCAL && !DOCKER) {
    console.log('\n  ⚠ Neither the local tools nor Docker are available here. Build the image first:');
    console.log(`      docker build -t ${IMAGE} ${HERE}`);
    console.log('    or install osmium-tool + tippecanoe, then re-run. (--check / --dry-run still work.)');
  }
}

// ── main ───────────────────────────────────────────────────────────────────
async function main() {
  // §SYNC-SWITCH — machine-readable region/layer tables, nothing else on stdout, no side effects.
  if (REGIONS_JSON) {
    process.stdout.write(JSON.stringify({
      schema: 'pryzm-context-bake-regions@1',
      // §PENDING-REGION — `pending` rides out so merge-tiles.mjs can keep an unstaged new row OUT of
      // the expect=all set (see the `newzealand` row). Always a boolean: absent ⇒ false.
      allRegions: ALL_REGIONS.map((r) => ({ name: r.name, bbox: r.bbox, heightJoin: r.heightJoin ?? null, pending: r.pending === true })),
      regions: REGIONS.map((r) => r.name),          // this invocation's scope (--region applied)
      allLayers: LAYERS.map((l) => l.id),
      // §SEA-BAKE-POLYGONS — layers a region may legitimately NOT produce (today: `sea`). merge-tiles.mjs
      // reads this so a staged set lacking one is NAMED and skipped, never refused as a layer gap.
      optionalLayers: LAYERS.filter((l) => l.optional === true).map((l) => l.id),
      layers: layers.map((l) => l.id),              // this invocation's scope (--layer applied)
    }) + '\n');
    return;
  }
  mkdirSync(OUT, { recursive: true });
  printPlan();
  // §HEIGHT-STAMP-BUDGET (L-659) — refuse a bake that cannot finish, in ~2 ms, before any download.
  // Deliberately BEFORE the `--check` early return so CI's cheap Plan step is the one that fails.
  assertHeightStampBudget();
  // §FOOTPRINT-BUDGET (L-12939) — same ~2 ms static refusal, same step: a footprintSource that is
  // declared but unimplemented, or unbounded, fails the cheap Plan step rather than hour four.
  {
    // The working set comes from the SOURCE TABLE, never from a per-region field: that is where
    // both countries actually declare theirs (ES via footprintBboxesFor -> MDS_CITY_BBOXES, FR via
    // FR_BDTOPO_CITY_BBOXES), so the check reads the same list the run will use rather than a
    // second copy that can be right for one country and empty for the other.
    // ⚠ `defaultBboxes`, not `bboxes` — this read said `?.bboxes?.()` until 2026-09-06, and since
    // NEITHER row defines that name, `?? []` made the working set look EMPTY for every country and
    // the preflight refused `spain` AND `france` on the default path. An optional-chained read of a
    // misspelt key cannot throw; it just answers "nothing", which is why this is pinned by a spec
    // that runs the preflight for real rather than by a second pair of eyes.
    const problems = assertFootprintConfig(REGIONS.map((r) => ({
      ...r,
      footprintBboxes: Array.isArray(r.footprintBboxes) && r.footprintBboxes.length
        ? r.footprintBboxes
        : FOOTPRINT_SOURCES[r.footprintSource]?.defaultBboxes?.() ?? [],
    })));
    if (FOOTPRINTS === 'official') {
      const official = REGIONS.filter((r) => r.footprintSource);
      console.log(`\n  official footprints: ${official.length ? official.map((r) => `${r.name}→${r.footprintSource}`).join(', ') : 'none in scope'}`);
    }
    if (problems.length) {
      console.error('\n✖ footprint config:');
      for (const p of problems) console.error(`    · ${p}`);
      process.exit(2);
    }
  }
  if (CHECK) return;
  if (!USE_LOCAL && !DOCKER && !DRY) {
    console.error('\n✖ no toolchain — see the note above. Aborting (nothing to run).');
    process.exit(2);
  }
  // §BAKE-OVERTURE — fail LOUD if any region wants Overture buildings but DuckDB is unreachable.
  // A silent skip would bake a Barcelona-shaped hole exactly where the density fix was needed.
  const wantsOverture = layers.some((l) => l.id === 'buildings') && REGIONS.some((r) => buildingsSourceFor(r) === 'overture');
  if (wantsOverture && !OVERTURE_RUNNABLE && !DRY) {
    console.error('\n✖ Overture buildings requested but DuckDB is not available (need local `duckdb`'
      + ' or the Docker image, which the Dockerfile bundles). Install it, or pass'
      + ' `--buildings-source osm` to force the legacy OSM path. Aborting.');
    process.exit(4);
  }

  // §BAKE-MULTI-REGION (L-607) — download + clip EACH region first, GROUPED by source extract so a
  // shared pbf (Lisbon+Porto, Riyadh+Jeddah) downloads once. `download()` skips an existing file, so
  // this is idempotent across reruns. The clip shrinks a country extract to the region before any
  // per-layer filtering (the "shrink before filter" property the single-region bake had).
  //
  // ⚠ DISK: with whole-Spain + ~12 other country extracts in one run, the downloaded pbfs would pile
  // up to ~10 GB and can blow a CI runner. After a group's regions are all clipped, its (large)
  // country pbf is dead weight, so we DELETE it by default. `--keep-pbf` retains them for fast local
  // reruns (a dev iterating locally would rather re-clip than re-download gigabytes).
  const KEEP_PBF = args.includes('--keep-pbf');
  const groups = new Map();
  // §SEA-BAKE-POLYGONS — a run scoped to source-backed layers only (`--layer sea`) needs NO Geofabrik
  // extract: the sea comes from the osmdata product, not from the OSM pbf. Skip the download + clip
  // (a ~5 GB country pbf for nothing) and treat every region as ready.
  const needsOsmExtract = layers.some((l) => !l.source);
  for (const r of needsOsmExtract ? REGIONS : []) {
    if (!groups.has(r.pbf)) groups.set(r.pbf, { url: r.pbfUrl, regions: [] });
    groups.get(r.pbf).regions.push(r);
  }
  // §BAKE-RESILIENT (L-607b, 2026-07-24) — ⚠ ONE bad region USED TO KILL THE WHOLE RUN. The first
  // multi-region bake got Spain+PT+FR+IT+DE all the way through, then died because
  // `greater-london-latest.osm.pbf` downloaded as 0 MB (HEAD said 200, the GET body was empty) and
  // osmium threw `invalid BlobHeader size` — discarding ~40 min of good work. A per-region extract
  // must NEVER abort the batch. We now: validate the download is non-trivial (a real extract is
  // never < 1 MB; 0 MB = a redirect/empty body), retry once, and on any download/clip failure SKIP
  // that region with a loud warning and carry on. The tileset ships with whatever succeeded; the
  // workflow's "assert tiles are real" step is the floor.
  const okRegions = [];
  const failedRegions = [];
  const MIN_PBF_BYTES = 1_000_000; // a genuine country/comunidad/city extract is always > 1 MB.
  const { unlinkSync } = await import('node:fs');
  for (const [pbfPath, g] of groups) {
    let pbfOk = false;
    try {
      await download(g.url, pbfPath);
      // Validate: a 0-byte / redirect-HTML body passes `res.ok` but is not a pbf. Retry once.
      let size = (!DRY && existsSync(pbfPath)) ? statSync(pbfPath).size : (DRY ? MIN_PBF_BYTES : 0);
      if (!DRY && size < MIN_PBF_BYTES) {
        console.warn(`  ⚠ ${g.url.split('/').pop()} downloaded ${size} B (< 1 MB) — deleting + retrying once.`);
        if (existsSync(pbfPath)) unlinkSync(pbfPath);
        await download(g.url, pbfPath);
        size = existsSync(pbfPath) ? statSync(pbfPath).size : 0;
      }
      if (!DRY && size < MIN_PBF_BYTES) {
        throw new Error(`download body too small (${size} B) — bad URL or Geofabrik hiccup`);
      }
      pbfOk = true;
    } catch (e) {
      console.error(`  ✖ SKIP group ${g.url.split('/').pop()} — ${e.message}. Regions skipped: ${g.regions.map((r) => r.name).join(', ')}`);
      for (const r of g.regions) failedRegions.push(r.name);
    }
    if (pbfOk) {
      for (const r of g.regions) {
        try {
          run(`clip ${r.name} (${r.bbox})`,
            tool('osmium', ['extract', '-b', r.bbox, r.pbf, '-o', r.clipped, '--overwrite']));
          okRegions.push(r);
        } catch (e) {
          console.error(`  ✖ SKIP clip ${r.name} — ${e.message}`);
          failedRegions.push(r.name);
        }
      }
    }
    if (!KEEP_PBF && !DRY && existsSync(pbfPath)) {
      unlinkSync(pbfPath);
      console.log(`  ↳ reclaimed ${pbfPath.split(/[\\/]/).pop()} to save disk (pass --keep-pbf to retain)`);
    }
  }
  if (!needsOsmExtract) {
    okRegions.push(...REGIONS);
    console.log(`\n▶ no OSM extract needed for [${layers.map((l) => l.id).join(', ')}] — ${REGIONS.length} region(s) ready without a Geofabrik download`);
  }
  console.log(`\n▶ regions ready: ${okRegions.length}/${REGIONS.length}` +
    (failedRegions.length ? ` — SKIPPED: ${failedRegions.join(', ')}` : ' — all clipped'));
  if (!DRY && okRegions.length === 0) {
    console.error('\n✖ no region clipped successfully — nothing to tile. Aborting.');
    process.exit(3);
  }

  for (const l of layers) {
    // Per region: filter + export this layer to its OWN GeoJSONSeq. Then ONE tippecanoe call takes
    // ALL regions' GeoJSONSeq as inputs and merges them into a SINGLE `<layer>.pmtiles` — the output
    // name is unchanged, so R2 + the client reader are untouched (the whole point of L-607's fix).
    // §VEG-REAL-CANOPY-BAKE — the `canopy` layer: measured tree-cover rasters → one sampled point per
    // ~12 m cell, per region, streamed to GeoJSONSeq. Same shape as the `sea` branch below: no OSM
    // extract, an OPTIONAL layer whose honest absence writes no archive at all.
    if (l.source === 'canopy-raster') {
      const { geos: canopyGeos } = await bakeCanopyLayerForRegions(okRegions, OUT, {
        dryRun: DRY,
        maxAreaKm2: args.includes('--canopy-max-km2') ? Number(args[args.indexOf('--canopy-max-km2') + 1]) : undefined,
      });
      if (canopyGeos.length === 0) {
        console.warn(`  ⚠ ${l.id}: 0 sampled point(s) across ${okRegions.length} region(s) — no ${l.id}.pmtiles written (optional layer; see the per-region lines above for WHICH of refused / outage / honestly-empty each was).`);
        continue;
      }
      const canopyPmt = resolve(OUT, `${l.id}.pmtiles`);
      run(`tile ${l.id} → PMTiles (canopy points from ${canopyGeos.length} region(s), ≥${CANOPY_THRESHOLD_PCT}% cover, ${CANOPY_CELL_M} m cells)`,
        tool('tippecanoe', ['-o', canopyPmt, '-l', l.id, '-Z', String(l.minz), '-z', String(l.maxz),
          '-P', '--force', ...l.extra, ...canopyGeos]));
      if (!DRY && existsSync(canopyPmt)) {
        console.log(`  ✔ ${l.id}.pmtiles — ${(statSync(canopyPmt).size / 1e6).toFixed(1)} MB (${canopyGeos.length} region(s) with measured canopy)`);
      }
      continue;
    }
    if (l.source === 'osmdata-water-polygons') {
      // §SEA-BAKE-POLYGONS — one streaming pass over the osmdata shapefile writes every region's
      // GeoJSONSeq; only regions with ≥ 1 polygon feed tippecanoe. Zero everywhere ⇒ no archive at all
      // (an OPTIONAL layer's honest absence — tippecanoe would refuse an empty input anyway).
      const seaGeos = await bakeSeaLayer(l, okRegions);
      if (seaGeos.length === 0) {
        console.warn(`  ⚠ ${l.id}: 0 polygon(s) across ${okRegions.length} region(s) — no ${l.id}.pmtiles written (optional layer; landlocked scope, or no OSM coastline in these bboxes)`);
        continue;
      }
      const seaPmt = resolve(OUT, `${l.id}.pmtiles`);
      run(`tile ${l.id} → PMTiles (sea polygons from ${seaGeos.length} region(s))`,
        tool('tippecanoe', ['-o', seaPmt, '-l', l.id, '-Z', String(l.minz), '-z', String(l.maxz),
          '-P', '--force', ...l.extra, ...seaGeos]));
      if (!DRY && existsSync(seaPmt)) {
        console.log(`  ✔ ${l.id}.pmtiles — ${(statSync(seaPmt).size / 1e6).toFixed(1)} MB (${seaGeos.length} region(s) with sea)`);
      }
      continue;
    }
    const geos = [];
    for (const r of okRegions) {  // §BAKE-RESILIENT (L-607b) — only tile regions that clipped OK; a SKIPPED region (e.g. London 0-byte pbf) has no clip file, so tiling it would crash the whole run.
      const geo = resolve(OUT, `${r.name}-${l.id}.geojsonseq`);
      // §BAKE-OVERTURE — the BUILDINGS layer of an Overture-sourced region comes from DuckDB→Overture
      // instead of osmium; every other layer (roads/water/parks) AND every OSM-sourced region stays
      // on the untouched osmium path, so Barcelona/Europe are byte-for-byte unchanged.
      if (l.id === 'buildings' && buildingsSourceFor(r) === 'overture') {
        run(`overture buildings · ${r.name} → GeoJSONSeq (${OVERTURE_RELEASE})`,
          overtureBuildingsCmd(r, geo));
      } else {
        const filtered = resolve(OUT, `${r.name}-${l.id}.osm.pbf`);
        run(`filter ${l.id} · ${r.name}`,
          tool('osmium', ['tags-filter', r.clipped, ...l.filter, '-o', filtered, '--overwrite']));
        run(`export ${l.id} · ${r.name} → GeoJSONSeq (${l.geom})`,
          tool('osmium', ['export', filtered, '-f', 'geojsonseq',
            // §BAKE-GEOMETRY-TYPES + §BAKE-UNIQUE-ID — see the LAYERS note above.
            '--geometry-types', l.geom, '--add-unique-id', 'type_id',
            '-o', geo, '--overwrite']));
      }
      // §PHASE1-HEIGHTS — the buildings layer gets the national real-height join (replace/append per
      // dedup policy); every other layer (roads/water/parks) is pushed unchanged.
      if (l.id === 'buildings') {
        await pushBuildingsWithNationalHeights(r, geo, geos);
        // §FOOTPRINT-SOURCE (L-12940) — under `--footprints official`, replace OSM geometry with the
        // national register's own inside the covered bboxes. No-op for every other region and run.
        await applyNationalFootprints(r, geos);
      } else {
        geos.push(geo);
      }
    }
    // §STREET-LIFE (L-12936) — an OPTIONAL layer with NOTHING to tile writes no archive rather than an
    // empty one: the sea path's rule, applied to the osmium path. tippecanoe refuses an input set that
    // carries zero features, and that refusal would kill the WHOLE run for a scope that simply has no
    // mapped street furniture. The absence is then recorded by `stage-manifest` under
    // `optionalLayersNotProduced` and NAMED by the merge — an honest absence, never a silent empty layer.
    // Non-optional layers are untouched: an empty roads/buildings set is a BUG and must still fail loudly.
    const tileable = (l.optional === true && !DRY)
      ? geos.filter((g) => existsSync(g) && statSync(g).size > 0)
      : geos;
    if (l.optional === true && !DRY && tileable.length === 0) {
      console.warn(`  ⚠ ${l.id}: 0 feature(s) across ${okRegions.length} region(s) — no ${l.id}.pmtiles written (optional layer; nothing of this kind is mapped in these bboxes)`);
      continue;
    }
    const pmt = resolve(OUT, `${l.id}.pmtiles`);
    // tippecanoe accepts multiple inputs and unions them into the one named layer (`-l l.id`).
    run(`tile ${l.id} → PMTiles (merged from ${tileable.length} region(s))`,
      tool('tippecanoe', ['-o', pmt, '-l', l.id, '-Z', String(l.minz), '-z', String(l.maxz),
        '-P', '--force', ...l.extra, ...tileable]));
    if (!DRY && existsSync(pmt)) {
      console.log(`  ✔ ${l.id}.pmtiles — ${(statSync(pmt).size / 1e6).toFixed(1)} MB (${geos.length} region(s))`);
    }
  }

  assertMeasuredHeights();

  console.log('\n✅ Bake complete. Upload the *.pmtiles in out/ to object storage (see README §Upload),');
  console.log('   then point the client tile reader at them (L-513b/c). NOTE: rerun on Geofabrik\'s');
  console.log('   daily refresh to keep context current.');
}

/**
 * §MEASURED-HEIGHT-GATE (L-658) — FAIL the bake when a region that declares a `heightJoin` ships
 * ZERO measured heights. This is the assertion that would have caught the 2026-08-01 run: "Assert
 * the tiles are real" checked only file SIZE + magic bytes, so a 2.3 GB tileset in which Barcelona,
 * Köln and Copenhagen were 100 % fabricated 9 m defaults passed as green.
 *
 * §CONTEXT-DATA-HONESTY — the statuses are NOT collapsed. `blocked` is an EXTERNAL gate (a missing
 * credential or an unlicensed source) that the pipeline cannot fix, so it warns loudly and passes.
 * Everything else — `error` (the join threw / could not read its input), `documented` (nothing to
 * stamp), or an `ok` that matched nothing — is a PIPELINE defect and exits non-zero.
 */
function assertMeasuredHeights() {
  if (DRY || heightJoinOutcomes.length === 0) return;
  // §SOURCE-OUTAGE-VS-PIPELINE-DEFECT (L-659) — a join that reached its remote raster service and was
  // REFUSED BY IT EVERY TIME (`tilesProcessed === 0` while `tileErrors > 0`) is the same KIND of thing
  // as `blocked`: an external gate this pipeline cannot fix. It is NOT a reason to discard a tileset in
  // which the other cities' heights are real and measured — those footprints keep their honest OSM tags
  // either way. Reported loudly, never silently. A join that DID process tiles and still measured
  // nothing is a PIPELINE defect and still hard-fails, as does anything that errored.
  const isSourceOutage = (o) => o.status === 'ok' && o.measuredCount === 0 && o.tilesProcessed === 0 && o.tileErrors > 0;
  const blocked = heightJoinOutcomes.filter((o) => o.status === 'blocked' || isSourceOutage(o));
  const failed = heightJoinOutcomes.filter((o) => o.status !== 'blocked' && !isSourceOutage(o) && !(o.status === 'ok' && o.measuredCount > 0));
  const okd = heightJoinOutcomes.filter((o) => o.status === 'ok' && o.measuredCount > 0);

  console.log('\n── measured-height gate ──');
  for (const o of okd) {
    const held = o.retainedFootprints != null ? ` [held ${o.retainedFootprints}, passed through ${o.passedThroughFootprints}, peak heap ${o.peakHeapUsedMB} MB]` : '';
    console.log(`  ✔ ${o.region} (${o.join}): ${o.measuredCount}/${o.footprintCount} footprint(s) measured${held}`);
  }
  // §ABORT-IS-NOT-A-CAP — surfaced SEPARATELY and after the ✔ lines, because these regions DID
  // measure something and so pass the gate. The point is that their coverage is a FAILURE ARTEFACT,
  // not a scope decision: whatever fraction they report, the sweep did not finish. Silence here is
  // what let Spain's 5 % (16 tiles, join threw) read as normal beside Denmark's 80 % (149 tiles).
  const aborted = heightJoinOutcomes.filter((o) => o.sweepAborted);
  for (const o of aborted) {
    console.error(
      `  ⚠ ${o.region} (${o.join}): SWEEP ABORTED after ${o.tilesProcessed} tile(s) — ${o.sweepAbortReason ?? 'no reason captured'}.\n` +
      `      It stamped ${o.measuredCount}/${o.footprintCount} and therefore PASSES the gate, but its coverage is\n` +
      `      truncated by an ERROR, not by a budget. Re-run this region before trusting its heights.`);
  }
  for (const o of blocked) {
    const why = o.status === 'blocked' ? (o.reason ?? 'no reason given')
      : `the height source refused every one of ${o.tileErrors} raster request(s) — 0 tiles processed`;
    console.log(`  ⚠ ${o.region} (${o.join}): BLOCKED — ${why} (external gate; not a bake defect; footprints keep their honest OSM tags)`);
  }
  for (const o of failed) console.error(`  ✖ ${o.region} (${o.join}): ${o.status} — ${o.measuredCount} measured height(s). ${o.reason ?? ''}`);

  if (failed.length === 0) return;
  if (ALLOW_UNMEASURED) {
    console.error(`\n⚠ ${failed.length} height join(s) produced NO measured heights — continuing only because --allow-unmeasured was passed.`);
    return;
  }
  console.error(
    `\n✖ MEASURED-HEIGHT GATE FAILED — ${failed.length} region(s) that declare a height join shipped ZERO measured\n` +
    '  heights. Publishing this tileset would render those cities as a fabricated 9 m carpet while the\n' +
    '  workflow reported success. Fix the join (or pass --allow-unmeasured if that is genuinely intended).');
  process.exit(4);
}

main().catch((e) => { console.error('\n✖ bake failed:', e.message); process.exit(1); });
