// ─────────────────────────────────────────────────────────────────────────────
// §US-3DEP-HAG (L-13314, 2026-09-11, lane DELAWARE-HEIGHTS) — USGS 3DEP LiDAR HEIGHT-ABOVE-GROUND, read
// from Microsoft Planetary Computer's PDAL-derived Cloud-Optimised GeoTIFFs: the PURE, dependency-free
// half of the US chain's LiDAR FILL tier.
//
// WHY THIS FILE IS SEPARATE FROM heightSources.mjs — the same reason as usOpenHeights.mjs / swissNdsm.mjs:
// vitest cannot import heightSources.mjs, so every DECISION the tier makes (which STAC item serves a
// point, the SAS-token freshness, the raster window, which pixels are inside the eroded footprint, the
// canopy guard, the percentile, what is plausible, the working set) is a total function of its
// arguments here and is unit-tested against VERBATIM live fixtures. The network + raster half is
// heights/us3depHagStamp.mjs; the tier runs INSIDE heights/usasNationalStamp.mjs, and the ONE function
// that decides which height a footprint wears is `usHeightDecision` in usOpenHeights.mjs.
//
// ── THE GAP IT EXISTS FOR ────────────────────────────────────────────────────────────────────────────
// The founder's demo site (38.781987, -75.089744 — Cape Henlopen / Lewes, SUSSEX County, Delaware) read
// verdict=unmeasured, solidRenderFraction 0, median 9 m on the shipped tiles (probe.mjs, 2026-09-11,
// 48 footprints). The only US height source wired there, FEMA/ORNL USA Structures, answered the demo bbox
// [-75.099744,38.771987,-75.079744,38.791987] with 41 structures and `HEIGHT IS NOT NULL` → {"count":0}.
// The founder's county sources were probed the same day and NONE is reachable (US_DELAWARE_HEIGHT_ASSESSED
// below carries every HTTP answer): the Sussex Building_Footprints MapServer (FLOORS) answers HTTP 403
// (RedShield WAF, via CloudFront), the New Castle Structures layer (HEIGHT, NUM_STORIES) answers HTTP 471
// (Link11 WAF) — both from a residential egress, from Node's own TLS client, AND from a US cloud egress.
//
// ── THE CHANNEL — LIVE-PROBED 2026-09-11, every number a measurement ─────────────────────────────────
//   • STAC search planetarycomputer.microsoft.com/api/stac/v1/search?collections=3dep-lidar-hag
//     &bbox=<demo bbox> → HTTP 200, 44,515 B, 4 items, all `3dep:usgs_id` USGS_LPC_DE_Snds_2013_LAS_2015
//     (start_datetime 2013-12-17), assets.data = a COG on usgslidareuwest.blob.core.windows.net
//     (fixtures/us-pc-3dep-hag-stac-lewes-2026-09-11.json, verbatim). Over the whole delaware bake bbox:
//     310 items in ONE page (4,008,708 B); USGS_LPC_DE_Snds_2013_LAS_2015 = 119 items spanning
//     -75.843,38.402 → -75.040,39.758 and covers all nine sweep.mjs `delaware` points; the north tip is
//     USGS_LPC_DE_DelawareValley_HD_2015_LAS_2017 / USGS_LPC_MD_PA_SandySupp_2014_LAS_2016.
//   • The COG (…-hag-2m-14-9.tif, opened with geotiff 2.1.3 — the version context-bake.yml provisions):
//     3 IFDs, 1025 × 2049 px, 512² tiles, SampleFormat 3 / 32 bit (Float32), Compression 34887 (LERC,
//     decoded by geotiff's bundled `lerc`), GDAL_NODATA -9999, GeoKeys ProjectedCSTypeGeoKey 26918
//     "NAD83 / UTM zone 18N + NAVD88 height", resolution [2, -2]. Every overlapping project
//     (SandySupp_2014, DelawareValley_HD_2015, DelawareValleyHD_5A_2015, NJ_SalemCo_2009) is ALSO 26918,
//     2 m. A 300 × 300 window at the demo point read in 850 ms.
//   • The returns COGs (collection 3dep-lidar-returns, item ids "-returns-5m-", 5 m, Int16) carry the
//     LiDAR NumberOfReturns per cell — the canopy signature this tier's guard reads.
//   • Keyless: GET /api/sas/v1/token/<collection> → HTTP 200 {"msft:expiry": …, "token": "st=…&sig=…"},
//     anonymous, ~1 h lifetime (fixtures/us-pc-sas-token-3dep-lidar-hag-sig-redacted-2026-09-11.json —
//     `sig` REDACTED on purpose: a live SAS signature does not belong in a public repo).
//   • Licence: the collection's `license` link → usgs.gov "About 3DEP Products & Services" (USGS 3DEP
//     data are public domain); providers Landrush (processor) · USGS (producer, licensor) · Microsoft
//     (host, processor). Planetary Computer's own terms of use govern the hosted copy.
//
// ── §HAG-VALIDATION — what the tier is allowed to claim, from three INDEPENDENT references ───────────
// Same sampler (2 m pixel centres inside the 1 m-eroded ring), same day:
//   • BOSTON South End [-71.078,42.338,-71.068,42.345] vs BPDA BLDG_HGT_2010 (authority photogrammetric
//     model, per roof part), 1,494 parts:  HAG P90 median Δ +2.45 m (median |Δ| 2.47, p90 |Δ| 5.42, ≤3 m
//     66.4 %) · HAG P50 median Δ +1.71 (|Δ| 1.75, p90 3.14, ≤3 m 88.2 %) · USA Structures on the SAME
//     parts median Δ −0.40 (|Δ| 0.80, p90 3.50, ≤3 m 86.9 %).
//   • BROOKLYN [-73.965,40.615,-73.955,40.625] vs NYC height_roof (authority as-built/photogrammetric),
//     1,580 buildings: USA Structures median Δ −1.20 (|Δ| 1.40, ≤3 m 89.1 %). (HAG: the NJ_SdL5_2014 item's
//     bbox reaches the cell but its pixels are nodata there — 0 of 2,176 sampled; no reading claimed.)
//   • WILMINGTON [-75.5516,39.7409,-75.5416,39.7509] vs USA Structures, 361 buildings: HAG P90 +3.08,
//     HAG P50 +1.42 (|Δ| 1.56, ≤3 m 85.0 %).
// ⇒ THE PRODUCT READS HIGH. PDAL's writers.gdal output on HeightAboveGround behaves like a per-cell
//   maximum, so P90 of it double-counts the upward bias; P50 is the closer statistic and is what this
//   tier stamps. ⇒ AND USA STRUCTURES IS THE BETTER MEASUREMENT WHERE IT EXISTS (|Δ| 0.80 vs 1.75 m
//   against the Boston authority), which is why this is a FILL behind USAS and not a tier above it —
//   see US_HEIGHT_TIER_ORDER in usOpenHeights.mjs. No bias correction is applied: a number learned in
//   Boston and subtracted in Delaware would stop being a measurement ([[tolerance-from-measured-error]]).
//
// ── §CANOPY-GUARD — the demo site is a pine forest, and that is not a hypothetical ──────────────────
// Over 36 OSM footprints at the demo ring [-75.1000,38.7740,-75.0795,38.7900], UNGUARDED HAG P90 read
// ten `building=cabin` / `building:levels=1` footprints at 4.2 – 16.2 m (eight above 10 m): the Cape
// Henlopen canopy over single-storey cabins. Stamped under the measured marker they would render as SOLID
// 15 m blocks — the L-616 overstatement, at the founder's own site. The vendor classification cannot
// separate them: the 3dep-lidar-classification raster for these 2013 Sandy deliveries carries classes
// {1, 2, 17, …} and NO class 6 (Building) — 0 class-6 cells over 1,519 Boston parts, 361 Wilmington
// buildings and 36 Lewes footprints. The RETURNS raster does separate them: every canopy cabin's interior
// reads NumberOfReturns 2–4 (single-return share 0.00–0.45), every clean roof 0.72–1.00. Guard ≥ 0.75,
// P50 → 9 of 33 admitted at 3.8 – 4.6 m, every canopy cabin refused; at ≥ 0.5 a 12.9 m "shed" (share 0.50)
// got through, so 0.75 is the conservative cut. The guard does NOT move the accuracy (Boston ≥ 0.75 P50:
// median Δ +1.71, ≤3 m 89.3 %, 291 of 1,494 admitted) — it trades COVERAGE for canopy safety, which is the
// right trade for a fill tier. A footprint the guard refuses keeps its honest OSM tags: a cabin tagged
// `building:levels=1` stays `derived-levels` 3.2 m, which is correct, instead of a measured 15 m lie.
// ─────────────────────────────────────────────────────────────────────────────
import { pointInRing } from './usOpenHeights.mjs';

