// ─────────────────────────────────────────────────────────────────────────────
// §NL-3DBAG (2026-09-05, lane HEIGHTS-NL) — 3D BAG (BAG footprints × AHN LiDAR, TU Delft): the PURE,
// dependency-free half of the Dutch national measured-height stamp.
//
// WHY THIS FILE IS SEPARATE FROM heightSources.mjs — the same reason as heights/mnhFr.mjs and
// heights/swissNdsm.mjs: vitest cannot import heightSources.mjs, so every DECISION the stamp makes (the
// request URL and its axis order, the attribute→height rule, the part builder, the city working set)
// lives here as a total function of its arguments and is unit-tested against a fixture copied VERBATIM
// from the live service; the network + join half (`stampNl3dbagHeightsOnGeojsonseq`) imports these.
//
// THE CHANNEL — LIVE-PROBED 2026-09-05, every number below is a measurement, not a reading:
//   • The OGC API Features endpoint the city-path fetcher uses (api.3dbag.nl/collections/pand/items,
//     `fetch3dbag`) is the WRONG channel for a whole-country stamp, and not only because a national bbox
//     truncates: its `limit`/`offset` count CityObjects, NOT features — `limit=1000` answered
//     numberReturned 100 with **50** features; `offset=2` and `offset=3` returned the SAME pand — and
//     each page is ~1.4 MB of LoD2 solids for ~50 buildings (28 KB/building). One 0.01° Amsterdam cell
//     (numberMatched 3,997 objects ≈ 2,000 panden) would cost ~40 pages / ~56 MB.
//   • The WFS at data.3dbag.nl/api/BAG3D/wfs (GeoServer, WFS 2.0) publishes the SAME buildings as 2-D
//     layers: `BAG3D:lod12` · `BAG3D:lod13` · `BAG3D:lod22` (+ `BAG3D:tiles`). `lod12` is one row per
//     BUILDING PART (`identificatie` + `b3_pand_deel_id`) with a WGS84 Polygon and every b3_* attribute.
//     GetFeature, OUTPUTFORMAT=application/json, SRSNAME=EPSG:4326 over the 0.01° cell
//     [4.89,52.37,4.90,52.38] → HTTP 200, **2,443 of 2,443** parts in ONE response (CountDefault is
//     1,000,000 — no paging needed per cell), 5.7 MB / 0.94 s with every attribute, **1.9 MB / 0.61 s**
//     with PROPERTYNAME trimmed to the twelve fields below. Coordinates come back lon,lat.
//   • ⚠ AXIS ORDER — the BBOX parameter is honoured in **lon,lat** for EPSG:4326 on this server:
//     `BBOX=4.89,52.37,4.90,52.38,EPSG:4326` → numberMatched 2,443; the WFS-2.0-textbook lat,lon order
//     `BBOX=52.37,4.89,52.38,4.90,EPSG:4326` → numberMatched **0** — no error, an empty collection over the
//     densest cell in the country. That is the silent-empty defect the URL test pins. (RD EPSG:28992 and
//     CRS:84 both work too; 4326 lon,lat is used because bake's grid is degree-gridded.)
//   • Heights are NAP-referenced attributes, so the stamp DIFFERENCES two of them (unlike FR's MNH,
//     where the pixel already is height above ground): `b3_h_70p − b3_h_maaiveld`. ⭐ WHY 70p, MEASURED:
//     3DBAG's own LoD1.2 solid for NL.IMBAG.Pand.0363100012165047 has its roof at z = 22.771 m NAP; the
//     pand's b3_h_dak_70p is 22.777 (50p 20.894, max 23.949). 3DBAG extrudes LoD1.2 to the 70th
//     percentile, so `70p − maaiveld` IS the height 3DBAG itself shows for the building — and it is the
//     upper-percentile-over-the-footprint statistic the ES/DK/FR/CH raster stamps take (P90). 50p is the
//     fallback when 70p is null. `b3_h_maaiveld` is REQUIRED: without it a NAP roof height is a fabricated
//     building on any ground above sea level (Limburg sits at +100 m NAP). `b3_pw_onvoldoende=true`
//     (insufficient point cloud) → NO height, the part is skipped by name.
//   • Sample (Amsterdam centre cell [4.89,52.37,4.90,52.38], RE-PROBED 2026-09-05 relaunch: HTTP 200, 1,944,516 B,
//     0.56 s, 2,443/2,443 features): height = (70p ?? 50p) − maaiveld → p10 9.7 · p50 13.7 · p90 17.9 · max 53.0 m;
//     0 b3_pw_onvoldoende, 0 null b3_h_70p, 0 null b3_h_maaiveld; all Polygon. Hits: lon,lat 2,443 · lat,lon 0.
//   • Coverage: national — the pand collection extent is RD [10000,306250,287760,623690] (all of NL);
//     collection version v2023.10.08, point clouds AHN3/4/5 (`b3_pw_bron`).
//   • Licence: CC BY 4.0 (the collection's `rel:license` link on api.3dbag.nl/collections/pand) —
//     attribution "3D BAG by tudelft3d and 3DGI". No key, no account, no repo secret.
// ─────────────────────────────────────────────────────────────────────────────

