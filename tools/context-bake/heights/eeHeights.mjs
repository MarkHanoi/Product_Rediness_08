// ─────────────────────────────────────────────────────────────────────────────
// §EE-ETAK (2026-09-05, lane HEIGHTS-EE-PL-PT-BE) — Maa- ja Ruumiamet ETAK (Eesti topograafia andmekogu)
// building layer `e_401_hoone_ka` with its per-building `korgus_m`: the PURE, dependency-free half of
// the Estonian national measured-height stamp.
//
// WHY THIS FILE IS SEPARATE FROM heightSources.mjs — the same reason as heights/nl3dbag.mjs: vitest
// cannot import heightSources.mjs, so every DECISION the stamp makes (the WFS URL and its axis order,
// the attribute→height rule, the truncation rule, the part builder, the city working set) lives here as a
// total function of its arguments and is unit-tested against a fixture copied VERBATIM from the live
// service; the network + join half (heights/eeHeightsStamp.mjs) imports these.
//
// THE CHANNEL — LIVE-PROBED 2026-09-05, every number below is a measurement, not a reading:
//   • Maa-amet's own hosts were the WRONG doors: kaart.maaamet.ee/wfs/etak → 404, /wcs/korgusmudel → 404,
//     inspire.maaamet.ee/geoserver/bu/wfs → 302, 3d.maaamet.ee → 302, the geoportaal "3D" pages → "Page not
//     found". The door that answers is the Environment Agency's GeoServer mirror of ETAK:
//     https://gsavalik.envir.ee/geoserver/etak/ows — WFS 2.0.0 GetCapabilities HTTP 200 application/xml
//     147,052 B in 0.78 s, titled "Maa- ja Ruumiameti WFS kaardiandmete teenus", 44 etak:* layers,
//     <Fees>puudub</Fees> <AccessConstraints>puudub</AccessConstraints> ("none"). Its abstract names the
//     licence — https://geoportaal.maaamet.ee/avaandmete-litsents → the Maa-amet open-data licence PDF
//     (ETAK_ruumiandmete_litsentsileping.pdf, HTTP 200 85,098 B) — and the ONE hard limit: "Teenuses
//     kuvatud kihtidele on rakendatud 5000 objekti piirang ühe päringu kohta" — **5,000 objects per
//     request**, and it applies to RESULTTYPE=hits too (a 0.04°×0.03° Tallinn box: hits numberMatched
//     5000, GetFeature numberReturned 5000 / numberMatched 0). So a cell that returns ≥ 5,000 is
//     TRUNCATED, not complete, and the stamp splits it (etakIsTruncated below) — it never trusts a
//     round 5,000 as a count.
//   • `etak:e_401_hoone_ka` (DescribeFeatureType HTTP 200 application/gml+xml): fid · shape · etak_id ·
//     kood · kood_tekst · tyyp · tyyp_tekst · ehr_gid (EHR building-register id) · ads_oid · ads_lahiaadress
//     · kov_id · markused · **korgus_m (xsd:short)** · vajalik · vajalik_tekst · andmeallika_id ·
//     **korgusallika_id** (the height's source document id) · ruumikujuallika_id · muutmisaeg ·
//     geom_muutmisaeg. GetFeature with outputFormat=application/json + srsName=EPSG:4326 answers GeoJSON
//     Polygons in lon,lat.
//   • ⚠ AXIS ORDER — the BBOX parameter is honoured in **lon,lat** for EPSG:4326 on this server:
//     `bbox=24.74,59.43,24.75,59.44,EPSG:4326` → numberMatched 646; the WFS-2.0-textbook lat,lon order
//     `bbox=59.43,24.74,59.44,24.75,EPSG:4326` → numberMatched **0** — no error, an empty collection over
//     Tallinn's Old Town. That is the silent-empty defect the URL test pins.
//   • The Tallinn Old-Town cell [24.74,59.43,24.75,59.44] WHOLE, propertyName-trimmed: HTTP 200, 435,748 B,
//     0.69 s, 646/646 features, all Polygon; korgus_m NULL 9 (1.4 %), zero 0, valid 637 → p10 10 · p50 18
//     · p90 25 · max 86 m (integer metres — xsd:short). tyyp: 10 "Elu- või ühiskondlik hoone" 541 · 20
//     "Kõrval- või tootmishoone" 101 · 40 "Vare" (ruin) 3 · 50 "Ehitatav hoone" (under construction) 1.
//     korgusallika_id: 225 ×547 · 229 ×42 · 224 ×26 · 999 ×15 · 210 ×6 · 230 ×5.
//     Per-cell hits elsewhere: tartu [26.72,58.37,26.73,58.38] 594 · pärnu [24.49,58.38,24.50,58.39] 374 ·
//     narva [28.18,59.37,28.19,59.38] 217 · rural Järvamaa [25.60,58.80,25.61,58.81] 0 (an honest empty).
//   • WHAT korgus_m IS (ETAK_juhend2016.pdf §3.5.3 "Kõrgusreeglid", verbatim): "Andmetele on omistatud
//     kõrgus kas lausaliselt kõrgusmudeli alusel või stereos digides. 20. Stereos lisatud või muudetud
//     hooned tuleb kaardistada katuseserva kõrgusel." — the height is assigned either area-wide from the
//     height model (Maa-amet's ALS-derived kõrgusmudel) or by stereo digitising at the roof edge. Either
//     way it is a MEASURED metre per building from the national survey, never a storey count × 3 m, and
//     `korgusallika_id` records which source document produced it. It carries the
//     `pryzm:height_src=measured-lidar` marker on the same footing the US photogrammetric heights do
//     (heights/usOpenHeights.mjs); the per-building source-document code table itself (what 225 / 229 /
//     224 mean) was NOT resolvable from the public docs on 2026-09-05 — the number is a measurement, the
//     exact instrument behind each code is the one open question, said here by name.
//   • Licence: Maa-amet open-data licence (attribution "Maa- ja Ruumiamet" required — the capabilities
//     abstract: "palume viidata andmete omanikule"). No key, no account, no repo secret.
//   • The "Eesti 3D" LoD2 CityGML the REGION_SOURCE row names is a BULK download behind the geoportaal
//     order form, not a bbox service — not a bake channel today; ETAK's korgus_m is the same survey's
//     per-building height, reachable by bbox, and is what this stamp uses.
// ─────────────────────────────────────────────────────────────────────────────

