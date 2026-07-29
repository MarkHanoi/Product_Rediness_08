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
// §PHASE1-HEIGHTS (North Star §6.1) — national real-height join. `heightSources.mjs` is side-effect-
// free on import (its CLI is behind an isMain guard); `resolveHeights` never throws.
import { resolveHeights, stampMdsHeightsOnGeojsonseq, stampDhmHeightsOnGeojsonseq } from './heightSources.mjs';

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
const REGIONS = [
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
  { name: 'lisbon',     pbfUrl: 'https://download.geofabrik.de/europe/portugal-latest.osm.pbf',                       pbf: resolve(OUT, 'portugal-latest.osm.pbf'),               bbox: '-9.23,38.68,-9.08,38.80',  clipped: resolve(OUT, 'clip-lisbon.osm.pbf') },
  { name: 'porto',      pbfUrl: 'https://download.geofabrik.de/europe/portugal-latest.osm.pbf',                       pbf: resolve(OUT, 'portugal-latest.osm.pbf'),               bbox: '-8.70,41.12,-8.55,41.20',  clipped: resolve(OUT, 'clip-porto.osm.pbf') },
  { name: 'paris',      pbfUrl: 'https://download.geofabrik.de/europe/france/ile-de-france-latest.osm.pbf',           pbf: resolve(OUT, 'ile-de-france-latest.osm.pbf'),          bbox: '2.22,48.80,2.47,48.91',    clipped: resolve(OUT, 'clip-paris.osm.pbf') },
  { name: 'lyon',       pbfUrl: 'https://download.geofabrik.de/europe/france/rhone-alpes-latest.osm.pbf',             pbf: resolve(OUT, 'rhone-alpes-latest.osm.pbf'),            bbox: '4.78,45.70,4.92,45.80',    clipped: resolve(OUT, 'clip-lyon.osm.pbf') },
  { name: 'rome',       pbfUrl: 'https://download.geofabrik.de/europe/italy/centro-latest.osm.pbf',                   pbf: resolve(OUT, 'italy-centro-latest.osm.pbf'),           bbox: '12.40,41.83,12.60,41.99',  clipped: resolve(OUT, 'clip-rome.osm.pbf') },
  { name: 'milan',      pbfUrl: 'https://download.geofabrik.de/europe/italy/nord-ovest-latest.osm.pbf',               pbf: resolve(OUT, 'italy-nordovest-latest.osm.pbf'),        bbox: '9.10,45.40,9.28,45.55',    clipped: resolve(OUT, 'clip-milan.osm.pbf') },
  { name: 'berlin',     pbfUrl: 'https://download.geofabrik.de/europe/germany/berlin-latest.osm.pbf',                 pbf: resolve(OUT, 'germany-berlin-latest.osm.pbf'),         bbox: '13.28,52.44,13.55,52.58',  clipped: resolve(OUT, 'clip-berlin.osm.pbf') },
  { name: 'munich',     pbfUrl: 'https://download.geofabrik.de/europe/germany/bayern-latest.osm.pbf',                 pbf: resolve(OUT, 'germany-bayern-latest.osm.pbf'),         bbox: '11.44,48.09,11.66,48.20',  clipped: resolve(OUT, 'clip-munich.osm.pbf') },
  { name: 'london',     pbfUrl: 'https://download.geofabrik.de/europe/great-britain/england/greater-london-latest.osm.pbf', pbf: resolve(OUT, 'greater-london-latest.osm.pbf'),  bbox: '-0.20,51.44,0.02,51.55',   clipped: resolve(OUT, 'clip-london.osm.pbf') },
  // ⚠ Copenhagen's own city region was REMOVED 2026-07-26 — the whole-`denmark` region above
  // (national bbox, same denmark-latest.osm.pbf) fully contains it, so a separate Copenhagen clip
  // would DOUBLE-BAKE the city into the merged buildings.pmtiles. Copenhagen now rides the national
  // region (OSM footprints + DHM nDSM heights via the heightJoin, apikey-gated).
  { name: 'brussels',   pbfUrl: 'https://download.geofabrik.de/europe/belgium-latest.osm.pbf',                        pbf: resolve(OUT, 'belgium-latest.osm.pbf'),                bbox: '4.30,50.80,4.42,50.90',    clipped: resolve(OUT, 'clip-brussels.osm.pbf') },
  // §NL-NATIONWIDE (2026-07-26) — WHOLE NETHERLANDS (national), mirroring the `spain` whole-country
  // region. Geofabrik's Netherlands extract is one ~1.6 GB pbf; tiled whole it is well under R2's
  // 10 GB free storage, and ONE country fits a single CI run. This national bbox covers EVERY NL
  // jurisdiction — Amsterdam, Rotterdam, Utrecht, Groningen, and any rural site — so an NL site never
  // shows "no surrounding building data". (Replaces the Amsterdam-only clip.) 3DBAG real heights are
  // stamped per-CITY bbox — see heightSources.mjs REGION_SOURCE `netherlands` (the whole-country
  // 3DBAG bbox is refused per-tile → keeps OSM; the OSM-footprint-join is the named follow-up).
  { name: 'netherlands', pbfUrl: 'https://download.geofabrik.de/europe/netherlands-latest.osm.pbf',                   pbf: resolve(OUT, 'netherlands-latest.osm.pbf'),            bbox: '3.30,50.75,7.30,53.70',    clipped: resolve(OUT, 'clip-netherlands.osm.pbf') },
  { name: 'oslo',       pbfUrl: 'https://download.geofabrik.de/europe/norway-latest.osm.pbf',                         pbf: resolve(OUT, 'norway-latest.osm.pbf'),                 bbox: '10.66,59.88,10.83,59.96',  clipped: resolve(OUT, 'clip-oslo.osm.pbf') },
  { name: 'stockholm',  pbfUrl: 'https://download.geofabrik.de/europe/sweden-latest.osm.pbf',                         pbf: resolve(OUT, 'sweden-latest.osm.pbf'),                 bbox: '17.98,59.28,18.14,59.37',  clipped: resolve(OUT, 'clip-stockholm.osm.pbf') },
  { name: 'helsinki',   pbfUrl: 'https://download.geofabrik.de/europe/finland-latest.osm.pbf',                        pbf: resolve(OUT, 'finland-latest.osm.pbf'),                bbox: '24.88,60.14,25.02,60.20',  clipped: resolve(OUT, 'clip-helsinki.osm.pbf') },
  // Switzerland (ch) — one national extract, three demo cities. CH is a top data-rate jurisdiction
  // (ÖREB + national Nutzungsplanung WFS), so its 3D context must load as fast as Barcelona's.
  { name: 'zurich',     pbfUrl: 'https://download.geofabrik.de/europe/switzerland-latest.osm.pbf',                    pbf: resolve(OUT, 'switzerland-latest.osm.pbf'),            bbox: '8.45,47.34,8.62,47.43',    clipped: resolve(OUT, 'clip-zurich.osm.pbf') },
  { name: 'geneva',     pbfUrl: 'https://download.geofabrik.de/europe/switzerland-latest.osm.pbf',                    pbf: resolve(OUT, 'switzerland-latest.osm.pbf'),            bbox: '6.09,46.17,6.18,46.25',    clipped: resolve(OUT, 'clip-geneva.osm.pbf') },
  { name: 'bern',       pbfUrl: 'https://download.geofabrik.de/europe/switzerland-latest.osm.pbf',                    pbf: resolve(OUT, 'switzerland-latest.osm.pbf'),            bbox: '7.40,46.93,7.48,46.99',    clipped: resolve(OUT, 'clip-bern.osm.pbf') },
  // USA (us) — state-level Geofabrik extracts (smaller than the regional bundles). Add more cities
  // by adding a row with the right state pbf + a city-centre bbox.
  { name: 'newyork',    pbfUrl: 'https://download.geofabrik.de/north-america/us/new-york-latest.osm.pbf',             pbf: resolve(OUT, 'us-new-york-latest.osm.pbf'),            bbox: '-74.03,40.70,-73.91,40.82', clipped: resolve(OUT, 'clip-newyork.osm.pbf') },
  { name: 'sanfrancisco', pbfUrl: 'https://download.geofabrik.de/north-america/us/california-latest.osm.pbf',         pbf: resolve(OUT, 'us-california-latest.osm.pbf'),          bbox: '-122.52,37.70,-122.36,37.83', clipped: resolve(OUT, 'clip-sanfrancisco.osm.pbf') },
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
  { name: 'riyadh',     pbfUrl: 'https://download.geofabrik.de/asia/gcc-states-latest.osm.pbf',                       pbf: resolve(OUT, 'gcc-states-latest.osm.pbf'),             bbox: '46.60,24.58,46.83,24.80',  clipped: resolve(OUT, 'clip-riyadh.osm.pbf'), buildingsSource: 'overture' },
  { name: 'jeddah',     pbfUrl: 'https://download.geofabrik.de/asia/gcc-states-latest.osm.pbf',                       pbf: resolve(OUT, 'gcc-states-latest.osm.pbf'),             bbox: '39.10,21.45,39.28,21.62',  clipped: resolve(OUT, 'clip-jeddah.osm.pbf'), buildingsSource: 'overture' },
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
  { id: 'water',     filter: ['nwr/natural=water', 'nwr/waterway', 'w/water', 'w/natural=coastline'],   geom: 'polygon,linestring', minz: 8,  maxz: 16, extra: [] },
  { id: 'parks',     filter: ['nwr/leisure=park', 'nwr/landuse=grass,forest,recreation_ground', 'nwr/natural=wood'], geom: 'polygon', minz: 10, maxz: 16, extra: [] },
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
];

