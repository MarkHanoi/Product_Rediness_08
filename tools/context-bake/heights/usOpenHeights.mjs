// ─────────────────────────────────────────────────────────────────────────────
// §US-OPEN-HEIGHTS (2026-09-05, lane HEIGHTS-US) — per-metro OPEN building-footprint heights for the
// United States: the PURE, dependency-free half of the US measured-height stamp.
//
// WHY THIS FILE IS SEPARATE FROM heightSources.mjs — the same reason as heights/mnhFr.mjs,
// heights/swissNdsm.mjs and heights/auOpenHeights.mjs: vitest cannot import heightSources.mjs, so every
// DECISION the stamp makes (which metro serves a point, the page URL and its axis order, which records
// count as buildings, the unit conversion, what is plausible, how a set of parts becomes ONE height)
// lives here as a total function of its arguments and is unit-tested against VERBATIM live fixtures.
// The network + stream half is heights/usOpenHeightsStamp.mjs (`stampUsOpenHeightsOnGeojsonseq`).
//
// THE CHANNELS — what is REAL, LIVE-PROBED 2026-09-05 (every number below is a measurement):
//   • NEW YORK — NYC Open Data "BUILDING" (Building Footprints), Socrata dataset 5zhs-2jue,
//     data.cityofnewyork.us. 1,083,026 rows (count(*)), rowsUpdatedAt 2026-08-30, attribution "Office
//     of Technology and Innovation (OTI)". Fields (verbatim): the_geom:multipolygon name bin doitt_id
//     shape_area base_bbl objectid construction_year feature_code geom_source ground_elevation
//     height_roof last_edited_date last_status_type mappluto_bbl shape_length. ⚠ The legacy names
//     `heightroof` / `groundelev` / `feat_code` no longer exist on the API — `$select=heightroof` →
//     HTTP 400 `query.soql.no-such-column`; the dataset ids qb5r-6dgf / nqwf-w8eh → HTTP 404
//     dataset.missing. ⭐ UNIT: FEET. The tallest row is bin 1090180 height_roof 1550 (Central Park
//     Tower, 1,550 ft = 472 m, feature_code 1006, construction_year 2020); the Empire State Building
//     (bin 1015862) reads 1238.79 (1,250 ft to roof). Midtown cell within_box(the_geom,40.7650,-73.9900,
//     40.7550,-73.9800) → 732 rows, 516,560 B, 2.7 s: height_roof p10 41.6 · p50 59.6 · p90 291.8 · max
//     887.7 ft; 0 null. Dataset-wide 736 rows have height_roof NULL or 0 (the metadata: "Records where
//     this is zero or NULL mean that this information was not available"). ⚠ PROVENANCE — NOT LiDAR.
//     The city's own metadata (nyc-geo-metadata/Metadata_BuildingFootprints.md, HEIGHT_ROOF): "The
//     height of the roof above the ground elevation, not height above sea level … Sources include
//     (1) Final as-built heights as shown in plan drawings posted on Department of Buildings BIS website
//     (2) EagleView Oblique imagery, direct measurements taken on photogrammetrically controlled aerial
//     imagery (3) Cyclomedia imagery, direct measurements were taken on photogrammetrically controlled
//     terrestrial imagery (for buildings less than 60 feet tall, only)". GROUND_ELEVATION is "Calculated
//     from LiDAR or photogrammetrically" (NAVD88). So height_roof is an AUTHORITY-MEASURED as-built /
//     photogrammetric roof height — the brief's "heightroof is LiDAR-derived" is FALSE and is not
//     repeated anywhere in this stamp. feature_code census: 2100 Building 868,521 · 5110 Garage 213,451 ·
//     5100 Under Construction 397 · 1004 Auxiliary 229 · 1001 Gas Station Canopy 135 · 2110 Skybridge 119 ·
//     1000 Parking 98 · 1003 Placeholder 28 · 1005 Temporary 25 · 1006 Cantilevered 23.
//     Paging: `$limit=60000` returned 60,000 rows (SODA 2.1 — no 50,000 cap) and `$order=:id&$offset=`
//     pages stably; a 0.01° cell is < 2,000 rows, one page. Licence: NYC Open Data Terms of Use
//     (metadata "Use Limitations | Open Data policies and restrictions apply").
//   • SAN FRANCISCO — DataSF "Building Footprints", Socrata dataset ynuv-fyni, data.sfgov.org. 177,023
//     rows, rowsUpdatedAt 2026-09-04, licence "Open Data Commons Public Domain Dedication and License
//     (PDDL)" (termsLink opendatacommons.org/licenses/pddl/1.0/), attribution "City and County of San
//     Francisco". Heights are LiDAR ZONAL STATISTICS precomputed per footprint (column descriptions,
//     verbatim): hgt_maxcm = "zonal statistic: LiDAR-derived height surface grid, maximum value of 50cm
//     square cells sampled in this building's zone, integer centimeters"; hgt_mediancm = the median of
//     the same grid; gnd_*cm / *cm_1st are the NAVD88 ground / first-return surfaces. ⚠ EVERY numeric
//     column is served as TEXT (`hgt_maxcm:text`) — `$order=hgt_maxcm DESC` sorts LEXICALLY ("999" above
//     "24123"), so the adapter casts with Number() and never trusts a server-side order. Financial
//     District cell within_box(shape,37.7950,-122.4050,37.7850,-122.3950) → 485 rows, 368,649 B, 1.2 s:
//     hgt_maxcm/100 p10 14.1 · p50 34.7 · p90 118.7 · max 241.2 m; 0 null hgt_mediancm dataset-wide.
//     Transamerica Pyramid (sf16_bldgid 201006.0000687): hgt_maxcm 25849 (258.5 m — the real 260 m) but
//     hgt_mediancm 6778 (67.8 m) — a tapering tower's MEDIAN over its footprint is not its height, which
//     is why the rule takes hgt_maxcm (OSM `height` = the highest point; CityGML measuredHeight likewise).
//     The cost is honest: a tree crown overhanging a small footprint can bias one building upward; the
//     P90-over-eroded-interior technique the raster stamps use is not available from precomputed zonal
//     statistics. data_as_of 2023-09-11; the masses derive from Pictometry 2010 + LiDAR.
//     `$limit=60000` → 60,000 rows (no cap); `$order=:id&$offset=` pages.
//   • BOSTON — BPDA (Boston Planning & Development Agency) "Boston Buildings with Roof Breaks",
//     ArcGIS FeatureServer gis.bostonplans.org/hosting/rest/services/Boston_Buildings/FeatureServer/9
//     ("Buildings", the service's ONLY layer — layer 0 → "Layer not found"). Listed on Analyze Boston
//     (data.boston.gov package boston-buildings-with-roof-breaks) under "Open Data Commons Public Domain
//     Dedication and License (PDDL)". 128,608 features (returnCountOnly), maxRecordCount 2000,
//     supportsPagination true (resultOffset=2000 → 2 rows, exceededTransferLimit true), native SR wkid
//     103072 / latestWkid 6492 (MA State Plane ft) — the adapter asks outSR=4326 and f=geojson, which the
//     server honours (Polygon, lon,lat). Fields (verbatim): OBJECTID PART_USE PART_BRA_U(Part_Use2)
//     GRND_ELEV_2010(Ground_Elevation) ROOF_ELEV_2010(Roof_Elevation) BLDG_HGT_2010(Building_Height)
//     IEL_TYPE Land_Use BRA_Land_Use Added Shape__Area Shape__Length. ⭐ UNIT: FEET — tallest rows
//     BLDG_HGT_2010 788.19 (200 Clarendon / Hancock Tower, 790 ft), 748 (Prudential Tower, 749 ft),
//     691, 685; ROOF_ELEV − GRND_ELEV = BLDG_HGT. "Roof breaks" = one row per roof-level PART, so an
//     OSM footprint may contain several parts (the Melbourne shape) → the join takes the tallest part
//     whose centroid it contains. IEL_TYPE census (groupBy count): BLDG 102,201 · OUTBLDG 25,194 ·
//     MOBILE 262 · RUIN 241 · OVHD-WALKWAY 224 · null 403 · CONSTRUCT 44 · FOUNDATION 26 · Tank 4 ·
//     "Buidling" 3 · "" 3 · "120" 2 · "1500" 1. 23,487 features have BLDG_HGT_2010 NULL or ≤ 0 — those
//     get NO height (never a neighbour's). Back Bay 0.01° cell [-71.08,42.35,-71.07,42.36] → 1,225
//     features, 1,008,067 B, 7.6 s (the slowest channel here — hence its larger cell span).
//     "_2010" = the BPDA 2010 photogrammetric 3D city model: authority-measured, not LiDAR.
//
// WHAT IS NOT REAL (probed the same day, so these metros stay `documented`, never armed):
//   • CHICAGO — data.cityofchicago.org "Building Footprints" syp8-uezg (the id the catalogue serves
//     as current; hz9b-7eeu → 404 dataset.missing): 820,606 rows, rowsUpdatedAt 2015-08-15, fields
//     the_geom bldg_id … stories:number no_stories:number year_built bldg_sq_fo z_coord … — NO height
//     field. A Loop cell within_box(the_geom,41.8850,-87.6350,41.8750,-87.6250) → 251 rows, stories
//     p50 10 · p90 37 · max 60, z_coord 0 everywhere, no_stories 0. `stories` could feed
//     `building:levels` (client rung `derived-levels`), which is NOT a measured height and is not what
//     this stamp writes; it is recorded as the owed follow-up, not done.
//   • MASSGIS statewide — GeoServer WFS gis-prod.digital.mass.gov/geoserver, massgis:GISDATA.STRUCTURES_POLY
//     DescribeFeatureType (HTTP 200, 2,741 B), fields verbatim: struct_id source sourcetype sourcedate
//     sourcedata moved area_sq_ft town_id town_id2 town_id3 local_id archived archivedate edit_date
//     edit_by comments — NO height. gis.massgis.digital.mass.gov does not resolve (curl exit 6).
//   • BOSTON gisportal — gisportal.boston.gov Assessing/DOIT_buildings has no FeatureServer extension
//     (HTTP 500 "Server object extension 'featureserver' not found") and its MapServer/0 answers 52 B;
//     CityServices/OPEN_DATA/MapServer → 404. The AGOL "Boston Buildings (Internal) view" on
//     services5.arcgis.com carries Height_Relative but belongs to a third-party org (pref.gis.support),
//     not the city — not an authority channel.
// ─────────────────────────────────────────────────────────────────────────────

