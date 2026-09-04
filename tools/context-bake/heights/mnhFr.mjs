// ─────────────────────────────────────────────────────────────────────────────
// §MNH-FR (2026-09-04, lane HEIGHTS-EVERYWHERE) — IGN LiDAR HD **MNH** (Modèle Numérique de
// Hauteur): the PURE, dependency-free half of the French national measured-height stamp.
//
// WHY THIS FILE IS SEPARATE FROM heightSources.mjs. `heightSources.mjs` cannot be imported from a
// vitest spec (vite's transform rejects it — see mdsBboxCoversTerrainRegion.spec.ts, which reads it
// as TEXT for exactly that reason). Everything here is a total function of its arguments — URL
// builders, pixel-budget arithmetic, the hits-parser, the nodata mask, the city working set — so
// the join's *decisions* get real unit tests instead of a 25-minute bake as their only harness.
// The network + raster half (`stampMnhFrHeightsOnGeojsonseq`) lives in heightSources.mjs and
// imports these.
//
// THE CHANNEL — LIVE-PROBED 2026-09-04, every number below is a measurement, not a reading:
//   • Raster: Géoplateforme WMS-Raster `IGNF_LIDAR-HD_MNH_ELEVATION.ELEVATIONGRIDCOVERAGE.WGS84G`
//     (data.geopf.fr/wms-r/wms), GetMap in EPSG:4326 with FORMAT=image/geotiff → HTTP 200
//     `image/geotiff`, ONE Float32 band, GDAL nodata −9999, 3.1 MB / 880×890 px in 0.95 s over
//     Île de la Cité; p50 3.8 m · p90 23.6 m · max 87.8 m (Notre-Dame). ⭐ **The pixel value IS the
//     height above ground** — MNH = MNS − MNT precomputed by IGN, so this stamp NEVER differences
//     two rasters (E5 §G.1 A8; the bake row says the same). Service MaxWidth/MaxHeight = 5010.
//     The LAMB93 sibling layer (EPSG:2154, the native 0.5 m grid) is the one IGN's own per-dalle
//     download URLs point at; the WGS84G layer is chosen here because the whole ES-MDS sampler
//     (`mdsHeightForBuilding`) already works on a degree-gridded raster with NO projector.
//   • Coverage index: WFS `IGNF_MNH-LIDAR-HD:dalle` (data.geopf.fr/wfs/ows) — one feature per
//     PUBLISHED 1 km × 1 km MNH dalle (`name` = LHD_FXX_XXXX_YYYY_MNH_O_0M50_LAMB93_IGN69, `url`,
//     `timestamp`). RESULTTYPE=hits over a bbox is a ~100 ms coverage probe. The founder's FR review
//     (§10.1) marked tile-level coverage `not-verified`; it is now measured, and it is BIMODAL:
//         paris 268 · lyon 149 · nantes 100 · marseille 116 · toulouse 120 · strasbourg 94 ·
//         montpellier 120 · bordeaux 114 · nice 64 · rennes 122 · grenoble 81 ·
//         rural Touraine 70 · rural Provence 84   — and —   lille 0 · rural Creuse 0 · rural Bretagne 0
//     Cross-checked against the raster itself (coarse GetMap, nodata fraction): 0.000 everywhere
//     the index has dalles (Marseille 0.153 / Nice 0.050 = SEA inside the bbox), 1.000 where it
//     has none. Two independent sources, one verdict: where LiDAR HD is published it is complete;
//     where it is not, there is NOTHING — no partial, no stale product to fall back to. That is why
//     the stamp pre-checks the index per stamp area and SKIPS a zero-dalle area (saves the bytes,
//     and reports the skip by name) while treating a FAILED hits request as UNKNOWN → sample anyway.
//     Failure and empty are different values (§CONTEXT-DATA-HONESTY).
//   • Licence: Licence Ouverte Etalab 2.0 — explicitly usable for commercial deliverables with the
//     attribution "IGN – Programme LiDAR HD" (FR-FOUNDER-BLOCKER-REVIEW §10.1; data.gouv.fr
//     dataset `mnh-lidar-hd`, licence `lov2`).
//   • ⚠ MNH is ALL sursol — vegetation as well as buildings (unlike ES `mdsn_e025`, which is the
//     building class only). Same caveat as DK `dhm_overflade` and CH swissSURFACE3D, handled the
//     same way: P90 over the footprint's ERODED interior, holes excluded. A canopy overhanging a low
//     annexe can still bias one footprint upward; it cannot invent a building.
// ─────────────────────────────────────────────────────────────────────────────

