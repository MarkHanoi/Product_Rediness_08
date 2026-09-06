// ─────────────────────────────────────────────────────────────────────────────
// §CA-OPEN-HEIGHTS (2026-09-06, lane MEXICO-CANADA) — per-jurisdiction OPEN building-element heights
// for Canada: the PURE, dependency-free half of the Canadian measured-height stamp.
//
// WHY THIS FILE IS SEPARATE FROM heightSources.mjs — the same reason as heights/auOpenHeights.mjs,
// heights/mnhFr.mjs and heights/swissNdsm.mjs: vitest cannot import heightSources.mjs, so every
// DECISION the stamp makes (which jurisdiction serves a point, the request URL and its axis order,
// which records count as buildings, how a stack of roof elements becomes ONE height, what is
// plausible, and — new here — what a TRUNCATED answer is) lives here as a total function of its
// arguments and is unit-tested against VERBATIM live fixtures; the network + stream half
// (`stampCaOpenHeightsOnGeojsonseq`) imports these.
//
// ⭐ THE STRUCTURAL FACT BOTH CANADIAN CHANNELS SHARE WITH MELBOURNE — and it is why this file is a
// near-mirror of auOpenHeights.mjs rather than a new design: BOTH publish a building as a STACK OF
// ELEMENTS sharing one building id, each element carrying its OWN top/base, and BOTH also publish a
// per-BUILDING aggregate that MUST NOT be used. Measured 2026-09-06:
//   • Vancouver bldgid 145738 — element hgt_agl 21.88 m, but the record's own `maxht_m` is 143.12 m
//     (the tower attached to that podium). Taking `maxht_m` would draw a 143 m podium. The join
//     therefore uses topelev_m/baseelev_m PER ELEMENT, never maxht_m/minht_m/avght_m.
//   • Toronto BUILDINGID 461080 — three elements at DERIVED_HEIGHT 32.31 / 34.97 / 37.43 m over
//     ELEVATION 80.89 / 80.65 / 80.42; the matched set decides, exactly as Eureka's 11 components do.
//
// THE CHANNELS — what is REAL, LIVE-PROBED 2026-09-06 (every number below is a measurement):
//
//   • VANCOUVER — City of Vancouver "Building footprints 2009", Opendatasoft Explore API v2.1
//     (opendata.vancouver.ca). Dataset meta HTTP 200, 6,065 B: `records_count: 124181`,
//     `license: "Open Government Licence - Vancouver"`,
//     `license_url: https://opendata.vancouver.ca/pages/licence/`, extent
//     −123.26147…−123.02368 E, 49.19976…49.31284 N. Fields (verbatim, with the portal's own
//     descriptions): id · orient8 · bldgid ("A value shared by all polygons that make up an
//     individual building") · topelev_m ("Highest elevation of the building element in meters
//     (geodetic)") · med_slope · baseelev_m ("The lowest elevation of the building element in
//     meters (geodetic)") · hgt_agl ("The building element height above grade level in meters
//     (essentially this is TOPELEV_M minus BASEELEV_M)") · rooftype (Complex | Flat | Pitched) ·
//     area_m2 · avght_m · minht_m · maxht_m · base_m · len · wid · geom · geo_point_2d.
//     These are LiDAR-derived surfaces, hence `measured-lidar`, not floors×N and not assumed.
//     Export probe: /exports/geojson over in_bbox(geo_point_2d,49.2810,−123.1220,49.2830,−123.1190)
//     → HTTP 200, 28,342 B, 41 features, 0.57 s (saved VERBATIM as
//     __tests__/fixtures/ca-vancouver-lidar2009-2026-09-06.json).
//     ⚠ THE SIBLING DATASETS CARRY NO HEIGHT, probed the same day: `building-footprints-2015`
//     (154,124 records) has fields object_id · geom · geo_point_2d ONLY; `building-footprints-1999`
//     and `building-lines` have geom · geo_point_2d ONLY. The 2009 vintage is the ONLY one with
//     heights — a newer file is not a better one here, and that is why this row is pinned to 2009.
//
//   • TORONTO — City of Toronto "Building Outline Polygon", the city's OWN keyless ArcGIS
//     (gis.toronto.ca/arcgis/rest/services/cot_geospatial3/MapServer/2, currentVersion 11.5).
//     Layer meta HTTP 200: type "Feature Layer", maxRecordCount 2000. Fields (verbatim):
//     SUBTYPE_CODE · SUBTYPE_DESC · ELEVATION:Single · DERIVED_HEIGHT:Single · X · Y · LONGITUDE ·
//     LATITUDE · OBJECTID · SHAPE · SHAPE.AREA · SHAPE.LEN · LAST_GEOMETRY_MAINT ·
//     LAST_ATTRIBUTE_MAINT · BUILDINGID. Query probe f=geojson over a 0.002°×0.002° downtown box
//     → HTTP 200, 41,568 B, 49 features, 0.67 s (saved VERBATIM as
//     __tests__/fixtures/ca-toronto-derivedheight-2026-09-06.json); real metres, e.g. 112.36 /
//     173.41 / 116.9 / 15.26 m on the block north of Union Station.
//     ⚠ THE CKAN "3D Massing" DATASET IS NOT THIS ONE and is NOT wired: package_show HTTP 200,
//     21,408 B — its 18 resources are per-year SHP/Multipatch ZIPs plus a PDF tile locator and an
//     AGOL webapp link, `license_title: "License not specified"`. A bulk ZIP is not a keyless
//     per-bbox channel (the ELVIS refusal shape), and an unspecified licence is not an open one.
//     The ArcGIS layer above is the City's own service, carries the same measurement, and answers
//     per bbox — so that is the channel, and 3D Massing stays a NAMED non-use, not a silent one.
//
//   • ⛔ TRUNCATION IS A FAILURE, NOT AN ANSWER (§BDTOPO-CAP-TRUNCATE, measured before designing).
//     Toronto's layer caps at maxRecordCount 2000 and SAYS SO: a 0.04°×0.04° downtown query returned
//     HTTP 200, 195,350 B, exactly 2000 features and `"exceededTransferLimit": true`, while
//     returnCountOnly=true on the SAME box answered `{"count":18358}`. 2,000 of 18,358 read as a
//     complete answer would have stamped the 11% the server chose to send and left the rest at 9 m —
//     silently, with a 200. `caOpenIsTruncated()` below exists for exactly that, the stamp counts it
//     as a tile ERROR, and the cell size is chosen from the MEASURED density (18,358 per 0.04° box ⇒
//     ~287 per 0.005° cell) rather than from hope.
//
// WHAT IS NOT REAL (probed 2026-09-06, so these stay `documented`/refused, never armed) — see
// CA_OPEN_HEIGHTS_ASSESSED at the bottom for the verbatim evidence of each.
// ─────────────────────────────────────────────────────────────────────────────