export const US_3DEP_HAG = {
  stacSearch: 'https://planetarycomputer.microsoft.com/api/stac/v1/search',
  sasToken: 'https://planetarycomputer.microsoft.com/api/sas/v1/token',
  collections: { hag: '3dep-lidar-hag', returns: '3dep-lidar-returns' },
  hagResolutionM: 2,            // proj:transform [2,0,…] / geotiff getResolution [2,-2] on every Delaware item (probed)
  returnsResolutionM: 5,        // "-returns-5m-" items (probed)
  nodata: -9999,                // GDAL_NODATA on the COG (probed); the STAC raster:bands says "nan" — both are masked
  erodeM: 1.0,                  // the DK / CH / FR / ES façade erosion (ndsmHeightForBuilding)
  percentile: 50,               // §HAG-VALIDATION: P50 median Δ +1.71 m vs P90 +2.45 m against the Boston authority
  minSamples: 4,                // the ndsmHeightForBuilding floor
  singleReturnMinShare: 0.75,   // §CANOPY-GUARD
  minPlausibleM: 2.0,           // a 0.0 m "building" is an earth-covered bunker or a demolished footprint (Fort Miles: P50 0)
  maxPlausibleM: 300,           // admits anything real in the United States east of the Rockies; a 400 m reading is noise
  sasRefreshMarginMs: 5 * 60_000,
  stacPageLimit: 500,
  heightSourceTag: 'us-3dep-hag-p50',
  measurement:
    'USGS 3DEP LiDAR Height-Above-Ground (PDAL smrf + hag_nn, 2 m COG, Microsoft Planetary Computer) — the P50 over the ' +
    '1 m-eroded footprint interior, admitted only where ≥ 75 % of the interior sits on single-return LiDAR cells. A real LiDAR ' +
    'measurement that reads HIGH against authority roof heights (Boston BPDA median Δ +1.71 m, ≤3 m 88 %); stamped only where the ' +
    'city channel and USA Structures left the footprint without a height.',
  licence: 'USGS 3DEP data — public domain (collection license link → usgs.gov "About 3DEP Products & Services"); hosted copy under the Microsoft Planetary Computer terms of use — probed 2026-09-11',
  attribution: 'U.S. Geological Survey 3D Elevation Program (3DEP) — HAG COGs processed by Landrush, hosted by Microsoft Planetary Computer',
};

