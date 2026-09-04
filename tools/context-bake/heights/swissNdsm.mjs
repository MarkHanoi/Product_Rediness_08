// ─────────────────────────────────────────────────────────────────────────────
// §SWISS-NDSM (2026-09-04, lane HEIGHTS-EVERYWHERE round 2) — swisstopo swissSURFACE3D Raster (DSM)
// − swissALTI3D (DTM): the PURE, dependency-free half of the Swiss national measured-height stamp.
//
// WHY THIS FILE IS SEPARATE FROM heightSources.mjs — the same reason as heights/mnhFr.mjs: vitest
// cannot import heightSources.mjs, so every DECISION the stamp makes (tile keying, asset selection,
// STAC URL shape, the city working set) lives here as a total function of its arguments and is
// unit-tested; the network + raster half (`stampSwissHeightsOnGeojsonseq`) imports these.
//
// THE CHANNEL — LIVE-PROBED 2026-09-04, every number below is a measurement, not a reading:
//   • data.geo.admin.ch is an OBJECT STORE behind CloudFront, not an OGC server: the WCS shape the
//     2026-07-26 draft assumed answers HTTP 404 NoSuchKey (probed 2026-07-27). The data IS reachable
//     KEYLESSLY through STAC: `/api/stac/v0.9/collections/<id>/items?bbox=w,s,e,n` → one item per
//     1 km × 1 km LV95 tile, id `<product>_<year>_<E>-<N>` (E,N = km of EPSG:2056 easting/northing,
//     e.g. 2683-1247 = Zürich Hauptbahnhof), each with per-resolution COG assets.
//   • DSM  ch.swisstopo.swisssurface3d-raster — asset `…_0.5_2056_5728.tif` ONLY (no 2 m sibling is
//     published). 2000 × 2000 Float32, LZW, 512-px internal tiles, GDAL nodata −9999, 13.5 MB, THREE
//     IFDs: 2000 / 1000 / 500 px — i.e. COG overviews at 0.5 / 1 / 2 m. Range requests honoured
//     (`curl -r 0-1023` → HTTP 206 Partial Content, `Server: AmazonS3` via CloudFront). A 400×400 px
//     window read off IFD 0 took 1.15 s; the same ground off the coarsest IFD 0.53 s.
//   • DTM  ch.swisstopo.swissalti3d — assets `…_0.5_2056_5728.tif` (15.9 MB, 128-px tiles, 4 IFDs) AND
//     `…_2_2056_5728.tif` (1.0 MB, 500 × 500). Bare earth varies slowly under a footprint, so the
//     stamp reads the 2 m file WHOLE (one ~1 MB GET) and the DSM at its 1 m OVERVIEW (IFD 1, ~1000 ×
//     1000 px, range-read) — the same 1 m sampling grid the FR MNH and DK DHM stamps use, at roughly
//     a quarter of the bytes a full-resolution read would cost.
//   • Vertical datum 5728 = LN02 on BOTH products, so DSM − DTM is datum-free height above ground.
//     Zürich HB tile probe: DSM p50 425.5 m · DTM p50 412.3 m (orthometric), i.e. plausible 10–15 m
//     roofs over ~410 m ground. ⚠ swissSURFACE3D is ALL sursol (vegetation too) — P90 over the eroded
//     interior, exactly the DK/FR mitigation.
//   • Licence — VERIFIED from the text, not the port: swisstopo "Terms of use for free geodata and
//     geoservices" (swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices; the STAC
//     collection's `license` field reads `proprietary` and links ogd-conditions): "The free geodata and
//     geoservices of swisstopo may be used, distributed and made accessible. Furthermore, they may be
//     enriched and processed and also used commercially. A reference to the source is mandatory …
//     'Federal Office of Topography swisstopo' / '©swisstopo'." No key, no account, no repo secret.
//   • Coverage: the collection extent is the whole country (5.95–10.50 E, 45.72–47.82 N); a tile with
//     no item (lake, foreign territory) is reported as a VOID, not an error — failure and empty stay
//     different values (§CONTEXT-DATA-HONESTY).
// ─────────────────────────────────────────────────────────────────────────────

export const SWISS_NDSM = {
  stacDsm: 'https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swisssurface3d-raster',
  stacDtm: 'https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissalti3d',
  dsmResToken: '_0.5_2056_',  // the ONLY published swissSURFACE3D Raster resolution (probed 2026-09-04)
  dtmResToken: '_2_2056_',    // swissALTI3D 2 m — 1.0 MB whole; the 0.5 m sibling is 15.9 MB for no gain under a footprint
  dsmOverviewLevel: 1,        // COG IFD 1 = 1 m (probed: IFDs 2000 / 1000 / 500 px)
  nativeCrs: 'EPSG:2056',     // LV95 — oblique Mercator on Bessel, NOT a UTM zone → reproject.mjs / proj4
  tileM: 1000,                // swisstopo publishes on the 1 km LV95 grid; the tiling grid IS the publisher's grid
  nodata: -9999,              // GDAL_NODATA on both products (probed)
  heightSourceTag: 'swisstopo-ndsm',
  attribution: '© swisstopo — swissSURFACE3D Raster & swissALTI3D (free geodata terms; source reference mandatory)',
};