// ── args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const DRY = args.includes('--dry-run');
const ONE = args.includes('--layer') ? args[args.indexOf('--layer') + 1] : null;
const layers = ONE ? LAYERS.filter((l) => l.id === ONE) : LAYERS;

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
async function pushBuildingsWithNationalHeights(r, baseGeo, geos) {
  if (DRY) {
    const how = r.heightJoin ? `stamp ${r.heightJoin.toUpperCase()} heights onto OSM footprints` : `resolveHeights(${r.name})`;
    console.log(`\n▶ national heights · ${r.name}: ${how} would run (skipped in --dry-run)`);
    geos.push(baseGeo);
    return;
  }

  // §MDS-OSM-JOIN / §DHM-OSM-JOIN (L-6xx) — whole-country regions (spain/denmark) can't enumerate
  // footprints via their national register per-tile, so they STAMP real heights onto bake's OWN OSM
  // footprints (baseGeo). The stamped file has the SAME footprints with `height` added → a REPLACE
  // input (no double-draw). Anything other than a measured `ok` keeps baseGeo at the honest OSM default.
  if (r.heightJoin === 'mds' || r.heightJoin === 'dhm') {
    const stamped = resolve(OUT, `${r.name}-buildings-stamped.geojsonseq`);
    const wsen = r.bbox.split(',').map(Number);
    // §MDS = whole `spain` (many populated tiles); §DHM = whole `denmark`. Give the national bbox a
    // generous tile cap so coverage is broad; a cap hit leaves the rest at the OSM default (honest).
    const maxTiles = 20000;
    let res;
    try {
      res = r.heightJoin === 'mds'
        ? await stampMdsHeightsOnGeojsonseq(baseGeo, stamped, wsen, { maxTiles })
        : await stampDhmHeightsOnGeojsonseq(baseGeo, stamped, wsen, { maxTiles });
    } catch (e) {
      res = { status: 'error', reason: e.message };
    }
    if (res.status === 'ok' && res.measuredCount > 0) {
      geos.push(stamped); // REPLACE the plain OSM clip with the height-stamped SAME footprints.
      console.log(`\n▶ national heights · ${r.name}: ${r.heightJoin.toUpperCase()} join — ${res.measuredCount}/${res.footprintCount} ` +
        `OSM footprint(s) stamped (tagged), ${res.tilesProcessed} tile(s) → REPLACE. ${res.note}`);
    } else {
      geos.push(baseGeo);
      console.log(`\n▶ national heights · ${r.name}: ${r.heightJoin.toUpperCase()} join ${res.status}` +
        `${res.reason ? ' — ' + res.reason : ''} (keeps OSM, honest assumed default)`);
    }
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

// ── download (Node, no toolchain needed) ─────────────────────────────────────
async function download(url, dest) {
  if (existsSync(dest)) {
    console.log(`\n▶ download (skip — exists ${(statSync(dest).size / 1e6).toFixed(0)} MB): ${dest}`);
    return;
  }
  console.log(`\n▶ download ${url}\n  → ${dest}`);
  if (DRY) return;
  const { createWriteStream } = await import('node:fs');
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  const { Readable } = await import('node:stream');
  const { pipeline } = await import('node:stream/promises');
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  console.log(`  done — ${(statSync(dest).size / 1e6).toFixed(0)} MB`);
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
  mkdirSync(OUT, { recursive: true });
  printPlan();
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
  for (const r of REGIONS) {
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
      } else {
        geos.push(geo);
      }
    }
    const pmt = resolve(OUT, `${l.id}.pmtiles`);
    // tippecanoe accepts multiple inputs and unions them into the one named layer (`-l l.id`).
    run(`tile ${l.id} → PMTiles (merged from ${geos.length} region(s))`,
      tool('tippecanoe', ['-o', pmt, '-l', l.id, '-Z', String(l.minz), '-z', String(l.maxz),
        '-P', '--force', ...l.extra, ...geos]));
    if (!DRY && existsSync(pmt)) {
      console.log(`  ✔ ${l.id}.pmtiles — ${(statSync(pmt).size / 1e6).toFixed(1)} MB (${geos.length} region(s))`);
    }
  }

  console.log('\n✅ Bake complete. Upload the *.pmtiles in out/ to object storage (see README §Upload),');
  console.log('   then point the client tile reader at them (L-513b/c). NOTE: rerun on Geofabrik\'s');
  console.log('   daily refresh to keep context current.');
}

main().catch((e) => { console.error('\n✖ bake failed:', e.message); process.exit(1); });
