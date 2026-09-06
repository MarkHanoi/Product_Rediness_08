// ─────────────────────────────────────────────────────────────────────────────
// §GURS-KN-STAVBE (2026-09-05, lane HEIGHTS-AT-CZ-SI) — GURS Kataster nepremičnin **STAVBE** register
// heights: the PURE, dependency-free half of the Slovenian national height stamp. The network/stream
// half is `stampSiHeightsOnGeojsonseq` in heights/siHeightsStamp.mjs (the nl3dbagStamp precedent).
//
// THE CHANNEL — LIVE-PROBED 2026-09-05, every number below is a measurement, not a reading:
//   • ⚠ HOST: the KN WFS is on **ipi.eprostor.gov.si**, NOT storitve.eprostor.gov.si. Probed the same
//     minute: storitve…/ows-pub-wfs lists ONLY RPE/EDM/ZK/MOP layers (no KN); storitve…/wfs-si-gurs-kn/ows,
//     …/wfs, …/ows-ins-wfs and …/wms-si-gurs-kn all answer HTTP 404. The endpoint the 2026-09-03 parcel
//     lane pinned (audit/europe-adapters-2/2026-09-02/lane-si.md) is the one that lives:
//       https://ipi.eprostor.gov.si/wfs-si-gurs-kn/ows  — GeoServer WFS 2.0, KEYLESS, GetCapabilities
//       HTTP 200 application/xml 134,687 B, CountDefault 20000, 78 SI.GURS.KN:* feature types incl.
//       STAVBE, STAVBE_OBRIS, DELI_STAVB, ETAZE, PARCELE. Licence CC BY 4.0 (the lane-si pin; GURS
//       "Odprti podatki").
//   • `SI.GURS.KN:STAVBE` = one **Point** per building (`geometry_name: CENTROID_GEOM`; with
//     srsName=EPSG:4326 the coordinates come back [lon, lat] — verified 14.5033308, 46.05283259 =
//     Ljubljana centre). The BBOX filter is LAT,LON with `urn:ogc:def:crs:EPSG::4326`
//     (`bbox=46.050,14.503,46.053,14.508,urn:ogc:def:crs:EPSG::4326` → 20 Ljubljana buildings; the
//     lane-si pin measured the same both ways). ~5.6 KB per feature (the multilingual code lists):
//     a 1.1 × 1.5 km Ljubljana box = 1,341 features / 7.5 MB / 8.9 s, so the stamp asks per 0.01° cell.
//   • HEIGHT ATTRIBUTES (metres above sea level, Slovenian height datum) — over those 1,341 buildings:
//       VISINA_H2 (highest point of the building)        present 1,287 (96 %)
//       VISINA_H3 (characteristic height — the ground-floor / entrance level)  present 1,287 (96 %)
//       VISINA_H1 (lowest point of the building)         present   642 (48 %)
//       STEVILO_ETAZ (floors)                             present 1,338
//     H2 − H3: p10 2.7 · p50 12.5 · p90 22.9 · max 68.5 m (n 1,287; 1 negative, 40 below 2 m).
//     H2 − H1: p10 5.1 · p50 18.1 · p90 27.9 · max 282 m (n 642) — H1 sits a median 2.0 m BELOW H3
//     (p90 3.8 m), i.e. H1 is the lowest terrain/basement point on the slope side, so H2 − H1
//     overstates the massing by the terrain drop. Floors vs median(H2 − H3): 1 → 3.2 · 2 → 7.4 ·
//     3 → 11.3 · 4 → 14.8 · 5 → 17.2 · 6 → 19.7 · 8 → 24.6 · 10 → 26.2 m — a clean ~3.3 m/floor
//     ladder, so THE RULE is height = H2 − H3, falling back to H2 − H1 only when H3 is absent
//     (`gursStavbaHeight`). The 6-feature body of that probe is saved VERBATIM as
//     __tests__/fixtures/si-gurs-kn-stavbe-ljubljana-2026-09-05.json (numberMatched 38 in its box).
//   • PROVENANCE — the register's own accuracy code: VISINSKA_NATANCNOST_STAVBE_ID 0 "Točnost višine
//     ni določena / neznana metoda določitve" for 1,288 of 1,341; 1 "±0,25 m, višine določene z
//     meritvami" for 51; 2 "±0,35 m, transformacija (geoid)" for 2. A national register metre whose
//     method the register itself calls unknown is a `tagged` height (a real value in a surveyed
//     register, the OSM-`height` rung), NOT `measured-lidar` — so the stamp writes `height` and NO
//     `pryzm:height_src` marker: the client resolves `tagged` and renders SOLID
//     (CesiumViewport.ts §CTX-HEIGHT-FIDELITY-RENDER), the register's accuracy code rides along as
//     `gurs:visinska_natancnost` for anyone auditing the tile. Never the marker on an unknown method.
//   • `SI.GURS.KN:STAVBE_OBRIS` (polygons) carries geometry + EID only (no VISINA_*), so the join is
//     POINT-IN-FOOTPRINT: a STAVBE centroid inside the OSM footprint (holes excluded) OWNS it; a
//     footprint owning several takes their P90 (the raster joins' statistic). No reverse match — an
//     OSM footprint whose own centroid falls in no STAVBE point cannot be matched without OBRIS, and
//     keeps its OSM tags (§CONTEXT-DATA-HONESTY: never a neighbour's height).
// ─────────────────────────────────────────────────────────────────────────────

