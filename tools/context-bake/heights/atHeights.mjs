// ─────────────────────────────────────────────────────────────────────────────
// §BEV-ALS-NDSM (2026-09-05, lane HEIGHTS-AT-CZ-SI) — BEV **ALS DSM** − **ALS DTM** Höhenraster 1 m: the
// PURE, dependency-free half of the Austrian NATIONAL measured-height stamp. The network/raster half is
// `stampAtHeightsOnGeojsonseq` in heights/atHeightsStamp.mjs (the swiss/nl3dbagStamp precedent —
// heightSources.mjs is a many-lane file and vitest cannot import it, so every DECISION lives here as a
// total function of its arguments and is unit-tested by atHeights.spec.ts against VERBATIM feed slices).
//
// THE CHANNEL — LIVE-PROBED 2026-09-05, every number below is a measurement, not a reading:
//   • data.gv.at's CKAN API is GONE (…/katalog/api/3/action/package_search → HTTP 404 HTML on three
//     path variants), so the catalogue was read from BEV's own GeoNetwork instead:
//     POST data.bev.gv.at/geonetwork/srv/api/search/records/_search → 200, 723 hits for
//     "Oberflächenmodell OR DOM OR Geländemodell"; the ALS records carry
//     `MD_LegalConstraintsOtherConstraints` = "Für dieses Produkt gilt die Standardlizenz CC-BY-4.0"
//     + "Der öffentliche Zugang zu diesem Produkt unterliegt keinen Einschränkungen."
//   • ONE INSPIRE ATOM service feed lists every tile — KEYLESS:
//       https://data.bev.gv.at/geonetwork/srv/atom/describe/service?uuid=208cff7a-c8aa-42fe-bf4f-2b8156e37528
//     → 200 application/atom+xml, 1,972,349 B, 672 entries = 55 tiles × {DSM, DTM} × 6 Stichtage
//     (15.09.2019 / 2021 / 2022 / 2023 / 2024 / 2025; EVERY tile is present in EVERY Stichtag —
//     55/55 DSM and 55/55 DTM for 2025). Tiles are 50 km × 50 km on the EPSG:3035 (ETRS89-LAEA) grid,
//     named `CRS3035RES50000mN<northing>E<easting>` (the tile's lower-left corner in metres). An
//     entry's dataset feed (`<link rel="alternate" … href=…describe/dataset?…>`) carries ONE
//     `<link type="image/tiff" href="https://data.bev.gv.at/download/ALS/{DSM|DTM}/{YYYYMMDD}/
//     ALS_{DSM|DTM}_CRS3035RES50000mN…E….tif">`. "Stichtag = Erstellungsdatum … nicht ident mit dem
//     Aufnahme- bzw. Vermessungsdatum" (the entry's own summary): it is the ISSUE date of the national
//     mosaic, so the stamp picks the NEWEST Stichtag per tile. 4 Vienna-tile entries (2019 + 2025,
//     DSM + DTM) are saved VERBATIM inside __tests__/fixtures/at-bev-als-atom-service-feed-vienna-tile-
//     2026-09-05.xml (the feed head kept, the other 668 entries dropped); the 2025 DSM dataset feed is
//     saved whole as at-bev-als-dsm-dataset-feed-N2800000E4750000-2026-09-05.xml.
//   • THE FILES ARE CLOUD-OPTIMISED BigTIFFs — read by HTTP RANGE, never downloaded whole:
//       ALS_DSM_CRS3035RES50000mN2800000E4750000.tif (Vienna): HEAD 200 image/tiff; `curl -r 0-4095`
//       → **206**, bytes start `II+` (BigTIFF) + `GDAL_STRUCTURAL_METADATA … LAYOUT=IFDS_BEFORE_DATA`
//       (the COG signature). geotiff.js `fromUrl`: 9 IFDs (50001² · 25000² · 12500² · 6250² · 3125² ·
//       1562² · 781² · 390² · 195²), 512 × 512 internal tiles, Compression 5 (LZW), Float32,
//       GDAL_NODATA −9999, EPSG 3035, bbox [4749999.5, 2799999.5, 4800000.5, 2850000.5] (1 m, half-pixel
//       registered), header open 0.8 s (DSM) / 1.2 s (DTM). The DTM file has the identical layout.
//     A 301 × 301 m window over Stephansdom read in 0.89 s (DSM) + 0.78 s (DTM) → nDSM p10 0.0 · p50
//     20.5 · p90 30.6 · **max 132.5 m** (the Südturm is 136 m), 0 nodata px. DSM 203.4 / DTM 173.3 m
//     at the window corner — orthometric (Adria) on both, so DSM − DTM is datum-free height above ground.
//   • ⚠ ALS DSM is ALL sursol (vegetation too) — P90 over the ERODED footprint interior, the DK/FR/CH
//     mitigation. Coverage is the whole country (55 tiles); a footprint whose window is all −9999 is a
//     VOID (abroad — Bratislava's side of the Vienna tile), never an error.
//
// WHAT WAS ALSO PROBED AND IS NOT THE CHANNEL (so nobody rebuilds it):
//   • Wien `ogdwien:FMZKBKMOGD` (Baukörpermodell, data.wien.gv.at/daten/geo WFS 1.1.0, CC BY 4.0) IS a
//     real LoD1 vector: 283 features / 256 KB / 1.6 s over Stephansplatz with O_KOTE (top) and
//     HOEHE_DGM (ground) → O_KOTE − HOEHE_DGM p10 6.1 · p50 25.1 · p90 33.9 · max 136.1 m (Stephansdom);
//     F_KLASSE 11 Gebäude / 12 Überbauung / 13 Flugdach / 82 Telefonzelle / 86 Portal; ⚠ its BBOX is
//     LON,LAT even under WFS 1.1.0 (the LAT,LON order returned 0 features). Vienna-only — the BEV
//     nDSM covers Vienna AND Graz AND Linz from one channel, so the city vector is not wired; it is the
//     named cross-check (136.1 vs 132.5 m at the same tower).
//   • Graz: geodaten.graz.at ArcGIS `OGD/OGD_WFS` = 46 POI/administrative layers, no building heights.
//   • Steiermark: gis.stmk.gv.at `OGD/ALSHoeheninformation_1m_UTM33N` is a **MapServer** (rendered
//     PNG/JPG, "Map,Query,Data"; its own description says the WCS is capped 10,000²) — not a
//     float-sampling endpoint; the BEV COG is the Land's own ALS data anyway (the feed summary:
//     "Kooperationsprodukt … des Bundes und der Länder").
//   • Linz: data.linz.gv.at → 404; gis.ooe.gv.at unreachable (curl exit 6/0 B). Covered by BEV.
//   • BEV `/download/DGM/` → 403 (no listing); `/geoportal/` → 404; GeoNetwork `srv/eng/q` → 500
//     "Service not found" — only the `_search` API and the ATOM feeds answer.
// ─────────────────────────────────────────────────────────────────────────────