export const MNH_FR = {
  wms: 'https://data.geopf.fr/wms-r/wms',
  layer: 'IGNF_LIDAR-HD_MNH_ELEVATION.ELEVATIONGRIDCOVERAGE.WGS84G',
  format: 'image/geotiff',
  crs: 'EPSG:4326',
  nodata: -9999,       // GDAL_NODATA tag on every served GeoTIFF (probed).
  nativeResM: 0.5,     // 50 cm source grid; the WMS resamples to whatever WIDTH/HEIGHT is asked.
  maxPx: 5010,         // service MaxWidth / MaxHeight (GetCapabilities).
  wfs: 'https://data.geopf.fr/wfs/ows',
  dalleTypeName: 'IGNF_MNH-LIDAR-HD:dalle',
  heightSourceTag: 'ign-lidarhd-mnh',
  attribution: 'IGN – Programme LiDAR HD (Licence Ouverte Etalab 2.0)',
};

export const M_PER_DEG_LAT = 111320;
/** Metres per degree of longitude at latitude `lat` (equirectangular, plenty for a pixel budget). */
export const mPerDegLon = (lat) => M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);

/**
 * Pixel dimensions for a GetMap over `[w,s,e,n]` at ~`resM` metres per pixel, capped at `maxPx`
 * on each axis (the service refuses more). Never below 2 px so a degenerate box still decodes.
 */
export function mnhFrPxDims([w, s, e, n], resM = 1.0, maxPx = MNH_FR.maxPx) {
  const midLat = (s + n) / 2;
  const widthM = Math.abs(e - w) * mPerDegLon(midLat);
  const heightM = Math.abs(n - s) * M_PER_DEG_LAT;
  const width = Math.max(2, Math.min(maxPx, Math.round(widthM / resM)));
  const height = Math.max(2, Math.min(maxPx, Math.round(heightM / resM)));
  return { width, height };
}

/**
 * WMS 1.3.0 GetMap URL for the MNH raster over a WGS84 `[w,s,e,n]` box.
 * ⚠ AXIS ORDER: WMS 1.3.0 + EPSG:4326 means BBOX is **lat,lon** (miny,minx,maxy,maxx) — the
 * opposite of the WFS/CRS:84 lon,lat convention two lines away in heightSources.mjs. Live-verified
 * 2026-09-04: `BBOX=48.852,2.346,48.856,2.352` returned a GeoTIFF whose georeferenced extent read
 * back as [2.346, 48.852, 2.352, 48.856]. Swapping the order does not error — it silently returns
 * a raster of the Indian Ocean, which is exactly the class of defect a unit test must pin.
 */
export function mnhFrGetMapUrl([w, s, e, n], { width, height }) {
  return `${MNH_FR.wms}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${MNH_FR.layer}&STYLES=` +
    `&CRS=${MNH_FR.crs}&BBOX=${s},${w},${n},${e}&WIDTH=${width}&HEIGHT=${height}` +
    `&FORMAT=${encodeURIComponent(MNH_FR.format)}`;
}

/** WFS 2.0 hits-only query: how many PUBLISHED MNH dalles intersect `[w,s,e,n]` (lon,lat BBOX). */
export function mnhFrDalleHitsUrl([w, s, e, n]) {
  return `${MNH_FR.wfs}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=${MNH_FR.dalleTypeName}` +
    `&SRSNAME=EPSG:4326&BBOX=${w},${s},${e},${n},EPSG:4326&RESULTTYPE=hits`;
}

/**
 * `numberMatched` out of a WFS 2.0 hits response. Returns **null, never 0,** when the text is not a
 * hits document (an exception report, an HTML error page, an empty body). The caller must treat
 * null as UNKNOWN and go on to sample the raster — collapsing "the index refused us" into "there
 * are no dalles" is the failure-vs-empty conflation this repo keeps re-learning (L-422/457/467/469).
 */
export function parseWfsHits(text) {
  if (typeof text !== 'string') return null;
  const m = text.match(/numberMatched="(\d+)"/);
  return m ? Number(m[1]) : null;
}