export const GURS_KN = {
  wfs: 'https://ipi.eprostor.gov.si/wfs-si-gurs-kn/ows',
  typeName: 'SI.GURS.KN:STAVBE',
  outputFormat: 'application/json',
  countDefault: 20000,               // GetCapabilities CountDefault (probed) — a 0.01° cell is ≤ ~1,500 buildings
  // §GURS-TRIM (2026-09-06, lane HEIGHTS-WHOLE-COUNTRY-B) — the five attributes the join actually reads,
  // plus the geometry. STAVBE publishes **127 properties per feature** (mostly multilingual code lists),
  // and the whole country cannot be swept at that weight. MEASURED on the SAME cell the same minute
  // (bbox=46.050,14.500,46.060,14.510, 691 features): full 4,029,288 B / 1.36 s → trimmed 226,427 B /
  // 1.35 s. **17.8× fewer bytes for the same 691 buildings and the same wall clock**, which is what makes
  // a national sweep affordable at all (~1.2 M Slovenian buildings: ~390 MB instead of ~7 GB).
  propertyNames: ['VISINA_H1', 'VISINA_H2', 'VISINA_H3', 'STEVILO_ETAZ', 'VISINSKA_NATANCNOST_STAVBE_ID', 'CENTROID_GEOM'],
  heightSourceTag: 'gurs-kn-stavbe-h2h3',
  accuracyField: 'VISINSKA_NATANCNOST_STAVBE_ID',
  attribution: 'GURS — Kataster nepremičnin, STAVBE (CC BY 4.0)',
};

/**
 * WFS 2.0 GetFeature URL for STAVBE over a WGS84 `[w,s,e,n]` box.
 * ⚠ AXIS ORDER: `urn:ogc:def:crs:EPSG::4326` means BBOX is **lat,lon** (miny,minx,maxy,maxx); the
 * returned coordinates (srsName=EPSG:4326) are [lon, lat]. Live-verified 2026-09-05 — the swapped order
 * is a box in the Indian Ocean and returns an EMPTY collection, not an error.
 */
export function gursStavbeUrl([w, s, e, n], { count = GURS_KN.countDefault, trim = true } = {}) {
  const props = trim ? `&propertyName=${GURS_KN.propertyNames.join(',')}` : '';
  return `${GURS_KN.wfs}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${GURS_KN.typeName}` +
    `&outputFormat=${encodeURIComponent(GURS_KN.outputFormat)}&srsName=EPSG:4326&count=${count}${props}` +
    `&bbox=${s},${w},${n},${e},urn:ogc:def:crs:EPSG::4326`;
}

/**
 * Did the server's `count` cap TRUNCATE this collection? True when it returned ≥ the cap asked for — a
 * cell that reads exactly `count` is far more likely CUT than complete. The caller SPLITS such a cell; it
 * must never stamp from a truncated answer, because the missing buildings would silently keep their OSM
 * default while the cell reported "read" (§BDTOPO-CAP-TRUNCATE — a truncation wearing a success).
 * ⚠ This did not exist while the join only ever saw 0.01° city cells (≈ 691 buildings against a 20,000
 * cap). The national sweep asks for bigger cells over denser ground, so the cap became reachable and the
 * check became mandatory.
 */
export function gursIsTruncated(fc, cap = GURS_KN.countDefault) {
  const n = Array.isArray(fc?.features) ? fc.features.length : 0;
  const returned = Number.isFinite(Number(fc?.numberReturned)) ? Number(fc.numberReturned) : n;
  return Math.max(n, returned) >= cap;
}

/**
 * WFS body → FeatureCollection, or **null** for a body that is not one (an ows:ExceptionReport, an HTML
 * error page, an empty body). The caller must treat null as UNKNOWN (a failure), never as "no buildings".
 */
export function parseGursCollection(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  try {
    const j = JSON.parse(text);
    return j && j.type === 'FeatureCollection' && Array.isArray(j.features) ? j : null;
  } catch { return null; }
}

