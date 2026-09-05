// ─────────────────────────────────────────────────────────────────────────────
// §AU-OPEN-HEIGHTS (2026-09-05, lane HEIGHTS-AU) — per-jurisdiction OPEN building-footprint heights
// for Australia: the PURE, dependency-free half of the AU measured-height stamp.
//
// WHY THIS FILE IS SEPARATE FROM heightSources.mjs — the same reason as heights/mnhFr.mjs and
// heights/swissNdsm.mjs: vitest cannot import heightSources.mjs, so every DECISION the stamp makes
// (which jurisdiction serves a point, the export URL and its axis order, which records count as
// buildings, how a stack of roof components becomes ONE height, what is plausible) lives here as a
// total function of its arguments and is unit-tested against VERBATIM live fixtures; the network +
// stream half (`stampAuOpenHeightsOnGeojsonseq`) imports these.
//
// THE CHANNEL — what is REAL, LIVE-PROBED 2026-09-05 (every number below is a measurement):
//   • City of Melbourne "2023 Building Footprints" on the council's Opendatasoft portal
//     (data.melbourne.vic.gov.au, Explore API v2.1). Dataset meta: `license: "CC BY"`,
//     `license_url: creativecommons.org/licenses/by/4.0/legalcode`. 41,701 records
//     (footprint_type: 40,951 Structure · 359 Tram Stop · 214 Bridge · 77 Jetty · 42 Toilet ·
//     28 Train Platform · 20 Ramp · 9 Tunnel · 1 Public Toilet — whole-dataset CSV export, 4.5 s).
//     Dataset extent 144.898–144.991 E, −37.851–−37.776 S (the LGA, not the metro).
//     Fields (verbatim): structure_id · footprint_type · roof_type · footprint_max_elevation ·
//     footprint_min_elevation · structure_max_elevation · structure_min_elevation ·
//     footprint_extrusion · structure_extrusion · date_captured · geo_point_2d · geo_shape.
//     Elevations are AHD metres; a BUILDING is published as a STACK of roof-level components that
//     share a structure_id: Eureka Tower (structure_id 815210) is 11 components with
//     footprint_max_elevation 7.5 / 11.5 / 15 / 25 / 26.5 / 28 / 33.5 / 180.5 / 209 / 293.5 / 299.5 over a
//     shared structure_min_elevation 2.0 — `structure_extrusion` = footprint_max − structure_min per
//     component (299.5 − 2 = 297.5 = the real 297 m tower; 28 − 2 = 26 for its podium slab).
//     (Re-fetched 2026-09-05 12:56 and saved VERBATIM as __tests__/fixtures/au-melbourne-lod1-eureka-2026-09-05.json:
//     HTTP 200, 29,945 B, 25 features over in_bbox(geo_point_2d,-37.8222,144.9638,-37.8210,144.9654) — five
//     structures: 815210 ×11 → 297.5 m · 802800 ×6 → 33.5 m · 808676 ×3 → 42.5 m · 803606 ×4 → 22.5 m · 800312 ×1 → 13.5 m.)
//   • CAPS — the §BDTOPO-CAP-TRUNCATE lesson, measured before designing: the /records API pages at
//     ≤ 100 rows AND refuses offset + limit > 10,000 (HTTP 400 InvalidRESTParameterError, verbatim:
//     "Invalid value for sum of offset + limit API parameter: 10050 was found but <= 10000 is
//     expected") — a whole-city page-through is impossible there. The /exports/geojson endpoint has
//     NO row cap: a 300 m CBD box returned all 1,097 matching features (652 KB), a 0.01° CBD cell
//     2,059 features (1.66 MB, 3.4 s). So the stamp CELL-SPLITS and calls the export per populated
//     0.01° cell — bounded bytes per call, no truncation. Anonymous quota is 10,000 calls/day per IP
//     (X-RateLimit-Limit header); the whole LGA is ≤ ~100 cells.
//   • AXIS ORDER — `in_bbox(geo_point_2d, lat1, lon1, lat2, lon2)` is LAT,LON (ODSQL). Verified:
//     in_bbox(geo_point_2d,-37.8160,144.9600,-37.8110,144.9680) → 1,097 features. The swapped order
//     does not error — it returns an empty collection over the Indian Ocean, which is why the URL
//     builder is unit-tested.
//
// WHAT IS NOT REAL (probed the same day, so these states stay `documented`, never armed):
//   • ACT — ACTGOV_BUILDING_FOOTPRINTS (AGOL services1.arcgis.com/E5n4f1VY84i0xSjy, 64,674 polygons,
//     maxRecordCount 1000, pagination) carries NO height field: OBJECTID · ID · USE_DESCRIPTION ·
//     BUILDING_TYPE · CURRENT_LIFECYCLE_STAGE · UNITS_PLAN_NO · BLOCK · SECTION · DISTRICT · DIVISION
//     (verbatim). The org's 406 services hold only `lidar_extent_2016` (an extent index, not a
//     raster); data.actmapi.act.gov.au does not resolve (curl exit 6); the Socrata catalogue's
//     "Maximum Building Height" is a PLANNING-envelope layer (a rule, not a measurement).
//   • NSW — portal.spatial.nsw.gov.au lists only NSW_Elevation_and_Depth_Theme (DEM) and
//     Hosted/Elevation_Index_Public (an index); no footprint or height service (au-sweep §1.3 stands).
//   • VIC statewide — Vicmap WFS (opendata.maps.vic.gov.au) has building_point / building_polygon
//     (32,604 notable structures, no height) and vicmap_elevation_1m_dem_footprints (a DEM index).
//   • GA — services.ga.gov.au/gis/rest/services → HTTP 403 to our probe.
//   • ELVIS — elevation.fsdf.org.au is an HTML bulk-download portal (HTTP 200, text/html); there is
//     no keyless raster endpoint to sample, so NO DSM−DTM derive is attempted here.
// ─────────────────────────────────────────────────────────────────────────────

