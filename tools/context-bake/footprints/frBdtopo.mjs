// ─────────────────────────────────────────────────────────────────────────────
// §FR-BDTOPO-FOOTPRINTS (L-12940, lane FR-BDTOPO-FOOTPRINTS, 2026-09-05)
//
// IGN **BD TOPO® v3** `batiment` — the French national building footprint layer, used here as a
// FOOTPRINT source (true size / true shape / true height), not merely as a height stamp.
//
// WHY A FOOTPRINT SOURCE AND NOT ANOTHER HEIGHT JOIN. `mnh_fr` (heights/mnhFr.mjs) already stamps a
// MEASURED height onto bake's OSM footprints from the LiDAR HD MNH raster. That fixes the founder's
// Sète complaint ("not true height") only for buildings OSM already has, in the shape OSM drew them.
// It cannot fix Jouy-en-Josas ("not true size / not true shape") at all, because the geometry there
// is OSM's. BD TOPO carries BOTH — IGN's own photogrammetric/LiDAR footprint AND `hauteur` — so it
// replaces the geometry, and the height comes with it.
//
// ─────────────────────────────────────────────────────────────────────────────
// LIVE PROBES — 2026-09-05, from this machine. Every number below is a measurement; where a claim
// is NOT measured it says so. (§CONTEXT-DATA-HONESTY: failure and empty are different values.)
//
// ⚠ THE ATTRIBUTE NAMES ARE THE LONG, LOWERCASE FORMS, NOT THE SHAPEFILE COLUMN NAMES. The lane
//   brief (and IGN's own SHP/GPKG delivery) name them HAUTEUR / NB_ETAGES / USAGE1 / DATE_APP /
//   ETAT_DE_L_OBJET. **The WFS does not serve those.** Live response, verbatim keys:
//     cleabs · nature · usage_1 · usage_2 · construction_legere · etat_de_l_objet · date_creation ·
//     date_modification · date_d_apparition · date_de_confirmation · nombre_d_etages · hauteur ·
//     altitude_minimale_sol · altitude_minimale_toit · altitude_maximale_toit · altitude_maximale_sol ·
//     methode_d_acquisition_planimetrique · methode_d_acquisition_altimetrique · precision_* ·
//     nombre_de_logements · materiaux_des_murs · materiaux_de_la_toiture · origine_du_batiment
//   Keying on the 8.3-style names returns `undefined` for EVERY field and yields footprints with no
//   height and no floors — i.e. a silent, total data loss that still writes a plausible file. The
//   national GeoParquet uses the SAME long names (footer probe below), so one mapping serves both.
//
// (a) WFS GetFeature — https://data.geopf.fr/wfs/ows, TYPENAMES=BDTOPO_V3:batiment, no API key.
//     • AXIS ORDER: **lon,lat** with SRSNAME=EPSG:4326. Both orders were tried over the same box:
//         BBOX=48.77,2.16,48.78,2.18 (lat,lon) → HTTP 200, 147 bytes,
//             {"type":"FeatureCollection","features":[],"totalFeatures":0,"numberMatched":0,…}
//         BBOX=2.16,48.77,2.18,48.78 (lon,lat) → HTTP 200, 253,644 bytes, numberMatched 1102.
//       A lat,lon request is a 200 with zero features — it is INDISTINGUISHABLE from "no buildings
//       here" unless you check `numberMatched`, which is why the wrong order can ship.
//     • COUNT IS HARD-CAPPED AT 5000, SERVER-SIDE. BBOX=2.34,48.85,2.36,48.87&COUNT=10000 →
//       HTTP 200, 7,265,875 bytes, numberMatched **7092**, numberReturned **5000**. Asking for more
//       does not fail — it truncates, silently. (§BDTOPO-CAP-TRUNCATE, the same cap heightSources.mjs
//       records; measured again here because it is the whole reason paging exists.)
//     • **SORTBY=cleabs IS MANDATORY — but the reason is a GUARANTEE, not a reproducible loss.**
//       ⚠ CORRECTED 2026-09-06. This bullet read: *"WITHOUT SORTBY → page1 5000 + page2 2092 = 7092
//       rows, but **7091 DISTINCT ids** — 1 duplicate returned and, by conservation, 1 building
//       NEVER RETURNED … An unsorted STARTINDEX loop therefore drops rows at a low rate while
//       looking complete. At the 13-city working set (312 pages) that is a few hundred silently
//       missing buildings."* **That rate does not reproduce.** Re-measured on the same cell
//       (2.34,48.85,2.36,48.87 · numberMatched 7092 · COUNT=5000 · STARTINDEX 0 then 5000), FOUR
//       consecutive unsorted page-pairs: rows 7092 · **DISTINCT 7092** · overlap 0 · **LOST 0**,
//       every time; the sorted arm read identically. So the honest state is: the loss was observed
//       ONCE in five measured page-pairs and has not been seen since — one occurrence proves the
//       server CAN return an inconsistent order across two requests, and four clean runs prove
//       nothing about whether it will again. Do NOT quote "drops rows at a low rate": that was a
//       rate extrapolated from a single event (§TOLERANCE-FROM-MEASURED-ERROR, from the other end).
//       ⭐ SORTBY stays MANDATORY on the STRONGER argument, which never needed the rate: WFS 2.0
//       does not guarantee a stable result order between requests, so an unsorted STARTINDEX loop
//       is UNSOUND BY CONSTRUCTION whether or not it happens to be lucky. Its measured cost is
//       nothing (page-1 latency 1.85 s unsorted vs 7.05 s sorted on the first pair, then within
//       noise across the repeats — a warm-cache artefact, not a sort cost). A correctness guarantee
//       bought for free is taken; and `fetchBdtopoCell` dedupes by `cleabs` anyway, so the two
//       defences are independent.
//     • RESULTTYPE=hits is a ~0.7–1.1 s count probe per city bbox (787-byte XML, numberMatched in
//       the root attribute). Whole-France hits: **49,948,635** buildings, 9.44 s.
//     • CQL_FILTER is NOT supported: `…&CQL_FILTER=hauteur IS NULL AND nombre_d_etages > 0` →
//       **HTTP 500** ows:ExceptionReport (552 bytes). Filtering happens client-side, here.
//     • Page cost, measured: 5000 features = 7,265,875 bytes in 2.42 s (≈1,453 B/feature).
//
// (b) DÉPARTEMENT DOWNLOAD — geoservices.ign.fr/bdtopo is an Angular shell (HTTP 200, 115,193 bytes,
//     ZERO download hrefs in the HTML — grep for `data.geopf.fr/telechargement` finds nothing). The
//     real listing is the ATOM feed the app calls:
//       https://data.geopf.fr/telechargement/resource/BDTOPO            → 200, application/atom+xml
//       …?zone=D078            → the Yvelines editions   …?format=GeoParquet → the national ones
//       …/BDTOPO_3-5_TOUSTHEMES_GPKG_LAMB93_D078_2026-06-15 → 1 entry, gpf_dl:length
//     MEASURED SIZES (edition 2026-06-15, the current one):
//       • Yvelines  D078 GPKG 7z … **343.7 MB**
//       • Hérault   D034 GPKG 7z … **467.2 MB**
//     Both are TOUSTHEMES (all 40-odd BD TOPO classes, not just batiment) and both are **LAMB93
//     (EPSG:2154)**, so this path costs a 7z extraction + a GeoPackage/SQLite read + a LAMB93→WGS84
//     reprojection of every ring. NONE of those three is available here: `node_modules` has geotiff,
//     proj4, sharp — **no sqlite/gpkg reader** — and there is no `7z`/`ogr2ogr` on PATH (checked).
//     `node:sqlite` DOES exist on this machine's node v24.15.0, but the bake image's node version is
//     not pinned to that and the 7z step has no answer, so **the GPKG path is NOT the production
//     path** and is not implemented. It is recorded here so nobody re-derives it.
//
// (c) ⭐ THE NATIONAL GEOPARQUET — THE PRODUCTION PATH FOR WHOLE-FRANCE. Found via the same feed
//     (`?format=GeoParquet`, 2 entries; the current one is `BDTOPO_TOUSTHEMES_3-5_GEOPARQUET_
//     WGS84G_FRA_2026-06-15`, editionDate 2026-06-15). Its `batiment.parquet`:
//       HEAD → HTTP 200, content-type application/vnd.apache.parquet,
//              content-length **8,757,357,612** (8.76 GB), **accept-ranges: bytes**
//       Range request for the last 8 bytes → **HTTP 206**, b'\x1e\x1a7\x00PAR1' (footer 3,611,166 B)
//       Footer read (Range, 3.6 MB) and scanned for column names → contains
//         **`geometrie_bbox` with `xmin` / `xmax` / `ymin` / `ymax`** (the GeoParquet 1.1 covering
//         column) alongside cleabs · hauteur · nombre_d_etages · usage_1 · usage_2 ·
//         date_d_apparition · etat_de_l_objet · nature · geometrie.
//     That is EXACTLY the shape `overtureBuildingsCmd` already exploits in bake.mjs: a bbox struct
//     predicate + range reads over httpfs, so a region query reads row groups, not 8.76 GB. It is
//     WGS84 (`category term=…/EPSG/0/4326`), so no reprojection. ⚠ NOT YET RUN END-TO-END: there is
//     no duckdb binary and no docker on THIS machine (`which duckdb` / `which docker` → nothing), so
//     the pushdown is inferred from the footer, not measured. `bdtopoNationalParquetSql()` below
//     emits the query; the orchestrator's bake image (which carries duckdb for Overture) is where it
//     gets its first real run. Saying otherwise would be the "fake more capable than real" mistake.
//
// (d) THE GATE PARCELS, resolved and probed (apicarto IGN cadastre → BD TOPO WFS):
//     • **Sète 34301000BO0317** — apicarto HTTP 200, 1,018 B, bbox 3.675380,43.396442,3.675697,
//       43.396654 (contenance 348 m²). BD TOPO over that bbox → numberMatched **4**, and ALL FOUR
//       carry a real `hauteur`: 7.0 (1 étage) · 4.4 (1) · 4.5 (null étages) · 6.2 (2), every one
//       `etat_de_l_objet = "En service"`. **The gate row is satisfiable at source.**
//     • **Jouy-en-Josas 78322000AB0340** — apicarto HTTP 200, 752 B, bbox 2.169447,48.772295,
//       2.169938,48.772524 (contenance 698 m²). BD TOPO → numberMatched **2**: hauteur 7.7 m /
//       2 étages / apparition 1966, and 5.2 m / 1 étage / apparition 1980; rings of 5 and 7 points.
//       ⚠ Jouy-en-Josas is **outside every bbox in MNH_FR_CITY_BBOXES** (nearest is `paris`,
//       2.22–2.47 × 48.80–48.91; Jouy is 2.169, 48.772). The founder's "not true size/shape" site is
//       not in ANY working set today — which is why FR_BDTOPO_CITY_BBOXES below adds it explicitly.
//
// (e) HEIGHT COMPLETENESS, measured on the returned rows rather than assumed:
//       central Paris page (5000 rows) → `hauteur` present on **4,687** (93.7 %).
//       ⚠ CORRECTED 2026-09-06. This bullet said *"the 313 nulls all had `nombre_d_etages` null
//       TOO, so they degrade to `heightKind:'unknown'`"*. **"All" is false**, and it mattered: the
//       spec had a LABELLED SYNTHETIC standing in for a case the header said does not occur. The
//       313 null-`hauteur` rows break down, live, as **263 floors-null → `unknown` · 46 floors ≥ 1
//       → `floors×3.0` · 4 floors exactly 0 → `unknown`** (a zero-storey building is not a 0 m
//       measurement; the `> 0` test in `bdtopoFootprint` is what keeps those four honest). So the
//       floors×3.0 branch is ~0.9 % of central Paris, not dead code — `__tests__/frBdtopo.spec.ts`
//       now pins it against a REAL capture (BATIMENT0000000245157882) instead of a mutated row.
//       Sète parcel → 4 of 4 present. Jouy parcel → 2 of 2 present.
//     ⚠ AND THE THIRD ORDINATE IS A TRAP. Those 313 "Pas de Z" rows ship Z = **−1000** on every
//       vertex — a nodata sentinel, not an altitude. The national GeoParquet footer agrees: its
//       declared `geo` bbox for `geometrie` runs z −1000.0 → 4363.9. `stripZ` is therefore a
//       CORRECTNESS rule, not tidiness (`keepZ: true` would bury those buildings a kilometre down),
//       and `writeBdtopoWorkingSet` defaults it off.
//
// (f) ⭐ IS `hauteur` ACTUALLY MEASURED? — CROSS-CHECKED AGAINST AN INDEPENDENT SOURCE, because the
//     label `heightKind:'measured'` is a claim and this repo has been burned by claims (the probe
//     can be wrong three ways; demand a second source). TWO REASONS TO DOUBT IT FIRST:
//       • `methode_d_acquisition_altimetrique` over the central-Paris page is dominated by
//         **"Interpolation bâti BDTopo" (4,666 of 5,000)**, with "BDTopo" 18, "Photogrammétrie" 3
//         and "Pas de Z" 313 — and over the Jouy page (1,102 rows) "Corrélation" 428 · "Interpolation
//         bâti BDTopo" 516 · "Photogrammétrie" 47 · "BDTopo" 27 · "Pas de Z" 80. An *interpolation*
//         is not obviously a measurement.
//       • that field describes how the GEOMETRY's Z was acquired, not `hauteur` — in the Jouy page,
//         4 rows carry a method AND a null `hauteur`, so the two are not the same fact.
//     SO IT WAS MEASURED AGAINST THE LiDAR. IGN LiDAR HD **MNH** GetMap (the raster the `mnh_fr`
//     stamp already uses — a genuinely independent instrument), sampled ONLY inside each BD TOPO
//     ring eroded 20 % toward its centroid, ~800–1,300 px per building, nodata 0:
//       cleabs                    hauteur    MNH p90     delta
//       BATIMENT…207209247 sète     7.0 m     7.07 m     +0.07 m
//       BATIMENT…207209550 sète     4.4 m     4.29 m     −0.11 m
//       BATIMENT…207209551 sète     4.5 m     2.91 m     −1.59 m
//       BATIMENT…207209557 sète     6.2 m     6.97 m     +0.77 m
//       BATIMENT…322073787 jouy     5.2 m     5.89 m     +0.69 m
//       BATIMENT…322073810 jouy     7.7 m     9.41 m     +1.71 m
//     Six of six agree in SIGN and MAGNITUDE; five of six within 1.0 m, worst case 1.71 m, median
//     |delta| ≈ 0.73 m. Two independent instruments, one verdict: **`hauteur` is a real height above
//     ground**, not a placeholder and nothing like the fabricated 9 m default. `heightKind:'measured'`
//     is therefore earned. The per-row `methode_d_acquisition_altimetrique` still travels on every
//     footprint (`pryzm:height_method`) so a later consumer can rank a "Corrélation" above an
//     "Interpolation bâti BDTopo" without re-deriving any of this.
//     ⚠ NOT ESTABLISHED by the above: a national error distribution. Six buildings on two parcels is
//     a sanity check, not a p95. Do not quote a tolerance from it (§TOLERANCE-FROM-MEASURED-ERROR).
//
// LICENCE: Licence Ouverte / Open Licence 2.0 (Etalab) — commercial use permitted with attribution
// "IGN – BD TOPO®". Same licence family as the LiDAR HD MNH stamp already shipping.
// ─────────────────────────────────────────────────────────────────────────────