const num = (v) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * One STAVBE record's attributes → `{ height, rule, floors, accuracy }` in metres ABOVE the
 * characteristic ground level, or **null** when no honest height exists. THE RULE (measured, header):
 *   height = H2 − H3            ('h2-h3' — the floor-ladder-consistent statistic)
 *   height = H2 − H1 if no H3   ('h2-h1' — overstates by the terrain drop, used only as the fallback)
 *   • no H2                     → null (nothing measured the roof)
 *   • result ≤ 0 / non-finite   → null (the register contradicts itself for this building)
 * `rule` records WHICH pair produced the number so a probe can tell them apart.
 */
export function gursStavbaHeight(props) {
  if (!props || typeof props !== 'object') return null;
  const h2 = num(props.VISINA_H2);
  if (h2 === null) return null;
  const h3 = num(props.VISINA_H3), h1 = num(props.VISINA_H1);
  let height = null, rule = null;
  if (h3 !== null) { height = h2 - h3; rule = 'h2-h3'; }
  else if (h1 !== null) { height = h2 - h1; rule = 'h2-h1'; }
  else return null;
  if (!Number.isFinite(height) || height <= 0) return null;
  const floors = num(props.STEVILO_ETAZ);
  return { height, rule, floors: floors !== null && floors > 0 ? floors : null, accuracy: num(props[GURS_KN.accuracyField]) };
}

/**
 * FeatureCollection → the buildings with a position AND an honest height:
 * `{ points: [{ lon, lat, eid, height, rule, floors, accuracy }], skipped: { noGeometry, noHeight } }`.
 * Only Point geometries are accepted (STAVBE is a centroid layer); anything else counts as noGeometry.
 */
export function gursStavbeFromCollection(fc) {
  const points = [];
  const skipped = { noGeometry: 0, noHeight: 0 };
  for (const f of fc?.features ?? []) {
    const g = f?.geometry;
    if (!g || g.type !== 'Point' || !Array.isArray(g.coordinates) || g.coordinates.length < 2) { skipped.noGeometry++; continue; }
    const [lon, lat] = g.coordinates;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) { skipped.noGeometry++; continue; }
    const h = gursStavbaHeight(f.properties);
    if (!h) { skipped.noHeight++; continue; }
    points.push({ lon, lat, eid: f.properties?.EID ?? f.id ?? null, ...h });
  }
  return { points, skipped };
}

/** Ray-cast point-in-ring (ring = [[x,y]…], closed or not). */
export function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

/**
 * Which STAVBE points does an OSM footprint `{ ext, interiors }` OWN? Those whose centroid lies inside
 * the exterior ring and outside every hole. Returns `{ owned, via: 'forward' | null }` — `null` means
 * the footprint keeps its OSM tags (no reverse rule exists without STAVBE_OBRIS; see the header).
 */
export function matchStavbeToFootprint(fp, candidates) {
  const owned = [];
  for (const p of candidates) {
    if (!pointInRing(p.lon, p.lat, fp.ext)) continue;
    let inHole = false;
    for (const hole of fp.interiors ?? []) if (pointInRing(p.lon, p.lat, hole)) { inHole = true; break; }
    if (!inHole) owned.push(p);
  }
  return { owned, via: owned.length ? 'forward' : null };
}

/** Uniform ~`cellDeg` grid over points → `{ get(bbox) }` returning the candidates whose position falls in
 *  the cells the query bbox touches. Keeps a dense cell from costing O(footprints × points). */
export function pointGrid(points, cellDeg = 0.001) {
  const cells = new Map();
  for (const p of points) {
    const k = `${Math.floor(p.lon / cellDeg)}:${Math.floor(p.lat / cellDeg)}`;
    const c = cells.get(k);
    if (c) c.push(p); else cells.set(k, [p]);
  }
  return {
    size: cells.size,
    get([x0, y0, x1, y1]) {
      const acc = [];
      for (let gx = Math.floor(x0 / cellDeg); gx <= Math.floor(x1 / cellDeg); gx++) {
        for (let gy = Math.floor(y0 / cellDeg); gy <= Math.floor(y1 / cellDeg); gy++) {
          const c = cells.get(`${gx}:${gy}`);
          if (c) acc.push(...c);
        }
      }
      return acc;
    },
  };
}

/** P90 of the owned points' heights (max for ≤ 5 — the raster joins' statistic, applied to a stack). */
export function ownedP90(owned) {
  const hs = owned.map((p) => p.height).filter(Number.isFinite).sort((a, b) => a - b);
  if (hs.length === 0) return null;
  return hs[Math.min(hs.length - 1, Math.max(0, Math.round(0.9 * (hs.length - 1))))];
}