/** The per-jurisdiction adapter table. Only jurisdictions with a PROBED, keyless, height-bearing
 *  element channel belong here; everything else is in CA_OPEN_HEIGHTS_ASSESSED below.
 *  `kind` selects the request builder + parser; `tileSpanDeg` is chosen from that channel's OWN
 *  measured density and cap (Toronto caps at 2000/query, Vancouver's export has no row cap). */
export const CA_OPEN_HEIGHTS = {
  vancouver_cov: {
    jurisdiction: 'vancouver_cov',
    region: 'britishcolumbia',          // the bake.mjs REGIONS row that receives this stamp
    label: 'City of Vancouver — Building footprints 2009 (LiDAR element stack, Opendatasoft)',
    kind: 'ods-export-geojson',
    dataset: 'https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets/building-footprints-2009',
    pointField: 'geo_point_2d',
    idField: 'bldgid',
    topField: 'topelev_m',              // element top, geodetic metres
    baseField: 'baseelev_m',            // element base, geodetic metres
    aglField: 'hgt_agl',                // element top − base, already AGL (the portal's own words)
    selectFields: [
      'geo_point_2d', 'bldgid', 'topelev_m', 'baseelev_m', 'hgt_agl',
      'maxht_m', 'minht_m', 'avght_m', 'rooftype', 'area_m2', 'med_slope',
    ],
    tileSpanDeg: 0.01,                  // no row cap on /exports/geojson; 41 features / 28 KB per CBD sliver
    minPlausibleM: 1.5,                 // below this an "element" is a carport roof / kerb, not a building
    maxPlausibleM: 250,                 // Vancouver's tallest is Living Shangri-La, 201 m
    heightSourceTag: 'vancouver-cov-lidar2009',
    licence: 'Open Government Licence – Vancouver (dataset meta `license`, license_url https://opendata.vancouver.ca/pages/licence/ — probed 2026-09-06)',
    attribution: '© City of Vancouver — Building footprints 2009 (Open Government Licence – Vancouver)',
  },
  toronto_cot: {
    jurisdiction: 'toronto_cot',
    region: 'ontario',
    label: 'City of Toronto — Building Outline Polygon (DERIVED_HEIGHT, city ArcGIS)',
    kind: 'arcgis-query-geojson',
    layer: 'https://gis.toronto.ca/arcgis/rest/services/cot_geospatial3/MapServer/2',
    idField: 'BUILDINGID',
    aglField: 'DERIVED_HEIGHT',         // metres above grade, per element
    groundField: 'ELEVATION',           // element ground elevation, metres
    typeField: 'SUBTYPE_DESC',
    includeTypes: ['Building Outline'], // "Miscellaneous Structure" is a canopy/shed, not a building
    selectFields: ['BUILDINGID', 'DERIVED_HEIGHT', 'ELEVATION', 'SUBTYPE_DESC'],
    maxRecordCount: 2000,               // the layer's OWN declared cap (meta, probed)
    tileSpanDeg: 0.005,                 // 18,358 per 0.04° box ⇒ ~287 per cell, clear of the 2000 cap
    minPlausibleM: 1.5,
    maxPlausibleM: 400,                 // First Canadian Place is 298 m; the CN Tower is not a building outline
    heightSourceTag: 'toronto-cot-derived',
    licence: 'Open Government Licence – Toronto (city ArcGIS, keyless; the CKAN 3D Massing package is a SEPARATE, unspecified-licence bulk product and is NOT used)',
    attribution: '© City of Toronto — Building Outline Polygon',
  },
};