/** LV95 easting/northing (m) → the swisstopo 1 km tile key { e, n } (km), e.g. 2683400,1247900 → { e: 2683, n: 1247 }. */
export function lv95TileKey(X, Y, tileM = SWISS_NDSM.tileM) {
  return { e: Math.floor(X / tileM), n: Math.floor(Y / tileM) };
}

/** Native LV95 [minX, minY, maxX, maxY] of a tile key. */
export function lv95TileBbox({ e, n }, tileM = SWISS_NDSM.tileM) {
  return [e * tileM, n * tileM, (e + 1) * tileM, (n + 1) * tileM];
}

/**
 * The swisstopo item-id / asset-name fragment for a tile key: `_<E>-<N>_`. Zürich HB → `_2683-1247_`.
 * Matched against asset hrefs, never against item ids alone, because a bbox query returns EVERY tile
 * touching the box (edge tiles included) and only the href carries both the key and the resolution.
 */
export const swissTileToken = ({ e, n }) => `_${e}-${n}_`;

/** STAC /items URL for a collection over a WGS84 [w,s,e,n] box (lon,lat — STAC is always CRS84). */
export function swissStacItemsUrl(collectionUrl, [w, s, e, n], limit = 10) {
  return `${collectionUrl}/items?bbox=${w},${s},${e},${n}&limit=${limit}`;
}

/**
 * Pick, from a STAC FeatureCollection, the COG href for ONE tile at ONE resolution — the asset whose
 * href contains BOTH the tile token and the resolution token and ends in `.tif`. Returns **null** when
 * nothing matches: the caller decides whether that is a VOID (no coverage — the collection is
 * complete, so an absent tile is lake/abroad) or an ERROR (the query failed). Never guesses a URL —
 * swisstopo's per-year item ids (`swissalti3d_2019_…` vs `_2020_…`) make a constructed href a lie.
 */
export function pickCogAsset(collection, tileKey, resToken) {
  const feats = Array.isArray(collection?.features) ? collection.features : [];
  const tok = swissTileToken(tileKey);
  for (const f of feats) {
    for (const a of Object.values(f?.assets ?? {})) {
      const href = a?.href;
      if (typeof href !== 'string' || !/\.tif$/i.test(href)) continue;
      if (href.includes(tok) && href.includes(resToken)) return href;
    }
  }
  return null;
}

/**
 * STAC body → FeatureCollection, or **null** for a body that is not one (an exception document, an
 * HTML error page, an empty body). The caller must treat null as UNKNOWN, never as "no tiles here"
 * (the L-422/457/467/469 failure-vs-empty family).
 */
export function parseStacCollection(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  try {
    const j = JSON.parse(text);
    return j && Array.isArray(j.features) ? j : null;
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// §SWISS-CITY-BBOXES — the `switzerland` national row's stamp working set (the CH analogue of
// MDS_CITY_BBOXES / DHM_CITY_BBOXES / MNH_FR_CITY_BBOXES, mandatory for the same reason: §HEIGHT-
// STAMP-BUDGET / L-659 — a whole-country join with no bounded area holds every Swiss footprint in the
// V8 heap). Footprints outside these bboxes stream through with their original OSM tags — never a
// fabricated height. Each bbox costs ≈ its LV95 1 km tile count in (2 STAC + 2 COG) fetches.
//
// PROVENANCE: zurich/geneva/bern are BYTE-IDENTICAL to terrain.mjs's `ch` REGIONS rows AND to the
// bake.mjs city rows they replaced on 2026-09-02 (git 28e82b87 → 5faa71ba) — the §MDS-BBOX-MUST-
// COVER-THE-REGION invariant, pinned by swissNdsm.spec.ts, so the baked terrain and the stamped
// heights cover the same ground. The other six are tight metro-core extents centred on the city.
// ─────────────────────────────────────────────────────────────────────────────
export const SWISS_CITY_BBOXES = [
  // city          [w, s, e, n] (WGS84, osmium -b order)                      ≈ 1 km tiles
  { city: 'zurich',     bbox: [8.45, 47.34, 8.62, 47.43] },   // = terrain.mjs ch row = former bake.mjs row · ~13×10
  { city: 'geneva',     bbox: [6.09, 46.17, 6.18, 46.25] },   // = terrain.mjs ch row = former bake.mjs row · ~7×9
  { city: 'bern',       bbox: [7.40, 46.93, 7.48, 46.99] },   // = terrain.mjs ch row = former bake.mjs row · ~6×7
  { city: 'basel',      bbox: [7.55, 47.53, 7.63, 47.59] },
  { city: 'lausanne',   bbox: [6.58, 46.50, 6.67, 46.55] },
  { city: 'winterthur', bbox: [8.68, 47.47, 8.76, 47.52] },
  { city: 'luzern',     bbox: [8.27, 47.02, 8.34, 47.07] },
  { city: 'stgallen',   bbox: [9.33, 47.40, 9.42, 47.45] },
  { city: 'lugano',     bbox: [8.93, 45.98, 8.98, 46.02] },
];
