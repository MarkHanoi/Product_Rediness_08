#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// PRYZM terrain — THE ONE shared horizontal-reprojection helper (proj4).
//
// WHY THIS FILE EXISTS: terrain.mjs used to hard-code a single closed-form RD-New inverse
// (rdToWgs84) and threw for every other country ("reproject adapter not wired"). Baking real
// terrain for FR/CH/NO/DE/IT/GB/ES needs each national DTM's native projected CRS mapped to
// WGS-84 lon/lat. Rather than copy-paste a bespoke transverse-Mercator / Lambert / oblique-
// Mercator inverse per country (error-prone, untestable), this module wraps `proj4` — the same
// library packages/geospatial already uses — behind ONE tiny, self-tested projector factory.
// terrain.mjs's per-country fetch + warp both go through `getProjector()`; there is no per-country
// projection maths anywhere else. (NL keeps its dependency-free closed form in terrain.mjs for the
// already-shipped Amsterdam proof; every NEW country routes through here.)
//
// STANDALONE dep (mirrors terrain.mjs's header — NOT the pnpm workspace):  npm i proj4@2
//
// DATUM SCOPE: this file is HORIZONTAL only (native easting/northing ↔ WGS-84 lon/lat). The
// VERTICAL datum lift (orthometric national height → WGS-84 ellipsoidal, the L-584 rule) stays in
// terrain.mjs (napToEllipsoidal + geoidSepM). Keeping the two axes separate is deliberate: a bug in
// one can never silently corrupt the other.
//
// ACCURACY: every def carries the published 7-parameter Helmert `+towgs84` (OSGB36→WGS84 for GB,
// CH-Bessel→WGS84 for LV95). ETRS89-based grids (ES/FR/NO/DE UTM & Lambert) are +towgs84=0 —
// ETRS89≈WGS84 to a few cm, ample for a terrain drape. `selfTest()` asserts known city control
// points AND a sub-metre round-trip; CI runs it before any bake so a bad def fails loudly.
// ─────────────────────────────────────────────────────────────────────────────
import proj4 from 'proj4';

// ── EPSG → proj4 def. One entry per national DTM's native CRS (+ the geographic passthroughs). ──
export const PROJ_DEFS = {
  // ETRS89 / UTM (ES, DE, NO, IT). +towgs84=0 → ETRS89≈WGS84.
  'EPSG:25830': '+proj=utm +zone=30 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs', // ES UTM30N (Madrid, Córdoba)
  'EPSG:25831': '+proj=utm +zone=31 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs', // ES UTM31N (Barcelona)
  'EPSG:25832': '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs', // DE NRW (Köln)
  'EPSG:25833': '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs', // NO (Oslo)
  // FR RGF93 / Lambert-93.
  'EPSG:2154': '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  // CH LV95 (oblique Mercator on Bessel + Helmert to WGS84).
  'EPSG:2056': '+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs',
  // IT TINITALY national mosaic (UTM32N / WGS84 — extends E of the zone).
  'EPSG:32632': '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs',
  'EPSG:32633': '+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs',
  // GB OSGB36 / British National Grid — 7-param Helmert (OSTN15 grid not needed for a drape).
  'EPSG:27700': '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs',
  // NL RD-New (also served by terrain.mjs's closed form; registered here for completeness/parity).
  'EPSG:28992': '+proj=sterea +lat_0=52.1561605555556 +lon_0=5.38763888888889 +k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +towgs84=565.417,50.3319,465.552,-0.398957,0.343988,-1.8774,4.0725 +units=m +no_defs',
};

let _registered = false;
function ensureRegistered() {
  if (_registered) return;
  for (const [code, def] of Object.entries(PROJ_DEFS)) proj4.defs(code, def);
  _registered = true;
}

/** Normalise a CRS token ('EPSG:25831', '25831', 4326, 'CRS:84', 'EPSG:4258') → canonical key. */
export function normalizeCrs(crs) {
  const s = String(crs).trim().toUpperCase();
  if (s === 'CRS:84' || s === 'EPSG:4326' || s === '4326' || s === 'EPSG:4258' || s === '4258' || s === 'WGS84') {
    return 'EPSG:4326';
  }
  if (s.startsWith('EPSG:')) return s;
  if (/^\d+$/.test(s)) return `EPSG:${s}`;
  return s;
}