import { appendFileSync, closeSync, openSync, readSync, writeFileSync } from 'node:fs';

import { partitionGeojsonseq } from '../geojsonseqRead.mjs';
// §OFFICIAL-FOOTPRINT-TAG-CONTRACT — IMPORTED, never re-declared. Four things must agree on these
// keys (this adapter, bake.mjs's merge, tools/context-height-probe, and the client reader
// apps/editor/src/ui/geospatial/officialFootprint.ts), and `OFFICIAL_SOURCES` in that module ALREADY
// names 'fr_bdtopo' — the client is waiting for these tags. Emitting FR footprints without them is
// the §COMMITTED-IS-NOT-REACHABLE failure exactly: the tiles would carry IGN's true outlines and the
// official-footprint reader would skip every one of them, silently, with nothing failing.
import { HEIGHT_KIND_FLOORS, OFFICIAL_METRES_PER_FLOOR, OFFICIAL_TAGS } from './officialFootprints.mjs';

export const FR_BDTOPO = {
  wfs: 'https://data.geopf.fr/wfs/ows',
  typeName: 'BDTOPO_V3:batiment',
  crs: 'EPSG:4326',
  /** Server-side hard cap on COUNT — measured, not documented: COUNT=10000 returned 5000. */
  maxPageCount: 5000,
  /** WFS 2.0 sort key. MANDATORY — see the SORTBY probe in the header. */
  sortBy: 'cleabs',
  /** Whole-France `RESULTTYPE=hits`, 2026-09-05. */
  nationalFeatureCount: 49_948_635,
  /** The national GeoParquet — the production path for a whole-country bake. */
  parquetUrl: 'https://data.geopf.fr/telechargement/download/BDTOPO/'
    + 'BDTOPO_TOUSTHEMES_3-5_GEOPARQUET_WGS84G_FRA_2026-06-15/batiment.parquet',
  parquetBytes: 8_757_357_612,
  parquetEdition: '2026-06-15',
  /** GeoParquet 1.1 covering column, confirmed in the footer — this is what makes pushdown work. */
  parquetBboxColumn: 'geometrie_bbox',
  parquetGeomColumn: 'geometrie',
  attribution: 'IGN – BD TOPO® (Licence Ouverte / Open Licence 2.0)',
  source: 'fr_bdtopo',
};