// ─────────────────────────────────────────────────────────────────────────────
// §SI-CITY-BBOXES — the `slovenia` national row's stamp working set (§HEIGHT-STAMP-BUDGET / L-659).
// Footprints outside these bboxes stream through with their original OSM tags — never a fabricated
// height. Each bbox costs ≈ its populated 0.01° cells × one GetFeature (~1 MB / ~1.5 s at Ljubljana
// density). terrain.mjs has NO `si` city rows (only the national `slovenia` row, probe Ljubljana
// 14.51,46.05), so siHeights.spec.ts pins that every bbox lies INSIDE the bake.mjs `slovenia` row and
// that the CI spot-check point (Prešeren Square) lies inside `ljubljana`.
// ─────────────────────────────────────────────────────────────────────────────
export const SI_CITY_BBOXES = [
  // city          [w, s, e, n] (WGS84, osmium -b order)
  { city: 'ljubljana', bbox: [14.45, 46.02, 14.57, 46.09] },   // Prešeren Square 14.5051,46.0511 (CI gate row)
  { city: 'maribor',   bbox: [15.60, 46.53, 15.69, 46.58] },
  { city: 'celje',     bbox: [15.23, 46.22, 15.29, 46.25] },
  { city: 'kranj',     bbox: [14.33, 46.22, 14.39, 46.26] },
  { city: 'koper',     bbox: [13.70, 45.52, 13.76, 45.56] },
];

// ─────────────────────────────────────────────────────────────────────────────
// §SI-NATIONAL (2026-09-06, lane HEIGHTS-WHOLE-COUNTRY-B) — the retain set is now the WHOLE COUNTRY,
// not the five cities above.
//
// ── THE DEFECT THIS REMOVES ─────────────────────────────────────────────────────────────────────
// SI_CITY_BBOXES was BOTH the priority order AND the retain set (bake.mjs stampBboxesFor →
// §HEIGHT-STAMP-BUDGET, L-659), so Novo mesto, Ptuj, Velenje, Nova Gorica, Murska Sobota and every
// Slovenian village could never be stamped by any number of re-bakes — silently, because an unstamped
// footprint ships the honest `assumed` 9 m, the same value the client shows where a source genuinely
// has no data (L-422/457/467/469). GURS KN is ONE national register; only the REACH was missing.
//
// ── THE MEASURED COST (probed 2026-09-06, `curl -m 180`, exact answers) ─────────────────────────
//   bbox=46.050,14.500,46.060,14.510 (0.01°, Ljubljana centre), count=20000:
//     FULL properties     HTTP 200  4,029,288 B  1.36 s  691 features / numberMatched 691 · 127 props each
//     TRIMMED propertyName HTTP 200   226,427 B  1.35 s  691 features / same five attributes + CENTROID_GEOM
//   ⇒ 17.8× fewer bytes at identical wall clock (§GURS-TRIM above). The country is ~1.2 M buildings:
//     ~390 MB trimmed against ~7 GB untrimmed — the difference between a sweep and an outage.
// ⇒ TILE = 0.03°. The densest cell measured is 691 buildings per 0.01°; a 0.03° cell over the same
//   density is ≈ 6,200, comfortably under the 20,000 CountDefault, so the common case is ONE request
//   per cell and `gursIsTruncated` + split is the exception. A 0.03° cell at 46 °N is ~7.8 km², so
//   Slovenia's 20,271 km² of land is ≈ 2,600 cells; at the measured ~1.4 s and concurrency 4 the whole
//   country is ≈ 15 min of wall clock — it fits in one dispatch, and is still ORDERED, CURSORED and LOUD.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §SI-NATIONAL-BBOX — BYTE-IDENTICAL to the bake.mjs `slovenia` region row (`bbox:
 * '13.30,45.40,16.60,46.90'`), pinned by siHeights.spec.ts. A retain set smaller than the baked region
 * is exactly the silent, permanent hole this section removes.
 */
export const SI_NATIONAL_BBOX = [13.30, 45.40, 16.60, 46.90];
export const SI_NATIONAL_BBOXES = [SI_NATIONAL_BBOX];

/** The national sweep's tile size in degrees — MEASURED, see above. */
export const SI_TILE_DEG = 0.03;

/**
 * §SI-SWATHE — tile ROWS per bounded-heap pass. Slovenia's 1.5° of latitude is 50 rows at 0.03°;
 * 10 rows = 0.30° of latitude per band, 5 bands. At the measured ~1,256 B of heap per parsed footprint
 * (geojsonseqRead.spec.ts §heap-budget) the country's ~1.2 M OSM buildings would be ~1.5 GB in ONE
 * pass; five bands keep the peak near 300 MB, inside a bake job that also runs tippecanoe.
 */
export const SI_SWATHE_ROWS = 10;

/** Courtesy concurrency against the keyless GeoServer. Cells are issued in ORDERED batches, so the
 *  resume cursor stays exact. */
export const SI_SWEEP_CONCURRENCY = 4;