export const EE_ETAK = {
  wfs: 'https://gsavalik.envir.ee/geoserver/etak/ows',
  typeName: 'etak:e_401_hoone_ka',  // one row per building (ETAK Hoone), Polygon + attributes (probed)
  outputFormat: 'application/json', // GeoServer GeoJSON; coordinates lon,lat
  srs: 'EPSG:4326',
  // The fields the join reads. Trimming cut the Tallinn cell from ~614 KB (2 fields over 5,000 rows) to 436 KB for 646 rows with these nine.
  propertyNames: ['etak_id', 'tyyp', 'tyyp_tekst', 'ehr_gid', 'korgus_m', 'korgusallika_id', 'andmeallika_id', 'vajalik', 'shape'],
  serverCap: 5000,                  // "5000 objekti piirang ühe päringu kohta" — GetFeature AND hits (probed)
  ruinType: 40,                     // tyyp 40 "Vare" — a ruin; its korgus_m is skipped by name
  heightSourceTag: 'etak-korgus_m',
  attribution: 'Maa- ja Ruumiamet — ETAK (Eesti topograafia andmekogu), open-data licence, attribution required',
};

/**
 * WFS 2.0 GetFeature URL for the ETAK buildings intersecting a WGS84 `[w,s,e,n]` box.
 * ⚠ BBOX is **lon,lat** — live-verified 2026-09-05: the lat,lon form returns an EMPTY collection with
 * HTTP 200 over Tallinn's Old Town (see the header). `count` caps rows; the server caps at 5,000 regardless.
 */
export function etakGetFeatureUrl([w, s, e, n], { count = null, trim = true } = {}) {
  const props = trim ? `&propertyName=${EE_ETAK.propertyNames.join(',')}` : '';
  return `${EE_ETAK.wfs}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${EE_ETAK.typeName}` +
    `&outputFormat=${encodeURIComponent(EE_ETAK.outputFormat)}&srsName=${EE_ETAK.srs}` +
    `&bbox=${w},${s},${e},${n},${EE_ETAK.srs}${props}${count ? `&count=${count}` : ''}`;
}

/** WFS 2.0 hits-only query — ⚠ capped at 5,000 like GetFeature, so `5000` means "≥ 5,000", never "exactly". */
export function etakHitsUrl([w, s, e, n]) {
  return `${EE_ETAK.wfs}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${EE_ETAK.typeName}` +
    `&srsName=${EE_ETAK.srs}&bbox=${w},${s},${e},${n},${EE_ETAK.srs}&resultType=hits`;
}

/**
 * GetFeature body → GeoJSON FeatureCollection, or **null** for a body that is not one (an
 * ows:ExceptionReport, an HTML error page, an empty body). The caller must treat null as UNKNOWN (a tile
 * ERROR), never as "no buildings here" — the failure-vs-empty conflation (L-422/457/467/469). A genuine
 * empty cell parses as a collection with zero features.
 */
export function parseEtakCollection(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  try {
    const j = JSON.parse(text);
    return j && j.type === 'FeatureCollection' && Array.isArray(j.features) ? j : null;
  } catch { return null; }
}