/**
 * The bboxes the WFS path fetches. NOT the nation: 49.9 M buildings is ~9,990 pages / ~72 GB of
 * GeoJSON at the measured 1,453 B/feature, which no 180-minute job survives (see §RUNTIME below).
 * This list is the WFS working set; whole-France goes through the GeoParquet instead.
 *
 * Rows 1–13 are `MNH_FR_CITY_BBOXES` verbatim, so the footprint set and the MNH height stamp cover
 * the SAME ground and the two never disagree about which places are solid. `jouy-en-josas` is the
 * 14th and is NOT in that list — it is the founder's "not true size / not true shape" site
 * (L-12940) and it is what proves the footprint path does something the height stamp cannot.
 */
export const FR_BDTOPO_CITY_BBOXES = [
  // city              [w, s, e, n]                       measured RESULTTYPE=hits, 2026-09-05
  { city: 'paris', bbox: [2.22, 48.80, 2.47, 48.91], count: 317_361 },
  { city: 'lyon', bbox: [4.78, 45.70, 4.92, 45.80], count: 110_415 },
  { city: 'marseille', bbox: [5.32, 43.25, 5.45, 43.35], count: 164_528 },
  { city: 'toulouse', bbox: [1.38, 43.55, 1.50, 43.65], count: 137_070 },
  { city: 'nice', bbox: [7.20, 43.68, 7.30, 43.74], count: 44_775 },
  { city: 'nantes', bbox: [-1.62, 47.18, -1.50, 47.26], count: 116_260 },
  { city: 'strasbourg', bbox: [7.70, 48.53, 7.80, 48.62], count: 53_547 },
  { city: 'montpellier', bbox: [3.80, 43.57, 3.93, 43.65], count: 93_457 },
  { city: 'bordeaux', bbox: [-0.65, 44.80, -0.52, 44.88], count: 181_074 },
  { city: 'rennes', bbox: [-1.75, 48.07, -1.60, 48.15], count: 59_539 },
  { city: 'grenoble', bbox: [5.68, 45.15, 5.78, 45.22], count: 46_597 },
  { city: 'sete', bbox: [3.64, 43.37, 3.74, 43.44], count: 22_479 },
  // ⭐ lille has ZERO LiDAR HD dalles (mnhFr.mjs header) so the MNH stamp skips it entirely — but BD
  // TOPO's `hauteur` is photogrammetric and national, so lille gets real footprints AND real heights
  // here. The two sources are complementary, not redundant.
  { city: 'lille', bbox: [2.98, 50.58, 3.14, 50.68], count: 210_416 },
  { city: 'jouy-en-josas', bbox: [2.14, 48.75, 2.20, 48.79], count: 7_277 },
];