export const NL_3DBAG = {
  wfs: 'https://data.3dbag.nl/api/BAG3D/wfs',
  typeName: 'BAG3D:lod12',          // one row per building PART, 2-D footprint + b3_* attributes (probed)
  outputFormat: 'application/json', // GeoServer GeoJSON; coordinates lon,lat
  srs: 'EPSG:4326',
  // The twelve fields the join reads. Trimming cut a cell from 5.7 MB to 1.9 MB (probed 2026-09-05).
  propertyNames: [
    'identificatie', 'b3_pand_deel_id', 'b3_h_50p', 'b3_h_70p', 'b3_h_max', 'b3_h_nok', 'b3_h_maaiveld',
    'b3_dak_type', 'b3_pw_bron', 'b3_pw_onvoldoende', 'b3_kwaliteitsindicator', 'geom',
  ],
  heightSourceTag: 'nl-3dbag',
  attribution: '3D BAG (tudelft3d / 3DGI) — CC BY 4.0',
  collectionVersion: 'v2023.10.08', // api.3dbag.nl/collections/pand `version.collection`, 2026-09-05
};

/**
 * WFS 2.0 GetFeature URL for the lod12 parts intersecting a WGS84 `[w,s,e,n]` box.
 * ⚠ BBOX is **lon,lat** — live-verified 2026-09-05: the lat,lon form returns an EMPTY collection with
 * HTTP 200 over the densest cell in the Netherlands (see the header). `count` caps rows (default: none —
 * the server's CountDefault is 1,000,000 and a 0.01° cell answers whole in one response).
 */
export function nl3dbagGetFeatureUrl([w, s, e, n], { count = null, trim = true } = {}) {
  const props = trim ? `&PROPERTYNAME=${NL_3DBAG.propertyNames.join(',')}` : '';
  return `${NL_3DBAG.wfs}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=${NL_3DBAG.typeName}` +
    `&OUTPUTFORMAT=${encodeURIComponent(NL_3DBAG.outputFormat)}&SRSNAME=${NL_3DBAG.srs}` +
    `&BBOX=${w},${s},${e},${n},${NL_3DBAG.srs}${props}${count ? `&COUNT=${count}` : ''}`;
}

/** WFS 2.0 hits-only query: how many lod12 parts intersect `[w,s,e,n]` (lon,lat BBOX). */
export function nl3dbagHitsUrl([w, s, e, n]) {
  return `${NL_3DBAG.wfs}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=${NL_3DBAG.typeName}` +
    `&SRSNAME=${NL_3DBAG.srs}&BBOX=${w},${s},${e},${n},${NL_3DBAG.srs}&RESULTTYPE=hits`;
}