/**
 * Did the server's 5,000-object cap TRUNCATE this collection? True when it returned ≥ cap features — a
 * cell that reads exactly 5,000 is far more likely cut than complete (probed: a box holding well over
 * 5,000 buildings answered numberReturned 5000, numberMatched 0). The caller SPLITS such a cell; it
 * never stamps from a truncated answer, because the missing buildings would silently keep OSM defaults
 * while the cell reported "read".
 */
export function etakIsTruncated(fc, cap = EE_ETAK.serverCap) {
  const n = Array.isArray(fc?.features) ? fc.features.length : 0;
  const returned = Number.isFinite(Number(fc?.numberReturned)) ? Number(fc.numberReturned) : n;
  return Math.max(n, returned) >= cap;
}

const num = (v) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * One ETAK building's attributes → `{ height, sourceId }` in metres ABOVE GROUND, or **null** when no
 * honest height exists. THE RULE:
 *   height = korgus_m (integer metres, measured — juhend §3.5.3)
 *   • korgus_m null / non-finite / ≤ 0 → null (1.4 % of the Tallinn cell; never a neighbour's number)
 *   • tyyp === 40 ("Vare", ruin)       → null (a ruin's residual wall height is not a building height)
 * `sourceId` = korgusallika_id, carried so a probe can histogram which source document produced the numbers.
 */
export function etakBuildingHeight(props) {
  if (!props || typeof props !== 'object') return null;
  if (num(props.tyyp) === EE_ETAK.ruinType) return null;
  const h = num(props.korgus_m);
  if (h === null || h <= 0) return null;
  return { height: h, sourceId: num(props.korgusallika_id) };
}

/** Shoelace area of a WGS84 [lon,lat] ring in m² (local equirectangular frame — plenty for weighting). */
export const M_PER_DEG_LAT = 111320;
export function ringAreaM2(ring) {
  if (!Array.isArray(ring) || ring.length < 4) return 0;
  const lat0 = ring[0][1], kx = M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180), ky = M_PER_DEG_LAT;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = (ring[i][0] - ring[0][0]) * kx, yi = (ring[i][1] - ring[0][1]) * ky;
    const xj = (ring[j][0] - ring[0][0]) * kx, yj = (ring[j][1] - ring[0][1]) * ky;
    a += xj * yi - xi * yj;
  }
  return Math.abs(a) / 2;
}

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
 * A point INSIDE a closed [lon,lat] ring — the NL rule (heights/nl3dbag.mjs interiorPoint, whose study
 * measured the vertex mean landing in a NEIGHBOUR's ring 33× per 2,443 parts): area centroid in a LOCAL
 * frame → if not inside, the midpoint of the widest chord at that latitude → else the vertex mean.
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
  if (Math.abs(a) < 1e-18) return mean;
  const c = [ox + cx / (3 * a), oy + cy / (3 * a)];
  if (pointInRing(c[0], c[1], ring)) return c;
  // widest chord at the centroid's latitude
  const y = c[1], xs = [];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y)) xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi));
  }
  xs.sort((p, q) => p - q);
  let best = null, bestW = -1;
  for (let k = 0; k + 1 < xs.length; k += 2) { const w = xs[k + 1] - xs[k]; if (w > bestW) { bestW = w; best = [(xs[k] + xs[k + 1]) / 2, y]; } }
  return best && pointInRing(best[0], best[1], ring) ? best : mean;
}

/**
 * A FeatureCollection → the join's PARTS: `{ etakId, ehrGid, ring, cx, cy, areaM2, h, sourceId }`, ring
 * closed, `cx, cy` an INTERIOR point (interiorPoint — never a vertex mean). Buildings with no honest height,
 * a non-Polygon geometry or a degenerate ring are counted in `skipped` (by reason) and dropped — never
 * given a neighbour's number. `sourceIds` histograms korgusallika_id over the kept parts.
 */
export function etakPartsFromCollection(fc) {
  const parts = [];
  const skipped = { noHeight: 0, ruin: 0, noGeometry: 0 };
  const sourceIds = {};
  for (const f of fc?.features ?? []) {
    const g = f?.geometry;
    const ext = g?.type === 'Polygon' ? g.coordinates?.[0] : g?.type === 'MultiPolygon' ? g.coordinates?.[0]?.[0] : null;
    if (!Array.isArray(ext) || ext.length < 4) { skipped.noGeometry++; continue; }
    if (num(f.properties?.tyyp) === EE_ETAK.ruinType) { skipped.ruin++; continue; }
    const hh = etakBuildingHeight(f.properties);
    if (!hh) { skipped.noHeight++; continue; }
    let ok = true;
    for (const p of ext) if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) { ok = false; break; }
    if (!ok) { skipped.noGeometry++; continue; }
    const ring = ext.map(([lon, lat]) => [lon, lat]);
    const f0 = ring[0], l0 = ring[ring.length - 1];
    if (f0[0] !== l0[0] || f0[1] !== l0[1]) ring.push([f0[0], f0[1]]);
    const [cx, cy] = interiorPoint(ring);
    const key = hh.sourceId === null ? 'null' : String(hh.sourceId);
    sourceIds[key] = (sourceIds[key] ?? 0) + 1;
    parts.push({
      etakId: num(f.properties?.etak_id), ehrGid: typeof f.properties?.ehr_gid === 'string' ? f.properties.ehr_gid : null,
      ring, cx, cy, areaM2: ringAreaM2(ring), h: hh.height, sourceId: hh.sourceId,
    });
  }
  return { parts, skipped, sourceIds };
}