/**
 * §US-3DEP-HAG-WORKING-SET — where the fill tier is ARMED. One row per bake region, each a stated decision
 * with its evidence, never "the whole country by default": the tier costs raster reads per populated cell,
 * and it was validated (§HAG-VALIDATION / §CANOPY-GUARD) for Delaware's projects specifically. A new row
 * needs its own coverage probe and its own canopy check before it is added.
 * `bbox` is BYTE-IDENTICAL to the bake.mjs `delaware` row (pinned by us3depHag.spec.ts), so the stamp
 * working set and the baked clip cover the same ground (§MDS-BBOX-MUST-COVER-THE-REGION).
 */
export const US_3DEP_HAG_BBOXES = [
  { region: 'delaware', bbox: [-75.79, 38.45, -74.98, 39.85],
    evidence: 'USGS_LPC_DE_Snds_2013_LAS_2015 (119 HAG items, -75.843,38.402 → -75.040,39.758) covers all nine sweep.mjs delaware points; ' +
      'USA Structures carries 0 heights in Sussex (demo bbox 41 structures / 0 heights). Validated 2026-09-11 (§HAG-VALIDATION, §CANOPY-GUARD).' },
];

/** Is (lon, lat) inside an armed working-set box? */
export function us3depHagCovers(lon, lat, boxes = US_3DEP_HAG_BBOXES) {
  for (const b of boxes) {
    const [w, s, e, n] = b.bbox;
    if (lon >= w && lon <= e && lat >= s && lat <= n) return true;
  }
  return false;
}