/**
 * GetFeature body → GeoJSON FeatureCollection, or **null** for a body that is not one (an
 * ows:ExceptionReport — the server answers those with HTTP 400 and XML — an HTML error page, an empty
 * body). The caller must treat null as UNKNOWN (a tile ERROR), never as "no buildings here": collapsing
 * "the service refused us" into "the cell is empty" is the failure-vs-empty conflation this repo keeps
 * re-learning (L-422/457/467/469). A genuine empty cell parses as a collection with zero features.
 */
export function parseNl3dbagCollection(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  try {
    const j = JSON.parse(text);
    return j && j.type === 'FeatureCollection' && Array.isArray(j.features) ? j : null;
  } catch { return null; }
}

const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);

/**
 * One lod12 part's attributes → `{ height, roofType, percentile }` in metres ABOVE GROUND, or **null**
 * when no honest height exists. THE RULE (measured, see the header):
 *   height = (b3_h_70p ?? b3_h_50p) − b3_h_maaiveld
 *   • b3_h_maaiveld missing        → null (a NAP roof height without its ground is a fabricated building)
 *   • b3_pw_onvoldoende === true   → null (3DBAG says the point cloud was insufficient for this part)
 *   • roof ≤ ground / non-finite   → null
 * `percentile` records WHICH attribute produced the number ('70p' | '50p') so a probe can tell them apart.
 */
export function nl3dbagPartHeight(props) {
  if (!props || typeof props !== 'object') return null;
  if (props.b3_pw_onvoldoende === true) return null;
  const ground = num(props.b3_h_maaiveld);
  if (ground === null) return null;
  const h70 = num(props.b3_h_70p);
  const roof = h70 ?? num(props.b3_h_50p);
  if (roof === null) return null;
  const height = roof - ground;
  if (!Number.isFinite(height) || height <= 0) return null;
  return {
    height,
    roofType: typeof props.b3_dak_type === 'string' && props.b3_dak_type !== 'unknown' ? props.b3_dak_type : null,
    percentile: h70 !== null ? '70p' : '50p',
  };
}

/**
 * A point INSIDE a closed [lon,lat] ring — the point the forward match tests against an OSM footprint.
 * ⭐ MEASURED (live Amsterdam cell, 2,443 parts, 2026-09-05): the naive VERTEX-MEAN centroid falls OUTSIDE
 * its own ring 104× (4.3 %) and INSIDE a neighbour's ring 33× — each of those stamps the neighbour's
 * height on the wrong building (seen in the smoke test: a 21.2 m house read 22.9 m). The area centroid,
 * computed in a LOCAL frame (absolute lon·lat cross products cancel catastrophically — the same study
 * read 1,191 outside when done in absolute degrees), is outside 34× / inside-another 11×; with a
 * horizontal-chord point-on-surface fallback at the centroid's latitude it is outside 0× and inside
 * another 5× (all overlapping same-pand parts). RULE: area centroid → if not inside, the midpoint of the
 * widest chord of the ring at that latitude → else the vertex mean (degenerate rings only).
 */
export function interiorPoint(ring) {
  const ox = ring[0][0], oy = ring[0][1];
  let a = 0, cx = 0, cy = 0, mx = 0, my = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xj = ring[j][0] - ox, yj = ring[j][1] - oy, xi = ring[i][0] - ox, yi = ring[i][1] - oy;
    const f = xj * yi - xi * yj;
    a += f; cx += (xj + xi) * f; cy += (yj + yi) * f;
    mx += ring[i][0]; my += ring[i][1];
  }
  const mean = [mx / ring.length, my / ring.length];
  if (!(Math.abs(a) > 1e-18)) return mean;
  const c = [ox + cx / (3 * a), oy + cy / (3 * a)];
  if (pointInRing(c[0], c[1], ring)) return c;
  // Point-on-surface: intersections of the horizontal line y = c[1] with the ring, widest span's midpoint.
  const xs = [];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > c[1]) !== (yj > c[1])) xs.push(xi + ((c[1] - yi) * (xj - xi)) / (yj - yi));
  }
  xs.sort((p, q) => p - q);
  let best = null, bw = -1;
  for (let k = 0; k + 1 < xs.length; k += 2) { const wd = xs[k + 1] - xs[k]; if (wd > bw) { bw = wd; best = (xs[k] + xs[k + 1]) / 2; } }
  if (best !== null && pointInRing(best, c[1], ring)) return [best, c[1]];
  return mean;
}