export const FT_TO_M = 0.3048;

/** The per-metro adapter table. Only metros with a PROBED, keyless, height-bearing footprint channel
 *  belong here; everything else is in US_OPEN_HEIGHTS_ASSESSED below. `region` = the bake.mjs row, which
 *  is a whole STATE since §BAKE-US-STATES (2026-09-06) — sanfrancisco stamps inside `california`, boston
 *  inside `massachusetts`; the metro KEY and every probed number are unchanged. */
export const US_OPEN_HEIGHTS = {
  newyork: {
    metro: 'newyork', region: 'newyork',
    label: 'NYC Open Data — BUILDING (Building Footprints), height_roof (Socrata 5zhs-2jue)',
    kind: 'socrata',
    dataset: 'https://data.cityofnewyork.us/resource/5zhs-2jue.json',
    geomField: 'the_geom', idField: 'bin',
    selectFields: ['bin', 'height_roof', 'ground_elevation', 'feature_code', 'construction_year', 'geom_source', 'the_geom'],
    typeField: 'feature_code',
    // Building · Building Under Construction · Garage · Parking · Auxiliary Structure · Cantilevered Building.
    // Excluded: 1001 gas-station canopy, 1002 storage tank, 1003 placeholder triangle, 1005 temporary, 2110 skybridge.
    includeTypes: ['2100', '5100', '5110', '1000', '1004', '1006'],
    heightField: 'height_roof', unit: 'ft',
    pageLimit: 50_000, tileSpanDeg: 0.01,
    minPlausibleM: 2.0, maxPlausibleM: 560,   // Central Park Tower 472 m is in the data; One WTC's roof is 417 m
    heightSourceTag: 'nyc-oti-height_roof',
    measurement: 'authority-measured roof height: DOB as-built plan heights / EagleView oblique photogrammetry / Cyclomedia (<60 ft) — NOT LiDAR (NYC metadata, verbatim in the header)',
    licence: 'NYC Open Data Terms of Use (opendata.cityofnewyork.us/overview/#termsofuse) — probed 2026-09-05',
    attribution: 'NYC Office of Technology and Innovation (OTI) — Building Footprints',
  },
  sanfrancisco: {
    metro: 'sanfrancisco', region: 'california',
    label: 'DataSF — Building Footprints, LiDAR zonal hgt_maxcm (Socrata ynuv-fyni)',
    kind: 'socrata',
    dataset: 'https://data.sfgov.org/resource/ynuv-fyni.json',
    geomField: 'shape', idField: 'sf16_bldgid',
    selectFields: ['sf16_bldgid', 'hgt_maxcm', 'hgt_mediancm', 'gnd_min_m', 'data_as_of', 'shape'],
    typeField: null, includeTypes: null,       // one row per split footprint; every row is a building mass
    heightField: 'hgt_maxcm', unit: 'cm',
    pageLimit: 50_000, tileSpanDeg: 0.01,
    minPlausibleM: 2.0, maxPlausibleM: 330,   // Salesforce Tower 326 m
    heightSourceTag: 'sf-datasf-lidar-hgt_maxcm',
    measurement: 'LiDAR-derived height surface, zonal MAXIMUM over the footprint (50 cm cells, integer cm) — hgt_mediancm under-reads tapering towers (Transamerica 67.8 vs 258.5 m)',
    licence: 'Open Data Commons PDDL 1.0 (dataset meta license, termsLink opendatacommons.org/licenses/pddl/1.0/ — probed 2026-09-05)',
    attribution: 'City and County of San Francisco — DataSF Building Footprints (PDDL)',
  },
  boston: {
    metro: 'boston', region: 'massachusetts',
    label: 'BPDA — Boston Buildings with Roof Breaks, BLDG_HGT_2010 (ArcGIS FeatureServer/9)',
    kind: 'arcgis',
    layer: 'https://gis.bostonplans.org/hosting/rest/services/Boston_Buildings/FeatureServer/9',
    idField: 'OBJECTID',
    selectFields: ['OBJECTID', 'BLDG_HGT_2010', 'GRND_ELEV_2010', 'ROOF_ELEV_2010', 'IEL_TYPE'],
    typeField: 'IEL_TYPE',
    // BLDG · OUTBLDG · CONSTRUCT · the "Buidling" typo · null (403 newer rows carry no type but real heights).
    // Excluded: MOBILE, OVHD-WALKWAY, RUIN, FOUNDATION, Tank, "" and the numeric codes.
    includeTypes: ['BLDG', 'OUTBLDG', 'CONSTRUCT', 'Buidling', null],
    heightField: 'BLDG_HGT_2010', unit: 'ft',
    pageLimit: 2000, tileSpanDeg: 0.02,       // maxRecordCount 2000; ~7.6 s per 0.01° cell, so 4× the area per request
    minPlausibleM: 2.0, maxPlausibleM: 260,   // 200 Clarendon 240 m (788.19 ft in the data)
    heightSourceTag: 'boston-bpda-bldg_hgt_2010',
    measurement: 'BPDA 2010 photogrammetric 3D model, ROOF_ELEV_2010 − GRND_ELEV_2010 per roof-level PART (feet) — authority-measured, not LiDAR',
    licence: 'Open Data Commons PDDL (Analyze Boston package boston-buildings-with-roof-breaks — probed 2026-09-05)',
    attribution: 'Boston Planning & Development Agency — Boston Buildings with Roof Breaks (PDDL)',
  },
};

/** Each metro's stamp working set, so the §HEIGHT-STAMP-BUDGET preflight holds exactly the metro box
 *  and the rest of the state streams through. A footprint inside the bbox but outside the dataset's
 *  coverage (Jersey City in the newyork box, Cambridge in the boston box) matches nothing and keeps its
 *  OSM tags — never a fabricated height.
 *  ⚠ `region` MOVED 2026-09-06 (lane USA-ALL-STATES, §BAKE-US-STATES): the bake rows are whole STATES
 *  now, so sanfrancisco → `california` and boston → `massachusetts`; `newyork` kept its slug (the row
 *  widened from Manhattan to the whole state). THE BBOXES ARE UNCHANGED, BYTE FOR BYTE — this is the
 *  same working set hanging on a bigger row, which is exactly the `victoria`/Melbourne and
 *  `belgium`/Antwerp shape. They are therefore no longer "byte-identical to the bake row bbox"; that
 *  identity was the metro era's coincidence, not the contract. stampBboxesFor still filters on
 *  `c.region === r.name`, so a state stamps only its own city. */
export const US_OPEN_CITY_BBOXES = [
  // city             metro            region (bake.mjs row)   [w, s, e, n] (WGS84, osmium -b order)
  { city: 'newyork',      metro: 'newyork',      region: 'newyork',       bbox: [-74.03, 40.70, -73.91, 40.82] },
  { city: 'sanfrancisco', metro: 'sanfrancisco', region: 'california',    bbox: [-122.52, 37.70, -122.36, 37.83] },
  { city: 'boston',       metro: 'boston',       region: 'massachusetts', bbox: [-71.20, 42.22, -70.98, 42.40] },
];

/** The metros/channels ASSESSED on 2026-09-05 and found to serve NO measured height keylessly. Kept
 *  machine-readable so a future row must overwrite a PROBED verdict, not a blank. */
export const US_OPEN_HEIGHTS_ASSESSED = [
  { metro: 'chicago', region: 'illinois', status: 'no-height-attribute',
    evidence: 'data.cityofchicago.org syp8-uezg Building Footprints (HTTP 200, 820,606 rows, rowsUpdatedAt 2015-08-15): fields carry stories/no_stories/z_coord but NO height; Loop cell 251 rows, stories p50 10 · max 60, z_coord 0; hz9b-7eeu → 404 dataset.missing. `stories` → building:levels (derived-levels) is the owed follow-up, not a measured height' },
  { metro: 'massgis', region: 'massachusetts', status: 'no-height-attribute',
    evidence: 'gis-prod.digital.mass.gov/geoserver WFS massgis:GISDATA.STRUCTURES_POLY DescribeFeatureType (HTTP 200, 2,741 B): struct_id/source/sourcetype/sourcedate/sourcedata/moved/area_sq_ft/town_id*/local_id/archived*/edit_*/comments — no height; gis.massgis.digital.mass.gov NXDOMAIN (curl 6)' },
  { metro: 'boston-gisportal', region: 'massachusetts', status: 'no-queryable-service',
    evidence: 'gisportal.boston.gov Assessing/DOIT_buildings FeatureServer → HTTP 500 "Server object extension featureserver not found", MapServer/0 → 52 B; CityServices/OPEN_DATA/MapServer → 404' },
  { metro: 'austin', region: 'texas', status: 'not-probed', evidence: 'no open per-metro height channel named in the registry; stays overture_us (documented)' },
  { metro: 'houston', region: 'texas', status: 'not-probed', evidence: 'no open per-metro height channel named in the registry; stays overture_us (documented)' },
];

/** The metro whose working-set bbox contains (lon, lat), or null. */
export function usOpenMetroForPoint(lon, lat, cities = US_OPEN_CITY_BBOXES) {
  for (const c of cities) {
    const [w, s, e, n] = c.bbox;
    if (lon >= w && lon <= e && lat >= s && lat <= n) return US_OPEN_HEIGHTS[c.metro] ?? null;
  }
  return null;
}

const f6 = (v) => Number(v).toFixed(6);