export const BEV_ALS = {
  serviceFeed: 'https://data.bev.gv.at/geonetwork/srv/atom/describe/service?uuid=208cff7a-c8aa-42fe-bf4f-2b8156e37528',
  downloadHost: 'https://data.bev.gv.at/download/ALS/',
  nativeCrs: 'EPSG:3035',     // ETRS89-LAEA Europe — reproject.mjs / proj4 (added there for this stamp)
  tileM: 50000,               // BEV publishes on the 50 km LAEA grid; the tiling grid IS the publisher's grid
  resM: 1,                    // 1 m Höhenraster; IFD 0
  nodata: -9999,              // GDAL_NODATA on both products (probed)
  ifdCount: 9,                // 50001² … 195² (probed) — a header with fewer is a different product
  heightSourceTag: 'bev-als-ndsm',
  licence: 'CC BY 4.0 — "Für dieses Produkt gilt die Standardlizenz CC-BY-4.0" (BEV GeoNetwork record constraints, probed 2026-09-05)',
  attribution: '© BEV — ALS DSM / ALS DTM Höhenraster 1 m (CC BY 4.0)',
};

/** LAEA easting/northing (m) → the BEV 50 km tile key { e, n } (lower-left corner, m). Vienna
 *  (4794180, 2808775) → { e: 4750000, n: 2800000 }. */
export function laeaTileKey(X, Y, tileM = BEV_ALS.tileM) {
  return { e: Math.floor(X / tileM) * tileM, n: Math.floor(Y / tileM) * tileM };
}

/** Native LAEA [minX, minY, maxX, maxY] of a tile key. */
export function laeaTileBbox({ e, n }, tileM = BEV_ALS.tileM) {
  return [e, n, e + tileM, n + tileM];
}

/** BEV's tile token, as it appears in titles and file names: `CRS3035RES50000mN<n>E<e>`. */
export const bevTileToken = ({ e, n }, tileM = BEV_ALS.tileM) => `CRS3035RES${tileM}mN${n}E${e}`;

const decodeXml = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/**
 * The ATOM SERVICE feed → one row per dataset entry: `{ product: 'DSM'|'DTM', token, stichtag (ISO date),
 * datasetFeed (href) }`. Reads the `rel="alternate"` link's title (`INSPIRE Dataset ATOM feed: ALS DSM
 * CRS3035RES50000mN2800000E4750000 Höhenraster 1m Stichtag 15.09.2025`) and href. Returns **null** for a
 * body that is not the feed (an HTML error page, an empty body) — UNKNOWN, never "no tiles".
 */