/** The stamp working sets (the CA analogue of MDS_CITY_BBOXES / AU_OPEN_CITY_BBOXES / SWISS_CITY_BBOXES
 *  — mandatory: §HEIGHT-STAMP-BUDGET / L-659). Footprints outside these bboxes stream through with
 *  their original OSM tags — never a fabricated height.
 *  • vancouver CONTAINS the dataset's own probed extent (−123.26147…−123.02368, 49.19976…49.31284).
 *  • toronto is the CORE, not the whole city: at tileSpanDeg 0.005 the amalgamated city would be
 *    ~5,900 cells, and a bounded working set is the precedent (Melbourne = the LGA, Spain = nine
 *    metros). Widening it is a data edit, not a code change. */
export const CA_OPEN_CITY_BBOXES = [
  // city          jurisdiction       region (bake.mjs row)  [w, s, e, n] (WGS84, osmium -b order)
  { city: 'vancouver', jurisdiction: 'vancouver_cov', region: 'britishcolumbia', bbox: [-123.28, 49.19, -123.01, 49.32] },
  { city: 'toronto',   jurisdiction: 'toronto_cot',   region: 'ontario',         bbox: [-79.45, 43.62, -79.31, 43.71] },
];

/** The Canadian jurisdictions/products ASSESSED on 2026-09-06 and found to serve NO measured height
 *  keylessly (or to serve one that cannot honestly be joined). Kept machine-readable so a future row
 *  must overwrite a PROBED verdict, not a blank. */
export const CA_OPEN_HEIGHTS_ASSESSED = [
  { jurisdiction: 'montreal_vdm', region: 'quebec', status: 'bulk-download-not-query-api',
    evidence: 'donnees.montreal.ca CKAN package_show HTTP 200 — `batiment-2d` (CC BY 4.0) offers ONLY SHP + GPKG ZIPs of the whole city (no API, no height field named); `modele-numerique-de-surface-mns` (CC BY 4.0) is 32 per-borough 1 m GeoTIFF ZIPs (mnsterrainbatiment_2015_1m_*.zip) — a real LiDAR DSM, but a ZIP-per-borough bulk product with no keyless WCS/COG to range-read, so no DSM−DTM derive is attempted (the ELVIS refusal shape). `batiments-3d-2020-maquette-lod2-avec-textures` is CityGML LOD2 bulk. This is a WIRABLE-BUT-UNWIRED source, not an absent one.' },
  { jurisdiction: 'vancouver_2015', region: 'britishcolumbia', status: 'no-height-attribute',
    evidence: 'opendata.vancouver.ca Explore v2.1 dataset meta HTTP 200, 3,496 B: building-footprints-2015 (154,124 records) fields are object_id · geom · geo_point_2d — no height. building-footprints-1999 and building-lines: geom · geo_point_2d only. Only the 2009 vintage carries heights.' },
  { jurisdiction: 'odb_statcan', region: '*', status: 'footprints-without-height',
    evidence: 'The StatCan/NRCan Open Database of Buildings is a national FOOTPRINT compilation; it is not a height product, so it cannot raise a single metre here. Not wired, and not counted as a height refusal — it is the wrong kind of thing.' },
];