export const M_PER_DEG_LAT = 111320;
/** Shoelace area of a WGS84 [lon,lat] ring in m² (local equirectangular frame — plenty for weighting). */
export function ringAreaM2(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  let lat = 0;
  for (const p of ring) lat += p[1];
  lat /= ring.length;
  const kx = M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180), ky = M_PER_DEG_LAT;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] * kx) * (ring[i][1] * ky) - (ring[i][0] * kx) * (ring[j][1] * ky);
  }
  return Math.abs(a) / 2;
}

/**
 * A parsed lod12 FeatureCollection → the join's part records, in the SAME shape the NRW LoD2 join feeds
 * `areaWeightedP90` / `dominantRoof` (`h`, `areaM2`, `roof`), plus the exterior `ring` (WGS84 [lon,lat],
 * closed) and an INTERIOR point `cx, cy` (interiorPoint — never a vertex mean, see there). Parts with no honest height, a non-Polygon geometry or a
 * degenerate ring are counted in `skipped` (by reason) and dropped — never given a neighbour's number.
 */
export function nl3dbagPartsFromCollection(fc) {
  const parts = [];
  const skipped = { noHeight: 0, noGeometry: 0 };
  for (const f of fc?.features ?? []) {
    const g = f?.geometry;
    const ext = g?.type === 'Polygon' ? g.coordinates?.[0] : g?.type === 'MultiPolygon' ? g.coordinates?.[0]?.[0] : null;
    if (!Array.isArray(ext) || ext.length < 4) { skipped.noGeometry++; continue; }
    const hh = nl3dbagPartHeight(f.properties);
    if (!hh) { skipped.noHeight++; continue; }
    let ok = true;
    for (const p of ext) if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) { ok = false; break; }
    if (!ok) { skipped.noGeometry++; continue; }
    const ring = ext.map(([lon, lat]) => [lon, lat]);
    const f0 = ring[0], l0 = ring[ring.length - 1];
    if (f0[0] !== l0[0] || f0[1] !== l0[1]) ring.push([f0[0], f0[1]]);
    const [cx, cy] = interiorPoint(ring);
    parts.push({
      id: typeof f.id === 'string' ? f.id : null,
      pandId: typeof f.properties?.identificatie === 'string' ? f.properties.identificatie : null,
      ring, cx, cy, areaM2: ringAreaM2(ring), h: hh.height, roof: hh.roofType, percentile: hh.percentile,
    });
  }
  return { parts, skipped };
}

