#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// PRYZM context tile bake — L-513a (see docs/04-reference/CONTEXT-3D-PERFORMANCE-ARCHITECTURE.md)
//
// WHY: the 3D-Site context (buildings/roads/water/parks) is fetched LIVE from public Overpass on
// every site visit, which is 406/45s/429/502-flaky (proven — L-513/L-523). A live public-Overpass
// hot-path CANNOT be made fast. This tool BAKES the context ONCE into static PMTiles that the client
// reads via HTTP range requests (<50 ms, cacheable, no rate limit). Deterministic + re-runnable.
//
// SOURCE: Geofabrik's Cataluña extract (the whole region OSM in ONE static ~266 MB .osm.pbf,
// daily-refreshed) — live-verified. NOT a live query.
//
// PIPELINE (per docs): download pbf → osmium clip to the Barcelona bbox → per layer:
//   osmium tags-filter → osmium export (GeoJSONSeq) → tippecanoe → <layer>.pmtiles → object storage.
//
// TOOLCHAIN: needs `osmium` + `tippecanoe`. This box has neither, so the tool AUTO-DETECTS: if the
// local binaries exist it uses them; otherwise it shells out to the bundled Docker image (see
// ./Dockerfile). The heavy run therefore happens anywhere Docker OR the tools exist (dev / CI / Fly).
//
// USAGE:
//   node bake.mjs --check      # print tool availability + the plan, then exit (safe; runs here)
//   node bake.mjs --dry-run    # print every command that WOULD run, execute nothing
//   node bake.mjs              # run the full bake (needs osmium+tippecanoe locally, or Docker)
//   node bake.mjs --layer buildings   # bake a single layer
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, 'out');

// ── Config ──────────────────────────────────────────────────────────────────
const REGION = {
  name: 'cataluna',
  // Live-verified 2026-07-21: 200, ~266 MB, daily-refreshed (docs §8).
  pbfUrl: 'https://download.geofabrik.de/europe/spain/cataluna-latest.osm.pbf',
  pbf: resolve(OUT, 'cataluna-latest.osm.pbf'),
  // Barcelona city clip (generous) — shrinks 266 MB → the city before per-layer filtering.
  // minlon,minlat,maxlon,maxlat (osmium -b order).
  bbox: '2.05,41.32,2.24,41.47',
  clipped: resolve(OUT, 'barcelona.osm.pbf'),
};