/** The jurisdiction whose working-set bbox contains (lon, lat), or null. */
export function caOpenJurisdictionForPoint(lon, lat, cities = CA_OPEN_CITY_BBOXES) {
  for (const c of cities) {
    const [w, s, e, n] = c.bbox;
    if (lon >= w && lon <= e && lat >= s && lat <= n) return CA_OPEN_HEIGHTS[c.jurisdiction] ?? null;
  }
  return null;
}

/**
 * The keyless request URL for one jurisdiction over a WGS84 `[w,s,e,n]` box, optionally padded by
 * `padDeg` so an element whose centroid sits just across a cell edge is still fetched for the
 * footprints in this cell (duplicates across cells are harmless — matching is per footprint).
 * ⚠ AXIS ORDER: ODSQL `in_bbox(field, lat1, lon1, lat2, lon2)` is LAT,LON; ArcGIS
 * `geometry={xmin,ymin,xmax,ymax}` is LON,LAT. Getting either backwards returns an EMPTY collection
 * over the wrong ocean rather than an error, which is why this builder is unit-tested.
 */
export function caOpenRequestUrl(j, [w, s, e, n], { padDeg = 0 } = {}) {
  const p = Number.isFinite(padDeg) ? Math.max(0, padDeg) : 0;
  const W = (w - p).toFixed(6), S = (s - p).toFixed(6), E = (e + p).toFixed(6), N = (n + p).toFixed(6);
  if (j.kind === 'ods-export-geojson') {
    const where = `in_bbox(${j.pointField},${S},${W},${N},${E})`;
    return `${j.dataset}/exports/geojson?where=${encodeURIComponent(where)}&select=${encodeURIComponent(j.selectFields.join(','))}`;
  }
  if (j.kind === 'arcgis-query-geojson') {
    const geom = JSON.stringify({ xmin: Number(W), ymin: Number(S), xmax: Number(E), ymax: Number(N), spatialReference: { wkid: 4326 } });
    const q = [
      'where=1%3D1',
      `geometry=${encodeURIComponent(geom)}`,
      'geometryType=esriGeometryEnvelope',
      'inSR=4326',
      'spatialRel=esriSpatialRelIntersects',
      `outFields=${encodeURIComponent(j.selectFields.join(','))}`,
      'returnGeometry=true',
      'outSR=4326',
      'f=geojson',
    ].join('&');
    return `${j.layer}/query?${q}`;
  }
  throw new Error(`caOpenRequestUrl: unknown kind '${j.kind}' for jurisdiction '${j.jurisdiction}'`);
}

/**
 * Body → GeoJSON FeatureCollection, or **null** for anything that is not one (an error JSON, an
 * HTML page, an empty body). null is UNKNOWN — the caller counts it as a tile ERROR and never as
 * "no buildings here"; a genuine `{features: []}` is returned as-is (a real EMPTY).
 */
export function parseCaGeojson(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  try {
    const j = JSON.parse(text);
    return j && j.type === 'FeatureCollection' && Array.isArray(j.features) ? j : null;
  } catch { return null; }
}

/**
 * ⛔ TRUE when the server TRUNCATED this answer — an HTTP 200 that is not a complete answer.
 * ArcGIS says so explicitly (`exceededTransferLimit: true`, MEASURED: 2000 of 18,358 on a 0.04°
 * Toronto box). It also says so IMPLICITLY when the feature count lands exactly on the layer's
 * declared cap, which is how an older server that omits the flag truncates. Either way the caller
 * must count a tile ERROR, never stamp the fraction that arrived.
 */