/**
 * ONE page of the metro's footprints intersecting a WGS84 `[w,s,e,n]` box, padded by `padDeg` so a
 * building whose centroid sits just across the cell edge is still fetched for this cell's footprints.
 * ⚠ AXIS ORDER, two conventions in one file:
 *   • Socrata SoQL `within_box(geom, NW_lat, NW_lon, SE_lat, SE_lon)` = (n, w, s, e). Live-verified
 *     2026-09-05 on both portals (the Midtown / Financial District cells in the header).
 *   • ArcGIS `geometry=xmin,ymin,xmax,ymax` with `geometryType=esriGeometryEnvelope&inSR=4326` = (w, s, e, n).
 * Paging: Socrata `$order=:id&$limit&$offset`; ArcGIS `resultOffset&resultRecordCount` (server pages at
 * maxRecordCount 2000 and flags `exceededTransferLimit`).
 */
export function usOpenPageUrl(m, [w, s, e, n], { offset = 0, padDeg = 0 } = {}) {
  const p = Number.isFinite(padDeg) ? Math.max(0, padDeg) : 0;
  const W = w - p, S = s - p, E = e + p, N = n + p;
  if (m.kind === 'socrata') {
    const where = `within_box(${m.geomField},${f6(N)},${f6(W)},${f6(S)},${f6(E)})`;
    return `${m.dataset}?$select=${encodeURIComponent(m.selectFields.join(','))}` +
      `&$where=${encodeURIComponent(where)}&$order=${encodeURIComponent(':id')}&$limit=${m.pageLimit}&$offset=${offset}`;
  }
  if (m.kind === 'arcgis') {
    return `${m.layer}/query?f=geojson&where=${encodeURIComponent(m.where ?? '1=1')}` +
      `&geometry=${f6(W)},${f6(S)},${f6(E)},${f6(N)}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects` +
      `&outFields=${encodeURIComponent(m.selectFields.join(','))}&outSR=4326&returnZ=false&geometryPrecision=7` +
      `&resultRecordCount=${m.pageLimit}&resultOffset=${offset}`;
  }
  throw new Error(`usOpenPageUrl: unknown adapter kind "${m.kind}"`);
}

/**
 * A page body → `{ features, more }` in ONE shape for both portals, or **null** for anything that is
 * not a page (a Socrata error object `{message, errorCode}`, an ArcGIS `{error:{code,…}}`, an HTML
 * page, an empty body). null is UNKNOWN — the caller counts it as a page ERROR and never as "no
 * buildings here"; a genuine empty page is `{features: [], more: false}` (a real EMPTY).
 *   • Socrata: a JSON ARRAY of rows; `more` = the page is full (the caller asks for the next offset).
 *   • ArcGIS: a GeoJSON FeatureCollection; `more` = `exceededTransferLimit === true` (the server's flag).
 * Failure and empty are different values (§CONTEXT-DATA-HONESTY).
 */
export function parseUsOpenPage(text, m) {
  if (typeof text !== 'string' || text.length === 0) return null;
  let j;
  try { j = JSON.parse(text); } catch { return null; }
  if (m.kind === 'socrata') {
    if (!Array.isArray(j)) return null;
    const features = [];
    for (const row of j) {
      if (!row || typeof row !== 'object') continue;
      const geometry = row[m.geomField] ?? null;
      const properties = { ...row };
      delete properties[m.geomField];
      features.push({ type: 'Feature', geometry, properties });
    }
    return { features, more: j.length >= m.pageLimit };
  }
  if (m.kind === 'arcgis') {
    if (!j || j.type !== 'FeatureCollection' || !Array.isArray(j.features)) return null;
    return { features: j.features, more: j.exceededTransferLimit === true };
  }
  return null;
}

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : null;
};

/** Is this record a building under the metro's `includeTypes` rule? (No rule → every record.) */
export function usOpenIsBuilding(props, m) {
  if (!m.typeField || !Array.isArray(m.includeTypes)) return true;
  const raw = props?.[m.typeField];
  const t = raw === null || raw === undefined ? null : String(raw);
  return m.includeTypes.includes(t);
}

/**
 * One record's attributes → `{ height, rule }` in METRES above ground, or **null** when no honest
 * height exists. THE RULE: `height = Number(props[heightField]) × unit` with
 *   • null / '' / non-numeric → null   (Socrata serves numbers as TEXT — cast, never trust the type)
 *   • ≤ 0                     → null   (NYC: "zero or NULL mean … not available"; Boston: 23,487 such rows)
 *   • outside [min, max]      → null   (a 0.05 m "building" is a slab; 1,000 m is a unit error)
 * `rule` names the field AND the unit so a probe can tell ft from cm from m at a glance.
 */
export function usOpenHeightM(props, m) {
  const raw = num(props?.[m.heightField]);
  if (raw === null || raw <= 0) return null;
  const k = m.unit === 'ft' ? FT_TO_M : m.unit === 'cm' ? 0.01 : m.unit === 'm' ? 1 : null;
  if (k === null) return null;
  const height = raw * k;
  if (!Number.isFinite(height) || height < m.minPlausibleM || height > m.maxPlausibleM) return null;
  return { height: Number(height.toFixed(1)), rule: `${m.heightField}×${m.unit}→m` };
}

/** Exterior ring of a Polygon, or of the LARGEST sub-polygon of a MultiPolygon (shoelace), or null. */
function exteriorRing(geometry) {
  if (!geometry) return null;
  if (geometry.type === 'Polygon') {
    const r = geometry.coordinates?.[0];
    return Array.isArray(r) && r.length >= 4 ? r : null;
  }
  if (geometry.type === 'MultiPolygon') {
    let best = null, bestA = -Infinity;
    for (const poly of geometry.coordinates ?? []) {
      const r = poly?.[0];
      if (!Array.isArray(r) || r.length < 4) continue;
      let a = 0;
      for (let i = 0, k = r.length - 1; i < r.length; k = i++) a += r[k][0] * r[i][1] - r[i][0] * r[k][1];
      a = Math.abs(a) / 2;
      if (a > bestA) { bestA = a; best = r; }
    }
    return best;
  }
  return null;
}

/**
 * A parsed page → the join's building COMPONENTS: `{ id, ring, cx, cy, h, rule }` per included record
 * with an honest height and a usable ring (centroid = ring vertex mean, WGS84 lon,lat). Records that
 * fail the type rule, carry no honest height, or have no ring are counted in `skipped` (by reason) and
 * dropped — never given a neighbour's number. Numeric coordinates are checked: a NaN vertex drops the record.
 */
export function usOpenComponents(page, m) {
  const out = [];
  const skipped = { notBuilding: 0, noHeight: 0, noGeometry: 0 };
  for (const f of page?.features ?? []) {
    const p = f?.properties ?? {};
    if (!usOpenIsBuilding(p, m)) { skipped.notBuilding++; continue; }
    const hh = usOpenHeightM(p, m);
    if (!hh) { skipped.noHeight++; continue; }
    const ring = exteriorRing(f.geometry);
    if (!ring) { skipped.noGeometry++; continue; }
    let cx = 0, cy = 0, ok = true;
    for (const v of ring) {
      if (!Array.isArray(v) || !Number.isFinite(v[0]) || !Number.isFinite(v[1])) { ok = false; break; }
      cx += v[0]; cy += v[1];
    }
    if (!ok) { skipped.noGeometry++; continue; }
    cx /= ring.length; cy /= ring.length;
    out.push({ id: p[m.idField] === undefined || p[m.idField] === null ? null : String(p[m.idField]), ring, cx, cy, h: hh.height, rule: hh.rule });
  }
  return { components: out, skipped };
}

/** Ray-cast point-in-ring (ring = [[x,y],…], closed or not). Boundary points count as inside. */
export function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, k = ring.length - 1; i < ring.length; k = i++) {
    const [xi, yi] = ring[i], [xk, yk] = ring[k];
    if ((yi > y) !== (yk > y)) {
      const xAt = ((xk - xi) * (y - yi)) / (yk - yi) + xi;
      if (x === xAt) return true;
      if (x < xAt) inside = !inside;
    }
  }
  return inside;
}

/** Inside the exterior ring and outside every hole. */
function pointInFootprint(x, y, ext, interiors) {
  if (!pointInRing(x, y, ext)) return false;
  for (const h of interiors ?? []) if (pointInRing(x, y, h)) return false;
  return true;
}

/**
 * The measured height for ONE OSM footprint (`ext` ring + `interiors`, centroid `clon,clat`) from the
 * metro's components, or **null** when nothing matches.
 *   1. 'centroid-in'       — components whose centroid lies inside the footprint; the TALLEST wins. One
 *                            OSM footprint over a Boston roof-break stack (tower + podium parts) gets the
 *                            tower; a footprint covering only the podium gets only the podium's part.
 *   2. 'contains-centroid' — no component centroid inside (the OSM footprint is smaller than the source
 *                            footprint, or a courtyard block): the tallest component whose ring contains
 *                            the OSM centroid.
 * Never a neighbour's height, never a default: no match → null → the footprint keeps its OSM tags.
 */