/** Sum of the measured per-city counts above — the WFS path's whole job. */
export const FR_BDTOPO_WORKING_SET_COUNT = FR_BDTOPO_CITY_BBOXES.reduce((a, c) => a + c.count, 0);

// Same clamp the national height sources use (heightSources.mjs MIN/MAX_HEIGHT_M), restated here so
// this module stays importable from vitest (heightSources.mjs is not — it lazy-imports geotiff).
export const MIN_HEIGHT_M = 2.5;
export const MAX_HEIGHT_M = 400;
export const clampHeightM = (h) => Math.min(MAX_HEIGHT_M, Math.max(MIN_HEIGHT_M, h));

/**
 * Metres per storey when `hauteur` is absent — and the label that must always accompany it.
 * BOTH re-exported from the shared contract rather than re-declared: two rival storey constants in
 * one bake is precisely the defect officialFootprints.mjs was written to remove, and a label that
 * said `floors×3.0` while the arithmetic used another number is a lie that no test would catch.
 */
export const METRES_PER_FLOOR = OFFICIAL_METRES_PER_FLOOR;
export const FLOORS_HEIGHT_KIND = HEIGHT_KIND_FLOORS;

/**
 * `etat_de_l_objet` values that describe a building that IS THERE. Everything else is dropped.
 *
 * ⚠ This is a correctness rule, not tidiness. "En projet" is a building that does not exist yet and
 * "Détruit"/"Démoli" is one that no longer does; drawing either is exactly the "not true shape"
 * complaint, inverted. "En construction" is kept — there is a structure on the ground. A row whose
 * `etat_de_l_objet` is null/absent is KEPT: absence of a status is not a statement that the building
 * is gone, and the whole-Paris sample carried "En service" on 5000 of 5000, so an unknown here is
 * rare enough that dropping it would lose more than it saves.
 *
 * ⭐ THE OBSERVED VOCABULARY, so nobody guesses at it (one 0.02° cell over Sète centre, 3,636 rows,
 * live 2026-09-05): **"En service" 3,633 · "En construction" 2 · "En ruine" 1**. The live smoke of
 * this adapter over that cell reported `dropped=1` — the ruin — which is the filter working on real
 * data rather than on a hypothesis. ⚠ The value is "En ruine", NOT "Ruine". An allow-LIST is why
 * that difference is harmless here; a deny-list keyed on a guessed spelling would have drawn it.
 */
export const KEPT_CONDITIONS = new Set(['En service', 'En construction']);

/** True when the row describes a building that exists on the ground. */
export function isStandingCondition(condition) {
  if (condition === null || condition === undefined || condition === '') return true; // unknown ≠ gone
  return KEPT_CONDITIONS.has(condition);
}

/** `"1966-01-01Z"` / `"2010-01-19T14:13:49.663Z"` → 1966 / 2010. Anything else → null (never 0). */
export function yearOf(dateStr) {
  if (typeof dateStr !== 'string') return null;
  const m = /^(\d{4})-/.exec(dateStr);
  if (!m) return null;
  const y = Number(m[1]);
  return Number.isFinite(y) && y > 1000 && y < 3000 ? y : null;
}

/**
 * ONE BD TOPO `batiment` row → the shared footprint record, or `null` if it must be dropped.
 *
 * Shape (identical to the ES/Catastro footprint lane, so bake.mjs has one writer for both):
 *   { source, part, floors, height, heightKind, use, built, condition, id, heightMethod, geometry }
 *
 * §CONTEXT-DATA-HONESTY, the three height cases and NOTHING between them:
 *   `hauteur` finite and > 0        → height = clamp(hauteur),  heightKind 'measured'
 *   `hauteur` null, étages finite>0 → height = étages × 3.0,    heightKind 'floors×3.0'
 *   neither                          → height = null,            heightKind 'unknown'
 * The third case emits the FOOTPRINT with no height tag, so the client falls back to its honest
 * `assumed` default. It never invents a number, and it never drops a real footprint just because the
 * height is missing — the founder's Jouy complaint is about SHAPE, and a shapeless honest ghost is
 * strictly worse than a true outline at an assumed height.
 *
 * `part: false` — BD TOPO `batiment` is a whole building, not a Catastro-style BuildingPart. Stated
 * rather than omitted because the ES lane's rows carry `part: true` for exactly the opposite reason.
 */
export function bdtopoFootprint(feature) {
  const p = feature?.properties;
  const geometry = feature?.geometry;
  if (!p || !geometry || !geometry.type || !geometry.coordinates) return null;

  const condition = p.etat_de_l_objet ?? null;
  if (!isStandingCondition(condition)) return null;

  const rawH = Number(p.hauteur);
  const rawFloors = Number(p.nombre_d_etages);
  const floors = Number.isFinite(rawFloors) && rawFloors > 0 ? Math.round(rawFloors) : null;

  let height = null;
  let heightKind = 'unknown';
  if (Number.isFinite(rawH) && rawH > 0) {
    height = clampHeightM(rawH);
    heightKind = 'measured';
  } else if (floors !== null) {
    height = clampHeightM(floors * METRES_PER_FLOOR);
    heightKind = FLOORS_HEIGHT_KIND;
  }

  return {
    source: FR_BDTOPO.source,
    part: false,
    floors,
    height,
    heightKind,
    use: p.usage_1 ?? null,
    built: yearOf(p.date_d_apparition),
    condition,
    id: p.cleabs ?? null,
    // Per-row provenance IGN itself supplies: "Photogrammétrie" | "Lidar" | … Carried because it is
    // the difference between a 1.5 m-accurate and a 0.5 m-accurate `measured`, and it costs nothing.
    heightMethod: p.methode_d_acquisition_altimetrique ?? null,
    geometry,
  };
}