// Per-layer: the osmium tags-filter expression + tippecanoe zoom range. Attributes (building
// height / building:levels, highway class, etc.) ride along in the GeoJSON — osmium export keeps
// all tags — so the client can style + badge them (provenance-in-tile, C23).
//
// §BAKE-GEOMETRY-TYPES (L-513b, 2026-07-21) — ⚠ `geom` IS NOT OPTIONAL. A live probe of the FIRST
// bake found, in one Gòtic z16 tile:
//     LineString 362 features (all building=*) · Polygon 362 (IDENTICAL tags) · Point 678
// `osmium export` defaults to `--geometry-types=point,linestring,polygon`, so it emitted EVERY
// closed building way TWICE — once as the way (LineString) and once as the assembled area
// (Polygon) — and additionally exported the tagged `entrance=*` NODES that `tags-filter` drags in
// as referenced objects. That triples the tile bytes, double-counts every footprint for anything
// that measures built density, and would extrude a cloud of doorways. Pinning the geometry type
// per layer is the fix at source. (The client reader stays defensive about this anyway — tiles are
// a separately-deployed artefact and can be older than the code reading them.)
//
// §BAKE-UNIQUE-ID — `--add-unique-id=type_id` carries the real OSM id into the tile, so the client
// can stop minting synthetic ids and can dedupe a footprint across tile boundaries properly.
const LAYERS = [
  // §BAKE-BUILDING-RELATIONS (L-580, 2026-07-22) — ⚠ `w/building` (WAYS ONLY) SILENTLY DROPPED
  // EVERY MULTIPOLYGON-RELATION BUILDING. Measured against OSM for the Gòtic far extent:
  //     ways 3,872  ·  relations 1,973   (total 5,845)
  // i.e. ~34% of buildings in Barcelona's dense historic fabric are mapped as RELATIONS — the
  // courtyard blocks with interior voids, which is precisely the shape that needs a relation. The
  // baked tiles held 79% of ground truth there against 96–98% in Eixample/Vila Olímpica, and this
  // is the whole difference. `wr/` takes ways AND relations; `tags-filter` pulls in their member
  // ways automatically, and `osmium export` assembles them into MultiPolygons that the client
  // reader already handles (one feature per outer ring).
  //
  // ⚠ NOT `nwr/` — that would additionally admit NODES tagged `building`, which carry no footprint
  // and would be discarded by `--geometry-types polygon` anyway, after costing a pass over them.
  { id: 'buildings', filter: ['wr/building'],                                    geom: 'polygon',            minz: 12, maxz: 16, extra: ['--drop-densest-as-needed'] },
  { id: 'roads',     filter: ['w/highway'],                                       geom: 'linestring',         minz: 10, maxz: 16, extra: ['--drop-densest-as-needed'] },
  // Water is genuinely MIXED — lakes/basins are areas, streams/rivers are ways. Both are wanted,
  // and `contextWater.ts` already splits them, so this is the one layer that keeps two types.
  { id: 'water',     filter: ['nwr/natural=water', 'nwr/waterway', 'w/water'],   geom: 'polygon,linestring', minz: 8,  maxz: 16, extra: [] },
  { id: 'parks',     filter: ['nwr/leisure=park', 'nwr/landuse=grass,forest,recreation_ground', 'nwr/natural=wood'], geom: 'polygon', minz: 10, maxz: 16, extra: [] },
];

// ── args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const DRY = args.includes('--dry-run');
const ONE = args.includes('--layer') ? args[args.indexOf('--layer') + 1] : null;
const layers = ONE ? LAYERS.filter((l) => l.id === ONE) : LAYERS;

// ── tool detection ─────────────────────────────────────────────────────────
function has(bin) {
  const probe = process.platform === 'win32' ? 'where' : 'command';
  const cmd = process.platform === 'win32' ? [bin] : ['-v', bin];
  try {
    const r = spawnSync(process.platform === 'win32' ? 'where' : 'sh',
      process.platform === 'win32' ? [bin] : ['-c', `command -v ${bin}`],
      { stdio: 'ignore' });
    return r.status === 0;
  } catch { return false; }
}
const LOCAL = { osmium: has('osmium'), tippecanoe: has('tippecanoe') };
const DOCKER = has('docker');
const USE_LOCAL = LOCAL.osmium && LOCAL.tippecanoe;
const IMAGE = 'pryzm-context-bake';

// Wrap a toolchain command so it runs locally if the binaries exist, else in the Docker image
// with the out/ dir mounted at /work.
function tool(bin, argv) {
  if (USE_LOCAL) return { cmd: bin, argv };
  // Docker: mount OUT as /work; paths inside must be /work-relative.
  const rel = (p) => (p.startsWith(OUT) ? '/work' + p.slice(OUT.length).replace(/\\/g, '/') : p);
  return { cmd: 'docker', argv: ['run', '--rm', '-v', `${OUT}:/work`, IMAGE, bin, ...argv.map(rel)] };
}

function run(step, { cmd, argv }) {
  const line = `${cmd} ${argv.join(' ')}`;
  console.log(`\n▶ ${step}\n  ${line}`);
  if (DRY) return;
  execFileSync(cmd, argv, { stdio: 'inherit' });
}