/** The armed boxes clipped to a bake region's bbox — [] when the region is not armed (no network at all). */
export function us3depHagAreasFor([bw, bs, be, bn], boxes = US_3DEP_HAG_BBOXES) {
  const out = [];
  for (const b of boxes) {
    const [w, s, e, n] = b.bbox;
    const x0 = Math.max(w, bw), y0 = Math.max(s, bs), x1 = Math.min(e, be), y1 = Math.min(n, bn);
    if (x1 > x0 && y1 > y0) out.push([x0, y0, x1, y1]);
  }
  return out;
}

/** STAC /search GET URL for one collection over a WGS84 [w,s,e,n] box (STAC bbox is always CRS84, lon first). */
export function us3depStacSearchUrl(collection, [w, s, e, n], limit = US_3DEP_HAG.stacPageLimit) {
  return `${US_3DEP_HAG.stacSearch}?collections=${encodeURIComponent(collection)}&bbox=${w},${s},${e},${n}&limit=${limit}`;
}

/**
 * A STAC search page → `{ items, next }`, or **null** for anything that is not one (an error document, an
 * HTML page, an empty body). null is UNKNOWN and the caller counts it as a FAILURE — never as "no LiDAR
 * here" (§CONTEXT-DATA-HONESTY). An item is kept only with a usable `.tif` data asset, a 4-number bbox and
 * a `3dep:usgs_id`; `next` is the page's rel=next href, or null.
 */
export function parse3depStacPage(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  let j;
  try { j = JSON.parse(text); } catch { return null; }
  if (!j || j.type !== 'FeatureCollection' || !Array.isArray(j.features)) return null;
  const items = [];
  for (const f of j.features) {
    const href = f?.assets?.data?.href;
    const p = f?.properties ?? {};
    const bbox = Array.isArray(f?.bbox) && f.bbox.length === 4 && f.bbox.every(Number.isFinite) ? f.bbox : null;
    if (typeof href !== 'string' || !/\.tif$/i.test(href) || !bbox || typeof p['3dep:usgs_id'] !== 'string') continue;
    // ⚠ `raster:bands` is an OBJECT on Planetary Computer's 3DEP items, not the STAC-standard ARRAY — measured
    // on the verbatim fixture (an array-only reader returned `unit: null` for every Delaware item). Accept both.
    const rb = p['raster:bands'];
    items.push({
      id: String(f.id), usgsId: p['3dep:usgs_id'], start: p.start_datetime ?? p.datetime ?? null,
      bbox, href, transform: Array.isArray(p['proj:transform']) ? p['proj:transform'] : null,
      shape: Array.isArray(p['proj:shape']) ? p['proj:shape'] : null,
      unit: (Array.isArray(rb) ? rb[0]?.unit : rb?.unit) ?? null,
    });
  }
  const next = (Array.isArray(j.links) ? j.links : []).find((l) => l?.rel === 'next' && typeof l.href === 'string')?.href ?? null;
  return { items, next };
}