export function parseBevServiceFeed(xml) {
  if (typeof xml !== 'string' || !/<feed[\s>]/.test(xml)) return null;
  const out = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const entry = m[1];
    const link = entry.match(/<link\b[^>]*rel="alternate"[^>]*>/);
    if (!link) continue;
    const title = link[0].match(/\btitle="([^"]*)"/)?.[1];
    const href = link[0].match(/\bhref="([^"]*)"/)?.[1];
    if (!title || !href) continue;
    const t = title.match(/ALS (DSM|DTM) (CRS3035RES\d+mN\d+E\d+) .*?Stichtag (\d{2})\.(\d{2})\.(\d{4})/);
    if (!t) continue;
    out.push({ product: t[1], token: t[2], stichtag: `${t[5]}-${t[4]}-${t[3]}`, datasetFeed: decodeXml(href) });
  }
  return out;
}

/** The NEWEST-Stichtag entry for one product over one tile, or **null** when the feed lists none
 *  (the collection is complete, so an absent tile is abroad / sea — a VOID, decided by the caller). */
export function pickBevDataset(entries, product, token) {
  let best = null;
  for (const e of entries ?? []) {
    if (e.product !== product || e.token !== token) continue;
    if (!best || e.stichtag > best.stichtag) best = e;
  }
  return best;
}

/**
 * The ATOM DATASET feed → the GeoTIFF href (`<link type="image/tiff" href=…>`), or **null** when the
 * body carries none. Never constructs the URL from the token: the date folder is the feed's to name.
 */
export function parseBevDatasetFeed(xml) {
  if (typeof xml !== 'string' || !/<feed[\s>]/.test(xml)) return null;
  const m = xml.match(/<link\b[^>]*type="image\/tiff"[^>]*>/);
  const href = m?.[0].match(/\bhref="([^"]*)"/)?.[1];
  return href ? decodeXml(href) : null;
}

/**
 * Pixel window [x0, y0, x1, y1] (IFD-0 pixel coordinates, top-left origin) covering the native
 * [minX, minY, maxX, maxY] box inside a raster whose IFD-0 bbox is `bboxNative` at `resM`. Clamped to the
 * image; returns **null** when the box lies entirely outside (a different tile). The returned `bboxNative`
 * is the window's OWN georeference, so the shared sampler reads it like any other raster.
 */
export function laeaWindow(bboxNative, [minX, minY, maxX, maxY], { width, height, resM = BEV_ALS.resM } = {}) {
  const [rx0, ry0, rx1, ry1] = bboxNative;
  const x0 = Math.max(0, Math.floor((minX - rx0) / resM)), x1 = Math.min(width, Math.ceil((maxX - rx0) / resM));
  const y0 = Math.max(0, Math.floor((ry1 - maxY) / resM)), y1 = Math.min(height, Math.ceil((ry1 - minY) / resM));
  if (x1 <= x0 || y1 <= y0) return null;
  return { window: [x0, y0, x1, y1], width: x1 - x0, height: y1 - y0, bboxNative: [rx0 + x0 * resM, ry1 - y1 * resM, rx0 + x1 * resM, ry1 - y0 * resM] };
}

/** Replace the −9999 sentinel (and any non-finite value) with NaN IN PLACE; returns the count. Same reason
 *  as heights/mnhFr.mjs: the shared bilinear sampler would otherwise BLEND a −9999 edge into a plausible metre. */
export function maskBevNodata(values, nodata = BEV_ALS.nodata) {
  let masked = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === nodata || !Number.isFinite(v)) { values[i] = NaN; masked++; }
  }
  return masked;
}

// ─────────────────────────────────────────────────────────────────────────────
// §AT-CITY-BBOXES — the `austria` national row's stamp working set (§HEIGHT-STAMP-BUDGET / L-659).
// Footprints outside these bboxes stream through with their original OSM tags — never a fabricated
// height. Each bbox costs ≈ its populated 0.01° cells × 2 COG window reads (~0.8 s each at 1 m, probed
// on a 301 m window; a 0.01° cell is ~740 × 1,110 m) after a one-off ATOM lookup per 50 km tile.
// terrain.mjs has NO `at` city rows (only the national `austria` row, probe Vienna 16.37,48.21), so
// atHeights.spec.ts pins that every bbox lies INSIDE the bake.mjs `austria` row and that the CI
// spot-check point (Stephansplatz) lies inside `vienna`.
// ─────────────────────────────────────────────────────────────────────────────
export const AT_CITY_BBOXES = [
  // city         [w, s, e, n] (WGS84, osmium -b order)
  { city: 'vienna',    bbox: [16.30, 48.15, 16.45, 48.26] },   // Stephansplatz 16.3725,48.2086 (CI gate row)
  { city: 'graz',      bbox: [15.38, 47.03, 15.48, 47.10] },
  { city: 'linz',      bbox: [14.25, 48.27, 14.34, 48.33] },
  { city: 'salzburg',  bbox: [13.01, 47.78, 13.08, 47.83] },
  { city: 'innsbruck', bbox: [11.35, 47.25, 11.43, 47.29] },
];