/** Drop the third ordinate BD TOPO ships on every vertex. Pure; returns a NEW geometry. */
export function stripZ(geometry) {
  if (!geometry) return geometry;
  const walk = (c) => (typeof c[0] === 'number' ? [c[0], c[1]] : c.map(walk));
  return { ...geometry, coordinates: geometry.coordinates.map(walk) };
}

/**
 * The record → the OSM-style tags bake's tippecanoe input and the client tile reader key on.
 *
 * ⚠ WIRE-CRITICAL, the same trap heightSources.mjs documents: `building` MUST be present or
 * contextTiles.ts `belongsToLayer()` drops the feature and the region renders ZERO buildings.
 * `pryzm:height_src` is set ONLY for `heightKind:'measured'` — a floors×3.0 estimate that claimed
 * `measured-lidar` would rank above a real OSM survey, which is the honesty inversion C57 §1.9 bans.
 *
 * ⭐ ADDED 2026-09-06 — THE §OFFICIAL-FOOTPRINT-TAG-CONTRACT KEYS, and this was a REACHABILITY BUG,
 * not a polish item. `officialFootprints.mjs` (the ES lane's shared contract) already lists
 * 'fr_bdtopo' in `OFFICIAL_SOURCES`, and the client reader
 * `apps/editor/src/ui/geospatial/officialFootprint.ts` decides whether a footprint is official by
 * looking for `pryzm:source`. This function emitted `heightSource` and no `pryzm:source`, so every
 * French BD TOPO outline would have shipped into the tiles and been read by the client as an
 * ORDINARY OSM footprint — IGN's true geometry delivered and the provenance thrown away, silently,
 * with every test still green (§COMMITTED-IS-NOT-REACHABLE; §AUTHORED-BUT-UNWIRED). The CI gate has
 * the same dependency: `--require-ref` matches on `pryzm:ref`, so without it there is no way to
 * assert the founder's Sète building by its own national identifier.
 *
 * TWO DELIBERATE DIVERGENCES from the ES shape, both because France measures what Spain counts:
 *   • `height` (the real OSM key) carries IGN's `hauteur`, because it IS a measurement. ES writes
 *     `pryzm:height_floors_m` and never `height`, precisely because its metres are OUR arithmetic
 *     over a storey count. Same contract, opposite honest answers.
 *   • `pryzm:height_kind` takes 'measured' here — a value the Catastro source can never produce.
 *     Where FR derives from floors it uses the SHARED `HEIGHT_KIND_FLOORS`, so the two agree
 *     character for character on the one value they can both emit.
 * `heightSource` is kept ALONGSIDE `pryzm:source` — it is what the existing (pre-contract) client
 * height ladder reads, and dropping it to tidy up would be a silent regression for that reader.
 */
export function footprintTags(rec) {
  const tags = { building: 'yes' };
  if (rec.height !== null && rec.height !== undefined) tags.height = rec.height;
  if (rec.heightKind === 'measured') tags['pryzm:height_src'] = 'measured-lidar';
  if (rec.floors !== null && rec.floors !== undefined) tags['building:levels'] = rec.floors;
  tags.heightSource = rec.source;
  tags[OFFICIAL_TAGS.source] = rec.source;
  // BD TOPO's `cleabs` is IGN's own stable national identifier for the building — the exact
  // counterpart of the Catastro refcat the gate asserts for Córdoba, and what makes a NAMED-BUILDING
  // gate possible for France at all (a count cannot tell a real official bake from a large OSM one).
  if (rec.id) tags[OFFICIAL_TAGS.ref] = rec.id;
  // Always 'false': BD TOPO `batiment` is a whole building. Catastro's BuildingParts are the reason
  // this key exists, and stating the negative explicitly is what lets a consumer distinguish
  // "this source has no parts" from "this feature forgot to say".
  tags[OFFICIAL_TAGS.part] = rec.part ? 'true' : 'false';
  tags[OFFICIAL_TAGS.heightKind] = rec.heightKind;
  // IGN's own per-row acquisition method — see probe (f). Carried, never collapsed into the kind:
  // it is the difference between a "Corrélation" and an "Interpolation bâti BDTopo" height, and a
  // consumer that wants to rank them should not have to re-fetch BD TOPO to find out.
  if (rec.heightMethod) tags['pryzm:height_method'] = rec.heightMethod;
  if (rec.use) tags['building:use'] = rec.use;
  if (rec.condition) tags[OFFICIAL_TAGS.condition] = rec.condition;
  if (rec.built !== null && rec.built !== undefined) {
    tags.start_date = rec.built;
    tags[OFFICIAL_TAGS.built] = rec.built;
  }
  return tags;
}

/** Record → a GeoJSON Feature ready for the geojsonseq bake input. */
export function footprintFeature(rec, { keepZ = false } = {}) {
  return {
    type: 'Feature',
    geometry: keepZ ? rec.geometry : stripZ(rec.geometry),
    properties: footprintTags(rec),
  };
}

/** First [lon,lat] vertex of any geometry — the cheap "is this inside the covered area" sample. */
export function firstLonLat(geometry) {
  let c = geometry?.coordinates;
  while (Array.isArray(c) && !(typeof c[0] === 'number')) c = c[0];
  return Array.isArray(c) && typeof c[0] === 'number' ? [c[0], c[1]] : null;
}

/** Point-in-any-bbox, bboxes as [w,s,e,n]. */
export function inAnyBbox(lon, lat, bboxes) {
  for (const b of bboxes) {
    if (lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3]) return true;
  }
  return false;
}

/**
 * Tile [w,s,e,n] into cells of at most `cellDeg` on each axis.
 *
 * WHY CELLS AT ALL, given that a cell can still exceed the 5000 cap (the measured 0.05° Paris cell
 * 2.34,48.85–2.39,48.90 holds **32,358** buildings — 7 pages) and paging is therefore unavoidable
 * either way: a cell bounds the RETRY BLAST RADIUS and the STARTINDEX depth. A whole-city STARTINDEX
 * loop 64 pages deep re-walks the server's result set from 0 on every page and a failure at page 60
 * costs the whole city; a per-cell loop caps that at one cell. Cells also keep `numberMatched` small
 * enough that the sorted-paging guarantee stays cheap to verify.
 */