/** The per-jurisdiction adapter table. Only jurisdictions with a PROBED, keyless, height-bearing
 *  footprint channel belong here; everything else is in AU_OPEN_HEIGHTS_ASSESSED below. */
export const AU_OPEN_HEIGHTS = {
  melbourne_cc: {
    jurisdiction: 'melbourne_cc',
    region: 'victoria',                 // the bake.mjs REGIONS row that receives this stamp
    label: 'City of Melbourne — 2023 Building Footprints (LoD1 roof-component stack, Opendatasoft)',
    kind: 'ods-export-geojson',
    dataset: 'https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/2023-building-footprints',
    pointField: 'geo_point_2d',
    typeField: 'footprint_type',
    includeTypes: ['Structure'],        // bridges, jetties, tram stops, ramps, platforms, tunnels are NOT buildings
    selectFields: [
      'geo_point_2d', 'structure_id', 'footprint_type', 'roof_type',
      'footprint_max_elevation', 'footprint_min_elevation', 'structure_max_elevation', 'structure_min_elevation',
      'footprint_extrusion', 'structure_extrusion', 'date_captured',
    ],
    minPlausibleM: 1.0,                 // below this a "structure" is a slab/kerb, not a building
    maxPlausibleM: 400,                 // Australia's tallest is 317 m (Q1); Melbourne's 297.5 m (Eureka) is in the fixture
    heightSourceTag: 'melbourne-cc-lod1',
    licence: 'CC BY 4.0 (dataset meta `license: "CC BY"`, license_url creativecommons.org/licenses/by/4.0/legalcode — probed 2026-09-05)',
    attribution: '© City of Melbourne — 2023 Building Footprints (CC BY 4.0)',
    rateLimitPerDay: 10_000,            // X-RateLimit-Limit: 10000 (anonymous, per IP; probed 2026-09-05)
  },
};

/** The `victoria` national row's stamp working set (the AU analogue of MDS_CITY_BBOXES /
 *  MNH_FR_CITY_BBOXES / SWISS_CITY_BBOXES — mandatory: §HEIGHT-STAMP-BUDGET / L-659). Footprints
 *  outside these bboxes stream through with their original OSM tags — never a fabricated height.
 *  The melbourne bbox CONTAINS the dataset extent (144.898–144.991, −37.851–−37.776) with a margin. */
