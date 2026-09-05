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
 *  belong here; everything else is in US_OPEN_HEIGHTS_ASSESSED below. `region` = the bake.mjs row. */
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
    metro: 'sanfrancisco', region: 'sanfrancisco',
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
    metro: 'boston', region: 'boston',
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

/** Each metro row's stamp working set — BYTE-IDENTICAL to its bake.mjs row bbox (pinned by
 *  usOpenHeights.spec.ts), so the §HEIGHT-STAMP-BUDGET preflight holds exactly the metro clip. A
 *  footprint inside the bbox but outside the dataset's coverage (Jersey City in the newyork row,
 *  Cambridge in the boston row) matches nothing and keeps its OSM tags — never a fabricated height. */
export const US_OPEN_CITY_BBOXES = [
  // city             metro            region           [w, s, e, n] (WGS84, osmium -b order)
  { city: 'newyork',      metro: 'newyork',      region: 'newyork',      bbox: [-74.03, 40.70, -73.91, 40.82] },
  { city: 'sanfrancisco', metro: 'sanfrancisco', region: 'sanfrancisco', bbox: [-122.52, 37.70, -122.36, 37.83] },
  { city: 'boston',       metro: 'boston',       region: 'boston',       bbox: [-71.20, 42.22, -70.98, 42.40] },
];

/** The metros/channels ASSESSED on 2026-09-05 and found to serve NO measured height keylessly. Kept
 *  machine-readable so a future row must overwrite a PROBED verdict, not a blank. */
export const US_OPEN_HEIGHTS_ASSESSED = [
  { metro: 'chicago', region: 'chicago', status: 'no-height-attribute',
    evidence: 'data.cityofchicago.org syp8-uezg Building Footprints (HTTP 200, 820,606 rows, rowsUpdatedAt 2015-08-15): fields carry stories/no_stories/z_coord but NO height; Loop cell 251 rows, stories p50 10 · max 60, z_coord 0; hz9b-7eeu → 404 dataset.missing. `stories` → building:levels (derived-levels) is the owed follow-up, not a measured height' },
  { metro: 'massgis', region: 'boston', status: 'no-height-attribute',
    evidence: 'gis-prod.digital.mass.gov/geoserver WFS massgis:GISDATA.STRUCTURES_POLY DescribeFeatureType (HTTP 200, 2,741 B): struct_id/source/sourcetype/sourcedate/sourcedata/moved/area_sq_ft/town_id*/local_id/archived*/edit_*/comments — no height; gis.massgis.digital.mass.gov NXDOMAIN (curl 6)' },
  { metro: 'boston-gisportal', region: 'boston', status: 'no-queryable-service',
    evidence: 'gisportal.boston.gov Assessing/DOIT_buildings FeatureServer → HTTP 500 "Server object extension featureserver not found", MapServer/0 → 52 B; CityServices/OPEN_DATA/MapServer → 404' },
  { metro: 'austin', region: 'austin', status: 'not-probed', evidence: 'no open per-metro height channel named in the registry; stays overture_us (documented)' },
  { metro: 'houston', region: 'houston', status: 'not-probed', evidence: 'no open per-metro height channel named in the registry; stays overture_us (documented)' },
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
    return `${m.layer}/query?f=geojson&where=${encodeURIComponent('1=1')}` +
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