export function tileBboxes([w, s, e, n], cellDeg = 0.05) {
  const cells = [];
  const step = Math.max(1e-6, cellDeg);
  for (let x = w; x < e - 1e-9; x += step) {
    for (let y = s; y < n - 1e-9; y += step) {
      cells.push([
        Number(x.toFixed(6)),
        Number(y.toFixed(6)),
        Number(Math.min(e, x + step).toFixed(6)),
        Number(Math.min(n, y + step).toFixed(6)),
      ]);
    }
  }
  return cells;
}

const wfsBase = (cell) => `${FR_BDTOPO.wfs}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature`
  + `&TYPENAMES=${encodeURIComponent(FR_BDTOPO.typeName)}&SRSNAME=${FR_BDTOPO.crs}`
  // ⚠ lon,lat — see the axis-order probe. The wrong order is a 200 with zero features.
  + `&BBOX=${cell[0]},${cell[1]},${cell[2]},${cell[3]},${FR_BDTOPO.crs}`;

/** `RESULTTYPE=hits` URL — a ~1 s count probe, no features. */
export function bdtopoHitsUrl(cell) {
  return `${wfsBase(cell)}&RESULTTYPE=hits`;
}

/** One GeoJSON page. `count` is clamped to the measured server cap; SORTBY is never omitted. */
export function bdtopoPageUrl(cell, { startIndex = 0, count = FR_BDTOPO.maxPageCount } = {}) {
  const c = Math.min(FR_BDTOPO.maxPageCount, Math.max(1, Math.floor(count)));
  return `${wfsBase(cell)}&COUNT=${c}&STARTINDEX=${Math.max(0, Math.floor(startIndex))}`
    + `&SORTBY=${FR_BDTOPO.sortBy}&OUTPUTFORMAT=application/json`;
}

/**
 * `numberMatched` out of a WFS hits response.
 * Returns `null` — meaning UNKNOWN — when the attribute is absent or is the WFS `"unknown"` literal.
 * A caller must NOT read that as 0: a failed count is not an empty area (§CONTEXT-DATA-HONESTY).
 */
export function parseWfsHits(xml) {
  if (typeof xml !== 'string') return null;
  const m = /numberMatched\s*=\s*"([^"]*)"/.exec(xml);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** How many pages a cell of `matched` rows needs at the server cap. */
export function pagesFor(matched, pageSize = FR_BDTOPO.maxPageCount) {
  if (!Number.isFinite(matched) || matched <= 0) return 0;
  return Math.ceil(matched / Math.min(FR_BDTOPO.maxPageCount, pageSize));
}

/**
 * The DuckDB query for the NATIONAL path — the same construction `overtureBuildingsCmd` uses in
 * bake.mjs, pointed at IGN's GeoParquet and its `geometrie_bbox` covering column.
 *
 * The predicate is written as an INTERSECTION (`xmin <= maxx AND xmax >= minx …`) to match the WFS
 * bbox semantics and the client's `ringIntersectsBbox`, so a footprint straddling the region edge
 * survives. `etat_de_l_objet` is filtered IN SQL to the same set `isStandingCondition` keeps, so the
 * two paths cannot disagree about which buildings exist.
 *
 * ⚠ Column names are the long lowercase forms — verified in the parquet footer, not assumed from the
 * shapefile schema. `geoPath` must already be the in-container path when running under Docker
 * (bake.mjs's `tool()` rewrite does not reach inside a `-c` SQL string).
 */
export function bdtopoNationalParquetSql([minx, miny, maxx, maxy], geoPath, {
  parquetUrl = FR_BDTOPO.parquetUrl,
} = {}) {
  const kept = [...KEPT_CONDITIONS].map((c) => `'${c}'`).join(', ');
  return [
    'INSTALL spatial; INSTALL httpfs; LOAD spatial; LOAD httpfs;',
    'COPY (SELECT '
      + `'yes' AS "building", `
      // Same three-case height rule as bdtopoFootprint(), expressed once more in SQL. Kept literally
      // parallel (measured → floors×3.0 → nothing) so a change to one is obvious in the other.
      + 'CASE WHEN hauteur > 0 THEN hauteur '
      + `WHEN nombre_d_etages > 0 THEN nombre_d_etages * ${METRES_PER_FLOOR} END AS "height", `
      + "CASE WHEN hauteur > 0 THEN 'measured' "
      + `WHEN nombre_d_etages > 0 THEN '${FLOORS_HEIGHT_KIND}' ELSE 'unknown' END AS "${OFFICIAL_TAGS.heightKind}", `
      + "CASE WHEN hauteur > 0 THEN 'measured-lidar' END AS \"pryzm:height_src\", "
      + 'nombre_d_etages AS "building:levels", '
      + `'${FR_BDTOPO.source}' AS "heightSource", `
      // §OFFICIAL-FOOTPRINT-TAG-CONTRACT — the SAME keys footprintTags() emits on the WFS path.
      // The two paths must produce interchangeable tiles or a region baked nationally would be
      // invisible to the client's official reader while the same region baked by WFS is not.
      + `'${FR_BDTOPO.source}' AS "${OFFICIAL_TAGS.source}", `
      + `cleabs AS "${OFFICIAL_TAGS.ref}", `
      + `'false' AS "${OFFICIAL_TAGS.part}", `
      + `usage_1 AS "building:use", `
      + `etat_de_l_objet AS "${OFFICIAL_TAGS.condition}", `
      + `methode_d_acquisition_altimetrique AS "pryzm:height_method", `
      + `${FR_BDTOPO.parquetGeomColumn} AS geometry`
      + ` FROM read_parquet('${parquetUrl}')`
      + ` WHERE (etat_de_l_objet IS NULL OR etat_de_l_objet IN (${kept}))`
      + ` AND ${FR_BDTOPO.parquetBboxColumn}.xmin <= ${maxx}`
      + ` AND ${FR_BDTOPO.parquetBboxColumn}.xmax >= ${minx}`
      + ` AND ${FR_BDTOPO.parquetBboxColumn}.ymin <= ${maxy}`
      + ` AND ${FR_BDTOPO.parquetBboxColumn}.ymax >= ${miny})`
      + ` TO '${geoPath}' WITH (FORMAT GDAL, DRIVER 'GeoJSONSeq', SRS 'EPSG:4326');`,
  ].join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// NETWORK HALF. Everything above is a total function of its arguments and is what the spec pins.
// ─────────────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * GET with a timeout and bounded exponential backoff. Returns a STRUCTURED result, never throws —
 * the tools/*.mjs idiom: a caller must be able to tell "the server said no" from "there is nothing
 * here", and an exception collapses the two.
 */
export async function httpGetText(url, { timeoutMs = 60_000, retries = 3, backoffMs = 1_000 } = {}) {
  let last = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(backoffMs * 2 ** (attempt - 1));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'pryzm-context-bake/fr-bdtopo' } });
      const body = await res.text();
      if (!res.ok) { last = { status: 'error', reason: `HTTP ${res.status}`, httpStatus: res.status, body: body.slice(0, 200) }; continue; }
      return { status: 'ok', body, httpStatus: res.status, contentType: res.headers.get('content-type') ?? '' };
    } catch (err) {
      last = { status: 'error', reason: String(err?.message ?? err) };
    } finally {
      clearTimeout(timer);
    }
  }
  return last ?? { status: 'error', reason: 'no attempt made' };
}

