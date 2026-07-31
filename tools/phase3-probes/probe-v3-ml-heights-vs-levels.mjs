#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// PROBE V3-gate — do Overture / Microsoft-ML building heights BEAT `levels × 3.2 m`
// when both are scored against our 0.9% surveyed ground truth?
// (Phase 3 deciding probes, GEOGRAPHIC-ROLLOUT-MASTER-TRACKER §3.)
//
// WHAT PHASE 4 PATH A ACTUALLY IS: join an external height attribute onto the
// existing bake (days of work, no new pipeline). It is worth doing ONLY if the
// external height is BETTER than the estimate we already produce. Swapping our
// estimate for someone else's estimate relocates the error; it does not reduce it.
//
// THE THREE POPULATIONS (Barcelona, per contextBuildings.ts resolveHeightWithProvenance)
//   'tagged'         — a real surveyed OSM `height` tag ..................... GROUND TRUTH
//   'derived-levels' — a real `building:levels` × OUR assumed 3.2 m ......... ESTIMATOR 1
//   'assumed'        — the fabricated 9 m default
//   Overture `height`, sourced 'Microsoft ML Buildings' /properties/height ... ESTIMATOR 2
//
// ⚠ THE TRAP THIS PROBE IS BUILT TO AVOID (the wrong-PROPERTY error).
// If Overture's Barcelona height were merely OSM's own `height` tag passed through,
// ESTIMATOR 2 would score a PERFECT zero error on the ground-truth set — and that
// would be a TAUTOLOGY, not a win: it would be the ground truth grading itself, and
// it would add exactly nothing outside the 0.9% we already have. The probe therefore
// ALWAYS reports, alongside the scores:
//   (a) the per-source provenance of every Overture height in the bbox, and
//   (b) the exact-equality rate between Overture height and the surveyed OSM height
//       on the scored set — a high rate INVALIDATES a good score.
// A score is not admissible until (a) and (b) have been read.
//
// ⚠ AND THE SECOND-ORDER QUESTION, which decides path A even if the score is a draw:
// path A's value is INCREMENTAL COVERAGE — how many buildings get a height they do
// NOT have today. Measured separately in §5, on the buildings with NO OSM height and
// NO OSM levels (today's fabricated-9 m population).
//
// DEPENDENCIES — deliberately OUTSIDE the pnpm workspace (a package.json inside the
// repo would break --frozen-lockfile). Two external tools, both free, both optional
// per stage:
//   DuckDB CLI  → env PRYZM_DUCKDB  (default: `duckdb` on PATH)
//                 download: github.com/duckdb/duckdb/releases (duckdb_cli-<platform>.zip)
//   node deps   → env PRYZM_V3_DEPS = a dir where `npm i pmtiles@4 @mapbox/vector-tile@2 pbf@4`
//                 has been run. Only needed for the --osm stage.
//
// USAGE
//   node probe-v3-ml-heights-vs-levels.mjs --overture   # stage A: pull Overture → JSONL
//   node probe-v3-ml-heights-vs-levels.mjs --osm        # stage B: pull our baked tiles → JSONL
//   node probe-v3-ml-heights-vs-levels.mjs --score      # stage C: match + score (offline)
//   node probe-v3-ml-heights-vs-levels.mjs              # all three
//   ... --out <dir>     where the intermediate JSONL lands (default: ./v3-probe-out)
//
// §CONTEXT-DATA-HONESTY: every stage reports counts and its own failure mode. An empty
// result and a failed fetch are DIFFERENT and are never collapsed. Each stage writes
// its intermediate file so the scoring is rerunnable offline and auditable.
// ─────────────────────────────────────────────────────────────────────────────
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