export function usOpenHeightForFootprint(ext, interiors, clon, clat, components) {
  const inside = components.filter((c) => pointInFootprint(c.cx, c.cy, ext, interiors));
  if (inside.length) {
    const best = inside.reduce((a, b) => (b.h > a.h ? b : a));
    return { height: best.h, matched: inside.length, rule: `centroid-in · max(${best.rule})`, id: best.id };
  }
  const containing = components.filter((c) => pointInRing(clon, clat, c.ring));
  if (containing.length) {
    const best = containing.reduce((a, b) => (b.h > a.h ? b : a));
    return { height: best.h, matched: containing.length, rule: `contains-centroid · max(${best.rule})`, id: best.id };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// §USAS-NATIONAL-HEIGHTS (2026-09-06, lane USA-HEIGHTS-NATIONAL) — the WHOLE-COUNTRY half of the US
// measured-height join. Everything above this line is the three per-CITY channels; everything below is
// the one NATIONAL channel that serves the other ~99.9 % of the country.
//
// ── THE DEFECT THIS EXISTS TO REMOVE ───────────────────────────────────────────────────────────────
// Identical in shape to §MDS-NATIONAL-SWEEP (L-12946), one country over. Until today the ONLY ground in
// the United States that could EVER receive a measured height was three city bboxes — newyork
// (Manhattan + the boroughs), sanfrancisco and boston, 0.036 deg² of a 9.8 M km² country. A footprint
// outside all three streams through the join with its ORIGINAL OSM tags and renders as `assumed` 9 m,
// which is the SAME VALUE the client produces when the source genuinely has no data (L-422 / L-457 /
// L-467 / L-469). Ciudad Real was Spain's version of this; Wichita, Oak Park and Anchorage are the
// United States' version, and no number of re-bakes could ever have filled it. Founder, 2026-09-06:
// "Also all EEUU — I want complete country coverage."
//
// ── (a) USGS 3DEP — DSM MINUS DTM IS NOT AVAILABLE IN THE UNITED STATES. Stated plainly, because it is
//    the recipe every other country here uses (CH / AT / CZ / BE / NO / GB / AE all subtract two
//    rasters) and it does NOT transfer. Probed 2026-09-06, exact answers:
//      • https://elevation.nationalmap.gov/arcgis/rest/services?f=json
//        → HTTP 200, 106 B, application/json. VERBATIM, the entire body:
//          {"currentVersion":11.3,"folders":["Utilities"],"services":[{"name":"3DEPElevation","type":"ImageServer"}]}
//        ONE service on the whole server. There is no second, first-return sibling to reach.
//      • .../3DEPElevation/ImageServer?f=json → HTTP 200, 11,120 B, 0.66 s. serviceDescription, verbatim:
//        "The USGS 3D Elevation Program (3DEP) **Bare Earth DEM** Dynamic service is based on
//        multi-resolution USGS DEM sources … Data available in this map service reflects all 3DEP DEM
//        data published as of August 24, 2026." pixelType F32, bandCount 1, maxImageHeight/Width 8000,
//        SR 3857, capabilities "Image,Metadata,Catalog".
//      • THE DECIDING MEASUREMENT — identify at the Empire State Building (-73.9857, 40.7484):
//        → HTTP 200, 11,773 B, 1.38 s, `"value":"15.09"`. Fifteen metres. The building is 443 m to the
//        spire and 381 m to the roof. The service returns the GROUND under it. It is a DTM, and no
//        amount of sampling it will produce a building height.
//      • https://tnmaccess.nationalmap.gov/api/v1/datasets → HTTP 200, 42,707 B, 1.01 s. The complete
//        elevation catalogue is: NED 1"/⅓"/1/9", DEM 1 meter, Seamless 1-m DEM (S1M), NED Alaska 2",
//        Alaska IFSAR 5 meter DEM, OPR DEM, **Ifsar Digital Surface Model (DSM)**, Ifsar ORI, Lidar
//        Point Cloud (LPC), Topobathymetric Lidar DEM/LPC. Every raster but ONE is bare earth.
//      • That one: `datasets=Ifsar Digital Surface Model (DSM)` + `bbox=-97.40,37.60,-97.20,37.80`
//        (Wichita, CONUS) → HTTP 200, `{"total": 0, "items": []}`. The SAME query at
//        `bbox=-148.0,64.7,-147.5,65.0` (Fairbanks) → HTTP 200, `"total": 4`, first item "USGS NED
//        Digital Surface Model AK IFSAR-Cell3 2010 TIFF 2015". ⇒ the only public USGS DSM is ALASKA
//        IFSAR at 5 m, 2010. There is NO CONUS DSM and therefore NO national nDSM to compute.
//      • The Lidar Point Cloud IS national, and a DSM could be DERIVED from it — that is a PDAL/EPT
//        pipeline over tens of terabytes of LAZ, not a per-cell HTTP read, and it is NOT built here.
//        Recorded as the owed follow-up, not as a refusal of the data's existence.
//
// ── (b) OVERTURE — REACHABLE, BUT ITS US HEIGHTS ARE AN ESTIMATE, AND IT IS NOT WIRED HERE.
//      • `s3://overturemaps-us-west-2/release/` listing → HTTP 200; releases 2026-07-22.0 and
//        2026-08-19.0 (bake.mjs pins 2026-07-22.0). DESCRIBE over the buildings theme → 4.3 s, and the
//        schema carries `height DOUBLE`, `min_height`, `roof_height`, `num_floors`, and a `sources`
//        STRUCT(property, dataset, license, record_id, update_time, confidence) — so provenance IS
//        machine-readable per attribute.
//      • Wichita core (-97.40, 37.65, -97.25, 37.75), duckdb over the pinned release, 138.4 s:
//        **79,096 buildings · 69,889 carry `height` (88.4 %) · 99 carry `num_floors` · height p50 4.14 m
//        · max 34.73 m.**
//      • Microsoft GlobalMLBuildingFootprints, the release Overture folds for the US: dataset-links.csv
//        → HTTP 200, 7,171,802 B, 2,415 US tiles, release 2026-02-03. The four LARGEST US quadkey tiles
//        (023012311 170.3 MB · 023013200 158.3 MB · 023131022 138.4 MB · 023102202 126.3 MB), first
//        600 kB of each, HTTP 206: **21,419 features → 19,809 with a real height (92.5 %), 1,610 at the
//        `-1.0` sentinel; p50 4.0 m, max 34.6 m.**
//      • ⭐ THE TWO DISTRIBUTIONS ARE THE SAME ONE. Overture Wichita p50 4.14 / max 34.73 against
//        Microsoft p50 4.0 / max 34.6, over two independent samples. Wichita's tallest building (Epic
//        Center, 98 m) is absent from BOTH. A height layer whose maximum over 79,096 urban buildings is
//        34.7 m is a MODELLED height that saturates, not a measurement — and Overture does not stamp a
//        per-feature "this one is modelled" flag, only the source dataset name.
//      • ⛔ THEREFORE NOT WIRED. Under §CONTEXT-DATA-HONESTY and the brief's item 3, a modelled height
//        may never be written under the measured marker. If it is ever wired it must arrive under its
//        OWN tag and its OWN counter, never folded into `measuredCount`. The per-`dataset` provenance
//        breakdown (`UNNEST(sources) WHERE property='/properties/height'`) was ISSUED and had not
//        returned when this lane closed — so the DATASET NAME behind Overture's US heights is
//        UNMEASURED here and is not asserted. The distribution match is evidence; it is not the name.
//
// ── (c) MICROSOFT — see (b): reachable, an estimate, and the WRONG DELIVERY SHAPE besides. It is
//    gzipped GeoJSONL sharded by level-9 quadkey at up to 170 MB a tile with NO bbox query, so a 0.02°
//    cell costs a whole-tile download. Not wired.
//
// ── (d) STATE / CITY PROGRAMMES — probed, and the honest verdict is that the ones checked do not beat
//    the national layer. UTAH (UGRC "Utah Buildings", services1.arcgis.com/99lidPhWCzftIe9K/…/Buildings
//    /FeatureServer/0 → HTTP 200) is statewide and keyless, and its FIELD LIST is verbatim: OBJECTID
//    NAME TYPE ADDRESS CITY ZIP5 COUNTY FIPS PARCEL_ID SRC_YEAR Shape__Area Shape__Length — **no height
//    field**, and its own copyrightText says the geometry is "created and licensed by Microsoft under
//    the Open Data Commons Open Database License (ODbL)". WA DNR lidarportal.dnr.wa.gov answered HTTP
//    200 (1,319 B) and data.seattle.gov / opendata.dc.gov answered HTTP 200 — all three are LIVE doors
//    that were NOT opened far enough to name a height channel behind them, and that is recorded as
//    UNPROBED (UNKNOWN), never as empty. NC / OH / PA / TX-TNRIS and the Denver / Philadelphia city
//    models were NOT probed at all. They are named in US_NATIONAL_ASSESSED so a future row must
//    overwrite a stated verdict rather than a blank.
//
// ── WHAT IS WIRED: FEMA / ORNL / NGA "USA Structures" ──────────────────────────────────────────────
// ONE keyless CC-BY-4.0 ArcGIS FeatureServer covering the whole country and its territories, with a
// per-building HEIGHT in metres. Live-probed 2026-09-06, every number a measurement:
//   • Service root .../USA_Structures_View/FeatureServer?f=json → HTTP 200, 2,913 B, 0.15 s. ONE layer,
//     id 0, name "USA_Structures_B". maxRecordCount 2000, capabilities "Query",
//     advancedQueryCapabilities.supportsPagination TRUE.
//   • Layer 0 ?f=json → HTTP 200, 22,587 B. Polygon, extent in 3857 spanning -19,667,378 → 19,386,343 X
//     (Guam and the Marianas to the USVI). Fields include: BUILD_ID · OCC_CLS · PRIM_OCC · OUTBLDG ·
//     **HEIGHT esriFieldTypeSingle, alias "Height (meters)"** · SQMETERS · H_ADJ_ELEV · L_ADJ_ELEV ·
//     PROD_DATE · SOURCE · VAL_METHOD · IMAGE_DATE · UUID · STATE_FIPS.
//   • `where=1=1&returnCountOnly=true` → HTTP 200, 19 B, 0.72 s, **{"count":135321228}**.
//   • ⭐ PROVENANCE, from the layer's OWN FGDC metadata (.../FeatureServer/0/metadata → HTTP 200,
//     29,975 B, application/xml), VERBATIM:
//       HEIGHT      attrdef  "This is a measure of the height (in meters) of the structure as determined
//                            from LiDAR or other source data."
//                   attrdefs "LiDAR-derived footprints where available provided by NGA"
//       H_ADJ_ELEV  attrdefs "NONE. NOT CURRENTLY POPULATED"   ← and the probes agree: both elevation
//       L_ADJ_ELEV  attrdefs "NONE. NOT CURRENTLY POPULATED"      columns came back null everywhere.
//       SOURCE      attrdef  "This is the name of the contractor or the government agency that created
//                            the feature."
//     So it is AUTHORITY-MEASURED, LiDAR **where available** — it is NOT "measured-lidar" for every row,
//     and this module never says it is. The wording "or other source data" is why `measurement` below
//     quotes the metadata instead of paraphrasing it.
//   • ⭐ THE EXACT RULE THAT MAKES THIS SAFE — **a HEIGHT implies SOURCE='NGA'; the ORNL half NEVER
//     carries one.** Measured by groupBy over twenty-eight whole-state / territory bboxes (count on
//     OBJECTID vs count on HEIGHT): the ORNL group's height-count is EXACTLY ZERO in every single one.
//     So a footprint that meets only ORNL rows gets NOTHING — never a neighbour's number, never a
//     modelled one. The join does not need to trust a flag; the absence IS the flag.
//     ⚠ CORRECTED BEFORE IT SHIPPED — this bullet first read "if and only if", on twelve states where
//     the NGA group's height-count EQUALLED its row-count exactly. **NEW MEXICO refutes the converse:**
//     NGA (442,010 rows, 279,062 with height) — 162,948 NGA rows carry NO height. The forward direction
//     (a height ⇒ NGA) is the one the join relies on and it holds everywhere measured; the converse was
//     a confident generalisation from a clean dozen, which is exactly the shape of
//     §CONFIDENT-REGISTER-ROWS-ARE-THE-WRONG-ONES. Do not restore the stronger wording.
//   • ⭐ PER-STATE COVERAGE (whole-state bboxes, groupBy SOURCE, 2026-09-06 — this is the number that
//     tells the truth about "national"):
//       california     12,085,372 rows ·  5,557,111 with height (46.0 %) · max 209.50 m ·  38.6 s
//       colorado        2,233,208 rows ·    898,019 with height (40.2 %) · max 169.07 m ·   8.3 s
//       arizona         2,732,271 rows ·    994,478 with height (36.4 %) · max 106.11 m ·  38.3 s
//       massachusetts   3,602,781 rows ·  1,064,644 with height (29.6 %) · max 144.33 m ·  12.3 s
//       newyork         9,893,458 rows ·  2,641,494 with height (26.7 %) · max 219.73 m ·  42.2 s
//       ohio            6,515,740 rows ·  1,558,454 with height (23.9 %) · max 123.87 m ·  21.7 s
//       illinois        7,326,121 rows ·  1,648,277 with height (22.5 %) · max 283.86 m ·  32.1 s
//       kansas          1,742,826 rows ·    318,768 with height (18.3 %) · max  76.53 m ·   4.5 s
//       washington      3,104,310 rows ·    525,261 with height (16.9 %) · max 188.63 m ·  12.5 s
//       georgia         6,368,497 rows ·    922,560 with height (14.5 %) · max 189.77 m ·  53.2 s
//       northcarolina   8,774,039 rows ·    874,513 with height (10.0 %) · max 147.20 m ·  45.7 s
//       montana           863,675 rows ·     28,247 with height ( 3.3 %) · max  45.93 m ·   4.0 s
//     ⚠ texas · florida · pennsylvania are UNMEASURED, not zero: all three returned, after 55.7 s,
//     HTTP 200 carrying `{"error":{"code":400,"message":"","details":["Unable to perform query. Please
//     check your parameters."]}}` — a server-side timeout wearing a 400. The SAME body came back for the
//     ungeometried national groupBy and for the national max/min/avg. So there is NO measured national
//     percentage in this header, and none is asserted; the twelve states above are what was reached.
//   • ⭐ COVERAGE IS URBAN-BIASED, WHICH IS THE HALF THAT MATTERS — 0.01° cells, HTTP 200 throughout:
//       Chicago Loop      156 rows · 149 with height (96 %) · p50 47.6 · max 177.8 m · 0.72 s
//       SF FiDi           168 · 161 (96 %) · p50 36.7 · max 209.5 m
//       Boston Back Bay   119 · 115 (97 %) · p50 17.8 · max 139.2 m
//       Midtown Manhattan 139 · 101 (73 %) · p50 44.0 · max 170.5 m
//       Austin downtown   195 · 184 (94 %) · p50 10.9 · max  72.9 m
//       Houston downtown  102 ·  75 (74 %) · p50 27.1 · max 248.1 m
//       Oak Park IL       810 · 760 (94 %) · p50  7.5 · max  37.2 m   ← a CI gate row
//       Evanston IL       951 · 893 (94 %) · p50  6.3 · max  19.8 m
//       Pasadena TX       698 · 653 (94 %) · p50  3.5 · max  22.5 m   ← a CI gate row
//       Jersey City NJ    331 · 306 (92 %) · p50  9.2 · max  37.0 m   ← inside the `newyork` clip, which
//                                                                       NYC's own dataset cannot serve
//       Cambridge MA    1,264 · 1,244 (98 %) · p50 9.1 · max 29.0 m   ← same, for the `boston` clip
//       Wichita KS        159 · 151 (95 %) · p50  7.8 · max  34.1 m
//       Bismarck ND       305 · 295 (97 %) · p50  5.4 · max  22.3 m
//       Anchorage AK      181 · 171 (94 %) · p50  5.7 · max  36.1 m
//       Honolulu HI       237 · 215 (91 %) · p50  9.5 · max 103.7 m
//       San Juan PR        96 ·  64 (67 %) · p50  8.9 · max  30.6 m
//     ⛔ AND THE HOLES, named rather than omitted — these answered HTTP 200 with rows and **ZERO**
//     heights (ORNL only): **Pflugerville TX 482/0 · Austin-north 106/0 · Houston-west 267/0 ·
//     Missoula MT 240/0 · Fairbanks AK 255/0 · Hilo HI 232/0.** Texas outside its downtowns, Montana,
//     interior Alaska and Hawai'i island are a SOURCE gap, not a working-set gap. They keep their honest
//     OSM tags and MUST NOT be used as gate rows.
//   • ⚠ IT UNDER-READS TALL TOWERS, AND THE CITY CHANNELS STAY IN FRONT BECAUSE OF IT. Same Midtown
//     cell: NYC's own height_roof reaches 270.6 m (887.7 ft, the module header above), USA Structures
//     reaches 170.5 m. Illinois' statewide max is 283.86 m where the Willis Tower is 442 m. That is why
//     `usOpenChannelForPoint` resolves the CITY adapter FIRST and only falls back to this one — the
//     national layer fills the country, it does not replace a city's own survey.
//   • Licence CC BY 4.0 (arcgis.com item 0ec8512ad21e4bb987d7e848d14e7e24, licenseInfo → "This work is
//     licensed under a Creative Commons by Attribution (CC BY 4.0) license"), accessInformation "Oak
//     Ridge National Laboratory (ORNL); Federal Emergency Management Agency (FEMA) Geospatial Response
//     Office", data currency 2025-06-06.
//   • ⭐ THE GATE PROOF — EVERY WIRED ROW WAS PROVED NON-ZERO BEFORE IT WAS WIRED. bake.mjs
//     assertMeasuredHeights EXITS 4 on a region that declares a height join and stamps ZERO, so "wire all
//     the states and see" is not an option: one measured-zero row would take the whole US bake down. So
//     `where=HEIGHT IS NOT NULL&returnCountOnly=true` was run over EACH row's OWN bake bbox, 4 at a time,
//     2026-09-06. **49 of 49 answered HTTP 200 with a NON-ZERO count; 0 errors, 0 timeouts, 0 zeros.**
//     35,722,898 height-bearing structures in total. Verbatim, per row:
//       alabama 418,079 · alaska 67,341 · arizona 994,479 · arkansas 231,685 · colorado 898,019 ·
//       connecticut 480,800 · delaware 176,699 · districtofcolumbia 180,671 · florida 2,352,630 ·
//       georgia 936,602 · hawaii 160,105 · idaho 191,226 · illinois 1,641,197 · indiana 1,013,773 ·
//       iowa 443,086 · kansas 331,484 · kentucky 461,806 · louisiana 662,574 · maine 32,924 ·
//       maryland 1,381,705 · michigan 2,567,964 · minnesota 739,982 · mississippi 231,065 ·
//       missouri 1,051,274 · montana 28,247 · nebraska 356,819 · nevada 1,032,627 · newhampshire 35,836 ·
//       newjersey 2,141,694 · newmexico 279,062 · northcarolina 1,152,314 · northdakota 34,633 ·
//       ohio 1,744,848 · oklahoma 575,634 · oregon 358,940 · pennsylvania 1,828,525 · puertoricousa 234,162 ·
//       rhodeisland 210,917 · southcarolina 469,704 · southdakota 7,379 · tennessee 350,419 ·
//       texas 3,530,320 · utah 211,814 · vermont 29,617 · virginia 1,963,015 · washington 541,462 ·
//       westvirginia 443,812 · wisconsin 479,781 · wyoming 34,147
//     SMALLEST southdakota 7,379 · LARGEST texas 3,530,320. ⭐ This ALSO supersedes the "texas / florida /
//     pennsylvania are UNMEASURED" line above for the NUMERATOR: the whole-state groupBy (which is what
//     times out) gives the PERCENTAGE, and the count-only query gives the COUNT, and only the first of
//     those is still missing for those five. Do not read the timeout as "no data in Texas" — Texas is the
//     single largest wired row in the country.
//   • ⭐ THE WORKING SET IS THE COUNTRY, NOT A CITY LIST. `US_NATIONAL_BBOXES` is four boxes — CONUS,
//     Alaska, Hawai'i, Puerto Rico + USVI — chosen so that no inhabited US ground is outside the join's
//     reach. This is the whole point of the lane: Spain's nine-city retain set is what put Ciudad Real
//     on the 9 m carpet (§MDS-NATIONAL-SWEEP, L-12946), and a US "six metros" retain set is the same
//     defect with a bigger denominator.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The ONE national adapter. Shape-identical to the per-city rows above so `usOpenPageUrl` /
 * `parseUsOpenPage` / `usOpenComponents` / `usOpenHeightForFootprint` serve it unchanged — the whole
 * reason this lives in `usOpenHeights.mjs` and is not a rival module.
 *
 * `where` pushes `HEIGHT IS NOT NULL` SERVER-SIDE. That is not an optimisation dressed as a rule: the
 * ONLY rows this join can use are the height-bearing ones, and the ORNL rows are 55–90 % of the layer
 * outside the cities (kansas 1,424,058 of 1,742,826). Filtering there instead of here cuts the bytes
 * and the page count by the same factor, and it cannot hide anything — a cell whose every row is ORNL
 * comes back as an honest EMPTY page, which the stamp already counts as `voidTiles`, never as an error.
 */
export const US_NATIONAL_HEIGHTS = {
  usas: {
    metro: 'usas', region: null,
    label: 'FEMA / ORNL "USA Structures" — HEIGHT (metres), the NGA LiDAR-derived subset (ArcGIS FeatureServer/0)',
    kind: 'arcgis',
    layer: 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/USA_Structures_View/FeatureServer/0',
    idField: 'BUILD_ID',
    selectFields: ['BUILD_ID', 'HEIGHT', 'SOURCE', 'VAL_METHOD', 'OCC_CLS'],
    where: 'HEIGHT IS NOT NULL',
    // No type rule: OUTBLDG came back null on every probed row, and OCC_CLS is an occupancy class, not
    // a "is this a building" flag. The HEIGHT rule below does the filtering, and it is exact.
    typeField: null, includeTypes: null,
    heightField: 'HEIGHT', unit: 'm',
    pageLimit: 2000, tileSpanDeg: 0.02,       // maxRecordCount 2000; an LA 0.02° cell is 565 rows / 346 kB / 1.03 s
    minPlausibleM: 2.0, maxPlausibleM: 550,   // the layer's own measured max is 283.86 m (illinois); 550 admits anything real
    heightSourceTag: 'usas-fema-ornl-nga-height',
    measurement:
      'FEMA/ORNL USA Structures HEIGHT — the layer\'s own FGDC metadata, verbatim: "This is a measure of the height ' +
      '(in meters) of the structure as determined from LiDAR or other source data", source "LiDAR-derived footprints ' +
      'where available provided by NGA". Authority-measured, LiDAR WHERE AVAILABLE — not lidar for every row, and never ' +
      'a modelled/estimated height (Overture and Microsoft US heights are estimates and are NOT wired; see the header). ' +
      'HEIGHT is non-null iff SOURCE=\'NGA\', measured across twelve whole-state bboxes — an unmeasured footprint gets nothing.',
    licence: 'CC BY 4.0 (arcgis.com item 0ec8512ad21e4bb987d7e848d14e7e24 licenseInfo — probed 2026-09-06)',
    attribution: 'Oak Ridge National Laboratory (ORNL); Federal Emergency Management Agency (FEMA) Geospatial Response Office — USA Structures (CC BY 4.0)',
  },
};

/**
 * §USAS-NATIONAL-BBOX — the retain set is the WHOLE COUNTRY, not a city list.
 *
 * Four boxes rather than one because a single hull around CONUS + Alaska + Hawai'i + Puerto Rico would
 * be almost entirely ocean, and the retain test is a point-in-box: every wasted degree is footprints
 * held in heap for nothing. What is NOT in here — the western Aleutians and the US Virgin Islands —
 * is out on a MEASUREMENT, and both are named with their exact HTTP answer in
 * `US_NATIONAL_NO_HEIGHT_ROWS` immediately below.
 *
 * ⚠ A RECTANGLE IS NOT A COUNTRY, and this is stated because a reader WILL assume otherwise. No box
 * containing the lower 48 can exclude southern Ontario/Québec or northern Baja: `usNationalCovers`
 * answers TRUE for Toronto, Windsor and Tijuana, and `usOpenChannelForPoint` therefore hands them the
 * national adapter. Measured 2026-09-06, `where=1=1&returnCountOnly=true`, HTTP 200 each, which is why
 * that is harmless rather than merely unlikely:
 *   • Toronto  [-79.40, 43.63, -79.36, 43.67] → {"count":0}  — the layer holds NOTHING there
 *   • Tijuana  [-117.05, 32.51, -117.01, 32.54] → {"count":0} — likewise
 *   • Windsor  [-83.05, 42.30, -83.01, 42.33] → {"count":30}, of which **27 carry a HEIGHT**
 * So the SOURCE is the first guard and the bake row's own clip is the second (the `ontario`, `quebec`
 * and `mexico` rows declare no 'usas' join, and a US state row's footprints come from that state's own
 * Geofabrik extract). ⛔ Windsor is the ONE place measured where a Canadian footprint could take a US
 * federal height if it ever entered a US clip. Named, not smoothed over; pinned in usasNational.spec.ts.
 */
export const US_NATIONAL_BBOXES = [
  // name             [w, s, e, n] (WGS84, osmium -b order) — each CONTAINS every §BAKE-US-STATES row it is
  // responsible for, so no baked US ground sits outside the join's reach (§MDS-BBOX-MUST-COVER-THE-REGION).
  { city: 'conus',         region: 'usa', bbox: [-126.80, 24.15, -66.85, 49.45] },  // ⊇ washington -126.75 · florida 24.20 · maine -66.87 · minnesota 49.41
  { city: 'alaska',        region: 'usa', bbox: [-180.00, 49.75, -129.75, 73.00] },  // ⊇ the `alaska` row -180.00,49.80,-129.79,72.99
  { city: 'hawaii',        region: 'usa', bbox: [-179.65, 15.90, -142.60, 29.05] },  // ⊇ the `hawaii` row -179.60,15.92,-142.65,29.03 (Midway + the whole NW chain)
  { city: 'puertoricousa', region: 'usa', bbox: [-68.35, 17.48, -65.06, 18.85] },  // ⊇ the `puertoricousa` row -68.32,17.51,-65.09,18.82
];

/**
 * ⛔ THE TWO US ROWS DELIBERATELY **OUTSIDE** THE WORKING SET, on a MEASUREMENT rather than an
 * oversight — and neither may declare `heightJoin:'usas'`, because §MEASURED-HEIGHT-GATE exits 4 on a
 * region that declares a join and stamps ZERO (bake.mjs assertMeasuredHeights):
 *   • `alaskaaleutians` [171.76, 51.11, 180.00, 54.20] — the Near Islands. groupBy SOURCE over that
 *     exact box, 2026-09-06: HTTP 200, 1,056 B, 0.6 s → **87 structures, ALL 'ORNL', 0 with a height.**
 *     (A WGS84 box also cannot cross ±180°, so it could never have ridden the `alaska` box.)
 *   • `usvirginislands` [-65.18, 17.28, -63.95, 18.49] — groupBy over that exact box: HTTP 200, 1,059 B,
 *     0.6 s → **40,726 structures, ALL 'ORNL', 0 with a height.** USA Structures covers the USVI with
 *     footprints and measures none of them. Puerto Rico, 30 km west, is 234,162 of 1,194,236 (19.6 %).
 * Both are SOURCE gaps, named so a future lane must overwrite a probed verdict rather than a blank.
 */
export const US_NATIONAL_NO_HEIGHT_ROWS = ['alaskaaleutians', 'usvirginislands'];

/** Is (lon, lat) inside the national working set? */
export function usNationalCovers(lon, lat, boxes = US_NATIONAL_BBOXES) {
  for (const b of boxes) {
    const [w, s, e, n] = b.bbox;
    if (lon >= w && lon <= e && lat >= s && lat <= n) return true;
  }
  return false;
}

/**
 * ⭐ THE CHANNEL RESOLVER — CITY FIRST, NATION SECOND, NOTHING THIRD.
 *
 * A point inside one of the three city working sets is served by that city's OWN authority survey;
 * everywhere else in the country is served by USA Structures. The order is not a preference, it is a
 * MEASUREMENT: in the same Midtown cell NYC's height_roof reaches 270.6 m and USA Structures reaches
 * 170.5 m, so resolving national-first would REPLACE a better number with a worse one across the three
 * cities that already work. Outside the country → null, and the footprint keeps its OSM tags.
 */
export function usOpenChannelForPoint(lon, lat, cities = US_OPEN_CITY_BBOXES, boxes = US_NATIONAL_BBOXES) {
  const city = usOpenMetroForPoint(lon, lat, cities);
  if (city) return city;
  return usNationalCovers(lon, lat, boxes) ? US_NATIONAL_HEIGHTS.usas : null;
}

// ── §USAS-NATIONAL-SWEEP — the ordered, resumable, loudly-truncating country sweep ─────────────────
// Mirrored from heights/mdsNational.mjs (§MDS-NATIONAL-TILING, L-12946) on purpose: same shape, same
// honesty, different measured constants. What is NOT mirrored is that lane's bounded-heap SWATHE pass —
// see §USAS-SWATHE-IS-OWED at the bottom of this block.

/** The national cell. 0.02° BY MEASUREMENT, not by taste: maxRecordCount is 2000 and a 0.02° cell in
 *  the densest US ground probed (central Los Angeles) is 565 rows / 345,933 B / 1.03 s — one page. At
 *  0.04° Wichita alone is 8,002 rows (5 pages) and at 0.10° central LA is 76,250 (39 pages), so a
 *  bigger tile buys nothing on populated ground and costs paging. */
export const USAS_TILE_DEG = 0.02;

/** Courtesy concurrency against a public keyless federal service. Cells are still issued in ORDERED
 *  BATCHES so "the first cell of the first incomplete batch" remains an EXACT resume cursor. */
export const USAS_SWEEP_CONCURRENCY = 4;

const USAS_M_PER_DEG_LAT = 111_320;
const usasMPerDegLon = (lat) => 111_320 * Math.cos((lat * Math.PI) / 180);

/**
 * The tile grid for a region bbox. `ordOf` is the deterministic sweep-order key (row-major,
 * SOUTH→NORTH then WEST→EAST) the resume cursor is expressed in.
 * @param {[number,number,number,number]} bbox [w,s,e,n] WGS84
 */
export function usasTileGrid(bbox, { deg = USAS_TILE_DEG } = {}) {
  const [w, s, e, n] = bbox;
  const nx = Math.max(1, Math.ceil((e - w) / deg));
  const ny = Math.max(1, Math.ceil((n - s) / deg));
  return {
    w, s, e, n, nx, ny, deg,
    cellIx: (lon) => Math.min(nx - 1, Math.max(0, Math.floor((lon - w) / deg))),
    cellIy: (lat) => Math.min(ny - 1, Math.max(0, Math.floor((lat - s) / deg))),
    ordOf: (ix, iy) => iy * nx + ix,
    ixOf: (ord) => ord % nx,
    iyOf: (ord) => Math.floor(ord / nx),
  };
}

/** The [w,s,e,n] of one grid cell, clipped to the region bbox (the last row/column is short). */
export function usasCellBbox(grid, ix, iy) {
  const tw = grid.w + ix * grid.deg;
  const ts = grid.s + iy * grid.deg;
  return [tw, ts, Math.min(tw + grid.deg, grid.e), Math.min(ts + grid.deg, grid.n)];
}

/** Ground area of one grid cell in km² — for the "how much did we stamp vs skip" accounting. */
export function usasCellKm2(grid, ix, iy) {
  const [tw, ts, te, tn] = usasCellBbox(grid, ix, iy);
  const midLat = (ts + tn) / 2;
  return ((te - tw) * usasMPerDegLon(midLat) * (tn - ts) * USAS_M_PER_DEG_LAT) / 1e6;
}

/**
 * Order the populated cells for the sweep and drop anything the resume cursor already covered.
 * Deterministic on the NUMERIC `ord`, never lexicographic on "ix,iy" — that sorted "10,3" before "2,3"
 * and made a capped run un-resumable (mdsNational's own scar, kept).
 * @param keys        iterable of "ix,iy" bucket keys
 * @param startCursor ord to resume AT (inclusive), or null/0 for the beginning
 */
export function usasSweepOrder(keys, grid, startCursor = null) {
  const cells = [];
  for (const k of keys) {
    const [ix, iy] = String(k).split(',').map(Number);
    if (!Number.isFinite(ix) || !Number.isFinite(iy)) continue;
    cells.push({ key: String(k), ix, iy, ord: grid.ordOf(ix, iy) });
  }
  cells.sort((a, b) => a.ord - b.ord);
  if (!startCursor) return cells;
  return cells.filter((c) => c.ord >= startCursor);
}

/** Split an ordered cell list into fixed-size batches. A batch is issued concurrently but batches run
 *  in order, so the resume cursor stays exact. */
export function usasSweepBatches(cells, concurrency = USAS_SWEEP_CONCURRENCY) {
  const size = Math.max(1, Math.floor(concurrency));
  const out = [];
  for (let i = 0; i < cells.length; i += size) out.push(cells.slice(i, i + size));
  return out;
}

/**
 * §LOUD-AND-ORDERED-TRUNCATION — the sentence a truncated national run prints.
 *
 * A cap being respected is a BUDGET; a sweep that stopped early and said nothing is a LIE about
 * coverage (§ABORT-IS-NOT-A-CAP, and the failure-vs-empty family one level up). So the note always
 * carries: WHY it stopped, the km² actually stamped, the km² of POPULATED ground it scanned and
 * skipped, how many populated cells it never opened, and the cursor to resume from.
 */
export function formatUsasSweepSummary(st) {
  const km2 = (v) => `${Math.round(v ?? 0).toLocaleString('en-US')} km²`;
  const total = Number(st.swathesTotal ?? 1), scanned = Number(st.swathesScanned ?? 1);
  if (st.stopReason === 'complete') {
    return `USA Structures national sweep COMPLETE — ${st.cellsStamped} populated cell(s) / ` +
      `${km2(st.km2Stamped)} stamped across ${scanned}/${total} bounded-heap swathe(s); 0 skipped.`;
  }
  // ⭐ A SKIPPED BAND IS NOT A SKIPPED CELL, and the two are counted separately on purpose. `cellsSkipped`
  // can only ever hold the POPULATED cells of the band that was open when the cap hit — every LATER band
  // was never partitioned, so its cells were never bucketed and cannot appear in that number at all.
  // Reporting only the cell count would therefore under-state a truncation by whole bands of the country,
  // which is the §ABORT-IS-NOT-A-CAP failure wearing an accurate-looking figure.
  const bands = total - scanned;
  return `⚠ USA Structures national sweep TRUNCATED (${st.stopReason}) — ${st.cellsStamped} populated cell(s) / ` +
    `${km2(st.km2Stamped)} stamped across ${scanned}/${total} bounded-heap swathe(s); ${st.cellsSkipped} populated ` +
    `cell(s) / ${km2(st.km2Skipped)} SKIPPED in the open swathe, and ${bands} further swathe(s) were NEVER OPENED ` +
    `(their cells are not in that count — they were never read). Every skipped footprint streams through with its ` +
    `ORIGINAL OSM tags — honest assumed, never fabricated. ` +
    `RESUME with USAS_SWEEP_CURSOR=${st.nextCursor} (cell ord; SW corner lat ${Number(st.nextCursorLat ?? 0).toFixed(3)} ` +
    `lon ${Number(st.nextCursorLon ?? 0).toFixed(3)}).`;
}

/**
 * §USAS-SWATHE — how many tile ROWS one bounded-heap pass holds. Mirrors mdsNational.mjs §MDS-SWATHE,
 * and it is NOT optional here.
 *
 * ⛔ THIS REPLACES `export const USAS_SWATHE_IS_OWED = true`, WHICH WAS WRITTEN TRUE AND WAS ALREADY
 * FALSE WHEN IT WAS WRITTEN. Its reasoning, verbatim: *"Today it does not need to: every US bake row
 * is a metro CLIP, so the retained set is a metro's worth of footprints however wide the working set
 * is. The day the US rows become whole-STATE rows (the Australia shape), a state like California will
 * need the swathe pass."* That day was THE SAME DAY: §BAKE-US-STATES (lane USA-ALL-STATES, 2026-09-06)
 * had already replaced the six metro clips with 52 whole-STATE rows before this join was wired onto
 * them. A comment that defers a bound on a condition which already holds is
 * §VERIFICATION-ARTIFACT-CAN-PREDATE-SUBJECT in prose form — it described a repo that no longer
 * existed, and it would have been believed.
 *
 * WHY IT IS LOAD-BEARING. `stampBboxesFor('usas')` retains US_NATIONAL_BBOXES, so a state row holds
 * every footprint in the STATE. Measured cost: ~1,256 B of V8 heap per parsed OSM footprint
 * (geojsonseqRead.spec.ts §heap-budget). The bake job is given 12,288 MB
 * (`NODE_OPTIONS=--max-old-space-size=12288`) and geojsonseqRead's HEAP WATCHDOG aborts at 85 % of it.
 * One whole-California retain pass is the same arithmetic that killed run 30693132326 at 4.04 GB on
 * whole Spain — and here it is worse than slow: a heightJoin that returns `error` EXITS 4
 * (bake.mjs assertMeasuredHeights), so ONE unswathed state takes the WHOLE US bake down.
 *
 * THE NUMBER, and exactly what is measured about it. 40 rows × 0.02° = 0.80° of latitude per band.
 * MEASURED: the per-footprint heap cost, the heap ceiling, the watchdog fraction, the tile degree.
 * ⚠ NOT MEASURED — this lane never streamed a US clip, so how many OSM footprints a 0.80° band of
 * California actually holds is an ESTIMATE and is labelled one: ~3 M footprints (~3.8 GB) for the
 * densest band, ~2.7× under the watchdog. California's 9.54° of latitude is 12 bands, Texas's 10.84°
 * is 14, and most states are 3–5.
 * ⭐ THE BACKSTOP IS NOT THIS NUMBER — it is the watchdog, which names the band, the peak and the
 * budget rather than dying as an OOM. If a band ever trips it, HALVE THIS (`USAS_SWATHE_ROWS=20` in
 * the environment, no code change) rather than raising the heap, which the 30693132326 post-mortem
 * already refused.
 */
export const USAS_SWATHE_ROWS = 40;

/**
 * The bounded-heap passes: contiguous bands of whole tile ROWS, SOUTH→NORTH, covering the region grid.
 *
 * Whole rows, never round degrees, so no cell straddles two bands and gets fetched twice; south→north
 * so the single monotonic `ord` cursor stays correct ACROSS bands as well as within one. A footprint
 * is retained by exactly one band (bands partition latitude) and whatever no band retained is
 * concatenated through unchanged — nothing is dropped, duplicated or fabricated.
 * @returns {{index:number, iy0:number, iy1:number, bbox:[number,number,number,number], ordFrom:number, ordTo:number}[]}
 */
export function usasNationalSwathes(grid, { swatheRows = USAS_SWATHE_ROWS } = {}) {
  const rows = Math.max(1, Math.floor(swatheRows));
  const out = [];
  for (let iy0 = 0, index = 0; iy0 < grid.ny; iy0 += rows, index++) {
    const iy1 = Math.min(iy0 + rows, grid.ny);
    out.push({
      index,
      iy0,
      iy1,
      bbox: [grid.w, grid.s + iy0 * grid.deg, grid.e, Math.min(grid.s + iy1 * grid.deg, grid.n)],
      ordFrom: iy0 * grid.nx,
      ordTo: iy1 * grid.nx, // exclusive
    });
  }
  return out;
}

/**
 * The national candidates ASSESSED on 2026-09-06, kept machine-readable so a future row must overwrite
 * a PROBED verdict rather than a blank. `status` is the verdict; `evidence` is the exact HTTP answer.
 */
export const US_NATIONAL_ASSESSED = [
  { source: 'usgs-3dep-dsm', status: 'dtm-only-conus',
    evidence: 'elevation.nationalmap.gov/arcgis/rest/services?f=json → HTTP 200 106 B, ONE service ("3DEPElevation" ImageServer); its ' +
      'serviceDescription says "Bare Earth DEM"; identify at the Empire State Building (-73.9857,40.7484) → HTTP 200 11,773 B "value":"15.09" ' +
      '(the GROUND, not the 443 m tower). tnmaccess datasets → HTTP 200 42,707 B: the only DSM in the whole catalogue is "Ifsar Digital Surface ' +
      'Model (DSM)", and products?datasets=Ifsar…&bbox=-97.40,37.60,-97.20,37.80 (CONUS) → {"total": 0, "items": []} while the same query at ' +
      'bbox=-148.0,64.7,-147.5,65.0 → "total": 4 ("USGS NED Digital Surface Model AK IFSAR-Cell3 2010"). NO CONUS DSM ⇒ no national DSM−DTM.' },
  { source: 'usgs-3dep-lpc', status: 'exists-not-wired',
    evidence: 'The National Map catalogue lists "Lidar Point Cloud (LPC)" nationally. A DSM CAN be derived from it — that is a PDAL/EPT pipeline ' +
      'over tens of TB of LAZ, not a per-cell HTTP read. Not built here; recorded as owed, not as absent.' },
  { source: 'overture-buildings-height', status: 'estimate-not-wired',
    evidence: 's3://overturemaps-us-west-2/release/ → HTTP 200 (2026-07-22.0, 2026-08-19.0). Schema carries height + sources STRUCT(property, dataset, ' +
      'license, record_id, confidence). Wichita core -97.40,37.65,-97.25,37.75 via duckdb, 138.4 s: 79,096 buildings, 69,889 with height (88.4 %), ' +
      '99 with num_floors, p50 4.14 m, MAX 34.73 m — Wichita\'s 98 m Epic Center is absent. A max of 34.73 m over 79k urban buildings is a MODELLED ' +
      'height. Not wired: a modelled height may never be written under the measured marker (brief item 3). The per-dataset provenance query was ' +
      'issued and had NOT returned when the lane closed, so the dataset NAME behind Overture US heights is UNMEASURED here and is not asserted.' },
  { source: 'microsoft-globalml-us', status: 'estimate-wrong-shape',
    evidence: 'dataset-links.csv → HTTP 200 7,171,802 B, 2,415 UnitedStates tiles, release 2026-02-03. Four largest US quadkeys, first 600 kB each ' +
      '(HTTP 206): 21,419 features → 19,809 real heights (92.5 %), 1,610 at the -1.0 sentinel; p50 4.0 m MAX 34.6 m — the SAME distribution as ' +
      'Overture, i.e. the same modelled surface. Delivery is gzipped GeoJSONL by level-9 quadkey up to 170.3 MB per tile with NO bbox query.' },
  { source: 'utah-ugrc-buildings', status: 'no-height-attribute',
    evidence: 'services1.arcgis.com/99lidPhWCzftIe9K/arcgis/rest/services/Buildings/FeatureServer/0?f=json → HTTP 200. Fields VERBATIM: OBJECTID NAME ' +
      'TYPE ADDRESS CITY ZIP5 COUNTY FIPS PARCEL_ID SRC_YEAR Shape__Area Shape__Length — no height. copyrightText: "This data is created and licensed ' +
      'by Microsoft under the Open Data Commons Open Database License (ODbL) … Schema and attributes provided by the AGRC."' },
  { source: 'wa-dnr-lidar-portal', status: 'unprobed-door-open',
    evidence: 'lidarportal.dnr.wa.gov → HTTP 200 1,319 B text/html. The door is LIVE and Washington publishes DSM as well as DTM per project, but no ' +
      'height channel behind it was opened by this lane. UNKNOWN, not empty.' },
  // ⭐ PHILADELPHIA IS A REAL, REACHABLE CITY CHANNEL — the one candidate in the brief's item (d) that
  // turned out to serve measured heights, found by walking the org's service list instead of guessing a
  // path. It is NOT wired here (the national layer already covers Pennsylvania with 1,828,525
  // height-bearing structures, and a fourth city adapter is a separate row, not a side effect of this
  // lane), but it is the next US city row anyone should add, and it is recorded with enough detail that
  // the next lane does not re-probe it.
  { source: 'philadelphia-li-building-footprints', status: 'live-measured-not-wired',
    evidence: 'services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services?f=json → HTTP 200, 395,424 B, 4.84 s (the org list; LI_BUILDING_FOOTPRINTS is ' +
      'one of 25 services matching /build/i). Layer .../LI_BUILDING_FOOTPRINTS/FeatureServer/0?f=json → HTTP 200, 11,164 B, 0.69 s; Polygon, ' +
      'maxRecordCount 2000; FIELDS VERBATIM: objectid bin fcode address building_name base_elevation max_hgt parcel_id_num parcel_id_source ' +
      'dor_alternate_addr square_ft Shape__Area Shape__Length — so `max_hgt` (Double) and `approx_hgt` are per-building heights. ' +
      'where=1=1&returnCountOnly=true → HTTP 200, 16 B, {"count":546459}. Centre-city cell -75.170,39.950,-75.160,39.960 → HTTP 200, 43,907 B, ' +
      '0.76 s, 454 rows, max_hgt non-null on ALL 454: min 0.070 · p50 67.40 · p90 298.64 · MAX 1127.54. ⭐ UNIT IS FEET, and the max proves it — ' +
      '1127.54 ft = 343.7 m is the Comcast Technology Center (342 m). ⚠ The near-zero minimum (0.07 ft) means a minPlausibleM rule is REQUIRED ' +
      'before this is wired; do not copy the field in without one. Copyright text: empty string (no licence asserted ON the service — the licence ' +
      'must be read from the OpenDataPhilly entry before use, and was NOT read by this lane).' },
  { source: 'dc-opendata-building-footprints', status: 'not-found-at-the-probed-service',
    evidence: 'maps2.dcgis.dc.gov/dcgis/rest/services?f=json → HTTP 200, 1,167 B: folders DCDATA_LEVEL2, DCGIS_APPS, DCGIS_DATA, DCGIS_HISTORICAL, ' +
      'DCHEALTH, DCOZ, DDOE, DDOT, DPW, FEEDS, GEOPROCESSING, HSEMA, MPD, OP, PrintLayout, Utilities. ' +
      'DCGIS_DATA/Property_and_Land_WebMercator/MapServer?f=json → HTTP 200, 12,212 B, and its ONLY /build/i layers are id 82 "Vacant and Blighted ' +
      'Building Addresses" (Point), id 9 "Building Restriction Lines" (Polyline) and id 81 "Vacant and Blighted Building Footprints" (Polygon) — ' +
      'NOT the city-wide footprint layer. The door is open and the layer is elsewhere in those 16 folders; UNKNOWN, not absent. USA Structures ' +
      'already measures 180,671 structures in the districtofcolumbia row, so this is an improvement, not a gap.' },
  { source: 'nc-onemap', status: 'no-buildings-folder-at-root',
    evidence: 'services.nconemap.gov/secure/rest/services?f=json → HTTP 200, 2,602 B, 0.75 s. Folders VERBATIM: AddressNC, Broadband, Elevation, ' +
      'Imagery, ImageryProject, NG911, test1, Utilities — there is no Buildings folder at the root. NC publishes statewide QL2 lidar under ' +
      '`Elevation`, which is a DTM/DSM question this lane did not open. UNKNOWN, not empty.' },
  { source: 'oh-pa-tx-wa-state-lidar', status: 'not-probed',
    evidence: 'Ohio, Pennsylvania (PASDA/PAMAP), Texas TNRIS/StratMap and the WA DNR portal beyond its front door were named in the brief and NOT ' +
      'probed by this lane. Their USA Structures coverage IS measured above (OH 23.9 %, WA 16.9 %; TX and PA time out on the whole-state groupBy but ' +
      'answer count-only at 3,530,320 / 1,828,525), which is the reason to probe them next rather than the reason not to.' },
  { source: 'seattle-denver-city-models', status: 'unprobed',
    evidence: 'data.seattle.gov metadata API → HTTP 200 2,043 B (alive); Denver was not reached at all. No verdict is claimed for either.' },
];

/**
 * ⛔ NAMED SOURCE HOLES INSIDE WIRED ROWS — places where USA Structures answered HTTP 200 with a real
 * count of ZERO height-bearing structures. They are recorded because a blank is indistinguishable from
 * "we never looked", and because none of them may EVER become a CI gate row (§MEASURED-HEIGHT-GATE
 * would then fail a bake for a height that does not exist at the source).
 *
 * Measured 2026-09-06, `where=HEIGHT IS NOT NULL&returnCountOnly=true` over each box, HTTP 200 each:
 *   • ROCHESTER NY [-77.64, 43.14, -77.59, 43.18] → {"count":0}, 11 B, 0.75 s. In the `newyork` row,
 *     70 km from Buffalo, which answered 8,837 over the same size of box. The national layer simply
 *     has not measured Rochester.
 *   • Pflugerville TX · Austin-north · Houston-west · Missoula MT · Fairbanks AK · Hilo HI — the six
 *     ORNL-only cells in the header above (rows present, heights zero).
 * These footprints keep their honest OSM tags and render `assumed`; that is the correct answer, and it
 * is a SOURCE gap, never a working-set gap.
 */
export const US_NATIONAL_MEASURED_ZERO_CELLS = [
  { place: 'rochester-ny', region: 'newyork', bbox: [-77.64, 43.14, -77.59, 43.18], heightCount: 0 },
  { place: 'pflugerville-tx', region: 'texas', bbox: [-97.6305, 30.4395, -97.6195, 30.4505], heightCount: 0 },
];