/** Sample points of a part: the ring's vertices and edge midpoints pulled 10 % toward the interior point. */
export function partSamplePoints(p, pull = 0.1) {
  if (p.samples) return p.samples;
  const pts = [[p.cx, p.cy]];
  for (let i = 0, j = p.ring.length - 1; i < p.ring.length - 1; j = i++) {
    const [x, y] = p.ring[i];
    pts.push([x + (p.cx - x) * pull, y + (p.cy - y) * pull]);
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

/**
 * Which ETAK buildings does ONE OSM footprint own? FORWARD: every candidate with ≥ `minInsideFrac` of its
 * sample points inside the footprint (a terrace of ETAK houses under one OSM outline → all of them).
 * REVERSE (nothing forward): the SMALLEST candidate containing the footprint's centroid (an OSM part inside
 * one ETAK building). Neither → `via: null`, the footprint keeps its OSM tags. The NL rule, unchanged.
 */
export function matchPartsToFootprint(fp, candidates, { minInsideFrac = 0.5 } = {}) {
  const owned = [];
  for (const p of candidates) if (partInsideFraction(fp, p) >= minInsideFrac) owned.push(p);
  if (owned.length) return { owned, via: 'forward' };
  let best = null;
  for (const p of candidates) if (pointInRing(fp.clon, fp.clat, p.ring) && (!best || p.areaM2 < best.areaM2)) best = p;
  return best ? { owned: [best], via: 'reverse' } : { owned, via: null };
}

/** Area-weighted 90th percentile of the owned parts' heights — the statistic the raster stamps take over pixels. */
export function areaWeightedP90(parts) {
  const ps = parts.filter((p) => Number.isFinite(p.h) && p.h > 0).sort((a, b) => a.h - b.h);
  if (ps.length === 0) return null;
  const total = ps.reduce((s, p) => s + Math.max(p.areaM2, 1), 0);
  let acc = 0;
  for (const p of ps) { acc += Math.max(p.areaM2, 1); if (acc >= 0.9 * total) return p.h; }
  return ps[ps.length - 1].h;
}

/** Uniform ~`cellDeg` grid over parts keyed by ring bbox → `{ get(bbox) }`; keeps a dense cell O(footprints) not O(footprints × parts). */
export function partGrid(parts, cellDeg = 0.001) {
  const cells = new Map();
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
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §EE-CITY-BBOXES — the `estonia` national row's stamp working set (the EE analogue of MDS_CITY_BBOXES /
// NL_3DBAG_CITY_BBOXES, mandatory for the same reason: §HEIGHT-STAMP-BUDGET / L-659). Footprints outside
// these bboxes stream through with their original OSM tags — never a fabricated height. Cost ≈ populated
// 0.01° cells × ~0.4 MB × ~0.7 s (one GetFeature each; the densest Tallinn cell holds 646 buildings, an
// order of magnitude under the 5,000 cap).
//
// PROVENANCE: tallinn is BYTE-IDENTICAL to terrain.mjs's `ee` REGIONS row (§MDS-BBOX-MUST-COVER-THE-
// REGION, pinned by eeHeights.spec.ts) so the baked terrain and the stamped heights cover the same
// ground; tartu / pärnu / narva are tight metro-core extents. Every bbox is inside the bake.mjs `estonia`
// region bbox (21.60,57.50,28.30,59.80). No EE city is a bake.mjs region row, so nothing double-bakes.
// ─────────────────────────────────────────────────────────────────────────────
export const EE_CITY_BBOXES = [
  // city       [w, s, e, n] (WGS84, osmium -b order)                       ≈ 0.01° cells
  { city: 'tallinn', bbox: [24.65, 59.40, 24.92, 59.50] },   // = terrain.mjs ee row · 27×10
  { city: 'tartu',   bbox: [26.66, 58.34, 26.78, 58.41] },   // 12×7
  { city: 'parnu',   bbox: [24.45, 58.36, 24.56, 58.41] },   // 11×5
  { city: 'narva',   bbox: [28.15, 59.35, 28.22, 59.40] },   // 7×5
];