/**
 * The item that serves (lon, lat): containing the point, optionally restricted to one 3DEP project, the
 * NEWEST `start_datetime` first (a 2013 survey outranks a 2009 one over the same ground — measured at
 * Wilmington, where DE_Snds_2013 and NJ_SalemCo_2009 overlap), ties by id so the choice is deterministic.
 */
export function pick3depItem(items, lon, lat, { usgsId = null } = {}) {
  let best = null;
  for (const it of items ?? []) {
    if (usgsId && it.usgsId !== usgsId) continue;
    const [w, s, e, n] = it.bbox;
    if (!(lon >= w && lon <= e && lat >= s && lat <= n)) continue;
    if (!best) { best = it; continue; }
    const a = String(it.start ?? ''), b = String(best.start ?? '');
    if (a > b || (a === b && it.id < best.id)) best = it;
  }
  return best;
}

/** SAS token body → `{ token, expiresAtMs }`, or null for anything else (a 429, an HTML page, a missing field). */
export function parseSasToken(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  let j;
  try { j = JSON.parse(text); } catch { return null; }
  const expiresAtMs = Date.parse(j?.['msft:expiry'] ?? '');
  if (typeof j?.token !== 'string' || j.token.length === 0 || !Number.isFinite(expiresAtMs)) return null;
  return { token: j.token, expiresAtMs };
}

/** Is a parsed token still usable `marginMs` from now? A COG read that outlives its token answers HTTP 403. */
export function sasIsFresh(sas, nowMs, marginMs = US_3DEP_HAG.sasRefreshMarginMs) {
  return !!sas && Number.isFinite(sas.expiresAtMs) && sas.expiresAtMs - marginMs > nowMs;
}

/** Append a SAS token to a blob href. */
export function signedHref(href, token) {
  return `${href}${href.includes('?') ? '&' : '?'}${token}`;
}

/**
 * The pixel window `[x0, y0, x1, y1]` (x1/y1 exclusive) of a north-up raster covering a native
 * `[minX, minY, maxX, maxY]`, padded by `padPx` and clamped to the image, or null when they do not meet.
 * `origin` / `resolution` are geotiff's `getOrigin()` / `getResolution()` (resolution[1] is negative).
 */
export function rasterWindow({ origin: [ox, oy], resolution: [rx, ry], size: [W, H] }, [minX, minY, maxX, maxY], padPx = 1) {
  const x0 = Math.max(0, Math.floor((minX - ox) / rx) - padPx);
  const x1 = Math.min(W, Math.ceil((maxX - ox) / rx) + padPx);
  const y0 = Math.max(0, Math.floor((maxY - oy) / ry) - padPx);
  const y1 = Math.min(H, Math.ceil((minY - oy) / ry) + padPx);
  return x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : null;
}

/** A read window's value at native (X, Y) — the pixel that CONTAINS the point — or NaN outside it. */
export function windowValueAt(win, X, Y) {
  if (!win) return NaN;
  const [ox, oy] = win.origin, [rx, ry] = win.resolution;
  const px = Math.floor((X - ox) / rx) - win.window[0];
  const py = Math.floor((Y - oy) / ry) - win.window[1];
  if (px < 0 || py < 0 || px >= win.width || py >= win.height) return NaN;
  return win.values[py * win.width + px];
}

/** [minX, minY, maxX, maxY] over a set of rings. */
export function bboxOfRings(rings) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rings) for (const [x, y] of r) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

const distToSeg = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
const distToRings = (x, y, rings) => {
  let best = Infinity;
  for (const r of rings) for (let i = 0, k = r.length - 1; i < r.length; k = i++) {
    const d = distToSeg(x, y, r[k][0], r[k][1], r[i][0], r[i][1]);
    if (d < best) best = d;
  }
  return best;
};