/**
 * The single projector factory. Returns { epsg, geographic, forward, inverse }:
 *   forward(lon, lat) → [X, Y]   WGS-84 lon/lat → the raster's native coordinate
 *   inverse(X, Y)     → [lon, lat] native → WGS-84 lon/lat
 * For a geographic raster (already served in EPSG:4326/4258) forward/inverse are the identity, so a
 * single warp routine in terrain.mjs handles BOTH geographic and projected DTMs uniformly.
 */
export function getProjector(crs) {
  ensureRegistered();
  const epsg = normalizeCrs(crs);
  if (epsg === 'EPSG:4326') {
    return { epsg, geographic: true, forward: (lon, lat) => [lon, lat], inverse: (x, y) => [x, y] };
  }
  if (!PROJ_DEFS[epsg]) throw new Error(`reproject: no proj4 def registered for ${epsg} (add it to PROJ_DEFS)`);
  return {
    epsg, geographic: false,
    forward: (lon, lat) => proj4('EPSG:4326', epsg, [lon, lat]),
    inverse: (x, y) => proj4(epsg, 'EPSG:4326', [x, y]),
  };
}

// ── Self-test: known city control points (from public EPSG.io / national gazetteers) + a
//    round-trip tolerance. CI runs `node reproject.mjs --selftest` before any bake. ──
const CONTROL_POINTS = [
  // [epsg, lon, lat, expectX, expectY, tolMetres] — expected native coords, hand-verified.
  ['EPSG:25831',  2.178, 41.362,  431248,  4579270, 5],   // Barcelona port  (ETRS89 UTM31N)
  ['EPSG:25830', -3.703, 40.416,  440358,  4474168, 5],   // Madrid Sol      (ETRS89 UTM30N)
  ['EPSG:2154',   2.349, 48.853,  652231,  6861637, 5],   // Paris           (Lambert-93)
  ['EPSG:2056',   8.541, 47.376,  2683252, 1247825, 5],   // Zürich          (LV95)
  ['EPSG:25833', 10.75,  59.91,   262410,  6649018, 5],   // Oslo            (ETRS89 UTM33N)
  ['EPSG:25832',  6.96,  50.94,   356676,  5645134, 5],   // Köln            (ETRS89 UTM32N)
  ['EPSG:32632', 12.5,   41.9,    790335,  4644600, 5],   // Rome (UTM32 ext) (TINITALY)
  ['EPSG:27700', -0.1276, 51.5072, 530043, 180358, 5],    // London          (OSGB36 BNG)
];

/** Run the control-point + round-trip self-test. Returns { pass, rows }. */
export function selfTest() {
  ensureRegistered();
  const rows = [];
  let pass = true;
  for (const [epsg, lon, lat, ex, ey, tol] of CONTROL_POINTS) {
    const p = getProjector(epsg);
    const [x, y] = p.forward(lon, lat);
    const [blon, blat] = p.inverse(x, y);
    const ctrlErr = Math.hypot(x - ex, y - ey);
    const rtErr = Math.hypot(blon - lon, blat - lat) * 111000; // deg → ~m
    const ok = ctrlErr <= tol && rtErr <= 0.01;
    pass &&= ok;
    rows.push({ epsg, x: Math.round(x), y: Math.round(y), ctrlErrM: +ctrlErr.toFixed(2), roundTripErrM: +rtErr.toFixed(4), ok });
  }
  return { pass, rows };
}

// ── CLI: `node reproject.mjs --selftest` ──
if (process.argv[1]?.endsWith('reproject.mjs')) {
  const { pass, rows } = selfTest();
  for (const r of rows) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.epsg.padEnd(11)} -> [${r.x}, ${r.y}]  ctrlΔ=${r.ctrlErrM}m  roundtripΔ=${r.roundTripErrM}m`);
  }
  console.log(pass ? '\n✅ reproject self-test PASS (all control points < tol, round-trip < 1 cm)'
    : '\n❌ reproject self-test FAILED');
  process.exit(pass ? 0 : 1);
}