// ─────────────────────────────────────────────────────────────────────────────
// §NL-3DBAG-CITY-BBOXES — the `netherlands` national row's stamp working set (the NL analogue of
// MDS_CITY_BBOXES / DHM_CITY_BBOXES / MNH_FR_CITY_BBOXES / SWISS_CITY_BBOXES, mandatory for the same
// reason: §HEIGHT-STAMP-BUDGET / L-659 — a whole-country join with no bounded area holds every Dutch
// footprint in the V8 heap). Footprints outside these bboxes stream through with their original OSM tags
// — never a fabricated height. Each bbox is used BOTH as a priority area (stamped first, uncapped) AND as
// the retained working set. Cost ≈ its populated 0.01° cells × ~2 MB × ~0.6 s (one GetFeature each).
//
// PROVENANCE: these six are the "ready per-city bboxes" the heightSources.mjs REGION_SOURCE `netherlands`
// note carried as free text since 2026-07-26, promoted to config (the §MDS-CITY-BBOXES move). The first
// five are BYTE-IDENTICAL to terrain.mjs's `nl` REGIONS rows (§MDS-BBOX-MUST-COVER-THE-REGION, pinned by
// nl3dbag.spec.ts) so the baked terrain and the stamped heights cover the same ground; groningen has no
// terrain row and is a tight metro-core extent. No NL city is a bake.mjs region row (the Amsterdam-only
// clip was replaced by the national row on 2026-07-26), so nothing here double-bakes.
// ─────────────────────────────────────────────────────────────────────────────
export const NL_3DBAG_CITY_BBOXES = [
  // city          [w, s, e, n] (WGS84, osmium -b order)                ≈ 0.01° cells
  { city: 'amsterdam', bbox: [4.83, 52.34, 4.97, 52.42] },   // = terrain.mjs nl row · 14×8
  { city: 'rotterdam', bbox: [4.42, 51.88, 4.55, 51.96] },   // = terrain.mjs nl row · 13×8
  { city: 'utrecht',   bbox: [5.06, 52.06, 5.16, 52.12] },   // = terrain.mjs nl row · 10×6
  { city: 'thehague',  bbox: [4.25, 52.04, 4.35, 52.10] },   // = terrain.mjs nl row · 10×6
  { city: 'eindhoven', bbox: [5.42, 51.40, 5.52, 51.48] },   // = terrain.mjs nl row · 10×8
  { city: 'groningen', bbox: [6.52, 53.20, 6.60, 53.25] },   // 8×5
];

// ─────────────────────────────────────────────────────────────────────────────
// §NL-3DBAG-MATCH — the join's DECISION: which lod12 parts an OSM footprint owns. The NRW LoD2 join's
// two-direction rule (§LOD2-NRW-OSM-JOIN), copied so a probe means the same thing in Köln and Amsterdam:
//   1. FORWARD — 3DBAG parts whose BODY is mostly INSIDE the OSM exterior ring (and not in a hole). The
//      normal case; handles one OSM way over N BAG panden (a canal-house block drawn as one OSM building).
//      ⭐ "mostly", not "centroid" — MEASURED: BAG panden OVERLAP (a station roof over its platforms, a
//      building over a passage). With a bare interior-point test a large overlapping neighbour whose
//      point happens to fall inside a small footprint is owned by it, and the area-weighted P90 then
//      stamps the neighbour's height: in the 2026-09-05 smoke test a 21.2 m canal house read 27.1 m.
//      So a part is owned when ≥ `minInsideFrac` (0.5) of its SAMPLE POINTS — the interior point plus
//      every ring-edge midpoint pulled 10 % toward it (off the edge, so an OSM ring drawn ON the BAG
//      outline is unambiguous) — lie inside the footprint. A part wholly inside scores 1; a neighbour that
//      merely overlaps scores its overlap fraction and is refused below ½. That is the "best overlap"
//      half of the brief's centroid-in-polygon / best-overlap rule.
//      ⭐ Genuine overlaps SURVIVE this rule on purpose, and the reduction is NRW's: pand 242112 (11,529 m²,
//      21.2 m) holds 72 % of pand 240311 (5,140 m², 22.9 m) and 67 % of 245758 (1,431 m², 27.1 m) — 3DBAG
//      draws them inside it. An OSM footprint on 242112 covers ground those buildings stand on, so it owns
//      all three and the area-weighted P90 reads 22.9 m (measured). 4 ordered pairs in 2,443 parts (0.16 %)
//      overlap this way in the Amsterdam centre cell.
//   2. REVERSE — else the OSM centroid inside a 3DBAG part ring. Catches an OSM footprint drawn
//      smaller/offset than the BAG outline. Where overlapping panden BOTH contain the centroid, the
//      SMALLEST-area one wins — the most specific claim about that point (the footprint is smaller than
//      the pand by construction here, so the innermost pand is the one it was drawn inside).
//   3. NEITHER → NO match (`owned` empty). The footprint keeps its own OSM tags. No proximity guessing.
// Pure and unit-tested here; the stamp (heights/nl3dbagStamp.mjs) reduces `owned` with the shared
// areaWeightedP90 / dominantRoof, exactly as NRW does.
// ─────────────────────────────────────────────────────────────────────────────