/**
 * The interior samples of ONE footprint: every HAG pixel CENTRE inside the native exterior ring, outside
 * every hole and ≥ `erodeM` from any boundary (façade / eave / misregistration erosion), with its HAG value
 * (nodata and non-finite dropped) and the NumberOfReturns of the returns cell that contains it (NaN when
 * the returns window does not reach it). Pixel centres, not a bilinear blend: this is the sampler the
 * §HAG-VALIDATION numbers were measured with, and a bilinear step would blend canopy into roof at edges.
 * ⚠ WHY NOT ndsmHeightForBuilding — the canopy guard needs a per-sample returns value, which the DK
 * sampler (DSM − DTM, bilinear, no third raster) cannot carry. Stated so nobody "de-duplicates" it back.
 */
export function hagInteriorSamples(extNative, interiorsNative, hagWin, retWin, { erodeM = US_3DEP_HAG.erodeM, nodata = US_3DEP_HAG.nodata } = {}) {
  const out = [];
  if (!hagWin || !Array.isArray(extNative) || extNative.length < 4) return out;
  const holes = (interiorsNative ?? []).filter((h) => Array.isArray(h) && h.length >= 4);
  const rings = [extNative, ...holes];
  const [minX, minY, maxX, maxY] = bboxOfRings([extNative]);
  const [ox, oy] = hagWin.origin, [rx, ry] = hagWin.resolution;
  const [wx0, wy0] = hagWin.window;
  for (let py = 0; py < hagWin.height; py++) {
    const Y = oy + (wy0 + py + 0.5) * ry;
    if (Y < minY || Y > maxY) continue;
    for (let px = 0; px < hagWin.width; px++) {
      const X = ox + (wx0 + px + 0.5) * rx;
      if (X < minX || X > maxX) continue;
      if (!pointInRing(X, Y, extNative)) continue;
      let inHole = false;
      for (const h of holes) if (pointInRing(X, Y, h)) { inHole = true; break; }
      if (inHole) continue;
      if (distToRings(X, Y, rings) < erodeM) continue;
      const h = hagWin.values[py * hagWin.width + px];
      if (!Number.isFinite(h) || h === nodata) continue;
      const ret = windowValueAt(retWin, X, Y);
      out.push({ h, ret: Number.isFinite(ret) && ret !== nodata ? ret : NaN });
    }
  }
  return out;
}

/**
 * ⭐ THE TIER'S DECISION for one footprint's samples — a height, or a NAMED refusal:
 *   'too-few'     fewer than `minSamples` clean interior samples (a 2 m grid cannot measure a garden shed);
 *   'no-returns'  the returns raster did not reach enough of them — the canopy guard CANNOT be evaluated,
 *                 so the tier refuses rather than assume a clean roof (an unknown is never a pass);
 *   'canopy'      single-return share < `singleReturnMinShare` (§CANOPY-GUARD);
 *   'implausible' P`percentile` outside [minPlausibleM, maxPlausibleM] (a bunker's 0.0 m, a 400 m spike).
 * The percentile is the nearest-rank rule heightSources.mjs uses (`round(p/100 · (n−1))`).
 */
export function hagDecision(samples, cfg = US_3DEP_HAG) {
  const n = samples?.length ?? 0;
  if (n < cfg.minSamples) return { reject: 'too-few', samples: n, singleShare: null };
  let known = 0, single = 0;
  for (const s of samples) if (Number.isFinite(s.ret)) { known++; if (s.ret === 1) single++; }
  if (known < cfg.minSamples) return { reject: 'no-returns', samples: n, singleShare: null };
  const singleShare = single / known;
  if (singleShare < cfg.singleReturnMinShare) return { reject: 'canopy', samples: n, singleShare: Number(singleShare.toFixed(3)) };
  const hs = samples.map((s) => s.h).sort((a, b) => a - b);
  const v = hs[Math.min(n - 1, Math.max(0, Math.round((cfg.percentile / 100) * (n - 1))))];
  if (!(v >= cfg.minPlausibleM && v <= cfg.maxPlausibleM)) return { reject: 'implausible', samples: n, singleShare: Number(singleShare.toFixed(3)), value: Number(v.toFixed(2)) };
  // `rule` is a CONSTANT per config (it keys the stamp's matchRules histogram); the per-footprint share is
  // carried separately in `singleShare`, so the histogram does not grow one key per percentage point.
  return {
    height: Number(v.toFixed(1)), samples: n, singleShare: Number(singleShare.toFixed(3)),
    rule: `3dep-hag P${cfg.percentile} · single-return ≥ ${cfg.singleReturnMinShare}`,
  };
}