export const AU_OPEN_CITY_BBOXES = [
  // city          jurisdiction     [w, s, e, n] (WGS84, osmium -b order)
  { city: 'melbourne', jurisdiction: 'melbourne_cc', bbox: [144.89, -37.86, 145.00, -37.77] },
];

/** The states/jurisdictions ASSESSED on 2026-09-05 and found to serve NO measured height keylessly.
 *  Kept machine-readable so a future row must overwrite a PROBED verdict, not a blank. */
export const AU_OPEN_HEIGHTS_ASSESSED = [
  { jurisdiction: 'act', region: 'act', status: 'no-height-attribute',
    evidence: 'ACTGOV_BUILDING_FOOTPRINTS/FeatureServer/0 (HTTP 200, 14,091 B meta): fields OBJECTID/ID/USE_DESCRIPTION/BUILDING_TYPE/CURRENT_LIFECYCLE_STAGE/UNITS_PLAN_NO/BLOCK/SECTION/DISTRICT/DIVISION — no height; org list (92,256 B) has only lidar_extent_2016; data.actmapi.act.gov.au NXDOMAIN; Socrata "Maximum Building Height" is a planning rule' },
  { jurisdiction: 'nsw', region: 'newsouthwales', status: 'no-open-footprint-height-service',
    evidence: 'portal.spatial.nsw.gov.au/server/rest/services (HTTP 200): only NSW_Elevation_and_Depth_Theme(+multiCRS) and Hosted/Elevation_Index_Public match elev/build/height' },
  { jurisdiction: 'vic-statewide', region: 'victoria', status: 'no-height-attribute',
    evidence: 'opendata.maps.vic.gov.au WFS caps (734,521 B): building_point/building_polygon (notable structures) + vicmap_elevation_1m_dem_footprints (DEM index) — no height field' },
  { jurisdiction: 'ga-national', region: '*', status: 'refused',
    evidence: 'services.ga.gov.au/gis/rest/services → HTTP 403' },
  { jurisdiction: 'elvis', region: '*', status: 'bulk-portal-not-raster-api',
    evidence: 'elevation.fsdf.org.au → HTTP 200 text/html (13,250 B); no keyless WCS/COG to sample — no DSM−DTM derive attempted' },
];

/** The jurisdiction whose working-set bbox contains (lon, lat), or null. */
export function auOpenJurisdictionForPoint(lon, lat, cities = AU_OPEN_CITY_BBOXES) {
  for (const c of cities) {
    const [w, s, e, n] = c.bbox;
    if (lon >= w && lon <= e && lat >= s && lat <= n) return AU_OPEN_HEIGHTS[c.jurisdiction] ?? null;
  }
  return null;
}

/**
 * The uncapped /exports/geojson URL for one jurisdiction over a WGS84 `[w,s,e,n]` box, optionally
 * padded by `padDeg` so a component whose centroid sits just across a cell edge is still fetched
 * for the footprints in this cell (duplicates across cells are harmless — matching is per footprint).
 * ⚠ AXIS ORDER: ODSQL `in_bbox(field, lat1, lon1, lat2, lon2)` is LAT,LON.
 */
export function auOpenExportUrl(j, [w, s, e, n], { padDeg = 0 } = {}) {
  const p = Number.isFinite(padDeg) ? Math.max(0, padDeg) : 0;
  const where = `in_bbox(${j.pointField},${(s - p).toFixed(6)},${(w - p).toFixed(6)},${(n + p).toFixed(6)},${(e + p).toFixed(6)})`;
  return `${j.dataset}/exports/geojson?where=${encodeURIComponent(where)}&select=${encodeURIComponent(j.selectFields.join(','))}`;
}

/**
 * Export body → GeoJSON FeatureCollection, or **null** for anything that is not one (an error
 * JSON, an HTML page, an empty body). null is UNKNOWN — the caller counts it as a tile ERROR and
 * never as "no buildings here"; a genuine `{features: []}` is returned as-is (a real EMPTY).
 */