// ── the study area — the SAME bbox CONTEXT-BUILDING-SOURCE-EVALUATION.md used for
// its Barcelona Overture count (85,725 features), so the two are comparable.
const BBOX = [2.10, 41.35, 2.23, 41.45]; // [w,s,e,n]
const OVERTURE_RELEASE = process.env.PRYZM_OVERTURE_RELEASE ?? '2026-07-22.0'; // matches tools/context-bake/bake.mjs
const OVERTURE_S3 = `s3://overturemaps-us-west-2/release/${OVERTURE_RELEASE}/theme=buildings/type=building/*`;
const TILES_BASE = process.env.PRYZM_TILES_BASE ?? 'https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev/tiles/';
const DUCKDB = process.env.PRYZM_DUCKDB ?? 'duckdb';
const DEPS = process.env.PRYZM_V3_DEPS ?? '';
const METRES_PER_LEVEL = 3.2; // contextBuildings.ts:234 — OUR assumption, the thing under test
const TILE_Z = 16;            // the bake's building zoom (BARCELONA-DATA-PIPELINE.md §6)
const MATCH_TOL_M = 12;       // centroid match tolerance; sensitivity-tested in §2

const args = process.argv.slice(2);
const want = (f) => args.includes(f);
const outDir = resolve(args[args.indexOf('--out') + 1] && want('--out') ? args[args.indexOf('--out') + 1] : 'v3-probe-out');
const runAll = !want('--overture') && !want('--osm') && !want('--score');
const OVERTURE_FILE = resolve(outDir, 'overture-bcn.jsonl');
const OSM_FILE = resolve(outDir, 'osm-baked-bcn.jsonl');

const M_PER_DEG_LAT = 111320;
const mPerDegLon = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

function dist(arr) {
  const a = [...arr].filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const q = (p) => a[Math.min(a.length - 1, Math.max(0, Math.round(p * (a.length - 1))))];
  const mean = a.reduce((s, x) => s + x, 0) / a.length;
  return {
    n: a.length,
    min: +a[0].toFixed(2), p05: +q(0.05).toFixed(2), p25: +q(0.25).toFixed(2),
    median: +q(0.5).toFixed(2), p75: +q(0.75).toFixed(2), p90: +q(0.9).toFixed(2),
    p95: +q(0.95).toFixed(2), p99: +q(0.99).toFixed(2), max: +a[a.length - 1].toFixed(2),
    mean: +mean.toFixed(2),
    rmse: +Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length).toFixed(2),
  };
}
const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : 'n/a');