/** The refusal/admission counters every stamp run reports — one shape, so the note cannot drift from the stats. */
export function emptyHagStats(armed) {
  return {
    armed, stac: { status: armed ? 'not-started' : 'not-armed', reason: null, hagItems: 0, returnsItems: 0, projects: {} },
    sas: { fetches: 0, errors: 0 }, windows: { hag: 0, returns: 0, errors: 0 },
    decisions: { admitted: 0, canopy: 0, implausible: 0, 'too-few': 0, 'no-returns': 0, 'no-item': 0, 'crs-unsupported': 0, error: 0, 'channel-failed': 0 },
    perProject: {},
  };
}

/** The sentence the stamp's note carries — FAILURE (stac error / window errors) is named apart from REFUSAL. */
export function formatHagSummary(st, cfg = US_3DEP_HAG) {
  if (!st || !st.armed) return '3DEP HAG fill: not armed for this region (US_3DEP_HAG_BBOXES).';
  const d = st.decisions;
  const projects = Object.entries(st.perProject).map(([k, v]) => `${k} ${v}`).join(', ') || 'none';
  return `3DEP HAG fill (${cfg.heightSourceTag}: P${cfg.percentile} over the ${cfg.erodeM} m-eroded interior, single-return ≥ ${cfg.singleReturnMinShare}) → ` +
    `${d.admitted} admitted [${projects}] · refused ${d.canopy} canopy / ${d.implausible} implausible / ${d['too-few']} too-few / ${d['no-returns']} no-returns / ` +
    `${d['no-item']} no-item / ${d['crs-unsupported']} crs-unsupported · FAILED ${d.error} (window errors ${st.windows.errors}, SAS errors ${st.sas.errors}) · ` +
    `${d['channel-failed']} skipped because their channel page FAILED (precedence unknown) · STAC ${st.stac.status}` +
    `${st.stac.reason ? ` (${st.stac.reason})` : ''}, ${st.stac.hagItems} HAG / ${st.stac.returnsItems} returns item(s), ${st.windows.hag} + ${st.windows.returns} window read(s).`;
}

/**
 * The Delaware height sources ASSESSED on 2026-09-11 — machine-readable so a future lane must overwrite a
 * PROBED verdict rather than a blank. The founder's round-2 research names each (USA-DELAWARE-COUNTY-
 * BUILDING-SOURCES.md); `evidence` is the exact answer this lane got.
 */