/**
 * Every standing building in one cell, as footprint records.
 *
 * Pages with SORTBY (see the header — unsorted paging loses rows), stops when a page returns fewer
 * than the page size or when `numberMatched` is reached, and DEDUPES by `cleabs` as a belt-and-braces
 * guard: the sorted probe measured zero overlap, but a dedupe costs one Set and makes a future
 * server-side ordering change a no-op instead of a silent duplication.
 */
export async function fetchBdtopoCell(cell, { pageSize = FR_BDTOPO.maxPageCount, maxPages = 200, ...http } = {}) {
  const out = { status: 'ok', cell, records: [], pages: 0, matched: null, dropped: 0, duplicates: 0 };
  const seen = new Set();
  let startIndex = 0;
  for (let page = 0; page < maxPages; page++) {
    const r = await httpGetText(bdtopoPageUrl(cell, { startIndex, count: pageSize }), http);
    if (r.status !== 'ok') return { ...out, status: 'error', reason: `page ${page} @${startIndex}: ${r.reason}` };
    let json;
    try { json = JSON.parse(r.body); }
    catch { return { ...out, status: 'error', reason: `page ${page} @${startIndex}: unparseable body (${r.body.slice(0, 120)})` }; }
    const feats = json.features ?? [];
    if (out.matched === null && Number.isFinite(json.numberMatched)) out.matched = json.numberMatched;
    out.pages++;
    for (const f of feats) {
      const id = f?.properties?.cleabs ?? f?.id ?? null;
      if (id !== null && seen.has(id)) { out.duplicates++; continue; }
      if (id !== null) seen.add(id);
      const rec = bdtopoFootprint(f);
      if (!rec) { out.dropped++; continue; }
      out.records.push(rec);
    }
    if (feats.length < Math.min(FR_BDTOPO.maxPageCount, pageSize)) break;
    startIndex += feats.length;
    if (out.matched !== null && startIndex >= out.matched) break;
  }
  return out;
}

/**
 * Every standing building over a whole area, cell by cell. Reports per-cell failures BY NAME.
 *
 * §JOIN-BOUNDED-WORKING-SET (L-659) — pass a `sink(records, cell)` and the records are handed over
 * per cell and NEVER accumulated: peak heap is one cell (the densest measured cell holds 32,358
 * buildings), not the area. Without a sink they collect in `out.records`, which is fine for a spec
 * or one parcel and is exactly wrong for `paris` (317,361 footprints).
 */
export async function fetchBdtopoArea(wsen, { cellDeg = 0.05, onCell, sink, ...opts } = {}) {
  const cells = tileBboxes(wsen, cellDeg);
  const out = {
    status: 'ok', records: [], cells: cells.length, cellsOk: 0, cellsFailed: 0,
    failures: [], pages: 0, dropped: 0, duplicates: 0, kept: 0, measured: 0, floorsDerived: 0, unknown: 0,
  };
  for (const cell of cells) {
    const r = await fetchBdtopoCell(cell, opts);
    if (r.status !== 'ok') {
      out.cellsFailed++;
      out.failures.push({ cell, reason: r.reason });
    } else {
      out.cellsOk++;
      out.pages += r.pages;
      out.dropped += r.dropped;
      out.duplicates += r.duplicates;
      for (const rec of r.records) {
        out.kept++;
        if (rec.heightKind === 'measured') out.measured++;
        else if (rec.heightKind === FLOORS_HEIGHT_KIND) out.floorsDerived++;
        else out.unknown++;
      }
      if (sink) sink(r.records, cell);
      else out.records.push(...r.records);
    }
    if (onCell) onCell(cell, r, out);
  }
  // A cell that failed is a HOLE, not an absence. Say so; never let a partial area read as complete.
  if (out.cellsFailed > 0 && out.cellsOk === 0) out.status = 'error';
  else if (out.cellsFailed > 0) out.status = 'partial';
  return out;
}

/**
 * The whole WFS working set, streamed to a geojsonseq file one cell at a time.
 * Returns the per-city roll-up the bake log and the ISSUE-LOG row need — counts SEPARATED by height
 * source, never summed into one cheerful total (C57 §1.5).
 */
export async function writeBdtopoWorkingSet(outPath, bboxes = FR_BDTOPO_CITY_BBOXES, { keepZ = false, onArea, ...opts } = {}) {
  writeFileSync(outPath, '');
  // The field set is the one `footprints/footprintMerge.mjs` documents for BOTH countries —
  // { status, written, measured, floorsDerived, unknown, cells, cellsFailed, areas } — so
  // `applyNationalFootprints` drives ES and FR through one code path and neither gets a private
  // branch. `pages`, `dropped` and `duplicates` are FR-only extras; a shared caller ignores them.
  const out = {
    status: 'ok', outPath, areas: [], written: 0, measured: 0, floorsDerived: 0, unknown: 0,
    dropped: 0, duplicates: 0, pages: 0, cells: 0, cellsFailed: 0,
  };
  for (const area of bboxes) {
    const bbox = Array.isArray(area) ? area : area.bbox;
    const name = Array.isArray(area) ? bbox.join(',') : area.city;
    const res = await fetchBdtopoArea(bbox, {
      ...opts,
      sink: (records) => {
        out.written += appendFeaturesSeq(outPath, records.map((rec) => footprintFeature(rec, { keepZ })));
      },
    });
    // ⚠ `cells` travels on BOTH the area record and the roll-up. It was omitted from the area
    // record until a live smoke printed the bake's own progress line as `0/undefined cell(s)
    // failed` — an operator reading that at hour three cannot tell a clean area from a broken
    // counter, and 'undefined' is exactly the shape of a number nobody computed. The DENOMINATOR
    // is the point: `0/1` and `0/64` are different statements about how much was actually asked.
    out.areas.push({ area: name, status: res.status, kept: res.kept, measured: res.measured, floorsDerived: res.floorsDerived, unknown: res.unknown, cells: res.cells, cellsFailed: res.cellsFailed, dropped: res.dropped, failures: res.failures });
    out.measured += res.measured;
    out.floorsDerived += res.floorsDerived;
    out.unknown += res.unknown;
    out.dropped += res.dropped;
    out.duplicates += res.duplicates;
    out.pages += res.pages;
    out.cells += res.cells;
    out.cellsFailed += res.cellsFailed;
    if (onArea) onArea(name, res, out);
  }
  if (out.written === 0) out.status = 'error';
  else if (out.cellsFailed > 0) out.status = 'partial';
  return out;
}