// ═══════════════════════════════════════════════════════════════════════════
// STAGE A — Overture. DuckDB over the public S3 GeoParquet, anonymous.
// We keep the per-height SOURCE, because the score is inadmissible without it.
// ═══════════════════════════════════════════════════════════════════════════
function stageOverture() {
  console.log('\n══ STAGE A — Overture buildings (public S3 GeoParquet, anonymous) ══');
  console.log(`  release  ${OVERTURE_RELEASE}`);
  console.log(`  bbox     [${BBOX.join(', ')}]`);
  mkdirSync(outDir, { recursive: true });
  const outPath = OVERTURE_FILE.replace(/\\/g, '/');
  // `height_src` = the dataset credited for /properties/height specifically. NULL when the
  // height carries no property-level attribution (Overture omits `property` for whole-feature
  // provenance) — recorded as 'unattributed', never guessed.
  const sql = `
    LOAD httpfs; SET s3_region='us-west-2';
    COPY (
      SELECT
        id,
        height,
        num_floors,
        (bbox.xmin + bbox.xmax) / 2 AS lon,
        (bbox.ymin + bbox.ymax) / 2 AS lat,
        COALESCE(list_aggregate(
          list_transform(list_filter(sources, s -> s.property = '/properties/height'), s -> s.dataset),
          'string_agg', '|'), 'unattributed') AS height_src,
        list_aggregate(list_transform(sources, s -> s.dataset), 'string_agg', '|') AS all_src
      FROM read_parquet('${OVERTURE_S3}', hive_partitioning=1)
      WHERE bbox.xmin BETWEEN ${BBOX[0]} AND ${BBOX[2]}
        AND bbox.ymin BETWEEN ${BBOX[1]} AND ${BBOX[3]}
    ) TO '${outPath}' (FORMAT JSON);
  `;
  const t0 = Date.now();
  const r = spawnSync(DUCKDB, ['-c', sql], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) { console.log(`  DUCKDB NOT RUNNABLE ('${DUCKDB}'): ${r.error.message}`); console.log('  → set PRYZM_DUCKDB to the CLI path. STAGE A NOT RUN (this is a failure, not an empty result).'); return false; }
  if (r.status !== 0) { console.log(`  DUCKDB EXIT ${r.status}\n${r.stderr?.slice(0, 2000)}`); return false; }
  const lines = readFileSync(OVERTURE_FILE, 'utf8').trim().split('\n').filter(Boolean);
  console.log(`  → ${lines.length} features written to ${OVERTURE_FILE} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const withH = lines.filter((l) => JSON.parse(l).height != null).length;
  console.log(`  with a height: ${withH} (${pct(withH, lines.length)})`);
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGE B — OUR baked tiles. This is the production reality — the same PMTiles
// the client reads — so the ground truth is the one the app actually sees, not a
// re-derivation. (L-582's 23,251-footprint measurement was taken here and its
// script did not survive; this stage reconstitutes that read.)
// ═══════════════════════════════════════════════════════════════════════════
async function stageOsm() {
  console.log('\n══ STAGE B — our baked buildings.pmtiles (the production read) ══');
  if (!DEPS) { console.log('  PRYZM_V3_DEPS not set → cannot load pmtiles/vector-tile. STAGE B NOT RUN.'); return false; }
  let PMTiles, VectorTile, Protobuf;
  // Windows: absolute paths must be file:// URLs for the ESM loader.
  const dep = (rel) => pathToFileURL(resolve(DEPS, rel)).href;
  try {
    ({ PMTiles } = await import(dep('node_modules/pmtiles/dist/esm/index.js')));
    ({ VectorTile } = await import(dep('node_modules/@mapbox/vector-tile/index.js')));
    Protobuf = (await import(dep('node_modules/pbf/index.js'))).default;
  } catch (e) { console.log(`  DEP LOAD FAILED: ${e}`); return false; }

  const url = `${TILES_BASE}buildings.pmtiles`;
  console.log(`  archive  ${url}`);
  const p = new PMTiles(url);
  let hdr;
  try { hdr = await p.getHeader(); }
  catch (e) { console.log(`  HEADER READ FAILED: ${e} — STAGE B NOT RUN (failure, not absence).`); return false; }
  console.log(`  header   minZoom=${hdr.minZoom} maxZoom=${hdr.maxZoom} tileCompression=${hdr.tileCompression} entries≈${hdr.tileEntriesCount ?? 'n/d'}`);

  // XYZ tile range over the bbox at TILE_Z (web-mercator).
  const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
  const lat2y = (lat, z) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);
  const x0 = lon2x(BBOX[0], TILE_Z), x1 = lon2x(BBOX[2], TILE_Z);
  const y0 = lat2y(BBOX[3], TILE_Z), y1 = lat2y(BBOX[1], TILE_Z);
  const tiles = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) tiles.push([x, y]);
  console.log(`  tiles    z${TILE_Z} x ${x0}..${x1} · y ${y0}..${y1} = ${tiles.length} tiles`);

  const feats = [];
  const seen = new Set();
  let okTiles = 0, emptyTiles = 0, failTiles = 0;
  const CONC = 12;
  let idx = 0;
  async function worker() {
    for (;;) {
      const i = idx++;
      if (i >= tiles.length) return;
      const [x, y] = tiles[i];
      let d;
      try { d = await p.getZxy(TILE_Z, x, y); }
      catch { failTiles++; continue; }
      if (!d || !d.data) { emptyTiles++; continue; }
      let buf = Buffer.from(d.data);
      if (buf[0] === 0x1f && buf[1] === 0x8b) { try { buf = gunzipSync(buf); } catch { failTiles++; continue; } }
      let tile;
      try { tile = new VectorTile(new Protobuf(new Uint8Array(buf))); }
      catch { failTiles++; continue; }
      const layer = tile.layers['buildings'];
      if (!layer) { emptyTiles++; continue; }
      okTiles++;
      for (let k = 0; k < layer.length; k++) {
        const f = layer.feature(k);
        // §BAKE-GEOMETRY-TYPES (L-513b): tile geometry type is UNTRUSTED — osmium emits
        // every building as BOTH a linestring and a polygon. Keep polygons only, exactly
        // as the shipping reader (contextTiles.ts) does, or every footprint double-counts.
        if (f.type !== 3) continue;
        const props = f.properties ?? {};
        if (!props['building'] && !props['building:part']) continue;
        const g = f.loadGeometry();
        let sx = 0, sy = 0, n = 0;
        for (const ring of g) for (const pt of ring) { sx += pt.x; sy += pt.y; n++; }
        if (!n) continue;
        const ex = layer.extent;
        const lon = ((x + sx / n / ex) / 2 ** TILE_Z) * 360 - 180;
        const yy = 180 - ((y + sy / n / ex) / 2 ** TILE_Z) * 360;
        const lat = (360 / Math.PI) * Math.atan(Math.exp((yy * Math.PI) / 180)) - 90;
        const oid = props['@id'] ?? props['id'] ?? props['osm_id'] ?? `${x}/${y}/${k}`;
        const key = `${oid}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const num = (v) => { const q = parseFloat(String(v)); return Number.isFinite(q) && q > 0 ? q : null; };
        feats.push({
          id: String(oid), lon: +lon.toFixed(7), lat: +lat.toFixed(7),
          height: num(props['height'] ?? props['building:height']),
          levels: num(props['building:levels'] ?? props['levels']),
          heightSrcTag: props['pryzm:height_src'] ?? null,
        });
      }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  console.log(`  read     ${okTiles} tiles ok · ${emptyTiles} empty/no-layer · ${failTiles} FAILED`);
  console.log(`  features ${feats.length} unique polygonal buildings`);
  const tagged = feats.filter((f) => f.height != null).length;
  const lv = feats.filter((f) => f.height == null && f.levels != null).length;
  const asm = feats.length - tagged - lv;
  console.log(`  provenance (production ladder): tagged ${tagged} (${pct(tagged, feats.length)}) · derived-levels ${lv} (${pct(lv, feats.length)}) · assumed ${asm} (${pct(asm, feats.length)})`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(OSM_FILE, feats.map((f) => JSON.stringify(f)).join('\n'));
  console.log(`  → ${OSM_FILE}`);
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGE C — match + score. Offline; rerunnable from the two JSONL files.
// ═══════════════════════════════════════════════════════════════════════════
function stageScore() {
  console.log('\n══ STAGE C — match + score ══');
  if (!existsSync(OVERTURE_FILE) || !existsSync(OSM_FILE)) {
    console.log(`  MISSING INPUT — overture:${existsSync(OVERTURE_FILE)} osm:${existsSync(OSM_FILE)}. Run stages A and B first.`);
    return null;
  }
  const ov = readFileSync(OVERTURE_FILE, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const os = readFileSync(OSM_FILE, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  console.log(`  loaded   overture n=${ov.length} · baked-osm n=${os.length}`);

  // §1 — provenance of every Overture height in the bbox. READ THIS BEFORE ANY SCORE.
  console.log('\n  §1 — WHERE OVERTURE\'S HEIGHTS COME FROM (the admissibility check)');
  const bySrc = new Map();
  for (const f of ov) if (f.height != null) bySrc.set(f.height_src, (bySrc.get(f.height_src) ?? 0) + 1);
  const ovWithH = [...bySrc.values()].reduce((a, b) => a + b, 0);
  console.log(`      Overture features in bbox: ${ov.length}; carrying a height: ${ovWithH} (${pct(ovWithH, ov.length)})`);
  for (const [k, v] of [...bySrc].sort((a, b) => b[1] - a[1])) console.log(`        ${String(k).padEnd(40)} ${String(v).padStart(7)}  ${pct(v, ovWithH)}`);

  // §2 — spatial match, greedy nearest within MATCH_TOL_M, one-to-one.
  const cLat = (BBOX[1] + BBOX[3]) / 2;
  const mLon = mPerDegLon(cLat);
  const cell = 0.0005; // ≈ 42 m — index cell
  const grid = new Map();
  ov.forEach((f, i) => {
    const k = `${Math.floor(f.lon / cell)}:${Math.floor(f.lat / cell)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });
  const usedOv = new Set();
  const pairs = [];
  let unmatched = 0;
  for (const o of os) {
    const gx = Math.floor(o.lon / cell), gy = Math.floor(o.lat / cell);
    let best = -1, bestD = Infinity;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const i of grid.get(`${gx + dx}:${gy + dy}`) ?? []) {
        if (usedOv.has(i)) continue;
        const f = ov[i];
        const d = Math.hypot((f.lon - o.lon) * mLon, (f.lat - o.lat) * M_PER_DEG_LAT);
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    if (best >= 0 && bestD <= MATCH_TOL_M) { usedOv.add(best); pairs.push({ osm: o, ovt: ov[best], d: bestD }); }
    else unmatched++;
  }
  console.log(`\n  §2 — SPATIAL MATCH (greedy nearest centroid, one-to-one, tol ${MATCH_TOL_M} m)`);
  console.log(`      matched ${pairs.length} / ${os.length} baked buildings (${pct(pairs.length, os.length)}); unmatched ${unmatched}`);
  console.log(`      match distance: ${JSON.stringify(dist(pairs.map((p) => p.d)))}`);

  // §3 — THE HEAD-TO-HEAD. Ground truth = a surveyed OSM `height`.
  // Admissible only on buildings that ALSO have `building:levels` (so estimator 1 exists)
  // AND a matched Overture height (so estimator 2 exists). Same n, same buildings, fair.
  const gt = pairs.filter((p) => p.osm.height != null);
  const head = gt.filter((p) => p.osm.levels != null && p.ovt.height != null);
  console.log('\n  §3 — ⭐ HEAD-TO-HEAD against the surveyed ground truth');
  console.log(`      matched buildings carrying a SURVEYED height (ground truth) : ${gt.length}`);
  console.log(`      of those, also having building:levels AND an Overture height: ${head.length}  ⟵ THE SCORED SET (n)`);
  if (head.length === 0) { console.log('      n = 0 — NO VERDICT POSSIBLE. Reported as such, not as a draw.'); return { error: 'scored set empty' }; }

  const e1 = head.map((p) => p.osm.levels * METRES_PER_LEVEL - p.osm.height); // ours, signed
  const e2 = head.map((p) => p.ovt.height - p.osm.height);                    // Overture/ML, signed
  const a1 = e1.map(Math.abs), a2 = e2.map(Math.abs);

  // §3b — THE ADMISSIBILITY CHECK. If Overture height ≡ the surveyed height, the score
  // is the ground truth grading itself.
  const exact = head.filter((p) => Math.abs(p.ovt.height - p.osm.height) < 1e-6).length;
  const near = head.filter((p) => Math.abs(p.ovt.height - p.osm.height) < 0.01).length;
  const mlSrc = head.filter((p) => String(p.ovt.height_src).includes('Microsoft ML')).length;
  const osmSrc = head.filter((p) => String(p.ovt.height_src).includes('OpenStreetMap')).length;
  console.log('\n  §3b — ADMISSIBILITY (is estimator 2 independent of the ground truth?)');
  console.log(`      Overture height EXACTLY equals the surveyed height : ${exact} / ${head.length} (${pct(exact, head.length)})`);
  console.log(`      within 0.01 m                                      : ${near} / ${head.length} (${pct(near, head.length)})`);
  console.log(`      height attributed to Microsoft ML Buildings        : ${mlSrc} (${pct(mlSrc, head.length)})`);
  console.log(`      height attributed to OpenStreetMap                 : ${osmSrc} (${pct(osmSrc, head.length)})`);
  console.log('      ⇒ a high exact-equality rate makes a good estimator-2 score TAUTOLOGICAL, not a win.');

  const within = (arr, t) => arr.filter((x) => x <= t).length;
  console.log(`\n  §4 — ERROR DISTRIBUTIONS (metres), n=${head.length} — the SAME buildings for both`);
  console.log('      ESTIMATOR 1 — ours: building:levels × 3.2 m');
  console.log(`        signed  ${JSON.stringify(dist(e1))}`);
  console.log(`        |error| ${JSON.stringify(dist(a1))}`);
  console.log(`        within ±1 m ${within(a1, 1)} (${pct(within(a1, 1), a1.length)}) · ±2 m ${within(a1, 2)} (${pct(within(a1, 2), a1.length)}) · ±3 m ${within(a1, 3)} (${pct(within(a1, 3), a1.length)})`);
  console.log('      ESTIMATOR 2 — Overture / MS-ML height');
  console.log(`        signed  ${JSON.stringify(dist(e2))}`);
  console.log(`        |error| ${JSON.stringify(dist(a2))}`);
  console.log(`        within ±1 m ${within(a2, 1)} (${pct(within(a2, 1), a2.length)}) · ±2 m ${within(a2, 2)} (${pct(within(a2, 2), a2.length)}) · ±3 m ${within(a2, 3)} (${pct(within(a2, 3), a2.length)})`);

  // Per-building paired comparison — which estimator is closer, building by building.
  let win1 = 0, win2 = 0, tie = 0;
  for (let i = 0; i < a1.length; i++) { if (a1[i] < a2[i] - 1e-9) win1++; else if (a2[i] < a1[i] - 1e-9) win2++; else tie++; }
  console.log(`\n      PAIRED, per building: ours closer ${win1} (${pct(win1, a1.length)}) · Overture closer ${win2} (${pct(win2, a1.length)}) · tie ${tie}`);

  // §5 — THE COVERAGE QUESTION. Path A's real value is heights where we have NONE.
  const noHeightNoLevels = pairs.filter((p) => p.osm.height == null && p.osm.levels == null);
  const rescued = noHeightNoLevels.filter((p) => p.ovt.height != null);
  const rescuedMl = rescued.filter((p) => String(p.ovt.height_src).includes('Microsoft ML')).length;
  console.log('\n  §5 — INCREMENTAL COVERAGE (the other reason to take path A)');
  console.log(`      matched buildings today rendering the FABRICATED 9 m default: ${noHeightNoLevels.length}`);
  console.log(`      of those, Overture supplies a height                        : ${rescued.length} (${pct(rescued.length, noHeightNoLevels.length)})`);
  console.log(`      of those, attributed to Microsoft ML                        : ${rescuedMl} (${pct(rescuedMl, rescued.length)})`);

  // §6 — ⚠ THE DISJOINTNESS TEST. §3b showed estimator 2 is not independent on the
  // scored set. The follow-on question is whether the ACTUAL path-A payload — the
  // Microsoft-ML heights — overlaps the ground truth AT ALL. If the overlap is zero,
  // path A is not "worse" or "better": it is UNTESTABLE against this ground truth,
  // and any verdict claiming otherwise is measuring the wrong population.
  const mlPairs = pairs.filter((p) => String(p.ovt.height_src).includes('Microsoft ML') && p.ovt.height != null);
  const mlWithGt = mlPairs.filter((p) => p.osm.height != null);
  console.log('\n  §6 — ⚠ DISJOINTNESS: does the ML population overlap the ground truth at all?');
  console.log(`      matched buildings with an ML-attributed Overture height : ${mlPairs.length}`);
  console.log(`      of those, ALSO carrying a surveyed OSM height           : ${mlWithGt.length} (${pct(mlWithGt.length, mlPairs.length)})`);
  let mlScored = null;
  if (mlWithGt.length > 0) {
    const em = mlWithGt.map((p) => p.ovt.height - p.osm.height);
    mlScored = { signed: dist(em), abs: dist(em.map(Math.abs)) };
    console.log(`      ML vs surveyed, signed  ${JSON.stringify(mlScored.signed)}`);
    console.log(`      ML vs surveyed, |error| ${JSON.stringify(mlScored.abs)}`);
  } else {
    console.log('      ⇒ ZERO OVERLAP. The ML heights CANNOT be scored against our surveyed ground truth.');
    console.log('        This is a "the question is unanswerable with this data" result, NOT a draw.');
  }

  // §7 — INDIRECT DIAGNOSTIC (no ground truth needed, and it cuts both ways).
  // For buildings carrying a REAL floor count AND an ML height, the implied storey
  // height ML_height / levels is a physical quantity with a known plausible band
  // (~2.6–4.0 m for European residential). It grades the ML heights without truth,
  // and it simultaneously grades OUR 3.2 m constant against an independent instrument.
  const both = pairs.filter((p) => p.osm.levels != null && p.ovt.height != null
    && String(p.ovt.height_src).includes('Microsoft ML'));
  console.log('\n  §7 — INDIRECT DIAGNOSTIC: implied storey height = ML height ÷ real floor count');
  console.log(`      n = ${both.length} buildings with a real building:levels AND an ML height`);
  let implied = null;
  if (both.length > 0) {
    const imp = both.map((p) => p.ovt.height / p.osm.levels);
    implied = dist(imp);
    console.log(`      implied storey height (m): ${JSON.stringify(implied)}`);
    const plaus = imp.filter((x) => x >= 2.6 && x <= 4.0).length;
    const below = imp.filter((x) => x < 2.6).length;
    const above = imp.filter((x) => x > 4.0).length;
    const impossible = imp.filter((x) => x < 2.5).length; // below any habitable storey, slab included
    console.log(`      inside a plausible 2.6–4.0 m band: ${plaus} (${pct(plaus, imp.length)})`);
    console.log(`      BELOW 2.6 m/storey: ${below} (${pct(below, imp.length)})   ABOVE 4.0 m/storey: ${above} (${pct(above, imp.length)})`);
    console.log(`      below 2.5 m/storey — physically impossible for a habitable floor: ${impossible} (${pct(impossible, imp.length)})`);
    console.log(`      OUR constant is ${METRES_PER_LEVEL} m — median implied is ${implied.median} m (Δ ${(implied.median - METRES_PER_LEVEL).toFixed(2)} m)`);
    const dm = both.map((p) => Math.abs(p.ovt.height - p.osm.levels * METRES_PER_LEVEL));
    console.log(`      |ML − levels×3.2| on this set: ${JSON.stringify(dist(dm))}`);
    console.log('      ⇒ this is AGREEMENT, not accuracy. Two estimates agreeing proves neither.');
  }

  const verdict = {
    disjointness: { mlMatched: mlPairs.length, mlWithGroundTruth: mlWithGt.length, mlScored },
    impliedStoreyHeight: implied,
    n: head.length,
    ours: { signed: dist(e1), abs: dist(a1) },
    overture: { signed: dist(e2), abs: dist(a2) },
    paired: { oursCloser: win1, overtureCloser: win2, tie },
    admissibility: { exactEqual: exact, exactEqualPct: +(100 * exact / head.length).toFixed(1), mlAttributed: mlSrc, osmAttributed: osmSrc },
    coverage: { fabricated9m: noHeightNoLevels.length, overtureSupplies: rescued.length, ofWhichMl: rescuedMl },
    groundTruthMatched: gt.length,
    matchRate: +(100 * pairs.length / os.length).toFixed(1),
  };
  console.log('\n══════════════════════════ VERDICT ══════════════════════════');
  console.log(`  scored set n = ${head.length}`);
  console.log(`  median |error| — ours ${dist(a1).median} m  vs  Overture/ML ${dist(a2).median} m`);
  console.log(`  p95    |error| — ours ${dist(a1).p95} m  vs  Overture/ML ${dist(a2).p95} m   ⟵ the TAIL, which is what envelope work cares about`);
  console.log(`  RMSE           — ours ${dist(a1).rmse} m  vs  Overture/ML ${dist(a2).rmse} m`);
  const betterMedian = dist(a2).median < dist(a1).median;
  const betterTail = dist(a2).p95 < dist(a1).p95;
  console.log(`  ⇒ Overture beats ours on the MEDIAN? ${betterMedian ? 'YES' : 'NO'} · on the p95 TAIL? ${betterTail ? 'YES' : 'NO'}`);
  console.log(`  ⇒ admissible? exact-equality with ground truth = ${verdict.admissibility.exactEqualPct}% (high ⇒ tautological)`);
  writeFileSync(resolve(outDir, 'v3-verdict.json'), JSON.stringify(verdict, null, 2));
  console.log(`  → ${resolve(outDir, 'v3-verdict.json')}`);
  return verdict;
}

(async () => {
  console.log('PROBE V3-gate — do ML heights beat `levels × 3.2 m` against the 0.9% surveyed ground truth?');
  if (runAll || want('--overture')) stageOverture();
  if (runAll || want('--osm')) await stageOsm();
  if (runAll || want('--score')) stageScore();
})().catch((e) => { console.error('PROBE V3 FAILED:', e); process.exit(1); });