// ── download (Node, no toolchain needed) ─────────────────────────────────────
async function download(url, dest) {
  if (existsSync(dest)) {
    console.log(`\n▶ download (skip — exists ${(statSync(dest).size / 1e6).toFixed(0)} MB): ${dest}`);
    return;
  }
  console.log(`\n▶ download ${url}\n  → ${dest}`);
  if (DRY) return;
  const { createWriteStream } = await import('node:fs');
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  const { Readable } = await import('node:stream');
  const { pipeline } = await import('node:stream/promises');
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  console.log(`  done — ${(statSync(dest).size / 1e6).toFixed(0)} MB`);
}

// ── plan / check ─────────────────────────────────────────────────────────────
function printPlan() {
  console.log('PRYZM context tile bake — L-513a');
  console.log(`  region      : ${REGION.name} (${REGION.pbfUrl})`);
  console.log(`  clip bbox   : ${REGION.bbox}`);
  console.log(`  out dir     : ${OUT}`);
  console.log(`  layers      : ${layers.map((l) => l.id).join(', ')}`);
  console.log('  toolchain   :');
  console.log(`    osmium     ${LOCAL.osmium ? 'LOCAL' : 'missing'}`);
  console.log(`    tippecanoe ${LOCAL.tippecanoe ? 'LOCAL' : 'missing'}`);
  console.log(`    docker     ${DOCKER ? 'available' : 'missing'}`);
  const mode = USE_LOCAL ? 'LOCAL binaries' : DOCKER ? `Docker image "${IMAGE}"` : 'NONE';
  console.log(`  → run mode  : ${mode}`);
  if (!USE_LOCAL && !DOCKER) {
    console.log('\n  ⚠ Neither the local tools nor Docker are available here. Build the image first:');
    console.log(`      docker build -t ${IMAGE} ${HERE}`);
    console.log('    or install osmium-tool + tippecanoe, then re-run. (--check / --dry-run still work.)');
  }
}

// ── main ───────────────────────────────────────────────────────────────────
async function main() {
  mkdirSync(OUT, { recursive: true });
  printPlan();
  if (CHECK) return;
  if (!USE_LOCAL && !DOCKER && !DRY) {
    console.error('\n✖ no toolchain — see the note above. Aborting (nothing to run).');
    process.exit(2);
  }

  await download(REGION.pbfUrl, REGION.pbf);

  // Clip the region to the Barcelona bbox (shrinks the per-layer work massively).
  run('clip to Barcelona bbox',
    tool('osmium', ['extract', '-b', REGION.bbox, REGION.pbf, '-o', REGION.clipped, '--overwrite']));

  for (const l of layers) {
    const filtered = resolve(OUT, `${l.id}.osm.pbf`);
    const geo = resolve(OUT, `${l.id}.geojsonseq`);
    const pmt = resolve(OUT, `${l.id}.pmtiles`);
    run(`filter ${l.id}`,
      tool('osmium', ['tags-filter', REGION.clipped, ...l.filter, '-o', filtered, '--overwrite']));
    run(`export ${l.id} → GeoJSONSeq (${l.geom})`,
      tool('osmium', ['export', filtered, '-f', 'geojsonseq',
        // §BAKE-GEOMETRY-TYPES + §BAKE-UNIQUE-ID — see the LAYERS note above.
        '--geometry-types', l.geom, '--add-unique-id', 'type_id',
        '-o', geo, '--overwrite']));
    run(`tile ${l.id} → PMTiles`,
      tool('tippecanoe', ['-o', pmt, '-l', l.id, '-Z', String(l.minz), '-z', String(l.maxz),
        '-P', '--force', ...l.extra, geo]));
    if (!DRY && existsSync(pmt)) {
      console.log(`  ✔ ${l.id}.pmtiles — ${(statSync(pmt).size / 1e6).toFixed(1)} MB`);
    }
  }

  console.log('\n✅ Bake complete. Upload the *.pmtiles in out/ to object storage (see README §Upload),');
  console.log('   then point the client tile reader at them (L-513b/c). NOTE: rerun on Geofabrik\'s');
  console.log('   daily refresh to keep context current.');
}

main().catch((e) => { console.error('\n✖ bake failed:', e.message); process.exit(1); });