/** §SEQ-WRITE-STREAMED (L-12937) — chunked; the largest string ever built is one 8 MiB chunk. */
export const SEQ_WRITE_CHUNK_CHARS = 8 * 1024 * 1024;
export function appendFeaturesSeq(path, feats, { truncate = false } = {}) {
  if (truncate) writeFileSync(path, '');
  let buf = '';
  let n = 0;
  for (const f of feats) {
    buf += JSON.stringify(f) + '\n';
    n++;
    if (buf.length >= SEQ_WRITE_CHUNK_CHARS) { appendFileSync(path, buf); buf = ''; }
  }
  if (buf.length) appendFileSync(path, buf);
  return n;
}

/**
 * Append one geojsonseq file to another as RAW BYTES, in bounded chunks. Never builds a string, so
 * a 2 GB working-set file costs one 8 MiB buffer (§SEQ-WRITE-STREAMED, from the other direction).
 * Returns the number of newline-terminated records appended.
 */
export function appendSeqFileBytes(outPath, seqPath, { chunkBytes = 8 << 20 } = {}) {
  const fd = openSync(seqPath, 'r');
  const buf = Buffer.allocUnsafe(chunkBytes);
  // `appendFeaturesSeq` terminates EVERY record with '\n', so counting newlines counts records
  // exactly. (This function only ever reads a file that writer produced.)
  let records = 0;
  try {
    for (;;) {
      const n = readSync(fd, buf, 0, chunkBytes, null);
      if (n <= 0) break;
      const slice = buf.subarray(0, n);
      for (let i = 0; i < n; i++) if (slice[i] === 0x0a) records++;
      appendFileSync(outPath, slice);
    }
  } finally {
    closeSync(fd);
  }
  return records;
}

/**
 * `footprintMerge: 'replace-in-bbox'` — the ONLY honest merge for a partial national footprint set.
 *
 * A plain `replace` would swap the whole-France OSM clip for 14 cities and delete the rest of the
 * country. A plain `append` would draw every covered building TWICE (BD TOPO's true outline z-fighting
 * with OSM's approximate one) — which is the founder's complaint made worse, not better. So: inside
 * the covered bboxes BD TOPO wins outright and the OSM footprints are dropped; outside them the OSM
 * clip passes through untouched, byte for byte.
 *
 * Memory: `select` returns the SENTINEL 1, never the parsed feature, so `partitionGeojsonseq`'s
 * `retained` array holds one SMI per dropped footprint (~12 MB for the 1.56 M-building working set)
 * instead of ~1.26 kB per footprint (§JOIN-BOUNDED-WORKING-SET would otherwise be violated by the
 * very mechanism meant to respect it).
 */
export function mergeReplaceInBbox(baseGeo, outPath, coveredBboxes, records, { keepZ = false, seqPath = null } = {}) {
  const part = partitionGeojsonseq(baseGeo, outPath, (feat) => {
    const p = firstLonLat(feat?.geometry);
    if (!p) return null;
    return inAnyBbox(p[0], p[1], coveredBboxes) ? 1 : null;
  });
  if (part.status !== 'ok') return { status: 'error', reason: part.reason, part };
  // `seqPath` is the streamed form: the footprints already live in a geojsonseq file (written cell
  // by cell by writeBdtopoWorkingSet), so they are appended as RAW BYTES and never re-parsed. The
  // in-memory `records` path stays for a spec and for a single-parcel run.
  const written = seqPath
    ? appendSeqFileBytes(outPath, seqPath)
    : appendFeaturesSeq(outPath, (function* () {
      for (const rec of records ?? []) yield footprintFeature(rec, { keepZ });
    })());
  return {
    status: 'ok',
    outPath,
    osmDropped: part.retainedCount,
    osmKept: part.passedThrough,
    bdtopoWritten: written,
    malformed: part.malformed,
    peakHeapUsedMB: part.peakHeapUsedMB,
  };
}

/**
 * `--footprints osm | official` off an argv array. `osm` is the default and the path every run has
 * always taken: the footprint table is never entered and the bake is byte-identical.
 *
 * WHY THE SWITCH LIVES HERE and not as a second inline parser in bake.mjs: two lanes landed a
 * `footprintSource` in the same week, and two `const FOOTPRINTS = …` declarations in one merged file
 * is a SyntaxError, not a merge conflict you notice. One exported resolver, any number of callers.
 * Anything other than the two known values is a HARD refusal — silently treating `--footprints
 * offical` as 'osm' would ship a run the operator believes swapped the footprints and did not.
 */
export function footprintsModeFromArgv(argv = []) {
  const i = argv.indexOf('--footprints');
  if (i < 0) return 'osm';
  const raw = argv[i + 1];
  if (raw !== 'osm' && raw !== 'official') {
    throw new Error(`--footprints must be 'osm' or 'official' (got ${raw ?? 'nothing'})`);
  }
  return raw;
}

/**
 * §RUNTIME — the numbers the orchestrator needs, all derived from the measured page cost
 * (5000 features / 7,265,875 B / 2.42 s) and the measured counts, never from a guess.
 */
export function estimateWfsRuntime(count, { pageSecs = 2.42, pageBytes = 7_265_875, pageSize = FR_BDTOPO.maxPageCount } = {}) {
  const pages = pagesFor(count, pageSize);
  return {
    features: count,
    pages,
    seconds: Math.round(pages * pageSecs),
    minutes: Math.round((pages * pageSecs) / 60),
    hours: Number(((pages * pageSecs) / 3600).toFixed(2)),
    bytes: pages * pageBytes,
    gigabytes: Number(((pages * pageBytes) / 1e9).toFixed(1)),
  };
}