export function parseOdsGeojson(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  try {
    const j = JSON.parse(text);
    return j && j.type === 'FeatureCollection' && Array.isArray(j.features) ? j : null;
  } catch { return null; }
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
 * The building COMPONENTS in an export collection for jurisdiction `j`: one per feature whose
 * `footprint_type` is an included type, with numeric elevations (null where the source is null —
 * never coerced to 0) and a centroid taken from `geo_point_2d` (the portal's own) or, failing that,
 * the ring mean. Features with no usable ring are dropped (they cannot be matched either way).
 */
export function odsComponents(fc, j) {
  const out = [];
  for (const f of fc?.features ?? []) {
    const p = f?.properties ?? {};
    if (!j.includeTypes.includes(p[j.typeField])) continue;
    const ring = exteriorRing(f.geometry);
    if (!ring) continue;
    let cx = num(p[j.pointField]?.lon), cy = num(p[j.pointField]?.lat);
    if (cx === null || cy === null) {
      cx = 0; cy = 0;
      for (const [x, y] of ring) { cx += x; cy += y; }
      cx /= ring.length; cy /= ring.length;
    }
    out.push({
      structureId: String(p.structure_id ?? ''),
      type: p[j.typeField],
      roofType: typeof p.roof_type === 'string' ? p.roof_type : null,
      ring, cx, cy,
      footprintMax: num(p.footprint_max_elevation), footprintMin: num(p.footprint_min_elevation),
      structureMax: num(p.structure_max_elevation), structureMin: num(p.structure_min_elevation),
      footprintExtrusion: num(p.footprint_extrusion), structureExtrusion: num(p.structure_extrusion),
    });
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

/** ONE height (m above the structure base) for a set of matched components, or null. */
function heightOfComponents(comps) {
  const tops = comps.map((c) => c.footprintMax).filter((v) => v !== null);
  const bases = comps.map((c) => c.structureMin).filter((v) => v !== null);
  if (tops.length && bases.length) return { height: Math.max(...tops) - Math.min(...bases), rule: 'max(footprint_max)−min(structure_min)' };
  const ext = comps.map((c) => c.structureExtrusion).filter((v) => v !== null);
  if (ext.length) return { height: Math.max(...ext), rule: 'max(structure_extrusion)' };
  return null;
}

/**
 * The measured height for ONE OSM footprint (`ext` ring + `interiors`, centroid `clon,clat`) from
 * the jurisdiction's components, or **null** when nothing matches or the value is implausible.
 *   1. 'centroid-in'      — components whose centroid lies inside the footprint: the building's
 *                           roof-component stack (Eureka = 11 components) collapses to
 *                           max(footprint_max) − min(structure_min). A footprint that covers only a
 *                           podium gets the podium's top, not the tower's — the matched set decides.
 *   2. 'contains-centroid' — no component centroid inside (the OSM footprint is smaller than the
 *                           component, or a courtyard block): the component whose ring contains the
 *                           OSM centroid, taking the tallest such component.
 * Never a neighbour's height, never a default: no match → null → the footprint keeps its OSM tags.
 */
export function auOpenHeightForFootprint(ext, interiors, clon, clat, components, j) {
  const inside = components.filter((c) => pointInFootprint(c.cx, c.cy, ext, interiors));
  let h = null, rule = null, matched = 0;
  if (inside.length) {
    const r = heightOfComponents(inside);
    if (r) { h = r.height; rule = `centroid-in · ${r.rule}`; matched = inside.length; }
  }
  if (h === null) {
    const containing = components.filter((c) => pointInRing(clon, clat, c.ring));
    if (containing.length) {
      const r = heightOfComponents(containing);
      if (r) { h = r.height; rule = `contains-centroid · ${r.rule}`; matched = containing.length; }
    }
  }
  if (h === null || !Number.isFinite(h)) return null;
  if (h < j.minPlausibleM || h > j.maxPlausibleM) return null;
  return { height: Number(h.toFixed(1)), matched, rule };
}