export const US_DELAWARE_HEIGHT_ASSESSED = [
  { id: 'N2', source: 'gis.nccde.org BaseMaps/Base_Layers/MapServer/6 (New Castle Structures: HEIGHT, NUM_STORIES)', status: 'waf-blocked',
    evidence: 'HTTP 471 "Request Blocked … Link11 Web Application Security", 3,074 B — from curl, from Node fetch with full browser headers, and from a US cloud egress (WebFetch); the BaseMaps folder answers the same. Schema therefore UNREAD; NCC is already served by USA Structures (Wilmington 1,776 of 1,831 structures carry HEIGHT).' },
  { id: 'SUS2', source: 'map.sussexcountyde.gov … Geographic_Information_Office/Building_Footprints/MapServer/0 (FLOORS)', status: 'waf-blocked',
    evidence: 'HTTP 403 "At RedShield, we take security very seriously … blocked this request", 4,625 B, via CloudFront (X-Cache: Error from cloudfront) — the services root, the folder and www.sussexcountyde.gov (403 nginx) answer the same, from all three egresses. FLOORS population UNREAD.' },
  { id: 'SUS-AGOL', source: 'services.arcgis.com/opPd2BqYeMe7vELn … Building_Footprints/FeatureServer/0 ("Sussex County Building Footprints", owner cdaug_sussex)', status: 'wrong-jurisdiction',
    evidence: 'Sussex County NEW JERSEY, not Delaware: SR 3424 (NJ State Plane ft); the org hosts NJDEP_Wildfire_Fuel_Sussex, WantageRivers, Western_Highlands_Scenic_Byway. And empty anyway: 9,544 features, BLDGHEIGHT > 0 → 0, NUMSTORIES > 0 → 0, 0 in the demo bbox.' },
  { id: 'BF2023', source: 'services5.arcgis.com/b6Yz3vwhbD35udZY … Building_Footprints_2023/FeatureServer/189 (FLOOR, hasZ)', status: 'wrong-jurisdiction',
    evidence: 'arcgis.com item 6ce6cc6a3d7c42de8861f0a860d6f994 owner "NorthFayetteTwp", extent -80.29,40.37 → -80.17,40.46, SR 2272 (PA South ft) — North Fayette Township, Pennsylvania. 7,699 features, 0 in the demo bbox.' },
  { id: 'K2', source: 'gis.kentcountyde.gov … LandUse/PlanningData/FeatureServer/3 (Kent Building Footprints)', status: 'no-height-attribute',
    evidence: 'HTTP 200; fields VERBATIM OBJECTID_1 OBJECTID Id Shape_Leng AERIAL_YR HUNDRED CITY REVISED COMMENTS Shape__Area Shape__Length — no height, no storeys; 106,470 features statewide, 0 in the (Sussex) demo bbox.' },
  { id: 'S3', source: 'imagery.firstmaptest.delaware.gov … Elevation_SP/DE_Lidar_DEM_2023/ImageServer', status: 'bare-earth-only',
    evidence: 'HTTP 200; pixelType F32, 0.5 m, min -2.05 / max 137.62, serviceDescription "Quality Level 1 (QL1) Bare-Earth DEM". Every FirstMap imagery folder (12) and enterprise folder (14) was listed: no DSM / nDSM service exists.' },
  { id: 'USAS-SUSSEX', source: 'USA Structures (FEMA/ORNL) in Sussex', status: 'no-heights-at-source',
    evidence: 'demo bbox where=1=1 → {"count":41}, where=HEIGHT IS NOT NULL → {"count":0} (2026-09-11).' },
  { id: 'EPT-2023', source: 'usgs-lidar-public DE_Statewide_1_B23 (the 2023 QL1 point cloud)', status: 'point-cloud-needs-laz-decoder',
    evidence: 'ept.json HTTP 200: 211,151,154,347 points, dataType laszip, EPSG:3857. No LAZ decoder in tools/context-bake/node_modules (geotiff, lerc, proj4 only). The founder\'s class-6-roof-P95 algorithm is a COPC/EPT + laz-perf leg — priced, not half-built.' },
  { id: 'PC-CLASS', source: 'Planetary Computer 3dep-lidar-classification (DE_Snds_2013)', status: 'no-building-class',
    evidence: '0 class-6 cells over 1,519 Boston parts, 361 Wilmington buildings and 36 Lewes footprints; Lewes cabins read classes {1, 2, 17}. The 2013 Sandy deliveries do not classify buildings, so the class raster cannot guard canopy — the returns raster does (§CANOPY-GUARD).' },
  { id: 'PC-HAG', source: 'Planetary Computer 3dep-lidar-hag + 3dep-lidar-returns', status: 'wired-fill-delaware',
    evidence: 'STAC over the delaware bbox → HTTP 200, 310 HAG items in one page (DE_Snds_2013 = 119); 2 m Float32 LERC COGs, EPSG:26918. ' +
      'Boston BPDA: HAG P50 median Δ +1.71 m vs USA Structures −0.40 m (1,494 parts) ⇒ a FILL behind USAS. Lewes ring: guard ≥ 0.75 admits 9 of 33 at ' +
      '3.8–4.6 m and refuses all 10 canopy cabins (§HAG-VALIDATION, §CANOPY-GUARD above).' },
];