/** Three-valued on purpose: 'covered' | 'none' | 'unknown'. Only 'none' may skip work. */
export function classifyDalleCoverage(hits) {
  if (hits === null || hits === undefined || !Number.isFinite(hits)) return 'unknown';
  return hits > 0 ? 'covered' : 'none';
}

/**
 * Replace the nodata sentinel (and any non-finite value) with NaN, IN PLACE. Returns the count.
 * WHY: the shared bilinear sampler (`sampleRasterNative`) recognises nodata only as |v| > 1e6 (the
 * DK DHM convention) or non-finite. IGN's −9999 is neither, so an unmasked coverage edge would be
 * BLENDED into its neighbours (0.999·20 m + 0.001·(−9999) ≈ 10 m) and read as a plausible height.
 * Masked to NaN, the sampler falls back to the mean of the VALID corners, or NaN → the sample is
 * dropped and the footprint is judged on what was actually measured.
 */
export function maskNodata(values, nodata = MNH_FR.nodata) {
  let masked = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === nodata || !Number.isFinite(v)) { values[i] = NaN; masked++; }
  }
  return masked;
}

// ─────────────────────────────────────────────────────────────────────────────
// §MNH-FR-CITY-BBOXES — the `france` national row's stamp working set (the FR analogue of
// MDS_CITY_BBOXES / DHM_CITY_BBOXES, and mandatory for the same reason: §HEIGHT-STAMP-BUDGET /
// L-659 — a whole-country join that declares no bounded area holds every French footprint in the V8
// heap and dies). Footprints OUTSIDE these bboxes stream through the join with their original OSM
// tags — never a fabricated height. Each bbox is used BOTH as a priority area (stamped first,
// uncapped) AND as the retained working set.
//
// PROVENANCE: `paris` and `lyon` are BYTE-IDENTICAL to the bake.mjs city rows and to terrain.mjs's
// `fr` REGIONS rows (the §MDS-BBOX-MUST-COVER-THE-REGION invariant, pinned by
// mnhFrCityBboxes.spec.ts) — so folding the paris/lyon city rows into `france` loses no ground. The
// other rows are tight metro-core extents (span ≤ 0.25°) centred on the commune. Dalle counts as
// measured 2026-09-04 live in the header comment above, NOT as a field: a stored count is inert
// metadata that nothing reads and everything trusts (§BAKED-FLAG-IS-NOT-EVIDENCE); the stamp
// re-measures coverage on every run and reports it.
//
// `lille` IS listed although it had ZERO published dalles on 2026-09-04: the pre-check skips it for
// the cost of one hits request, and the moment IGN publishes the Nord dalles the next re-bake
// stamps it with no code change. Listing a not-yet-covered city costs nothing; forgetting a covered
// one is a permanent silent hole (the §MURCIA-HEIGHT-STAMP-GAP lesson).
// ─────────────────────────────────────────────────────────────────────────────
export const MNH_FR_CITY_BBOXES = [
  // city            [w, s, e, n] (WGS84, osmium -b order)
  { city: 'paris',       bbox: [2.22, 48.80, 2.47, 48.91] },   // = bake.mjs `paris` row = terrain.mjs fr row
  { city: 'lyon',        bbox: [4.78, 45.70, 4.92, 45.80] },   // = bake.mjs `lyon` row  = terrain.mjs fr row
  { city: 'marseille',   bbox: [5.32, 43.25, 5.45, 43.35] },
  { city: 'toulouse',    bbox: [1.38, 43.55, 1.50, 43.65] },
  { city: 'nice',        bbox: [7.20, 43.68, 7.30, 43.74] },
  { city: 'nantes',      bbox: [-1.62, 47.18, -1.50, 47.26] },
  { city: 'strasbourg',  bbox: [7.70, 48.53, 7.80, 48.62] },
  { city: 'montpellier', bbox: [3.80, 43.57, 3.93, 43.65] },
  { city: 'bordeaux',    bbox: [-0.65, 44.80, -0.52, 44.88] },
  { city: 'rennes',      bbox: [-1.75, 48.07, -1.60, 48.15] },
  { city: 'grenoble',    bbox: [5.68, 45.15, 5.78, 45.22] },
  { city: 'lille',       bbox: [2.98, 50.58, 3.14, 50.68] },   // 0 dalles on 2026-09-04 — pre-check skips it until IGN publishes
];