export function caOpenIsTruncated(fc, j) {
  if (!fc) return false;
  if (fc.exceededTransferLimit === true) return true;
  const cap = j?.maxRecordCount;
  return Number.isFinite(cap) && cap > 0 && Array.isArray(fc.features) && fc.features.length >= cap;
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

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
 * The building ELEMENTS in a response for jurisdiction `j`: one per feature of an included type,
 * normalised to `{ id, top, base, agl, ring, cx, cy }` in metres (null where the source is null —
 * never coerced to 0), with a centroid taken from the portal's own point field where it has one and
 * from the ring mean otherwise. Features with no usable ring are dropped (they cannot be matched).
 *
 * ⚠ `top`/`base` are the ELEMENT's own, never the per-building aggregate (Vancouver's maxht_m /
 * minht_m / avght_m are deliberately parsed and deliberately NOT used — see the header).
 */
export function caElements(fc, j) {
  const out = [];
  for (const f of fc?.features ?? []) {
    const p = f?.properties ?? {};
    if (Array.isArray(j.includeTypes) && !j.includeTypes.includes(p[j.typeField])) continue;
    const ring = exteriorRing(f.geometry);
    if (!ring) continue;
    let cx = null, cy = null;
    if (j.pointField && p[j.pointField]) { cx = num(p[j.pointField].lon); cy = num(p[j.pointField].lat); }
    if (cx === null || cy === null) {
      cx = 0; cy = 0;
      for (const [x, y] of ring) { cx += x; cy += y; }
      cx /= ring.length; cy /= ring.length;
    }
    let top = null, base = null;
    const agl = num(p[j.aglField]);
    if (j.topField && j.baseField) { top = num(p[j.topField]); base = num(p[j.baseField]); }
    else if (j.groundField) { const g = num(p[j.groundField]); if (g !== null && agl !== null) { base = g; top = g + agl; } }
    out.push({ id: String(p[j.idField] ?? ''), type: j.typeField ? p[j.typeField] : null, ring, cx, cy, top, base, agl });
  }
  return out;
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

/** ONE height (m above the element base) for a set of matched elements, or null. */
function heightOfElements(els) {
  const tops = els.map((c) => c.top).filter((v) => v !== null);
  const bases = els.map((c) => c.base).filter((v) => v !== null);
  if (tops.length && bases.length) return { height: Math.max(...tops) - Math.min(...bases), rule: 'max(top)−min(base)' };
  const agl = els.map((c) => c.agl).filter((v) => v !== null);
  if (agl.length) return { height: Math.max(...agl), rule: 'max(agl)' };
  return null;
}

/**
 * The measured height for ONE OSM footprint (`ext` ring + `interiors`, centroid `clon,clat`) from
 * the jurisdiction's elements, or **null** when nothing matches or the value is implausible.
 *   1. 'centroid-in'       — elements whose centroid lies inside the footprint: the building's
 *                            element stack (Toronto 461080 = 3, Vancouver 146765 = 3+) collapses to
 *                            max(top) − min(base). A footprint that covers only a podium gets the
 *                            podium's top, not the tower's — the matched set decides, which is the
 *                            whole reason the per-building aggregate is refused.
 *   2. 'contains-centroid' — no element centroid inside (the OSM footprint is smaller than the
 *                            element, or a courtyard block): the elements whose ring contains the
 *                            OSM centroid.
 * Never a neighbour's height, never a default: no match → null → the footprint keeps its OSM tags.
 */
export function caOpenHeightForFootprint(ext, interiors, clon, clat, elements, j) {
  const inside = elements.filter((c) => pointInFootprint(c.cx, c.cy, ext, interiors));
  let h = null, rule = null, matched = 0;
  if (inside.length) {
    const r = heightOfElements(inside);
    if (r) { h = r.height; rule = `centroid-in · ${r.rule}`; matched = inside.length; }
  }
  if (h === null) {
    const containing = elements.filter((c) => pointInRing(clon, clat, c.ring));
    if (containing.length) {
      const r = heightOfElements(containing);
      if (r) { h = r.height; rule = `contains-centroid · ${r.rule}`; matched = containing.length; }
    }
  }
  if (h === null || !Number.isFinite(h)) return null;
  if (h < j.minPlausibleM || h > j.maxPlausibleM) return null;
  return { height: Number(h.toFixed(1)), matched, rule };
}