/** Even-odd point-in-ring on a closed [x,y] ring (the same test heightSources.mjs `_pointInRing` runs). */
export function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

/**
 * `{ ext, interiors, clon, clat }` (one OSM footprint, WGS84) × candidate `parts` (nl3dbagPartsFromCollection)
 * → `{ owned, via }` where `via` is 'forward' | 'reverse' | null. `candidates` may be pre-filtered by a
 * spatial grid; correctness does not depend on it (an unfiltered list gives the same answer, slower).
 * Sample points are cached on the part (`p.samples`) — a part is offered to many footprints in a cell.
 */
export function partSamplePoints(p, pull = 0.1) {
  if (p.samples) return p.samples;
  const pts = [[p.cx, p.cy]];
  for (let i = 0, j = p.ring.length - 1; i < p.ring.length; j = i++) {
    const mx = (p.ring[i][0] + p.ring[j][0]) / 2, my = (p.ring[i][1] + p.ring[j][1]) / 2;
    pts.push([mx + (p.cx - mx) * pull, my + (p.cy - my) * pull]);
  }
  p.samples = pts;
  return pts;
}

/** Fraction of a part's sample points inside `fp` (exterior ring, not in a hole) — 0..1. */
export function partInsideFraction(fp, p) {
  const pts = partSamplePoints(p);
  let inside = 0;
  for (const [x, y] of pts) {
    if (!pointInRing(x, y, fp.ext)) continue;
    let inHole = false;
    for (const hole of fp.interiors ?? []) if (pointInRing(x, y, hole)) { inHole = true; break; }
    if (!inHole) inside++;
  }
  return inside / pts.length;
}

export function matchPartsToFootprint(fp, candidates, { minInsideFrac = 0.5 } = {}) {
  const owned = [];
  for (const p of candidates) if (partInsideFraction(fp, p) >= minInsideFrac) owned.push(p);
  if (owned.length) return { owned, via: 'forward' };
  let best = null;
  for (const p of candidates) if (pointInRing(fp.clon, fp.clat, p.ring) && (!best || p.areaM2 < best.areaM2)) best = p;
  return best ? { owned: [best], via: 'reverse' } : { owned, via: null };
}

/** Uniform ~`cellDeg` grid over parts keyed by centroid → `{ get(bbox) }` returning candidates whose
 *  centroid OR ring bbox touches the query bbox. Keeps a dense cell (2,443 parts) from costing
 *  O(footprints × parts) point-in-polygon tests. Pure; unit-tested. */
export function partGrid(parts, cellDeg = 0.001) {
  const cells = new Map();
  const key = (x, y) => `${Math.floor(x / cellDeg)}:${Math.floor(y / cellDeg)}`;
  for (const p of parts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of p.ring) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    p.bx0 = x0; p.by0 = y0; p.bx1 = x1; p.by1 = y1;
    for (let gx = Math.floor(x0 / cellDeg); gx <= Math.floor(x1 / cellDeg); gx++) {
      for (let gy = Math.floor(y0 / cellDeg); gy <= Math.floor(y1 / cellDeg); gy++) {
        const k = `${gx}:${gy}`;
        const c = cells.get(k);
        if (c) c.push(p); else cells.set(k, [p]);
      }
    }
  }
  return {
    size: cells.size,
    get([x0, y0, x1, y1]) {
      const seen = new Set(), acc = [];
      for (let gx = Math.floor(x0 / cellDeg); gx <= Math.floor(x1 / cellDeg); gx++) {
        for (let gy = Math.floor(y0 / cellDeg); gy <= Math.floor(y1 / cellDeg); gy++) {
          const c = cells.get(`${gx}:${gy}`);
          if (!c) continue;
          for (const p of c) if (!seen.has(p)) { seen.add(p); acc.push(p); }
        }
      }
      return acc;
    },
    _key: key,
  };
}
